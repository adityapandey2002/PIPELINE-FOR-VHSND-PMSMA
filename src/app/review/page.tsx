"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { AppDatasetPicker } from "@/components/DatasetPicker";
import { RowDrawer } from "@/components/RowDrawer";
import { InsightPanel } from "@/components/InsightPanel";
import { SummaryCard } from "@/components/SummaryCard";
import type { CleanRow } from "@/contracts/resolution";
import type { Severity } from "@/contracts/violation";
import { severityRank } from "@/contracts/violation";
import { deriveCleanRows, unresolvedErrors } from "@/lib/derive";
import { computeCleaningInsights, computeDatasetInsights } from "@/lib/insights";
import { runValidate } from "@/lib/workers";
import { useDatasetStore } from "@/stores/datasetStore";
import { useResolutionStore } from "@/stores/resolutionStore";
import { useWorkflowStore } from "@/stores/workflowStore";

const SEVERITY_LABEL: Record<Severity, string> = {
  error: "Error",
  warning: "Warning",
  info: "Info",
};

export default function ReviewPage() {
  const router = useRouter();
  const activeDatasetId = useWorkflowStore((s) => s.activeDatasetId);
  const dataset = useDatasetStore((s) => s.dataset);
  const validation = useDatasetStore((s) => s.validation);
  const loading = useDatasetStore((s) => s.loading);
  const loadDataset = useDatasetStore((s) => s.load);
  const setValidation = useDatasetStore((s) => s.setValidation);
  const resolutions = useResolutionStore((s) => s.byRow);
  const loadResolutions = useResolutionStore((s) => s.load);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [revalidating, setRevalidating] = useState(false);

  useEffect(() => {
    if (!activeDatasetId) return;
    loadDataset(activeDatasetId);
    loadResolutions(activeDatasetId);
  }, [activeDatasetId, loadDataset, loadResolutions]);

  const violations = useMemo(() => validation?.violations ?? [], [validation]);
  const filtered = useMemo(() => {
    if (filter === "all") return violations;
    return violations.filter((v) => v.severity === filter);
  }, [violations, filter]);

  const unresolved = useMemo(() => unresolvedErrors(violations, resolutions), [violations, resolutions]);
  const clean = useMemo<{
    rows: CleanRow[];
    dropped: CleanRow[];
    pendingCount: number;
  }>(() => {
    const derived = deriveCleanRows(dataset, resolutions);
    return {
      rows: derived.rows,
      dropped: derived.dropped,
      pendingCount: derived.pending.length,
    };
  }, [dataset, resolutions]);

  const cleaningInsights = useMemo(
    () => computeCleaningInsights(dataset, violations, resolutions),
    [dataset, violations, resolutions],
  );
  const datasetInsights = useMemo(() => computeDatasetInsights(dataset), [dataset]);

  async function handleRevalidate() {
    if (!dataset) return;
    setRevalidating(true);
    try {
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
    } finally {
      setRevalidating(false);
    }
  }

  if (!activeDatasetId) {
    return (
      <AppShell>
        <AppDatasetPicker onPicked={() => router.push("/review")} />
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
          <p className="muted small" style={{ marginTop: 8 }}>Loading dataset…</p>
        </div>
      </AppShell>
    );
  }

  if (!dataset) {
    return (
      <AppShell>
        <div className="empty">
          <p className="muted">Dataset not found.</p>
        </div>
      </AppShell>
    );
  }

  const selectedViolations = selectedRowId ? violations.filter((v) => v.rowId === selectedRowId) : [];
  const statusCounts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const v of violations) statusCounts[v.severity] += 1;

  return (
    <AppShell>
      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>Review &amp; clean</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {dataset.name} · {dataset.totalRows.toLocaleString("en-IN")} rows · schema v{dataset.schemaVersion}
            </p>
          </div>
          <div className="row">
            <button className="btn btn-sm" onClick={handleRevalidate} disabled={revalidating}>
              {revalidating ? "Checking…" : "Re-run validation"}
            </button>
            <button
              className="btn btn-accent btn-sm"
              disabled={unresolved.length > 0}
              onClick={() => router.push("/viz")}
              title={unresolved.length > 0 ? `${unresolved.length} unresolved error(s) block this step.` : undefined}
            >
              Continue to Visualise
            </button>
          </div>
        </div>
      </section>

      <section className="section">
        <div
          className="row-wrap"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 12 }}
        >
          <SummaryCard label="Rows imported" value={dataset.totalRows} tone="neutral" />
          <SummaryCard label="Errors" value={statusCounts.error} tone="error" />
          <SummaryCard label="Warnings" value={statusCounts.warning} tone="warning" />
          <SummaryCard label="Unresolved errors" value={unresolved.length} tone={unresolved.length > 0 ? "error" : "ok"} />
          <SummaryCard label="Kept after clean" value={clean.rows.length} tone="ok" />
          <SummaryCard label="Dropped" value={clean.dropped.length} tone="neutral" />
        </div>
      </section>

      {cleaningInsights && datasetInsights && (
        <InsightPanel
          title="Data insights"
          insights={[
            { label: "Pending decisions", value: cleaningInsights.pendingRows, tone: cleaningInsights.pendingRows > 0 ? "warning" : "ok" },
            { label: "Info notices", value: cleaningInsights.info },
            { label: "Columns with data", value: datasetInsights.columnsPresent },
            { label: "Not in this file", value: datasetInsights.columnsMissing, tone: "neutral" },
            { label: "Present but empty", value: datasetInsights.columnsEmpty, tone: datasetInsights.columnsEmpty > 0 ? "warning" : "ok" },
            { label: "Sparse (<50%)", value: datasetInsights.sparseColumns.length, tone: datasetInsights.sparseColumns.length > 0 ? "warning" : "ok" },
          ]}
        >
          <div className="row-wrap" style={{ gap: 18 }}>
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Violations by category
              </h4>
              {Object.keys(cleaningInsights.byCategory).length === 0 ? (
                <p className="small muted" style={{ margin: 0 }}>None.</p>
              ) : (
                <div className="row-wrap" style={{ gap: 8 }}>
                  {Object.entries(cleaningInsights.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, n]) => (
                      <span key={cat} className="badge badge-neutral">
                        {cat}: {n}
                      </span>
                    ))}
                </div>
              )}
            </div>
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Columns not in this file
              </h4>
              <p className="small muted" style={{ margin: 0 }}>
                {datasetInsights.columnsMissing === 0
                  ? "All expected columns present."
                  : `${datasetInsights.columnsPresent} of ${datasetInsights.columnsExpected} schema fields are in this export. The remaining ${datasetInsights.columnsMissing} are simply not in the file — nothing was dropped.`}
              </p>
            </div>
          </div>
        </InsightPanel>
      )}

      {unresolved.length > 0 && (
        <section className="card" style={{ borderColor: "var(--error)", background: "var(--error-soft)" }}>
          <h4 style={{ color: "var(--error)", margin: 0 }}>{unresolved.length} errors still need a decision</h4>
          <p className="small" style={{ marginBottom: 0 }}>
            Rows with unresolved errors are held out of the cleaned dataset and the report. Keep (with a
            reason), override the value, or drop each row below.
          </p>
        </section>
      )}

      <section className="section">
        <div className="row-wrap mb-8">
          <span className="muted small">Show:</span>
          {(["all", "error", "warning", "info"] as const).map((s) => (
            <button
              key={s}
              className={`btn btn-sm${filter === s ? " btn-primary" : ""}`}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? `All (${violations.length})` : `${SEVERITY_LABEL[s]}s (${statusCounts[s as Severity]})`}
            </button>
          ))}
        </div>

        <section className="card" style={{ padding: 0 }}>
          {filtered.length === 0 ? (
            <div className="empty">
              <p className="muted">No {filter === "all" ? "" : filter + " "}violations — this dataset is clean.</p>
            </div>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Severity</th>
                  <th>Code</th>
                  <th>Message</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((v) => {
                  const status = resolutions[v.rowId]?.status ?? "pending";
                  return (
                    <tr
                      key={`${v.rowId}-${v.code}`}
                      style={{ cursor: "pointer" }}
                      onClick={() => setSelectedRowId(v.rowId === selectedRowId ? null : v.rowId)}
                    >
                      <td className="mono">{v.rowId}</td>
                      <td><span className={`badge badge-${v.severity}`}>{SEVERITY_LABEL[v.severity]}</span></td>
                      <td className="mono">{v.code}</td>
                      <td className="small">{v.message}</td>
                      <td>
                        {status === "pending" ? (
                          <span className="badge badge-warning">Pending</span>
                        ) : status === "keep" ? (
                          <span className="badge badge-ok">Kept</span>
                        ) : status === "drop" ? (
                          <span className="badge badge-neutral">Dropped</span>
                        ) : (
                          <span className="badge badge-info">Overridden</span>
                        )}
                      </td>
                      <td className="text-right">
                        <span className="small muted">{severityRank(v.severity) === 2 ? "resolves error" : "review"}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </section>

      {selectedRowId && (
        <RowDrawer
          rowId={selectedRowId}
          dataset={dataset}
          violations={selectedViolations}
          onClose={() => setSelectedRowId(null)}
        />
      )}

      <section className="card">
        <h3>Audit log</h3>
        {Object.keys(resolutions).length === 0 ? (
          <p className="muted small">No decisions recorded yet.</p>
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Row</th>
                <th>Decision</th>
                <th>At</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(resolutions)
                .sort((a, b) => (a.decidedAt ?? "").localeCompare(b.decidedAt ?? ""))
                .map((r) => (
                  <tr key={r.rowId}>
                    <td className="mono">{r.rowId}</td>
                    <td><span className={`badge badge-${r.status === "keep" ? "ok" : r.status === "drop" ? "neutral" : "info"}`}>{r.status}</span></td>
                    <td className="small">{r.decidedAt ? new Date(r.decidedAt).toLocaleString("en-IN") : "—"}</td>
                    <td className="small">{r.justification ?? "—"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </AppShell>
  );
}