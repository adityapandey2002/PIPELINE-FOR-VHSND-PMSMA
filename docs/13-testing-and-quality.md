# 13 — Testing and Quality

**Scope:** the test suite, what it covers, what it does not, the quality gates, and how to add to it.

**Three facts up front:**

1. The suite is **19 files / 212 tests**, run by **Vitest 5** in a **`node` environment** — a pure unit suite with no browser.
2. It covers the **data model** (schema, coercion, rules, indicators, comparisons, import shapes) very thoroughly, and covers the **UI, storage, crypto and export layers** essentially not at all.
3. **There is no coverage configuration, no coverage threshold, and no CI configuration anywhere in the repository.**

Related reading: [`12-development-guide.md`](12-development-guide.md) (the workflow), [`DEVELOPMENT.md`](DEVELOPMENT.md) (the short companion), [`DATA-MODEL.md`](DATA-MODEL.md) (the model under test), [`10-configuration-and-environment.md`](10-configuration-and-environment.md) (the Vitest config).

---

## 1. The test setup

### 1.1 Configuration

`vitest.config.ts` is 15 lines in total:

```ts
export default defineConfig({
  test: {
    environment: "node",              // vitest.config.ts:6
    include: ["tests/**/*.test.ts"],  // vitest.config.ts:7
    reporters: ["default"],           // vitest.config.ts:8
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },  // vitest.config.ts:10-14
  },
});
```

| Property | Value | Effect |
| --- | --- | --- |
| Runner | `vitest@^5.0.1` (`package.json:42`) | — |
| Environment | `node` (`vitest.config.ts:6`) | **No DOM.** `window`, `document`, `indexedDB` and `Worker` are undefined. Node's global `crypto` **is** available, which is why `crypto.subtle` code paths work under test. |
| Discovery | `tests/**/*.test.ts` (`vitest.config.ts:7`) | Only `tests/`, only `.test.ts`. Nothing under `src/` is collected as a test. |
| Reporter | `["default"]` (`vitest.config.ts:8`) | Fixed. **Vitest 5 rejects `--reporter=basic`** — do not pass it. |
| Alias | `@` → `<repo>/src` (`vitest.config.ts:10-14`) | Mirrors `tsconfig.json:25-29` exactly, so a test imports application modules unchanged: `import { validateRows } from "@/schema/engine/validate";` |
| TypeScript | Transpiled by Vite/esbuild; **not** type-checked by Vitest | Types are checked by the separate `tsc --noEmit` gate (`package.json:11`) |

### 1.2 What is **not** configured

| Setting | Status |
| --- | --- |
| `coverage` | **Absent** — no provider, no `reporter`, no `thresholds`. `vitest run --coverage` has no configured provider. |
| `globals` | Absent — every test imports `describe`/`it`/`expect` from `"vitest"` explicitly. |
| `setupFiles` | Absent — there is no global setup/teardown file. |
| `testTimeout` | Not overridden — the suite relies on the default, and on the **120 s worker timeouts** in the application (`src/lib/workers.ts:62`, `:140`). |
| `pool` / `threads` | Not configured — Vitest's defaults. |

---

## 2. The full inventory — 19 files, 212 tests

Counts are the number of `it(...)` / `test(...)` declarations in each file, counted from the source.

| # | File | Tests | What it covers |
| ---: | --- | ---: | --- |
| 1 | `tests/comparisons.test.ts` | **40** | The 21 comparison charts. Boolean/text-number standardisation (`Yes`/`yes`/`1`/`true` → `true`; junk → `null`); the `count`/`pct`/`sum` helpers; funnel cascades (anemia, PIH) summing each step; **missing-column handling** — a column absent from the file is reported, a column present but blank is *not*; group-by-block logics (GDM bottleneck, ASHA adoption, teleconsult by supervisor, block scorecard); service & readiness percentages (ANC vs PNC, basic vs advanced, venue privacy/hygiene 100 %-stacked pairs, ANM safety); supply-chain logics (urine cross-tab, IFA box plot outlier filter > 180, FP supply vs counselling gauges); counselling (prenatal pareto with cumulative reaching 100, PNC neglect); digital health (register reality, MCP gap); vulnerable demographics (teen/couple waffle, danger-sign gap, ANC dropout gauge); **registry integrity** — exactly 21 comparisons across 6 categories, unique ids, and every comparison survives `compute([])` and junk rows; **hover detail** — every point carries a `detail` line, percentage points carry `unit: "%"`, grouped rows and gauges carry a detail. |
| 2 | `tests/engine/validate.test.ts` | **36** | The cross-field rule engine. Numeric chains (X001 high-BP identified > measured, X002 referrals > identifications, X003 anemia identified > tested, X004 moderate+severe > identified) — each asserted as a *flag* **and** as *silent when consistent*. Session status (X012 session not held but data exists, X013/X014 reason rules). Unsafe practices (X015 reason required when syringes are not cut; H21 counted, never flagged). Date sanity (X019 visit after submission, X020 future dates vs the reference date, X021 end before start, and X021 staying quiet when a session runs past midnight). Select-multiple internals (X022 "None" with other options, X023 others-specify text without a selected option). Field-level validation, including `MISSING_REQUIRED` being **disabled**. **Rule robustness** — a rule that throws degrades to a deterministic warning instead of crashing. Hepatitis_B (G1 option D). Select-multiple parents written as answers (codes + labels, bare codes, labels only, unmapped tokens). Tele-consultation reason handling. Free-text reason fields surviving missing-token normalisation. `referenceDate` picking the latest `SubmissionDate` deterministically. |
| 3 | `tests/engine/coercers.test.ts` | **25** | Cell coercion. `coerceBoolean` (standard yes/no encodings; ambiguous values rejected). `coerceInteger` (separator trimming, float truncation so a later pass can flag it, non-integers rejected, blank → `null`). `coerceNumber` (localised decimals, garbage rejected, **blank never becomes 0**). `coerceDate` (ISO stability in UTC, Excel serial dates, human-readable text, day-first NHM convention, month-first when unambiguous, invalid dates rejected). `coerceTime` (`hh:mm`, seconds-since-midnight, out-of-range, `Date` cells). `coerceDateTime` (calendar day alongside the clock, clock-only cells pinned to a common day, full Excel serial, no-clock rejection). `coerceText` (trim and nullify). |
| 4 | `tests/two-row-odk-export.test.ts` | **18** | The two-row-header ODK/CSV shape (`sample-data/DATA_EX_SHAPE.csv`). The code row is read as a header, not as data; columns are keyed by code so repeated labels stay distinct; one-hot group children stay booleans; a nested `C10_1` group does not leak into `C10`; the calendar day survives a 12-hour session time; PNC attendance is read from `H3A_1` while `H3A` stays a yes/no; the 0/1/2 counselling scale is preserved; duplicate `SubmissionDate` columns are detected (exact copies silent, differing copies reported); repeated single-header labels are reported rather than silently dropped; the ANM `99` sentinel is read as zero and never reaches a total; a coded answer's `Na` is missing while a typed `NA` in a free-text box is content; the Scan & Share column is mapped; no false clinical/sequence/teleconsult violations are raised; option `D` reads as the declared Hepatitis_B vaccine; a genuinely unmapped group option is surfaced. |
| 5 | `tests/indicators.test.ts` | **12** | `evaluateIndicator` and `suggestCharts`. Numeric columns are summed; **booleans are counted as "Yes"** rather than treated as missing; a fully answered boolean column is not reported as 100 % missing; group options are counted from exploded columns; sessions group by day for time-series; numeric-distribution reports distribution samples. **Aggregability rules** — a boolean, date, time, text, choice or group field is never summed; PNC attendance counts via the `H3A_1` count rather than the `H3A` flag; every boolean `valueField` reads as a count of Yes. `suggestCharts` recommends a line chart for time-series, matches cardinality rules for categorical data, and recommends a histogram for distributions. |
| 6 | `tests/violation-identity.test.ts` | **11** | Violation identity. One row can raise the same code on several fields — two `INVALID_ORDINAL` findings on `H33`/`H34` are keyed apart; three sentinel findings on `ANM2`/`ANM3`/`ANM4` are keyed apart; several findings on the same field are separated; the same field reporting the same code twice stays unique; the key is derived from row + code + field + raw value and is **independent of order**. **Info-severity findings reach every counter** (severity counters, the total, the category counts, the cleaning insights). Parse and validate agree on a declared sentinel; a zero-meaning sentinel reads as `0` so no aggregate can see the magic number; `rowId`+`code` collisions are still keyed uniquely. |
| 7 | `tests/schema/headerNormalizer.test.ts` | **11** | The header resolution ladder (`buildHeaderMap`). Exact codes; exact labels; codes embedded in longer headers; number-prefixed labels; en-dash / em-dash separators; case- and whitespace-insensitivity; genuinely unknown headers left untouched; arbitrary letter-digit strings not mis-mapped; the ANM U-WIN question read as `C7`; **the `H13` false-match guard** — stray Hindi titles must not be attached to the numeric-labelled `H13`, and `H13` is still read from its own Hindi and English titles. |
| 8 | `tests/derive.test.ts` | **9** | `deriveCleanRows`, `cleanRowsToCsv`, `unresolvedErrors`. CSV quoting of labels containing commas, code suffixes in the header, booleans rendered as 1/0, empty string for no rows. Derivation applies drops, keeps pending, merges overrides; only rows carrying an unresolved error count as pending; an override is re-read through the schema rather than stored as raw text; values are left untouched when the schema cannot be resolved. `unresolvedErrors` ignores warnings and resolves acknowledged/dropped/overridden rows; `__all` acknowledges every error on a row. |
| 9 | `tests/transposed-import.test.ts` | **8** | Transposed (sideways) exports. Fields running down the side are detected; an ordinary export is left alone; a tall sheet is required before anything is flipped; rows and columns are swapped back; a repeated label row is read as headers, not as the first record; an ordinary single-header row stays at `dataStart` 1; a sideways workbook is read end to end; an ordinary sheet is not touched. |
| 10 | `tests/schema/columns.test.ts` | **7** | Column registry integrity. The registry contains **253** physical columns from the survey spec; `Hepatitis_B` is declared as `G1_D`; there are no duplicate codes; label lookup falls back to the code. Schema integrity: the `vhsnd` dataset is exposed under the current version; every cross-field rule has a unique id and a stable code; **the schema JSON is canonically stable and the hash is deterministic**. |
| 11 | `tests/insights.test.ts` | **7** | Insight counters. A blank column is separated from a column the file lacks; the accounting still adds up for a snapshot with no persisted column list; a column the schema does not know stays out of the schema totals. Pending rows count rows with unresolved errors, not untouched rows; the count reaches zero once the error is acknowledged or the row is dropped; the tile stays at zero while an error is still open on a warning-only row; the counts match the report tile the Visualise page reads. |
| 12 | `tests/header-mapping.test.ts` | **5** | Manual header mapping. Titles the schema cannot place are listed so the import screen can ask what they are; the list is empty when every title matches; a title stops being listed once the user has pointed it at a field; a title-keyed match is applied beside the form's own code row; a match survives a workbook read without touching the other columns. |
| 13 | `tests/odk-import.test.ts` | **4** | `sample-data/DATASET_1.xlsx` end to end: a meaningful number of columns is recognised from question-label headers; at least one indicator returns non-empty chart points; the review and report helpers do not crash on partially-mapped rows; pending rows count the rows that still carry an error. |
| 14 | `tests/ingest-copy.test.ts` | **4** | The `collapsedNotice` wording helper — the warning takes responsibility when our own resolution merged the columns, points at the export when the file repeats a code it owns, covers both when the warning lists both kinds, and stays silent when there is nothing to explain. |
| 15 | `tests/three-row-header.test.ts` | **4** | Three-row-header exports (numbered labels, labels again, then the codes). The code row below the two label rows is found; it is read as a header, not as the first record; repeated titles stay separate because the codes keep them apart; a plain two-row export is still read the way it always was. |
| 16 | `tests/dataset-1-odk.test.ts` | **3** | The same `DATASET_1.xlsx` fixture under a different threshold: representative ODK label headers map to their canonical codes; clean rows are derived and produce non-empty chart points. |
| 17 | `tests/sample-data.test.ts` | **3** | `sample-data/vhsnd-sample.xlsx` end to end: the sample export parses with the official header codes; the full spec spread is recognised; the deliberately broken demo rows are flagged. Also asserts the sample workbook stays in sync with the column registry (`tests/sample-data.test.ts:36-41`, with a small `notInSample` exemption set). |
| 18 | `tests/schema/rules.test.ts` | **3** | Golden rule classification: `X001`–`X011` numeric chains exist and are classified; group-coherence rules are generated only where they can actually fire; **no unreachable group rules are kept**. |
| 19 | `tests/docx-template.test.ts` | **2** | The embedded DOCX template: a generic template ships in the bundle; the renderer produces a non-empty `.docx` from it (unzipped with JSZip). |
| | **Total** | **212** | **19 files** |

### 2.1 How the numbers were obtained

`it`/`test` declarations were counted directly from the source of each file (19 files, `tests/**`), summing to **212**. This is a static count of test declarations — it does not assert that all 212 currently pass, because `node_modules/` was not installed in this checkout at the time of writing. The last recorded run, in `PROJECT_CONTEXT.md` §15.1, reports **19/19 files and 212/212 tests passing** (verified 2026-10-03).

---

## 3. Test conventions

The suite follows two patterns consistently; new tests should follow them too.

### 3.1 Golden + silent pairs

Almost every rule and coercion test asserts **two** things: that the bad case is flagged, **and** that the good case is silent. The canonical example is `tests/engine/validate.test.ts:17-38`:

```ts
describe("cross-field rules: numeric chains", () => {
  it("X001 flags high-BP identified > measured", () => { … });
  it("X001 is silent when the chain is consistent", () => { … });
  …
});
```

A test that only asserts the failure case passes even when the rule fires on everything.

### 3.2 Counts are asserted, not assumed

The suite pins hard numbers so a silent scope change cannot slip through: the 253-column registry (`tests/schema/columns.test.ts:6-8`), the 21 comparisons across 6 categories (`tests/comparisons.test.ts:359-361`), rule-id uniqueness and code shape (`tests/schema/columns.test.ts:36-44`), and the hard-coded schema version (`tests/indicators.test.ts:72`).

**When you add a rule, indicator, comparison or column, update these in the same commit** — see [`12-development-guide.md`](12-development-guide.md) §3.1.

### 3.3 Fixtures are real files

`sample-data/` is checked into the repository and asserted against. The tests import them from disk (`readFileSync` + `resolve`), so the suite exercises the real SheetJS path rather than a hand-built stub.

### 3.4 No browser APIs without a stub

Because `environment: "node"` (`vitest.config.ts:6`), any test that needs `window`, `document`, `indexedDB` or `Worker` must provide its own stub. The current suite needs none — it only exercises pure functions. That is a design constraint, not an accident: the workers were written as pure payload functions (`src/workers/parseWorker.ts` exports `parsePayload`; `src/workers/validateWorker.ts` exports `validatePayload`) specifically so the pipeline could be tested this way.

---

## 4. The quality gates

Five gates. `npm run ci` (`package.json:18`) runs gates 1–4; **the offline gate is not part of `ci`** — it is separate, and `npm run build:all` (`package.json:17`) is the only script that chains build → offline gate → embed templates.

| # | Gate | npm script | Direct `node` (works with an `&` in the path) | Passes when |
| ---: | --- | --- | --- | --- |
| 1 | **Types** | `npm run typecheck` → `tsc --noEmit` (`package.json:11`) | `node .\node_modules\typescript\bin\tsc --noEmit` | Zero errors. `strict: true` + `noEmit: true` (`tsconfig.json:11-12`). |
| 2 | **Lint** | `npm run lint` → `eslint` (`package.json:10`) | `node .\node_modules\eslint\bin\eslint.js .` | Zero warnings and errors. ESLint 9 flat config (`eslint.config.mjs:1-26`). |
| 3 | **Tests** | `npm run test` → `vitest run` (`package.json:12`) | `node .\node_modules\vitest\vitest.mjs run` | 19 files / 212 tests pass. |
| 4 | **Build** | `npm run build` → `next build` (`package.json:8`) | `node .\node_modules\next\dist\bin\next build` | A static export is written to `out/` with 6 routes (`next.config.ts:4`, `:6`). |
| 5 | **Offline** | `npm run build:check-offline` → `node scripts/check-offline.mjs` (`package.json:16`) | `node .\scripts\check-offline.mjs` | `OK - no remote references in static export.` (`scripts/check-offline.mjs:35`). |

### 4.1 Gate 5 in detail

`scripts/check-offline.mjs` is the release-blocking guarantee that the artefact cannot phone home:

- It walks `out/` (`scripts/check-offline.mjs:46-55`) and scans every `.js` and `.html` file (`:23`).
- It flags `fetch` / `WebSocket` / `EventSource` / `XMLHttpRequest` calls whose target is an `http(s)://` URL (`:18`) and any remote `src=` / `href=` (`:19`).
- It skips the `out/dev` scratch directory (`:51`), because dev-only chunks are never part of the export and link to dev-only tooling.
- It fails the build with `Refusing to ship.` (`:31-34`).

### 4.2 Gate 4 has a side effect you must know about

`next build` **deletes `out/`**, including `out/dev/` where `next dev` keeps its manifests. **Restart the dev server after any build.** See [`12-development-guide.md`](12-development-guide.md) §7.1.

### 4.3 The `&`-in-path caveat

In a checkout path containing `&` — as this repository's own folder does — `npm run lint`, `npm test`, `npm run typecheck` and `npm run build` may fail to resolve their `.bin` shims. Use the `node …` column above. Full explanation: [`11-installation-and-setup.md`](11-installation-and-setup.md) §4.2.

---

## 5. What is **not** tested

This is the honest inventory. **There is no browser or e2e harness** — no Playwright, no jsdom, no React Testing Library, no happy-dom, no Cypress — so everything that needs a DOM is untested.

| Area | Modules | Test coverage | Why it is untested |
| --- | --- | --- | --- |
| **UI components** | all 7 files in `src/components/` — `AppShell.tsx`, `ChartCanvas.tsx`, `ColorPicker.tsx`, `DatasetPicker.tsx`, `InsightPanel.tsx`, `RowDrawer.tsx`, `SummaryCard.tsx` | **None.** Zero imports of `@/components/*` across all 19 test files. | They need a DOM. `ChartCanvas.tsx` in particular contains hand-drawn SVG for four chart kinds — the kind of fallthrough bug a render test would catch. |
| **Pages / routes** | all 5 in `src/app/` — `page.tsx`, `ingest/`, `review/`, `viz/`, `report/` | **None.** Zero imports of `@/app/*`. | No DOM, no router, no `window.confirm` (used by the erase path, `src/app/report/page.tsx:130`). |
| **Worker wiring** | `src/lib/workers.ts`, `src/lib/workerScope.ts` | **None.** Zero imports of `workers.ts` or `workerScope`. | Only the **pure payload functions** are exercised — `parsePayload` and `validatePayload` are imported directly by the tests. The `Worker` construction, the message protocol, the 120 s timeout and the inline fallback (`src/lib/workers.ts:60-116`, `:136-184`) are never run. |
| **Storage layer** | `src/lib/storage/idb.ts` | **None.** Zero imports of `storage/idb`. | Requires IndexedDB, which the `node` environment does not provide. Encryption round-trips, store versioning, the `onupgradeneeded` self-heal (`src/lib/storage/idb.ts:34-39`) and the wipe semantics are all unexercised. |
| **Crypto** | `src/lib/crypto.ts` | **None.** Zero imports of `crypto`. | Depends on the storage layer above it (the key lives in IndexedDB). The `v1.<iv>.<cipher>` envelope format and the key-management behaviour are untested. |
| **Stores** | all 4 in `src/stores/` — `chartStore.ts`, `datasetStore.ts`, `resolutionStore.ts`, `workflowStore.ts` | **None.** Zero imports of `@/stores/*`. | Zustand's `persist` middleware needs the async encrypted storage adapter (`src/lib/storage/idb.ts:239-252`), which needs IndexedDB. Persistence and hydration semantics are untested. |
| **Export writers** | `src/export/pptxReporter.ts`, `src/export/csv.ts`, `src/export/reportContext.ts` | **Almost none.** Only the DOCX writer has a smoke test (2 tests, `tests/docx-template.test.ts`). `cleanRowsToCsv` is tested in isolation (`tests/derive.test.ts:10-33`). `buildReportContext` is called but only as a setup step. | `generatePptxReport` is imported by **no test at all**. `pptxgenjs` and the DOM-dependent `downloadBlob` (`src/export/csv.ts:32-41`) are not covered. |
| **Manifest determinism** | `src/export/reportContext.ts:111-117` | **None.** | The SHA-256 manifest path — the audit-critical hash — has no test asserting that the same input always produces the same manifest, or that the hash changes when the data changes. |
| **Offline gate itself** | `scripts/check-offline.mjs` | **None.** | It is a build script, not part of the Vitest `include` pattern. |
| **Column generator** | `scripts/gen-columns.mjs` | **None.** | Same reason. Its output *is* indirectly pinned by `tests/schema/columns.test.ts`. |

### 5.1 The structural reason

The suite is a pure-Node unit suite by design. That design choice has two consequences:

1. **It is fast and deterministic** — no browser, no network, no flakiness. The whole suite runs in seconds.
2. **It cannot catch anything that only happens in a browser** — rendering, the worker protocol, IndexedDB, the crypto round-trip, and the shape of the exported files.

The mitigation the codebase *does* have is the offline build gate (gate 5), which is a build-time rather than a test-time check that the artefact contains no remote references.

### 5.2 Where a browser harness would pay for itself

If a harness is ever added, the highest-value targets, in order:

1. `src/export/pptxReporter.ts` — a smoke test that `generatePptxReport` produces a non-empty, openable `.pptx` (the DOCX already has one).
2. `src/lib/storage/idb.ts` + `src/lib/crypto.ts` — a `fake-indexeddb` round-trip asserting the `v1.` envelope and that the wipe removes both databases.
3. `src/components/ChartCanvas.tsx` — a render test for the four hand-drawn SVG kinds.
4. `src/export/reportContext.ts` — a determinism test: same input → same manifest; changed input → different manifest.

---

## 6. Coverage and CI — stated plainly

> **There is no coverage configuration.**
>
> `vitest.config.ts` has no `coverage` block at all — no provider, no `reporter`, no `include`/`exclude`, and **no `thresholds`**. There is no `coverage` script in `package.json`, and no `@vitest/coverage-*` package in `devDependencies` (`package.json:34-43`). Running `vitest run --coverage` has no configured provider to use.
>
> `.gitignore:14` ignores `/coverage`, but that is inherited from the create-next-app template — it is **not** evidence that a coverage tool is used.
>
> **Consequence:** nothing in this repository prevents a change from reducing test coverage. There is no ratchet, no floor, and no report artifact.

> **There is no CI.**
>
> A file-existence check for every common CI descriptor returns *absent* for all of them: `.github/`, `.gitlab-ci.yml`, `.circleci/`, `azure-pipelines.yml`, `Jenkinsfile`, `.travis.yml`. There are also no Husky hooks (`.husky/`) and no lint-staged configuration.
>
> The `ci` npm script (`package.json:18`) is a **local convenience chain**, not a pipeline:
> ```
> npm run typecheck && npm run lint && npm run test && npm run build
> ```
> It runs the first four gates and nothing else — no offline gate, no coverage, no build artefact upload.
>
> **Consequence:** the gates are only enforced by human discipline. Nothing runs them automatically on push or on a merge request.

---

## 7. How to add a test

### 7.1 The shape

1. **Pick the file.** `tests/<thing>.test.ts` at the top level, or `tests/engine/` for engine concerns and `tests/schema/` for schema concerns — the existing structure mirrors `src/`. The discovery pattern is `tests/**/*.test.ts` (`vitest.config.ts:7`), so any depth works.
2. **Import explicitly.** Never rely on globals — `globals` is not enabled:
   ```ts
   import { describe, expect, it } from "vitest";
   import { validateRows } from "@/schema/engine/validate";
   import type { NormalizedRow } from "@/contracts/dataset";
   ```
3. **Use the `@` alias** for application imports (`vitest.config.ts:10-14`).
4. **Follow the golden + silent pattern** — assert the failure *and* the non-failure (§3.1).
5. **Assert counts when you change counts** (§3.2).
6. **Use real fixtures** where one exists in `sample-data/`; construct small inline `NormalizedRow` objects when you do not.

A minimal, complete example:

```ts
import { describe, expect, it } from "vitest";
import { getDatasetSchema, SCHEMA_VERSION } from "@/schema";
import { validateRows } from "@/schema/engine/validate";
import type { NormalizedRow } from "@/contracts/dataset";

function row(values: Record<string, string | number | boolean | null>): NormalizedRow {
  return { id: "r1", sourceRow: 0, values };
}

describe("my new rule X026", () => {
  const schema = getDatasetSchema(SCHEMA_VERSION, "vhsnd");

  it("flags identified > sampled", () => {
    const violations = validateRows([row({ H1HB: 5, H1HB1: 9 })], schema);
    expect(violations.some((v) => v.ruleId === "X026")).toBe(true);
  });

  it("is silent when the chain is consistent", () => {
    const violations = validateRows([row({ H1HB: 9, H1HB1: 5 })], schema);
    expect(violations.some((v) => v.ruleId === "X026")).toBe(false);
  });
});
```

### 7.2 If you add a rule, indicator, comparison or column

The new test is the easy part. **The existing count assertions will fail**, and they are supposed to:

| You added | The assertions to update |
| --- | --- |
| A **cross-field rule** | `tests/schema/rules.test.ts:6-20` (code classification set), `:44-52` (group-rule counts) |
| A **cell-level check** | `tests/engine/validate.test.ts` — add a golden + silent pair |
| An **indicator** | `tests/indicators.test.ts` — add an `evaluateIndicator` case, plus a `suggestCharts` case if the shape is new |
| A **comparison** | `tests/comparisons.test.ts:359-361` (`toHaveLength(21)` → 22) and a new `describe` block |
| A **column** | `tests/schema/columns.test.ts:6-8` (253 → 254) and `tests/sample-data.test.ts:36-41` (the workbook must contain the new code) |
| A **schema version** | `tests/indicators.test.ts:72` (hard-codes `"2026.1"`) |

The recipes: [`DATA-MODEL.md` Part C](DATA-MODEL.md#part-c--extension-recipes).

### 7.3 If you need a browser API

`environment: "node"` (`vitest.config.ts:6`) means `window`, `document`, `indexedDB` and `Worker` are undefined. Options, in increasing order of effort:

1. **Don't** — restructure the logic into a pure function and test that, the way `src/workers/parseWorker.ts` exports `parsePayload` separately from the worker wiring.
2. **Stub it locally** in the test file (a hand-rolled `globalThis.indexedDB = …` double).
3. **Add a dependency** (`fake-indexeddb`, `jsdom` or `happy-dom`) and switch or add a Vitest environment — this changes `vitest.config.ts` and is a real architectural decision, because the pure-Node design is what makes the suite fast and the workers testable.

---

## 8. Summary

| Question | Answer |
| --- | --- |
| Runner | Vitest 5 (`package.json:42`), `environment: "node"`, `include: tests/**/*.test.ts` |
| Size | **19 files / 212 tests** |
| Scope | The data model — schema, coercion, rules, indicators, comparisons, import shapes, derivation, insights — is thoroughly covered. |
| Not covered | UI components, pages, worker wiring, storage, crypto, stores, the PPTX writer, manifest determinism. |
| Why | **No browser or e2e harness exists.** The suite is a pure-Node unit suite by design. |
| Coverage configuration | **None.** No provider, no reporter, no thresholds, no coverage script, no coverage package. |
| Coverage threshold | **None.** Nothing prevents coverage from regressing. |
| CI | **None.** No `.github/`, no pipeline file, no hooks. `npm run ci` is a local chain of gates 1–4 only. |
| Gates | 5 (types, lint, tests, build, offline) — exact commands in §4. |
