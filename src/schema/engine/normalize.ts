import type { NormalizedRow, CellValue, SourceMeta } from "@/contracts/dataset";
import type { FieldDef } from "@/schema/dsl";
import { buildHeaderMap } from "./headerNormalizer";
import { coerceBoolean, coerceDate, coerceInteger, coerceNumber, coerceText, coerceTime } from "./cellCoercers";

export interface ParsedSheet {
  rows: NormalizedRow[];
  skippedRows: number;
  /** original header name -> canonical code (or original if unknown). */
  headerMap: Record<string, string>;
  /** canonical codes actually present in the source. */
  presentColumns: string[];
  meta: SourceMeta;
}

export interface ParseSource {
  fileName: string;
  sheetName: string;
  sizeBytes: number;
  headerRow: number;
  importedAt: string;
}

/**
 * Coerces one raw cell to a clean value using the schema field's type.
 * Unknown fields fall back to tolerant text/number coercion.
 */
export function coerceFieldValue(type: string, v: unknown): CellValue {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "boolean":
      return coerceBoolean(v as CellValue);
    case "integer":
      return coerceInteger(v as CellValue);
    case "number":
      return coerceNumber(v as CellValue);
    case "date":
      return coerceDate(v as CellValue);
    case "time":
      return coerceTime(v as CellValue);
    case "text":
    case "choice":
      return coerceText(v as CellValue);
    case "group": {
      // Group option cells are boolean-like.
      return coerceBoolean(v as CellValue);
    }
    default:
      return coerceText(v as CellValue) ?? (typeof v === "number" ? v : null);
  }
}

/** Build a column -> field-type map (groups expand to their option columns). */
export function buildTypeMap(fields: FieldDef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) {
    map.set(f.id, f.type);
    if (f.type === "group") {
      for (const opt of f.group?.options ?? []) {
        map.set(`${f.id}_${opt.code}`, "group");
      }
    }
  }
  return map;
}

/** Normalize an array-of-objects (row per object) into normalized rows. */
export function normalizeRows(
  objects: Array<Record<string, unknown>>,
  fields: FieldDef[],
  source: ParseSource,
): ParsedSheet {
  const header = buildHeaderMap();
  const typeMap = buildTypeMap(fields);
  const headerMap: Record<string, string> = {};
  const presentColumns = new Set<string>();
  const rows: NormalizedRow[] = [];
  let skipped = 0;

  objects.forEach((obj, idx) => {
    const values: Record<string, CellValue> = {};
    let anyValue = false;
    for (const [rawHeader, rawValue] of Object.entries(obj)) {
      if (rawHeader === "__EMPTY" || rawHeader.startsWith("__EMPTY_")) continue;
      const canonical = header.normalize(rawHeader);
      headerMap[rawHeader] = canonical;
      presentColumns.add(canonical);
      if (values[canonical] !== undefined) continue; // dedupe repeated headers
      const type = typeMap.get(canonical);
      const clean = type ? coerceFieldValue(type, rawValue) : coerceText(rawValue as CellValue);
      values[canonical] = clean;
      if (clean !== null && clean !== "") anyValue = true;
    }
    if (!anyValue) {
      skipped += 1;
      return;
    }
    rows.push({
      id: `r${idx}`,
      sourceRow: idx,
      values,
    });
  });

  return {
    rows,
    skippedRows: skipped,
    headerMap,
    presentColumns: [...presentColumns],
    meta: {
      fileName: source.fileName,
      sheetName: source.sheetName,
      sizeBytes: source.sizeBytes,
      headerRow: source.headerRow,
      importedAt: source.importedAt,
    },
  };
}

/** Parse a workbook in Excel (array-of-arrays) form using a header row. */
export function normalizeAoa(
  aoa: unknown[][],
  fields: FieldDef[],
  source: ParseSource,
): ParsedSheet {
  const objects: Array<Record<string, unknown>> = [];
  const rowsData = aoa.filter((r) => r.some((c) => c !== null && c !== undefined && c !== ""));
  const [, ...dataRows] = rowsData;
  const headerRow = rowsData[0] ?? [];
  for (const cells of dataRows) {
    const obj: Record<string, unknown> = {};
    headerRow.forEach((h, i) => {
      if (h === null || h === undefined || h === "") return;
      obj[String(h)] = cells[i] ?? null;
    });
    objects.push(obj);
  }
  return normalizeRows(objects, fields, source);
}