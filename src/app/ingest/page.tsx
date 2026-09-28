"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { AppShell } from "@/components/AppShell";
import { InsightPanel } from "@/components/InsightPanel";
import { runParse, runValidate } from "@/lib/workers";
import { useDatasetStore } from "@/stores/datasetStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { computeDatasetInsights, type DatasetInsights } from "@/lib/insights";
import { listDatasets, loadHeaderOverrides, saveHeaderOverrides } from "@/lib/storage/idb";
import type { DatasetSummary } from "@/contracts/dataset";

type Phase = "idle" | "reading" | "parsing" | "validating" | "done" | "error";

export default function IngestPage() {
  const router = useRouter();
  const { createDataset, setValidation, removeDataset } = useDatasetStore();
  const setActive = useWorkflowStore((s) => s.setActiveDatasetId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<DatasetInsights | null>(null);
  const [previous, setPrevious] = useState<DatasetSummary | null>(null);
  const [showAllSparse, setShowAllSparse] = useState(false);
  const [raw, setRaw] = useState<{ buffer: ArrayBuffer; fileName: string; sizeBytes: number } | null>(
    null,
  );
  const [orientation, setOrientation] = useState<"auto" | "upright" | "flipped">("auto");
  const [transposed, setTransposed] = useState(false);
  const [headerOverrides, setHeaderOverrides] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [unmapped, setUnmapped] = useState<string[]>([]);
  /** The import this screen made last, replaced when the file is read again. */
  const sessionDatasetId = useRef<string | null>(null);
  const [summary, setSummary] = useState<{
    rows: number;
    errors: number;
    warnings: number;
    columnsRecognized: number;
    missingCritical: string[];
    collapsedColumns: { label: string; keptCode: string; count: number }[];
    headerRows: number;
    transposed: boolean;
    presentColumns: string[];
  } | null>(null);

  const ingestBuffer = useCallback(
    async (
      buffer: ArrayBuffer,
      name: string,
      sizeBytes: number,
      next: "auto" | "upright" | "flipped",
      overrides: Record<string, string> = {},
    ) => {
      setPhase("reading");
      setError(null);
      setSummary(null);
      setInsights(null);
      setPrevious(null);
      setShowAllSparse(false);
      setTransposed(false);
      setOrientation(next);
      setHeaderOverrides(overrides);
      setUnmapped([]);
      setDrafts({});
      try {
        const parsed = await runParse(
          {
            buffer: buffer.slice(0),
            fileName: name,
            sizeBytes,
            importedAt: new Date().toISOString(),
            orientation: next,
            headerOverrides: overrides,
          },
          (p) => setProgress(p === "done" ? "done" : "Parsing workbook…"),
        );
        setPhase("validating");
        setProgress("Checking for contradictions…");
        const dataset = await createDataset(parsed, "vhsnd");
        const superseded = sessionDatasetId.current;
        sessionDatasetId.current = dataset.id;
        const result = await runValidate({
          rows: dataset.rows,
          schemaVersion: dataset.schemaVersion,
          refDate: null,
          presentColumns: parsed.presentColumns,
        });
        await setValidation({
          violations: result.violations,
          counts: result.counts,
          byRow: result.byRow,
          validatedAt: new Date().toISOString(),
        });
        const known = new Set(VHSND_COLUMNS.map((c) => c.code));
        const columnsRecognized = parsed.presentColumns.filter((c) => known.has(c)).length;
        const missingCritical = ["SubmissionDate", "B8"].filter(
          (c) => !parsed.presentColumns.includes(c),
        );
        setSummary({
          rows: dataset.totalRows,
          errors: result.counts.error,
          warnings: result.counts.warning,
          columnsRecognized,
          missingCritical,
          collapsedColumns: parsed.collapsedColumns,
          headerRows: parsed.meta.headerRow,
          transposed: parsed.transposed === true,
          presentColumns: parsed.presentColumns,
        });
        setTransposed(parsed.transposed === true);
        setUnmapped(parsed.unmappedHeaders ?? []);
        setInsights(computeDatasetInsights(dataset));
        setActive(dataset.id);
        const stored = await listDatasets();
        setPrevious(
          stored.find(
            (d) =>
              d.id !== dataset.id &&
              d.id !== superseded &&
              d.fileName === parsed.meta.fileName &&
              d.totalRows === dataset.totalRows &&
              d.schemaVersion === dataset.schemaVersion,
          ) ?? null,
        );
        // A re-read replaces what this screen imported, so the same file does
        // not pile up as several half-correct datasets.
        if (superseded) await removeDataset(superseded);
        setPhase("done");
      } catch (err: unknown) {
        setPhase("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [createDataset, setValidation, setActive, removeDataset],
  );

  const onDrop = useCallback(
    (files: File[]) => {
      const file = files[0];
      if (!file) return;
      const ext = file.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "ods", "csv"].includes(ext ?? "")) {
        setPhase("error");
        setError(`Unsupported file type ".${ext}". Expected .xlsx, .xls, .ods or .csv.`);
        return;
      }
      setFileName(file.name);
      setPhase("reading");
      setError(null);

      file
        .arrayBuffer()
        .then(async (buffer) => {
          setRaw({ buffer, fileName: file.name, sizeBytes: file.size });
          const saved = await loadHeaderOverrides(file.name);
          return ingestBuffer(buffer, file.name, file.size, "auto", saved);
        })
        .catch((err: unknown) => {
          setPhase("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [ingestBuffer],
  );

  const rereadOtherWay = useCallback(() => {
    if (!raw) return;
    void ingestBuffer(
      raw.buffer,
      raw.fileName,
      raw.sizeBytes,
      transposed ? "upright" : "flipped",
      headerOverrides,
    );
  }, [raw, transposed, headerOverrides, ingestBuffer]);

  const applyHeaderMapping = useCallback(async () => {
    if (!raw) return;
    const chosen = unmapped.filter((title) => drafts[title]);
    if (chosen.length === 0) return;
    const next = { ...headerOverrides };
    for (const title of chosen) next[title] = drafts[title];
    await saveHeaderOverrides(raw.fileName, next);
    await ingestBuffer(raw.buffer, raw.fileName, raw.sizeBytes, orientation, next);
  }, [raw, unmapped, drafts, headerOverrides, orientation, ingestBuffer]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx", ".xls"],
      "application/vnd.oasis.opendocument.spreadsheet": [".ods"],
      "text/csv": [".csv"],
    },
  });

  const busy = phase === "reading" || phase === "parsing" || phase === "validating";

  return (
    <AppShell>
      <section className="section">
        <h2>Ingest dataset</h2>
        <p className="muted">
          This is the file exported from the ODK/Excel survey form for VHSND sessions. Pick the first
          sheet if your workbook has multiple. Everything is read, parsed, and stored on this machine only.
        </p>
      </section>

      <section className="card">
        <div {...getRootProps()} className={`dropzone${isDragActive ? " active" : ""}`}>
          <input {...getInputProps()} />
          <h3 style={{ marginTop: 0 }}>Drop the survey export here</h3>
          <p className="muted small">
            {fileName ? `Selected: ${fileName}` : "or click to browse for a .xlsx / .xls / .ods / .csv file"}
          </p>
          {busy && (
            <div className="row" style={{ justifyContent: "center", marginTop: 12 }}>
              <div className="spinner" aria-hidden />
              <span className="small">{phase === "reading" ? "Reading file…" : progress}</span>
            </div>
          )}
        </div>
        {error && (
          <div className="card" style={{ borderColor: "var(--error)", background: "var(--error-soft)" }}>
            <h4 style={{ color: "var(--error)", margin: 0 }}>Could not import this file</h4>
            <p className="small" style={{ marginBottom: 0 }}>{error}</p>
          </div>
        )}
        {phase === "done" && summary && (
          <div className="card" style={{ borderColor: "var(--ok)", background: "var(--ok-soft)" }}>
            <h4 style={{ color: "var(--ok)", margin: 0 }}>Imported successfully</h4>
            <p className="small" style={{ marginBottom: 0 }}>
              {summary.rows.toLocaleString("en-IN")} rows · {summary.errors.toLocaleString("en-IN")} errors ·{" "}
              {summary.warnings.toLocaleString("en-IN")} warnings ·{" "}
              {summary.columnsRecognized} of {VHSND_COLUMNS.length} columns recognized.
              {Object.keys(headerOverrides).length > 0 && (
                <span> {Object.keys(headerOverrides).length} matched by hand.</span>
              )}
              {summary.missingCritical.length > 0 && (
                <span style={{ color: "var(--warning)" }}>
                  {" "}Missing critical column(s): {summary.missingCritical.join(", ")}.
                </span>
              )}
            </p>
            <button
              className="btn btn-accent btn-sm"
              style={{ marginTop: 10 }}
              onClick={() => router.push("/review")}
            >
              Continue to Review
            </button>
          </div>
        )}

        {phase === "done" && summary && (summary.transposed || orientation !== "auto") && (
          <div className="card" style={{ borderColor: "var(--info)", background: "var(--info-soft)" }}>
            <h4 style={{ color: "var(--info)", margin: 0 }}>
              {summary.transposed ? "This export was sideways" : "Read exactly as it is"}
            </h4>
            <p className="small" style={{ marginBottom: 0 }}>
              {summary.transposed
                ? "Its fields run down the first column and every submission is a column of its own, so rows and columns were swapped while reading. That is why the columns and comparisons appear now. Nothing was dropped."
                : "Rows and columns were not swapped, as in the file. If most columns are reported missing, the export may be transposed — swapping them reads it the other way up."}
            </p>
            <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={rereadOtherWay}>
              {summary.transposed
                ? "Read it as it is, without swapping"
                : "Swap rows and columns, then read again"}
            </button>
          </div>
        )}

        {summary && previous && (
          <div className="card" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}>
            <h4 style={{ color: "var(--warning)", margin: 0 }}>{previous.fileName} was imported before</h4>
            <p className="small" style={{ marginBottom: 0 }}>
              {previous.totalRows.toLocaleString("en-IN")} rows, imported{" "}
              {new Date(previous.importedAt).toLocaleString("en-IN")}. Decisions are saved per
              import, so anything you decided on that copy does not follow this new one. Open the
              earlier import to keep that work, or stay here and decide again.
            </p>
            <div className="row" style={{ gap: 8, marginTop: 10 }}>
              <button
                className="btn btn-accent btn-sm"
                onClick={() => {
                  setActive(previous.id);
                  router.push("/review");
                }}
              >
                Open the previous import
              </button>
              <button className="btn btn-sm" onClick={() => setPrevious(null)}>
                Keep this new one
              </button>
            </div>
          </div>
        )}

        {summary && summary.collapsedColumns.length > 0 && (
          <div className="card" style={{ borderColor: "var(--warning)", background: "var(--warning-soft)" }}>
            <h4 style={{ color: "var(--warning)", margin: 0 }}>
              {summary.collapsedColumns.reduce((a, c) => a + c.count - 1, 0)} column(s) could not be
              told apart
            </h4>
            <p className="small" style={{ marginBottom: 0 }}>
              {summary.headerRows > 1
                ? "This file already carries the form's second row of column codes, but these titles share one code in both rows, so the repeats cannot be matched to separate fields. Only the first column of each was read."
                : "This file has a single header row, so repeated column titles cannot be matched to separate fields. Only the first column of each title was read. Re-export from the form with its second row of column codes to keep every column."}
            </p>
            <ul className="small muted" style={{ margin: "6px 0 0" }}>
              {summary.collapsedColumns.map((c) => (
                <li key={`${c.label}-${c.keptCode}`}>
                  &ldquo;{c.label}&rdquo; — {c.count} columns, all read as{" "}
                  <span className="mono">{c.keptCode}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {phase === "done" && unmapped.length > 0 && summary && (
          <div className="card" style={{ borderColor: "var(--info)", background: "var(--info-soft)" }}>
            <h4 style={{ color: "var(--info)", margin: 0 }}>
              {unmapped.length} column title{unmapped.length === 1 ? "" : "s"} could not be matched
            </h4>
            <p className="small" style={{ marginBottom: 10 }}>
              These titles are not part of the VHSND form, so their values are held under the title
              itself and no field, chart or comparison can read them. Point each one at the field it
              stands for, then read the file again. The match is saved with this export, so the next
              import of the same file comes in already mapped.
            </p>
            <div style={{ display: "grid", gap: 8 }}>
              {unmapped.map((title) => (
                <div key={title} className="row" style={{ gap: 10, alignItems: "center" }}>
                  <span
                    className="small"
                    title={title}
                    style={{
                      flex: "1 1 240px",
                      minWidth: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {title}
                  </span>
                  <select
                    value={drafts[title] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [title]: e.target.value }))}
                    style={{ flex: "1 1 320px", maxWidth: 420 }}
                  >
                    <option value="">Leave it out</option>
                    {VHSND_COLUMNS.map((c) => {
                      const used = summary.presentColumns.includes(c.code);
                      return (
                        <option key={c.code} value={c.code} disabled={used}>
                          {c.code} — {c.label}
                          {used ? " (already in this file)" : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              ))}
            </div>
            <button
              className="btn btn-accent btn-sm"
              style={{ marginTop: 12 }}
              disabled={busy || !unmapped.some((t) => drafts[t])}
              onClick={() => void applyHeaderMapping()}
            >
              Match these and read again
            </button>
          </div>
        )}
      </section>

      {phase === "done" && insights && (
        <InsightPanel
          title="Data insights"
          insights={[
            { label: "Rows imported", value: insights.totalRows },
            { label: "Rows skipped (empty)", value: insights.skippedRows },
            { label: "Columns in this file", value: insights.columnsWithData },
            {
              label: "Not in this file",
              value: insights.columnsMissing,
              tone: insights.columnsMissing > 0 ? "neutral" : "ok",
            },
            {
              label: "Present but empty",
              value: insights.columnsEmpty,
              tone: insights.columnsEmpty > 0 ? "warning" : "ok",
            },
            {
              label: "Sparse (<50%)",
              value: insights.sparseColumns.length,
              tone: insights.sparseColumns.length > 0 ? "warning" : "ok",
            },
          ]}
        >
          <p className="small muted" style={{ margin: "0 0 10px" }}>
            Your export covers <strong>{insights.columnsPresent}</strong> of the{" "}
            <strong>{insights.columnsExpected}</strong> schema fields. The other{" "}
            <strong>{insights.columnsMissing}</strong> fields aren&apos;t in this file — that&apos;s normal
            for a partial export, not lost data. Nothing was dropped.
          </p>
          <h4 style={{ margin: "0 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
            Top columns by fill rate
          </h4>
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Label</th>
                <th className="text-right">Filled</th>
                <th className="text-right">Unique</th>
                <th className="text-right">Fill rate</th>
              </tr>
            </thead>
            <tbody>
              {insights.topFilled.map((c) => (
                <tr key={c.code}>
                  <td className="mono">{c.code}</td>
                  <td className="small">{c.label}</td>
                  <td className="text-right mono">{c.filled}</td>
                  <td className="text-right mono">{c.unique}</td>
                  <td className="text-right mono">{(c.fillRate * 100).toFixed(0)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
          {insights.sparseColumns.length > 0 && (
            <>
              <h4 style={{ margin: "14px 0 8px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Sparse columns ({"<"}50% filled)
              </h4>
              <p className="small muted" style={{ margin: 0 }}>
                {insights.sparseColumns
                  .slice(0, showAllSparse ? insights.sparseColumns.length : 20)
                  .map((c) => `${c.code} (${(c.fillRate * 100).toFixed(0)}%)`)
                  .join(", ")}
              </p>
              {insights.sparseColumns.length > 20 && (
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ marginTop: 8 }}
                  onClick={() => setShowAllSparse((v) => !v)}
                >
                  {showAllSparse
                    ? "Show fewer"
                    : `Show all ${insights.sparseColumns.length} sparse columns`}
                </button>
              )}
            </>
          )}
        </InsightPanel>
      )}
    </AppShell>
  );
}
