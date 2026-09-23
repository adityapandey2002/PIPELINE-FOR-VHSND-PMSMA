import type { Severity, ViolationCategory } from "@/contracts/violation";
import type { NormalizedRow } from "@/contracts/dataset";

export type FieldType =
  | "boolean"
  | "integer"
  | "number"
  | "date"
  | "time"
  | "text"
  | "choice"
  | "group";

export interface GroupOption {
  code: string;
  label: string;
  kind?: "option" | "other" | "none" | "not-applicable" | "specify";
}

/**
 * A single logical field. For select-multiple questions the physical
 * columns are `{id}_{optionCode}` and are reconstructed by the parser into
 * a single field value per option.
 */
export interface FieldDef {
  id: string;
  label: string;
  type: FieldType;
  required?: boolean;
  /** Allowed values for `choice` fields (tolerant: values not in set are kept). */
  valueSet?: string[];
  /** Range for numeric fields. */
  range?: { min?: number; max?: number };
  /** Optional unit hint for messages. */
  unit?: string;
  /** Fixed bounds for date fields (ISO, or relative like "+1d" from a reference date). */
  dateRange?: { min?: string; max?: string };
  /** Group children (only for type "group"). */
  group?: { options: GroupOption[] };
  severityDefault?: Severity;
}

export interface RuleContext {
  /** Reference day (YYYY-MM-DD) for "relative today" style checks. Deterministic per dataset. */
  refDate: string | null;
}

/**
 * Cross-field rule: eligibility is separated from failure so we never flag a
 * row the rule does not apply to. Both predicates must be pure and
 * deterministic (no Date.now, no randomness, no order dependence).
 */
export interface CrossFieldRuleDef {
  id: string;
  code: string;
  severity: Severity;
  category: ViolationCategory;
  description: string;
  appliesTo(row: NormalizedRow, ctx: RuleContext): boolean;
  violates(row: NormalizedRow, ctx: RuleContext): boolean;
  describe(row: NormalizedRow, ctx: RuleContext): string;
}

export interface DatasetSchemaDef {
  sourceKind: "odk" | "excel";
  fields: FieldDef[];
  crossFieldRules: CrossFieldRuleDef[];
  /** Physical column codes that are known to exist (for header mapping). */
  knownColumns: string[];
}

export interface SchemaDef {
  version: string;
  datasets: Record<string, DatasetSchemaDef>;
}

/* ------------------------- DSL builder helpers ------------------------- */

export interface NormalizedRowProvider {
  get(fieldId: string): unknown;
}

export function group(
  id: string,
  label: string,
  options: GroupOption[],
): FieldDef {
  return { id, label, type: "group", group: { options } };
}

export function rule(r: CrossFieldRuleDef): CrossFieldRuleDef {
  return r;
}

/** Y/N-like question. */
export function yesNo(id: string, label: string, required = false): FieldDef {
  return { id, label, type: "boolean", required };
}

export function count(id: string, label: string, opts: { min?: number; max?: number } = {}): FieldDef {
  return { id, label, type: "integer", range: { min: opts.min ?? 0, max: opts.max } };
}

export function date(id: string, label: string, required = false): FieldDef {
  return { id, label, type: "date", required };
}

export function text(id: string, label: string): FieldDef {
  return { id, label, type: "text" };
}

/* ------------------- serializable projection (audit/hash) ------------------- */

/**
 * Projects a SchemaDef into a normalized, plain-JSON form with stable
 * key ordering, used for schema hashing and auditing. Function bodies are
 * excluded; rule identity is retained via its stable id/code/severity.
 */
export function projectSchema(def: SchemaDef): unknown {
  const datasetProj = Object.fromEntries(
    Object.entries(def.datasets).map(([k, ds]) => [
      k,
      {
        sourceKind: ds.sourceKind,
        fields: ds.fields.map((f) => ({
          id: f.id,
          label: f.label,
          type: f.type,
          required: f.required ?? undefined,
          valueSet: f.valueSet,
          range: f.range,
          unit: f.unit,
          dateRange: f.dateRange,
          severityDefault: f.severityDefault,
          groupoptions: f.group?.options.map((o) => ({
            code: o.code,
            label: o.label,
            kind: o.kind,
          })),
        })),
        crossFieldRules: ds.crossFieldRules.map((r) => ({
          id: r.id,
          code: r.code,
          severity: r.severity,
          category: r.category,
          description: r.description,
        })),
      },
    ]),
  );
  return JSON.parse(stableStringify({ version: def.version, datasets: datasetProj }));
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}