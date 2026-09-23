"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ChartConfig } from "@/contracts/chart";
import type { IndicatorSeries } from "@/schema/indicators";

const PALETTE = [
  "#0f6c5a", "#1d4ed8", "#b54708", "#7c3aed", "#0e7490", "#be185d",
  "#4d7c0f", "#ea580c", "#475569", "#db2777", "#2563eb", "#15803d",
];

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
}: {
  kind: ChartConfig["kind"];
  title: string;
  series: IndicatorSeries;
  config?: ChartConfig;
}) {
  const data = useMemo(() => {
    if (kind === "histogram") return histogram(series.samples, (config?.props?.bins as number) ?? 5);
    return series.points;
  }, [kind, series, config]);

  const isTime = kind === "line" || kind === "area";
  const horizontal = kind === "bar-horizontal";
  const tickFont = { fontSize: 11, fill: "#5b6b7c" };

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        minHeight: 260,
        background: "#fff",
        borderRadius: 8,
        padding: 8,
      }}
      aria-label={title}
    >
      <ResponsiveContainer width="100%" height="100%">
        {kind === "pie" ? (
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
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
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
            <Line type="monotone" dataKey="value" name={title} stroke="#0f6c5a" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : kind === "area" ? (
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="name" tick={tickFont} interval="preserveStartEnd" />
            <YAxis tick={tickFont} width={44} allowDecimals={false} />
            <Tooltip />
            <Area type="monotone" dataKey="value" name={title} fill="#0f6c5a" fillOpacity={0.25} stroke="#0f6c5a" strokeWidth={2} />
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
                <YAxis type="category" dataKey="name" tick={tickFont} width={130} />
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
            <Bar dataKey="value" name={title} fill="#0f6c5a" radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={42} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
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