export type ResolutionStatus = "pending" | "keep" | "drop" | "override";

export interface RowResolution {
  rowId: string;
  status: ResolutionStatus;
  /** Replacement values keyed by physical column code (only when status = "override"). */
  overrides?: Record<string, CellValue>;
  /** Violation codes the user explicitly acknowledged while keeping the row. */
  keptViolations?: string[];
  /** Required when dropping or overriding — the audit trail entry. */
  justification?: string;
  decidedAt?: string;
  decidedBy?: "user";
}

import type { CellValue } from "./dataset";

/** Clean-dataset derivation: rows kept or overridden, overrides applied. */
export interface CleanRow {
  rowId: string;
  values: Record<string, CellValue>;
}

export function applyResolution(
  row: { id: string; values: Record<string, CellValue> },
  resolution: RowResolution | undefined,
): { keep: boolean; values: Record<string, CellValue> } {
  if (!resolution || resolution.status === "pending") {
    return { keep: true, values: row.values };
  }
  if (resolution.status === "drop") {
    return { keep: false, values: row.values };
  }
  if (resolution.status === "override" && resolution.overrides) {
    return {
      keep: true,
      values: { ...row.values, ...resolution.overrides },
    };
  }
  return { keep: true, values: row.values };
}