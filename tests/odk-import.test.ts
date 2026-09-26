import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parsePayload } from "@/workers/parseWorker";
import { deriveCleanRows } from "@/lib/derive";
import { evaluateIndicator, VHSND_INDICATORS } from "@/schema/indicators";
import { VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { cleanRowsToCsv } from "@/export/csv";
import { buildReportContext } from "@/export/reportContext";
import type { DatasetSnapshot } from "@/contracts/dataset";
import type { CleanRow, RowResolution } from "@/contracts/resolution";
import type { Violation } from "@/contracts/violation";

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

async function cleanDataset1() {
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
  return { parsed, clean: deriveCleanRows(snapshot, [], {}).rows };
}

function err(rowId: string, code: string): Violation {
  return { rowId, ruleId: "X001", code, severity: "error", category: "sequence", message: "m" };
}

function reportCtx(
  rows: CleanRow[],
  violations: Violation[] = [],
  resolutions: Record<string, RowResolution> = {},
) {
  return buildReportContext({
    datasetName: "DATASET_1",
    fileName: "DATASET_1.xlsx",
    importedAt: "2026-09-24T00:00:00.000Z",
    totalRows: rows.length,
    rows,
    resolutions,
    violations,
    counts: {
      error: violations.filter((v) => v.severity === "error").length,
      warning: violations.filter((v) => v.severity === "warning").length,
      info: 0,
    },
    indicatorDefs: VHSND_INDICATORS,
    charts: [],
    schemaVersion: "2026.1",
  });
}

describe("ODK label-headed import (DATASET_1.xlsx)", () => {
  it("recognizes a meaningful number of columns from question-label headers", async () => {
    const { parsed } = await cleanDataset1();
    const known = new Set(VHSND_COLUMNS.map((c) => c.code));
    const recognized = parsed.presentColumns.filter((c) => known.has(c));
    expect(parsed.rows.length).toBeGreaterThan(0);
    expect(recognized.length).toBeGreaterThan(30);
  });

  it("returns non-empty chart points for at least one indicator", async () => {
    const { clean } = await cleanDataset1();
    expect(clean.length).toBeGreaterThan(0);
    const withPoints = VHSND_INDICATORS.filter(
      (i) => evaluateIndicator(clean, i).points.length > 0,
    );
    expect(withPoints.length).toBeGreaterThan(0);
  });

  it("does not crash review/report helpers on partially-mapped rows", async () => {
    const { clean } = await cleanDataset1();
    const csv = cleanRowsToCsv(clean);
    expect(csv.split("\r\n").length).toBe(clean.length + 1);

    const ctx = await reportCtx(clean);
    expect(ctx.indicators.length).toBe(VHSND_INDICATORS.length);
    expect(ctx.manifest).toMatch(/^[0-9a-f]{64}$/);
    expect(ctx.summary.pendingRows).toBe(0);
  });

  it("counts pending rows as the rows that still carry an error", async () => {
    const { clean } = await cleanDataset1();
    const violations = [
      err(clean[0].rowId, "E"),
      err(clean[1].rowId, "E"),
      err(clean[1].rowId, "F"),
    ];

    const open = await reportCtx(clean, violations);
    expect(open.summary.pendingRows).toBe(2);
    expect(open.summary.unresolvedErrors).toBe(3);

    const decided = await reportCtx(clean, violations, {
      [clean[0].rowId]: { rowId: clean[0].rowId, status: "keep", keptViolations: ["__all"], justification: "ok" },
      [clean[1].rowId]: { rowId: clean[1].rowId, status: "drop", justification: "duplicate" },
    });
    expect(decided.summary.pendingRows).toBe(0);
    expect(decided.summary.unresolvedErrors).toBe(0);
  });
});
