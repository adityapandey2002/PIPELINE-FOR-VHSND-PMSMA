import { describe, expect, it } from "vitest";
import { computeDatasetInsights } from "@/lib/insights";
import type { DatasetSnapshot, NormalizedRow } from "@/contracts/dataset";

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
