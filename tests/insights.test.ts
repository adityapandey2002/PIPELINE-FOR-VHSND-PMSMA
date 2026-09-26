import { describe, expect, it } from "vitest";
import { computeCleaningInsights, computeDatasetInsights, computeVizInsights } from "@/lib/insights";
import type { DatasetSnapshot, NormalizedRow } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import type { IndicatorSeries } from "@/schema/indicators";

function snapshot(
  rows: Record<string, string | number | boolean>[],
  presentColumns?: string[],
): DatasetSnapshot {
  const normalized: NormalizedRow[] = rows.map((values, i) => ({
    id: `r${i}`,
    sourceRow: i,
    values: values as NormalizedRow["values"],
  }));
  return {
    id: "d1",
    kind: "vhsnd",
    name: "f.csv",
    source: {
      fileName: "f.csv",
      sheetName: "Sheet1",
      sizeBytes: 1,
      headerRow: 0,
      importedAt: "2026-01-01T00:00:00.000Z",
    },
    schemaVersion: "2026.1",
    schemaHash: "h",
    totalRows: normalized.length,
    rows: normalized,
    skippedRows: 0,
    ...(presentColumns ? { presentColumns } : {}),
  } as DatasetSnapshot;
}

describe("column presence accounting", () => {
  it("separates a blank column from a column the file lacks", () => {
    // C3 is in the export but empty on every row; G1_D is not in the export.
    const ds = snapshot([{ C1: "yes", C3: "" }], ["C1", "C3"]);
    const i = computeDatasetInsights(ds)!;
    expect(i.missingCodes).toContain("G1_D");
    expect(i.missingCodes).not.toContain("C3");
    expect(i.columnsEmpty).toBeGreaterThanOrEqual(1);
    expect(i.columnsMissing).toBe(i.missingCodes.length);
    expect(i.columnsPresent + i.columnsEmpty + i.columnsMissing).toBe(i.columnsExpected);
  });

  it("still adds up for a snapshot with no persisted column list", () => {
    const i = computeDatasetInsights(snapshot([{ C1: "yes" }]))!;
    expect(i.columnsPresent + i.columnsEmpty + i.columnsMissing).toBe(i.columnsExpected);
  });
});

const emptySeries: IndicatorSeries = {
  points: [],
  samples: [],
  timeLabels: [],
  stats: { cardinality: 0, dateSpanDays: 0, missingRate: 0, numericShape: "flat" },
};

const errorOn = (rowId: string, code: string): Violation => ({
  rowId,
  ruleId: "X001",
  code,
  severity: "error",
  category: "sequence",
  message: "m",
});

describe("pending rows", () => {
  const ds = snapshot([{ C1: "yes" }, { C1: "no" }, { C1: "yes" }]);
  const errors = [errorOn("r1", "E")];

  it("counts rows with unresolved errors, not untouched rows", () => {
    const before = computeCleaningInsights(ds, errors, {})!;
    expect(before.totalRows).toBe(3);
    expect(before.pendingRows).toBe(1);
    expect(before.unresolvedErrors).toBe(1);
    expect(computeCleaningInsights(ds, [], {})!.pendingRows).toBe(0);
  });

  it("reaches zero once the error is acknowledged or the row is dropped", () => {
    const kept = computeCleaningInsights(ds, errors, {
      r1: { rowId: "r1", status: "keep", keptViolations: ["__all"], justification: "ok" },
    })!;
    expect(kept.pendingRows).toBe(0);
    expect(kept.unresolvedErrors).toBe(0);

    const dropped = computeCleaningInsights(ds, errors, {
      r1: { rowId: "r1", status: "drop", justification: "dup" },
    })!;
    expect(dropped.pendingRows).toBe(0);
    expect(dropped.unresolvedErrors).toBe(0);
  });

  it("leaves the tile at zero while an error is still open on a warning-only row", () => {
    const warning: Violation = { ...errorOn("r2", "W"), severity: "warning" };
    expect(computeCleaningInsights(ds, [warning], {})!.pendingRows).toBe(0);
  });

  it("matches the report tile the viz page reads", () => {
    const viz = computeVizInsights(ds, errors, {}, emptySeries)!;
    const review = computeCleaningInsights(ds, errors, {})!;
    expect(viz.pendingRows).toBe(review.pendingRows);
    expect(viz.totalRows).toBe(review.totalRows);
  });
});
