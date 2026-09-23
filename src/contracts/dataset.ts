export type CellValue = string | number | boolean | null;

export type RawRecord = Record<string, unknown>;

/** A single normalized row: values keyed by physical column code/header. */
export interface NormalizedRow {
  id: string;
  /** 0-based index of the source row (for traceability back to the file). */
  sourceRow: number;
  values: Record<string, CellValue>;
}

export type DatasetKind = "vhsnd" | "pmsma";

export interface SourceMeta {
  fileName: string;
  sheetName: string;
  sizeBytes: number;
  headerRow: number;
  importedAt: string;
}

export interface DatasetSnapshot {
  id: string;
  kind: DatasetKind;
  name: string;
  source: SourceMeta;
  schemaVersion: string;
  schemaHash: string;
  totalRows: number;
  rows: NormalizedRow[];
  /** Rows intentionally excluded at parse time (e.g. fully empty rows). */
  skippedRows: number;
}

export interface DatasetSummary {
  id: string;
  kind: DatasetKind;
  name: string;
  fileName: string;
  totalRows: number;
  importedAt: string;
  schemaVersion: string;
}

export function emptyValue(): CellValue {
  return null;
}

export function isBlank(v: CellValue | undefined): v is null | undefined {
  return v === null || v === undefined;
}