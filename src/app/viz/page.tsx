"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toPng } from "html-to-image";
import { AppShell } from "@/components/AppShell";
import { AppDatasetPicker } from "@/components/DatasetPicker";
import { ChartCanvas } from "@/components/ChartCanvas";
import type { ChartConfig, ChartKind } from "@/contracts/chart";
import { evaluateIndicator, suggestCharts, VHSND_INDICATORS } from "@/schema/indicators";
import { deriveCleanRows } from "@/lib/derive";
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
  const [kind, setKind] = useState<ChartKind>("bar-vertical");
  const [capturing, setCapturing] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
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

  const indicator = useMemo(() => VHSND_INDICATORS.find((i) => i.id === selectedId) ?? VHSND_INDICATORS[0], [selectedId]);
  const series = useMemo(() => evaluateIndicator(cleanRows, indicator), [cleanRows, indicator]);
  const suggestions = useMemo(() => suggestCharts(indicator, series), [indicator, series]);

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
        kind,
        indicatorId: indicator.id,
        title: indicator.label,
        valueKey: indicator.valueField,
        props: { series, bins: indicator.numericBinCount ?? 5 },
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

      <section className="section">
        <div className="card" style={{ padding: 0 }}>
          <div className="row-wrap" style={{ padding: 14, borderBottom: "1px solid var(--border)" }}>
            <span className="muted small" style={{ textTransform: "uppercase", letterSpacing: "0.03em", fontWeight: 700 }}>
              Indicator
            </span>
            <select value={selectedId} onChange={(e) => selectIndicator(e.target.value)} style={{ flex: "1 1 360px" }}>
              {VHSND_INDICATORS.map((i) => (
                <option key={i.id} value={i.id}>{i.label}</option>
              ))}
            </select>
          </div>

          <div style={{ padding: 14 }}>
            <p className="muted small">{indicator.description}</p>
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
          </div>

          <div ref={chartRef} style={{ padding: 16 }}>
            <h4 style={{ margin: "0 0 8px", color: "var(--text)" }}>{indicator.label}</h4>
            <ChartCanvas kind={kind} title={indicator.label} series={series} />
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