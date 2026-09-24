import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePayload } from "@/workers/parseWorker";
import { deriveCleanRows } from "@/lib/derive";
import { evaluateIndicator, VHSND_INDICATORS } from "@/schema/indicators";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import type { DatasetSnapshot } from "@/contracts/dataset";

const SAMPLE = resolve(process.cwd(), "sample-data/DATASET_1.xlsx");

async function parseDataset1() {
  const buf = readFileSync(SAMPLE);
  const buffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  return parsePayload({
    buffer,
    fileName: "DATASET_1.xlsx",
    sizeBytes: buffer.byteLength,
    importedAt: "2026-09-24T00:00:00.000Z",
  });
}

describe("ODK label export (DATASET_1.xlsx)", () => {
  it("recognizes a meaningful number of columns from question-label headers", async () => {
    const parsed = await parseDataset1();
    const known = new Set(VHSND_COLUMNS.map((c) => c.code));
    const recognized = parsed.presentColumns.filter((c) => known.has(c));
    expect(parsed.rows.length).toBe(14);
    expect(recognized.length).toBeGreaterThanOrEqual(60);
  });

  it("maps representative ODK label headers to their canonical codes", async () => {
    const parsed = await parseDataset1();
    expect(parsed.headerMap["District"]).toBe("B2");
    expect(parsed.headerMap["Block name"]).toBe("B2A");
    expect(parsed.headerMap["Has the session been held?"]).toBe("C1");
    expect(parsed.headerMap["Is the survey register available on Health Day?"]).toBe("E1");
    expect(parsed.headerMap["Name of supervisor"]).toBe("A2");
    expect(parsed.headerMap["Importance of prenatal checkups"]).toBe("H2_A");
    expect(parsed.headerMap["How many women are due for TT-Yes vaccination today?"]).toBe("E2_3");
    expect(parsed.headerMap["working weighing machine for adults"]).toBe("G3_A");
    expect(parsed.headerMap["Comment"]).toBe("Comment");
  });

  it("derives clean rows and produces non-empty chart points", async () => {
    const parsed = await parseDataset1();
    const snapshot: DatasetSnapshot = {
      id: "dataset-1",
      kind: "vhsnd",
      name: "DATASET_1",
      source: parsed.meta,
      schemaVersion: "2026.1",
      schemaHash: "",
      totalRows: parsed.rows.length,
      rows: parsed.rows,
      skippedRows: parsed.skippedRows,
    };
    const clean = deriveCleanRows(snapshot, {}).rows;
    expect(clean.length).toBe(14);

    const sessions = VHSND_INDICATORS.find((i) => i.id === "sessions")!;
    const sessionSeries = evaluateIndicator(clean, sessions);
    expect(sessionSeries.points.length).toBeGreaterThan(0);

    const withValues = VHSND_INDICATORS.filter((i) =>
      evaluateIndicator(clean, i).points.some((p) => p.value > 0),
    ).map((i) => i.id);
    expect(withValues).toEqual(
      expect.arrayContaining(["sessions", "sessions-by-block", "supplies-site"]),
    );
  });
});
