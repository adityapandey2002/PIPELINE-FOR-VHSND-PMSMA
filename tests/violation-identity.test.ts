import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { parsePayload } from "@/workers/parseWorker";
import { validateRows } from "@/schema/engine/validate";
import { computeCleaningInsights } from "@/lib/insights";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";
import { keyedViolations, violationKey } from "@/contracts/violation";
import type { DatasetSnapshot, NormalizedRow } from "@/contracts/dataset";
import type { ParsedSheet } from "@/schema/engine/normalize";

const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
const SHAPE = resolve(process.cwd(), "sample-data/DATA_EX_SHAPE.csv");

function row(values: Record<string, unknown>, id = "r0"): NormalizedRow {
  return { id, sourceRow: 1, values: values as Record<string, string | number | boolean | null> };
}

function keysOf(list: { key: string }[]): string[] {
  return list.map((e) => e.key);
}

describe("violation identity: one row can raise the same code on several fields", () => {
  it("keys two INVALID_ORDINAL findings on H33 and H34 apart and lists both", () => {
    // H33 and H34 are both `ordinal` counselling-scale columns, so one row can
    // raise the same code twice. A rowId+code key collides here.
    const { violations } = validateRows([row({ H33: "maybe", H34: "perhaps" })], schema);
    const ords = violations.filter((v) => v.code === "INVALID_ORDINAL");
    expect(ords).toHaveLength(2);
    expect(ords.map((v) => v.fieldId).sort()).toEqual(["H33", "H34"]);

    const listed = keyedViolations(violations);
    expect(listed).toHaveLength(violations.length);
    expect(new Set(keysOf(listed)).size).toBe(listed.length);
  });

  it("keys three sentinel findings on ANM2/ANM3/ANM4 apart", () => {
    const { violations } = validateRows([row({ ANM2: 99, ANM3: 99, ANM4: 99 })], schema);
    const sentinels = violations.filter((v) => v.code === "SENTINEL_NO_DATA");
    expect(sentinels).toHaveLength(3);
    expect(sentinels.map((v) => v.fieldId).sort()).toEqual(["ANM2", "ANM3", "ANM4"]);

    const keys = keysOf(keyedViolations(violations));
    expect(new Set(keys).size).toBe(violations.length);
  });

  it("separates several findings raised on the same field", () => {
    // The group parent cell names two option tokens this form version cannot
    // map: one UNMAPPED_GROUP_OPTION per token, on the same column.
    const { violations } = validateRows([row({ G1: "D Q", G1_A: 1 })], schema);
    const unmapped = violations.filter((v) => v.code === "UNMAPPED_GROUP_OPTION");
    expect(unmapped).toHaveLength(2);
    const keys = keysOf(keyedViolations(violations));
    expect(new Set(keys).size).toBe(violations.length);
  });

  it("stays unique when the same field reports the same code twice", () => {
    const { violations } = validateRows([row({ G1: "D D", G1_A: 1 })], schema);
    const unmapped = violations.filter((v) => v.code === "UNMAPPED_GROUP_OPTION");
    expect(unmapped).toHaveLength(2);
    const keys = keysOf(keyedViolations(violations));
    expect(new Set(keys).size).toBe(violations.length);
  });

  it("derives a key from row, code, field and raw value, independent of order", () => {
    const { violations } = validateRows([row({ H33: "maybe", H34: "perhaps" })], schema);
    const keys = keysOf(keyedViolations(violations));
    expect(keysOf(keyedViolations([...violations].reverse()))).toEqual([...keys].reverse());
    expect(keys[0]).toBe(violationKey(violations[0]));
    for (const key of keys) expect(key.startsWith("r0|INVALID_ORDINAL|H3")).toBe(true);
  });
});

describe("info-severity findings reach every counter", () => {
  it("counts a sentinel notice in the severity counters and the total", () => {
    // C4_A/C4_B record that an ANM was present, so the only finding is the
    // sentinel itself reaching validation uncoerced.
    const { violations, counts } = validateRows([row({ C4_A: 1, C4_B: 1, ANM2: 99 })], schema);
    expect(violations).toHaveLength(1);
    expect(violations[0].severity).toBe("info");
    expect(counts).toEqual({ error: 0, warning: 0, info: 1 });
    expect(counts.error + counts.warning + counts.info).toBe(violations.length);
  });

  it("tallies info notices in the category counts and the cleaning insights", () => {
    const values = { C4_A: 1, C4_B: 1, ANM2: 99, ANM3: 99, ANM4: 99 };
    const { violations, counts } = validateRows([row(values)], schema);
    const snapshot: DatasetSnapshot = {
      id: "d",
      kind: "vhsnd",
      name: "d",
      source: { fileName: "d.xlsx", sheetName: "S", sizeBytes: 0, headerRow: 1, importedAt: "2026-09-26T00:00:00.000Z" },
      schemaVersion: SCHEMA_VERSION,
      schemaHash: "",
      totalRows: 1,
      rows: [row(values)],
      skippedRows: 0,
    };
    const insights = computeCleaningInsights(snapshot, violations, {})!;

    expect(insights.info).toBe(3);
    expect(insights.errors).toBe(counts.error);
    expect(insights.warnings).toBe(counts.warning);
    expect(insights.byCategory["value-set"]).toBe(3);
    expect(Object.values(insights.byCategory).reduce((a, b) => a + b, 0)).toBe(violations.length);
  });
});

describe("parse and validate agree on a declared sentinel", () => {
  let parsed: ParsedSheet;
  let beforeAllErrors: number;
  let beforeAllWarnings: number;

  beforeAll(async () => {
    const buf = readFileSync(SHAPE);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    parsed = await parsePayload({
      buffer,
      fileName: "DATA_EX_SHAPE.csv",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-09-26T00:00:00.000Z",
    });
    const { counts } = validateRows(parsed.rows, schema, { refDate: "2025-11-19" });
    beforeAllErrors = counts.error;
    beforeAllWarnings = counts.warning;
  });

  it("reads a zero-meaning sentinel as 0 so no aggregate can read the magic number", () => {
    expect(parsed.rows[0].values.ANM2).toBe(0);
    expect(parsed.rows[0].values.ANM3).toBe(0);
    expect(parsed.rows[2].values.ANM2).toBe(1);
    const { violations, counts } = validateRows(parsed.rows, schema, { refDate: "2025-11-19" });
    expect(violations.filter((v) => v.code.startsWith("SENTINEL_"))).toHaveLength(0);
    expect(counts.info).toBe(0);
    expect(counts.error + counts.warning + counts.info).toBe(violations.length);
  });

  it("adds no error or warning to the fixture", () => {
    const { counts } = validateRows(parsed.rows, schema, { refDate: "2025-11-19" });
    expect(counts.error).toBe(beforeAllErrors);
    expect(counts.warning).toBe(beforeAllWarnings);
  });

  it("keeps rowId+code collisions keyed uniquely when they do occur", () => {
    const { violations } = validateRows(parsed.rows, schema, { refDate: "2025-11-19" });
    const keys = keysOf(keyedViolations(violations));
    expect(new Set(keys).size).toBe(violations.length);
  });

  it("still separates two same-code findings on one row", () => {
    const both = validateRows([row({ C4_A: 1, C4_B: 1, H33: 7, H34: 7 })], schema).violations;
    expect(both.filter((v) => v.code === "UNEXPECTED_ORDINAL")).toHaveLength(2);
    expect(new Set(keysOf(keyedViolations(both))).size).toBe(2);
  });
});
