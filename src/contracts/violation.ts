export type Severity = "error" | "warning" | "info";

export type ViolationCategory =
  | "type"
  | "range"
  | "required"
  | "value-set"
  | "clinical-contradiction"
  | "sequence"
  | "coherence"
  | "date";

export interface Violation {
  rowId: string;
  ruleId: string;
  /** Stable machine code, e.g. "DELIVERY_BEFORE_ANC". */
  code: string;
  severity: Severity;
  category: ViolationCategory;
  /** Physical column code the violation concerns, when applicable. */
  fieldId?: string;
  /** Deterministic, human-readable message used verbatim in reports. */
  message: string;
  rawValue?: unknown;
  suggestedValue?: unknown;
}

export type ViolationsByRow = Map<string, Violation[]>;

/**
 * Identity of a violation inside a rendered list.
 *
 * `rowId` says which row and `code` which finding, but neither is enough on its
 * own: one row can raise the same code from different fields (H33 and H34 are
 * both `ordinal` and raise INVALID_ORDINAL together; ANM2/ANM3/ANM4 are all
 * sentinel integers and raise SENTINEL_NOT_APPLICABLE together). `fieldId`
 * carries that field identity, falling back to `ruleId` which is always set for
 * row-wide cross-field findings. `rawValue` is the pointer inside the field and
 * separates several findings raised on the same column (one per unmapped
 * select-multiple option token).
 */
export function violationKey(v: Violation): string {
  const field = v.fieldId ?? v.ruleId;
  const raw =
    v.rawValue === undefined
      ? ""
      : typeof v.rawValue === "string"
        ? v.rawValue
        : (JSON.stringify(v.rawValue) ?? "");
  return `${v.rowId}|${v.code}|${field}|${raw}`;
}

export interface KeyedViolation {
  violation: Violation;
  /** Unique and stable for the given list, so React can key it safely. */
  key: string;
}

/**
 * Pair every violation with a key that is unique within the list. The identity
 * key is used as-is for the first occurrence; a repeated identity (only
 * reachable when one field raises the same code for the same raw value twice)
 * gets an occurrence suffix.
 */
export function keyedViolations(list: readonly Violation[]): KeyedViolation[] {
  const seen = new Map<string, number>();
  return list.map((violation) => {
    const base = violationKey(violation);
    const occurrence = seen.get(base) ?? 0;
    seen.set(base, occurrence + 1);
    return { violation, key: occurrence === 0 ? base : `${base}|${occurrence}` };
  });
}

export function severityRank(severity: Severity): number {
  switch (severity) {
    case "error":
      return 2;
    case "warning":
      return 1;
    case "info":
      return 0;
  }
}