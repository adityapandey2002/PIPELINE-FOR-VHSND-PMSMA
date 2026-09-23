import { createReport } from "docx-templates";
import type { ReportContext } from "@/export/reportContext";

/**
 * Renders an official .docx template (embedded at build time) with the report
 * context. `data` is frozen and passed as the template's context: template
 * authors can reference e.g. `dataset.name`, `summary`, `indicators`,
 * `audit`, `manifest`. Executable expressions are intentionally restricted to
 * pure reads of this context (no additionalJsContext), keeping template code
 * sandboxed.
 */
export async function renderDocxReport(
  templateBytes: Uint8Array,
  ctx: ReportContext,
): Promise<Blob> {
  const report = await createReport({
    template: templateBytes,
    data: ctx as unknown as Record<string, unknown>,
    additionalJsContext: undefined,
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