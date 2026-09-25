import type { CellValue } from "@/contracts/dataset";
import type { CleanRow } from "@/contracts/resolution";
import type { ChartKind, ChartSuggestion } from "@/contracts/chart";
import type { Aggregation, ComputedStats, DataType, IndicatorDef } from "@/contracts/indicator";
import { coerceNumber } from "@/schema/engine/cellCoercers";
import { columnLabel } from "@/schema/columns-vhsnd";

/* ---------------------------------- registry ---------------------------------- */

const numeric = (
  id: string,
  label: string,
  valueField: string,
  aggregation: Aggregation,
  description: string,
  dataType: DataType = "numeric",
): IndicatorDef => ({
  id,
  label,
  dataType,
  valueField,
  aggregation,
  description,
});

const breakdown = (
  id: string,
  label: string,
  optionRoot: string,
  description: string,
): IndicatorDef => ({
  id,
  label,
  dataType: "categorical",
  valueField: optionRoot,
  aggregation: "count",
  description,
});

export const VHSND_INDICATORS: IndicatorDef[] = [
  /* Participation & coverage */
  {
    id: "sessions",
    label: "Sessions conducted",
    dataType: "time-series",
    valueField: "SessionKey",
    aggregation: "count",
    description: "Number of session records over the observation period.",
  },
  {
    id: "sessions-by-block",
    label: "Sessions by block",
    dataType: "geospatial",
    valueField: "Count",
    dimensionField: "B2A",
    aggregation: "count",
    description: "Number of sessions conducted per block (ranked).",
  },
  numeric("anm-mgmt", "ANM managing data in ANMOL app", "ANM1", "count", "Sessions where the ANM reported using the ANMOL app."),
  numeric("asha-survey", "ASHA conducting surveys via m-ASHA", "ASHA1", "count", "Sessions where ASHA conducted surveys through m-ASHA."),
  numeric("uw in-registration", "Sessions registered on U-WIN", "C6", "count", "Sessions registered on the U-WIN portal."),
  numeric("scan-share", "Scan & Share available", "New", "count", "Sessions where Scan & Share was available."),
  numeric("high-bp-identified", "High blood pressure identified", "H1BP1", "sum", "Pregnant women identified with high blood pressure."),
  numeric("high-bp-referred", "High blood pressure referrals", "H1PB2", "sum", "Pregnant women with high BP referred onward."),
  numeric("anemia-screened", "Anemia screening (blood samples)", "H1HB", "sum", "Pregnant women whose blood was sampled for anemia."),
  numeric("anemia-identified", "Anemia cases identified", "H1HB1", "sum", "Pregnant women identified as anemic."),
  numeric("anemia-referred", "Anemia referrals", "H1HB2", "sum", "Anemic women referred onward."),
  numeric("pnc-lactating", "Lactating mothers at post-natal check-up", "H3A", "sum", "Lactating mothers who attended for PNC."),
  numeric(
    "bp-systolic",
    "Blood pressure (systolic) distribution",
    "H1BP",
    "none",
    "Distribution of the number of BP measurements performed per session.",
    "numeric-distribution",
  ),
  numeric(
    "bp-diastolic",
    "Blood pressure (diastolic) distribution",
    "H1BP1",
    "none",
    "Distribution of high-BP identifications across sessions.",
    "numeric-distribution",
  ),
  breakdown("members", "Participants at the session", "C10", "Other members who participated (besides the head)."),
  breakdown("workers", "Health workers at session site", "C4", "Which health workers the session site had."),
  breakdown("supervisor", "Who supervised the session", "C11_1", "Staffing coverage from Health / Social Welfare."),
  breakdown("supplies-bring", "Vaccine & consumables brought by", "E3", "Who delivered vaccine and consumables."),
  breakdown("supplies-site", "Supplies available at session site", "G1", "Consumables and equipment present."),
  breakdown("supplies-machines", "Working machines at the session", "G3", "Only machines confirmed working."),
  breakdown("supplies-usable", "Resources usable on the session", "G12", "Resources available for use during the session."),
];

/* ---------------------------------- evaluation ---------------------------------- */

export interface SeriesPoint {
  name: string;
  value: number;
}

export interface IndicatorSeries {
  points: SeriesPoint[];
  samples: number[];
  timeLabels: string[];
  stats: ComputedStats;
}

export function evaluateIndicator(rows: CleanRow[], def: IndicatorDef): IndicatorSeries {
  const samples: number[] = [];
  const timeLabels: string[] = [];
  const stats: ComputedStats = {
    cardinality: 0,
    dateSpanDays: 0,
    missingRate: 0,
    numericShape: "flat",
  };

  const present = (row: CleanRow, code: string) => {
    const v = row.values[code];
    return v === true || v === 1 || v === "1" || v === "true" || v === "yes";
  };

  switch (def.dataType) {
    case "time-series": {
      const byDay = new Map<string, number>();
      const valueOf = (v: CellValue | undefined): string => {
        if (typeof v === "string" && v.length >= 10) return v.slice(0, 10);
        return "";
      };
      const hasValue = (key: string) => rows.some((row) => valueOf(row.values[key]) !== "");
      const looksTemporal = (key: string) =>
        /date|visit|held/i.test(key) || /date|visit|held/i.test(columnLabel(key));
      let dateKeys = ["SubmissionDate", "B8"].filter(hasValue);
      if (dateKeys.length === 0 && rows.length > 0) {
        dateKeys = Object.keys(rows[0].values).filter((key) => looksTemporal(key) && hasValue(key));
      }
      for (const row of rows) {
        for (const key of dateKeys) {
          const day = valueOf(row.values[key]);
          if (day) {
            byDay.set(day, (byDay.get(day) ?? 0) + 1);
            break;
          }
        }
      }
      if (byDay.size === 0 && rows.length > 0) {
        const width = String(rows.length).length;
        rows.forEach((_, i) => {
          byDay.set(String(i + 1).padStart(width, "0"), 1);
        });
      }
      const days = [...byDay.keys()].sort();
      const points: SeriesPoint[] = days.map((day) => ({ name: day, value: byDay.get(day) ?? 0 }));
      timeLabels.push(...days);
      const isoDay = /^\d{4}-\d{2}-\d{2}$/;
      if (days.length > 1 && isoDay.test(days[0]) && isoDay.test(days[days.length - 1])) {
        stats.dateSpanDays = Math.round(
          (new Date(days[days.length - 1]).getTime() - new Date(days[0]).getTime()) / 86400000,
        );
      }
      stats.cardinality = days.length;
      stats.missingRate = rows.length ? 1 - days.length / rows.length : 1;
      stats.numericShape = "flat";
      return { points, samples, timeLabels, stats };
    }

    case "categorical":
    case "geospatial": {
      let points: SeriesPoint[];
      if (def.dimensionField && def.dimensionField !== "B2A") {
        const byDim = new Map<string, number>();
        for (const row of rows) {
          const key = String(row.values[def.dimensionField] ?? "(blank)");
          byDim.set(key, (byDim.get(key) ?? 0) + 1);
        }
        points = [...byDim.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
      } else if (def.dimensionField === "B2A") {
        const byDim = new Map<string, number>();
        for (const row of rows) {
          const key = String(row.values["B2A"] ?? "(blank)");
          byDim.set(key, (byDim.get(key) ?? 0) + 1);
        }
        points = [...byDim.entries()]
          .map(([name, value]) => ({ name, value }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
      } else {
        // Group option breakdown: count per exploded option column.
        const counts = new Map<string, number>();
        const root = def.valueField;
        for (const row of rows) {
          for (const code of Object.keys(row.values)) {
            if (!code.startsWith(`${root}_`)) continue;
            if (present(row, code)) counts.set(code, (counts.get(code) ?? 0) + 1);
          }
        }
        points = [...counts.entries()]
          .map(([code, value]) => ({ name: optionLabel(root, code), value }))
          .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
      }
      stats.cardinality = points.length;
      stats.missingRate = 0;
      stats.numericShape = "flat";
      return { points, samples, timeLabels, stats };
    }

    case "numeric":
    case "numeric-distribution": {
      const values: number[] = [];
      for (const row of rows) {
        const num = coerceNumber(row.values[def.valueField]);
        if (num !== null) values.push(num);
      }
      const total = rows.length;
      stats.missingRate = total ? 1 - values.length / total : 1;
      const unique = new Set(values).size;
      stats.cardinality = unique;
      if (values.length > 1) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const dev = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
        stats.numericShape = dev / (Math.abs(mean) + 1e-9) < 0.5 ? "flat" : "spread";
      }
      let value: number;
      if (def.aggregation === "sum") value = values.reduce((a, b) => a + b, 0);
      else if (def.aggregation === "avg") value = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
      else value = values.length;
      samples.push(...values);
      const points: SeriesPoint[] = [{ name: def.label, value }];
      return { points, samples, timeLabels, stats };
    }

    default:
      return { points: [], samples, timeLabels, stats };
  }
}

function optionLabel(root: string, code: string): string {
  return columnLabel(code) || code;
}

/* ---------------------------------- chart suggestions ---------------------------------- */

const KIND_LABEL: Record<ChartKind, string> = {
  "bar-vertical": "Bar chart",
  "bar-horizontal": "Horizontal bar",
  pie: "Pie chart",
  line: "Line chart",
  area: "Area chart",
  histogram: "Histogram",
  scatter: "Scatter",
  table: "Summary table",
  funnel: "Funnel chart",
  donut: "Donut chart",
  radar: "Radar chart",
  box: "Box plot",
  gauge: "Gauge",
  waffle: "Waffle chart",
  heatmap: "Heatmap",
  pareto: "Pareto chart",
  "grouped-bar": "Grouped bar",
  "stacked-100": "100% stacked bar",
};

/** Rule-based chart fit scoring (higher = better). */
export function suggestCharts(def: IndicatorDef, series: IndicatorSeries): ChartSuggestion[] {
  const suggestions: ChartSuggestion[] = [];
  const add = (kind: ChartKind, reason: string, score: number) => {
    suggestions.push({ kind, label: KIND_LABEL[kind], reason, score });
  };

  switch (def.dataType) {
    case "time-series":
      add("line", "Shows change over the observation period.", 95);
      add("area", "Emphasises totals over time.", 80);
      add("bar-vertical", "Compact alternative when few days.", series.stats.dateSpanDays < 15 ? 85 : 60);
      break;
    case "numeric-distribution":
      add("histogram", "Distribution of values across sessions.", 95);
      add("bar-vertical", "Simple frequency view.", 70);
      break;
    case "categorical": {
      const n = series.stats.cardinality;
      if (n <= 7) add("pie", "Few categories; shares are easy to read.", 90);
      add("bar-vertical", "Ranked category totals.", 88);
      add("bar-horizontal", "Long category labels fit horizontally.", n > 5 ? 80 : 60);
      break;
    }
    case "geospatial":
      add("bar-horizontal", "Ranked by place; ideal for district review.", 92);
      add("bar-vertical", "Compact alternative.", 70);
      break;
    case "numeric":
    default:
      if (def.aggregation === "sum" || def.aggregation === "avg") {
        add("table", "A single headline figure for the summary.", 95);
        add("bar-vertical", "Compare across the added dimension.", series.stats.cardinality > 1 ? 75 : 40);
      } else {
        add("bar-vertical", "Per-session numeric view.", 80);
      }
      break;
  }

  return suggestions.sort((a, b) => b.score - a.score);
}