import type { CleanRow } from "@/contracts/resolution";
import type { RowResolution } from "@/contracts/resolution";
import type { DatasetSnapshot } from "@/contracts/dataset";
import type { Violation } from "@/contracts/violation";
import type { FieldCoercer } from "@/schema/engine/normalize";
import { applyResolution } from "@/contracts/resolution";
import { buildFieldCoercer } from "@/schema/engine/normalize";
import { getDatasetSchema } from "@/schema";

export interface DerivedClean {
  /** Rows that flow into reports (kept + overrides applied). */
  rows: CleanRow[];
  /** Rows the user dropped. */
  dropped: CleanRow[];
  /** Kept rows that still carry an unresolved error, i.e. rows awaiting a decision. */
  pending: CleanRow[];
}

/**
 * Field coercion for a dataset, or null when its schema cannot be resolved.
 * A dataset saved under an older schema version must not break the review
 * screen, so callers fall back to leaving values untouched.
 */
const coercerCache = new Map<string, FieldCoercer | null>();

function coercerFor(dataset: DatasetSnapshot): FieldCoercer | null {
  const cacheKey = `${dataset.schemaVersion}:${dataset.kind}`;
  const cached = coercerCache.get(cacheKey);
  if (cached !== undefined) return cached;
  let built: FieldCoercer | null = null;
  try {
    built = buildFieldCoercer(getDatasetSchema(dataset.schemaVersion, dataset.kind).fields);
  } catch {
    built = null;
  }
  coercerCache.set(cacheKey, built);
  return built;
}

export function deriveCleanRows(
  dataset: DatasetSnapshot | null,
  violations: Violation[],
  resolutions: Record<string, RowResolution>,
): DerivedClean {
  if (!dataset) return { rows: [], dropped: [], pending: [] };
  const coercer = coercerFor(dataset);
  const rows: CleanRow[] = [];
  const dropped: CleanRow[] = [];
  const pending: CleanRow[] = [];
  const awaiting = new Set(unresolvedErrors(violations, resolutions).map((v) => v.rowId));
  for (const row of dataset.rows) {
    const res = resolutions[row.id];
    const outcome = applyResolution(row, res, coercer?.coerce);
    const clean: CleanRow = { rowId: row.id, values: outcome.values };
    if (!outcome.keep) {
      dropped.push(clean);
      continue;
    }
    if (awaiting.has(row.id)) pending.push(clean);
    rows.push(clean);
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