"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { AppShell } from "@/components/AppShell";
import { runParse, runValidate } from "@/lib/workers";
import { useDatasetStore } from "@/stores/datasetStore";
import { useWorkflowStore } from "@/stores/workflowStore";

type Phase = "idle" | "reading" | "parsing" | "validating" | "done" | "error";

export default function IngestPage() {
  const router = useRouter();
  const { createDataset, setValidation } = useDatasetStore();
  const setActive = useWorkflowStore((s) => s.setActiveDatasetId);
  const [phase, setPhase] = useState<Phase>("idle");
  const [fileName, setFileName] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ rows: number; errors: number; warnings: number } | null>(null);

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
          setSummary({
            rows: dataset.totalRows,
            errors: result.counts.error,
            warnings: result.counts.warning,
          });
          setPhase("done");
          setActive(dataset.id);
          router.push("/review");
        })
        .catch((err: unknown) => {
          setPhase("error");
          setError(err instanceof Error ? err.message : String(err));
        });
    },
    [createDataset, setValidation, setActive, router],
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
              {summary.warnings.toLocaleString("en-IN")} warnings. Opening the review step…
            </p>
          </div>
        )}
      </section>
    </AppShell>
  );
}