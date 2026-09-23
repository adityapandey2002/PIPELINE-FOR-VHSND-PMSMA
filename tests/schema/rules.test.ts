import { describe, expect, it } from "vitest";
import type { CrossFieldRuleDef } from "@/schema/dsl";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";

describe("validation rule golden cases", () => {
  it("X001-X011 numeric chains exist and are classified", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const rules = ds.crossFieldRules as CrossFieldRuleDef[];
    const codes = new Set(rules.map((r) => r.code));

    expect(codes).toContain("HIGH_BP_MEASURED_LT_IDENTIFIED");
    expect(codes).toContain("HIGH_BP_REFERRED_GT_IDENTIFIED");
    expect(codes).toContain("ANEMIC_GT_SAMPLED");
    expect(codes).toContain("SESSION_NOT_HELD_WITH_SERVICES");
    expect(codes).toContain("VISIT_DATE_AFTER_SUBMISSION");
    expect(codes).toContain("END_BEFORE_START");

    const errors = rules.filter((r) => r.severity === "error");
    expect(errors.length).toBeGreaterThanOrEqual(10);
  });

  it("every select-multiple group gets internal coherence rules", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const rules = ds.crossFieldRules as CrossFieldRuleDef[];
    const groups = ds.fields.filter((f) => f.type === "group").map((f) => f.id);
    for (const g of groups) {
      expect(rules.some((r) => r.id === `X022-${g}`)).toBe(true);
      expect(rules.some((r) => r.id === `X023-${g}`)).toBe(true);
    }
  });
});