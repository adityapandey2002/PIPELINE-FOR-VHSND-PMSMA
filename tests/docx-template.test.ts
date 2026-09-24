import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { templates as embeddedTemplates } from "@/export/templates.generated";
import { base64ToBytes, renderDocxReport } from "@/export/docxReporter";
import { buildReportContext } from "@/export/reportContext";
import type { Violation } from "@/contracts/violation";

describe("embedded DOCX template", () => {
  it("ships a generic template in the bundle", () => {
    const doc = embeddedTemplates.find((t) => t.rel.endsWith(".docx"));
    expect(doc).toBeDefined();
    expect((doc?.base64.length ?? 0)).toBeGreaterThan(1000);
  });

  it("renders a non-empty .docx from the generic template", async () => {
    const doc = embeddedTemplates.find((t) => t.rel.endsWith(".docx"));
    if (!doc) throw new Error("No embedded docx template.");

    const ctx = await buildReportContext({
      datasetName: "Test District / July 2026",
      fileName: "vhsnd-sample.xlsx",
      importedAt: "2026-07-14T00:00:00.000Z",
      totalRows: 160,
      rows: [
        { rowId: "r0", values: { H1BP: 3, C1: true } },
        { rowId: "r1", values: { H1BP: 5, C1: false } },
      ],
      resolutions: {
        r1: { rowId: "r1", status: "keep", keptViolations: ["X001"], decidedAt: "2026-07-14T10:00:00.000Z" },
      },
      violations: [
        { rowId: "r1", ruleId: "X001", code: "HIGH_BP", severity: "error", category: "sequence", message: "m" },
      ] satisfies Violation[],
      counts: { error: 1, warning: 0, info: 0 },
      indicatorDefs: [],
      charts: [],
      schemaVersion: "2026.1",
    });

    const blob = await renderDocxReport(base64ToBytes(doc.base64), ctx);
    expect(blob.size).toBeGreaterThan(1000);

    // The .docx is a zip: inspect word/document.xml for the resolved values.
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("Test District / July 2026");
    expect(xml).toContain("vhsnd-sample.xlsx");
    // Loops resolved: the audit entry and manifest are present.
    expect(xml).toContain("r1");
    expect(xml).toContain("keep");
    expect(ctx.manifest).toMatch(/^[0-9a-f]{64}$/);
  });
});