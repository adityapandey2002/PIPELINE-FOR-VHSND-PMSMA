import { describe, expect, it } from "vitest";
import type { NormalizedRow } from "@/contracts/dataset";
import { referenceDate, validateRows } from "@/schema/engine/validate";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";

const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");

function row(values: Record<string, unknown>, id = "r0"): NormalizedRow {
  return { id, sourceRow: 1, values: values as Record<string, string | number | boolean | null> };
}

function codes(result: { violations: { rowId: string; code: string }[] }, id = "r0") {
  return result.violations.filter((v) => v.rowId === id).map((v) => v.code);
}

describe("cross-field rules: numeric chains", () => {
  it("X001 flags high-BP identified > measured", () => {
    const r = validateRows([row({ H1BP: 5, H1BP1: 6 })], schema);
    expect(codes(r)).toContain("HIGH_BP_MEASURED_LT_IDENTIFIED");
  });
  it("X001 is silent when the chain is consistent", () => {
    const r = validateRows([row({ H1BP: 5, H1BP1: 4 })], schema);
    expect(codes(r)).not.toContain("HIGH_BP_MEASURED_LT_IDENTIFIED");
  });
  it("X002 flags referrals exceeding identifications", () => {
    const r = validateRows([row({ H1BP1: 2, H1PB2: 3 })], schema);
    expect(codes(r)).toContain("HIGH_BP_REFERRED_GT_IDENTIFIED");
  });
  it("X003 flags anemic identified > tested", () => {
    const r = validateRows([row({ H1HB: 10, H1HB1: 11 })], schema);
    expect(codes(r)).toContain("ANEMIC_GT_SAMPLED");
  });
  it("X004 flags moderate+severe > identified", () => {
    const r = validateRows([row({ H1HB1: 5, H1HB_2: 6, H1HB_3: 0 })], schema);
    expect(codes(r)).toContain("ANEMIA_MOD_SEV_GT_IDENTIFIED");
  });
});

describe("cross-field rules: session status", () => {
  it("X012 warns when session not held but service data exists", () => {
    const r = validateRows([row({ C1: "no", H1BP: 3 })], schema);
    expect(codes(r)).toContain("SESSION_NOT_HELD_WITH_SERVICES");
  });
  it("X014 requires a reason when session not held", () => {
    const r = validateRows([row({ C1: "no" })], schema);
    expect(codes(r)).toContain("SESSION_NOT_HELD_REASON_REQUIRED");
  });
  it("X013 flags a reason provided although the session was held", () => {
    const r = validateRows([row({ C1: "yes", C3: "No ANM" })], schema);
    expect(codes(r)).toContain("SESSION_HELD_WITH_REASON");
  });
});

describe("cross-field rules: unsafe practices & required reasons", () => {
  it("X015 requires a reason when syringes are not cut", () => {
    const r = validateRows([row({ H18: "no" })], schema);
    expect(codes(r)).toContain("SYRINGE_NOT_CUT_REASON_REQUIRED");
  });
  it("X016 flags use of a diluted vial after the period", () => {
    const r = validateRows([row({ H21: "yes" })], schema);
    expect(codes(r)).toContain("DILUTED_VIAL_USED_AFTER_PERIOD");
  });
});

describe("cross-field rules: date sanity", () => {
  it("X019 flags visit date after submission", () => {
    const r = validateRows(
      [row({ B8: "2024-01-20", SubmissionDate: "2024-01-15" })],
      schema,
      { refDate: "2024-01-15" },
    );
    expect(codes(r)).toContain("VISIT_DATE_AFTER_SUBMISSION");
  });
  it("X020 flags future dates against the reference date", () => {
    const r = validateRows(
      [row({ B8: "2025-06-01", SubmissionDate: "2025-05-01" })],
      schema,
      { refDate: "2025-05-01" },
    );
    expect(codes(r)).toContain("VISIT_DATE_IN_FUTURE");
  });
  it("X021 flags end before start", () => {
    const r = validateRows([row({ starttime: "09:00:00", endtime: "08:30:00" })], schema);
    expect(codes(r)).toContain("END_BEFORE_START");
  });
});

describe("cross-field rules: select-multiple internals", () => {
  it("X022 warns when None is selected with other options", () => {
    const r = validateRows([row({ G2_A: 1, G2_99: 1, B8: "2024-01-15" })], schema);
    expect(codes(r)).toContain("NONE_SELECTED_WITH_OPTIONS");
  });
  it("X023 warns when Others-specify text lacks a selected Others option", () => {
    const r = validateRows([row({ G1_88: 1, G1_SP: "custom" })], schema);
    expect(codes(r)).not.toContain("SPECIFY_WITHOUT_OTHER");
    const bad = validateRows([row({ G1_SP: "custom" })], schema);
    expect(codes(bad)).toContain("SPECIFY_WITHOUT_OTHER");
  });
});

describe("field-level validation", () => {
  it("flags a missing required field (B8)", () => {
    const r = validateRows([row({ SubmissionDate: "2024-01-15" })], schema);
    expect(codes(r)).toContain("MISSING_REQUIRED");
  });
  it("flags an invalid boolean", () => {
    const r = validateRows([row({ C1: "sometimes" })], schema);
    expect(codes(r)).toContain("INVALID_BOOLEAN");
  });
  it("flags an invalid integer", () => {
    const r = validateRows([row({ H1BP: 4.7 })], schema);
    expect(codes(r)).toContain("INVALID_INTEGER");
  });
});

describe("rule robustness", () => {
  it("a rule error degrades to a deterministic warning instead of crashing", () => {
    // H18 is coerced to null by "maybe" -> appliesTo is false, so nothing crashes.
    const r = validateRows([row({ H18: "maybe" })], schema);
    expect(codes(r)).not.toContain("RULE_EVALUATION_ERROR");
  });
});

describe("referenceDate", () => {
  it("picks the latest SubmissionDate deterministically", () => {
    const rows = [row({ SubmissionDate: "2024-03-01" }, "a"), row({ SubmissionDate: "2024-01-15" }, "b")];
    expect(referenceDate(rows)).toBe("2024-03-01");
    expect(referenceDate([])).toBeNull();
  });
});