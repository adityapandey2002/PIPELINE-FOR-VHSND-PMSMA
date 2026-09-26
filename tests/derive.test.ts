import { describe, expect, it } from "vitest";
import { cleanRowsToCsv } from "@/export/csv";
import type { CleanRow } from "@/contracts/resolution";
import { deriveCleanRows, unresolvedErrors } from "@/lib/derive";
import type { DatasetSnapshot } from "@/contracts/dataset";
import type { RowResolution } from "@/contracts/resolution";
import type { Violation } from "@/contracts/violation";

describe("cleanRowsToCsv", () => {
  it("quotes labels containing commas and prints code suffixes", () => {
    const rows: CleanRow[] = [
      { rowId: "r0", values: { C10_A: true, H1BP: 5, C1: false } },
    ];
    const csv = cleanRowsToCsv(rows);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("(C1)");
    expect(lines[0]).toContain("(C10_A)");
    expect(lines[0]).toContain("(H1BP)");
    expect(lines[1]).toContain("5");
  });

  it("renders booleans as 1/0", () => {
    const rows: CleanRow[] = [{ rowId: "r0", values: { C1: true, C2: false, New: true } }];
    const csv = cleanRowsToCsv(rows);
    // Columns sort alphabetically: C1, C2, New.
    expect(csv.split("\r\n")[1]).toBe("1,0,1");
  });

  it("returns empty string for no rows", () => {
    expect(cleanRowsToCsv([])).toBe("");
  });
});

describe("deriveCleanRows", () => {
  const dataset = {
    rows: [
      { id: "r0", sourceRow: 1, values: { H1BP: 5 } },
      { id: "r1", sourceRow: 2, values: { H1BP: 8 } },
      { id: "r2", sourceRow: 3, values: { H1BP: 10 } },
    ],
  } as unknown as DatasetSnapshot;

  it("applies drops, keeps pending, merges overrides", () => {
    const resolutions: Record<string, RowResolution> = {
      r0: { rowId: "r0", status: "drop", justification: "duplicate" },
      r1: { rowId: "r1", status: "override", overrides: { H1BP: 9 }, justification: "keying error" },
      r2: { rowId: "r2", status: "keep", keptViolations: ["X001"] },
    };
    const { rows, dropped } = deriveCleanRows(dataset, [], resolutions);
    const ids = rows.map((r) => r.rowId);
    expect(ids).toEqual(["r1", "r2"]);
    expect(rows.find((r) => r.rowId === "r1")?.values.H1BP).toBe(9);
    expect(dropped.map((r) => r.rowId)).toEqual(["r0"]);
  });

  it("counts only rows carrying an unresolved error as pending", () => {
    const errors: Violation[] = [
      { rowId: "r1", ruleId: "X001", code: "HIGH_BP", severity: "error", category: "sequence", message: "m" },
      { rowId: "r2", ruleId: "X002", code: "VISIT", severity: "error", category: "date", message: "m" },
    ];
    const awaiting = deriveCleanRows(dataset, errors, {});
    expect(awaiting.pending.map((r) => r.rowId)).toEqual(["r1", "r2"]);
    expect(awaiting.rows.map((r) => r.rowId)).toEqual(["r0", "r1", "r2"]);

    const decided = deriveCleanRows(
      dataset,
      errors,
      {
        r1: { rowId: "r1", status: "keep", keptViolations: ["__all"] },
        r2: { rowId: "r2", status: "keep", keptViolations: ["__all"] },
      },
    );
    expect(decided.pending).toEqual([]);

    expect(deriveCleanRows(dataset, [], {}).pending).toEqual([]);
  });

  it("re-reads an override through the schema instead of storing the raw text", () => {
    const vhsnd = {
      ...dataset,
      schemaVersion: "2026.1",
      kind: "vhsnd",
    } as unknown as DatasetSnapshot;
    const resolutions: Record<string, RowResolution> = {
      r0: { rowId: "r0", status: "override", overrides: { H1BP: "7" }, justification: "typo" },
      r1: { rowId: "r1", status: "override", overrides: { H1BP: "abc" }, justification: "typo" },
    };
    const { rows } = deriveCleanRows(vhsnd, [], resolutions);
    expect(rows.find((r) => r.rowId === "r0")?.values.H1BP).toBe(7);
    // Unreadable text cannot enter the clean dataset as a number.
    expect(rows.find((r) => r.rowId === "r1")?.values.H1BP ?? null).toBeNull();
  });

  it("leaves values untouched when the dataset schema cannot be resolved", () => {
    const { rows } = deriveCleanRows(dataset, [], {
      r0: { rowId: "r0", status: "override", overrides: { H1BP: "7" }, justification: "typo" },
    });
    expect(rows.find((r) => r.rowId === "r0")?.values.H1BP).toBe("7");
  });
});

describe("unresolvedErrors", () => {
  const violations: Violation[] = [
    { rowId: "r0", ruleId: "X001", code: "HIGH_BP", severity: "error", category: "sequence", message: "m" },
    { rowId: "r1", ruleId: "X019", code: "VISIT", severity: "error", category: "date", message: "m" },
    { rowId: "r2", ruleId: "X012", code: "COHERENCE", severity: "warning", category: "coherence", message: "m" },
  ];

  it("ignores warnings, resolves acknowledged/dropped/overridden rows", () => {
    const resolutions: Record<string, RowResolution> = {
      r0: { rowId: "r0", status: "keep", keptViolations: ["HIGH_BP"] },
      r1: { rowId: "r1", status: "drop", justification: "dup" },
      r2: { rowId: "r2", status: "keep" },
    };
    const left = unresolvedErrors(violations, resolutions);
    expect(left.map((v) => v.rowId)).toEqual([]);
  });

  it("__all acknowledges every error on the row", () => {
    const resolutions: Record<string, RowResolution> = {
      r0: { rowId: "r0", status: "keep", keptViolations: ["__all"] },
      r1: { rowId: "r1", status: "keep", keptViolations: ["VISIT"] },
    };
    expect(unresolvedErrors(violations, resolutions)).toEqual([]);
  });
});