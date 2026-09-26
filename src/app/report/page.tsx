"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AppDatasetPicker } from "@/components/DatasetPicker";
import { cleanRowsToCsv, downloadBlob } from "@/export/csv";
import { generatePptxReport } from "@/export/pptxReporter";
import { renderDocxReport, base64ToBytes, type DocxChartImage } from "@/export/docxReporter";
import { buildReportContext } from "@/export/reportContext";
import { templates as embeddedTemplates } from "@/export/templates.generated";
import { deriveCleanRows, unresolvedErrors } from "@/lib/derive";
import { eraseAllLocalData, loadChartBlob } from "@/lib/storage/idb";
import { VHSND_INDICATORS } from "@/schema/indicators";
import { useChartStore } from "@/stores/chartStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useResolutionStore } from "@/stores/resolutionStore";
import { useWorkflowStore } from "@/stores/workflowStore";

type ExportKind = "pptx" | "docx" | "csv" | "audit" | null;

export default function ReportPage() {
  const router = useRouter();
  const activeDatasetId = useWorkflowStore((s) => s.activeDatasetId);
  const dataset = useDatasetStore((s) => s.dataset);
  const validation = useDatasetStore((s) => s.validation);
  const loading = useDatasetStore((s) => s.loading);
  const loadDataset = useDatasetStore((s) => s.load);
  const resolutions = useResolutionStore((s) => s.byRow);
  const loadResolutions = useResolutionStore((s) => s.load);
  const charts = useChartStore((s) => s.charts);
  const loadCharts = useChartStore((s) => s.load);

  const [running, setRunning] = useState<ExportKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleared, setCleared] = useState(false);

  useEffect(() => {
    if (!activeDatasetId) return;
    loadDataset(activeDatasetId);
    loadResolutions(activeDatasetId);
    loadCharts(activeDatasetId);
  }, [activeDatasetId, loadDataset, loadResolutions, loadCharts]);

  const clean = useMemo(
    () => deriveCleanRows(dataset, validation?.violations ?? [], resolutions),
    [dataset, validation, resolutions],
  );

  const unresolved = useMemo(
    () => (validation ? unresolvedErrors(validation.violations, resolutions).length : 0),
    [validation, resolutions],
  );

  const docTemplate = useMemo(() => embeddedTemplates.find((t) => t.rel.endsWith(".docx")), []);

  const doExport = async (kind: Exclude<ExportKind, null>) => {
    if (!dataset || !validation) return;
    setError(null);
    setRunning(kind);
    try {
      const context = await buildReportContext({
        datasetName: dataset.name,
        fileName: dataset.source.fileName,
        importedAt: dataset.source.importedAt,
        totalRows: dataset.totalRows,
        rows: clean.rows,
        resolutions,
        violations: validation.violations,
        counts: validation.counts,
        indicatorDefs: VHSND_INDICATORS,
        charts: charts.map((c) => ({
          id: c.id,
          title: c.title,
          kind: c.kind,
          blobKey: c.image?.blobKey ?? null,
        })),
        schemaVersion: dataset.schemaVersion,
      });

      if (kind === "csv") {
        const blob = new Blob([cleanRowsToCsv(clean.rows)], {
          type: "text/csv;charset=utf-8",
        });
        downloadBlob(blob, `cleaned-${dataset.source.fileName.replace(/\.[^.]+$/, "")}.csv`);
      } else if (kind === "audit") {
        const blob = new Blob([JSON.stringify(context, null, 2)], {
          type: "application/json",
        });
        downloadBlob(blob, `audit-${dataset.source.fileName.replace(/\.[^.]+$/, "")}.json`);
      } else if (kind === "pptx") {
        const chartBlobs = await Promise.all(
          context.charts.map(async (c) =>
            c.blobKey ? { blob: (await loadChartBlob(c.blobKey)) ?? new Blob() } : { blob: new Blob() },
          ),
        );
        const blob = await generatePptxReport(context, chartBlobs);
        downloadBlob(blob, `vhsnd-report-${new Date().toISOString().slice(0, 10)}.pptx`);
      } else if (kind === "docx") {
        if (!docTemplate) {
          throw new Error("No official .docx template has been installed yet. Drop one into templates/ and re-run npm run embed:templates.");
        }
        const chartImages = (
          await Promise.all(
            context.charts.map(async (c): Promise<DocxChartImage | null> => {
              if (!c.blobKey) return null;
              const blob = await loadChartBlob(c.blobKey);
              if (!blob) return null;
              const src = charts.find((x) => x.image?.blobKey === c.blobKey);
              return {
                blobKey: c.blobKey,
                blob,
                width: src?.image?.width ?? 0,
                height: src?.image?.height ?? 0,
              };
            }),
          )
        ).filter((x): x is DocxChartImage => x !== null);
        const blob = await renderDocxReport(base64ToBytes(docTemplate.base64), context, chartImages);
        downloadBlob(blob, `vhsnd-report-${new Date().toISOString().slice(0, 10)}.docx`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const erase = async () => {
    if (!window.confirm("Erase ALL datasets, corrections, charts and drafts from this device? This cannot be undone.")) return;
    await eraseAllLocalData();
    setCleared(true);
    router.push("/");
  };

  if (!activeDatasetId) {
    return (
      <AppShell>
        <AppDatasetPicker onPicked={() => router.push("/report")} />
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="empty">
          <div className="row" style={{ justifyContent: "center" }}>
            <div className="spinner" aria-hidden />
          </div>
          <p className="muted small" style={{ marginTop: 8 }}>Loading…</p>
        </div>
      </AppShell>
    );
  }

  if (!dataset || !validation) {
    return (
      <AppShell>
        <div className="empty"><p className="muted">Dataset not found.</p></div>
      </AppShell>
    );
  }

  const blocked = unresolved > 0 || clean.rows.length === 0;

  return (
    <AppShell>
      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>Generate report</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {dataset.name} · {clean.rows.length.toLocaleString("en-IN")} rows will be enclosed · manifest &amp; full audit log attached
            </p>
          </div>
        </div>
      </section>

      {blocked && (
        <section className="card" style={{ borderColor: "var(--error)", background: "var(--error-soft)" }}>
          <h4 style={{ color: "var(--error)", margin: 0 }}>
            {unresolved > 0
              ? `${unresolved} unresolved error(s) must be fixed before a report can be generated.`
              : "The cleaned dataset is empty; import a dataset and review it first."}
          </h4>
          <a href="/review" className="btn btn-sm mp-8" style={{ marginTop: 10, display: "inline-flex" }}>
            Open the review step
          </a>
        </section>
      )}

      <section className="section">
        <div className="card">
          <h3 style={{ margin: 0 }}>Downloads</h3>
          <div className="row-wrap mt-16">
            <button className="btn btn-primary" disabled={blocked || running !== null} onClick={() => doExport("pptx")}>
              {running === "pptx" ? "Building…" : "Slide deck (PPTX)"}
            </button>
            <button className="btn btn-accent" disabled={blocked || running !== null || !docTemplate} onClick={() => doExport("docx")} title={!docTemplate ? "Install a template in templates/ first." : undefined}>
              {running === "docx" ? "Rendering…" : docTemplate ? "Official letter (DOCX)" : "DOCX (template pending)"}
            </button>
            <button className="btn" disabled={blocked || running !== null} onClick={() => doExport("csv")}>
              {running === "csv" ? "Writing…" : "Cleaned data (CSV)"}
            </button>
            <button className="btn" disabled={running !== null} onClick={() => doExport("audit")}>
              {running === "audit" ? "Writing…" : "Audit log (JSON)"}
            </button>
          </div>
          {error && (
            <p className="small" style={{ color: "var(--error)", marginTop: 12 }}>{error}</p>
          )}
          <div className="kv mt-24" style={{ maxWidth: 560 }}>
            <dt>Rows included</dt><dd>{clean.rows.length.toLocaleString("en-IN")}</dd>
            <dt>Rows dropped</dt><dd>{clean.dropped.length.toLocaleString("en-IN")}</dd>
            <dt>Errors found</dt><dd>{validation.counts.error.toLocaleString("en-IN")}</dd>
            <dt>Unresolved errors</dt><dd>{unresolved.toLocaleString("en-IN")}</dd>
            <dt>Charts attached</dt><dd>{charts.length}</dd>
            <dt>Schema version</dt><dd className="mono">{dataset.schemaVersion}</dd>
          </div>
        </div>
      </section>

      <section className="card" style={{ borderColor: "var(--info)" }}>
        <h3 style={{ margin: 0 }}>About the report</h3>
        <p className="muted small">
          The PPTX deck contains a title slide, the cleaning summary, headline indicators, one slide per
          chart you added, and the full audit log. The DOCX export renders your official letterhead when a
          master template is installed in the <code className="mono">templates/</code> folder and{" "}
          <code className="mono">npm run embed:templates</code> is executed. Every export carries a SHA-256
          manifest binding the content to the cleaned dataset.
        </p>
        <h4 style={{ marginTop: 16 }}>Privacy</h4>
        <p className="muted small">
          All files are produced in this browser and nothing is transmitted. When you are finished, you can
          permanently delete everything currently stored locally for this workspace.
        </p>
        <button className="btn btn-danger btn-sm" onClick={erase} disabled={cleared}>
          {cleared ? "Local data erased" : "Erase all local data"}
        </button>
      </section>
    </AppShell>
  );
}