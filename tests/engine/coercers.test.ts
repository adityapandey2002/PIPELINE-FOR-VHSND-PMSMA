import { describe, expect, it } from "vitest";
import {
  coerceBoolean,
  coerceDate,
  coerceInteger,
  coerceNumber,
  coerceText,
  coerceTime,
  excelSerialToIso,
} from "@/schema/engine/cellCoercers";

describe("coerceBoolean", () => {
  it("accepts the standard yes/no encodings", () => {
    for (const truthy of ["yes", "Yes", "YES", "y", "1", 1, true, "true", "TRUE", "ticked", "checked", "✓", "x"]) {
      expect(coerceBoolean(truthy)).toBe(true);
    }
    for (const falsy of ["no", "No", "n", "0", 0, false, "false", "not", "blank", ""]) {
      expect(coerceBoolean(falsy)).toBe(false);
    }
  });

  it("rejects ambiguous values", () => {
    expect(coerceBoolean(null)).toBeNull();
    expect(coerceBoolean(undefined)).toBeNull();
    expect(coerceBoolean("maybe")).toBeNull();
    expect(coerceBoolean(2)).toBeNull();
  });
});

describe("coerceInteger", () => {
  it("trims separators and spaces", () => {
    expect(coerceInteger("1,200")).toBe(1200);
    expect(coerceInteger(" 42 ")).toBe(42);
  });
  it("truncates floats so a later validation pass can flag them", () => {
    expect(coerceInteger(45.9)).toBe(45);
  });
  it("rejects non-integers", () => {
    expect(coerceInteger("abc")).toBeNull();
    expect(coerceInteger("12.5")).toBe(12);
  });
  it("blank maps to null", () => {
    expect(coerceInteger(null)).toBeNull();
    expect(coerceInteger("")).toBeNull();
  });
});

describe("coerceNumber", () => {
  it("parses localized decimal numbers", () => {
    expect(coerceNumber("1 234,5".replace(/,/g, "."))).toBe(1234.5);
    expect(coerceNumber("1,234.5")).toBe(1234.5);
    expect(coerceNumber(" 12.5 ")).toBe(12.5);
  });
  it("rejects garbage", () => {
    expect(coerceNumber("NaN")).toBeNull();
    expect(coerceNumber("12.5kg")).toBeNull();
  });
});

describe("coerceDate", () => {
  it("keeps ISO day strings stable in UTC", () => {
    expect(coerceDate("2024-01-15")).toBe("2024-01-15");
    expect(coerceDate("2024-01-15T10:30:00.000Z")).toBe("2024-01-15");
  });
  it("converts Excel serial dates", () => {
    expect(excelSerialToIso(44927)).toBe("2023-01-01");
    expect(coerceDate(44927)).toBe("2023-01-01");
  });
  it("parses human-readable text", () => {
    expect(coerceDate("Jan 15 2024")).toBe("2024-01-15");
  });
  it("rejects invalid dates", () => {
    expect(coerceDate("2024-13-40")).toBeNull();
    expect(coerceDate("not a date")).toBeNull();
  });
});

describe("coerceTime", () => {
  it("normalizes hh:mm", () => {
    expect(coerceTime("8:30")).toBe("08:30:00");
    expect(coerceTime("08:30:45")).toBe("08:30:45");
  });
  it("converts seconds-since-midnight", () => {
    expect(coerceTime(30600)).toBe("08:30:00");
  });
  it("rejects out-of-range", () => {
    expect(coerceTime("25:00")).toBeNull();
    expect(coerceTime("8:75")).toBeNull();
  });
});

describe("coerceText", () => {
  it("trims and nullifies", () => {
    expect(coerceText("  hello ")).toBe("hello");
    expect(coerceText("   ")).toBeNull();
    expect(coerceText(42)).toBe("42");
  });
});