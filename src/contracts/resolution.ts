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
  coerce?: (fieldId: string, raw: CellValue) => CellValue,
): { keep: boolean; values: Record<string, CellValue> } {
  if (!resolution || resolution.status === "pending") {
    return { keep: true, values: row.values };
  }
  if (resolution.status === "drop") {
    return { keep: false, values: row.values };
  }
  if (resolution.status === "override" && resolution.overrides) {
    const merged = { ...row.values, ...resolution.overrides };
    // Re-read every override through the schema so a stored replacement can
    // never carry a shape its column cannot hold.
    return {
      keep: true,
      values: coerce
        ? Object.fromEntries(
            Object.entries(merged).map(([k, v]) => [k, coerce(k, v)]),
          )
        : merged,
    };
  }
  return { keep: true, values: row.values };
}