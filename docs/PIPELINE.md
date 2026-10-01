# VHSND & PMSMA Pipeline — Codemap & Reference

**Last updated:** 2026-10-02
**Source of truth:** working tree at commit `e754df9` (branch `main`) — every statement below was read from
source, from the test suite, or measured by executing the repo's own code. Anything that could **not**
be verified is called out explicitly (see §6).

**What this document covers:** §1 purpose · §2 architecture · §3 stage-by-stage pipeline with
`file:line` cites · §4 UI map · §5 testing & quality gates · §6 known limitations (incl. the RESOLVED
comparison-charts count) · §7 file inventory.

---

## 1. What this app is for

An **offline-first district health survey pipeline** for VHSND session data. A health official drops an
ODK/Excel export into the browser and the app:

1. **Ingest** — parses `.xlsx / .xls / .ods / .csv` locally, maps headers to the 253-column VHSND
   registry, flips exports whose fields run down column A, and lets the user point unmatched titles at
   a field (`src/app/ingest/page.tsx:51-190`).
2. **Review & clean** — runs a contradiction engine and lets the user keep / drop / override each flagged
   row with a written justification (`src/app/review/page.tsx`, `src/components/RowDrawer.tsx`).
3. **Visualise** — evaluates 21 indicators and 21 comparison charts, captures chart images
   (`src/app/viz/page.tsx`).
4. **Report** — exports PPTX, DOCX, cleaned CSV and an audit JSON, each bound by a SHA-256 manifest
   (`src/app/report/page.tsx`, `src/export/*`).

Everything runs in the browser: datasets are AES-256-GCM encrypted in IndexedDB
(`src/lib/crypto.ts:5,18-27,74-77`, `src/lib/storage/idb.ts:89-91`), a CSP blocks remote origins
(`src/app/layout.tsx:10-25`), and a build gate fails the ship if the static export references a network
URL (`scripts/check-offline.mjs:18-34`). The build is a pure static export (`next.config.ts:4`), so the
artifact can be served from a file share with no server.

> **Scope note:** despite the title, only the `vhsnd` dataset kind exists today —
> `SUPPORTED_DATASET_KINDS = ["vhsnd"]` (`src/schema/index.ts:5`); `pmsma` is declared as a type
> (`src/contracts/dataset.ts:13`) but has no schema, columns file or rules. See §6.

---

## 2. Architecture

### 2.1 Component diagram

```
        Browser (single static bundle, output: "export" -> out/)
        ┌──────────────────────────────────────────────────────────────────┐
        │  App Router routes (every page is "use client"; layout.tsx is    │
        │  the server shell that injects the CSP)                         │
        │   /  /ingest  /review  /viz  /report                            │
        │        │          │        │       │                            │
        │        ▼          ▼        ▼       ▼                            │
        │  ┌─────────────────────────────────────────┐                    │
        │  │ Zustand stores                          │                    │
        │  │  workflowStore (persist, encrypted)     │                    │
        │  │  datasetStore / resolutionStore /       │                    │
        │  │  chartStore                             │                    │
        │  └───────────────┬─────────────────────────┘                    │
        │                  │                                              │
        │   lib/workers.ts │  runParse / runValidate                      │
        │        ┌─────────┴──────────┐   (module Worker, 120 s timeout,  │
        │        ▼                    ▼    main-thread fallback)          │
        │  workers/parseWorker.ts  workers/validateWorker.ts              │
        │        │                    │                                   │
        │        ▼                    ▼                                   │
        │  schema/engine/*  ← schema/versions/v2026-1.ts (rules+fields)   │
        │   normalize · headerNormalizer · cellCoercers · validate        │
        │        │                                                        │
        │        ▼                                                        │
        │  lib/derive (clean rows) · lib/insights · schema/indicators     │
        │  lib/comparisons · components/ChartCanvas (recharts + custom)   │
        │        │                                                        │
        │        ▼                                                        │
        │  export/reportContext → pptxReporter · docxReporter · csv       │
        └──────────────────────────────────────────────────────────────────┘
                                  │  (all reads/writes local)
                                  ▼
   IndexedDB "vhsnd-pipeline" v2 (ds, res, chart, blob, validation, ui)
   IndexedDB "pipeline-crypto"  (single AES-GCM data key)
```

### 2.2 Layer map

| Layer | Modules | Role |
|---|---|---|
| Routes | `src/app/{page,ingest,review,viz,report}/page.tsx`, `layout.tsx` | Five screens; `layout.tsx` injects the CSP |
| Components | `src/components/*.tsx` (7 files) | Shell, charts, drawer, cards, pickers |
| State | `src/stores/{workflow,dataset,resolution,chart}Store.ts` | Zustand; workflow persisted through encrypted IDB |
| Workers | `src/workers/{parse,validate}Worker.ts`, `src/lib/workers.ts` | Heavy parse/validate off-thread with inline fallback |
| Schema | `src/schema/**` | Column registry, field DSL, coercion, validation rules, indicators |
| Analysis | `src/lib/{derive,insights,comparisons,workers,crypto}.ts` | Clean rows, summaries, the 21 comparisons |
| Storage | `src/lib/storage/idb.ts` | Versioned IDB connection + encryption + wipe |
| Export | `src/export/*` | Report context, PPTX/DOCX/CSV, embedded templates |
| Contracts | `src/contracts/*` | Shared types + pure helpers (`violationKey`, `applyResolution`) |
| Tooling | `scripts/*.mjs|cjs`, `tests/**`, `vitest.config.ts` | Codegen, fixtures, gates |

### 2.3 Runtime facts (verified)

| Fact | Value | Cite |
|---|---|---|
| Next.js / React | 16.3.6 (Turbopack) / 19.2.8 | `package.json:23,25` |
| Output | `output: "export"`, `distDir: "out"`, `trailingSlash`, `reactCompiler` | `next.config.ts:4-10` |
| Path alias | `@/*` → `src/*` | `tsconfig.json:25-27`, `vitest.config.ts:10-14` |
| Spreadsheet engine | `xlsx` from local vendored tarball `vendor/xlsx-0.20.3.tgz` | `package.json:29`, `src/workers/parseWorker.ts:31` |
| Charts | `recharts` 3.10.1 + 4 hand-built SVG/DOM renderers, all fed one shared tooltip | `src/components/ChartCanvas.tsx:5-32,42,68-141,374-554` |
| Schema version | `SCHEMA_VERSION = "2026.1"` | `src/schema/index.ts:4` |
| Column registry | 253 `label,code` rows in `data/vhsnd-columns.csv` → generated `src/schema/columns-vhsnd.ts` | `scripts/gen-columns.mjs:3,65-82` |

---

## 3. Pipeline stages, in order

### Stage 0 — Schema, registry, rules (static)

* `data/vhsnd-columns.csv` (253 lines, `label,code`) is compiled by `scripts/gen-columns.mjs` into
  `src/schema/columns-vhsnd.ts`, which exports `VHSND_COLUMNS`, `VHSND_COLUMN_MAP` and
  `columnLabel(code)` (`src/schema/columns-vhsnd.ts:6,1021,1025`). Hand-editing the generated file is
  unsupported; edit the CSV and re-run the script.
* `src/schema/versions/v2026-1.ts` declares **129 fields** (14 of them select-multiple `group`s,
  `src/schema/versions/v2026-1.ts:55-140,142-293,299`) and **37 cross-field rules**
  (`:338-652`): X001–X015, X017–X021, X024, X025 (22 explicit) plus generated `X022-<root>` ×7 and
  `X023-<root>` ×8 (`:578-619`). Severity mix of those 37 rules: **11 error / 23 warning / 3 info**.
* The DSL lives in `src/schema/dsl.ts` (`group`, `rule`, `yesNo`, `ordinalField`, `countWithSentinel`,
  `count`, `date`, `text`, `projectSchema`, `stableStringify` — `dsl.ts:102-217`), accessors in
  `src/schema/engine/accessors.ts`, group-child
  resolution in `src/schema/engine/groupChildren.ts:11-61` (nested roots such as `C10_1` are handled
  explicitly rather than by prefix).
* `src/schema/index.ts` resolves a version → dataset schema and hashes the canonical schema for the audit
  trail (`getDatasetSchema:20-25`, `computeSchemaHash:33-38`).

### Stage 1 — Ingest & parse

1. `src/app/ingest/page.tsx:142-169` accepts `.xlsx/.xls/.ods/.csv` (react-dropzone, single file;
   extension guard `:146-151`), keeps the raw `ArrayBuffer` in state (`:159`) so the same file can be
   read again without re-picking it, and first loads any header matches already saved for that file
   name (`loadHeaderOverrides`, `:160`).
2. `runParse` (`src/lib/workers.ts:47-118`) posts the `ArrayBuffer` to `workers/parseWorker.ts`, with a
   120 s timeout (`:62`) and a main-thread fallback that dynamically imports the same module (`:96-110`);
   `WorkerUnavailableError` (`:26-29`) documents that case. No `window` at all ⇒ reject (`:92-95`).
   `ParseTask` carries two extras alongside the buffer: `orientation: "auto" | "upright" | "flipped"`
   (`workers.ts:14`, `parseWorker.ts:16`) and `headerOverrides` keyed by the header text in the sheet
   (`workers.ts:16`, `parseWorker.ts:22`).
3. `parsePayload` (`src/workers/parseWorker.ts:30-79`) reads the workbook with `cellDates: true`
   (`:32-35`), takes the first sheet unless told otherwise (`:36-38`), and converts to an
   **array-of-arrays** (`sheet_to_json({ header: 1, defval: null, raw: true, blankrows: false })`,
   `:43-48`) so repeated "Others (Specify)" labels never collapse into one key. Orientation is resolved
   next (`:57-61`): `auto` (the default) consults `detectTransposed`, while `"flipped"` / `"upright"`
   are the user's manual override from the ingest screen. `resolveLabel` prefers a saved manual match
   over the normalizer (`:59`).
4. **Orientation.** `detectTransposed` (`src/schema/engine/normalize.ts:295-317`) only fires on a tall
   sheet — ≥ 30 rows and at least twice as many rows as columns (`TRANSPOSE_MIN_ROWS`/guards,
   `:267-272,301-303`) — and needs two independent signals: ≥ 60 % of the first 80 column-A cells must
   resolve to known field codes (`:315`), while the top row after its first cell must resolve to known
   codes in **under** 60 % of cases (`:316`), i.e. that row looks like values, not titles. `transposeAoa`
   (`:275-288`) then swaps rows and columns, and the flip is recorded as
   `transposed: true` on `ParsedSheet` (`:49`, returned at `:503`).
5. `detectHeaderLayout` (`normalize.ts:323-358`) decides the header shape: row 2 counts as a **code row**
   when ≥ 90 % of its non-empty cells are known codes (`CODE_ROW_THRESHOLD`, `:265`), giving a 2-header
   layout (`:337-339`); otherwise, if row 2 simply **repeats row 1's titles** — `isDuplicateLabelRow`
   (`:361-380`) needs ≥ 90 % agreement, as titles or as resolved codes — the pair is read as headers
   (`headerRows: 2`, `dataStart: 2`, `:341-350`), which is what a flipped export's duplicated label
   column looks like; the fallback is a **single label row** whose labels are resolved through the
   header normalizer (`headerRows: 1`, `:352-357`).
6. `buildHeaderMap().normalize` (`src/schema/engine/headerNormalizer.ts:75-137`) resolves a header in
   this order: exact code/label (`:109-110`), a code token embedded anywhere — e.g. `"8. B8"`
   (`:31-32,111-112`), the label with a leading numbering stripped (`:113-117`), then a fuzzy
   Dice/containment match with ≥ 3 header words, ≥ 2 shared words and score ≥ 0.6, rejected on ties
   (`:34-36,44-72`). `applyHeaderOverrides` (`normalize.ts:387-398`) runs on the layout immediately
   after detection (`:417`) and rewrites a column's code whenever the map holds that column's label —
   or its own code — as a key, so a title the schema does not know becomes the field the user chose.
7. `normalizeAoa` (`normalize.ts:407-513`) keys columns by code, keeps the **first**
   occurrence of a repeated code, records genuinely indistinguishable duplicates in `collapsedColumns`
   (`:434-449`) — exact copies are silent (`:442-444`) — coerces every cell through
   `coerceFieldValue` (`:74-116`), drops unreadable / "no answer" cells (`keepCell`, `:127-131`), skips
   wholly empty rows (`:490-493`) and returns `presentColumns` + `meta.headerRow`. It also collects
   `unmappedHeaders` — titles the schema could not place, in sheet order and without repeats
   (`:458-469`, returned at `:504`) — while their values stay in the sheet under the title itself.
8. `createDataset` (`src/stores/datasetStore.ts:40-58`) mints a **new `crypto.randomUUID()`** id
   (`:42`), attaches `schemaVersion` + `schemaHash`, and encrypts the snapshot into IDB
   (`idb.ts:89-91`). The ingest screen remembers the dataset *it* created and deletes it when the file
   is read again, so one file does not pile up as several copies (`ingest/page.tsx:85-86,130-132`).
9. `runValidate` then stores the validation cache (`ingest/page.tsx:87-98`), the page computes
   `columnsRecognized` / `missingCritical` (`:99-103`) and asks whether this file was imported before
   (`:119-129`, card at `:278-302`) — decisions are per import, they never follow a re-import.
10. **Post-import cards.** Three notices can follow the success card (`:234-258`):
    * **Orientation** (`:260-276`) — shown when the sheet was read flipped or the user overrode it.
      "This export was sideways" explains that rows and columns were swapped, with a
      **"Read it as it is, without swapping"** button; the mirror case reads "Read exactly as it is"
      with **"Swap rows and columns, then read again"** (`rereadOtherWay`, `:171-180`). This card is
      `--info`; the warning-coloured cards use `--warning` / `--warning-soft` (`globals.css:14-15`) —
      there is no `--warn` token in the stylesheet.
    * **Collapsed columns** (`:304-324`) — repeated titles that could not be told apart.
    * **Unmatched titles** (`:326-381`) — one row per title in `unmappedHeaders`, each with a `<select>`
      of all 253 VHSND columns (`code — label`, codes already present in the file disabled, `:359-367`)
      plus a "Leave it out" default, and **"Match these and read again"** (`:372-379`). The choice is
      saved against the file name — encrypted, in the `ui` store under `hdr:<fileName>`
      (`saveHeaderOverrides`, `idb.ts:217-222`; `loadHeaderOverrides`, `:224-228`), wiped by the privacy
      erase (`:260-273`) — and applied on the next read (`applyHeaderMapping`, `ingest/page.tsx:182-190`).

### Stage 2 — Validation (contradiction engine)

`validateRows(rows, schema, options)` — `src/schema/engine/validate.ts:41-95`, three passes per row:

1. **Field-level coercion** (`validate.ts:55-58` → `collectFieldViolations:110-295`): `INVALID_BOOLEAN/
   INTEGER/NUMBER/DATE/TIME/ORDINAL` (`validate.ts:134,150,187,205,231,247`), `UNEXPECTED_ORDINAL` /
   `UNEXPECTED_VALUE` (`:261,280`), `OUT_OF_RANGE` from `checkRange` (`:429-465`), date-window checks
   (`:214-223`) and sentinel notices `SENTINEL_NO_DATA` / `SENTINEL_NOT_APPLICABLE` reported as `info`
   (`:162-177`). Blank cells never raise anything (`:119-123`).
2. **Select-multiple coherence** (`:59` → `checkGroupSelections:381-427`): `parseGroupSelection`
   (`:320-370`) reads a parent cell written as bare tokens (`"A B 88"`), as answers spelled out, or as
   label variants; leftovers become `UNMAPPED_GROUP_OPTION` (`:399-410`) and parent/child disagreements
   become `GROUP_OPTION_MISMATCH` — **skipped when the child column is absent from the file**
   (`:412-425`, gated by `presentColumns` from `ValidateOptions:22`).
3. **Cross-field rules** (`:60-83`): `appliesTo` + `violates` produce a `Violation`; a throwing rule is
   swallowed and reported as `RULE_EVALUATION_ERROR` so validation can never crash a row (`:72-82`).
   `referenceDate` (`:32-39`) is the max `SubmissionDate`, and is `null` when that column is missing —
   date rules then simply do not apply.

The reference date is passed as `refDate: null` from the UI so the engine computes it
(`ingest/page.tsx:90`, `review/page.tsx:84`).

### Stage 3 — Review & resolution

* `src/app/review/page.tsx` lists violations via `keyedViolations` (`review/page.tsx:51`; the dedupe
  key is `` `${rowId}|${code}|${fieldId ?? ruleId}|${rawValue}` ``, `src/contracts/violation.ts:42`),
  filters by severity (`review/page.tsx:47-50`), shows counts / category badges / column-coverage copy
  (`:130-215`), and gates "Continue to Visualise" on zero unresolved errors (`:146-153`).
* `src/components/RowDrawer.tsx` records the decision: **keep** (optionally acknowledging specific error
  codes or `__all`, `RowDrawer.tsx:77-93`), **drop** or **override** — the latter two require a written
  justification (`:62`), and an override value must pass `coercer.reject` (`:63-68`) and is re-read
  through the schema on save (`:113-116`).
* Decisions persist per dataset in `resolutionStore` → encrypted IDB (`src/stores/resolutionStore.ts:23-27`,
  `idb.ts:127-135`).
* `unresolvedErrors` (`src/lib/derive.ts:74-90`) defines "still pending": an `error` violation whose row
  is un-decided, or kept without acknowledging that code.

### Stage 4 — Clean-row derivation

`deriveCleanRows` (`src/lib/derive.ts:40-66`) maps every row through `applyResolution`
(`src/contracts/resolution.ts:30-55`): pending/keep → kept as-is, drop → dropped, override → merged and
re-coerced (`buildFieldCoercer`, `normalize.ts:161-186`, cached per schema version, `derive.ts:24-38`).
Rows kept but still carrying an unresolved error are reported as `pending` (`derive.ts:50,63`) — they
still flow into charts and reports until decided (`review/page.tsx:217-226`).

Every clean row — kept, dropped or pending — also carries `presentColumns`: the schema codes the source
file physically held, copied from the dataset snapshot (`derive.ts:54-58`, field declared on `CleanRow`
at `src/contracts/resolution.ts:19-29`). Values alone cannot tell *"the file does not have this
column"* from *"the file has it and nobody filled it"*, so consumers that must not conflate the two
read `presentColumns` instead of the values.

### Stage 5 — Insights, indicators, comparisons

* **Dataset insights** — `computeDatasetInsights` (`src/lib/insights.ts:37-89`): distinguishes schema
  columns *present*, *present-but-empty*, *missing*, and the raw `columnsWithData` total (which may
  exceed the schema count when titles the form version does not map carry data); sparse = fill rate
  < 50 % (`:87`).
* **Cleaning / viz insights** — `computeCleaningInsights` (`insights.ts:103-124`),
  `computeVizInsights` (`insights.ts:139-168`).
* **Indicators** — 21 definitions (`src/schema/indicators.ts:42-94`) evaluated by
  `evaluateIndicator:123-276`, which switches on five `dataType`s — `time-series`, `categorical`,
  `geospatial`, `numeric`, `numeric-distribution` (`indicators.ts:140-276`); the wider `DataType` union
  also declares `ordinal` and `numeric-categorical`, which no indicator uses
  (`src/contracts/indicator.ts:1-8`). Sensible fallbacks apply — date keys → any temporal-looking column →
  ordinal index (`indicators.ts:150-158`). `suggestCharts:306-345` ranks chart kinds per data type.
  **Boolean value fields** (`ANM1`, `ASHA1`, `C6`, `New`, … — checked through `schemaFieldType`,
  `:107-114`) are not numbers: `coerceNumber(true)` is `null`, so before commit `e754df9` every such
  indicator read as 100 % missing with a value of 0. They are counted through `coerceBoolean` instead —
  the value is **Yes answers**, `missingRate` is `1 - answered/total` (`false` counts as an answer), and
  the point detail reads `"15 Yes of 17 answered"` (`:236-270`). Every point also carries an optional
  `unit` and `detail` (`:98-105`).
* **Comparisons** — 21 entries in `COMPARISONS` across 6 `COMPARISON_CATEGORIES`
  (`src/lib/comparisons.ts:303-310,320-1090`), each `compute(rows)` returning a
  `ComparisonResult {kind, series, extra, insight, columnsUsed, columnsMissing}` (`:230-237`). They span
  14 chart kinds: `funnel, grouped-bar, bar-vertical, bar-horizontal, stacked-100, heatmap, box, gauge,
  pareto, donut, pie, scatter, waffle, radar`. Two different questions decide what happens next:
  `hasValues` (`:35-37`) still drives the maths (a blank column contributes no data), while
  `columnsMissing` is built from `inFile` (`:44-48`), which reads `presentColumns` off the first clean
  row and only falls back to values when a caller supplies none — so "Not in this file" names columns
  the file genuinely lacks, not columns it carries and left blank. Missing columns are listed in the
  insight sentence (`missingNote:259-261`) and, in the UI, hold the chart back until the user opts in
  (Stage 6).
* **Hover detail behind the numbers.** A percentage is never shown bare: `pctPoint` / `pctDetail` /
  `countPoint` / `meanDetail` / `pointsFromGroups` (`comparisons.ts:71-94,125-131`) attach `unit: "%"`
  and a `detail` string (`"9 of 20 sites"`, `"45 % — 9 of 20 sites"`) to every series point, and
  grouped/gauge/scatter stats carry `detail` (plus `detail:<dataKey>` for multi-series) —
  `GaugeStat.detail` (`:192`), `ScatterStat.detail` (`:215`).

### Stage 6 — Visualise & chart capture

`src/app/viz/page.tsx`:

* Two modes: `indicator` and `comparison` (`:39`); the active kind in comparison mode is forced by the
  comparison itself (`:87`), the title becomes the comparison label (`:89`), and `compResult` is computed
  only in that mode (`:78-81`). `missingColumns` and `awaitingPartial` are derived from it
  (`:83-85`), keyed by dataset + comparison + mode so switching away and back re-arms the gate.
* **Incomplete comparisons are withheld.** When `columnsMissing` is non-empty and the user has not opted
  in, `ChartCanvas` is not rendered at all: the card shows **"Cannot show this in full"** with the list
  of missing columns and a **"Show partial anyway"** button (`:335-366`). Nothing is drawn until that
  button is pressed, so a funnel cannot be read as a smaller result than it really is. Once opted in,
  the chart renders with a **"Partial view — not in this file: …"** line above it (`:369-373`), the
  **"Not in this file:"** chip next to the chart-type readout is shown (`:320-324`), and **Add to
  report** becomes available — it is disabled while the comparison is being withheld
  (`:413-421`).
* The Analysis row labels the mode button from the registry — **"Comparison charts (21)"**, with a
  matching tooltip (`:266-272`) — instead of a hard-coded count.
* `ChartCanvas` (`src/components/ChartCanvas.tsx`) renders recharts families plus four custom renderers
  for `box/gauge/waffle/heatmap` (`CUSTOM_KINDS`, `:42,208-213`); an empty series yields a guided empty
  state instead of a blank chart (`:169-189`).
* **Every chart shares one tooltip.** All ten recharts `<Tooltip />`s take `content={ChartTooltip}`
  (`ChartCanvas.tsx:68-141,219-356`): a hand-styled box showing the label/heading, one row per series
  (name, value with `unit`), then the `detail` line beneath it, resolved per series via
  `detail:<dataKey>` when a chart carries several; scatter special-cases x/y, and a single-series
  payload hides the redundant series name. The four custom renderers show the same information on hover:
  BoxPlot rows get a `<title>` with min/Q1/median/Q3/max/n (`:376-417`), gauges print `detail` under the
  name and expose it to `<title>` (`:419-457`), heatmap cells `title="row · col: v site(s)"` (`:496-554`),
  and waffle squares a filled/total/pct `title` (`:459-494`).
* **Add to report** (`:126-158`) rasterises the chart card with `html-to-image`'s `toPng`
  (`pixelRatio: 2`, white background, `:130-134`) and stores a `ChartConfig` — kind, indicator/comparison id, title,
  series, bins, `extra`, insight — plus the PNG blob (`:136-152`) via `chartStore.addChart`
  (`src/stores/chartStore.ts:38-66`), which encrypts the blob (`idb.ts:175-185`).
* Saved thumbnails are hydrated from IDB as object URLs and revoked on cleanup (`:106-124`).

### Stage 7 — Report & exports

* `buildReportContext` (`src/export/reportContext.ts:64-119`) produces the audit records (sorted by
  `decidedAt`, `:65-74`), summary counts, indicator headline values (`:82-86`), chart references and a
  **SHA-256 manifest** over a canonical JSON of the context plus a hash of the cleaned rows
  (`:111-116`).
* Exports (`src/app/report/page.tsx:81-121`): **CSV** (`export/csv.ts:17-30`, header = label + code),
  **audit JSON** (the whole context), **PPTX** (`export/pptxReporter.ts:20-112` — title, cleaning
  summary, indicators, one slide per saved chart image, audit appendix) and **DOCX**
  (`export/docxReporter.ts:13-51` — `docx-templates` with a `{{chartImage blobKey}}` helper and
  `{{ }}` delimiters, template bytes embedded in the bundle by `scripts/embed-templates.mjs` →
  `src/export/templates.generated.ts:1-15`).
* Export is **blocked** while any unresolved error exists or the cleaned set is empty
  (`report/page.tsx:165,180-191`); "Erase all local data" deletes every app database
  (`:129-134` → `idb.ts:260-273`), including the saved header matches.

---

## 4. UI map

### 4.1 Routes & navigation

| Route | File | Purpose |
|---|---|---|
| `/` | `src/app/page.tsx` | Landing: 4 stage cards (`:11-40`), local dataset table (`:101-135`), privacy note (`:138-145`) |
| `/ingest` | `src/app/ingest/page.tsx` | Drop zone, import summary, orientation notice with manual override, duplicate-import warning, collapsed-column warning, unmatched-title mapping card, dataset insights |
| `/review` | `src/app/review/page.tsx` | Severity filters, violation table, `RowDrawer`, audit log, re-validate |
| `/viz` | `src/app/viz/page.tsx` | Indicator vs comparison mode, partial-comparison gate, chart canvas, palette, saved chart grid |
| `/report` | `src/app/report/page.tsx` | PPTX / DOCX / CSV / audit downloads, manifest stats, data wipe |

`AppShell` (`src/components/AppShell.tsx:8-13,41-51`) renders the four-step nav plus an "Offline
workspace" link, and blocks rendering until the encrypted workflow store hydrates (`:19-32`).
`/ingest → /review → /viz → /report` is the happy path; every step except ingest shows a dataset picker
first when no dataset is active (`DatasetPicker.tsx:22-72`).

### 4.2 Page detail

| Page | Key UI affordances (line) |
|---|---|
| Ingest | extension guard `:146-151`; progress phases `:16,221-226`; success card `:234-258`; "columns recognised / missing critical" `:238-248`; sideways-orientation card with manual override `:260-276`; duplicate-import card `:278-302`; "columns could not be told apart" card `:304-324`; unmatched-title card with per-title `<select>` over all 253 columns and "Match these and read again" `:326-381`; insights panel with top-fill table and sparse toggle (20 ↔ all) `:384-465` |
| Review | summary cards `:163-169`; insights (category badges, column coverage) `:172-215`; unresolved-error banner `:217-226`; severity filter chips `:228-240`; violation table `:248-291`; sticky `RowDrawer` `:295-302`; audit log `:304-332`; "Re-run validation" `:77-96` |
| Viz | insights (11 tiles + numeric summary/shape) `:205-251`; mode buttons `:259-273` ("Comparison charts (21)"); indicator/comparison selects `:274-294`; description + recommendations + chart-type readout with the "Not in this file" chip `:297-327`; palette `:329-331`; withheld "Cannot show this in full" card / chart card + "Partial view" line + insight box `:333-411`; Add-to-report (disabled while withheld) `:413-421`; saved chart grid with remove `:425-473` |
| Report | blocking banner `:180-191`; download buttons `:197-208`; stats list `:213-220`; "About / Privacy / Erase" `:224-241` |

### 4.3 Shared components

`AppShell` (nav + hydration gate) · `ChartCanvas` (all 18 `ChartKind`s, `ChartCanvas.tsx:144-372`) ·
`ColorPicker` (5 pastel swatches, multi-select) · `DatasetPicker` · `InsightPanel` (collapsible card
wrapping `SummaryCard`s) · `RowDrawer` (decision form) · `SummaryCard` (number + tone).

### 4.4 State & persistence

| Store | Persisted? | Notes |
|---|---|---|
| `workflowStore` | Yes — encrypted IDB via `createJSONStorage(createEncryptedStorage())` (`workflowStore.ts:13-30`, `idb.ts:238-252`) | `activeDatasetId`, `hydrated` |
| `datasetStore` | Yes — snapshot + validation cache (`datasetStore.ts:55,76-86`) | `load` rehydrates the cached validation (`:65-70`) |
| `resolutionStore` | Yes — one encrypted blob per dataset (`resolutionStore.ts:23-27`) | keyed by row id |
| `chartStore` | Yes — metadata + encrypted PNG blobs (`chartStore.ts:38-66`) | `loadedFor` guards re-hydration |
| *(no store — plain IDB)* | Header matches, keyed by file name (`idb.ts:217-228`) | `hdr:<fileName>` in the `ui` store; encrypted; removed by the privacy wipe |

IndexedDB: database `vhsnd-pipeline` **version 2** with stores `ds, res, chart, blob, validation, ui`
(`idb.ts:23-25`); the data key lives in a separate `pipeline-crypto` store (`crypto.ts:3`). Opening at an
explicit version with `onupgradeneeded` lets stale databases self-heal (`idb.ts:5-13,34-39`).

---

## 5. Testing & quality gates

### 5.1 Commands in *this* environment (all verified today)

The repo path contains `&`, and `npx`/`npm` have been unreliable in this shell, so call the binaries
directly with `node` (PowerShell 5.1; avoid `&&`, use `;` or `if ($?)`):

```powershell
# 1. Type check          -> "TSC OK"
node .\node_modules\typescript\bin\tsc --noEmit

# 2. Lint (flat config, eslint 9) -> "ESLINT OK"
node .\node_modules\eslint\bin\eslint.js .

# 3. Unit tests          -> 17 files / 201 tests, all pass
node .\node_modules\vitest\vitest.mjs run

# 4. Static export       -> out/ , 6 routes (/, /_not-found, /ingest, /report, /review, /viz)
node .\node_modules\next\dist\bin\next build

# 5. Offline gate        -> "[check-offline] OK - no remote references in static export."
node .\scripts\check-offline.mjs
```

Equivalent npm scripts exist and are the documented interface (`package.json:5-18`):
`dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:watch`, `embed:templates`, `make:sample`,
`build:check-offline`, `build:all`, `ci` (typecheck → lint → test → build).

> **Gotchas:** vitest 5 rejects `--reporter=basic` (use the default reporter configured in
> `vitest.config.ts:8`) — no reporter flag is needed. `next build` regenerates the `AGENTS.md`
> nextjs-agent-rules block; commit it with your work rather than deleting it.

### 5.2 Test inventory (17 files, 201 tests, node environment)

| File | Tests | Covers |
|---|---:|---|
| `tests/engine/validate.test.ts` | 36 | Rule behaviour incl. `MISSING_REQUIRED` being disabled (`tests/engine/validate.test.ts:129-131`) |
| `tests/comparisons.test.ts` | 40 | The 21 comparisons, missing-column handling, "absent from the file" vs "present but blank" (`presentColumns` → `inFile`), and a hover-detail pass asserting every point/group/gauge carries a `detail` (`tests/comparisons.test.ts:391-456`) |
| `tests/engine/coercers.test.ts` | 25 | Boolean/date/time/serial/sentinel coercion |
| `tests/two-row-odk-export.test.ts` | 18 | 2-header (label + code) exports |
| `tests/violation-identity.test.ts` | 11 | `violationKey` stability |
| `tests/indicators.test.ts` | 12 | Indicator evaluation + suggestions, plus the boolean fix: a boolean column counting Yes answers at `missingRate 0.25` (`"2 Yes of 3 answered"`), a fully-answered one at `0`, and every boolean `valueField` read as a count of Yes |
| `tests/derive.test.ts` | 9 | Clean/dropped/pending derivation |
| `tests/schema/headerNormalizer.test.ts` | 8 | Header resolution ladder |
| `tests/transposed-import.test.ts` | 8 | Exports that list fields down column A: `detectTransposed` / `transposeAoa`, an ordinary sheet left alone, the repeated label row read as headers (`headerRows` 2 / `dataStart` 2), and a sideways workbook through `parsePayload` → validate → compare |
| `tests/schema/columns.test.ts` | 7 | 253-column registry integrity |
| `tests/insights.test.ts` | 7 | Dataset/cleaning/viz insight counts |
| `tests/header-mapping.test.ts` | 5 | Titles the schema cannot place: `unmappedHeaders`, applying a title-keyed `headerOverrides` beside the form's own code row, and a matched re-read through `parsePayload` |
| `tests/odk-import.test.ts` | 4 | Label-headed `DATASET_1.xlsx` (asserts ≥ 30 columns) |
| `tests/dataset-1-odk.test.ts` | 3 | Same fixture (asserts ≥ 60 columns, non-empty chart points) |
| `tests/sample-data.test.ts` | 3 | `vhsnd-sample.xlsx` end-to-end; asserts `G1_D` absent and no `MISSING_REQUIRED` |
| `tests/schema/rules.test.ts` | 3 | `X022-`/`X023-` generation guards |
| `tests/docx-template.test.ts` | 2 | Embedded DOCX template renders a non-empty file |

Run: `node .\node_modules\vitest\vitest.mjs run` (config: `environment: "node"`, include
`tests/**/*.test.ts`, `@` alias — `vitest.config.ts:4-15`).

### 5.3 Measured fixture behaviour

Measured by loading the repo's **own** parse/validate modules through a throw-away Vite SSR harness
outside the repo (no source file was touched):

| Fixture | Header layout | Rows | Columns present / recognised | Findings |
|---|---|---:|---|---|
| `sample-data/DATASET_1.xlsx` (sheet 15 × 91) | single label row (`headerRow: 1`) | 14 | 91 present (incl. 5 titles the schema cannot place), **86 of 253 recognised**; `SubmissionDate`, `starttime`, `endtime`, `B8` absent → `refDate = null` | **0** violations — every cross-field rule is inapplicable; **5 unmatched header titles** (the mapping card); comparisons **7 full / 14 partial** |
| `sample-data/DATA_EX_SHAPE.csv` | two-row (`headerRow: 2`) | 3 | 251 of 253 (`G1_D`, `remarks` absent) | 0 violations |
| `sample-data/vhsnd-sample.xlsx` | single code row (`headerRow: 1`) | 160 | 252 of 253 (`G1_D` absent) | 320 errors / 3146 warnings / 307 infos across 26 distinct codes |

Two further exports supplied for measurement — **not stored in this repo** — read through the same
harness today:

| Export | Sheet | Read as | Result |
|---|---|---|---|
| `DATA_EXAMPLE.csv` | 252 × 7, fields down column A | flipped (`transposed: true`), **5 rows**, `headerRow: 2` | **20 of 21 comparisons full** — only `C11_1` is absent from that file |
| `DATASET.xlsx` | 24 × 252 | upright | **21 of 21 full**, 0 errors, 0 warnings |

The `DATASET_1.xlsx` partials are partial because those columns really are not in the file, and its
5 unmatched titles are what the ingest mapping card exists for — the mapping card is §3 Stage 1, the
withheld chart is §3 Stage 6; neither is drawn as if it were complete.

Regenerate fixtures with `node scripts/make-sample-data.cjs` (→ `vhsnd-sample.xlsx`) and
`node scripts/make-shape-sample.mjs` (→ `DATA_EX_SHAPE.csv`).

---

## 6. Known limitations & open issues

### 6.1 RESOLVED — comparison charts: stale count (three quirks still open)

**Status: RESOLVED (the count).** `COMPARISONS` has held **21** entries since `3dd1246` — the last one
labelled "21. Good practice vs bad practice counts" (`src/lib/comparisons.ts:1057-1089`) — but the mode
button and its tooltip were hard-coded to 20, so the UI disagreed with the registry and with the
dropdown that lists all 21. Commit `c88282e` replaced both strings with `COMPARISONS.length`
(`src/app/viz/page.tsx:266-272`), so the button now reads **"Comparison charts (21)"** with a matching
`21 comparison charts …` tooltip; nothing else about the count was wrong. The registry divider comment
carried the same stale number and was reworded to `the comparison registry` while updating this document.

**Still open — verified in code, not reproduced in a browser** (there is no browser/e2e harness;
`tests/comparisons.test.ts` only exercises `compute()`, never the DOM):

1. **Numbering no longer follows the category order.** #21 is filed under
   `COMPARISON_CATEGORIES[1]` (`comparisons.ts:1059`), so the "2 · Service & Infrastructure Readiness"
   optgroup lists 4, 5, 6, 7 **and 21**, while the dropdown's other categories run 1–3, 8–20
   (`viz/page.tsx:286-293`).
2. **One comparison declares a kind its payload cannot drive.** `anc-pnc-bias` returns
   `kind: "grouped-bar"` but supplies a **single** `seriesKeys` entry (`comparisons.ts:452-459`), whereas
   `ChartCanvas` only takes the grouped branch when `seriesKeys.length > 1`
   (`ChartCanvas.tsx:256`) — it silently falls through to the default single-series bar chart over
   `series.points`, ignoring `extra.groups`. (The other grouped-bar comparison, `gdm-bottleneck`, passes
   two series keys and is fine.)
3. **Comparison mode still feeds two stub statistics into the insight tiles.** `mkSeries` computes
   `missingRate` from `used`/`missing` columns since `5382fe0` (`comparisons.ts:239-257`), but still
   hard-codes `dateSpanDays: 0` and `numericShape: "flat"`, and `vizInsights` reads them
   (`viz/page.tsx:91-94,215-216`) — so in comparison mode "Date span / Shape" are not measurements of
   the dataset (comparison mode's "Missing rate" is instead the share of schema columns the file lacks).

**Not verified:** any specific rendering failure (blank canvas, crash, wrong chart) in a browser. If the
symptom you are seeing differs from 1–3 above, it needs a reproducible case before it can be pinned to a
line.

### 6.2 Disabled / absent behaviour (verified)

| Item | Evidence |
|---|---|
| `MISSING_REQUIRED` is **disabled** — `required: true` on `B8` (`v2026-1.ts:178`) is never enforced | only referenced in tests: `tests/sample-data.test.ts:63`, `tests/engine/validate.test.ts:129-131`; no producer in `src/schema/engine/validate.ts` |
| **PMSMA is not implemented** — only `vhsnd` | `src/schema/index.ts:5`; `src/contracts/dataset.ts:13` declares the type only |
| **Re-import strands decisions** — a new import always mints a new dataset id | `src/stores/datasetStore.ts:42`; surfaced to the user at `ingest/page.tsx:278-302`. A re-read *on the ingest screen* now deletes the dataset that screen created earlier (`ingest/page.tsx:85-86,132`), so the pile-up only happens across separate visits |
| Header collapse on single-header files — repeated titles read as one column | `normalize.ts:434-449`, warning card `ingest/page.tsx:304-324` |
| `zod` is a declared dependency but is never imported anywhere in `src/`, `tests/` or `scripts/` | grep: only `package.json:30` + lockfile (also a transitive of `docx-templates`) |

### 6.3 Partial-export "silence" (measured, and a real risk)

With a label-headed file such as `DATASET_1.xlsx` the parser recognises only **86 of 253** columns and
`SubmissionDate`/`B8` are missing, so `referenceDate` returns `null` (`validate.ts:32-39`) and the whole
cross-field rule set reports **zero findings** while the UI still says "0 errors". The UI does surface
`missingCritical` (`ingest/page.tsx:99-103,244-248`) and the coverage copy
(`review/page.tsx:208-211`), but nothing escalates "no findings because the inputs are absent" — the
rule engine stays silent by design (Stage 2), and the review banner only counts unresolved errors.

Comparisons no longer go quiet, though. A comparison whose columns the file lacks is **not drawn**: it
names the missing columns in a "Cannot show this in full" card and waits for the explicit
**"Show partial anyway"** opt-in, after which the chart carries a "Partial view — not in this file:"
line and **Add to report** unlocks (Stage 6). The **"Not in this file"** chip itself now comes from the
file's real column list (`presentColumns` → `inFile`, Stage 5) instead of from row values, so it names
columns the file genuinely lacks and no longer accuses a carried-but-empty column of being absent.
A partial export therefore announces itself as partial rather than charting a smaller number
than it really is.

> **Unverified figure:** a previously circulated claim of "~43 of 253 single-header columns, so date
> rules go silent" **could not be reproduced** against the fixtures in this repo — the measured number
> for the single-header fixture is 86 (and the silence mechanism above is confirmed). Treat "~43" as
> unverified until a file is supplied that produces it.

### 6.4 Operational caveats

* **No service worker / PWA.** The build is a static export plus a CSP; nothing precaches `out/`, so
  "works offline" depends on how the artifact is served (verified: no SW registration anywhere in `src/`).
* **A build wipes the dev server's directory.** `next.config.ts:4-6` sets `output: "export"`,
  `distDir: "out"` and `trailingSlash: true`, so the static export and `next dev` share `out/` — the
  dev server keeps its manifests under `out/dev/`. `next build` rebuilds `out/` from scratch and
  deletes `out/dev/`, so **the dev server must be restarted after any build** (and a build run while
  `next dev` is up leaves that server broken until it is restarted).
* **Workers are best-effort.** `runParse`/`runValidate` fall back to the main thread when `Worker`
  construction fails (`workers.ts:35-56,121-133`), and reject outright outside a browser
  (`:92-95,164-167`).
* **Chart images are the report's source of truth.** Exports embed the PNG captured at add-time
  (`report/page.tsx:92-118`); re-editing a chart later does not update previously saved decks.
* **DOCX needs an embedded template.** One generic template ships in the bundle
  (`src/export/templates.generated.ts:5-11`); replacing it means editing `templates/` and running
  `embed:templates` (`report/page.tsx:100-102`).

---

## 7. File inventory

### 7.1 Source (`src/`, 49 files)

Parenthesised numbers are total lines in the file (blank lines included).

```
src/app/
  layout.tsx                 root layout, metadata, CSP
  page.tsx                   landing + local dataset list                    (148)
  ingest/page.tsx            drop zone, orientation, header mapping, insights (468)
  review/page.tsx            violations table, filters, audit log            (335)
  viz/page.tsx               indicator/comparison charts, capture            (473)
  report/page.tsx            PPTX/DOCX/CSV/audit exports, wipe               (244)
  globals.css, favicon.ico
src/components/  AppShell(60) ChartCanvas(582) ColorPicker DatasetPicker(73)
                 InsightPanel(63) RowDrawer(306) SummaryCard(28)
src/contracts/   chart.ts dataset.ts indicator.ts resolution.ts violation.ts
src/lib/         comparisons.ts(1103) crypto.ts(95) derive.ts(90)
                 insights.ts(168) workers.ts(186) workerScope.ts(9)
                 storage/idb.ts(273)
src/schema/      columns-vhsnd.ts(GENERATED,253 cols) dsl.ts index.ts indicators.ts(345)
                 engine/{accessors,cellCoercers,groupChildren,headerNormalizer,normalize,validate}.ts
                 versions/v2026-1.ts(675)
src/stores/      chartStore.ts datasetStore.ts resolutionStore.ts workflowStore.ts
src/export/      csv.ts docxReporter.ts pptxReporter.ts reportContext.ts templates.generated.ts(GENERATED)
src/workers/     parseWorker.ts(98) validateWorker.ts
```

### 7.2 Tests (`tests/`, 17 files / 201 tests)

See the table in §5.2. Layout: `tests/*.test.ts`, `tests/engine/*.test.ts`, `tests/schema/*.test.ts`.

### 7.3 Data, fixtures, templates, vendor

| Path | Role |
|---|---|
| `data/vhsnd-columns.csv` | 253-row `label,code` source of the column registry |
| `sample-data/vhsnd-sample.xlsx` | 160-row synthetic workbook with deliberately broken demo rows |
| `sample-data/DATA_EX_SHAPE.csv` | Two-row ODK-style CSV twin |
| `sample-data/DATASET_1.xlsx` | Real label-headed export used by import tests |
| `templates/default/vhsnd-letter.docx` | Generic DOCX letter template (3,701 bytes) |
| `vendor/xlsx-0.20.3.tgz` | Vendored SheetJS build (`package.json:29`) |
| `public/*.svg` | Stock create-next-app assets |
| `pdf-extracted.txt` | Extracted source text for the spec (reference only) |

### 7.4 Scripts (`scripts/`)

| Script | Wired to | Purpose |
|---|---|---|
| `gen-columns.mjs` | (manual) | `data/vhsnd-columns.csv` → `src/schema/columns-vhsnd.ts` |
| `make-sample-data.cjs` | `npm run make:sample` | Builds `sample-data/vhsnd-sample.xlsx` |
| `make-shape-sample.mjs` | (manual) | Builds `sample-data/DATA_EX_SHAPE.csv` |
| `make-default-templates.mjs` + `embed-templates.mjs` | `npm run embed:templates` | Generic template → `src/export/templates.generated.ts` |
| `check-offline.mjs` | `npm run build:check-offline` | Fails on any remote URL in `out/**/*.{js,html}` |
| `diagnose-workbook.cjs/.mjs`, `debug-raw.cjs` | (manual) | Ad-hoc workbook debugging, not part of CI |

### 7.5 Root config

`package.json` (scripts `:5-18`, deps `:19-32`) · `next.config.ts` · `tsconfig.json` · `vitest.config.ts` ·
`eslint.config.mjs` · `package-lock.json` · `AGENTS.md` (nextjs-agent-rules block, re-added by
`next dev`) · `CLAUDE.md` (just `@AGENTS.md`) · `README.md` (UTF-16 create-next-app boilerplate) ·
`.gitignore` (ignores `/.next/`, `/out/`, `/node_modules`) · `docs/PIPELINE.md` (this file).

---

## Appendix — headline numbers

| Quantity | Value |
|---|---|
| Column registry | 253 |
| Schema fields / group fields | 129 / 14 |
| Cross-field rules | 37 (11 error, 23 warning, 3 info), 24 distinct codes |
| Distinct field-level codes | `INVALID_*`, `UNEXPECTED_*`, `OUT_OF_RANGE`, `SENTINEL_*`, `UNMAPPED_GROUP_OPTION`, `GROUP_OPTION_MISMATCH`, `RULE_EVALUATION_ERROR` |
| Indicators | 21 |
| Comparisons | 21 across 6 categories, 14 chart kinds |
| Chart kinds supported by `ChartCanvas` | 18 (`KIND_LABEL`, `indicators.ts:284-303`) |
| App routes (static export) | 6 (`/`, `/_not-found`, `/ingest`, `/report`, `/review`, `/viz`) |
| Test suite | 17 files / 201 tests, all passing as of 2026-10-02 |
| Quality gates | tsc clean · eslint 9 clean · 17/201 tests pass · `next build` → `out/`, 6 routes · `check-offline` OK (as of 2026-10-02) |
| IDB databases | `vhsnd-pipeline` v2 (6 stores) + `pipeline-crypto` |
| HEAD | `e754df9` — "count Yes for boolean indicators and show the numbers behind every chart hover" |
