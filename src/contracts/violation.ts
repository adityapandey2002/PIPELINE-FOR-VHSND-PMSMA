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