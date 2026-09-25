"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  LabelList,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig } from "@/contracts/chart";
import type { IndicatorSeries } from "@/schema/indicators";
import type { ComparisonExtra } from "@/lib/comparisons";

const PALETTE = [
  "#0f6c5a", "#1d4ed8", "#b54708", "#7c3aed", "#0e7490", "#be185d",
  "#4d7c0f", "#ea580c", "#475569", "#db2777", "#2563eb", "#15803d",
];

const CUSTOM_KINDS = new Set(["box", "gauge", "waffle", "heatmap"]);

/** Histogram bins over numeric samples. */
function histogram(data: number[], bins: number): { name: string; value: number }[] {
  if (data.length === 0) return [];
  const min = Math.min(...data);
  const max = Math.max(...data);
  if (max === min) return [{ name: String(Math.round(min)), value: data.length }];
  const width = (max - min) / bins;
  const out: { name: string; value: number }[] = [];
  for (let i = 0; i < bins; i += 1) {
    const lo = min + i * width;
    const hi = lo + width;
    const count = data.filter((v) => v >= lo && (i === bins - 1 ? v <= hi : v < hi)).length;
    out.push({ name: formatTick(lo) + (i === bins - 1 ? "–" + formatTick(max) : ""), value: count });
  }
  return out.filter((b) => b.value > 0);
}

function formatTick(n: number): string {
  return Number.isInteger(n) ? String(Math.round(n)) : n.toFixed(1);
}

export function ChartCanvas({
  kind,
  title,
  series,
  config,
  palette,
  extra,
}: {
  kind: ChartConfig["kind"];
  title: string;
  series: IndicatorSeries;
  config?: ChartConfig;
  palette?: string[];
  extra?: ComparisonExtra;
}) {
  const colors = palette && palette.length > 0 ? palette : PALETTE;
  const data = useMemo(() => {
    if (kind === "histogram") return histogram(series.samples, (config?.props?.bins as number) ?? 5);
    return series.points;
  }, [kind, series, config]);

  const isTime = kind === "line" || kind === "area";
  const horizontal = kind === "bar-horizontal";
  const tickFont = { fontSize: 11, fill: "#5b6b7c" };

  if (data.length === 0 && !(kind === "heatmap" && extra?.matrix) && !(kind === "waffle" && extra?.waffle)) {
    return (
      <div
        style={{
          width: "100%",
          height: 300,
          background: "#fff",
          borderRadius: 8,
          padding: 8,
        }}
        aria-label={title}
      >
        <div className="empty" style={{ display: "grid", placeItems: "center", minHeight: 280 }}>
          <p className="muted small" style={{ maxWidth: 420, textAlign: "center" }}>
            No data to display for this indicator. If the summary below shows {`0`} cleaned rows, check that
            the expected columns were recognized on import.
          </p>
        </div>
      </div>
    );
  }

  const box = (children: React.ReactNode) => (
    <div
      style={{
        width: "100%",
        height: 300,
        minHeight: 260,
        background: "#fff",
        borderRadius: 8,
        padding: 8,
        overflow: "auto",
      }}
      aria-label={title}
    >
      {children}
    </div>
  );

  if (CUSTOM_KINDS.has(kind)) {
    if (kind === "box") return box(<BoxPlot boxes={extra?.boxes ?? []} colors={colors} />);
    if (kind === "gauge") return box(<Gauges gauges={extra?.gauges ?? []} colors={colors} />);
    if (kind === "waffle") return box(<Waffle waffle={extra?.waffle} colors={colors} fallback={data} />);
    return box(<Heatmap matrix={extra?.matrix} colors={colors} />);
  }

  return box(
    <ResponsiveContainer width="100%" height="100%">
      {kind === "funnel" ? (
        <FunnelChart margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
          <Tooltip />
          <Funnel dataKey="value" data={data} isAnimationActive={false}>
            <LabelList position="right" dataKey="value" fill="#334155" stroke="none" style={{ fontSize: 11, fontWeight: 700 }} />
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Funnel>
        </FunnelChart>
      ) : kind === "donut" ? (
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={95}
            innerRadius={52}
            label={(entry) => `${entry.name}: ${entry.value}`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      ) : kind === "radar" && extra?.groups && extra.seriesKeys ? (
        <RadarChart data={extra.groups} outerRadius="72%">
          <PolarGrid />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11, fill: "#5b6b7c" }} />
          <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "#94a3b8" }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {extra.seriesKeys.map((s, i) => (
            <Radar key={s.key} name={s.label} dataKey={s.key} stroke={colors[i % colors.length]} fill={colors[i % colors.length]} fillOpacity={0.18} />
          ))}
        </RadarChart>
      ) : kind === "grouped-bar" && extra?.groups && extra.seriesKeys && extra.seriesKeys.length > 1 ? (
        <BarChart data={extra.groups} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={tickFont} interval={0} angle={extra.groups.length > 6 ? -18 : 0} height={extra.groups.length > 6 ? 60 : 30} />
          <YAxis tick={tickFont} width={44} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {extra.seriesKeys.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={colors[i % colors.length]} maxBarSize={36} />
          ))}
        </BarChart>
      ) : kind === "stacked-100" && extra?.groups && extra.seriesKeys ? (
        <BarChart data={extra.groups} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={tickFont} interval={0} angle={-18} height={70} />
          <YAxis tick={tickFont} width={44} domain={[0, 100]} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {extra.seriesKeys.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} stackId="pct" fill={colors[i % colors.length]} maxBarSize={42} />
          ))}
        </BarChart>
      ) : kind === "pareto" && extra?.groups ? (
        <ComposedChart data={extra.groups} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={tickFont} interval={0} angle={-18} height={70} />
          <YAxis yAxisId="left" tick={tickFont} width={44} allowDecimals={false} unit="%" />
          <YAxis yAxisId="right" orientation="right" tick={tickFont} width={40} domain={[0, 100]} unit="%" />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar yAxisId="left" dataKey="value" name="% True" fill={colors[0]} maxBarSize={40} />
          <Line yAxisId="right" dataKey="cum" name="Cumulative %" stroke={colors[1] ?? colors[0]} strokeWidth={2} dot={{ r: 2 }} />
        </ComposedChart>
      ) : kind === "scatter" && extra?.scatter ? (
        <ScatterChart margin={{ top: 12, right: 16, bottom: 8, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis type="number" dataKey="x" name="Services done" tick={tickFont} allowDecimals={false} label={{ value: "Services done (H1_A–H1_F)", position: "insideBottom", offset: -4, fontSize: 10, fill: "#64748b" }} />
          <YAxis type="number" dataKey="y" name="In MCP" tick={tickFont} width={40} domain={[-1.2, 1.2]} ticks={[-1, 0, 1]} tickFormatter={(v: number) => (v === 1 ? "Yes" : v === 0 ? "No" : "?")} />
          <Tooltip cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={extra.scatter} fill={colors[0]} shape="circle" />
        </ScatterChart>
      ) : kind === "pie" ? (
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={90}
            label={(entry) => String(entry.name)}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      ) : kind === "line" ? (
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={tickFont} interval="preserveStartEnd" />
          <YAxis tick={tickFont} width={44} allowDecimals={false} />
          <Tooltip />
          <Line type="monotone" dataKey="value" name={title} stroke={colors[0]} strokeWidth={2} dot={{ r: 2 }} />
        </LineChart>
      ) : kind === "area" ? (
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="name" tick={tickFont} interval="preserveStartEnd" />
          <YAxis tick={tickFont} width={44} allowDecimals={false} />
          <Tooltip />
          <Area type="monotone" dataKey="value" name={title} fill={colors[0]} fillOpacity={0.25} stroke={colors[0]} strokeWidth={2} />
        </AreaChart>
      ) : kind === "table" ? (
        <TableFallback data={data} title={title} />
      ) : (
        <BarChart
          data={data}
          margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
          layout={horizontal ? "vertical" : "horizontal"}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={!horizontal} horizontal={horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={tickFont} allowDecimals={false} />
              <YAxis type="category" dataKey="name" tick={tickFont} width={150} />
            </>
          ) : (
            <>
              <XAxis
                dataKey="name"
                tick={tickFont}
                interval={0}
                angle={data.length > 6 && !isTime ? -18 : 0}
                height={data.length > 6 && !isTime ? 60 : 30}
              />
              <YAxis tick={tickFont} width={44} allowDecimals={false} />
            </>
          )}
          <Tooltip />
          <Bar dataKey="value" name={title} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={42}>
            {data.map((_, i) => {
              const groups = extra?.barGroups;
              let fill = colors[i % colors.length];
              if (groups && groups[i] !== undefined) {
                const idx = [...new Set(groups)].indexOf(groups[i]);
                if (idx >= 0) fill = colors[idx % colors.length];
              }
              return <Cell key={i} fill={fill} />;
            })}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>,
  );
}

/* ---------------------------- custom renderers ---------------------------- */

function BoxPlot({ boxes, colors }: { boxes: { name: string; min: number; q1: number; med: number; q3: number; max: number; n: number }[]; colors: string[] }) {
  if (boxes.length === 0) return <p className="muted small">No numeric data for a box plot.</p>;
  const allMax = Math.max(...boxes.map((b) => b.max), 1);
  const rowH = 56;
  const left = 190;
  const width = 640;
  const scale = (v: number) => (v / allMax) * (width - left - 30);
  return (
    <div>
      <p className="muted small" style={{ margin: "0 0 4px" }}>
        Box = interquartile range (Q1–Q3), line = median, whiskers = min/max. Outliers &gt; 180 filtered.
      </p>
      <svg viewBox={`0 0 ${width} ${boxes.length * rowH + 24}`} style={{ width: "100%", maxWidth: 760 }}>
        {boxes.map((b, i) => {
          const y = 16 + i * rowH;
          const c = colors[i % colors.length];
          const x1 = left + scale(b.min);
          const x2 = left + scale(b.max);
          const qx1 = left + scale(b.q1);
          const qx3 = left + scale(b.q3);
          const mx = left + scale(b.med);
          return (
            <g key={b.name}>
              <text x={left - 8} y={y + 14} textAnchor="end" fontSize={11} fontWeight={700} fill="#334155">
                {b.name.length > 30 ? b.name.slice(0, 29) + "…" : b.name}
              </text>
              <line x1={x1} y1={y + 10} x2={x2} y2={y + 10} stroke={c} strokeWidth={2} />
              <line x1={x1} y1={y + 4} x2={x1} y2={y + 16} stroke={c} strokeWidth={2} />
              <line x1={x2} y1={y + 4} x2={x2} y2={y + 16} stroke={c} strokeWidth={2} />
              <rect x={qx1} y={y} width={Math.max(qx3 - qx1, 2)} height={20} rx={3} fill={c} fillOpacity={0.35} stroke={c} />
              <line x1={mx} y1={y} x2={mx} y2={y + 20} stroke={c} strokeWidth={3} />
              <text x={mx} y={y - 2} textAnchor="middle" fontSize={9} fill="#64748b">
                med {b.med} (n={b.n})
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Gauges({ gauges, colors }: { gauges: { name: string; value: number; display: string }[]; colors: string[] }) {
  if (gauges.length === 0) return <p className="muted small">No gauge data.</p>;
  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-end", justifyContent: "center", height: "100%", flexWrap: "wrap" }}>
      {gauges.map((g, i) => {
        const clamped = Math.max(0, Math.min(100, g.value));
        const c = colors[i % colors.length];
        return (
          <div key={g.name} style={{ textAlign: "center" }}>
            <svg width={170} height={100} viewBox="0 0 100 56">
              <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#e2e8f0" strokeWidth={10} strokeLinecap="round" />
              <path
                d="M 10 50 A 40 40 0 0 1 90 50"
                fill="none"
                stroke={c}
                strokeWidth={10}
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray={`${clamped} 100`}
              />
              <text x={50} y={46} textAnchor="middle" fontSize={16} fontWeight={800} fill="#0f172a">
                {g.display}
              </text>
            </svg>
            <p className="small" style={{ margin: "2px 0 0", fontWeight: 700, color: "#334155", maxWidth: 170 }}>
              {g.name}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function Waffle({ waffle, colors, fallback }: { waffle?: { filled: number; total: number; filledLabel: string; restLabel: string }; colors: string[]; fallback: { name: string; value: number }[] }) {
  const total = waffle?.total ?? 0;
  const filled = waffle?.filled ?? 0;
  const pct = total > 0 ? (filled / total) * 100 : 0;
  const filledSquares = Math.round(pct);
  const size = 14;
  const gap = 3;
  const cols = 20;
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap }}>
        {Array.from({ length: 100 }, (_, i) => (
          <div
            key={i}
            style={{
              width: size,
              height: size,
              borderRadius: 3,
              background: i < filledSquares ? colors[0] : "#e2e8f0",
            }}
          />
        ))}
      </div>
      <p className="small" style={{ margin: 0, fontWeight: 700, color: "#334155", textAlign: "center" }}>
        <span style={{ color: colors[0] }}>■</span> {waffle?.filledLabel ?? "Filled"}: {filled} of {total} ({Math.round(pct)}%) ·{" "}
        <span style={{ color: "#94a3b8" }}>■</span> {waffle?.restLabel ?? "Rest"}: {Math.max(total - filled, 0)}
      </p>
      {total === 0 && (
        <p className="muted small" style={{ margin: 0 }}>
          {fallback.length ? "No flagged rows in scope." : "No data."}
        </p>
      )}
    </div>
  );
}

function Heatmap({ matrix, colors }: { matrix?: { rowTitle: string; colTitle: string; rows: string[]; cols: string[]; cells: number[][] }; colors: string[] }) {
  if (!matrix) return <p className="muted small">No cross-tab data.</p>;
  const flat = matrix.cells.flat();
  const max = Math.max(...flat, 1);
  const base = colors[0];
  const shade = (v: number) => {
    const t = v / max;
    return v === 0 ? "#f8fafc" : hexMix("#ffffff", base, t * 0.85);
  };
  return (
    <div style={{ display: "grid", placeItems: "center", height: "100%" }}>
      <div>
        <p className="small" style={{ margin: "0 0 6px", fontWeight: 700, color: "#334155", textAlign: "center" }}>
          {matrix.colTitle} (columns) × {matrix.rowTitle} (rows)
        </p>
        <table className="data" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 11 }}>{matrix.rowTitle} ↓ / {matrix.colTitle} →</th>
              {matrix.cols.map((c) => (
                <th key={c} style={{ padding: "6px 10px", fontSize: 11, textAlign: "center" }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matrix.rows.map((r, ri) => (
              <tr key={r}>
                <td style={{ padding: "6px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>{r}</td>
                {matrix.cols.map((_, ci) => {
                  const v = matrix.cells[ri][ci];
                  return (
                    <td
                      key={ci}
                      style={{
                        padding: "8px 14px",
                        textAlign: "center",
                        fontWeight: 800,
                        fontSize: 13,
                        background: shade(v),
                        color: v / max > 0.55 ? "#fff" : "#0f172a",
                        border: "1px solid #e2e8f0",
                      }}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted small" style={{ margin: "6px 0 0", textAlign: "center" }}>
          Cell shading = count of sites; darkest = largest group.
        </p>
      </div>
    </div>
  );
}

function hexMix(a: string, b: string, t: number): string {
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${m[0]}, ${m[1]}, ${m[2]})`;
}

function TableFallback({ data, title }: { data: { name: string; value: number }[]; title: string }) {
  return (
    <table className="data" style={{ margin: "0 auto", width: "auto" }}>
      <thead>
        <tr>
          <th>{title}</th>
          <th className="text-right">Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((p) => (
          <tr key={p.name}>
            <td>{p.name}</td>
            <td className="text-right">{p.value.toLocaleString("en-IN")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
