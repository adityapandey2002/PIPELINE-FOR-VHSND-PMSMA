# 06 — Modules and Features

> **Scope of this document.** A module-by-module catalogue of `src/` — what each module is for,
> what it owns, what it exposes, what it depends on, what it does with errors, the business rules it
> implements and the IndexedDB entities it touches — followed by a feature inventory that marks
> every feature Implemented / Partially implemented / Planned with evidence.
>
> **Evidence rule.** Every non-trivial claim is cited as `file:line` and was read from the working
> tree. Anything that could not be established from the repository is written as
> **"Not verified from the current repository."**
>
> **Companion documents** — [`03-project-structure.md`](03-project-structure.md) (the file tree and
> generated-file rules) · [`04-system-architecture.md`](04-system-architecture.md) (layers and import
> direction) · [`05-application-workflows.md`](05-application-workflows.md) (what calls what, at
> runtime) · [`07-database-documentation.md`](07-database-documentation.md) (the IDB entities) ·
> [`PIPELINE.md`](PIPELINE.md) §7 (the flat file inventory) ·
> [`DATA-MODEL.md`](DATA-MODEL.md) (the schema, rules, indicators and comparisons in full).

---

## 1. How to read this catalogue

Each entry gives: **Purpose** · **Responsibilities** · **Key files** · **Exports** ·
**Dependencies** · **Inputs / outputs** · **Error handling** · **Business rules** · **IDB entities**.
`src/` contains 50 files in nine directories; the catalogue below covers every one of them.

---

## 2. `src/app/` — routes and the shell

### 2.1 `src/app/layout.tsx` — the server shell

**Purpose.** The only server-rendered file in the app: it supplies document metadata and injects the
Content-Security-Policy that makes "nothing is uploaded" enforceable.

**Responsibilities.** Title and description (`:4-8`); assembling the eleven CSP directives
(`:10-25`); rendering `<html lang="en">` with the CSP `<meta httpEquiv>` in `<head>` (`:29-32`).

**Exports.** `metadata` (`:4`), `CSP` (module-private, `:10`), `RootLayout` (default, `:27`).

**Dependencies.** `./globals.css` (`:2`) and `next`'s `Metadata` type (`:1`).

**Error handling.** None — the layout cannot fail at runtime; the CSP is a compile-time constant.

**Business rules.** `connect-src 'self' data: blob:` (`:19`) is the egress guarantee;
`script-src` carries `'unsafe-inline' 'unsafe-eval'` (`:15`) because a static export has no server to
issue nonces; `object-src 'none'`, `base-uri 'none'`, `form-action 'self'` (`:22-24`) close the
remaining exfiltration routes.

**IDB entities.** None.

### 2.2 `src/app/page.tsx` — landing

**Purpose.** Orientation and dataset selection: four stage cards, the list of datasets already on
this machine, and the privacy statement.

**Responsibilities.** The `STAGES` array of four cards (`:11-40`); loading and listing local datasets
via `listDatasets()` (`:47-55`); the "Open" button that sets the active dataset and routes to
`/review` (`:121-130`); the privacy note (`:138-145`).

**Exports.** `HomePage` (default, `:42`).

**Dependencies.** `@/components/AppShell`, `@/contracts/dataset`, `@/lib/storage/idb`,
`@/stores/workflowStore`.

**Inputs / outputs.** No input beyond the encrypted IDB; output is the dataset table.

**Error handling.** `listDatasets()` is a promise with no `.catch` (`:49-51`); a decryption failure
would surface as an unhandled rejection. The `alive` flag (`:48,52-54`) prevents a setState after
unmount.

**Business rules.** The dataset list is sorted newest-first by the storage layer
(`src/lib/storage/idb.ts:116`), not here.

**IDB entities.** Reads `ds` (through `listDatasets`, which decrypts every snapshot).

### 2.3 `src/app/ingest/page.tsx` — import

**Purpose.** Turn a survey export into a dataset: drop zone, progress phases, orientation and header
mapping decisions, and the post-import notices.

**Responsibilities.** The `Phase` state machine (`:18`); the extension guard (`:142-151`); reading the
file and keeping the raw buffer (`:156-159`); `ingestBuffer` — the whole parse/create/validate
pipeline (`:52-140`); the orientation notice (`:260-276`); the duplicate-import warning
(`:278-302`); the collapsed-column warning (`:304-322`); the unmatched-title mapping card
(`:324-379`); the dataset-insights panel (`:382-463`).

**Exports.** `IngestPage` (default, `:20`). `Phase` is module-private.

**Dependencies.** `@/lib/workers`, `@/stores/{datasetStore,workflowStore}`, `@/schema/columns-vhsnd`,
`@/lib/insights`, `@/lib/ingestCopy`, `@/lib/storage/idb`, `react-dropzone`.

**Inputs / outputs.** In: a `File`. Out: a new `DatasetSnapshot` + `ValidationCache` in IDB; an active
dataset id in the workflow store.

**Error handling.** Every failure lands in `phase = "error"` with the message rendered in a red card
(`:134-137,228-233,163-166`). The `catch` converts non-`Error` throws with `String(err)` (`:136`).

**Business rules.** `missingCritical` is the fixed pair `SubmissionDate`, `B8` (`:102-104`);
`columnsRecognized` counts only codes present in the registry (`:100-101`); a re-read deletes the
dataset this screen created earlier (`:86-87,132`); the unmatched-title `<select>` disables codes
already present in the file (`:358,362`).

**IDB entities.** Writes `ds` and `validation`; reads and writes `ui` (`hdr:<fileName>`, `:160,188`);
reads `ds` for the duplicate-import check (`:119`).

### 2.4 `src/app/review/page.tsx` — adjudication

**Purpose.** Show every finding and let a human resolve it, one row at a time.

**Responsibilities.** Loading the dataset, the validation cache and the resolutions (`:40-44`);
severity filtering (`:47-51`); the summary cards (`:158-170`); the cleaning-insights panel
(`:172-215`); the unresolved-error banner (`:217-226`); the violation table (`:242-292`); the
`RowDrawer` (`:295-302`); the audit log (`:304-332`); re-running validation on demand (`:77-96`).

**Exports.** `ReviewPage` (default, `:26`); `SEVERITY_LABEL` is module-private.

**Dependencies.** `@/components/{AppShell,DatasetPicker,RowDrawer,InsightPanel,SummaryCard}`,
`@/lib/{derive,insights,workers}`, `@/contracts/{resolution,violation}`, `@/stores/*`.

**Inputs / outputs.** In: the active dataset id and the user's decisions. Out: resolutions in the
`res` store; a refreshed validation cache.

**Error handling.** `handleRevalidate` has a `finally` that always clears the spinner (`:93-95`), but
no `catch` — a validation failure would reject unhandled. The `RowDrawer` owns its own error
rendering (`src/components/RowDrawer.tsx:247-249`).

**Business rules.** "Continue to Visualise" is disabled while `unresolved.length > 0` (`:146-153`);
the banner states that affected rows still flow into the cleaned set and the report
(`:220-224`); the audit log is sorted by `decidedAt` (`:320`).

**IDB entities.** Reads `ds`, `validation`, `res`; writes `validation` on re-run (`:87-92`).

### 2.5 `src/app/viz/page.tsx` — visualise and capture

**Purpose.** Evaluate indicators and comparisons, render them, and capture the ones worth reporting.

**Responsibilities.** Mode switching (`:39,259-273`); indicator evaluation and fallback (`:60-72`);
comparison computation (`:74-81`); the partial-comparison gate (`:83-85,335-366`); chart capture to
PNG (`:126-158`); thumbnail hydration (`:106-124`); the saved-chart grid with removal (`:425-473`);
the insight tiles (`:205-251`).

**Exports.** `VizPage` (default, `:22`).

**Dependencies.** `html-to-image`, `@/components/{AppShell,DatasetPicker,ChartCanvas,ColorPicker,InsightPanel}`,
`@/schema/indicators`, `@/lib/{derive,insights,comparisons}`, `@/lib/storage/idb`, `@/stores/*`.

**Inputs / outputs.** In: clean rows. Out: chart metadata + encrypted PNG in the `chart` and `blob`
stores.

**Error handling.** A capture failure is caught and logged with `console.error` (`:153-157`) — the
only `console` call in the application. Chart-blob load failures are swallowed silently
(`:118`).

**Business rules.** The gate key is `datasetId | comparisonId | mode` (`:83`), so switching
comparison re-arms the gate; the chart kind is forced by the comparison in comparison mode (`:87`);
the title becomes the comparison label (`:89`); "Add to report" is disabled while the chart is
withheld (`:417`).

**IDB entities.** Reads `ds`, `res`, `validation`, `blob`; writes `chart` and `blob`.

### 2.6 `src/app/report/page.tsx` — sign-off and export

**Purpose.** Produce the deliverables and — if the user is finished — destroy the local workspace.

**Responsibilities.** Loading everything (`:38-43`); deriving the clean set (`:45-48`); the blocking
banner (`:165,180-191`); the four download buttons (`:197-208`); the manifest statistics list
(`:213-220`); the erase action (`:129-134`); the "About the report" copy (`:224-241`).

**Exports.** `ReportPage` (default, `:22`); `ExportKind` is module-private.

**Dependencies.** `@/export/{csv,pptxReporter,docxReporter,reportContext,templates.generated}`,
`@/lib/{derive,storage/idb}`, `@/schema/indicators`, `@/stores/*`.

**Inputs / outputs.** In: the clean set, the resolutions, the violations, the saved charts. Out:
four files downloaded via object URL; possibly a wiped workspace.

**Error handling.** `doExport` wraps everything in `try/catch/finally` (`:61-126`); a failure is
rendered under the buttons (`:210-212`) and `running` is always cleared (`:124-126`). The DOCX path
throws a specific message when no template is installed (`:100-102`).

**Business rules.** `blocked = unresolved > 0 || clean.rows.length === 0` (`:165`) — the audit-JSON
button is *not* gated on `blocked` (`:206`); the erase requires a `window.confirm` (`:130`).

**IDB entities.** Reads `ds`, `res`, `validation`, `chart`, `blob`; **deletes everything** on erase.

### 2.7 `src/app/globals.css` — design tokens

**Purpose.** The tone palette and layout primitives (`.app-shell`, `.topbar`, `.data`, `.muted`,
`.small`, `.empty`, `.spinner`). The tone tokens are defined in `:root` (`:1-24`): `--error` /
`--error-soft` (`:12-13`), `--warning` / `--warning-soft` (`:14-15`), `--info` / `--info-soft`
(`:16-17`), `--ok` / `--ok-soft` (`:18-19`). Note there is deliberately **no `--warn` token** — a
grep for `var(--warn` across `src/` returns nothing; the warning tone is always `--warning`
(`src/app/ingest/page.tsx:279,305`; `src/app/viz/page.tsx:321,370`; `src/components/SummaryCard.tsx:14`).

---

## 3. `src/components/` — shared UI

| Module | Purpose & responsibilities | Exports | Dependencies | Error handling | Business rules | IDB |
|---|---|---|---|---|---|---|
| `AppShell.tsx` | The chrome: brand, four-step nav, and the **hydration gate** | `AppShell` (`:15`) | `@/stores/workflowStore`, `next/link`, `next/navigation` | None — it renders a spinner instead of content | The nav is the four stages `/ingest → /review → /viz → /report` (`:8-13`); content is withheld until `hydrated` (`:19-32`) so a reload cannot flash "no dataset" | none |
| `ChartCanvas.tsx` | The single rendering surface for all 18 chart kinds: recharts families plus four hand-built SVG/DOM renderers (`box`, `gauge`, `waffle`, `heatmap` — `:42,208-213`) | `ChartCanvas` | `recharts`, `@/contracts/chart`, `@/schema/indicators`, `@/lib/comparisons` | An empty series yields a guided empty state, not a blank frame (`:169-189`) | One shared tooltip for every chart (`:68-141`), showing the heading, one row per series with its unit, and a `detail` line resolved per series via `detail:<dataKey>`; `aria-label={title}` on the container (`:179,202`) | none |
| `RowDrawer.tsx` | The per-row decision form | `RowDrawer` (`:14`) | `@/contracts/{dataset,violation}`, `@/schema`, `@/schema/engine/normalize`, `@/stores/resolutionStore` | Local `error` state rendered in red (`:247-249`); the decision is refused rather than saved when invalid | Drop and override require a written reason (`:62`); an override must pass `coercer.reject` (`:63-68`) and is re-read through the schema on save (`:113-116`); "keep" without acknowledging stays unresolved (`:79-82`) | writes `res` |
| `DatasetPicker.tsx` | Lists local datasets and switches the active one | `AppDatasetPicker` (`:8`) | `@/lib/storage/idb`, `@/stores/workflowStore` | None — `listDatasets()` has no `.catch` (`:14`) | The `<tr>` is clickable but carries **no `role`, `tabIndex` or `onKeyDown`** (`:49-56`), so a keyboard user cannot switch datasets — recorded as accessibility debt in `PROJECT_CONTEXT.md` §16.5 | reads `ds` |
| `InsightPanel.tsx` | A collapsible card wrapping a grid of `SummaryCard`s | `InsightPanel`, `Insight` | `./SummaryCard` | None | `aria-expanded` on the toggle (`:38`) | none |
| `SummaryCard.tsx` | A metric tile: label + value, coloured by tone | `SummaryCard` (`:1`) | none | None | Numbers are formatted with `toLocaleString("en-IN")` (`:24`) — Indian digit grouping throughout | none |
| `ColorPicker.tsx` | Five pastel swatches, multi-select | `ColorPicker`, `PASTEL_COLORS` (`:8`) | none | None | Selection order is preserved (cycling), with a "Reset" button (`:58-62`) | none |

---

## 4. `src/contracts/` — the shared vocabulary

`src/contracts/` is a **leaf layer**: it imports nothing from `@/` at all. It is the app's internal
API — see [`04-system-architecture.md`](04-system-architecture.md) §3.

| Module | Purpose | Main exports | Inputs / outputs | Error handling | Business rules |
|---|---|---|---|---|---|
| `dataset.ts` | The shape of the data as it moves through the app | `CellValue` (`:1`), `NormalizedRow` (`:6`), `DatasetKind` (`:13`), `SourceMeta` (`:15`), `DatasetSnapshot` (`:23`), `DatasetSummary` (`:42`), `emptyValue` (`:52`), `isBlank` (`:56`) | `CellValue` = `string \| number \| boolean \| null` — null is distinct from `""` | Pure types; `isBlank` is a type guard | `DatasetKind` is `"vhsnd" \| "pmsma"` (`:13`), but only `vhsnd` is registered (`src/schema/index.ts:5`). `presentColumns` is optional on the snapshot (`:39`) so snapshots saved before it existed still load |
| `violation.ts` | What a finding is and how it is identified | `Severity` (`:1`), `ViolationCategory` (`:3-11`), `Violation` (`:13`), `violationKey` (`:42`), `keyedViolations` (`:65`), `severityRank` (`:75`) | A violation carries `rowId`, `ruleId`, `code`, `severity`, `category`, `message`, and optionally `fieldId`, `rawValue`, `suggestedValue` | Pure functions; no throwing | The identity key is `` `${rowId}\|${code}\|${fieldId ?? ruleId}\|${rawValue}` `` (`:50`) — `rowId` + `code` alone is not enough, because one row can raise the same code from several fields. A repeated identity gets an occurrence suffix (`:71`) |
| `resolution.ts` | The human decision and the pure function that applies it | `ResolutionStatus` (`:1`), `RowResolution` (`:3`), `CleanRow` (`:19`), `applyResolution` (`:30`) | `applyResolution(row, resolution, coerce?)` → `{keep, values}` | Never throws; an unknown status falls through to "keep unchanged" (`:54`) | `pending`/`keep` → keep as-is; `drop` → not kept; `override` → merged and **re-read through the schema coercer** so a stored replacement can never hold a shape its column cannot (`:41-52`). `CleanRow.presentColumns` (`:22-27`) exists so "absent from the file" is never conflated with "present but blank" |
| `chart.ts` | The chart vocabulary | `ChartKind` (`:1-19`), `ChartConfig` (`:21`), `ChartImage` (`:31`), `SavedChart` (`:39`), `ChartSuggestion` (`:56`) | `ChartKind` has 18 members | Pure types | `ChartImage.blob` is a `Blob`, explicitly "never as a base64 string" (`:33`); `SavedChart.image.blobKey` is the IndexedDB key where the PNG lives (`:52`) |
| `indicator.ts` | The indicator vocabulary | `DataType` (`:1-8`), `Aggregation` (`:10`), `IndicatorDef` (`:12`), `ComputedStats` (`:29`) | Seven declared data types; five are used by the 21 indicators | Pure types | `DataType` declares `ordinal` and `numeric-categorical`, which **no indicator uses** (`src/schema/indicators.ts:140-276`) |

**IDB entities.** None directly — contracts are types. The records they describe are persisted in
`ds`, `res`, `chart` and `validation`.

---

## 5. `src/lib/` — analysis, crypto and the worker runner

### 5.1 `src/lib/workers.ts` — the off-thread runner

**Purpose.** The single entry point for the two expensive stages, and the only place the thread
decision is made.

**Responsibilities.** Worker construction and the capability probe (`:36-58`); the 120 s timeouts
(`:62,138`); the main-thread fallback via dynamic `import()` (`:98-115,168-183`); the non-browser
rejection (`:92-97,164-167`); the buffer transfer (`:89`).

**Exports.** `ParseTask` (`:7`), `ValidateTask` (`:19`), `WorkerUnavailableError` (`:26`), `runParse`
(`:47`), `runValidate` (`:121`).

**Inputs / outputs.** In: a `ParseTask` / `ValidateTask` plus an optional `onProgress(phase)`
callback. Out: `ParsedSheet` / `{violations, counts, byRow}`; failures arrive as promise rejections.

**Error handling.** Timeout → `Error("Parse timed out.")` / `Error("Validation timed out.")`;
worker crash → `Error("Parse worker error: …")`; no browser → `WorkerUnavailableError`
(`:26-33`).

**Business rules.** Both paths call the *same* pure payload function, so behaviour cannot drift
between the worker and the fallback.

**IDB entities.** None.

### 5.2 `src/lib/crypto.ts` — encryption at rest

**Purpose.** Envelope encryption for everything persisted, plus key management.

**Responsibilities.** AES-256-GCM encryption of strings (`:18-27`) and bytes (`:41-49`);
decryption (`:29-39,51-57`); generating and caching the app key (`:59-82`); base64 helpers
(`:84-95`).

**Exports.** `encryptString`, `decryptString`, `encryptBytes`, `decryptBytes`.

**Inputs / outputs.** In: a string or `Uint8Array`. Out: `v1.<ivB64>.<cipherB64>` for strings,
`[IV(12) ‖ ciphertext]` for bytes.

**Error handling.** `decryptString` throws `"Unsupported encrypted payload format."` for anything
that is not a three-part `v1.` payload (`:30-33`).

**Business rules.** A fresh 12-byte IV per operation (`:20,43`); the key is generated once, stored
in a **separate** `pipeline-crypto` database under `app-key-v1` (`:3-4,74-79`), and cached in
memory after the first use (`:59-62`). **No passphrase, no key export, no rotation** — clearing site
data destroys the key and every dataset with it.

**IDB entities.** `pipeline-crypto` / `keyval` (the key itself).

### 5.3 `src/lib/storage/idb.ts` — persistence

**Purpose.** The only module that touches IndexedDB.

**Responsibilities.** Opening the versioned connection and self-healing a stale database
(`:30-45`); the generic `storeSet` / `storeGet` / `storeDelete` / `storeKeys` primitives
(`:59-85`); 16 typed read/write helpers; the privacy wipe (`:260-273`).

**Exports.** `P` (the store-name map, `:15-21`), `StoredChartMeta` (`:139`), `ValidationCache`
(`:189`), `EncryptedKeyValStorage` (`:232`), `createEncryptedStorage` (`:239`), `eraseAllLocalData`
(`:260`), plus `saveDataset`, `loadDataset`, `listDatasets`, `deleteDataset`, `saveResolutions`,
`loadResolutions`, `saveChartMeta`, `loadChartMetas`, `deleteChart`, `saveChartBlob`,
`loadChartBlob`, `saveValidation`, `loadValidation`, `deleteValidation`, `saveHeaderOverrides`,
`loadHeaderOverrides`.

**Inputs / outputs.** In: plain JS values. Out: encrypted values in IndexedDB — every value is
encrypted before it is written (`:90,128,151,177,197,221,246`).

**Error handling.** Promise rejections from `req.onerror` (`:41,54,64,77`); a blocked upgrade
rejects with a human-readable message (`:42`); `eraseAllLocalData` **never throws** — success,
error and blocked all resolve (`:268-270`).

**Business rules.** `DB_NAME = "vhsnd-pipeline"`, `DB_VERSION = 2` (`:23-24`); the six stores are
created in `onupgradeneeded` if missing, which is what lets a stale database self-heal
(`:34-39`); `deleteDataset` also deletes the resolutions (`:121`) but **not** the charts or their
blobs — the comment at `:122` says charts are removed separately by the store.

**IDB entities.** All six stores of `vhsnd-pipeline`.

### 5.4 `src/lib/derive.ts` — cleaning and derivation

**Purpose.** Turn a snapshot plus decisions into the cleaned rows that everything downstream reads.

**Responsibilities.** The schema-version-keyed coercer cache (`:24-38`); `deriveCleanRows`
(`:40-66`); `unresolvedErrors` (`:74-90`).

**Exports.** `DerivedClean` (`:10`), `deriveCleanRows`, `unresolvedErrors`.

**Inputs / outputs.** In: a `DatasetSnapshot | null`, the violations, the resolutions map. Out:
`{rows, dropped, pending}` — each `CleanRow` carrying `presentColumns` (`:54-58`).

**Error handling.** A schema that cannot be resolved yields a `null` coercer and the error is
discarded (`:31-35`) — values are then left uncoerced. The behaviour is documented in the comment
above it (`:19-23`) and recorded as a risk in `PROJECT_CONTEXT.md` §16.3.

**Business rules.** `pending`/`keep` → kept; `drop` → dropped; `override` → merged and re-coerced
(`:53` → `src/contracts/resolution.ts:30-55`). A row that is kept but still carries an unresolved
error is reported as `pending` (`:50,63`) — **it still flows into charts and reports**.

**IDB entities.** None (pure functions over data already in memory).

### 5.5 `src/lib/insights.ts` — the summary statistics

**Purpose.** The numbers the insight panels show.

**Responsibilities.** `computeDatasetInsights` — present / present-but-empty / missing / sparse,
with per-column fill and unique counts (`:37-89`); `computeCleaningInsights` (`:103-124`);
`computeVizInsights` (`:139-168`).

**Exports.** `ColumnStat` (`:8`), `DatasetInsights` (`:16`), `computeDatasetInsights`,
`CleaningInsights` (`:91`), `computeCleaningInsights`, `VizInsights` (`:126`), `computeVizInsights`.

**Inputs / outputs.** In: a snapshot, violations, resolutions, and (for viz) an `IndicatorSeries`.
Out: plain count objects.

**Error handling.** None — every function returns `null` for a `null` dataset (`:38,107,145`).

**Business rules.** Presence comes from the parser's column list, not from the values, so a column
that is in the file but entirely blank is reported as *empty* and not as *missing* (`:64-73`);
**sparse = fill rate < 50 %** (`:87`); `columnsWithData` may exceed the schema count when titles
the form version does not map carry data (`:79`).

**IDB entities.** None.

### 5.6 `src/lib/comparisons.ts` — the comparison registry

**Purpose.** 21 derived *relationships* between indicators, each naming its own chart kind.

**Responsibilities.** Standardisation helpers (`stdBool` `:8`, `stdNum` `:20`); the counting helpers
(`countTrue` `:58`, `pctTrue` `:65`, `sumNum` `:98`); the hover-detail helpers (`pctDetail` `:71`,
`pctPoint` `:76`, `countPoint` `:81`, `meanDetail` `:125`); the shape builders (`mkSeries` `:239`,
`mkResult` `:263`, `funnelInsight` `:283`); the 21 definitions (`:320-1090`).

**Exports.** `stdBool`, `stdNum`, `countTrue`, `pctTrue`, `sumNum`, `COMPARISON_CATEGORIES` (`:303`),
`ComparisonDef` (`:312`), `COMPARISONS` (`:320`), and the types `ComparisonGroupRow`,
`ComparisonSeriesKey`, `BoxStat`, `GaugeStat`, `WaffleStat`, `MatrixStat`, `ScatterStat`,
`ComparisonExtra`, `ComparisonResult`.

**Inputs / outputs.** In: `CleanRow[]`. Out: a `ComparisonResult` — `{kind, series, extra, insight,
columnsUsed, columnsMissing}` (`:230-237`).

**Error handling.** None — every comparison is a pure computation over rows; a missing column yields
zero rather than an exception.

**Business rules.** **`hasValues` (`:35`) and `inFile` (`:44`) — both module-private — are two
different questions**: the first drives the maths (a blank column contributes no data), the second
builds `columnsMissing` (from `presentColumns`), so "Not in this file" names columns the file
genuinely lacks, never a carried-but-empty column. Every percentage point carries `unit: "%"`
**and** a `detail` such as "9 of 20 sites" (`:71-94`) — **a percentage is never shown bare**.
Missing columns are appended to the insight sentence (`:259-261`).

**Known defect.** `anc-pnc-bias` declares `kind: "grouped-bar"` but supplies a single `seriesKeys`
entry (`:457`), while `ChartCanvas` only takes the grouped branch when `seriesKeys.length > 1`
(`src/components/ChartCanvas.tsx:256`) — it silently falls through to a single-series bar chart.
Recorded in `PROJECT_CONTEXT.md` §16.2 (D2).

**IDB entities.** None.

### 5.7 `src/lib/ingestCopy.ts` — honest wording

**Purpose.** One sentence of copy, chosen so the screen never blames the export for our own merges.

**Responsibilities.** `collapsedNotice(causes)` — three variants depending on whether the repeats
came from the file's own code row (`sheet-code`), from our title resolution (`resolved-title`), or
both (`:11-24`).

**Exports.** `collapsedNotice`.

**Inputs / outputs.** In: an array of `CollapseCause`. Out: a paragraph (or `""` when there is
nothing to explain).

**Error handling.** None.

**Business rules.** The wording follows the `cause`, never the header count alone.

### 5.8 `src/lib/workerScope.ts` — the worker global shim

**Purpose.** A typed view of `globalThis` for the worker modules, avoiding DOM lib clashes.

**Exports.** `WorkerScope` (`:2`), `workerScope()` (`:7`). **No business logic, no IDB entities.**

---

## 6. `src/schema/` — the declarative survey model

### 6.1 `src/schema/index.ts` — version resolution and the audit hash

**Purpose.** Map a schema version to a schema, and hash that schema for the audit trail.

**Responsibilities.** `SCHEMA_VERSION = "2026.1"` (`:4`); `SUPPORTED_DATASET_KINDS = ["vhsnd"]` (`:5`);
the `SCHEMAS` map (`:8-10`); `getSchema` (`:12-18`); `getDatasetSchema` (`:20-25`);
`canonicalSchemaJson` (`:28-30`); `computeSchemaHash` (`:33-38`).

**Error handling.** `getSchema` throws `Unknown schema version "…"` (`:15`); `getDatasetSchema`
throws `Schema … has no dataset "…"` (`:23`).

**Business rules.** `projectSchema` deliberately excludes function bodies
(`src/schema/dsl.ts:174-215`), so the hash recorded on every dataset contains only declarative
identity — which is what makes it stable across refactors of the predicate code.

**IDB entities.** None — but `computeSchemaHash` is called once per dataset creation
(`src/stores/datasetStore.ts:41`) and its result is stored on the snapshot.

### 6.2 `src/schema/dsl.ts` — the field and rule DSL

**Purpose.** The declarative vocabulary the survey form is written in.

**Responsibilities.** The type definitions — `FieldType` (`:4-16`), `GroupOption` (`:18`), `FieldDef`
(`:29-60`), `RuleContext` (`:62`), `CrossFieldRuleDef` (`:72-81`), `DatasetSchemaDef` (`:83`),
`SchemaDef` (`:91`); the builders `group` (`:102`), `rule` (`:110`), `yesNo` (`:115`),
`ordinalField` (`:123`), `countWithSentinel` (`:143`), `count` (`:159`), `date` (`:163`), `text`
(`:167`); the audit projection `projectSchema` (`:178-215`); `stableStringify` (`:217-219`).

**Exports.** All of the above, plus `SentinelMeaning` (`:140`).

**Error handling.** None — pure builders. Unknown fields are rejected by `getSchema`, not here.

**Business rules.** A cross-field rule separates **eligibility** (`appliesTo`) from **failure**
(`violates`), so a row the rule does not apply to is never flagged (`:67-70`); both predicates must
be pure and deterministic — no `Date.now`, no randomness, no order dependence (`:66-70`). A
`no-data` sentinel drops the value; a `zero` sentinel keeps it as a real zero (`:132-138`).
`freeText` fields skip the missing-token list, because "NA" in a name box is content (`:45-50`).

**IDB entities.** None.

### 6.3 `src/schema/versions/v2026-1.ts` — the 2026.1 form

**Purpose.** The concrete survey: 129 fields and 37 cross-field rules.

**Responsibilities.** The group-option derivation `groupChildren` (`:43-51`) and `kindOf` (`:23-36`);
the field curation (`:55-293`); the rule list (`:338-652`).

**Exports.** `VHSND_CROSS_FIELD_RULES` (`:338`), `VHSND_FIELDS` (`:658`), `vhsndLabel` (`:659`),
`VHSND_SCHEMA` (`:665`).

**Business rules.** Group options are derived from the registry through `isDirectChildOf`
(`src/schema/engine/groupChildren.ts:47-51`), so a nested group such as `C10_1` never has its
columns absorbed by `C10`. Rule suffixes are typed: `88` = other, `99` = none, `77` = not
applicable, `SP` = specify (`:23-36`).

**Known gap.** `required: true` is declared on `B8` (`:178`) but **no code path emits the
`MISSING_REQUIRED` violation** — only tests reference it. See §10, feature F26.

**IDB entities.** None.

### 6.4 `src/schema/columns-vhsnd.ts` — the column registry (GENERATED)

**Purpose.** The 253 `label,code` pairs, compiled from `data/vhsnd-columns.csv`.

**Exports.** `ColumnEntry` (`:4`), `VHSND_COLUMNS` (`:6`), `VHSND_COLUMN_MAP` (`:1021`),
`columnLabel(code)` (`:1025`).

**Business rules.** **Never hand-edit.** Regenerate with `node scripts/gen-columns.mjs`. It is the
source of every label in the app — CSV headers (`:23`), insights (`:5`), indicators (`:7`) and the
unmatched-title `<select>` (`src/app/ingest/page.tsx:357`).

### 6.5 `src/schema/indicators.ts` — the indicator registry

**Purpose.** 21 single derived statistics, each with a data type and a chart suggestion.

**Responsibilities.** The `VHSND_INDICATORS` registry (`:42-94`); `evaluateIndicator` (`:123-276`) with
a branch per data type; `suggestCharts` (`:306-345`); the `KIND_LABEL` map (`:284-303`).

**Exports.** `VHSND_INDICATORS`, `SeriesPoint` (`:98`), `IndicatorSeries` (`:116`),
`evaluateIndicator`, `suggestCharts`.

**Inputs / outputs.** In: `CleanRow[]` and an `IndicatorDef`. Out: an `IndicatorSeries` whose points
carry an optional `unit` and `detail` (`:98-105`).

**Error handling.** An unknown data type falls through to an empty series (`:273-274`); a
time-series with no usable date key falls back to a synthetic index (`:163-168`).

**Business rules.** **Boolean value fields are not numbers.** `coerceNumber(true)` is `null`, so
boolean indicators are counted through `coerceBoolean` instead: the value is *Yes answers*,
`missingRate = 1 - answered/total` (`false` counts as an answer), and the detail reads "15 Yes of 17
answered" (`:236-270`). `isDirectChildOf` keeps nested groups out of a breakdown (`:211-212`).

**IDB entities.** None.

### 6.6 `src/schema/engine/` — coercion, mapping and validation

| Module | Purpose | Exports | Key logic | Error handling | Business rules |
|---|---|---|---|---|---|
| `normalize.ts` | Turn an array-of-arrays into a `ParsedSheet` | `coerceFieldValue` (`:88`), `keepCell` (`:141`, private), `buildTypeMap` (`:147`), `FieldCoercer` (`:162`), `buildFieldCoercer` (`:175`), `normalizeRows` (`:201`), `HeaderLayout` (`:267`), `transposeAoa` (`:302`), `detectTransposed` (`:322`), `detectHeaderLayout` (`:355`), `applyHeaderOverrides` (`:457`), `normalizeAoa` (`:480`), `ParsedSheet` (`:40`), `CollapseCause` (`:27`), `GROUP_TOKENS` (`:131`) | The code-row scan (`:374-387`), the duplicate-label-row fallback (`:391-399`), the single-label-row fallback (`:401-407`), the collapse detector with its `cause` (`:508-535`), the unmapped-header collector (`:546-555`) | Unreadable / "no answer" cells are dropped rather than stored (`:141-144`); the transposed detector is conservative (`:322-344`) | A repeated code keeps its **first** occurrence (`:512-513`); an exact copy is silent (`:518`); `cause` is `sheet-code` only when *every* column in the group read its code from the file (`:528-531`); a blank row is skipped and counted (`:576-579`); the orientation flip needs ≥30 rows, ≥2:1 row:column ratio and **two independent signals** (`:294-299,328-330,342-343`) |
| `headerNormalizer.ts` | Resolve a header text to a field code | `buildHeaderMap` (`:374`) → `{knownColumns, normalize, label}`; `normalizeDistributionHeaders` (`:452`) | The five-step ladder: exact code/label (`:420-421`), embedded code token (`:422,409-416`), numbering-stripped label (`:424-428`), fuzzy Dice/containment (`:429`, `:343-371`), `nearWordMatch` (`:431`, `:304-341`) | None — an unresolvable header is returned unchanged (`:433`) so it can be surfaced as unmatched | Fuzzy matching needs ≥3 header words, ≥2 shared words, score ≥0.6 and is **rejected on ties** (`:30-32,355-370`). `nearWordMatch` needs score ≥4 (`:334`); `fuzzyKey` keeps Devanagari combining marks, Hindi stop words score nothing, and `isNearPair` requires the same alphabet, stems ≥2 chars and **no digit anywhere** (`:22-28,285-302`) — the fix for the `H13` false-match sink |
| `cellCoercers.ts` | Read one raw cell as one typed value | `isMissingToken` (`:24`), `coerceBoolean` (`:31`), `coerceOrdinal` (`:49`), `coerceSentinelNumber` (`:62`), `coerceInteger` (`:75`), `coerceNumber` (`:89`), `coerceDate` (`:110`), `coerceTime` (`:182`), `coerceDateTime` (`:238`), `timeToMinutes` (`:259`), `coerceText` (`:273`), `coerceCodedText` (`:283`), `coerceChoiceText` (`:289`), `excelSerialToIso` (`:299`) | Excel serial → ISO day (`:118-168`); day-first vs month-first disambiguation (`:139-160`); AM/PM clock handling (`:208-218`) | Unparseable input returns `null` — never a wrong value | The missing-token list (`na`, `n/a`, `nan`, `na.`, `nil`, `not applicable`, `not available`, `none given` — `:12-21`) applies to coded answers but **not** to free text, where "NA" may be content (`:265-272`); a `no-data` sentinel becomes `null` and a `zero` sentinel becomes a real `0` (`:62-73`) |
| `accessors.ts` | Short accessors for rule predicates | `getRaw`, `n`, `num`, `b`, `d`, `t`, `dt`, `s`, `isDefined`, `groupSelected`, `groupAny`, `groupOptionsSelected`, `groupHasData`, `anyNonBlank`, `cmpDay`, `fmtDay` (`:4-72`) | — | Every accessor returns `null` rather than throwing | A group option is selected when its `{root}_{suffix}` cell is truthy (`:42-44`) |
| `groupChildren.ts` | Resolve which physical columns belong to which group | `VHSND_GROUP_ROOTS` (`:11`), `isDirectChildOf` (`:47`), `directChildSuffixes` (`:54`) | — | None | A naive `startsWith("C10_")` test would wrongly claim `C10_1_A` is an option of `C10` (`:8-10`); the module makes every caller resolve children correctly (`:46-51`) |
| `validate.ts` | The three-pass contradiction engine | `ValidateOptions` (`:14`), `ValidateResult` (`:25`), `referenceDate` (`:32`), `validateRows` (`:41`) | Pass 1 field coercion (`:55-58` → `:110-295`); pass 2 select-multiple coherence (`:59` → `:381-427`); pass 3 cross-field rules (`:60-83`) | A rule that throws becomes a `RULE_EVALUATION_ERROR` warning (`:72-82`) — a bad predicate can never crash an import | **A blank cell never raises anything** (`:119-123`); a sentinel surviving into values is reported as `info` (`:162-177`); `GROUP_OPTION_MISMATCH` is skipped when the child column is absent from the file (`:414`); `referenceDate` is the max `SubmissionDate` and is `null` when that column is missing, in which case all date rules silently do not apply (`:32-39`) |

**IDB entities.** None of these modules touch storage; the engine's output is written by
`src/stores/datasetStore.ts:76-86`.

---

## 7. `src/stores/` — Zustand state

| Module | Purpose & state | Exports | Persistence | Business rules | IDB entities |
|---|---|---|---|---|---|
| `workflowStore.ts` | The session pointer: `activeDatasetId` + the `hydrated` flag | `useWorkflowStore` (`:13`), `useAppHydrated` (`:32`) | **Encrypted**, via `createJSONStorage(() => createEncryptedStorage())` (`:24`) under the key `workflow` (`:23`) | `onRehydrateStorage` sets `hydrated` (`:25-27`), which is what `AppShell` waits on | `ui` |
| `datasetStore.ts` | The active snapshot plus the validation cache | `useDatasetStore` (`:34`), `ValidationState` (`:15`), `selectDatasetSnapshot` (`:101`) | Snapshot → `ds`; cache → `validation` | `createDataset` mints a **new** `crypto.randomUUID()` every time (`:42`) — a re-import therefore does **not** carry decisions over; `load` rehydrates the cached validation (`:65-70`); `removeDataset` clears the in-memory dataset when it removes the active one (`:95-97`) | `ds`, `validation` |
| `resolutionStore.ts` | Per-row decisions | `useResolutionStore` (`:13`) | One encrypted blob per dataset → `res` | `load` is a no-op when `hydratedFor` already matches (`:18`); `setResolution` writes the **whole** map back (`:23-27`), so a decision rewrites the entire per-dataset record | `res` |
| `chartStore.ts` | Saved charts and their PNG references | `useChartStore` (`:18`) | Metadata → `chart`; PNG bytes → `blob` | `load` is a no-op when `loadedFor` matches (`:23`); `addChart` mints an id and builds the blob key `` `${datasetId}/${id}.png` `` (`:39,50`); `removeChart` deletes the metadata **and** the blob (`:68-71` → `src/lib/storage/idb.ts:166-173`) | `chart`, `blob` |

---

## 8. `src/export/` — the deliverables

| Module | Purpose | Exports | Inputs / outputs | Error handling | Business rules | IDB |
|---|---|---|---|---|---|---|
| `reportContext.ts` | Build the deterministic report context and its manifest | `AuditRecord` (`:8`), `ReportContext` (`:16`), `sha256Hex` (`:44`), `BuildContextInput` (`:49`), `buildReportContext` (`:64`) | In: the clean rows, resolutions, violations, counts, indicator defs, charts, schema version. Out: a `ReportContext` with `manifest` | `crypto.subtle.digest` failures reject; nothing else throws | `audit` excludes `pending` and is sorted by `decidedAt` (`:65-74`); an indicator's headline value is the single point value, else the number of points, rounded to 2 dp (`:82-86`); `canonicalString` sorts keys recursively (`:35-42`) so the hash is reproducible; `rowsHash` covers the cleaned values (`:114`) and `manifest` covers the context plus that hash (`:111-116`) | none (reads from the caller) |
| `csv.ts` | The cleaned-data CSV and the download helper | `cleanRowsToCsv` (`:17`), `downloadBlob` (`:32`) | In: `CleanRow[]`. Out: a CSV string | None | The header is `label (code)` (`:22-24`); booleans are `1`/`0` (`:12`); CRLF line endings (`:29`); the object URL is revoked after 5 s (`:40`) | none |
| `pptxReporter.ts` | The slide deck | `generatePptxReport(ctx, charts)` (`:20`) | In: the context and the chart blobs. Out: a `Blob` | A missing blob yields the text "Chart image not captured." instead of an image (`:86-88`) | Five slides: title (with the manifest prefix, `:39`), cleaning summary (`:44-60`), key indicators (`:63-69`), one slide per chart (`:72-89`), audit appendix (`:92-106`) | reads `blob` via the caller |
| `docxReporter.ts` | The official letter | `renderDocxReport` (`:13`), `DocxChartImage` (`:4`), `base64ToBytes` (`:53`) | In: the template bytes, the context, the chart images. Out: a `Blob` | The caller throws first when no template is installed (`src/app/report/page.tsx:100-102`) | `docx-templates` with `{{ }}` delimiters (`:44`); the `chartImage` helper resolves a blob key to a cm-sized PNG (`:29-42`); px → cm at 96 dpi (`:11`) | reads `blob` via the caller |
| `templates.generated.ts` | The embedded DOCX template bytes | `templates` | — | — | **Generated** — `npm run embed:templates`. The app never fetches its template at runtime | none |

---

## 9. `src/workers/` — the worker modules

| Module | Purpose | Exports | Threading model | Error handling | IDB |
|---|---|---|---|---|---|
| `parseWorker.ts` | Read a workbook into a `ParsedSheet` | `ParseRequest` (`:4`), `ParseResponse` (`:26`), `parsePayload` (`:30`) | `parsePayload` is **pure** and directly testable; the worker scope is wired separately at `:81-96` | An unknown message type returns `{ok:false, error:"Unknown message type."}` (`:83-86`); a thrown error is returned as `{ok:false, error: message}` (`:90-95`) — the worker never rejects | none |
| `validateWorker.ts` | Run the contradiction engine over rows | `ValidateRequest` (`:6`), `ValidateResponse` (`:16`), `validatePayload` (`:20`) | Same pattern: pure payload (`:20-28`), separate scope wiring (`:30-44`) | Same envelope (`:32-34,41-43`) | none |

Both workers reach the engine through **dynamic `import()`** so the heavy dependency is loaded only
when the worker runs (`src/workers/parseWorker.ts:31,51-53`; `src/workers/validateWorker.ts:21`).

---

## 10. Feature inventory

Status legend: **Implemented** · **Partially implemented** · **Planned / Not found in codebase**.

| # | Feature | Entry point | Status | Evidence |
|---|---|---|---|---|
| F1 | Drop-zone import (`.xlsx .xls .ods .csv`) | `src/app/ingest/page.tsx:142-169` | **Implemented** | Single file (`:194`); extension guard (`:146-151`); the raw buffer is kept so the file can be re-read (`:159`) |
| F2 | Header → field mapping (resolution ladder) | `src/schema/engine/headerNormalizer.ts:419-437` | **Implemented** | Exact → embedded code token → stripped label → fuzzy Dice → near-word; ambiguous ties are rejected (`:355-370`) |
| F3 | Unmatched-title mapping card | `src/app/ingest/page.tsx:324-379` | **Implemented** | One `<select>` per unmapped title over all 253 columns (`:357`); the choice is saved against the file name and replayed (`:182-190`) |
| F4 | Transposed ("sideways") export detection | `src/schema/engine/normalize.ts:322-344` | **Implemented** | ≥30 rows, ≥2:1 ratio and two independent signals (`:294-299,328-330,342-343`); a manual override is offered (`src/app/ingest/page.tsx:260-276`) |
| F5 | Multi-row header detection (incl. the 3-row ODK code row) | `src/schema/engine/normalize.ts:355-408` | **Implemented** | Rows 1–3 are scanned for a code row with ≥90 % known codes (`:374-387`) |
| F6 | Contradiction / validation engine | `src/schema/engine/validate.ts:41-95` | **Implemented** | Three passes; a throwing rule degrades to `RULE_EVALUATION_ERROR` (`:72-82`) |
| F7 | Row-level adjudication (keep / drop / override) | `src/components/RowDrawer.tsx` | **Implemented** | Drop and override require a justification (`:62`); overrides are re-coerced on save (`:113-116`) |
| F8 | Audit log of every decision | `src/app/review/page.tsx:304-332`, `src/export/reportContext.ts:65-74` | **Implemented** | Sorted by `decidedAt`; embedded in every export |
| F9 | Dataset insights (present / empty / missing / sparse) | `src/lib/insights.ts:37-89` | **Implemented** | Sparse = fill rate <50 % (`:87`) |
| F10 | Cleaning insights + viz insights | `src/lib/insights.ts:103-124,139-168` | **Implemented** | — |
| F11 | Indicator charts (21 indicators) | `src/schema/indicators.ts:42-94` | **Implemented** | Five data types in use (`:140-276`) |
| F12 | Comparison charts (21 comparisons) | `src/lib/comparisons.ts:320-1090` | **Implemented** | Each returns `{kind, series, extra, insight, columnsUsed, columnsMissing}` (`:230-237`) |
| F13 | Partial-comparison gate ("Cannot show this in full") | `src/app/viz/page.tsx:335-366` | **Implemented** | Nothing is drawn until the user opts in (`:335`); the chart then carries a "Partial view" line (`:369-373`) |
| F14 | Chart PNG capture to report | `src/app/viz/page.tsx:126-158` | **Implemented** | `toPng`, `pixelRatio: 2`, white background (`:130-134`) |
| F15 | PPTX export | `src/export/pptxReporter.ts:20-112` | **Implemented** | Title, summary, indicators, one slide per chart, audit appendix |
| F16 | DOCX export | `src/export/docxReporter.ts:13-51` | **Implemented** | `docx-templates` with a `{{chartImage blobKey}}` helper (`:29-42`); requires an embedded template |
| F17 | Cleaned CSV export | `src/export/csv.ts:17-30` | **Implemented** | Header `label (code)`; booleans `1`/`0`; CRLF (`:29`) |
| F18 | Audit JSON export | `src/app/report/page.tsx:86-90` | **Implemented** | The full `ReportContext`; **not** gated on `blocked` (`:206`) |
| F19 | SHA-256 manifest binding | `src/export/reportContext.ts:111-116` | **Implemented** | SHA-256 over the canonical context + a hash of the cleaned rows |
| F20 | Encryption at rest | `src/lib/crypto.ts:18-82` | **Implemented** | AES-256-GCM, fresh 12-byte IV per operation |
| F21 | Erase all local data | `src/app/report/page.tsx:129-134` → `src/lib/storage/idb.ts:260-273` | **Implemented** | Deletes every database starting `vhsnd-pipeline` or `pipeline-crypto` |
| F22 | Mandatory-unresolved-error gate before viz/report | `src/app/review/page.tsx:146-153`, `src/app/report/page.tsx:165,180-191` | **Implemented** | A hard block, not a warning |
| F23 | Multiple saved datasets + switcher | `src/stores/datasetStore.ts`, `src/components/DatasetPicker.tsx` | **Implemented** | — |
| F24 | Re-import of the same file | `src/app/ingest/page.tsx:278-302` | **Partially implemented** | A new import always mints a new id (`src/stores/datasetStore.ts:42`), so **decisions do not carry over**; a re-read on the ingest screen deletes the dataset that screen created (`:86-87,132`), but a re-import in a later visit strands the old copy |
| F25 | `pmsma` dataset kind | `src/contracts/dataset.ts:13` | **Planned / Not found in codebase** | Type only. No schema, no columns file, no rules, no UI entry. `SUPPORTED_DATASET_KINDS = ["vhsnd"]` (`src/schema/index.ts:5`) |
| F26 | Mandatory-field enforcement (`MISSING_REQUIRED`) | `src/schema/versions/v2026-1.ts:178` | **Partially implemented** | `required: true` is declared on `B8`, but **no code path emits the violation** — only tests reference it |
| F27 | Service worker / true offline PWA | — | **Planned / Not found in codebase** | No `serviceWorker` registration anywhere in `src/` |
| F28 | Authentication / multi-user | — | **Planned / Not found in codebase** | Single-user local app by design; `decidedBy` is the literal `"user"` (`src/contracts/resolution.ts:13`) |
| F29 | CI/CD pipeline | — | **Planned / Not found in codebase** | No CI config in the repository; `npm run ci` exists for local use (`package.json:18`) |
| F30 | Code coverage reporting | — | **Planned / Not found in codebase** | No coverage provider or threshold in `vitest.config.ts` |
| F31 | `anc-pnc-bias` grouped-bar chart | `src/lib/comparisons.ts:452-459` | **Partially implemented** | Declares `kind: "grouped-bar"` with a **single** `seriesKeys` entry (`:457`); `ChartCanvas` only takes the grouped branch when `seriesKeys.length > 1` (`src/components/ChartCanvas.tsx:256`) — it silently falls through to a single-series bar chart |
| F32 | Comparison-mode insight tiles | `src/lib/comparisons.ts:239-257` | **Partially implemented** | `mkSeries` hard-codes `dateSpanDays: 0` and `numericShape: "flat"` (`:252-254`), and `vizInsights` reads them (`src/app/viz/page.tsx:216,242`) — in comparison mode "Date span" and "Shape" are placeholders presented as measurements |
| F33 | Keyboard-accessible dataset switching | `src/components/DatasetPicker.tsx:49-56` | **Partially implemented** | The `<tr>` has `onClick` and `cursor: pointer` but no `role`, `tabIndex` or `onKeyDown` |
| F34 | `zod` validation | `package.json:31` | **Planned / Not found in codebase** | Declared but **never imported** anywhere in `src/`, `tests/` or `scripts/`; the schema system uses its own DSL (`src/schema/dsl.ts`) |
