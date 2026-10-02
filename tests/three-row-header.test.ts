import { describe, expect, it } from "vitest";
import { columnLabel } from "@/schema/columns-vhsnd";
import { buildHeaderMap } from "@/schema/engine/headerNormalizer";
import { detectHeaderLayout, normalizeAoa } from "@/schema/engine/normalize";
import { getDatasetSchema } from "@/schema";

/**
 * An export that puts three header rows above the data: numbered question
 * labels, the same labels again, then the form's own row of column codes.
 *
 * Only the third row identifies a column, so reading it as data both turns a
 * record into a bogus submission and forces every column through title
 * resolution -- where the 11 "Others (Specify)" columns collapse onto one
 * field and near-miss titles land on the wrong one.
 */
const CODES = [
  "SubmissionDate",
  "A2_SP",
  "A3_SP",
  "C3_SP",
  "C10_SP",
  "C10_1_SP",
  "E3_SP",
  "G3_SP",
  "H1_SP",
  "H2_SP",
  "H4_SP",
  "H32_SP",
  "C7",
];

const LABELS = CODES.map((code) => columnLabel(code));

function sheet(): unknown[][] {
  const numbered = LABELS.map((label, i) => `${i + 1}. ${label}`);
  const rows = [numbered, [...LABELS], [...CODES]];
  for (let r = 0; r < 3; r++) {
    rows.push(
      CODES.map((code) => (code === "SubmissionDate" ? `2026-01-0${r + 1}` : "x")),
    );
  }
  return rows;
}

const header = buildHeaderMap();
const source = {
  fileName: "three-row.xlsx",
  sheetName: "Consolidated sheet",
  sizeBytes: 1,
  headerRow: 1,
  importedAt: "2026-10-02T00:00:00.000Z",
};

describe("three-row header export", () => {
  it("finds the code row below the two label rows", () => {
    const layout = detectHeaderLayout(sheet(), header.knownColumns, header.normalize);
    expect(layout.headerRows).toBe(3);
    expect(layout.dataStart).toBe(3);
    expect(layout.codeSource.every((c) => c === "sheet")).toBe(true);
    expect(layout.labels).toEqual(LABELS);
  });

  it("reads the code row as a header, not as the first record", () => {
    const parsed = normalizeAoa(
      sheet(),
      getDatasetSchema("2026.1", "vhsnd").fields,
      source,
      header.knownColumns,
      header.normalize,
    );
    expect(parsed.meta.headerRow).toBe(3);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0].values.SubmissionDate).toBe("2026-01-01");
    expect(parsed.rows[0].sourceRow).toBe(3);
  });

  it("keeps every repeated title separate, because the codes keep them apart", () => {
    const parsed = normalizeAoa(
      sheet(),
      getDatasetSchema("2026.1", "vhsnd").fields,
      source,
      header.knownColumns,
      header.normalize,
    );
    expect(parsed.presentColumns.filter((c) => c.endsWith("_SP"))).toHaveLength(11);
    expect(parsed.collapsedColumns).toEqual([]);
    expect(CODES.every((code) => parsed.presentColumns.includes(code))).toBe(true);
    expect(parsed.unmappedHeaders).toBeUndefined();
  });

  it("still reads a plain two-row export the way it always did", () => {
    const layout = detectHeaderLayout(
      [[...LABELS], [...CODES], ["2026-01-01", ...CODES.slice(1).map(() => "x")]],
      header.knownColumns,
      header.normalize,
    );
    expect(layout.headerRows).toBe(2);
    expect(layout.dataStart).toBe(2);
  });
});
