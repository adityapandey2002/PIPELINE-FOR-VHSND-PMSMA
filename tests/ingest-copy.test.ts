import { describe, expect, it } from "vitest";
import { collapsedNotice } from "@/lib/ingestCopy";

describe("collapsedNotice", () => {
  it("takes responsibility when our own resolution merged the columns", () => {
    const notice = collapsedNotice(["resolved-title"]);
    expect(notice).toContain("resolved onto the same field");
    expect(notice).not.toContain("file carries");
  });

  it("points at the export when the file repeats a code it owns", () => {
    const notice = collapsedNotice(["sheet-code"]);
    expect(notice).toContain("repeats one code across several columns");
    expect(notice).not.toContain("resolved onto the same field");
  });

  it("covers both when the warning lists both kinds", () => {
    const notice = collapsedNotice(["sheet-code", "resolved-title"]);
    expect(notice).toContain("two ways");
  });

  it("stays silent when there is nothing to explain", () => {
    expect(collapsedNotice([])).toBe("");
  });
});
