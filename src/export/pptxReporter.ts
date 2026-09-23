import PptxGenJS from "pptxgenjs";
import type { ReportContext } from "@/export/reportContext";

const COLORS = {
  primary: "0F6C5A",
  text: "1A2430",
  muted: "5B6B7C",
  error: "B42318",
  line: "D9DEE8",
};

type TableCell = { text: string };
type TableRow = TableCell[];

function toRows(rows: (string | number)[][]): TableRow[] {
  return rows.map((r) => r.map((c) => ({ text: String(c) })));
}

/** Build a slide deck from the report context. Returns a Blob for download. */
export async function generatePptxReport(
  ctx: ReportContext,
  charts: { blob: Blob }[],
): Promise<Blob> {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = ctx.app.name;
  pptx.title = ctx.dataset.name;

  // Title slide
  const titleSlide = pptx.addSlide();
  titleSlide.background = { color: "FFFFFF" };
  titleSlide.addText(ctx.app.name, {
    x: 0.7, y: 1.4, w: 12.0, h: 0.6, fontSize: 20, color: COLORS.primary, bold: true,
  });
  titleSlide.addText(ctx.dataset.name, {
    x: 0.7, y: 2.1, w: 12.0, h: 0.9, fontSize: 30, color: COLORS.text, bold: true,
  });
  titleSlide.addText(
    `Generated on ${new Date(ctx.generatedAt).toLocaleString("en-IN")} · schema ${ctx.app.schemaVersion} · manifest ${ctx.manifest.slice(0, 12)}…`,
    { x: 0.7, y: 3.2, w: 12.0, h: 0.4, fontSize: 12, color: COLORS.muted },
  );

  // Summary slide
  const summarySlide = pptx.addSlide();
  summarySlide.addText("Summary of cleaning", {
    x: 0.7, y: 0.4, w: 12.0, h: 0.6, fontSize: 22, color: COLORS.primary, bold: true,
  });
  const rows: (string | number)[][] = [
    ["Rows imported", ctx.dataset.totalRows],
    ["Rows kept after cleaning", ctx.summary.keptRows],
    ["Rows dropped", ctx.summary.droppedRows],
    ["Unresolved errors", ctx.summary.unresolvedErrors],
    ["Errors (total)", ctx.summary.errorCount],
    ["Warnings (total)", ctx.summary.warningCount],
  ];
  summarySlide.addTable(toRows(rows), {
    x: 0.7, y: 1.2, w: 7.0, fontSize: 13, color: COLORS.text,
    fill: { color: "EEF1F6" }, border: { color: COLORS.line, pt: 0.5 },
    rowH: 0.42, valign: "middle",
  });

  // Indicator headline figures
  const indSlide = pptx.addSlide();
  indSlide.addText("Key indicators", { x: 0.7, y: 0.4, w: 12.0, h: 0.6, fontSize: 22, color: COLORS.primary, bold: true });
  const indRows = ctx.indicators.map((i, idx) => [`${idx + 1}. ${i.label}`, i.value]);
  indSlide.addTable(toRows(indRows), {
    x: 0.7, y: 1.2, w: 12.2, fontSize: 12, color: COLORS.text,
    border: { color: COLORS.line, pt: 0.5 }, rowH: 0.34, valign: "middle",
  });

  // One slide per saved chart
  for (let i = 0; i < ctx.charts.length; i += 1) {
    const chart = ctx.charts[i];
    const blob = charts[i];
    const slide = pptx.addSlide();
    slide.addText(`${i + 1}. ${chart.title}`, {
      x: 0.7, y: 0.4, w: 12.0, h: 0.6, fontSize: 20, color: COLORS.primary, bold: true,
    });
    if (blob) {
      const dataUrl = await blobToDataUrl(blob.blob);
      slide.addImage({
        data: dataUrl,
        x: 0.7, y: 1.2, w: 12.0, h: 5.2,
        sizing: { type: "contain", w: 12.0, h: 5.2 },
      });
    } else {
      slide.addText("Chart image not captured.", { x: 0.7, y: 1.5, w: 12, h: 0.4, fontSize: 12, color: COLORS.muted });
    }
  }

  // Audit appendix
  const auditSlide = pptx.addSlide();
  auditSlide.addText("Audit log of decisions", {
    x: 0.7, y: 0.4, w: 12.0, h: 0.6, fontSize: 22, color: COLORS.primary, bold: true,
  });
  const auditRows = ctx.audit.map((a) => [
    a.rowId,
    a.status,
    a.justification || "—",
    a.decidedAt ? new Date(a.decidedAt).toLocaleString("en-IN") : "—",
  ]);
  const tableData = [["Row", "Decision", "Reason", "At"], ...auditRows];
  auditSlide.addTable(toRows(tableData), {
    x: 0.7, y: 1.2, w: 12.2, fontSize: 10, color: COLORS.text,
    border: { color: COLORS.line, pt: 0.5 }, rowH: 0.3, valign: "middle",
  });

  const arrayBuf = await pptx.write({ outputType: "arraybuffer" });
  return new Blob([arrayBuf as ArrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}