"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { AppShell } from "@/components/AppShell";
import { AppDatasetPicker } from "@/components/DatasetPicker";
import { ChartCanvas } from "@/components/ChartCanvas";
import { ColorPicker } from "@/components/ColorPicker";
import { InsightPanel } from "@/components/InsightPanel";
import type { ChartConfig, ChartKind } from "@/contracts/chart";
import { evaluateIndicator, suggestCharts, VHSND_INDICATORS } from "@/schema/indicators";
import { deriveCleanRows } from "@/lib/derive";
import { computeVizInsights, computeDatasetInsights } from "@/lib/insights";
import { COMPARISONS, COMPARISON_CATEGORIES } from "@/lib/comparisons";
import { loadChartBlob } from "@/lib/storage/idb";
import { useChartStore } from "@/stores/chartStore";
import { useDatasetStore } from "@/stores/datasetStore";
import { useResolutionStore } from "@/stores/resolutionStore";
import { useWorkflowStore } from "@/stores/workflowStore";

export default function VizPage() {
  const router = useRouter();
  const activeDatasetId = useWorkflowStore((s) => s.activeDatasetId);
  const dataset = useDatasetStore((s) => s.dataset);
  const loading = useDatasetStore((s) => s.loading);
  const loadDataset = useDatasetStore((s) => s.load);
  const resolutions = useResolutionStore((s) => s.byRow);
  const loadResolutions = useResolutionStore((s) => s.load);
  const charts = useChartStore((s) => s.charts);
  const loadCharts = useChartStore((s) => s.load);
  const addChart = useChartStore((s) => s.addChart);
  const removeChart = useChartStore((s) => s.removeChart);

  const [selectedId, setSelectedId] = useState<string>(VHSND_INDICATORS[0]?.id ?? "");
  const [mode, setMode] = useState<"indicator" | "comparison">("indicator");
  const [comparisonId, setComparisonId] = useState<string>(COMPARISONS[0]?.id ?? "");
  const [kind, setKind] = useState<ChartKind>("bar-vertical");
  const [capturing, setCapturing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [palette, setPalette] = useState<string[]>([]);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!activeDatasetId) return;
    loadDataset(activeDatasetId);
    loadResolutions(activeDatasetId);
    loadCharts(activeDatasetId);
  }, [activeDatasetId, loadDataset, loadResolutions, loadCharts]);

  const cleanRows = useMemo(() => {
    if (!dataset) return [];
    return deriveCleanRows(dataset, resolutions).rows;
  }, [dataset, resolutions]);

  const selectedIndicator = useMemo(
    () => VHSND_INDICATORS.find((i) => i.id === selectedId) ?? VHSND_INDICATORS[0],
    [selectedId],
  );
  const indicator = useMemo(() => {
    if (selectedIndicator && evaluateIndicator(cleanRows, selectedIndicator).points.length === 0) {
      const fallback = VHSND_INDICATORS.find((i) => evaluateIndicator(cleanRows, i).points.length > 0);
      if (fallback) return fallback;
    }
    return selectedIndicator;
  }, [selectedIndicator, cleanRows]);
  const series = useMemo(() => evaluateIndicator(cleanRows, indicator), [cleanRows, indicator]);
  const suggestions = useMemo(() => suggestCharts(indicator, series), [indicator, series]);

  const selectedComparison = useMemo(
    () => COMPARISONS.find((c) => c.id === comparisonId) ?? COMPARISONS[0],
    [comparisonId],
  );
  const compResult = useMemo(
    () => (mode === "comparison" && selectedComparison ? selectedComparison.compute(cleanRows) : null),
    [mode, selectedComparison, cleanRows],
  );

  const activeKind: ChartKind = mode === "comparison" ? compResult?.kind ?? "bar-vertical" : kind;
  const activeSeries = compResult ? compResult.series : series;
  const activeTitle = mode === "comparison" ? selectedComparison.label : indicator.label;

  const vizInsights = useMemo(
    () => computeVizInsights(dataset, resolutions, activeSeries),
    [dataset, resolutions, activeSeries],
  );
  const datasetInsights = useMemo(() => computeDatasetInsights(dataset), [dataset]);

  function selectIndicator(id: string) {
    setSelectedId(id);
    const def = VHSND_INDICATORS.find((i) => i.id === id);
    if (def) {
      const top = suggestCharts(def, evaluateIndicator(cleanRows, def))[0];
      if (top) setKind(top.kind);
    }
  }

  useEffect(() => {
    let alive = true;
    const subs: string[] = [];
    for (const c of charts) {
      if (!c.image) continue;
      loadChartBlob(c.image.blobKey)
        .then((blob) => {
          if (!alive || !blob) return;
          const url = URL.createObjectURL(blob);
          subs.push(url);
          setThumbs((prev) => ({ ...prev, [c.id]: url }));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
      for (const u of subs) URL.revokeObjectURL(u);
    };
  }, [charts]);

  async function handleAddToReport() {
    if (!dataset || !chartRef.current) return;
    setCapturing(true);
    try {
      const dataUrl = await toPng(chartRef.current, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });
      const blob = await (await fetch(dataUrl)).blob();
      const config: ChartConfig = {
        kind: activeKind,
        indicatorId: mode === "comparison" ? selectedComparison.id : indicator.id,
        title: activeTitle,
        valueKey: mode === "comparison" ? selectedComparison.id : indicator.valueField,
        props: {
          series: activeSeries,
          bins: indicator.numericBinCount ?? 5,
          extra: compResult?.extra ?? null,
          insight: compResult?.insight ?? "",
        },
      };
      await addChart(dataset.id, config, {
        blob,
        width: chartRef.current.offsetWidth,
        height: chartRef.current.offsetHeight,
      });
    } catch (err) {
      console.error("Chart capture failed:", err);
    } finally {
      setCapturing(false);
    }
  }

  if (!activeDatasetId) {
    return (
      <AppShell>
        <AppDatasetPicker onPicked={() => router.push("/viz")} />
      </AppShell>
    );
  }

  if (loading || (dataset && dataset.id !== activeDatasetId)) {
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
        <div className="empty"><p className="muted">Dataset not found.</p></div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <section className="section">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 style={{ margin: 0 }}>Visualise indicators</h2>
            <p className="muted small" style={{ margin: "4px 0 0" }}>
              {dataset.name} · {cleanRows.length.toLocaleString("en-IN")} cleaned rows
            </p>
          </div>
          <button className="btn btn-accent btn-sm" onClick={() => router.push("/report")}>
            Continue to Report
          </button>
        </div>
      </section>

      {vizInsights && datasetInsights && (
        <InsightPanel
          title="Indicator & data insights"
          insights={[
            { label: "Cleaned rows", value: vizInsights.cleanRows },
            { label: "Total rows", value: vizInsights.totalRows },
            { label: "Dropped", value: vizInsights.droppedRows },
            { label: "Pending", value: vizInsights.pendingRows, tone: vizInsights.pendingRows > 0 ? "warning" : "ok" },
            { label: "Data points", value: vizInsights.pointCount },
            { label: "Cardinality", value: vizInsights.cardinality },
            { label: "Missing rate", value: `${(vizInsights.missingRate * 100).toFixed(0)}%`, tone: vizInsights.missingRate > 0.5 ? "warning" : "ok" },
            { label: "Date span (days)", value: vizInsights.dateSpanDays },
            { label: "Columns with data", value: datasetInsights.columnsPresent },
            { label: "Not in this file", value: datasetInsights.columnsMissing, tone: "neutral" },
            { label: "Present but empty", value: datasetInsights.columnsEmpty, tone: datasetInsights.columnsEmpty > 0 ? "warning" : "ok" },
          ]}
        >
          <div className="row-wrap" style={{ gap: 18 }}>
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Numeric summary
              </h4>
              {vizInsights.numericSummary ? (
                <p className="small" style={{ margin: 0 }}>
                  min <strong>{vizInsights.numericSummary.min}</strong> · max{" "}
                  <strong>{vizInsights.numericSummary.max}</strong> · mean{" "}
                  <strong>{vizInsights.numericSummary.mean.toFixed(2)}</strong> · n{" "}
                  <strong>{vizInsights.numericSummary.count}</strong>
                </p>
              ) : (
                <p className="small muted" style={{ margin: 0 }}>No numeric samples for this indicator.</p>
              )}
            </div>
            <div>
              <h4 style={{ margin: "0 0 6px", fontSize: 13, textTransform: "uppercase", letterSpacing: "0.03em" }}>
                Shape
              </h4>
              <p className="small" style={{ margin: 0 }}>
                {vizInsights.numericShape}
                {vizInsights.cardinality > 0 && vizInsights.cardinality === vizInsights.pointCount && vizInsights.pointCount > 1 && (
                  <span className="muted"> — every value is unique (that is why bars all look equal)</span>
                )}
              </p>
            </div>
          </div>
        </InsightPanel>
      )}

      <section className="section">
        <div className="card" style={{ padding: 0 }}>
          <div className="row-wrap" style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <span className="muted small" style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 }}>
              Analysis
            </span>
            <div className="row-wrap" style={{ gap: 6 }}>
              <button
                className={`btn btn-sm${mode === "indicator" ? " btn-primary" : ""}`}
                onClick={() => setMode("indicator")}
              >
                Indicators
              </button>
              <button
                className={`btn btn-sm${mode === "comparison" ? " btn-primary" : ""}`}
                onClick={() => setMode("comparison")}
                title="20 comparison charts (funnel, radar, box, gauge, cross-tab…)"
              >
                Comparison charts (20)
              </button>
            </div>
            {mode === "indicator" ? (
              <select value={selectedId} onChange={(e) => selectIndicator(e.target.value)} style={{ flex: "1 1 360px" }}>
                {VHSND_INDICATORS.map((i) => (
                  <option key={i.id} value={i.id}>{i.label}</option>
                ))}
              </select>
            ) : (
              <select
                value={comparisonId}
                onChange={(e) => setComparisonId(e.target.value)}
                style={{ flex: "1 1 460px" }}
              >
                {COMPARISON_CATEGORIES.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {COMPARISONS.filter((c) => c.category === cat).map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </div>

          <div style={{ padding: 14 }}>
            <p className="muted small">
              {mode === "comparison" ? selectedComparison.description : indicator.description}
            </p>
            {mode === "indicator" && (
              <div className="row-wrap">
                <span className="muted small">Recommended:</span>
                {suggestions.map((s) => (
                  <button
                    key={s.kind}
                    className={`btn btn-sm${kind === s.kind ? " btn-primary" : ""}`}
                    title={s.reason}
                    onClick={() => setKind(s.kind)}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
            {mode === "comparison" && compResult && (
              <div className="row-wrap" style={{ gap: 8 }}>
                <span className="muted small">Chart type:</span>
                <span className="btn btn-sm" style={{ cursor: "default" }}>{activeKind}</span>
                {compResult.columnsMissing.length > 0 && (
                  <span className="small" style={{ color: "var(--warning)", fontWeight: 700 }}>
                    Not in this file: {compResult.columnsMissing.join(", ")}
                  </span>
                )}
              </div>
            )}
          </div>

          <div style={{ padding: "0 14px 10px" }}>
            <ColorPicker selected={palette} onChange={setPalette} />
          </div>

          <div ref={chartRef} style={{ padding: 16, background: "#fff" }}>
            <h4 style={{ margin: "0 0 8px", color: "var(--text)" }}>{activeTitle}</h4>
            <ChartCanvas
              kind={activeKind}
              title={activeTitle}
              series={activeSeries}
              palette={palette}
              extra={compResult?.extra}
            />
            {compResult && (
              <div
                style={{
                  marginTop: 10,
                  padding: "10px 12px",
                  borderRadius: 8,
                  background: "#f0fdf9",
                  border: "1px solid #99f6e4",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontSize: 10,
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    color: "#0f6c5a",
                    marginBottom: 4,
                  }}
                >
                  Insight
                </span>
                <p className="small" style={{ margin: 0, color: "#134e4a", lineHeight: 1.5 }}>
                  {compResult.insight}
                </p>
              </div>
            )}
          </div>

          <div className="row" style={{ padding: "0 16px 16px", justifyContent: "flex-end" }}>
            <button className="btn btn-primary btn-sm" onClick={handleAddToReport} disabled={capturing}>
              {capturing ? "Capturing…" : "Add to report"}
            </button>
          </div>
        </div>
      </section>

      {charts.length > 0 && (
        <section className="card">
          <h3 style={{ margin: 0 }}>Charts added to this report ({charts.length})</h3>
          <div
            className="row-wrap mt-16"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))",
              gap: 14,
              alignItems: "stretch",
            }}
          >
            {charts.map((c) => (
              <div key={c.id} className="card" style={{ margin: 0, padding: 12 }}>
                <div style={{ textAlign: "center" }}>
                  {thumbs[c.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbs[c.id]}
                      alt={c.title}
                      style={{ maxWidth: "100%", maxHeight: 150, borderRadius: 6, background: "#fff" }}
                    />
                  ) : (
                    <div style={{ height: 90 }} className="empty"><div className="spinner" /></div>
                  )}
                </div>
                <div className="small" style={{ fontWeight: 600, marginTop: 8 }}>{c.title}</div>
                <div className="muted small">{c.kind}</div>
                <button
                  className="btn btn-sm mt-8"
                  onClick={async () => {
                    await removeChart(c.id);
                    setThumbs((prev) => {
                      const next = { ...prev };
                      delete next[c.id];
                      return next;
                    });
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}