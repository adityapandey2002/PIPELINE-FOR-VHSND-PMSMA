import type { CleanRow } from "@/contracts/resolution";
import type { RowResolution } from "@/contracts/resolution";
import type { DatasetSnapshot } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import { applyResolution } from "@/contracts/resolution";

export interface DerivedClean {
  /** Rows that flow into reports (kept + overrides applied). */
  rows: CleanRow[];
  /** Rows the user dropped. */
  dropped: CleanRow[];
  /** Rows still awaiting a decision (when unresolved errors exist). */
  pending: CleanRow[];
}

export function deriveCleanRows(
  dataset: DatasetSnapshot | null,
  resolutions: Record<string, RowResolution>,
): DerivedClean {
  if (!dataset) return { rows: [], dropped: [], pending: [] };
  const rows: CleanRow[] = [];
  const dropped: CleanRow[] = [];
  const pending: CleanRow[] = [];
  for (const row of dataset.rows) {
    const res = resolutions[row.id];
    const outcome = applyResolution(row, res);
    const clean: CleanRow = { rowId: row.id, values: outcome.values };
    if (!outcome.keep) {
      dropped.push(clean);
    } else if (!res || res.status === "pending") {
      pending.push(clean);
      rows.push(clean);
    } else {
      rows.push(clean);
    }
  }
  return { rows, dropped, pending };
}

/**
 * Error violations not yet acknowledged. A row is resolved when it is
 * dropped, overridden, or kept with the specific violation code (or __all)
 * acknowledged.
 */
export function unresolvedErrors(
  violations: Violation[],
  resolutions: Record<string, RowResolution>,
): Violation[] {
  return violations.filter((v) => {
    if (v.severity !== "error") return false;
    const res = resolutions[v.rowId];
    if (!res || res.status === "pending") return true;
    if (res.status === "drop" || res.status === "override") return false;
    if (res.status === "keep") {
      return !(
        res.keptViolations?.includes("__all") || res.keptViolations?.includes(v.code)
      );
    }
    return true;
  });
}