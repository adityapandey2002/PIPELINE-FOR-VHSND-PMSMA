import { describe, expect, it } from "vitest";
import { buildHeaderMap } from "@/schema/engine/headerNormalizer";

describe("buildHeaderMap", () => {
  const map = buildHeaderMap();

  it("maps exact codes", () => {
    expect(map.normalize("B8")).toBe("B8");
    expect(map.normalize("C10_A")).toBe("C10_A");
    expect(map.normalize("SubmissionDate")).toBe("SubmissionDate");
  });

  it("maps exact labels", () => {
    expect(map.normalize("Date of visit")).toBe("B8");
  });

  it("maps codes embedded in longer headers", () => {
    expect(map.normalize("8. B8")).toBe("B8");
    expect(map.normalize("Date of visit (B8)")).toBe("B8");
    expect(map.normalize("B8 - Date of visit")).toBe("B8");
  });

  it("maps number-prefixed labels", () => {
    expect(map.normalize("8. Date of visit")).toBe("B8");
    expect(map.normalize("08) Date of visit")).toBe("B8");
    expect(map.normalize("7. New")).toBe("New");
  });

  it("maps en-dash / em-dash separators", () => {
    expect(map.normalize("Date of visit – B8")).toBe("B8");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(map.normalize("  date   of  visit ")).toBe("B8");
  });

  it("leaves genuinely unknown headers untouched", () => {
    expect(map.normalize("Some unrelated column")).toBe("Some unrelated column");
    expect(map.normalize("")).toBe("");
  });

  it("does not mis-map arbitrary letter-digit strings", () => {
    // "ANM" + "1" is not a contiguous known code token.
    expect(map.normalize("ANM 1")).toBe("ANM 1");
    expect(map.normalize("ANM1")).toBe("ANM1");
  });
});