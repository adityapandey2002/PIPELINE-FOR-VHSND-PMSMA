import type { NormalizedRow, CellValue } from "@/contracts/dataset";
import type { Severity, Violation, ViolationCategory } from "@/contracts/violation";
import type { DatasetSchemaDef, RuleContext, SentinelMeaning } from "@/schema/dsl";
import {
  coerceBoolean,
  coerceDate,
  coerceInteger,
  coerceNumber,
  coerceOrdinal,
  coerceTime,
  coerceText,
} from "./cellCoercers";

export interface ValidateOptions {
  /** Deterministic reference day (YYYY-MM-DD). Defaults to the latest SubmissionDate. */
  refDate?: string | null;
  /**
   * Schema field ids whose physical column existed in the parsed export. A group
   * option whose child column is absent cannot be cross-checked, so it is never
   * reported as unticked. Omit to check every declared option.
   */
  presentColumns?: readonly string[];
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
  const presentColumns = options.presentColumns ? new Set(options.presentColumns) : null;

  for (const row of rows) {
    const rowViolations: Violation[] = [];
    for (const field of schema.fields) {
      const v = row.values[field.id];
      collectFieldViolations(row, field.id, field.label, field.type, v, field, rowViolations);
    }
    checkGroupSelections(row, schema, presentColumns, rowViolations);
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
  ordinalScale?: { values: number[]; labels?: Record<string, string> };
  sentinels?: (string | number)[];
  sentinelMeaning?: SentinelMeaning;
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
      // A sentinel literal that survived into values means the cell was not
      // read through the schema's coercion. Report it rather than leaving a
      // silent hole, and read it the way the schema declares.
      if (meta.sentinels?.some((s) => typeof s === "number" && s === parsed)) {
        const asZero = meta.sentinelMeaning === "zero";
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: asZero ? "SENTINEL_NO_DATA" : "SENTINEL_NOT_APPLICABLE",
          severity: "info",
          category: "value-set",
          fieldId,
          rawValue: v,
          message: asZero
            ? `${label} was recorded as "${String(v)}" (no data), which counts as zero.`
            : `${label} was recorded as "${String(v)}" (not applicable). It is excluded from totals and averages.`,
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
    case "ordinal": {
      const parsed = coerceOrdinal(v);
      if (parsed === null) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "INVALID_ORDINAL",
          severity: sev,
          category: "type",
          fieldId,
          rawValue: v,
          message: `${label} is not a valid number ("${String(v)}").`,
        });
        break;
      }
      const allowed = meta.ordinalScale?.values;
      if (allowed && allowed.length > 0 && !allowed.includes(parsed)) {
        out.push({
          rowId: row.id,
          ruleId: `F-${fieldId}`,
          code: "UNEXPECTED_ORDINAL",
          severity: "warning",
          category: "value-set",
          fieldId,
          rawValue: v,
          message: `${label} has an unexpected value ("${String(v)}"). Expected one of ${allowed.join(", ")}.`,
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

/**
 * Cross-check a select-multiple's parent cell against its one-hot children.
 *
 * ODK writes the parent's choice tokens ("A C") *and* one 0/1 column per
 * option. The children are authoritative for analysis, so the parent is used
 * only to catch drift: a token with no matching child column means the form
 * offers an option this build cannot read, and a token/child disagreement means
 * the two encodings disagree. Both are reported instead of being dropped.
 */
function checkGroupSelections(
  row: NormalizedRow,
  schema: DatasetSchemaDef,
  presentColumns: ReadonlySet<string> | null,
  out: Violation[],
): void {
  for (const field of schema.fields) {
    if (field.type !== "group") continue;
    const parentRaw = row.values[field.id];
    if (typeof parentRaw !== "string" || parentRaw.trim() === "") continue;

    const tokens = parentRaw.trim().split(/\s+/).filter(Boolean);
    const suffixes = new Set((field.group?.options ?? []).map((o) => o.code));
    const selected = new Set<string>();
    for (const opt of field.group?.options ?? []) {
      if (coerceBoolean(row.values[`${field.id}_${opt.code}`]) === true) selected.add(opt.code);
    }

    for (const token of tokens) {
      if (!suffixes.has(token)) {
        out.push({
          rowId: row.id,
          ruleId: `F-${field.id}`,
          code: "UNMAPPED_GROUP_OPTION",
          severity: "warning",
          category: "value-set",
          fieldId: field.id,
          rawValue: token,
          message: `${field.label} recorded option "${token}", which has no matching column in this form version. It cannot be analysed.`,
        });
        continue;
      }
      if (!selected.has(token)) {
        if (presentColumns && !presentColumns.has(`${field.id}_${token}`)) continue;
        out.push({
          rowId: row.id,
          ruleId: `F-${field.id}`,
          code: "GROUP_OPTION_MISMATCH",
          severity: "info",
          category: "coherence",
          fieldId: field.id,
          rawValue: token,
          message: `${field.label} lists "${token}" but its ${field.id}_${token} column is not ticked. The ticked columns were used.`,
        });
      }
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