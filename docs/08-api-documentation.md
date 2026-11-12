# API Documentation — VHSND & PMSMA Pipeline

> **There is no network API.** This application ships as a pure static export
> (`next.config.ts:4` → `output: "export"`); every page is a `"use client"` component and
> all survey data stays in the browser. The "API" documented here is the **TypeScript module
> boundary between layers** — the contracts that `src/contracts/`, `src/schema/`, `src/lib/`,
> `src/export/` and `src/lib/storage/` expose to the UI and to each other. Companion reading:
> `PROJECT_CONTEXT.md` §7 (API / Backend) and `docs/PIPELINE.md`.

---

## 1. No network API — evidence

| Claim | Evidence |
|---|---|
| No API route handlers | glob `**/route.ts` under `src/` → **no matches** |
| No server actions | no `"use server"` directive anywhere; all pages carry `"use client"` |
| No middleware | no `middleware.*` file in the repo |
| No server-only modules | none under `src/` |
| No `fetch`/XHR to any host | none in the pipeline; enforced by CSP `connect-src 'self' data: blob:` (`src/app/layout.tsx:19`) |
| No environment variables read | `process.env` does not appear anywhere in `src/` |
| Static export (no server at runtime) | `next.config.ts:4` `output: "export"`; `distDir: "out"`; `trailingSlash: true` |

The build gate `scripts/check-offline.mjs` scans `out/**/*.{js,html}` for remote references and
fails the build if any are found. `connect-src 'self' data: blob:` is the runtime enforcement:
no origin other than the serving origin (plus `data:`/`blob:` URIs) is connectable, so nothing
can be uploaded even if a bug tried.

---

## 2. The de-facto internal API (module surface)

Grouped by layer. Signatures and invariants in §3.

### Schema layer (`src/schema/`)

| Module | Exports |
|---|---|
| `src/schema/index.ts` | `SCHEMA_VERSION`, `SUPPORTED_DATASET_KINDS`, `getSchema`, `getDatasetSchema`, `canonicalSchemaJson`, `computeSchemaHash` |
| `src/schema/engine/normalize.ts` | `detectTransposed`, `transposeAoa`, `detectHeaderLayout`, `normalizeAoa`, `buildFieldCoercer`, `coerceFieldValue`, `buildTypeMap`, `normalizeRows` |
| `src/schema/engine/headerNormalizer.ts` | `buildHeaderMap` (→ `.normalize(text)`), `normalizeDistributionHeaders` |
| `src/schema/engine/validate.ts` | `validateRows`, `referenceDate`, plus `ValidateOptions`/`ValidateResult` |
| `src/schema/indicators.ts` | `VHSND_INDICATORS`, `evaluateIndicator`, `suggestCharts` |

> `applyHeaderOverrides` (`normalize.ts:457`) is module-private despite being listed in
> `PROJECT_CONTEXT.md` §7.2; it is invoked inside `normalizeAoa`, not by callers.

### Engine / lib layer (`src/lib/`)

| Module | Exports |
|---|---|
| `src/lib/derive.ts` | `deriveCleanRows`, `unresolvedErrors`, `DerivedClean` |
| `src/lib/workers.ts` | `runParse`, `runValidate`, `WorkerUnavailableError`, `ParseTask`, `ValidateTask` |
| `src/lib/comparisons.ts` | `COMPARISONS`, `COMPARISON_CATEGORIES`, `stdBool`, `stdNum`, `countTrue`, `pctTrue`, `sumNum` (plus result types) |
| `src/lib/insights.ts` | dataset/cleaning/viz insight helpers |
| `src/lib/ingestCopy.ts` | `collapsedNotice` wording |

> `inFile`/`hasValues` (`comparisons.ts:35-47`) are module-private helpers, contrary to the
> §7.2 listing; they feed the `present`/`missing` split inside `COMPARISONS` definitions.

### Export layer (`src/export/`)

| Module | Exports |
|---|---|
| `src/export/reportContext.ts` | `buildReportContext`, `sha256Hex`, `AuditRecord`, `ReportContext`, `BuildContextInput` |
| `src/export/pptxReporter.ts` | `generatePptxReport` |
| `src/export/docxReporter.ts` | `renderDocxReport`, `base64ToBytes`, `DocxChartImage` |
| `src/export/csv.ts` | `cleanRowsToCsv`, `downloadBlob` |

### Storage layer (`src/lib/storage/`, `src/lib/crypto.ts`)

| Module | Exports |
|---|---|
| `src/lib/storage/idb.ts` | `saveDataset`, `loadDataset`, `listDatasets`, `deleteDataset`, `saveResolutions`, `loadResolutions`, `saveChartMeta`, `loadChartMetas`, `deleteChart`, `saveChartBlob`, `loadChartBlob`, `saveValidation`, `loadValidation`, `deleteValidation`, `saveHeaderOverrides`, `loadHeaderOverrides`, `eraseAllLocalData`, `createEncryptedStorage`, `P`, `StoredChartMeta`, `ValidationCache`, `EncryptedKeyValStorage` |
| `src/lib/crypto.ts` | `encryptString`, `decryptString`, `encryptBytes`, `decryptBytes` |

Contracts (`src/contracts/`) are the shared vocabulary: `dataset.ts`, `violation.ts`,
`resolution.ts`, `indicator.ts`, `chart.ts`. They are types + small pure helpers
(`violationKey`, `keyedViolations`, `applyResolution`).

---

## 3. Function reference (purpose · signature · invariants · storage)

### Schema

**`getSchema(version)` / `getDatasetSchema(version, kind)`** (`src/schema/index.ts:12-25`)  
Resolve a schema by version/kind. `getDatasetSchema` throws `Schema ${version} has no dataset "${kind}"`.  
Invariant: only `"2026.1"` is registered (`SCHEMAS` has one entry); `SUPPORTED_DATASET_KINDS = ["vhsnd"]`.  
Storage: none (pure, in-memory).

**`canonicalSchemaJson(version)` / `computeSchemaHash(version)`** (`src/schema/index.ts:27-38`)  
Canonical projection of the schema + SHA-256 over it. `projectSchema` deliberately excludes
function bodies, so the hash is stable across predicate refactors.  
Invariant: computed once at dataset creation and stored on the snapshot (`schemaHash`).  
Storage: none.

**`detectTransposed(aoa, opts)` / `transposeAoa(aoa)`** (`normalize.ts:322-353`, `:302-320`)  
Detect a sideways export (≥30 rows, ≥2:1 ratio, two independent signals) and flip it.  
Invariant: manual override available; never mutates input (returns new array).

**`detectHeaderLayout(aoa, knownColumns, resolveLabel)`** (`normalize.ts:355-408`)  
Returns `{ headerRows, dataStart, codeSource }`. Scans rows 1–3 for a code row (≥90% known codes);
falls back to a repeated-label row (≥90% agreement); then a single label row.  
Invariant: a 3-row ODK export keeps its code row out of the data.

**`normalizeAoa(aoa, fields, source, knownColumns, resolveLabel, transposed?, headerOverrides?)`** (`normalize.ts:480`)  
AOA → `ParsedSheet`. Keys columns by code, keeps the **first** occurrence of a repeated code,
records indistinguishable duplicates in `collapsedColumns`, coerces every cell, drops unreadable /
"no answer" cells, skips wholly empty rows, collects `unmappedHeaders`.  
Invariant: `presentColumns` = codes the source physically held. `cause` on a collapsed group is
`sheet-code` only when *every* column in the group read its code from the file, else
`resolved-title`.  
Storage: none (pure).

**`buildFieldCoercer(fields)`** (`normalize.ts:175`)  
Returns `{ coerce(code, value) }` using the field's declared type. Cached per schema version in
`derive.ts:24-38`.  
Invariant: coercer is `null` when the schema cannot be resolved; override values are then written
through un-coerced (documented debt, `derive.ts:20-23`).

**`coerceFieldValue(type, value, def?)`** (`normalize.ts:88`)  
Single-cell coercion; used during normalisation. Returns `CellValue`.

**`buildHeaderMap()`** (`headerNormalizer.ts:374`) → `{ normalize(text): string }`  
The header resolution ladder (exact code/label → embedded code token → numbering-stripped label →
fuzzy Dice match → `nearWordMatch`). Ambiguous fuzzy ties are rejected rather than guessed.  
Invariant: `nearWordMatch` requires both stems ≥2 chars, the same alphabet, and no digit anywhere.

**`validateRows(rows, schema, options?)`** (`validate.ts:41`) → `{ violations, counts, byRow }`  
Three passes: field coercion → select-multiple coherence → cross-field rules. A throwing rule is
caught and reported as `RULE_EVALUATION_ERROR` instead of crashing the row/import.  
Options: `refDate` (defaults to max `SubmissionDate`, or `null` when the column is absent),
`presentColumns` (gates `GROUP_OPTION_MISMATCH` on absent child columns).  
Invariant: a blank cell never raises anything. `byRow` is a `Map<string, Violation[]>`.  
Storage: none (pure); result is cached by the caller in IndexedDB `validation`.

**`referenceDate(rows)`** (`validate.ts:32`) → `string | null`  
Max `SubmissionDate`, or `null` when that column is absent (in which case date rules silently
do not apply).

### Lib

**`deriveCleanRows(dataset, violations, resolutions)`** (`derive.ts:40`) → `DerivedClean`  
Maps every row through `applyResolution`: pending/keep → kept as-is; drop → dropped; override →
merged and re-coerced through the schema. Rows kept but carrying an unresolved error are also
listed in `pending` and **still flow into charts/reports**. Every clean row carries
`presentColumns` copied from the dataset.  
Invariant: `rows` + `dropped` partition all input rows; coercer cached per
`${schemaVersion}:${kind}`.

**`unresolvedErrors(violations, resolutions)`** (`derive.ts:74`) → `Violation[]`  
Error violations not yet acknowledged (see §4 error contract).

**`runParse(task, onProgress?)`** (`workers.ts:47`) → `Promise<ParsedSheet>`  
Off-thread when a module Worker can be created; 120 s timeout; falls back to a dynamic `import()`
of `parseWorker` on the main thread in a browser. Rejects with `WorkerUnavailableError` outside a
browser (Node). Both paths call the same pure `parsePayload`.

**`runValidate(task, onProgress?)`** (`workers.ts:121`) → `Promise<{violations, counts, byRow}>`  
Same worker/fallback strategy as `runParse`; `byRow` is a plain `Record<string, Violation[]>`
in the resolved value (converted from the worker's `Map`).

**`evaluateIndicator(rows, def)`** (`indicators.ts:123`) → `IndicatorSeries`  
Evaluates one of 21 indicators; booleans are counted via `coerceBoolean` (Yes answers), with
`missingRate = 1 - answered/total`. Returns points carrying `unit`/`detail`.

**`suggestCharts(def, series)`** (`indicators.ts:306`) → `ChartSuggestion[]`  
Rule-based chart-fit scoring per data type.

**`inFile`/`hasValues` (module-private)** (`comparisons.ts:35-47`)  
`hasValues` drives the maths (a blank column contributes no data); `inFile` reads
`presentColumns` off the first clean row and only falls back to values when none is supplied, so
"not in this file" names columns the file genuinely lacks.

### Export

**`buildReportContext(input)`** (`reportContext.ts:64`) → `Promise<ReportContext>`  
Builds the deterministic context: `audit` (non-pending resolutions sorted by `decidedAt`),
`summary`, `indicators` (single point value or point count, 2 dp), `charts`, `rowsHash`
(SHA-256 of canonical row values), `manifest` (SHA-256 of canonical context + `rowsHash`).  
Invariant: `canonicalString` sorts object keys recursively, so the hash is reproducible
regardless of property-insertion order.

**`sha256Hex(bytes)`** (`reportContext.ts:44`) → `Promise<string>`.

**`generatePptxReport(ctx, charts)`** (`pptxReporter.ts:20`) → `Promise<Blob>`  
`charts: { blob: Blob }[]`. Builds title, cleaning summary, indicators, one slide per saved
chart, audit appendix.

**`renderDocxReport(templateBytes, ctx, chartImages?)`** (`docxReporter.ts:13`) → `Promise<Blob>`  
`chartImages: DocxChartImage[]` (`{blobKey, blob, width, height}`). Fills the embedded DOCX
template via `docx-templates`; requires a template (`templates.generated.ts`).

**`cleanRowsToCsv(rows, includeCodes = true)`** (`csv.ts:17`) → `string`  
Header is `label (code)`; booleans as `1`/`0`; CRLF line endings.

**`downloadBlob(blob, fileName)`** (`csv.ts:32`) → `void`  
Triggers a browser download via an object URL.

### Storage

**`saveDataset(snapshot)` / `loadDataset(id)` / `listDatasets()` / `deleteDataset(id)`** (`idb.ts:89-123`)  
`saveDataset` encrypts the JSON snapshot into the `ds` store keyed by `snapshot.id`. `listDatasets`
decrypts every snapshot to build summaries (O(n) decrypts — performance debt). `deleteDataset`
also removes resolutions; charts/blobs are removed separately by the store.

**`saveResolutions(datasetId, map)` / `loadResolutions(datasetId)`** (`idb.ts:127-135`)  
Encrypted JSON in the `res` store keyed by `datasetId`.

**`saveChartMeta` / `loadChartMetas` / `deleteChart`** (`idb.ts:150-173`) and **`saveChartBlob` /
`loadChartBlob`** (`idb.ts:175-187`)  
Chart metadata in `chart`; PNG bytes in `blob` keyed by `` `${datasetId}/${chartId}.png` ``,
encrypted byte-wise (`[IV(12) ‖ ciphertext]`).

**`saveValidation` / `loadValidation` / `deleteValidation`** (`idb.ts:196-214`)  
`ValidationCache` (`{violations, counts, byRow, validatedAt}`) in the `validation` store.

**`saveHeaderOverrides(fileName, overrides)` / `loadHeaderOverrides(fileName)`** (`idb.ts:217-229`)  
Header overrides in the `ui` store under `hdr:<fileName>`.

**`eraseAllLocalData()`** (`idb.ts:260`) → `Promise<void>`  
Deletes every database whose name starts with `vhsnd-pipeline` or `pipeline-crypto`.

**Crypto (`src/lib/crypto.ts`)**  
`encryptString(plain)` → `v1.<b64 IV>.<b64 ciphertext>`; `decryptString(payload)`; `encryptBytes(bytes)`
→ `[IV(12) ‖ ciphertext]`; `decryptBytes(bytes)`. AES-GCM 256, fresh 12-byte IV per operation,
key cached in memory after first `getAppKey()`. Key is stored raw in a separate
`pipeline-crypto` database (`app-key-v1`); no recovery path.

---

## 4. Conventions

- **Pure functions where possible.** `validateRows`, `normalizeAoa`, `deriveCleanRows`, `evaluateIndicator`,
  and the comparison builders are pure and run in Node tests. Side effects (IndexedDB, Workers) are
  isolated behind `runParse`/`runValidate` and the `idb.ts` helpers.
- **Schema-version-keyed caches.** Field coercers are cached per `${schemaVersion}:${kind}`
  (`derive.ts:24-38`); the validation cache is keyed by `datasetId` in IndexedDB. Datasets carry
  `schemaVersion` + `schemaHash` so a stale cache can be detected.
- **`presentColumns` discipline.** Values alone cannot distinguish "column absent from the file" from
  "column present but blank". Consumers that must not conflate the two read `presentColumns`
  (`CleanRow.presentColumns`, `DatasetSnapshot.presentColumns`). `inFile` (`comparisons.ts:44`) is
  the canonical example; `GROUP_OPTION_MISMATCH` is gated on it (`validate.ts:412-425`).
- **Worker payload functions are pure and testable in Node.** `parsePayload` (`parseWorker.ts`) and
  `validatePayload` (`validateWorker.ts`) are the single code path used by both the Worker and the
  inline fallback, so behaviour cannot drift. In Node (tests) `runParse`/`runValidate` reject with
  `WorkerUnavailableError`; tests call the payload functions directly.
- **A blank never raises a violation** (`validate.ts:119-123`); sentinel "no data"/"not applicable"
  markers raise `info`-severity violations instead of errors.
- **No throwing across the boundary.** A rule that throws degrades to `RULE_EVALUATION_ERROR`
  rather than failing the import.

---

## 5. Example call chain

```ts
import { runParse, runValidate } from "@/lib/workers";
import { saveDataset, saveValidation, saveResolutions } from "@/lib/storage/idb";
import { deriveCleanRows } from "@/lib/derive";
import { buildReportContext } from "@/export/reportContext";

// 1. ingest
const parsed = await runParse({
  buffer, fileName, sizeBytes, importedAt, orientation: "auto",
});

// 2. persist dataset (mints id + schemaVersion + schemaHash inside the store layer / caller)
await saveDataset({ id, name, kind: "vhsnd", rows: parsed.rows,
  presentColumns: parsed.presentColumns, schemaVersion: "2026.1",
  schemaHash: await computeSchemaHash(), source: { ... } });

// 3. validate
const { violations, counts, byRow } = await runValidate({
  rows: parsed.rows, schemaVersion: "2026.1", presentColumns: parsed.presentColumns,
});
await saveValidation(id, { violations, counts, byRow: Object.fromEntries(byRow), validatedAt: new Date().toISOString() });

// 4. derive cleaned rows after adjudication
const resolutions = await loadResolutions(id);
const { rows: cleanRows, dropped, pending } = deriveCleanRows(dataset, violations, resolutions);

// 5. report
const ctx = await buildReportContext({ app: { name: "VHSND Offline Analytics Pipeline" },
  dataset, cleanRows, violations, resolutions, charts, indicators });
```

---

## 6. Error contract

| Error / degradation | Where | Behaviour |
|---|---|---|
| `WorkerUnavailableError` | `src/lib/workers.ts:26-33` | Thrown by `runParse`/`runValidate` when no Worker can be created **and** `window` is undefined (Node). In a browser without module-Worker support the same functions fall back to an inline dynamic `import()` of the payload module on the main thread instead. |
| `RULE_EVALUATION_ERROR` | `src/schema/engine/validate.ts:72-82` | A cross-field rule whose `violates` throws is caught; the row gets a `RULE_EVALUATION_ERROR` violation (severity `error`) instead of crashing the row or the import. |
| Coercer fallback to `null` | `src/lib/derive.ts:26-38` | If `getDatasetSchema` throws for a dataset's version/kind, `coercerFor` returns `null` and `applyResolution` writes override values through **without coercion**. The underlying error is discarded (documented debt). |
| Unknown schema version | `src/schema/index.ts:14-16` | `getSchema` throws `Unknown schema version "${version}".` |
| Unknown dataset kind | `src/schema/index.ts:20-24` | `getDatasetSchema` throws `Schema ${version} has no dataset "${kind}".` |
| Missing dataset / resolution | `src/lib/storage/idb.ts:93-97` | `loadDataset` returns `null`; `loadResolutions` returns `{}`. Callers must handle absence. |
| Coercion failures at field level | `validate.ts` pass 1 | Raise `INVALID_*` / `OUT_OF_RANGE` / `UNEXPECTED_*` (severity `error`) or sentinel `info` violations; a blank cell raises nothing. |

---

## 7. Links

- `PROJECT_CONTEXT.md` §7 — API / Backend (this doc's source of truth for the module table).
- `docs/PIPELINE.md` — line-cited codemap, stage-by-stage pipeline, file inventory.
- `docs/DATA-MODEL.md` — column registry, field DSL, validation rules, indicators, comparisons.
- `src/contracts/` — shared types and pure helpers (`dataset`, `violation`, `resolution`, `indicator`, `chart`).
- `src/lib/storage/idb.ts` — IndexedDB wrapper and all read/write helpers.
- `src/lib/crypto.ts` — AES-GCM encryption at rest.
- `src/lib/workers.ts` — worker strategy, fallback, `WorkerUnavailableError`.