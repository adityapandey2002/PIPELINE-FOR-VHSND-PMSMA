import { describe, expect, it } from "vitest";
import {
  detectHeaderLayout,
  detectTransposed,
  normalizeAoa,
  transposeAoa,
} from "@/schema/engine/normalize";
import { buildHeaderMap } from "@/schema/engine/headerNormalizer";
import { parsePayload } from "@/workers/parseWorker";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";
import { validateRows } from "@/schema/engine/validate";
import { deriveCleanRows } from "@/lib/derive";
import { COMPARISONS } from "@/lib/comparisons";

const header = buildHeaderMap();
const known = header.knownColumns;
const resolve = (label: string) => header.normalize(label);

const ANEMIA = ["G3_E", "H1HB", "H1HB1", "H1HB_4"];

function valueFor(type: string): string {
  switch (type) {
    case "boolean":
      return "1";
    case "integer":
    case "number":
    case "ordinal":
      return "3";
    case "date":
      return "2025-11-12";
    case "time":
      return "12:55";
    case "datetime":
      return "2025-11-12T12:55:40";
    default:
      return "Yes";
  }
}

/** An export that lists fields down the first column, one submission per column. */
function sidewaysCsv(): ArrayBuffer {
  const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
  const byId = new Map(schema.fields.map((f) => [f.id, f]));
  const codes = [...VHSND_COLUMNS.slice(0, 40).map((c) => c.code), ...ANEMIA];
  const cell = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = codes.map((code) => {
    const col = VHSND_COLUMNS.find((c) => c.code === code);
    const label = col?.label ?? code;
    const value = valueFor(byId.get(code)?.type ?? "text");
    return [label, label, value, value].map(cell).join(",");
  });
  const bytes = new TextEncoder().encode(lines.join("\n"));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

describe("transposed exports", () => {
  it("detects fields running down the side", () => {
    const sideways: unknown[][] = [];
    for (let i = 0; i < 60; i++) {
      const { label } = VHSND_COLUMNS[i];
      sideways.push([label, label, "4", "5"]);
    }
    expect(detectTransposed(sideways, known, resolve)).toBe(true);
  });

  it("leaves an ordinary export alone", () => {
    const upright: unknown[][] = [VHSND_COLUMNS.slice(0, 20).map((c) => c.label)];
    for (let r = 0; r < 50; r++) {
      upright.push(Array.from({ length: 20 }, (_, c) => (c === 0 ? "MUZAFFARPUR" : "4")));
    }
    expect(detectTransposed(upright, known, resolve)).toBe(false);
  });

  it("needs a tall sheet before flipping anything", () => {
    const short = [["SubmissionDate", "starttime"], ["a", "b"]];
    expect(detectTransposed(short, known, resolve)).toBe(false);
  });

  it("swaps rows and columns back", () => {
    const aoa = [
      ["field", "field", "one", "two"],
      ["other", "other", "1", "2"],
    ];
    expect(transposeAoa(aoa)).toEqual([
      ["field", "other"],
      ["field", "other"],
      ["one", "1"],
      ["two", "2"],
    ]);
  });

  it("reads the repeated label row as headers, not as the first record", () => {
    const layout = detectHeaderLayout(
      [
        ["SubmissionDate", "starttime"],
        ["SubmissionDate", "starttime"],
        ["2025-11-12", "12:55"],
      ],
      known,
      resolve,
    );
    expect(layout.headerRows).toBe(2);
    expect(layout.dataStart).toBe(2);
  });

  it("keeps an ordinary single header row at dataStart 1", () => {
    const layout = detectHeaderLayout(
      [
        ["Name of supervisor", "District"],
        ["Rajeev Kumar Singh", "MUZAFFARPUR"],
      ],
      known,
      resolve,
    );
    expect(layout.dataStart).toBe(1);
  });

  it("reads a sideways workbook end to end", async () => {
    const buffer = sidewaysCsv();
    const parsed = await parsePayload({
      buffer,
      fileName: "sideways.csv",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-09-28T00:00:00.000Z",
    });

    expect(parsed.transposed).toBe(true);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.meta.headerRow).toBe(2);
    for (const code of ANEMIA) expect(parsed.presentColumns).toContain(code);

    const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const { violations } = validateRows(parsed.rows, schema, {
      presentColumns: parsed.presentColumns,
    });
    const snapshot = {
      id: "sideways",
      kind: "vhsnd",
      name: "sideways.csv",
      source: {},
      schemaVersion: SCHEMA_VERSION,
      schemaHash: "sideways",
      totalRows: parsed.rows.length,
      rows: parsed.rows,
      skippedRows: parsed.skippedRows,
      presentColumns: parsed.presentColumns,
    } as never;
    const cleanRows = deriveCleanRows(snapshot, violations, {}).rows;
    const anemia = COMPARISONS.find((c) => c.id === "anemia-cascade");
    expect(anemia).toBeDefined();
    const result = anemia!.compute(cleanRows);
    expect(result.columnsMissing).toEqual([]);
    expect(result.series.points.some((p) => p.value > 0)).toBe(true);
  });

  it("does not touch an ordinary sheet", async () => {
    const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const knownColumns = new Set(VHSND_COLUMNS.map((c) => c.code));
    const aoa: unknown[][] = [
      VHSND_COLUMNS.slice(0, 12).map((c) => c.label),
      VHSND_COLUMNS.slice(0, 12).map((c) => c.code),
      VHSND_COLUMNS.slice(0, 12).map(() => "4"),
      VHSND_COLUMNS.slice(0, 12).map(() => "4"),
    ];
    const parsed = normalizeAoa(
      aoa,
      schema.fields,
      { fileName: "upright.xlsx", sheetName: "Sheet1", sizeBytes: 1, headerRow: 2, importedAt: "2026-09-28T00:00:00.000Z" },
      knownColumns,
      resolve,
    );
    expect(parsed.transposed).toBeUndefined();
    expect(parsed.rows).toHaveLength(2);
  });
});
