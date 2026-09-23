import { describe, expect, it } from "vitest";
import { VHSND_COLUMNS, columnLabel } from "@/schema/columns-vhsnd";
import { canonicalSchemaJson, computeSchemaHash, getDatasetSchema, SCHEMA_VERSION } from "@/schema";

describe("column registry", () => {
  it("contains the 252 physical columns from the survey spec", () => {
    expect(VHSND_COLUMNS.length).toBe(252);
  });

  it("has no duplicate codes", () => {
    const codes = VHSND_COLUMNS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("looks up labels and falls back to the code", () => {
    expect(columnLabel("C10_A")).toBe("Members of VHSNC (other than the head)");
    expect(columnLabel("DEFINITELY_NOT_A_CODE")).toBe("DEFINITELY_NOT_A_CODE");
  });
});

describe("schema integrity", () => {
  it("exposes the vhsnd dataset under the current version", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    expect(ds.fields.length).toBeGreaterThan(0);
    expect(ds.crossFieldRules.length).toBeGreaterThan(0);
  });

  it("every cross-field rule has a unique id and a stable code", () => {
    const ds = getDatasetSchema(SCHEMA_VERSION, "vhsnd");
    const ids = ds.crossFieldRules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const rule of ds.crossFieldRules) {
      expect(rule.code).toMatch(/^[A-Z0-9_]+$/);
      expect(["error", "warning", "info"]).toContain(rule.severity);
    }
  });

  it("schema JSON is canonically stable and hash is deterministic", async () => {
    const a = canonicalSchemaJson(SCHEMA_VERSION);
    const b = canonicalSchemaJson(SCHEMA_VERSION);
    expect(a).toBe(b);
    const h1 = await computeSchemaHash(SCHEMA_VERSION);
    const h2 = await computeSchemaHash(SCHEMA_VERSION);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
});