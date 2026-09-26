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

  // Read as arrays, never as objects. `sheet_to_json` would treat the first
  // row as keys -- collapsing the form's repeated "Others (Specify)" labels --
  // and would ingest the physical code row as if it were data.
  const aoa = utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false,
  });
  if (aoa.length === 0) throw new Error("The sheet is empty (no data rows).");

  const { normalizeAoa } = await import("@/schema/engine/normalize");
  const { buildHeaderMap } = await import("@/schema/engine/headerNormalizer");
  const { getDatasetSchema } = await import("@/schema");
  const schema = getDatasetSchema("2026.1", "vhsnd");
  const header = buildHeaderMap();

  const source: ParseSource = {
    fileName: payload.fileName,
    sheetName,
    sizeBytes: payload.sizeBytes,
    headerRow: 1,
    importedAt: payload.importedAt,
  };
  return normalizeAoa(aoa, schema.fields, source, header.knownColumns, header.normalize);
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