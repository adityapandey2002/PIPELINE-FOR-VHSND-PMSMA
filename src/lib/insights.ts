import type { DatasetSnapshot, CellValue } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import type { RowResolution } from "@/contracts/resolution";
import type { IndicatorSeries } from "@/schema/indicators";
import { columnLabel, VHSND_COLUMNS } from "@/schema/columns-vhsnd";
import { deriveCleanRows, unresolvedErrors } from "@/lib/derive";

export interface ColumnStat {
  code: string;
  label: string;
  filled: number;
  unique: number;
  fillRate: number;
}

export interface DatasetInsights {
  totalRows: number;
  skippedRows: number;
  /** Schema columns that carry at least one value. */
  columnsPresent: number;
  /** Schema columns present in the file but with no values at all. */
  columnsEmpty: number;
  /** Schema columns that do not appear in the file at all (expected for partial exports). */
  columnsMissing: number;
  columnsExpected: number;
  /** Back-compat alias: schema columns absent from the file. */
  ignoredColumns: number;
  /** Codes of the schema columns absent from the file. */
  missingCodes: string[];
  columnStats: ColumnStat[];
  topFilled: ColumnStat[];
  sparseColumns: ColumnStat[];
}

export function computeDatasetInsights(dataset: DatasetSnapshot | null): DatasetInsights | null {
  if (!dataset) return null;
  const total = dataset.totalRows;
  const filledMap = new Map<string, number>();
  const uniqueMap = new Map<string, Set<CellValue>>();
  const withValues = new Set<string>();
  for (const row of dataset.rows) {
    for (const [code, val] of Object.entries(row.values)) {
      withValues.add(code);
      if (val !== null && val !== undefined && val !== "") {
        filledMap.set(code, (filledMap.get(code) ?? 0) + 1);
        if (!uniqueMap.has(code)) uniqueMap.set(code, new Set());
        uniqueMap.get(code)!.add(val);
      }
    }
  }
  const columnStats: ColumnStat[] = Array.from(filledMap.entries())
    .map(([code, filled]) => ({
      code,
      label: columnLabel(code),
      filled,
      unique: uniqueMap.get(code)?.size ?? 0,
      fillRate: total ? filled / total : 0,
    }))
    .sort((a, b) => b.fillRate - a.fillRate || a.code.localeCompare(b.code));

  const expectedCodes = VHSND_COLUMNS.map((c) => c.code);
  // A column can be in the export and still hold no value, so presence has to
  // come from the parser's column list. Snapshots stored before that list was
  // persisted fall back to "holds some value", which cannot see an all-blank
  // column and so folds it into the missing count.
  const physicalCodes: ReadonlySet<string> = dataset.presentColumns
    ? new Set(dataset.presentColumns)
    : withValues;
  const missingCodes = expectedCodes.filter((c) => !physicalCodes.has(c));
  const emptyPresent = expectedCodes.filter((c) => physicalCodes.has(c) && !filledMap.has(c));

  return {
    totalRows: total,
    skippedRows: dataset.skippedRows,
    columnsPresent: filledMap.size,
    columnsEmpty: emptyPresent.length,
    columnsMissing: missingCodes.length,
    columnsExpected: expectedCodes.length,
    ignoredColumns: missingCodes.length,
    missingCodes,
    columnStats,
    topFilled: columnStats.slice(0, 12),
    sparseColumns: columnStats.filter((c) => c.fillRate < 0.5),
  };
}

export interface CleaningInsights {
  totalRows: number;
  keptRows: number;
  droppedRows: number;
  pendingRows: number;
  errors: number;
  warnings: number;
  info: number;
  unresolvedErrors: number;
  byCategory: Record<string, number>;
}

export function computeCleaningInsights(
  dataset: DatasetSnapshot | null,
  violations: Violation[],
  resolutions: Record<string, RowResolution>,
): CleaningInsights | null {
  if (!dataset) return null;
  const clean = deriveCleanRows(dataset, violations, resolutions);
  const unresolved = unresolvedErrors(violations, resolutions);
  const byCategory: Record<string, number> = {};
  for (const v of violations) byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
  return {
    totalRows: dataset.totalRows,
    keptRows: clean.rows.length,
    droppedRows: clean.dropped.length,
    pendingRows: clean.pending.length,
    errors: violations.filter((v) => v.severity === "error").length,
    warnings: violations.filter((v) => v.severity === "warning").length,
    info: violations.filter((v) => v.severity === "info").length,
    unresolvedErrors: unresolved.length,
    byCategory,
  };
}

export interface VizInsights {
  cleanRows: number;
  totalRows: number;
  droppedRows: number;
  pendingRows: number;
  cardinality: number;
  missingRate: number;
  dateSpanDays: number;
  numericShape: string;
  pointCount: number;
  numericSummary: { min: number; max: number; mean: number; count: number } | null;
}

export function computeVizInsights(
  dataset: DatasetSnapshot | null,
  violations: Violation[],
  resolutions: Record<string, RowResolution>,
  series: IndicatorSeries,
): VizInsights | null {
  if (!dataset) return null;
  const clean = deriveCleanRows(dataset, violations, resolutions);
  const s = series.samples;
  const numericSummary = s.length
    ? {
        min: Math.min(...s),
        max: Math.max(...s),
        mean: s.reduce((a, b) => a + b, 0) / s.length,
        count: s.length,
      }
    : null;
  return {
    cleanRows: clean.rows.length,
    totalRows: dataset.totalRows,
    droppedRows: clean.dropped.length,
    pendingRows: clean.pending.length,
    cardinality: series.stats.cardinality,
    missingRate: series.stats.missingRate,
    dateSpanDays: series.stats.dateSpanDays,
    numericShape: series.stats.numericShape,
    pointCount: series.points.length,
    numericSummary,
  };
}
