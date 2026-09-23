import type { ParsedSheet, ParseSource } from "@/schema/engine/normalize";
import { workerScope } from "@/lib/workerScope";

export type ParseRequest = {
  type: "parse";
  payload: {
    buffer: ArrayBuffer;
    fileName: string;
    sheetName?: string;
    sizeBytes: number;
    importedAt: string;
  };
};

export type ParseResponse =
  | { ok: true; data: ParsedSheet }
  | { ok: false; error: string };

export async function parsePayload(payload: ParseRequest["payload"]): Promise<ParsedSheet> {
  const { read, utils } = await import("xlsx");
  const wb = read(new Uint8Array(payload.buffer), {
    type: "array",
    cellDates: true,
  });
  const sheetName = payload.sheetName ?? wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Workbook has no sheet "${sheetName}".`);
  const objects = utils.sheet_to_json(sheet, { defval: null, raw: true }) as Array<
    Record<string, unknown>
  >;
  if (objects.length === 0) throw new Error("The sheet is empty (no data rows).");

  const { normalizeRows } = await import("@/schema/engine/normalize");
  const { getDatasetSchema } = await import("@/schema");
  const schema = getDatasetSchema("2026.1", "vhsnd");
  const source: ParseSource = {
    fileName: payload.fileName,
    sheetName,
    sizeBytes: payload.sizeBytes,
    headerRow: 1,
    importedAt: payload.importedAt,
  };
  return normalizeRows(objects, schema.fields, source);
}

const scope = workerScope();
scope.onmessage = async (event: MessageEvent<ParseRequest>) => {
  if (event.data?.type !== "parse") {
    scope.postMessage({ ok: false, error: "Unknown message type." } satisfies ParseResponse);
    return;
  }
  try {
    const data = await parsePayload(event.data.payload);
    scope.postMessage({ ok: true, data } satisfies ParseResponse);
  } catch (err) {
    scope.postMessage({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies ParseResponse);
  }
};

export {};