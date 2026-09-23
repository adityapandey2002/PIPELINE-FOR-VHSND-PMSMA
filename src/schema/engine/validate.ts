import type { NormalizedRow, CellValue } from "@/contracts/dataset";
import type { Severity, Violation, ViolationCategory } from "@/contracts/violation";
import type { DatasetSchemaDef, RuleContext } from "@/schema/dsl";
import {
  coerceBoolean,
  coerceDate,
  coerceInteger,
  coerceNumber,
  coerceTime,
  coerceText,
} from "./cellCoercers";

export interface ValidateOptions {
  /** Deterministic reference day (YYYY-MM-DD). Defaults to the latest SubmissionDate. */
  refDate?: string | null;
}

export interface ValidateResult {
  violations: Violation[];
  byRow: Map<string, Violation[]>;
  counts: { [S in Severity]: number };
}

/** Compute a deterministic dataset-wide reference date. */
export function referenceDate(rows: NormalizedRow[]): string | null {
  let max: string | null = null;
  for (const row of rows) {
    const d = coerceDate(row.values["SubmissionDate"]);
    if (d && (max === null || d > max)) max = d;
  }
  return max;
}

export function validateRows(
  rows: NormalizedRow[],
  schema: DatasetSchemaDef,
  options: ValidateOptions = {},
): ValidateResult {
  const ctx: RuleContext = {
    refDate: options.refDate !== undefined ? options.refDate : referenceDate(rows),
  };
  const byRow = new Map<string, Violation[]>();
  const counts: ValidateResult["counts"] = { error: 0, warning: 0, info: 0 };

  for (const row of rows) {
    const rowViolations: Violation[] = [];
    for (const field of schema.fields) {
      const v = row.values[field.id];
      collectFieldViolations(row, field.id, field.label, field.type, v, field, rowViolations);
    }
    for (const rule of schema.crossFieldRules) {
      try {
        if (rule.appliesTo(row, ctx) && rule.violates(row, ctx)) {
          rowViolations.push({
            rowId: row.id,
            ruleId: rule.id,
            code: rule.code,
            severity: rule.severity,
            category: rule.category,
            message: rule.describe(row, ctx),
          });
        }
      } catch {
        // A throwing rule must never crash validation; deterministic message.
        rowViolations.push({
          rowId: row.id,
          ruleId: rule.id,
          code: "RULE_EVALUATION_ERROR",
          severity: "warning",
          category: "coherence",
          message: `Rule ${rule.code} could not be evaluated for this row.`,
        });
      }
    }
    if (rowViolations.length > 0) {
      byRow.set(row.id, rowViolations);
      for (const v of rowViolations) counts[v.severity] += 1;
    }
  }

  const violations = [...byRow.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .flatMap(([, list]) => list);

  return { violations, byRow, counts };
}

interface FieldMeta {
  severityDefault?: Severity;
  required?: boolean;
  range?: { min?: number; max?: number };
  dateRange?: { min?: string; max?: string };
  valueSet?: string[];
  unit?: string;
  label?: string;
}

function collectFieldViolations(
  row: NormalizedRow,
  fieldId: string,
  label: string,
  type: string,
  v: CellValue | undefined,
  meta: FieldMeta,
  out: Violation[],
): void {
  const blank = v === null || v === undefined || v === "";

  if (blank) {
    if (meta.required) {
      out.push({
        rowId: row.id,
        ruleId: `F-${fieldId}`,
        code: "MISSING_REQUIRED",
        severity: "error",
        category: "required",
        fieldId,
        message: `${label} is required but missing.`,
      });
    }
    return;
  }

  const sev = meta.severityDefault ?? "warning";

  switch (type) {
    case "boolean": {
      const parsed = coerceBoolean(v);
      if (parsed === null) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_BOOLEAN",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid yes/no value ("${String(v)}").`,
        });
      }
      break;
    }
    case "integer": {
      const parsed = coerceInteger(v);
      if (parsed === null || (typeof v === "number" && !Number.isInteger(v))) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_INTEGER",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid whole number ("${String(v)}").`,
        });
        break;
      }
      checkRange(row, fieldId, label, parsed, meta, out);
      break;
    }
    case "number": {
      const parsed = coerceNumber(v);
      if (parsed === null) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_NUMBER",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid number ("${String(v)}").`,
        });
        break;
      }
      checkRange(row, fieldId, label, parsed, meta, out);
      break;
    }
    case "date": {
      const parsed = coerceDate(v);
      if (parsed === null) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_DATE",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid date ("${String(v)}").`,
        });
        break;
      }
      if (meta.dateRange) {
        const { min, max } = meta.dateRange;
        if (min && parsed < min) {
          pushRange(row, fieldId, label, parsed, `before ${min}`, out, "date");
        }
        if (max && parsed > max) {
          pushRange(row, fieldId, label, parsed, `after ${max}`, out, "date");
        }
      }
      break;
    }
    case "time": {
      const parsed = coerceTime(v);
      if (parsed === null) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_TIME",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid time ("${String(v)}").`,
        });
      }
      break;
    }
    case "text": {
      coerceText(v);
      break;
    }
    case "choice": {
      if (meta.valueSet && meta.valueSet.length > 0 && !meta.valueSet.includes(String(v))) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "UNEXPECTED_VALUE",
          severity: "warning",
          category: "value-set",
          fieldId,
          rawValue: v,
          message: `${label} has an unexpected value ("${String(v)}").`,
        });
      }
      break;
    }
    case "group": {
      // Group cells are boolean-like; tolerate and let rules reason over them.
      break;
    }
  }
}

function checkRange(
  row: NormalizedRow,
  fieldId: string,
  label: string,
  value: number,
  meta: FieldMeta,
  out: Violation[],
): void {
  const { min, max } = meta.range ?? {};
  if (min !== undefined && value < min) {
    pushRange(row, fieldId, label, value, `less than ${min}`, out, "range");
  }
  if (max !== undefined && value > max) {
    pushRange(row, fieldId, label, value, `greater than ${max}`, out, "range");
  }
}

function pushRange(
  row: NormalizedRow,
  fieldId: string,
  label: string,
  value: unknown,
  detail: string,
  out: Violation[],
  category: ViolationCategory,
): void {
  out.push({
    rowId: row.id,
    ruleId: `F-${fieldId}`,
    code: "OUT_OF_RANGE",
    severity: "warning",
    category,
    fieldId,
    rawValue: value,
    message: `${label} value (${String(value)}) is ${detail}.`,
  });
}