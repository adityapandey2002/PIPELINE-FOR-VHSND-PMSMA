# Data model reference

Everything the app knows about a VHSND supervision export: the 253-column registry, the schema that types those columns, the rules that find contradictions, the indicators and comparisons that turn them into numbers, and the six recipes for extending all of it.

**Part A — [the model in plain language](#part-a--the-model-in-plain-language)** is written for analysts and reviewers.
**Part B — [technical reference](#part-b--technical-reference)** is written for developers, and is cited to `file:line` throughout.
**Part C — [extension recipes](#part-c--extension-recipes)** is step-by-step "how do I add…" for contributors.

The pipeline itself — how a file gets parsed, mapped, validated and exported — is in [`PIPELINE.md`](PIPELINE.md). Setup and gates are in [`DEVELOPMENT.md`](DEVELOPMENT.md).

---

# Part A — the model in plain language

## The idea in one paragraph

Every row of your spreadsheet is one supervision visit. The form that produced it has **253 official columns**, each with a short code (`B8`, `H1HB`, `C4_A`…) and a human question ("Date of visit", "Pregnant women with haemoglobin below normal", …). The app knows all 253. When you import a file, it matches the file's column titles onto those codes, types every value, and then runs a set of questions over each row — *"could there really be more women diagnosed than women tested?"* — reporting anything that does not add up.

## Six concepts

| Concept | Plain meaning | Example |
| --- | --- | --- |
| **Column code** | The stable machine name of an answer | `B8` = date of the visit |
| **Field** | What the app thinks that column *is* — a date, a whole number, a yes/no, a list of choices | `B8` → `date`, `required` |
| **Rule** | A question asked across two or more columns of the same row | `ANEMIC_GT_SAMPLED`: anaemic women identified must not exceed blood samples taken |
| **Indicator** | One headline number summarised across the whole file | total blood samples taken (`sum` of `H1HB`) |
| **Comparison** | A chart that relates several questions at once | the anaemia cascade: sites → Hb kit working → sampled → identified → informed |
| **Resolution** | Your decision on a finding, with a written reason | keep, drop the row, or override the value |

## Severity, and what blocks you

Every finding has one of three severities:

- **`error`** — a real contradiction. The Review screen will not let you continue until every error on every row has been resolved. There are **11** error-severity rules.
- **`warning`** — worth a look; you may continue with it outstanding. **23** of the rules are warnings.
- **`info`** — context, not a problem. **3** rules are informational.

Of the 37 rules, **22 are written out individually** and **15 are generated** automatically from the form's own structure (for example: "nothing selected, yet a free-text reason was given" is generated for each question that has a "none" option and a free-text option).

## Numbers that mean something else

Three different mechanisms use values that look like data but are not:

- **`Na`, `n/a`, `nil`, `not applicable`…** — text meaning "no answer". The cell is treated as blank and dropped.
- **`99` in a count column** — declared per column. In the three ANM columns (`ANM2`, `ANM3`, `ANM4`) it means *zero women*, and is turned into a real `0` so it stays in totals.
- **`99`, `77`, `88`, `SP` as a suffix of a question code** — these classify an *option* of a multi-select question: `99` = none, `77` = not applicable, `88` = other, `SP` = specify. They are what makes the "none selected but options were ticked" rules possible.

## What the report numbers mean

- **Indicators** either `count` rows, `sum` a column, or `avg` it. For yes/no questions the number is always **how many said Yes** — never a sum of 1s and 0s mixed with blanks. Every number carries a hover string telling you the denominator, e.g. *"42 Yes of 60 answered"*.
- **Comparisons** either count, or show a percentage with its denominator in the hover, e.g. *"27 of 48 sites (56%)"*.
- If a question was **not in your file at all**, the chart says so — *"Columns not in this file: H1HB, H1HB1"* — instead of silently showing zero.

---

# Part B — technical reference

## 1 · Subsystem map

| Concern | File |
| --- | --- |
| Column registry (generated) | `src/schema/columns-vhsnd.ts` |
| Column registry source | `data/vhsnd-columns.csv` (253 rows) |
| Generator | `scripts/gen-columns.mjs` |
| DSL types, builders, hash projection | `src/schema/dsl.ts` |
| Version registry / hashing | `src/schema/index.ts` |
| The one live schema | `src/schema/versions/v2026-1.ts` |
| Cell coercion | `src/schema/engine/cellCoercers.ts` |
| Typed accessors for rules | `src/schema/engine/accessors.ts` |
| Group-child resolution | `src/schema/engine/groupChildren.ts` |
| Header → code resolution | `src/schema/engine/headerNormalizer.ts` |
| Parse / normalise (type map, `presentColumns`) | `src/schema/engine/normalize.ts` |
| Validation engine | `src/schema/engine/validate.ts` |
| Indicator registry + evaluation | `src/schema/indicators.ts` |
| Comparison registry | `src/lib/comparisons.ts` |
| Shared contracts | `src/contracts/{dataset,violation,indicator,chart,resolution}.ts` |

## 2 · Column registry

### 2.1 Shape and count

```ts
// src/schema/columns-vhsnd.ts:1-6 — AUTO-GENERATED, do not edit by hand
export type ColumnEntry = { code: string; label: string };
export const VHSND_COLUMNS: ColumnEntry[] = [ /* …253 entries… */ ];
```

- **253** entries; asserted at `tests/schema/columns.test.ts:6-8`.
- The source CSV is exactly 253 non-empty lines with no header row and no duplicate codes.
- Sibling export `VHSND_COLUMN_MAP` and the lookup helper:

```ts
// src/schema/columns-vhsnd.ts:1021-1027
export function columnLabel(code: string): string {
  return VHSND_COLUMN_MAP.get(code)?.label ?? code;   // unknown code → returns the code
}
```

`columnLabel` feeds indicator option labels (`src/schema/indicators.ts:7,278-280`), header aliases (`headerNormalizer.ts:446-448`) and field-label fallbacks (`normalize.ts:186,192`).

### 2.2 Provenance

- Input format is **`label,code`** — label first (`scripts/gen-columns.mjs:9`). Labels containing commas must be quoted (`data/vhsnd-columns.csv:217`).
- Empty code → row skipped with a warning (`gen-columns.mjs:53-56`). Empty label → the label falls back to the code (`gen-columns.mjs:58`).
- First duplicate code wins (`gen-columns.mjs:57-59`).
- Output is sorted by code with `localeCompare("en", { numeric: true })` (`gen-columns.mjs:63`), so generated order ≠ CSV order.
- **There is no npm script** — run `node scripts/gen-columns.mjs` manually. It prints `[gen-columns] Wrote N columns -> …`.

### 2.3 The "special" codes

They are ordinary registry rows, not hacks. They merely look special because the generic token regex in the header normaliser only matches codes containing a digit:

| Code | CSV line | Schema field |
| --- | --- | --- |
| `SubmissionDate` | `data/vhsnd-columns.csv:1` | `f("SubmissionDate", "date", { label: "Submission Date" })` — `v2026-1.ts:162` |
| `starttime` | `:2` | `stamp("starttime")` — `v2026-1.ts:163` |
| `endtime` | `:3` | `stamp("endtime")` — `v2026-1.ts:164` |
| `New` | `:252` | `yn("New")` — `v2026-1.ts:289`; read by the `scan-share` indicator |
| `remarks` | `:253` (empty label) | `freeTxt("remarks")` — `v2026-1.ts:290` |

That is why they are named explicitly here:

```ts
// src/schema/engine/headerNormalizer.ts:406-407
const CODE_TOKEN =
  /[A-Z]+\d+[A-Z0-9]*(?:_[A-Z0-9]+)*|\b(?:SubmissionDate|starttime|endtime|New)\b/gi;
```

`knownColumns` is derived from the registry, never hand-maintained: `v2026-1.ts:663`.

## 3 · Schema DSL (`src/schema/dsl.ts`)

### 3.1 Exports

**Types:** `FieldType` (`:4-16` — `boolean | integer | number | date | time | datetime | text | choice | group | ordinal`), `GroupOption` (`:18-22`), `FieldDef` (`:29-60`), `RuleContext` (`:62-65`), `CrossFieldRuleDef` (`:72-81`), `DatasetSchemaDef` (`:83-89`), `SchemaDef` (`:91-94`), `SentinelMeaning` (`:140` — `no-data | zero`).

`FieldDef` keys: `id`, `label`, `type`, `required?`, `valueSet?`, `ordinalScale?`, `sentinels?`, `sentinelMeaning?`, `freeText?`, `range?`, `unit?`, `dateRange?`, `group?`, `severityDefault?`.

**Builders:** `group` (`:102`), `rule` (`:110`, unused), `yesNo` (`:115`, unused), `ordinalField` (`:123`), `countWithSentinel` (`:143`), `count` (`:159`), `date` (`:163`), `text` (`:167`), `projectSchema` (`:178-215`), `stableStringify` (`:217`).

There is **no `selectOne`/`selectMultiple` builder** — select-one is `"choice"`/`"boolean"`, select-multiple is `"group"`. The live schema mostly uses its own local micro-helpers rather than these builders (`v2026-1.ts:142-160`):

```ts
const f    = (id: string, type: FieldDef["type"], extra: Partial<FieldDef> = {}) =>
  list.push({ id, label: labelOf(id), type, ...extra });   // label auto-looked-up from the registry
const yn      = (id) => f(id, "boolean");
const cnt     = (id) => f(id, "integer", { range: { min: 0 } });
const txt     = (id) => f(id, "text");
const freeTxt = (id) => f(id, "text", { freeText: true });
const choose  = (id) => f(id, "choice");
const dat     = (id, required = false) => f(id, "date", { required });
const stamp   = (id) => f(id, "datetime");
```

### 3.2 Representative fields

```ts
// v2026-1.ts:56-61 — a select-multiple whose options are derived from the registry
{ id: "C4",
  label: "Which health workers are available at the session site?",
  type: "group",
  group: { options: groupChildren("C4") } }

// v2026-1.ts:162,178
f("SubmissionDate", "date", { label: "Submission Date" });
dat("B8", true);     // { id: "B8", label: "Date of visit", type: "date", required: true }

// v2026-1.ts:274 — sentinel count: 99 means a real zero, and stays in sums
cntOrNoData("ANM2", 99);
```

**Counts:** 14 group fields + 115 simple fields = **129 fields**, assembled at `v2026-1.ts:299`.

### 3.3 How a select-multiple is modelled

Physical columns are `{root}_{suffix}`; the parent keeps only the option **suffixes**:

```ts
// v2026-1.ts:43-51
function groupChildren(root: string): GroupOption[] {
  return VHSND_COLUMNS.filter((c) => isDirectChildOf(root, c.code))
    .map((c) => ({ code: c.code, suffix: c.code.slice(root.length + 1) }))
    .map(({ code, suffix }) => ({
      code: suffix,          // ← option code is the SUFFIX ("A"), not "C10_A"
      kind: kindOf(suffix),  // 88→other, 99→none, 77→not-applicable, SP→specify
      label: VHSND_COLUMNS.find((c) => c.code === code)!.label,
    }));
}
```

At parse time `buildTypeMap` gives the parent `group_tokens` (its own cell is kept verbatim as text) and each child `group` (a boolean) — `src/schema/engine/normalize.ts:147-160`. Readers reconstruct the physical column as `${field.id}_${opt.code}` (`accessors.ts:42-44`, `validate.ts:396`), and `checkGroupSelections` cross-checks the parent's tokens against the ticked children.

### 3.4 `groupChildren` / `isDirectChildOf`

`src/schema/engine/groupChildren.ts` exists because a naive prefix test mis-attributes nested groups: `C10_1` is itself a group nested alongside `C10`, so `startsWith("C10_")` would wrongly claim `C10_1_A` is an option of `C10` (doc at `groupChildren.ts:3-10`).

- `VHSND_GROUP_ROOTS` — a **hand-maintained** list of 14 roots: `C4, C10, C10_1, C11_1, E3, G1, G12, G2, G3, H1, H2, H3, H32, H4` (`groupChildren.ts:11-26`).
- `isDirectChildOf(root, code)` (`:47-51`) — must start with `root_`, non-empty suffix, not part of a nested root.
- `nestedPathsUnder` (`:34-38`), `isNestedGroupPath` (`:40-44`).

Callers: `v2026-1.ts:44` (option derivation) and `indicators.ts:6,217` (breakdown counting).

## 4 · Schema identity

```ts
// src/schema/index.ts:4-10
export const SCHEMA_VERSION = "2026.1";
export const SUPPORTED_DATASET_KINDS = ["vhsnd"] as const;
const SCHEMAS: Record<string, SchemaDef> = { [SCHEMA_VERSION]: VHSND_SCHEMA };
```

- `getSchema(version)` throws `Unknown schema version "…"` (`index.ts:12-18`); `getDatasetSchema(version, kind)` throws when the dataset kind is absent (`:20-25`).
- **The version literal exists twice** — `index.ts:4` and `v2026-1.ts:19` — because the version file cannot import `index.ts` (circular). Keep them in sync by hand.
- `canonicalSchemaJson` = `stableStringify(projectSchema(schema))` (`index.ts:27-30`): field order preserved as an array, object keys sorted, rule bodies dropped (identity kept).
- `computeSchemaHash(version)` = SHA-256 hex (64 chars) of that JSON (`index.ts:32-38`).

The hash is stamped on every dataset snapshot at creation (`src/stores/datasetStore.ts:41,48-49`) and stored in the snapshot type (`src/contracts/dataset.ts:28-29`). Nothing reads it at runtime — it is audit metadata, so two exports can be proven to have been produced under the same schema. Determinism is tested at `tests/schema/columns.test.ts:46-54`.

## 5 · Validation engine

Entry point `validateRows(rows, schema, options)` (`src/schema/engine/validate.ts:41-95`) runs **three passes per row** — cell-level (`:55-58`), group cross-check (`:59`), cross-field rules (`:60-83`) — then sorts by `rowId` and returns `{ violations, byRow, counts }`.

### 5.1 Cell-level violation codes

Severity comes from `meta.severityDefault ?? "warning"` (`validate.ts:125`); no field in v2026-1 sets it, so everything below is `warning` unless stated. **Blank cells raise nothing** (`validate.ts:119-123`).

| Code | Severity | Category | Meaning | Cite |
| --- | --- | --- | --- | --- |
| `INVALID_BOOLEAN` | warning | type | value not readable as Y/N | `validate.ts:134` |
| `INVALID_INTEGER` | warning | type | not a whole number | `:150` |
| `SENTINEL_NOT_APPLICABLE` | **info** | value-set | declared sentinel reached validation uncoerced, meaning `no-data` | `:162-175` |
| `SENTINEL_NO_DATA` | **info** | value-set | declared sentinel uncoerced, meaning `zero` | `:163,167,172-173` |
| `INVALID_NUMBER` | warning | type | not parseable as a number | `:187` |
| `INVALID_DATE` | warning | type | not a date | `:205` |
| `OUT_OF_RANGE` | warning | range / date | outside `range` or `dateRange` bounds | `:459`, `:429-444`, `:214-223` |
| `INVALID_TIME` | warning | type | not a time | `:231` |
| `INVALID_ORDINAL` | warning | type | not numeric for an ordinal | `:247` |
| `UNEXPECTED_ORDINAL` | warning | value-set | number outside `ordinalScale.values` | `:261` |
| `UNEXPECTED_VALUE` | warning | value-set | `choice` value not in `valueSet` | `:280` |
| `UNMAPPED_GROUP_OPTION` | warning | value-set | parent cell token matches no declared option — one violation **per leftover token** | `:399-410` |
| `GROUP_OPTION_MISMATCH` | **info** | coherence | parent names a token whose child column is not ticked; skipped when that column is absent | `:412-425` |
| `RULE_EVALUATION_ERROR` | warning | coherence | a rule threw — validation never crashes | `:72-82` |

**`MISSING_REQUIRED` has no producer.** `collectFieldViolations` returns early on blank cells and `FieldMeta.required` (`validate.ts:99`) is never read, so `required: true` on `B8` is inert. Tests assert its absence (`tests/engine/validate.test.ts:129-131`, `tests/sample-data.test.ts:63`).

### 5.2 The 37 cross-field rules

Assembled at `v2026-1.ts:338-652`. Contract: `appliesTo` (eligibility) is evaluated first, `violates` (failure) only if eligible, `describe` produces the audit sentence (`dsl.ts:72-81`, execution at `validate.ts:62-71`).

| id | code | sev | category | line |
| --- | --- | --- | --- | --- |
| X001 | `HIGH_BP_MEASURED_LT_IDENTIFIED` | error | clinical-contradiction | `:341` |
| X002 | `HIGH_BP_REFERRED_GT_IDENTIFIED` | error | clinical-contradiction | `:353` |
| X003 | `ANEMIC_GT_SAMPLED` | error | clinical-contradiction | `:364` |
| X004 | `ANEMIA_MOD_SEV_GT_IDENTIFIED` | error | clinical-contradiction | `:374` |
| X005 | `ANEMIA_INFORMED_GT_IDENTIFIED` | warning | clinical-contradiction | `:387` |
| X006 | `ANEMIA_REFERRED_GT_IDENTIFIED` | warning | clinical-contradiction | `:398` |
| X007 | `PNC_ANEMIC_GT_SAMPLED` | error | clinical-contradiction | `:410` |
| X008 | `PNC_ANEMIA_MOD_SEV_GT_IDENTIFIED` | error | clinical-contradiction | `:421` |
| X009 | `PNC_ANEMIA_INFORMED_GT_IDENTIFIED` | warning | clinical-contradiction | `:434` |
| X010 | `PNC_ANEMIA_REFERRED_GT_IDENTIFIED` | warning | clinical-contradiction | `:445` |
| X011 | `PNC_SAMPLED_GT_ATTENDED` | warning | clinical-contradiction | `:456` |
| X012 | `SESSION_NOT_HELD_WITH_SERVICES` | warning | coherence | `:470` |
| X013 | `SESSION_HELD_WITH_REASON` | error | coherence | `:488` |
| X014 | `SESSION_NOT_HELD_REASON_REQUIRED` | error | required | `:498` |
| X015 | `SYRINGE_NOT_CUT_REASON_REQUIRED` | error | required | `:508` |
| X017 | `TELECONSULT_DATA_WITHOUT_CONSULT` | warning | coherence | `:520` |
| X018 | `CONSULT_UNITS_GT_ZERO_CONSISTENT` | info | coherence | `:532` |
| X019 | `VISIT_DATE_AFTER_SUBMISSION` | error | date | `:545` |
| X020 | `VISIT_DATE_IN_FUTURE` | warning | date | `:556` |
| X021 | `END_BEFORE_START` | error | sequence | `:566` |
| `X022-<root>` ×7 | `NONE_SELECTED_WITH_OPTIONS` | warning | coherence | generated `:578-600` |
| `X023-<root>` ×8 | `SPECIFY_WITHOUT_OTHER` | warning | coherence | generated `:606-619` |
| X024 | `ANMOL_DATA_WITHOUT_ANM` | info | coherence | `:625` |
| X025 | `ASHA_DATA_WITHOUT_ASHA` | info | coherence | `:642` |

Notes:

- **There is no X016** — a permanent numbering gap between `:508` and `:520`.
- Mix: **11 error / 23 warning / 3 info** = 37. Rule `code` must match `^[A-Z0-9_]+$` and ids must be unique (enforced at `tests/schema/columns.test.ts:36-44`).
- The generated families are emitted only when the group can actually fire:

```ts
// v2026-1.ts:585-600, 602-619
if (noneSuffixes.length > 0 && optionSuffixes.length > 0) { /* X022-<root> */ }
if (hasSpecify && hasOther)                              { /* X023-<root> */ }
```

  Actual split: X022 for `C10, C10_1, G2, H1, H2, H3, H4` (7) and X023 for `C10, C10_1, E3, G3, H1, H2, H4, H32` (8) — matching `tests/schema/rules.test.ts:44-52` (14 groups, 15 generated).

### 5.3 Sentinels — three distinct mechanisms

1. **Text "missing tokens"** — `{na, n/a, nan, na., nil, not applicable, not available, none given}` (`cellCoercers.ts:12-21`, `isMissingToken` `:24-28`, deliberately excluding bare dashes `:11`). A cell coercing to `null`/`""` is dropped from `values` entirely (`normalize.ts:141-144`).
2. **Numeric sentinels** — declared per field (`countWithSentinel`, `dsl.ts:143-157`), read by `coerceSentinelNumber` (`cellCoercers.ts:62-73`):

   ```ts
   if (parsed !== null && sentinels?.some((s) => s === parsed)) {
     return meaning === "zero" ? 0 : null;   // "no-data" → null, "zero" → real 0
   }
   ```

   Only `ANM2/ANM3/ANM4` declare `[99]` with `meaning: "zero"` (`v2026-1.ts:274,276,278`). If a literal 99 *does* survive into `values`, validation reports it as **info** — note the code names are inverted relative to intuition: `SENTINEL_NO_DATA` is emitted when `sentinelMeaning === "zero"` (`validate.ts:163,167`).
3. **`77`/`99`/`88`/`SP` as group-option suffixes** — never numeric sentinels; `kindOf` (`v2026-1.ts:23-36`) classifies them, which is what drives X022/X023 generation.

`freeText: true` opts a field out of the missing-token list (`normalize.ts:105-107`, rationale at `cellCoercers.ts:266-277`) — otherwise a hand-typed "Not available" reason would be swallowed and the row would then trip a `*_REASON_REQUIRED` rule.

### 5.4 How `presentColumns` and `refDate` gate rules

```ts
// validate.ts:14-23, 46-51
export interface ValidateOptions {
  refDate?: string | null;               // default: latest SubmissionDate
  presentColumns?: readonly string[];    // schema codes the physical export carried
}
```

- **`refDate`** = max `SubmissionDate` (`validate.ts:32-39`, `null` when absent). Consumed only by rules through `ctx`; concretely X020's `appliesTo` requires `ctx.refDate !== null` (`v2026-1.ts:561`), so with no submission date the "visit in the future" rule silently never applies. Passing `refDate: null` explicitly disables auto-compute — that is what the UI does.
- **`presentColumns`** gates exactly one thing: `GROUP_OPTION_MISMATCH` is skipped when the child column is not in the file (`validate.ts:414`). Its documented purpose (`validate.ts:17-22`): *a group option whose child column is absent cannot be cross-checked, so it is never reported as unticked.* It does **not** gate cross-field rules — those are value-driven only.
- Origin: parse (`normalize.ts:538-542,587`) → stored on the snapshot (`dataset.ts:39`) → copied onto every `CleanRow` (`derive.ts:54-58`, contract `resolution.ts:19-28`). Comparisons read it via `inFile` (`comparisons.ts:44-48`).

### 5.5 Violation identity

```ts
// src/contracts/violation.ts:42-51
export function violationKey(v: Violation): string {
  const field = v.fieldId ?? v.ruleId;
  const raw = v.rawValue === undefined ? "" : …;
  return `${v.rowId}|${v.code}|${field}|${raw}`;
}
```

`rowId|code` alone collides: one row can raise the same code on several fields (`H33`/`H34` both `INVALID_ORDINAL`) or several times on one field (one `UNMAPPED_GROUP_OPTION` per token). `keyedViolations` appends an occurrence suffix only on exact repeats (`violation.ts:65-73`). Consumers: `src/app/review/page.tsx:51`; stability tests `tests/violation-identity.test.ts:23-72`.

Resolutions acknowledge violations **by code**, which is why codes are permanent once shipped (`resolution.ts:8-9`, `derive.ts:84-86`).

## 6 · Indicators

### 6.1 The definition

```ts
// src/contracts/indicator.ts:1-27
export interface IndicatorDef {
  id: string;
  label: string;
  dataType: DataType;          // categorical | ordinal | numeric | numeric-categorical
                              // | numeric-distribution | time-series | geospatial
  valueField: string;          // a column code, or a group root for breakdowns
  dimensionField?: string;     // optional grouping dimension
  aggregation: "count" | "sum" | "avg" | "none";
  numericBinCount?: number;
  description: string;
}
```

**There is no numerator/denominator field.** An indicator only counts/sums/averages `valueField`; any ratio appears inside the `detail` hover string (e.g. `` `${yes} Yes of ${answered} answered` ``, `indicators.ts:268`). Percentages are a *comparison* concern (`pctTrue`, `comparisons.ts:65-68`).

Output: `IndicatorSeries { points, samples, timeLabels, stats }` (`indicators.ts:116-121`); each `SeriesPoint { name, value, unit?, detail? }` (`:98-105`); `stats: ComputedStats { cardinality, dateSpanDays, missingRate, numericShape }` (`indicator.ts:29-37`).

### 6.2 The 21 indicators

`VHSND_INDICATORS` at `indicators.ts:42-94` — 2 literals, 12 via `numeric(...)` (`:61-79`), 7 via `breakdown(...)` (`:87-93`).

| id | shape | computes | cite |
| --- | --- | --- | --- |
| `anemia-screened` | `numeric(…, "H1HB", "sum")` | sums pregnant women blood-sampled | `:67`; 3+4 → 7 at `tests/indicators.test.ts:11-16` |
| `asha-survey` | `numeric(…, "ASHA1", "count")` | counts Yes on a boolean field | `:62`; `tests/indicators.test.ts:18-27` |
| `workers` | `breakdown(…, "C4")` | per-option counts over exploded `C4_*` columns, labelled via `columnLabel` | `:88`; loop `:210-224` |
| `sessions` | literal, `time-series` | buckets by `SubmissionDate`/`B8` per day | `:45`, `:141-186` |
| `bp-systolic` | `numeric-distribution` | returns raw `samples` for the histogram | `:64-68` in tests |

### 6.3 Evaluation and boolean counting

`evaluateIndicator(rows, def)` (`indicators.ts:123-276`) branches on `dataType`. Schema field types are resolved once and cached module-wide (`indicators.ts:107-114`).

```ts
// indicators.ts:231-271
if (isBoolean) {
  const flag = coerceBoolean(raw);
  if (flag === null) continue;      // no answer at all → missing
  answered += 1;
  if (flag) yes += 1;
  values.push(flag ? 1 : 0);
}
…
if (isBoolean) value = yes;         // ← count of Yes, never a sum of 0/1
…
stats.missingRate = total ? 1 - (isBoolean ? answered : values.length) / total : 1;  // false is an answer
```

Enforced by tests: `sum` only on `integer|number|ordinal` (`tests/indicators.test.ts:71-81`); a boolean `valueField` yields `value = 1` for one true/one false with `missingRate 0` (`:91-102`); PNC attendance must read the count `H3A_1`, not the boolean `H3A` (`:83-89`).

### 6.4 Chart suggestion

`suggestCharts(def, series)` (`indicators.ts:306-345`) scores candidates and sorts descending; labels come from `KIND_LABEL` (`:284-303`, 18 kinds):

| dataType | Suggested kinds |
| --- | --- |
| `time-series` | line 95 · area 80 · bar-vertical 85 if the span is < 15 days, else 60 |
| `numeric-distribution` | histogram 95 · bar-vertical 70 |
| `categorical` | pie 90 **only if cardinality ≤ 7** · bar-vertical 88 · bar-horizontal 80/60 |
| `geospatial` | bar-horizontal 92 · bar-vertical 70 |
| `numeric` | table 95 + bar-vertical (if cardinality > 1), else bar-vertical 80 |

Tested at `tests/indicators.test.ts:105-131`.

## 7 · Comparisons

### 7.1 Types

```ts
// src/lib/comparisons.ts:312-318
export interface ComparisonDef {
  id: string; category: string; label: string; description: string;
  compute: (rows: CleanRow[]) => ComparisonResult;
}

// comparisons.ts:230-237
export interface ComparisonResult {
  kind: ChartKind;
  series: IndicatorSeries;
  extra?: ComparisonExtra;   // groups | seriesKeys | barGroups | boxes | gauges | waffle | matrix | scatter
  insight: string;
  columnsUsed: string[];
  columnsMissing: string[];
}
```

`ComparisonExtra` sub-shapes at `:167-216`, assembled at `:218-228`. Everything is built through `mkResult(...)` (`:263-280`), which appends `missingNote` — `` ` Columns not in this file: …` `` (`:259-261`) — and fills `series` via `mkSeries` (`:239-257`).

**`inFile` is not in the result** — it is the internal predicate deciding "missing":

```ts
// comparisons.ts:44-48
function inFile(rows: CleanRow[], code: string): boolean {
  const declared = rows[0]?.presentColumns;
  if (declared) return declared.includes(code);   // the file's real column list wins
  return hasValues(rows, code);                   // fallback: any row carries the code
}
```

Values alone cannot tell "absent from the file" from "present but blank" (`resolution.ts:22-27`) — hence `presentColumns` first.

Hover text comes from `SeriesPoint.detail` + `unit: "%"`: `pctDetail` (`:71-73`, "N of M sites"), `countPoint` (`:81-85`, "N of M sites (P%)"), `meanDetail` (`:125-129`), plus `detail` on group/gauge rows. Enforced: every point needs a detail (`tests/comparisons.test.ts:427-434`), every group/gauge too (`:449-459`).

### 7.2 Counts, categories, kinds

**21 comparisons** — `COMPARISONS` at `comparisons.ts:320-1090`, asserted at `tests/comparisons.test.ts:360-361`. The UI count is derived, not hard-coded: `Comparison charts ({COMPARISONS.length})` (`src/app/viz/page.tsx:269-271`).

**6 categories** (`comparisons.ts:303-310`):

| # | Category | Count |
| --- | --- | --- |
| 1 | Diagnostic Care Cascades | 3 |
| 2 | Service & Infrastructure Readiness | 5 |
| 3 | Consumables & Medicine Supply Chain | 3 |
| 4 | Beneficiary Counseling & Education | 2 |
| 5 | Digital Health & Administration | 4 |
| 6 | Vulnerable Demographics & Outcomes | 4 |

**14 of the 18 chart kinds** are used by comparisons: `funnel, grouped-bar, bar-horizontal, stacked-100, heatmap, box, gauge, pareto, donut, pie, bar-vertical, scatter, waffle, radar`. The other four (`line, area, histogram, table`) are reachable only through indicator suggestions — between the two registries all 18 are covered.

### 7.3 Three examples

1. **`anemia-cascade`** (`comparisons.ts:322-347`) — `funnel`: `Total sites → G3_E (Hb kit working) → H1HB → H1HB1 → H1HB_4`, summed with `sumNum`; insight from `funnelInsight` (`:283-299`); test points `[3, 2, 15, 5, 2]`, `columnsMissing []` (`tests/comparisons.test.ts:78-85`).
2. **`gdm-bottleneck`** (`:376-425`) — `grouped-bar`: groups by `B2A` with `groupBy` (`:131-140`), `extra.groups` rows carrying `equipment/tested/n/detail`.
3. **`urine-crosstab`** (`:579-622`) — `heatmap`: a 3×3 `MatrixStat` from `G12_M` × `H1_E`, `idx()` mapping `true/false/null → 0/1/2`; test asserts cell `[0][1] = 2` (`tests/comparisons.test.ts:228-242`).

---

# Part C — extension recipes

> Gate for everything: all five checks in [`DEVELOPMENT.md`](DEVELOPMENT.md#the-five-gates). In a folder whose path contains `&`, run tests as `node node_modules/vitest/vitest.mjs run`.

## 7a · Add a column to the 253-column registry

**Files:** `data/vhsnd-columns.csv`, `src/schema/columns-vhsnd.ts` (generated), `tests/schema/columns.test.ts`, `tests/sample-data.test.ts`, possibly `headerNormalizer.ts` and `groupChildren.ts`.

1. Append one line to `data/vhsnd-columns.csv` in **`label,code`** order (no header row, quote labels containing commas):

   ```
   Is the new thing available?,Z9
   "If not, why? (specify):",Z9_SP
   ,Z9_NOTE          ← empty label ⇒ label falls back to the code
   ```
2. Regenerate (manual — no npm script): `node scripts/gen-columns.mjs`. **Commit both the CSV and the generated file.**
3. Update the hard-coded count: `tests/schema/columns.test.ts:7` → `toBe(254)`.
4. Keep the sample workbook in sync — `tests/sample-data.test.ts:36-41` requires every registry code to appear in `sample-data/vhsnd-sample.xlsx` except the `notInSample` set (currently `["G1_D"]`). Either regenerate (`npm run make:sample`, see [`DEVELOPMENT.md`](DEVELOPMENT.md#known-broken-and-partial-tooling)) or add the code to that set.
5. If the code will not match `[A-Z]+\d+[A-Z0-9]*(?:_[A-Z0-9]+)*` (lowercase words, no digit — like `New`, `starttime`), add it to `CODE_TOKEN` (`headerNormalizer.ts:406-407`), otherwise it can only be matched by exact label.
6. If real exports use a translated title for it, add an alias to `HINDI_ALIASES` (`headerNormalizer.ts:34-216`).
7. If it is a child of an existing group, nothing else is needed for the registry — but if the *root* is new, add it to `VHSND_GROUP_ROOTS` (`groupChildren.ts:11-26`) or its children will be attributed to a sibling group.
8. Nothing else: `knownColumns` (`v2026-1.ts:663`), the unmatched-title `<select>` on the Ingest screen (`src/app/ingest/page.tsx:357-365`) and the alias map all derive from `VHSND_COLUMNS`.

**Tests:** `tests/schema/columns.test.ts` (count, a label assertion), `tests/sample-data.test.ts:24-42`, `tests/schema/headerNormalizer.test.ts` if you added an alias/token.

## 7b · Add a field to the schema

**Files:** `src/schema/versions/v2026-1.ts` (+ 7a prerequisites).

1. Make sure the physical column is in the registry (7a) — `labelOf` resolves the label automatically (`v2026-1.ts:295-297`).
2. In `simpleFields()` (`:142-293`) add one line:

   ```ts
   yn("Z9");                 // boolean
   cnt("Z9_1");              // integer, range { min: 0 }
   freeTxt("Z9_SP");         // text, freeText: true (missing-tokens NOT applied)
   choose("Z9");             // closed choice (add { valueSet: [...] } as extra)
   dat("Z9D", true);         // date — note: required is currently inert (§5.1)
   stamp("Z9T");             // datetime
   cntOrNoData("Z9_2", 99);  // integer with sentinel 99 meaning "zero"
   f("Z9N", "number", { range: { min: 0, max: 100 }, unit: "mg" });   // raw
   ```
3. **Select-multiple:** add an entry to `groupFields` (`:55-140`) *and* ensure the root is in `VHSND_GROUP_ROOTS`:

   ```ts
   { id: "Z9", label: "…", type: "group", group: { options: groupChildren("Z9") } }
   ```

   Children become physical `{Z9}_{suffix}` booleans automatically; option `kind` comes from the suffix convention (`:23-36`).
4. Beware: field array order feeds `projectSchema` → `canonicalSchemaJson` → `schemaHash`, so **insertion position changes the hash** of every dataset created afterwards.
5. Add a `HINDI_ALIASES` entry if exports carry a variant title.

**Tests:** `tests/schema/columns.test.ts:29-44` (integrity), plus a golden + silent case in `tests/engine/validate.test.ts`.

## 7c · Add a validation rule

**Files:** `src/schema/versions/v2026-1.ts` (cross-field) or `src/schema/engine/validate.ts` (cell-level).

```ts
// appended to the toCrossField([...]) array at v2026-1.ts:338-652
{
  id: "X026",                                 // unique; X016 is a permanent gap
  code: "SOME_STABLE_CODE",                   // ^[A-Z0-9_]+$, permanent once shipped
  severity: "error",                          // error | warning | info
  category: "coherence",                      // clinical-contradiction | sequence | coherence | date | required
  description: "One sentence for the audit/report.",
  appliesTo: (r, ctx) => n(r, "H1HB") !== null && n(r, "H1HB1") !== null,  // eligibility ONLY
  violates: (r) => (n(r, "H1HB1") ?? 0) > (n(r, "H1HB") ?? 0),            // failure ONLY
  describe: (r) => `Identified (${n(r, "H1HB1")}) exceeds sampled (${n(r, "H1HB")}).`,
},
```

Rules must be pure (`dsl.ts:67-71`); a throw becomes `RULE_EVALUATION_ERROR` (`validate.ts:72-82`), so prefer `appliesTo` guards over try/catch. Use the accessors — `n, num, b, d, t, dt, s, isDefined, groupSelected, groupAny, groupHasData, cmpDay, fmtDay` (`accessors.ts:4-72`) — never `row.values[…]` raw.

For a generated family like X022/X023, push into the `groupFields.flatMap(...)` block (`:578-621`) with conditional emission and an id like `X027-${root}`.

Cell-level alternative: extend the `switch (type)` in `collectFieldViolations` (`validate.ts:127-294`); ruleId convention `F-${fieldId}` (`:133`).

**Tests:** `tests/schema/rules.test.ts` — add the code to the classification set (`:6-20`); update the group/generated counts at `:44-52` if you changed the option columns. Then a flag-it + silent-when-consistent pair in `tests/engine/validate.test.ts`.

## 7d · Add an indicator

**Files:** `src/schema/indicators.ts`, `tests/indicators.test.ts`.

```ts
// inside VHSND_INDICATORS (indicators.ts:42-94)
numeric("new-metric", "New metric", "H1HB", "sum", "One-line description."),
breakdown("new-split", "New split", "G1", "Per-option breakdown."),
{
  id: "new-thing",
  label: "New thing",
  dataType: "numeric",        // DataType union, contracts/indicator.ts:1-8
  valueField: "H25",          // schema field id, or a group root for breakdowns
  aggregation: "sum",         // count | sum | avg | none
  description: "…",
}
```

Rules enforced by existing tests: `sum` only on `integer|number|ordinal`; a `boolean` `valueField` is counted as Yes (`indicators.ts:236-268`); a `categorical` with no `dimensionField` counts exploded `{root}_*` columns via `isDirectChildOf`; `time-series` buckets `SubmissionDate`/`B8` and ignores `valueField` (pseudo-fields like `"SessionKey"` are not real columns).

**Tests:** an `evaluateIndicator` case, plus a `suggestCharts` case if the shape is new. Note the module-level `FIELD_TYPES` cache (`:107-114`) is built once per process. The UI and report pick the registry up automatically.

## 7e · Add a comparison

**Files:** `src/lib/comparisons.ts`, `tests/comparisons.test.ts`.

```ts
// inside COMPARISONS (comparisons.ts:320-1090)
{
  id: "my-new-comparison",                 // unique
  category: COMPARISON_CATEGORIES[0],      // one of the 6
  label: "22. Title with a leading number", // labels are numbered by convention
  description: "What it shows, with the column codes it reads.",
  compute: (rows) => {
    const codes = ["H1HB", "H1HB1"];
    const { present, missing } = presentCodes(rows, codes);     // :50-55
    const points = [
      pctPoint("Screened", pctTrue(rows, "H1HB"), pctDetail(rows, "H1HB")),
      countPoint("Identified", countTrue(rows, "H1HB1"), rows.length),
    ];
    return mkResult("bar-vertical", points, `Human-readable insight…`,
      { /* optional extra */ }, present, missing);
  },
},
```

Hard requirements from the suite: `compute([])` and junk rows must not throw and must report `columnsMissing.length > 0` (`tests/comparisons.test.ts:368-383`); every point needs `detail`, `%` points need `unit: "%"` (`:427-441`); every `extra.groups`/`extra.gauges` entry needs `detail` (`:449-459`). Prefer `stdBool` / `stdNum` / `countTrue` / `sumNum` / `meanPctTrue` / `quartiles` (`:8-163`), and extend `columnShort` (`:1093-1103`) if you introduce bare codes in point names.

**Tests:** bump `toHaveLength(21)` → 22 (`:360-361`) and add a `describe` block with kind/points/insight assertions.

## 7f · Add a schema version

**Files:** `src/schema/versions/v2026-2.ts` (new), `src/schema/index.ts`, `tests/indicators.test.ts` (hard-coded version).

1. Copy `v2026-1.ts`, keep the **local** version literal in sync:

   ```ts
   const SCHEMA_VERSION = "2026.2";          // mirrors index.ts:4
   export const VHSND_SCHEMA: SchemaDef = {
     version: SCHEMA_VERSION,
     datasets: { vhsnd: { sourceKind: "odk", fields: FIELDS, crossFieldRules: VHSND_CROSS_FIELD_RULES, knownColumns } },
   };
   ```
2. Register it in `SCHEMAS` (`index.ts:2-10`) and bump the exported `SCHEMA_VERSION`. Keep the old one addressable if historical datasets must still validate.
3. What is keyed off the version: the `SCHEMAS` lookup, the hash stamped on new snapshots (`datasetStore.ts:41,48-49`), the field-type cache in `indicators.ts:8,111`, and the per-request `schemaVersion` in `validateWorker.ts:11,21-27`. Old snapshots degrade gracefully — `derive.ts:24-38` catches an unknown version and falls back to "no coercion" rather than crashing the review screen.
4. **Tests:** `tests/schema/columns.test.ts` follows `SCHEMA_VERSION` automatically; **`tests/indicators.test.ts:72` hard-codes `"2026.1"`** and must be updated. If both versions stay registered, assert each resolves and that their hashes differ (`computeSchemaHash` pattern, `columns.test.ts:46-54`).

---

## Pitfalls — what a newcomer gets wrong

1. **Hand-editing `src/schema/columns-vhsnd.ts`.** It is generated; edit `data/vhsnd-columns.csv` and run `node scripts/gen-columns.mjs`. There is no npm script for it.
2. **CSV column order is `label,code`, not `code,label`.** Swap them and every label becomes a "code".
3. **Two hard-coded counts** break silently when you add a column: `tests/schema/columns.test.ts:7` and the sample-workbook coverage loop `tests/sample-data.test.ts:36-41`.
4. **`npm test` does not work in this checkout** when the path contains `&` — use `node node_modules/vitest/vitest.mjs run`.
5. **`SCHEMA_VERSION` exists as three literals** — `index.ts:4`, `v2026-1.ts:19`, and hard-coded in `tests/indicators.test.ts:72`.
6. **`required: true` does nothing.** No `MISSING_REQUIRED` producer exists; blanks return early (`validate.ts:119-123`).
7. **Group roots are a hand-maintained list.** Forget `VHSND_GROUP_ROOTS` and `isDirectChildOf` lets the parent absorb a nested group's children — the exact `C10` vs `C10_1` bug documented at `groupChildren.ts:7-9`. Adding an `SP`/`88`/`99`/`77` column also changes rule generation and will break `tests/schema/rules.test.ts:44-52`.
8. **Option codes are suffixes, not column codes.** `group.options[].code` is `"A"`, not `"C4_A"`; readers reconstruct `${root}_${code}`.
9. **Sentinel code names are inverted vs. intuition** — `SENTINEL_NO_DATA` is emitted for `sentinelMeaning: "zero"`. And these notices only appear if the magic number survived into `values`; the normal parse path already neutralises it, so a parsed file shows zero sentinel findings.
10. **`freeText` matters.** Without it, a hand-typed reason is swallowed by `MISSING_TOKENS` and the row then trips a `*_REASON_REQUIRED` rule (`tests/engine/validate.test.ts:223-246`).
11. **Ordering and identity are load-bearing:** rule id/code uniqueness is tested, `violationKey` embeds `fieldId ?? ruleId` + `rawValue`, resolutions acknowledge by code, and field array order feeds `schemaHash`.
12. **Naming conventions:** indicator ids are kebab-case except `uw in-registration` (contains a space); comparison labels are numbered `1.`–`21.` and #21 sits in category 2, so UI grouping ≠ numbering; violation codes are `UPPER_SNAKE` and permanent once shipped; rule ids are `X###` with a deliberate gap at X016.
13. **`presentColumns` ≠ "has values."** `inFile` prefers the declared column list; hand-built `CleanRow`s in tests omit it and fall back to value probing — a classic source of false "column missing" results.
14. **Dead exports exist** and can mislead: `yesNo`, `rule`, `NormalizedRowProvider`, `VHSND_FIELDS`/`vhsndLabel`, `directChildSuffixes`, `groupOptionsSelected`, `anyNonBlank` have no callers outside their own file.
15. **Cross-field rules are not gated by `presentColumns`** — only `GROUP_OPTION_MISMATCH` is. With a partial export, `referenceDate` returns `null` and date rules silently stop applying (measured risk in [`PIPELINE.md` §6.3](PIPELINE.md)).
