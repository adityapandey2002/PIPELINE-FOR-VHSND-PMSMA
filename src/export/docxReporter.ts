import { createReport } from "docx-templates";
import type { ReportContext } from "@/export/reportContext";

export interface DocxChartImage {
  blobKey: string;
  blob: Blob;
  width: number;
  height: number;
}

const PX_TO_CM = 2.54 / 96;

export async function renderDocxReport(
  templateBytes: Uint8Array,
  ctx: ReportContext,
  chartImages: DocxChartImage[] = [],
): Promise<Blob> {
  const byKey = new Map(chartImages.map((c) => [c.blobKey, c]));

  const data = {
    ...(ctx as unknown as Record<string, unknown>),
    charts: ctx.charts.filter((c) => c.blobKey !== null && byKey.has(c.blobKey)),
  };

  const report = await createReport({
    template: templateBytes,
    data,
    additionalJsContext: {
      chartImage: async (blobKey: string) => {
        const entry = byKey.get(blobKey);
        if (!entry) return undefined;
        const buffer = await entry.blob.arrayBuffer();
        const widthPx = entry.width > 0 ? entry.width : 640;
        const heightPx = entry.height > 0 ? entry.height : 360;
        return {
          width: widthPx * PX_TO_CM,
          height: heightPx * PX_TO_CM,
          data: buffer,
          extension: ".png" as const,
          alt: "chart",
        };
      },
    },
    cmdDelimiter: ["{{", "}}"],
    processLineBreaks: true,
  });
  const bytes = report as unknown as Uint8Array;
  return new Blob([bytes as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
