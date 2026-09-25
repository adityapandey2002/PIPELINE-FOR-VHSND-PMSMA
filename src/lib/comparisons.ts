import type { CellValue } from "@/contracts/dataset";
import type { CleanRow } from "@/contracts/resolution";
import type { ChartKind } from "@/contracts/chart";
import type { IndicatorSeries, SeriesPoint } from "@/schema/indicators";

/* ---------------------------- standardisation ---------------------------- */
/** Standardise boolean-ish responses: "Yes"/"yes"/"1"/true → true, "No"/"0" → false. */
export function stdBool(v: CellValue | undefined | null): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v === 1 ? true : v === 0 ? false : null;
  const s = String(v).trim().toLowerCase();
  if (s === "") return null;
  if (["yes", "true", "1", "y", "t", "ticked", "tick", "checked", "\u2713", "x"].includes(s)) return true;
  if (["no", "false", "0", "n", "f", "not", "blank"].includes(s)) return false;
  return null;
}

/** Cast text-based numbers ("42", "3.5") to numeric types; unparseable → null. */
export function stdNum(v: CellValue | undefined | null): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "boolean") return v ? 1 : 0;
  const s = String(v).trim().replace(/,/g, "");
  if (s === "" || /^(no|yes|null|na|n\/a|-)$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* ---------------------------- row helpers ---------------------------- */

const round1 = (n: number) => Math.round(n * 10) / 10;

function hasColumn(rows: CleanRow[], code: string): boolean {
  return rows.some((r) => r.values[code] !== undefined);
}

function presentCodes(rows: CleanRow[], codes: string[]): { present: string[]; missing: string[] } {
  const present = codes.filter((c) => hasColumn(rows, c));
  return { present, missing: codes.filter((c) => !present.includes(c)) };
}

/** Count rows where the (standardised) column is True. */
export function countTrue(rows: CleanRow[], code: string): number {
  let n = 0;
  for (const r of rows) if (stdBool(r.values[code]) === true) n += 1;
  return n;
}

/** Percentage of rows where the column is True (0–100). */
export function pctTrue(rows: CleanRow[], code: string): number {
  if (rows.length === 0) return 0;
  return round1((countTrue(rows, code) / rows.length) * 100);
}

/** Sum of numeric column across rows (text numbers cast first). */
export function sumNum(rows: CleanRow[], code: string): number {
  let total = 0;
  for (const r of rows) {
    const n = stdNum(r.values[code]);
    if (n !== null) total += n;
  }
  return total;
}

function meanNum(rows: CleanRow[], code: string): number {
  const vals: number[] = [];
  for (const r of rows) {
    const n = stdNum(r.values[code]);
    if (n !== null) vals.push(n);
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
}

/** Mean % True across several columns (only columns actually in the file). */
function meanPctTrue(rows: CleanRow[], codes: string[]): number {
  const { present } = presentCodes(rows, codes);
  if (rows.length === 0 || present.length === 0) return 0;
  const total = present.reduce((acc, c) => acc + countTrue(rows, c), 0);
  return round1((total / (rows.length * present.length)) * 100);
}

function groupBy(rows: CleanRow[], dim: string): Map<string, CleanRow[]> {
  const out = new Map<string, CleanRow[]>();
  for (const r of rows) {
    const key = String(r.values[dim] ?? "").trim() || "(blank)";
    const bucket = out.get(key);
    if (bucket) bucket.push(r);
    else out.set(key, [r]);
  }
  return out;
}

function anyTrue(row: CleanRow, codes: string[]): boolean {
  return codes.some((c) => stdBool(row.values[c]) === true);
}

function quartiles(values: number[]): { min: number; q1: number; med: number; q3: number; max: number } | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const med = (arr: number[]) => {
    const m = Math.floor(arr.length / 2);
    return arr.length % 2 ? arr[m] : (arr[m - 1] + arr[m]) / 2;
  };
  const mid = Math.floor(s.length / 2);
  const lower = s.slice(0, mid);
  const upper = s.slice(s.length % 2 ? mid + 1 : mid);
  return {
    min: s[0],
    q1: lower.length ? med(lower) : s[0],
    med: med(s),
    q3: upper.length ? med(upper) : s[s.length - 1],
    max: s[s.length - 1],
  };
}

/* ---------------------------- result shapes ---------------------------- */

export interface ComparisonGroupRow {
  name: string;
  [key: string]: string | number;
}

export interface ComparisonSeriesKey {
  key: string;
  label: string;
}

export interface BoxStat {
  name: string;
  min: number;
  q1: number;
  med: number;
  q3: number;
  max: number;
  n: number;
}

export interface GaugeStat {
  name: string;
  value: number;
  display: string;
}

export interface WaffleStat {
  filled: number;
  total: number;
  filledLabel: string;
  restLabel: string;
}

export interface MatrixStat {
  rowTitle: string;
  colTitle: string;
  rows: string[];
  cols: string[];
  cells: number[][];
}

export interface ScatterStat {
  name: string;
  x: number;
  y: number;
}

export interface ComparisonExtra {
  groups?: ComparisonGroupRow[];
  seriesKeys?: ComparisonSeriesKey[];
  /** Group-tier per points[] index — colours bars by tier (e.g. Basic vs Advanced). */
  barGroups?: string[];
  boxes?: BoxStat[];
  gauges?: GaugeStat[];
  waffle?: WaffleStat;
  matrix?: MatrixStat;
  scatter?: ScatterStat[];
}

export interface ComparisonResult {
  kind: ChartKind;
  series: IndicatorSeries;
  extra?: ComparisonExtra;
  insight: string;
  columnsUsed: string[];
  columnsMissing: string[];
}

function mkSeries(points: SeriesPoint[], samples: number[] = []): IndicatorSeries {
  return {
    points,
    samples,
    timeLabels: [],
    stats: {
      cardinality: points.length,
      dateSpanDays: 0,
      missingRate: 0,
      numericShape: "flat",
    },
  };
}

function missingNote(missing: string[]): string {
  return missing.length ? ` Columns not in this file: ${missing.join(", ")}.` : "";
}

function mkResult(
  kind: ChartKind,
  points: SeriesPoint[],
  insight: string,
  extra?: ComparisonExtra,
  used: string[] = [],
  missing: string[] = [],
  samples: number[] = [],
): ComparisonResult {
  return {
    kind,
    series: mkSeries(points, samples),
    extra,
    insight: insight + missingNote(missing),
    columnsUsed: used,
    columnsMissing: missing,
  };
}

/** Biggest drop-off between consecutive funnel steps, as a sentence. */
function funnelInsight(steps: { name: string; value: number }[]): string {
  let worstIdx = -1;
  let worstDrop = 0;
  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1].value;
    const drop = prev - steps[i].value;
    if (prev > 0 && drop > worstDrop) {
      worstDrop = drop;
      worstIdx = i;
    }
  }
  if (worstIdx === -1) return "No drop-off detected across the cascade.";
  const prev = steps[worstIdx - 1];
  const cur = steps[worstIdx];
  const pctLost = Math.round((worstDrop / prev.value) * 100);
  return `Pinpoints drop-off: ${pctLost}% lost between "${prev.name}" (${prev.value}) and "${cur.name}" (${cur.value}) — ${cur.name.toLowerCase()} is the broken link.`;
}

/* ---------------------------- the 20 comparisons ---------------------------- */

export const COMPARISON_CATEGORIES = [
  "1 · Diagnostic Care Cascades",
  "2 · Service & Infrastructure Readiness",
  "3 · Consumables & Medicine Supply Chain",
  "4 · Beneficiary Counseling & Education",
  "5 · Digital Health & Administration",
  "6 · Vulnerable Demographics & Outcomes",
] as const;

export interface ComparisonDef {
  id: string;
  category: string;
  label: string;
  description: string;
  compute: (rows: CleanRow[]) => ComparisonResult;
}

export const COMPARISONS: ComparisonDef[] = [
  /* ------------------------- Category 1: Cascades ------------------------- */
  {
    id: "anemia-cascade",
    category: COMPARISON_CATEGORIES[0],
    label: "1. Anemia identification & communication cascade",
    description:
      "Funnel: Total sites → Hb kit working (G3_E) → samples taken (H1HB) → identified anemic (H1HB1) → told moderate/severe (H1HB_4). Shows exactly where anemia care breaks down.",
    compute: (rows) => {
      const codes = ["G3_E", "H1HB", "H1HB1", "H1HB_4"];
      const { present, missing } = presentCodes(rows, codes);
      const steps = [
        { name: "Total sites", value: rows.length },
        { name: "Step 1 · Hb kit working", value: countTrue(rows, "G3_E") },
        { name: "Step 2 · Blood samples taken", value: present.includes("H1HB") ? sumNum(rows, "H1HB") : 0 },
        { name: "Step 3 · Identified anemic", value: present.includes("H1HB1") ? sumNum(rows, "H1HB1") : 0 },
        { name: "Step 4 · Told moderate/severe", value: present.includes("H1HB_4") ? sumNum(rows, "H1HB_4") : 0 },
      ];
      return mkResult(
        "funnel",
        steps.map((s) => ({ name: s.name, value: s.value })),
        funnelInsight(steps),
        undefined,
        present,
        missing,
      );
    },
  },
  {
    id: "pih-cascade",
    category: COMPARISON_CATEGORIES[0],
    label: "2. Pregnancy induced hypertension (PIH) funnel",
    description:
      "Funnel: BP machine working (G3_C) → BP measured (H1BP) → high BP identified (H1BP1) → referred (H1PB2). Conversion rate of BP screening and referral linkage.",
    compute: (rows) => {
      const codes = ["G3_C", "H1BP", "H1BP1", "H1PB2"];
      const { present, missing } = presentCodes(rows, codes);
      const steps = [
        { name: "Total sites", value: rows.length },
        { name: "Step 1 · BP machine working", value: countTrue(rows, "G3_C") },
        { name: "Step 2 · BP measured", value: present.includes("H1BP") ? sumNum(rows, "H1BP") : 0 },
        { name: "Step 3 · High BP identified", value: present.includes("H1BP1") ? sumNum(rows, "H1BP1") : 0 },
        { name: "Step 4 · Referred", value: present.includes("H1PB2") ? sumNum(rows, "H1PB2") : 0 },
      ];
      const conversion =
        steps[1].value > 0 ? Math.round((steps[2].value / steps[1].value) * 100) : 0;
      return mkResult(
        "funnel",
        steps.map((s) => ({ name: s.name, value: s.value })),
        `Screening conversion (measured / machine working): ${conversion}%. ${funnelInsight(steps)}`,
        undefined,
        present,
        missing,
      );
    },
  },
  {
    id: "gdm-bottleneck",
    category: COMPARISON_CATEGORIES[0],
    label: "3. GDM (diabetes) execution bottleneck by block",
    description:
      "Grouped by Block (B2A): sites with working glucometer (G3_F) vs sites where a sugar test was actually conducted (H1_F), with tested/equipment ratio.",
    compute: (rows) => {
      const codes = ["B2A", "G3_F", "H1_F"];
      const { present, missing } = presentCodes(rows, codes);
      const groups: ComparisonGroupRow[] = [];
      if (present.includes("B2A")) {
        for (const [name, bucket] of groupBy(rows, "B2A")) {
          const equipment = countTrue(bucket, "G3_F");
          const tested = countTrue(bucket, "H1_F");
          groups.push({ name, equipment, tested });
        }
        groups.sort((a, b) => Number(b.equipment) - Number(a.equipment) || a.name.localeCompare(b.name));
      }
      const totalEquip = groups.reduce((a, g) => a + (g.equipment as number), 0);
      const totalTested = groups.reduce((a, g) => a + (g.tested as number), 0);
      const ratio = totalEquip > 0 ? Math.round((totalTested / totalEquip) * 100) : 0;
      const idle = totalEquip - totalTested;
      return mkResult(
        "grouped-bar",
        groups.map((g) => ({ name: g.name, value: g.equipment as number })),
        `District-wide execution ratio (tested / equipment available): ${ratio}%. Equipment idle at ${Math.max(idle, 0)} site(s) where the glucometer works but no sugar test was delivered.`,
        {
          groups,
          seriesKeys: [
            { key: "equipment", label: "Glucometer working (G3_F)" },
            { key: "tested", label: "Sugar test done (H1_F)" },
          ],
        },
        present,
        missing,
      );
    },
  },

  /* ------------------- Category 2: Service & readiness ------------------- */
  {
    id: "anc-pnc-bias",
    category: COMPARISON_CATEGORIES[1],
    label: "4. ANC vs PNC service bias",
    description:
      "Average % True of ANC tests (H1_A–H1_F) vs PNC tests (H3_A–H3_D) — proves institutional bias towards pregnant women over lactating mothers.",
    compute: (rows) => {
      const anc = ["H1_A", "H1_B", "H1_C", "H1_D", "H1_E", "H1_F"];
      const pnc = ["H3_A", "H3_B", "H3_C", "H3_D"];
      const all = [...anc, ...pnc];
      const { present, missing } = presentCodes(rows, all);
      const ancPct = meanPctTrue(rows, anc);
      const pncPct = meanPctTrue(rows, pnc);
      const points = [
        { name: "ANC average (%)", value: ancPct },
        { name: "PNC average (%)", value: pncPct },
      ];
      const gap = round1(ancPct - pncPct);
      const verdict =
        gap > 10
          ? `Institutional bias confirmed: ANC services average ${ancPct}% vs PNC only ${pncPct}% — a ${gap}-point gap favouring pregnant women over lactating mothers.`
          : gap < -10
          ? `PNC outperforms ANC by ${Math.abs(gap)} points (${pncPct}% vs ${ancPct}%).`
          : `Balanced: ANC ${ancPct}% vs PNC ${pncPct}% (gap ${gap} points).`;
      return mkResult("grouped-bar", points, verdict, {
        groups: [
          { name: "ANC average (%)", value: ancPct },
          { name: "PNC average (%)", value: pncPct },
        ],
        seriesKeys: [{ key: "value", label: "% True" }],
        barGroups: ["ANC", "PNC"],
      }, present, missing);
    },
  },
  {
    id: "basic-vs-advanced",
    category: COMPARISON_CATEGORIES[1],
    label: "5. Basic vs advanced diagnostics drop-off",
    description:
      "% True per test: weight & BP (Basic Vitals) vs Hb, urine, sugar (Advanced Diagnostics), sorted descending.",
    compute: (rows) => {
      const tests: { code: string; tier: string }[] = [
        { code: "H1_A", tier: "Basic Vitals" },
        { code: "H1_C", tier: "Basic Vitals" },
        { code: "H1_D", tier: "Advanced Diagnostics" },
        { code: "H1_E", tier: "Advanced Diagnostics" },
        { code: "H1_F", tier: "Advanced Diagnostics" },
      ];
      const { present, missing } = presentCodes(rows, tests.map((t) => t.code));
      const points = tests
        .map((t) => ({ name: `${columnShort(t.code)} (${t.code})`, code: t.code, tier: t.tier, value: pctTrue(rows, t.code) }))
        .sort((a, b) => b.value - a.value);
      const basic = meanPctTrue(rows, ["H1_A", "H1_C"]);
      const advanced = meanPctTrue(rows, ["H1_D", "H1_E", "H1_F"]);
      return mkResult(
        "bar-horizontal",
        points.map((p) => ({ name: p.name, value: p.value })),
        `Basic vitals average ${basic}% vs advanced diagnostics ${advanced}% — checkups ${
          basic - advanced > 15 ? "are mostly superficial rather than comprehensive" : "are reasonably comprehensive"
        }.`,
        {
          barGroups: points.map((p) => p.tier),
          seriesKeys: [
            { key: "Basic Vitals", label: "Basic Vitals" },
            { key: "Advanced Diagnostics", label: "Advanced Diagnostics" },
          ],
        },
        present,
        missing,
      );
    },
  },
  {
    id: "venue-privacy-hygiene",
    category: COMPARISON_CATEGORIES[1],
    label: "6. Privacy & hygiene by venue type",
    description:
      "Grouped by Venue Type (B7): % True for privacy (G21) and soap/water (G24) within each venue — 100% stacked bars.",
    compute: (rows) => {
      const codes = ["B7", "G21", "G24"];
      const { present, missing } = presentCodes(rows, codes);
      const groups: ComparisonGroupRow[] = [];
      if (present.includes("B7")) {
        for (const [name, bucket] of groupBy(rows, "B7")) {
          const privacyPct = pctTrue(bucket, "G21");
          const hygienePct = pctTrue(bucket, "G24");
          groups.push({ name: `${name} · Privacy`, ok: privacyPct, notOk: round1(100 - privacyPct) });
          groups.push({ name: `${name} · Soap & water`, ok: hygienePct, notOk: round1(100 - hygienePct) });
        }
      } else {
        const privacyPct = pctTrue(rows, "G21");
        const hygienePct = pctTrue(rows, "G24");
        groups.push({ name: "All venues · Privacy", ok: privacyPct, notOk: round1(100 - privacyPct) });
        groups.push({ name: "All venues · Soap & water", ok: hygienePct, notOk: round1(100 - hygienePct) });
      }
      const privacyAll = pctTrue(rows, "G21");
      const hygieneAll = pctTrue(rows, "G24");
      const venues = present.includes("B7") ? [...groupBy(rows, "B7").keys()] : ["all venues"];
      return mkResult(
        "stacked-100",
        groups.map((g) => ({ name: g.name, value: g.ok as number })),
        `Across ${venues.length} venue type(s): privacy available at ${privacyAll}% of sites and soap/water at ${hygieneAll}% — ${
          hygieneAll < privacyAll ? "hygiene lags behind privacy" : "the two are comparable"
        }. AWC vs Sub-centre split is shown per bar.`,
        {
          groups,
          seriesKeys: [
            { key: "ok", label: "Available (%)" },
            { key: "notOk", label: "Missing (%)" },
          ],
        },
        present,
        missing,
      );
    },
  },
  {
    id: "anm-safety-hygiene",
    category: COMPARISON_CATEGORIES[1],
    label: "7. ANM safety & hygiene compliance",
    description:
      "% True for hub cutter (H18), time on vials (H20), and BCG/MR within 4 hrs (H21) — biomedical waste and immunisation safety hazards.",
    compute: (rows) => {
      const codes = ["H18", "H20", "H21"];
      const { present, missing } = presentCodes(rows, codes);
      const points = [
        { name: `Hub cutter (${columnShort("H18")})`, value: pctTrue(rows, "H18") },
        { name: `Time on vials (${columnShort("H20")})`, value: pctTrue(rows, "H20") },
        { name: `BCG/MR within 4 hrs (${columnShort("H21")})`, value: pctTrue(rows, "H21") },
      ];
      const worst = [...points].sort((a, b) => a.value - b.value)[0];
      return mkResult(
        "bar-horizontal",
        points,
        `Lowest compliance: "${worst.name}" at ${worst.value}% — critical biomedical-waste / immunisation safety gap.`,
        undefined,
        present,
        missing,
      );
    },
  },

  /* ------------------- Category 3: Supply chain ------------------- */
  {
    id: "urine-crosstab",
    category: COMPARISON_CATEGORIES[2],
    label: "8. Consumable supply vs service execution",
    description:
      "Cross-tab of urinestrip available (G12_M) vs urine test conducted (H1_E). Separates supply-chain failure from health-worker negligence.",
    compute: (rows) => {
      const codes = ["G12_M", "H1_E"];
      const { present, missing } = presentCodes(rows, codes);
      const rowLabels = ["Supply = Yes", "Supply = No", "Supply = unknown"];
      const colLabels = ["Test done = Yes", "Test done = No", "Test = unknown"];
      const cells = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ];
      const idx = (b: boolean | null) => (b === null ? 2 : b ? 0 : 1);
      for (const r of rows) {
        cells[idx(stdBool(r.values["G12_M"]))][idx(stdBool(r.values["H1_E"]))] += 1;
      }
      const idleSupply = cells[0][1];
      const supplied = cells[0][0] + cells[0][1];
      const points = [
        { name: "Supply exists, test done", value: cells[0][0] },
        { name: "Supply exists, test NOT done", value: cells[0][1] },
        { name: "No supply, test done", value: cells[1][0] },
        { name: "No supply, test NOT done", value: cells[1][1] },
      ];
      return mkResult(
        "heatmap",
        points,
        `Supply exists but behaviour failed at ${idleSupply} site(s) of ${supplied} with stock — ${
          supplied > 0 && idleSupply / supplied > 0.4
            ? "this is primarily a health-worker execution problem, not a supply problem"
            : "supply and execution are broadly aligned"
        }.`,
        {
          matrix: { rowTitle: "G12_M · Urinestrip", colTitle: "H1_E · Urine test", rows: rowLabels, cols: colLabels, cells },
        },
        present,
        missing,
      );
    },
  },
  {
    id: "ifa-distribution",
    category: COMPARISON_CATEGORIES[2],
    label: "9. Target-specific IFA distribution",
    description:
      "Box-and-whisker of IFA pills dispensed: to PW (H5_1_1), to LM (H5_2_1), blue pills to adolescents (H6_1_1). Outliers >180 pills filtered.",
    compute: (rows) => {
      const codes = ["H5_1_1", "H5_2_1", "H6_1_1"];
      const { present, missing } = presentCodes(rows, codes);
      const names: Record<string, string> = {
        H5_1_1: "IFA to pregnant women",
        H5_2_1: "IFA to lactating mothers",
        H6_1_1: "Blue pills to adolescents",
      };
      const boxes: BoxStat[] = [];
      const samples: number[] = [];
      for (const code of codes) {
        const vals: number[] = [];
        for (const r of rows) {
          const n = stdNum(r.values[code]);
          if (n !== null && n >= 0 && n <= 180) vals.push(n);
        }
        samples.push(...vals);
        const q = quartiles(vals);
        if (q) boxes.push({ name: `${names[code]} (${code})`, ...q, n: vals.length });
      }
      const spread = boxes.map((b) => `${b.name.split(" (")[0]}: median ${b.med}`).join("; ");
      return mkResult(
        "box",
        boxes.map((b) => ({ name: b.name, value: b.med })),
        boxes.length
          ? `Medians (outliers >180 filtered): ${spread}. Consistent medians suggest standardised dosing; widely different spreads suggest random quantities.`
          : "No numeric IFA dispensing data available (columns missing or all non-numeric).",
        { boxes },
        present,
        missing,
        samples,
      );
    },
  },
  {
    id: "fp-supply-vs-counsel",
    category: COMPARISON_CATEGORIES[2],
    label: "10. Family planning: commodities vs counseling",
    description:
      "Has_FP_Supply = ANY of G12_J/K/L/O true; compared with % counseled on FP (H12B). Are FP tools sitting in boxes without counseling?",
    compute: (rows) => {
      const supplyCodes = ["G12_J", "G12_K", "G12_L", "G12_O"];
      const all = [...supplyCodes, "H12B"];
      const { present, missing } = presentCodes(rows, all);
      let withSupply = 0;
      for (const r of rows) if (anyTrue(r, supplyCodes)) withSupply += 1;
      const supplyPct = rows.length ? round1((withSupply / rows.length) * 100) : 0;
      const counselPct = pctTrue(rows, "H12B");
      const points = [
        { name: "FP commodities available", value: supplyPct },
        { name: "FP counseling done", value: counselPct },
      ];
      const gap = round1(supplyPct - counselPct);
      return mkResult(
        "gauge",
        points,
        `Commodities available at ${supplyPct}% of sites but counseling done at only ${counselPct}% — ${
          gap > 10 ? `${gap}-point gap: family-planning tools are sitting in boxes without patient counseling.` : "supply and counseling are aligned."
        }`,
        {
          gauges: [
            { name: "FP commodities available", value: supplyPct, display: `${supplyPct}%` },
            { name: "FP counseling done", value: counselPct, display: `${counselPct}%` },
          ],
        },
        present,
        missing,
      );
    },
  },

  /* ------------------- Category 4: Counseling ------------------- */
  {
    id: "prenatal-counseling",
    category: COMPARISON_CATEGORIES[3],
    label: "11. Prenatal counseling priorities",
    description:
      "% True for each counseling topic (H2_A–H2_G), sorted descending with a cumulative Pareto line. Highlights systematically skipped topics like danger signs (H2_E).",
    compute: (rows) => {
      const codes = ["H2_A", "H2_B", "H2_C", "H2_D", "H2_E", "H2_F", "H2_G"];
      const { present, missing } = presentCodes(rows, codes);
      const items = codes
        .map((c) => ({ code: c, name: columnShort(c), value: pctTrue(rows, c) }))
        .sort((a, b) => b.value - a.value);
      const sum = items.reduce((a, i) => a + i.value, 0);
      let running = 0;
      const groups: ComparisonGroupRow[] = items.map((i) => {
        running += i.value;
        return { name: `${i.name} (${i.code})`, value: i.value, cum: sum > 0 ? round1((running / sum) * 100) : 0 };
      });
      const danger = items.find((i) => i.code === "H2_E");
      const skipped = items.filter((i) => i.value < 50).map((i) => i.name);
      return mkResult(
        "pareto",
        items.map((i) => ({ name: i.name, value: i.value })),
        `${skipped.length ? `Topics below 50% coverage: ${skipped.join(", ")}. ` : "All topics above 50% coverage. "}Danger signs counseling (H2_E) at ${
          danger ? danger.value : 0
        }% ${danger && danger.value < 50 ? "— systematically skipped by ANMs." : "— adequately covered."}`,
        { groups, seriesKeys: [{ key: "value", label: "% True" }, { key: "cum", label: "Cumulative %" }] },
        present,
        missing,
      );
    },
  },
  {
    id: "pnc-neglect",
    category: COMPARISON_CATEGORIES[3],
    label: "12. Postnatal care (PNC) neglect",
    description:
      "Among mothers who attended PNC (H3A > 0): % who left without a PNC check (H3_99) or counseling (H4_99). Donut: cared vs ignored.",
    compute: (rows) => {
      const codes = ["H3A", "H3_99", "H4_99"];
      const { present, missing } = presentCodes(rows, codes);
      const attended = present.includes("H3A") ? rows.filter((r) => (stdNum(r.values["H3A"]) ?? 0) > 0) : rows;
      const basis = present.includes("H3A") ? attended : rows;
      let ignored = 0;
      for (const r of basis) {
        if (stdBool(r.values["H3_99"]) === true || stdBool(r.values["H4_99"]) === true) ignored += 1;
      }
      const cared = Math.max(basis.length - ignored, 0);
      const ignorePct = basis.length ? round1((ignored / basis.length) * 100) : 0;
      const points = [
        { name: "Received actual PNC care", value: cared },
        { name: "Attended but ignored", value: ignored },
      ];
      return mkResult(
        "donut",
        points,
        `${basis.length} mother(s) in scope${present.includes("H3A") ? " (attended PNC)" : ""}; ${ignored} (${ignorePct}%) left without a PNC check or counseling — ${
          ignorePct > 30 ? "attending lactating mothers are largely leaving without actual care." : "most received actual care."
        }`,
        undefined,
        present,
        missing,
      );
    },
  },

  /* ------------------- Category 5: Digital health ------------------- */
  {
    id: "register-reality",
    category: COMPARISON_CATEGORIES[4],
    label: '13. The "rough register" reality',
    description: "True counts per register type: RCH (H32_A), Rough (H32_B), Other (H32_88). Pie chart of reliance on paper.",
    compute: (rows) => {
      const codes = ["H32_A", "H32_B", "H32_88"];
      const { present, missing } = presentCodes(rows, codes);
      const points = [
        { name: `RCH register (${columnShort("H32_A")})`, value: countTrue(rows, "H32_A") },
        { name: `Rough register (${columnShort("H32_B")})`, value: countTrue(rows, "H32_B") },
        { name: `Other (${columnShort("H32_88")})`, value: countTrue(rows, "H32_88") },
      ];
      const total = points.reduce((a, p) => a + p.value, 0);
      const roughPct = total > 0 ? Math.round((points[1].value / total) * 100) : 0;
      return mkResult(
        "pie",
        points,
        `Rough/unstandardised registers account for ${roughPct}% of register usage${roughPct > 30 ? " — heavy reliance on unstandardised paper notebooks despite digital health pushes." : " — RCH registers dominate."}`,
        undefined,
        present,
        missing,
      );
    },
  },
  {
    id: "asha-digital-by-block",
    category: COMPARISON_CATEGORIES[4],
    label: "14. ASHA digital updation by block",
    description: "Grouped by Block (B2A): % True of ASHA1 (using m-ASHA app), sorted by %.",
    compute: (rows) => {
      const codes = ["B2A", "ASHA1"];
      const { present, missing } = presentCodes(rows, codes);
      const groups: ComparisonGroupRow[] = [];
      if (present.includes("B2A")) {
        for (const [name, bucket] of groupBy(rows, "B2A")) {
          groups.push({ name, value: pctTrue(bucket, "ASHA1") });
        }
        groups.sort((a, b) => (b.value as number) - (a.value as number) || a.name.localeCompare(b.name));
      } else {
        groups.push({ name: "All blocks", value: pctTrue(rows, "ASHA1") });
      }
      const low = groups.filter((g) => (g.value as number) < 50).map((g) => g.name);
      const overall = pctTrue(rows, "ASHA1");
      return mkResult(
        "bar-vertical",
        groups.map((g) => ({ name: g.name, value: g.value as number })),
        `Overall m-ASHA adoption: ${overall}%. ${low.length ? `Blocks actively rejecting the m-ASHA digital workflow (<50%): ${low.join(", ")}.` : "No block below 50% adoption."}`,
        { groups },
        present,
        missing,
      );
    },
  },
  {
    id: "teleconsult-supervision",
    category: COMPARISON_CATEGORIES[4],
    label: "15. Teleconsultation vs supervisory presence",
    description: 'Grouped by supervisor type (C11_1, missing → "No Supervisor"): mean teleconsultations conducted (H25).',
    compute: (rows) => {
      const codes = ["C11_1", "H25"];
      const { present, missing } = presentCodes(rows, codes);
      const groups: ComparisonGroupRow[] = [];
      if (present.includes("C11_1")) {
        for (const [name, bucket] of groupBy(rows, "C11_1")) {
          groups.push({ name: name === "(blank)" ? "No Supervisor" : name, value: round1(meanNum(bucket, "H25")) });
        }
        groups.sort((a, b) => (b.value as number) - (a.value as number));
      } else {
        groups.push({ name: "All sessions", value: round1(meanNum(rows, "H25")) });
      }
      const withSup = groups.filter((g) => !/no supervisor/i.test(g.name));
      const without = groups.find((g) => /no supervisor/i.test(g.name));
      const comparison =
        withSup.length && without
          ? `Mean teleconsults with a supervisor present: ${round1(
              withSup.reduce((a, g) => a + (g.value as number), 0) / withSup.length,
            )} vs ${without.value} when none is present — ${
              (without.value as number) < withSup.reduce((a, g) => a + (g.value as number), 0) / withSup.length
                ? "telemedicine appears enforced mainly by physical supervisory presence."
                : "teleconsultation continues without supervisory pressure."
            }`
          : "No supervisor-type breakdown available in this file.";
      return mkResult("bar-vertical", groups.map((g) => ({ name: g.name, value: g.value as number })), comparison, { groups }, present, missing);
    },
  },
  {
    id: "mcp-gap",
    category: COMPARISON_CATEGORIES[4],
    label: "16. MCP card completeness vs reality",
    description:
      "Services_Done = count of True in H1_A–H1_F per row; scatter of services done vs maintained in MCP (H16). Flags care given but not recorded.",
    compute: (rows) => {
      const svc = ["H1_A", "H1_B", "H1_C", "H1_D", "H1_E", "H1_F"];
      const all = [...svc, "H16"];
      const { present, missing } = presentCodes(rows, all);
      const scatter: ScatterStat[] = [];
      let gapCount = 0;
      let i = 0;
      for (const r of rows) {
        const done = svc.filter((c) => stdBool(r.values[c]) === true).length;
        const inMcp = stdBool(r.values["H16"]);
        i += 1;
        if (done > 3 && inMcp === false) gapCount += 1;
        if (present.includes("H16")) scatter.push({ name: `Site ${i}`, x: done, y: inMcp === null ? -1 : inMcp ? 1 : 0 });
      }
      const points = [
        { name: "Services done but not in MCP", value: gapCount },
        { name: "Sites with >3 services", value: scatter.filter((s) => s.x > 3).length },
      ];
      return mkResult(
        "scatter",
        points,
        `${gapCount} site(s) delivered more than 3 services yet the MCP card says otherwise — data-tracking failure where care is given but not recorded. Y axis: 1 = maintained in MCP, 0 = not maintained, −1 = unknown.`,
        { scatter },
        present,
        missing,
      );
    },
  },

  /* ------------------- Category 6: Vulnerable demographics ------------------- */
  {
    id: "teen-couple-attraction",
    category: COMPARISON_CATEGORIES[5],
    label: "17. Teenage & eligible couple attraction",
    description:
      "Flag sites where teens (E2_1) or couples (E2_2) are on the due list; among those, whether eligible couples were present (H9). Waffle chart.",
    compute: (rows) => {
      const codes = ["E2_1", "E2_2", "H9"];
      const { present, missing } = presentCodes(rows, codes);
      let flagged = 0;
      let presentCount = 0;
      for (const r of rows) {
        const teens = stdNum(r.values["E2_1"]) ?? 0;
        const couples = stdNum(r.values["E2_2"]) ?? 0;
        if (teens > 0 || couples > 0) {
          flagged += 1;
          if (stdBool(r.values["H9"]) === true) presentCount += 1;
        }
      }
      const attracted = flagged ? round1((presentCount / flagged) * 100) : 0;
      const points = [
        { name: "Due-list couples/teens present (H9 Yes)", value: presentCount },
        { name: "Due list exists but couples absent", value: Math.max(flagged - presentCount, 0) },
      ];
      return mkResult(
        "waffle",
        points,
        `${flagged} site(s) had teens/eligible couples on the due list; couples actually present at ${attracted}% of them — ${
          attracted < 50 ? "VHSNDs are not successfully attracting at-risk youth and newly married couples." : "VHSNDs are attracting the target groups."
        }`,
        {
          waffle: { filled: presentCount, total: flagged, filledLabel: "Couples present", restLabel: "Couples absent" },
        },
        present,
        missing,
      );
    },
  },
  {
    id: "danger-sign-gap",
    category: COMPARISON_CATEGORIES[5],
    label: "18. Danger sign identification gap",
    description: "% True for women danger signs identified (H14) vs children danger signs (H15) — ANM clinical competency.",
    compute: (rows) => {
      const codes = ["H14", "H15"];
      const { present, missing } = presentCodes(rows, codes);
      const women = pctTrue(rows, "H14");
      const children = pctTrue(rows, "H15");
      const points = [
        { name: `Women danger signs (${columnShort("H14")})`, value: women },
        { name: `Children danger signs (${columnShort("H15")})`, value: children },
      ];
      const worst = Math.min(women, children);
      return mkResult(
        "bar-vertical",
        points,
        `Women: ${women}%, Children: ${children}%. ${
          worst < 50 ? "Below 50% on at least one stream — ANMs are spotting complications only sporadically, not as routine practice." : "Both streams above 50% — solid clinical vigilance."
        }`,
        { barGroups: ["Women", "Children"] },
        present,
        missing,
      );
    },
  },
  {
    id: "anc-dropout-gauge",
    category: COMPARISON_CATEGORIES[5],
    label: "19. Early vs late ANC drop-out rate",
    description: "Gauge: Sum(E2_5) [women due for 3rd/4th ANC] / Sum(H1BP) [total attendance proxy] × 100.",
    compute: (rows) => {
      const codes = ["E2_5", "H1BP"];
      const { present, missing } = presentCodes(rows, codes);
      const due = present.includes("E2_5") ? sumNum(rows, "E2_5") : 0;
      const total = present.includes("H1BP") ? sumNum(rows, "H1BP") : 0;
      const ratio = total > 0 ? round1((due / total) * 100) : 0;
      const points = [{ name: "3rd/4th ANC attendance ratio", value: ratio }];
      return mkResult(
        "gauge",
        points,
        `${due} women due for 3rd/4th ANC vs ${total} total attendance → ${ratio}%. ${
          ratio < 40 && total > 0
            ? "High total attendance but low late-ANC attendance — pregnant women drop out of the system late in pregnancy."
            : "Late-ANC attendance is healthy relative to total attendance."
        }`,
        {
          gauges: [{ name: "3rd/4th ANC attendance vs total", value: Math.min(ratio, 100), display: `${ratio}%` }],
        },
        present,
        missing,
      );
    },
  },
  {
    id: "block-scorecard",
    category: COMPARISON_CATEGORIES[5],
    label: "20. Block-level performance scorecard (radar)",
    description:
      "Grouped by Block (B2A): Equipment (G3_C/E/F), Diagnostics (H1_D/E/F), Counseling (H2_A–G, H4_A–H), Hygiene (H18/H20/H21) — four-axis radar per block.",
    compute: (rows) => {
      const equip = ["G3_C", "G3_E", "G3_F"];
      const diag = ["H1_D", "H1_E", "H1_F"];
      const counsel = ["H2_A", "H2_B", "H2_C", "H2_D", "H2_E", "H2_F", "H2_G", "H4_A", "H4_B", "H4_C", "H4_D", "H4_E", "H4_F", "H4_G", "H4_H"];
      const hygiene = ["H18", "H20", "H21"];
      const allCodes = [...equip, ...diag, ...counsel, ...hygiene, "B2A"];
      const { present, missing } = presentCodes(rows, allCodes);

      const dims = [
        { label: "Equipment", codes: equip },
        { label: "Diagnostics", codes: diag },
        { label: "Counseling", codes: counsel },
        { label: "Hygiene", codes: hygiene },
      ];

      const blocks = present.includes("B2A")
        ? [...groupBy(rows, "B2A").entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .slice(0, 6)
        : [["All blocks", rows] as [string, CleanRow[]]];

      const topBlocks = blocks.map(([name]) => name);
      const groups: ComparisonGroupRow[] = dims.map((d) => {
        const row: ComparisonGroupRow = { name: d.label };
        for (const [blockName, bucket] of blocks) row[blockName] = meanPctTrue(bucket, d.codes);
        return row;
      });
      const seriesKeys = topBlocks.map((b) => ({ key: b, label: b }));

      const overall: ComparisonGroupRow = { name: "District" };
      for (const d of dims) overall[d.label] = meanPctTrue(rows, d.codes);
      const scores = dims.map((d) => ({ name: d.label, value: meanPctTrue(rows, d.codes) }));
      const worst = [...scores].sort((a, b) => a.value - b.value)[0];

      return mkResult(
        "radar",
        scores,
        `District axes — ${scores.map((s) => `${s.name} ${s.value}%`).join(", ")}. Weakest axis: ${worst.name} at ${worst.value}% — ${
          worst.name === "Equipment" ? "logistics" : worst.name === "Diagnostics" ? "clinical execution" : worst.name === "Counseling" ? "beneficiary education" : "safety/hygiene"
        } is where blocks are failing. Top ${blocks.length} block(s) by session count shown on separate radar layers.`,
        { groups, seriesKeys },
        present,
        missing,
      );
    },
  },
];

/* Short display labels for bare codes (fall back to the code itself). */
function columnShort(code: string): string {
  const map: Record<string, string> = {
    H1_A: "Weight", H1_C: "BP", H1_D: "Hb", H1_E: "Urine", H1_F: "Sugar",
    H18: "Hub cutter", H20: "Time on vials", H21: "BCG/MR in 4 hrs",
    H14: "Women danger signs", H15: "Children danger signs",
    H2_A: "Prenatal checkups", H2_B: "Tetanus vaccination", H2_C: "IFA", H2_D: "Calcium",
    H2_E: "Danger signs", H2_F: "Preparing for childbirth", H2_G: "Nutrition supplements",
    H32_A: "RCH", H32_B: "Rough", H32_88: "Other",
  };
  return map[code] ?? code;
}
