export type DataType =
  | "categorical"
  | "ordinal"
  | "numeric"
  | "numeric-categorical"
  | "numeric-distribution"
  | "time-series"
  | "geospatial";

export type Aggregation = "count" | "sum" | "avg" | "none";

export interface IndicatorDef {
  id: string;
  label: string;
  dataType: DataType;
  /**
   * Value dimensions: typically the suffix/option codes for group fields
   * (e.g. "C10_A") or a physical column code.
   */
  valueField: string;
  /** Optional grouping dimension (e.g. "Block name" column code). */
  dimensionField?: string;
  aggregation: Aggregation;
  /** Bin/geo qualifiers for rule-based chart suggestion. */
  numericBinCount?: number;
  description: string;
}

export interface ComputedStats {
  /** Distinct values in the value column(s). */
  cardinality: number;
  /** Span in days for time data. */
  dateSpanDays: number;
  /** Fraction (0-1) of records missing a value for the indicator. */
  missingRate: number;
  numericShape: "flat" | "spread" | "skewed";
}