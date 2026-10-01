import { describe, expect, it } from "vitest";
import type { CleanRow } from "@/contracts/resolution";
import { evaluateIndicator, suggestCharts, VHSND_INDICATORS } from "@/schema/indicators";
import { getDatasetSchema } from "@/schema";

function clean(values: Record<string, unknown>): CleanRow {
  return { rowId: "r", values: values as Record<string, string | number | boolean | null> };
}

describe("evaluateIndicator", () => {
  it("sums numeric columns", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "anemia-screened")!;
    const series = evaluateIndicator([clean({ H1HB: 3 }), clean({ H1HB: 4 })], def);
    expect(series.points[0].value).toBe(7);
    expect(series.points[0].detail).toBe("2 of 2 rows with a value");
  });

  it("counts Yes for boolean indicators instead of treating booleans as missing", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "asha-survey")!;
    const series = evaluateIndicator(
      [clean({ ASHA1: true }), clean({ ASHA1: false }), clean({ ASHA1: true }), clean({ ASHA1: null })],
      def,
    );
    expect(series.points[0].value).toBe(2);
    expect(series.points[0].detail).toBe("2 Yes of 3 answered");
    expect(series.stats.missingRate).toBeCloseTo(0.25, 5);
  });

  it("does not report a fully answered boolean column as 100% missing", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "anm-mgmt")!;
    const series = evaluateIndicator([clean({ ANM1: true }), clean({ ANM1: false })], def);
    expect(series.points[0].value).toBe(1);
    expect(series.stats.missingRate).toBe(0);
    expect(series.stats.missingRate).toBeLessThan(1);
  });

  it("counts group options from exploded columns", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "workers")!;
    const rows = [
      clean({ C4_A: 1, C4_B: 0, C4_C: 1 }),
      clean({ C4_A: 0, C4_B: 1 }),
    ];
    const series = evaluateIndicator(rows, def);
    const byName = new Map(series.points.map((p) => [p.name, p.value]));
    expect(byName.get("ANM(1)")).toBe(1);
    expect(byName.get("ANM(2)")).toBe(1);
    expect(byName.get("Hope")).toBe(1);
  });

  it("groups sessions by day for time-series", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "sessions")!;
    const rows = [
      clean({ SubmissionDate: "2024-01-15" }),
      clean({ SubmissionDate: "2024-01-15" }),
      clean({ SubmissionDate: "2024-01-16" }),
    ];
    const series = evaluateIndicator(rows, def);
    expect(series.points).toEqual([
      { name: "2024-01-15", value: 2, detail: "2 of 3 rows" },
      { name: "2024-01-16", value: 1, detail: "1 of 3 rows" },
    ]);
  });

  it("reports distribution samples for numeric-distribution", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "bp-systolic")!;
    const series = evaluateIndicator([clean({ H1BP: 1 }), clean({ H1BP: 2 }), clean({ H1BP: 3 })], def);
    expect(series.samples.sort()).toEqual([1, 2, 3]);
  });
});

describe("indicator value fields are aggregable", () => {
  const schema = getDatasetSchema("2026.1", "vhsnd");
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const AGGREGABLE = ["integer", "number", "ordinal"];

  it("never sums a boolean, date, time, text, choice or group field", () => {
    const offenders = VHSND_INDICATORS.filter((i) => i.aggregation === "sum")
      .map((i) => ({ id: i.id, valueField: i.valueField, type: byId.get(i.valueField)?.type }))
      .filter((x) => x.type !== undefined && !AGGREGABLE.includes(x.type));
    expect(offenders).toEqual([]);
  });

  it("counts PNC attendance via the H3A_1 count, not the H3A flag", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "pnc-lactating")!;
    expect(byId.get("H3A")!.type).toBe("boolean");
    expect(def.valueField).toBe("H3A_1");
    const series = evaluateIndicator([clean({ H3A: true, H3A_1: 4 }), clean({ H3A: false, H3A_1: 0 })], def);
    expect(series.points[0].value).toBe(4);
  });

  it("reads every boolean valueField as a count of Yes, never 100% missing", () => {
    const booleanFields = VHSND_INDICATORS.filter(
      (i) => i.dataType === "numeric" && byId.get(i.valueField)?.type === "boolean",
    );
    expect(booleanFields.length).toBeGreaterThan(0);
    for (const def of booleanFields) {
      const rows = [clean({ [def.valueField]: true }), clean({ [def.valueField]: false })];
      const series = evaluateIndicator(rows, def);
      expect(series.points[0].value).toBe(1);
      expect(series.stats.missingRate).toBe(0);
    }
  });
});

describe("suggestCharts", () => {
  it("recommends a line chart for time-series", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "sessions")!;
    const series = evaluateIndicator(
      [clean({ SubmissionDate: "2024-01-15" }), clean({ SubmissionDate: "2024-01-16" })],
      def,
    );
    const top = suggestCharts(def, series)[0];
    expect(top.kind).toBe("line");
  });

  it("matches cardinality rules for categorical data", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "workers")!;
    const series = evaluateIndicator([clean({ C4_A: 1 }), clean({ C4_B: 1 })], def);
    const suggestions = suggestCharts(def, series);
    expect(suggestions.some((s) => s.kind === "pie")).toBe(true);
  });

  it("recommends a histogram for distributions", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "bp-systolic")!;
    const series = evaluateIndicator(
      Array.from({ length: 20 }, (_, i) => clean({ H1BP: i + 1 })),
      def,
    );
    const top = suggestCharts(def, series)[0];
    expect(top.kind).toBe("histogram");
  });
});