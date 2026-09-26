import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePayload } from "@/workers/parseWorker";
import { validateRows } from "@/schema/engine/validate";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";

const SAMPLE = resolve(process.cwd(), "sample-data/vhsnd-sample.xlsx");

describe("sample data end-to-end", () => {
  it("parses the sample export with the official header codes", async () => {
    const buf = readFileSync(SAMPLE);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = await parsePayload({
      buffer,
      fileName: "vhsnd-sample.xlsx",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-07-14T00:00:00.000Z",
    });

    expect(parsed.rows.length).toBe(160);
  });

  it("recognises the full spec spread", async () => {
    const buf = readFileSync(SAMPLE);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = await parsePayload({
      buffer,
      fileName: "vhsnd-sample.xlsx",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-07-14T00:00:00.000Z",
    });
    // Every known code is present in the source; unknowns would break the map.
    // The demo workbook predates the G1 Hepatitis_B option, so it is the one
    // declared column it legitimately does not ship.
    const { VHSND_COLUMNS } = await import("@/schema/columns-vhsnd");
    const notInSample = new Set(["G1_D"]);
    for (const col of VHSND_COLUMNS) {
      if (notInSample.has(col.code)) continue;
      expect(parsed.presentColumns).toContain(col.code);
    }
  });

  it("flags the deliberately broken demo rows", async () => {
    const buf = readFileSync(SAMPLE);
    const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const parsed = await parsePayload({
      buffer,
      fileName: "vhsnd-sample.xlsx",
      sizeBytes: buffer.byteLength,
      importedAt: "2026-07-14T00:00:00.000Z",
    });
    const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const { violations } = validateRows(parsed.rows, schema);
    const codes = new Set(violations.map((v) => v.code));

    expect(codes).toContain("HIGH_BP_MEASURED_LT_IDENTIFIED");
    expect(codes).toContain("END_BEFORE_START");
    expect(codes).toContain("SESSION_NOT_HELD_REASON_REQUIRED");
    expect(codes).toContain("SYRINGE_NOT_CUT_REASON_REQUIRED");
    expect(codes).toContain("DILUTED_VIAL_USED_AFTER_PERIOD");
    expect(codes).toContain("VISIT_DATE_AFTER_SUBMISSION");
    expect(codes).not.toContain("MISSING_REQUIRED"); // rule disabled temporarily
    expect(codes).toContain("NONE_SELECTED_WITH_OPTIONS");
    expect(codes).toContain("SPECIFY_WITHOUT_OTHER");
  });
});