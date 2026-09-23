import { describe, expect, it } from "vitest";
import type { CleanRow } from "@/contracts/resolution";
import { evaluateIndicator, suggestCharts, VHSND_INDICATORS } from "@/schema/indicators";

function clean(values: Record<string, unknown>): CleanRow {
  return { rowId: "r", values: values as Record<string, string | number | boolean | null> };
}

describe("evaluateIndicator", () => {
  it("sums numeric columns", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "anemia-screened")!;
    const series = evaluateIndicator([clean({ H1HB: 3 }), clean({ H1HB: 4 })], def);
    expect(series.points).toEqual([{ name: def.label, value: 7 }]);
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
      { name: "2024-01-15", value: 2 },
      { name: "2024-01-16", value: 1 },
    ]);
  });

  it("reports distribution samples for numeric-distribution", () => {
    const def = VHSND_INDICATORS.find((i) => i.id === "bp-systolic")!;
    const series = evaluateIndicator([clean({ H1BP: 1 }), clean({ H1BP: 2 }), clean({ H1BP: 3 })], def);
    expect(series.samples.sort()).toEqual([1, 2, 3]);
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