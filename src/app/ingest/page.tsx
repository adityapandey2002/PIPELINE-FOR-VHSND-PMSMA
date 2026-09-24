"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { AppShell } from "@/components/AppShell";
import { InsightPanel } from "@/components/InsightPanel";
import { runParse, runValidate } from "@/lib/workers";
import { useDatasetStore } from "@/stores/datasetStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { computeDatasetInsights, type DatasetInsights } from "@/lib/insights";

type Phase = "idle" | "reading" | "parsing" | "validating" | "done" | "error";

export default function IngestPage() {
  const router = useRouter();
  const { createDataset, setValidation } = useDatasetStore();
  const setActive = useWorkflowStore((s) => s.setActiveDatasetId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<DatasetInsights | null>(null);
  const [summary, setSummary] = useState<{
    rows: number;
    errors: number;
    warnings: number;
    columnsRecognized: number;
    missingCritical: string[];
  } | null>(null);

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
      setSummary(null);
      setInsights(null);

      file
        .arrayBuffer()
        .then((buffer) =>
          runParse(
            {
              buffer,
              fileName: file.name,
              sizeBytes: file.size,
              importedAt: new Date().toISOString(),
            },
            (p) => setProgress(p === "done" ? "done" : "Parsing workbook…"),
          ),
        )
        .then(async (parsed) => {
          setPhase("validating");
          setProgress("Checking for contradictions…");
          const dataset = await createDataset(parsed, "vhsnd");
          const result = await runValidate({
            rows: dataset.rows,
            schemaVersion: dataset.schemaVersion,
            refDate: null,
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
          });
          setInsights(computeDatasetInsights(dataset));
          setPhase("done");
          setActive(dataset.id);
        })
        .catch((err: unknown) => {
          setPhase("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [createDataset, setValidation, setActive],
  );

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
              {summary.missingCritical.length > 0 && (
                <span style={{ color: "var(--warn)" }}>
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
      </section>

      {phase === "done" && insights && (
        <InsightPanel
          title="Data insights"
          insights={[
            { label: "Rows imported", value: insights.totalRows },
            { label: "Rows skipped (empty)", value: insights.skippedRows },
            { label: "Columns in this file", value: insights.columnsPresent },
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
                  .slice(0, 20)
                  .map((c) => `${c.code} (${(c.fillRate * 100).toFixed(0)}%)`)
                  .join(", ")}
                {insights.sparseColumns.length > 20 && ` …and ${insights.sparseColumns.length - 20} more`}
              </p>
            </>
          )}
        </InsightPanel>
      )}
    </AppShell>
  );
}
