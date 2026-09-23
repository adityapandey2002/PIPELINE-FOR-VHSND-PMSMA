export type ChartKind =
  | "bar-vertical"
  | "bar-horizontal"
  | "pie"
  | "line"
  | "area"
  | "histogram"
  | "scatter"
  | "table";

export interface ChartConfig {
  kind: ChartKind;
  indicatorId: string;
  title: string;
  /** Grouping column when the chart is dimensioned. */
  dimension?: string;
  valueKey: string;
  props: Record<string, unknown>;
}

export interface ChartImage {
  mime: "image/png";
  /** PNG bytes. Stored as a Blob in IndexedDB, never as a base64 string. */
  blob: Blob;
  width: number;
  height: number;
}

export interface SavedChart {
  id: string;
  datasetId: string;
  kind: ChartKind;
  indicatorId: string;
  title: string;
  createdAt: string;
  config: ChartConfig;
  /** Present once the chart has been captured to a PNG. */
  image?: {
    width: number;
    height: number;
    /** IndexedDB key where the Blob lives; the store manages it. */
    blobKey: string;
  };
}

export interface ChartSuggestion {
  kind: ChartKind;
  label: string;
  reason: string;
  /** A rule score for ordering (higher = better fit). */
  score: number;
}