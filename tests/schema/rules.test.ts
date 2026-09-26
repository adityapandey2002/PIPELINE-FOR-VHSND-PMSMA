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

  it("generates group coherence rules only where they can actually fire", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const rules = ds.crossFieldRules as CrossFieldRuleDef[];
    const groups = ds.fields.filter((f) => f.type === "group");

    for (const g of groups) {
      const opts = g.group?.options ?? [];
      const noneish = opts.filter((o) => o.kind === "none" || o.kind === "not-applicable");
      const plain = opts.filter((o) => o.kind === "option");
      const others = opts.filter((o) => o.kind === "other");
      const specify = opts.filter((o) => o.kind === "specify");

      const hasNoneRule = rules.some((r) => r.id === `X022-${g.id}`);
      const hasSpecifyRule = rules.some((r) => r.id === `X023-${g.id}`);

      // X022 needs a "None"/"N/A" choice *and* a real option to contradict.
      expect(hasNoneRule).toBe(noneish.length > 0 && plain.length > 0);
      // X023 needs a free-text "_SP" column *and* an "Others" option.
      expect(hasSpecifyRule).toBe(specify.length > 0 && others.length > 0);
    }
  });

  it("keeps no unreachable group rules", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const rules = ds.crossFieldRules as CrossFieldRuleDef[];
    const groups = ds.fields.filter((f) => f.type === "group");
    const generated = rules.filter((r) => r.id.startsWith("X022-") || r.id.startsWith("X023-"));
    // 14 groups would naively yield 28; only the 15 reachable ones are emitted.
    expect(groups).toHaveLength(14);
    expect(generated).toHaveLength(15);
  });
});