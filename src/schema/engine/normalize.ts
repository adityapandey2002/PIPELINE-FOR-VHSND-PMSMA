import type { NormalizedRow, CellValue, SourceMeta } from "@/contracts/dataset";
import type { FieldDef } from "@/schema/dsl";
import { buildHeaderMap } from "./headerNormalizer";
import { columnLabel } from "@/schema/columns-vhsnd";
import {
  coerceBoolean,
  coerceChoiceText,
  coerceCodedText,
  coerceDate,
  coerceNumber,
  coerceOrdinal,
  coerceSentinelNumber,
  coerceText,
  coerceTime,
  isMissingToken,
} from "./cellCoercers";

export interface CollapsedColumn {
  /** The label that resolved ambiguously. */
  label: string;
  /** The code every one of these columns resolved to; only the first was kept. */
  keptCode: string;
  /** How many columns carried this same label. */
  count: number;
}

export interface ParsedSheet {
  rows: NormalizedRow[];
  skippedRows: number;
  /** original header name -> canonical code (or original if unknown). */
  headerMap: Record<string, string>;
  /** canonical codes actually present in the source. */
  presentColumns: string[];
  /**
   * Columns dropped because their label resolved to a code an earlier column
   * already claimed. Non-empty only for single-header sheets, where repeated
   * labels such as the form's 11 "Others (Specify)" columns cannot be told
   * apart. Reported so the loss is never silent.
   */
  collapsedColumns: CollapsedColumn[];
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
 *
 * `def` is optional so callers that only know a type string keep working, but
 * passing it enables sentinel handling and ordinal scales.
 */
export function coerceFieldValue(type: string, v: unknown, def?: FieldDef): CellValue {
  if (v === null || v === undefined) return null;
  switch (type) {
    case "boolean":
      return coerceBoolean(v as CellValue);
    case "integer":
      return coerceSentinelNumber(v as CellValue, def?.sentinels, def?.sentinelMeaning);
    case "ordinal":
      return coerceOrdinal(v as CellValue);
    case "number":
      return coerceNumber(v as CellValue);
    case "date":
      return coerceDate(v as CellValue);
    case "time":
      return coerceTime(v as CellValue);
    case "text":
      // Hand-typed boxes keep "NA" as content; coded answers treat it as filler.
      return def?.freeText ? coerceText(v as CellValue) : coerceCodedText(v as CellValue);
    case "choice":
      return coerceChoiceText(v as CellValue);
    case "group": {
      // A select-multiple's one-hot child column: a strict yes/no flag.
      return coerceBoolean(v as CellValue);
    }
    case GROUP_TOKENS: {
      // The select-multiple's parent cell holds the space-delimited choice
      // tokens ("A C") that the children also encode. Keep them verbatim so
      // the validator can cross-check the two encodings instead of the tokens
      // being silently dropped by boolean coercion.
      return coerceChoiceText(v as CellValue);
    }
    default:
      return coerceText(v as CellValue) ?? (typeof v === "number" ? v : null);
  }
}

/**
 * Internal marker for a select-multiple's parent cell. Not part of
 * `FieldType`: it describes how a physical column is stored, not what the
 * question asks.
 */
export const GROUP_TOKENS = "group_tokens";

/**
 * What a normalized cell keeps.
 *
 * A value the field's type cannot read is dropped, so a "no answer" token
 * (`Na`, `N/A`, ...) and an unparseable cell never turn into data, and a
 * declared sentinel stays out of `values` so no sum, mean or fill-rate can
 * ever read it. `undefined` means the cell stays absent.
 */
function keepCell(coerced: CellValue): CellValue | undefined {
  if (coerced === null || coerced === "") return undefined;
  return coerced;
}

/** Build a column -> field-type map (groups expand to their option columns). */
export function buildTypeMap(fields: FieldDef[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const f of fields) {
    if (f.type === "group") {
      map.set(f.id, GROUP_TOKENS);
      for (const opt of f.group?.options ?? []) {
        map.set(`${f.id}_${opt.code}`, "group");
      }
      continue;
    }
    map.set(f.id, f.type);
  }
  return map;
}

export interface FieldCoercer {
  /** The schema's label for a column, for use in messages. */
  labelOf: (fieldId: string) => string;
  /**
   * Reads a user-entered replacement value the same way an imported cell is
   * read, so an override can never store a shape the field cannot hold.
   */
  coerce: (fieldId: string, raw: CellValue) => CellValue;
  /** Why a replacement was rejected, or null when it is acceptable. */
  reject: (fieldId: string, raw: CellValue) => string | null;
}

/** Builds the field-aware coercion used for both import and row overrides. */
export function buildFieldCoercer(fields: FieldDef[]): FieldCoercer {
  const typeMap = buildTypeMap(fields);
  const defById = new Map(fields.map((f) => [f.id, f]));

  const coerce = (fieldId: string, raw: CellValue): CellValue => {
    const type = typeMap.get(fieldId);
    const def = defById.get(fieldId);
    return type ? coerceFieldValue(type, raw, def) : coerceText(raw);
  };

  return {
    labelOf: (fieldId) => defById.get(fieldId)?.label ?? columnLabel(fieldId),
    coerce,
    reject: (fieldId, raw) => {
      const text = typeof raw === "string" ? raw.trim() : raw;
      if (isMissingToken(text)) return null;
      if (coerce(fieldId, text as CellValue) === null) {
        const label = defById.get(fieldId)?.label ?? columnLabel(fieldId);
        return `"${String(text)}" is not a valid value for ${label}.`;
      }
      return null;
    },
  };
}

/** Normalize an array-of-objects (row per object) into normalized rows. */
export function normalizeRows(
  objects: Array<Record<string, unknown>>,
  fields: FieldDef[],
  source: ParseSource,
): ParsedSheet {
  const header = buildHeaderMap();
  const typeMap = buildTypeMap(fields);
  const defById = new Map(fields.map((f) => [f.id, f]));
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
      const def = defById.get(canonical);
      const kept = keepCell(
        type ? coerceFieldValue(type, rawValue, def) : coerceText(rawValue as CellValue),
      );
      if (kept === undefined) continue;
      values[canonical] = kept;
      anyValue = true;
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
    collapsedColumns: [],
    meta: {
      fileName: source.fileName,
      sheetName: source.sheetName,
      sizeBytes: source.sizeBytes,
      headerRow: source.headerRow,
      importedAt: source.importedAt,
    },
  };
}

/**
 * Result of locating the header block in a raw sheet.
 *
 * ODK/XLSForm exports carry two header rows: human labels (often translated)
 * followed by the physical column codes. The codes are the only stable
 * identity, so when they are present we map by code *and position* and ignore
 * label text entirely.
 */
export interface HeaderLayout {
  /** Physical codes, aligned to the sheet's column indexes. */
  codes: string[];
  /** Human labels for display; same length as `codes`. */
  labels: string[];
  /** Number of header rows consumed (1 or 2). */
  headerRows: number;
  /** 0-based index of the first data row. */
  dataStart: number;
}

/** Fraction of a row's cells that must be known codes to accept it as a code row. */
const CODE_ROW_THRESHOLD = 0.9;

/**
 * Locate the header block. Prefers a code row (2 headers) and falls back to a
 * single label row, which is resolved through the header normalizer.
 */
export function detectHeaderLayout(
  aoa: unknown[][],
  known: Set<string>,
  resolveLabel: (label: string) => string,
): HeaderLayout {
  const first = aoa[0] ?? [];
  const labels = first.map((c) => (c === null || c === undefined ? "" : String(c)));

  const candidate = (aoa[1] ?? []).map((c) => (c === null || c === undefined ? "" : String(c)));
  const nonEmpty = candidate.filter((c) => c.trim() !== "");
  const knownHits = nonEmpty.filter((c) => known.has(c.trim())).length;
  const looksLikeCodeRow =
    nonEmpty.length > 0 && knownHits / nonEmpty.length >= CODE_ROW_THRESHOLD;

  if (looksLikeCodeRow) {
    return { codes: candidate, labels, headerRows: 2, dataStart: 2 };
  }

  return {
    codes: labels.map((l) => (l.trim() === "" ? "" : resolveLabel(l))),
    labels,
    headerRows: 1,
    dataStart: 1,
  };
}

/**
 * Parse a raw sheet given as an array-of-arrays.
 *
 * Columns are keyed by the code row, so duplicate human labels (the form has
 * 11 columns all titled "Others (Specify)") no longer collapse onto one field.
 * Repeated codes keep their first occurrence, matching the sheet's column order.
 */
export function normalizeAoa(
  aoa: unknown[][],
  fields: FieldDef[],
  source: ParseSource,
  knownColumns: Set<string>,
  resolveLabel: (label: string) => string,
): ParsedSheet {
  const layout = detectHeaderLayout(aoa, knownColumns, resolveLabel);
  const typeMap = buildTypeMap(fields);
  const defById = new Map(fields.map((f) => [f.id, f]));

  // code -> first column index that carries it
  const firstIndexFor = new Map<string, number>();
  const collapsed = new Map<string, { label: string; keptCode: string; count: number }>();
  layout.codes.forEach((code, i) => {
    const c = code.trim();
    if (c === "") return;
    const seen = firstIndexFor.get(c);
    if (seen === undefined) {
      firstIndexFor.set(c, i);
      return;
    }
    const label = layout.labels[i]?.trim() || c;
    const entry = collapsed.get(label);
    if (entry) entry.count += 1;
    else collapsed.set(label, { label, keptCode: c, count: 2 });
  });

  const headerMap: Record<string, string> = {};
  const presentColumns: string[] = [];
  for (const [code, index] of firstIndexFor) {
    headerMap[layout.labels[index]?.trim() || code] = code;
    presentColumns.push(code);
  }

  const rows: NormalizedRow[] = [];
  let skipped = 0;

  for (let r = layout.dataStart; r < aoa.length; r++) {
    const cells = aoa[r] ?? [];
    const values: Record<string, CellValue> = {};
    let anyValue = false;
    for (const [code, index] of firstIndexFor) {
      const raw = cells[index];
      if (raw === null || raw === undefined || raw === "") continue;
      const type = typeMap.get(code);
      const def = defById.get(code);
      const kept = keepCell(
        type ? coerceFieldValue(type, raw, def) : coerceText(raw as CellValue),
      );
      if (kept === undefined) continue;
      values[code] = kept;
      anyValue = true;
    }
    if (!anyValue) {
      skipped += 1;
      continue;
    }
    rows.push({ id: `r${r}`, sourceRow: r, values });
  }

  return {
    rows,
    skippedRows: skipped,
    headerMap,
    presentColumns,
    collapsedColumns: [...collapsed.values()],
    meta: {
      fileName: source.fileName,
      sheetName: source.sheetName,
      sizeBytes: source.sizeBytes,
      headerRow: layout.headerRows,
      importedAt: source.importedAt,
    },
  };
}