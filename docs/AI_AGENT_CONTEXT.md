# AI Agent Context — VHSND & PMSMA Pipeline

Practical context for a future AI coding agent working in this repository. Read this before
editing. Source of truth for facts: `PROJECT_CONTEXT.md`; this file summarises and points.

## 1. Project purpose

Offline-first, browser-only data-cleaning and reporting pipeline for VHSND household-survey
sessions. A health official drops an ODK/Excel export (`.xlsx/.xls/.ods/.csv`) into the browser;
the app normalises it against the 253-column VHSND survey schema, flags contradictions, lets a
human adjudicate each flagged row with a written justification, charts the result, and exports a
signed-off report (PPTX, DOCX, cleaned CSV, audit JSON). Nothing is uploaded: static export
(`next.config.ts:4`), every page is a client component, all data lives in IndexedDB encrypted at
rest, CSP + build gate enforce no egress (`src/app/layout.tsx:10-25`, `scripts/check-offline.mjs:18-34`).

Despite the product name, only the `vhsnd` dataset kind exists; `pmsma` is a type only
(`src/schema/index.ts:5`, `src/contracts/dataset.ts:13`). No backend, no auth, no multi-user.

## 2. Architecture

Layered, client-only static app. Import direction:

```
routes (src/app) -> state (src/stores) -> domain (src/schema, src/lib) -> contracts (src/contracts)
                                      -> persistence (src/lib/storage, src/lib/crypto)
```

- All 5 pages carry `"use client"`; `src/app/layout.tsx` injects metadata + CSP.
- `src/components/AppShell.tsx` renders the 4-step nav (`/ingest /review /viz /report`) and blocks
  rendering until the encrypted workflow store hydrates (`:19-32`).
- Heavy work (parse, validate) runs in Web Workers via `src/lib/workers.ts` (module Worker, 120 s
  timeout, inline fallback); both worker and fallback call the same pure payload functions.
- State: 4 Zustand stores (`workflowStore` persisted/encrypted, `datasetStore`, `resolutionStore`,
  `chartStore`). `activeDatasetId` is the single pointer driving downstream routes.

See `PROJECT_CONTEXT.md` §4 and `docs/PIPELINE.md` §2.

## 3. Tech stack

Next.js 16.3.6 (App Router, Turbopack), React 19.2.8, TypeScript ^5 (`strict`, `noEmit`), static
export (`output:"export"`, `distDir:"out"`, `trailingSlash`), React Compiler on. Zustand ^5.0.15,
recharts ^3.10.1, SheetJS `xlsx` 0.20.3 from vendored tarball `vendor/xlsx-0.20.3.tgz`,
pptxgenjs ^4.0.1, docx-templates ^4.15.0, html-to-image ^1.11.13, react-dropzone ^20.1.2,
idb-keyval ^6.3.0, Web Crypto (AES-GCM-256). Tests: Vitest ^5.0.1 (`environment:"node"`). Lint:
ESLint 9 flat config + `eslint-config-next`. `zod ^4.6.5` is declared but never imported (dead dep).

## 4. Entry points

- Routes: `src/app/page.tsx` (`/`), `src/app/ingest/page.tsx`, `src/app/review/page.tsx`,
  `src/app/viz/page.tsx`, `src/app/report/page.tsx`. Plus `src/app/layout.tsx`.
- Domain: `src/schema/index.ts` (schema resolution), `src/schema/engine/normalize.ts`,
  `src/schema/engine/headerNormalizer.ts`, `src/schema/engine/validate.ts`,
  `src/lib/derive.ts`, `src/lib/workers.ts`, `src/schema/indicators.ts`,
  `src/lib/comparisons.ts`, `src/export/reportContext.ts`.
- Persistence: `src/lib/storage/idb.ts`, `src/lib/crypto.ts`.
- Workers: `src/workers/parseWorker.ts`, `src/workers/validateWorker.ts`.

## 5. Critical directories

- `src/app/` — 5 client routes.
- `src/components/` — 7 shared UI files.
- `src/contracts/` — shared types + pure helpers (the internal "API").
- `src/lib/` — comparisons, crypto, derive, ingestCopy, insights, workerScope, workers, storage/idb.
- `src/schema/` — columns-vhsnd (generated), dsl, index, indicators, engine/*, versions/v2026-1.
- `src/stores/` — 4 Zustand stores.
- `src/export/` — csv, docxReporter, pptxReporter, reportContext, templates.generated (generated).
- `src/workers/` — parse/validate payloads.
- `tests/` — 19 files / 212 tests.
- `scripts/` — 9 Node maintenance scripts; plus `data/`, `sample-data/`, `templates/default/`, `vendor/`.

## 6. Module relationships

- `src/contracts/` is the shared vocabulary both domain and UI speak; do not let UI import domain
  internals bypassing contracts.
- `src/lib/workers.ts` is the single entry point for heavy work; it probes worker support, transfers
  the ArrayBuffer, times out at 120 s, and falls back to a dynamic `import()` on the main thread.
  In Node it throws `WorkerUnavailableError`.
- `src/schema/index.ts` resolves the schema by `datasetKind` + version; `SCHEMAS` is a version map,
  and datasets record `schemaVersion` + `schemaHash`.
- Stores write through to IndexedDB; `datasetStore` holds the loaded snapshot + validation cache.
- Export reads `buildReportContext` (`src/export/reportContext.ts`) which canonicalises and hashes.

## 7. Database overview

Two IndexedDB databases (`src/lib/storage/idb.ts`, `src/lib/crypto.ts`):

- `vhsnd-pipeline` v2 — stores: `ds` (DatasetSnapshot, key `snapshot.id`), `res`
  (Record<rowId, RowResolution>, key `datasetId`), `chart` (StoredChartMeta), `blob` (PNG bytes,
  key `` `${datasetId}/${chartId}.png` ``), `validation` (ValidationCache), `ui` (header overrides
  `hdr:<fileName>` + Zustand workflow persistence). All encrypted.
- `pipeline-crypto` — idb-keyval store holding one raw 256-bit AES-GCM key under `app-key-v1`.

Encryption: AES-GCM-256, fresh 12-byte IV per operation; strings `v1.<b64 IV>.<b64 cipher>`; bytes
`[IV(12) || ciphertext]`; key memoised in memory; no recovery. Wipe (`eraseAllLocalData`, `idb.ts:260-273`)
deletes every DB whose name starts with `vhsnd-pipeline` or `pipeline-crypto`.

## 8. API conventions (TS module boundary, not HTTP)

There is no HTTP API. The de-facto API is TypeScript module exports. Key "endpoints":

- `src/schema/index.ts` — `SCHEMA_VERSION`, `SUPPORTED_DATASET_KINDS`, `getSchema`,
  `getDatasetSchema`, `canonicalSchemaJson`, `computeSchemaHash`.
- `src/schema/engine/normalize.ts` — `detectTransposed`, `transposeAoa`, `detectHeaderLayout`,
  `applyHeaderOverrides`, `normalizeAoa`, `buildFieldCoercer`.
- `src/schema/engine/headerNormalizer.ts` — `buildHeaderMap` → `.normalize(text)`.
- `src/schema/engine/validate.ts` — `validateRows(rows, schema, options)` → `{violations, counts, byRow}`.
- `src/lib/derive.ts` — `deriveCleanRows`, `unresolvedErrors`.
- `src/lib/workers.ts` — `runParse(task, onProgress)`, `runValidate(task, onProgress)`.
- `src/schema/indicators.ts` — `VHSND_INDICATORS`, `evaluateIndicator`, `suggestCharts`.
- `src/lib/comparisons.ts` — `COMPARISONS`, `COMPARISON_CATEGORIES`, `inFile`, `hasValues`.
- `src/export/reportContext.ts` — `buildReportContext`, `sha256Hex`.
- `src/export/pptxReporter.ts` — `generatePptxReport(ctx, chartBlobs)` → `Blob`.
- `src/export/docxReporter.ts` — `renderDocxReport(templateBytes, ctx, chartImages)` → `Blob`.
- `src/export/csv.ts` — `cleanRowsToCsv`, `downloadBlob`.
- `src/lib/storage/idb.ts` — save/load/list/delete for datasets, resolutions, charts, blobs,
  validation, header overrides, plus `eraseAllLocalData`.
- `src/lib/crypto.ts` — `encryptString`, `decryptString`, `encryptBytes`, `decryptBytes`.

Path alias `@/*` → `./src/*` (tsconfig + vitest). Strict mode, `noEmit`. Named exports; JSDoc on
exported APIs allowed.

## 9. Coding standards

- TypeScript `strict: true`, `noEmit: true`, `moduleResolution: "bundler"`, target ES2017.
- No `any` anywhere in the codebase. Trust-boundary casts use `as unknown as` (crypto, workers,
  workerScope, docxReporter, reportContext) — these are the points where the type system stops.
- ESLint flat config: `eslint-config-next/core-web-vitals` + `/typescript`; `*.cjs` disables
  `@typescript-eslint/no-require-imports`.
- Comments only when code cannot explain itself; JSDoc on exported APIs allowed.
- Citations in docs as `path.tsx:NN`.
- Generated files never hand-edited: `src/schema/columns-vhsnd.ts`, `src/export/templates.generated.ts`,
  `AGENTS.md`, `next-env.d.ts`.
- Verification before commit: all five gates (§13).

## 10. Naming conventions

- Components: PascalCase files (`AppShell.tsx`, `ChartCanvas.tsx`).
- Modules/libraries: camelCase files (`headerNormalizer.ts`, `cellCoercers.ts`).
- Tests: `*.test.ts` under `tests/`.
- Field/column codes: short uppercase tokens (`B8`, `H1HB`, `G1_D`, `*_SP`).
- Violation/rule codes: uppercase snake (`INVALID_BOOLEAN`, `X022-C10`, `RULE_EVALUATION_ERROR`).
- Constants: `SCREAMING_SNAKE` (`SCHEMA_VERSION`, `SUPPORTED_DATASET_KINDS`, `DB_VERSION`).
- Stores: `*Store.ts`; contracts: lowercase domain nouns.

## 11. Error-handling patterns

- **Rule throw → `RULE_EVALUATION_ERROR`**: `validate.ts:72-82` catches any throwing rule and reports
  it as a violation instead of crashing a row/import.
- **derive.ts fallback**: `buildFieldCoercer` is wrapped in try/catch (`derive.ts:32-36`); on failure
  it falls back to a `null` coercer, so override values are written through *without* coercion.
  Documented in the comment above it.
- **Blank cells never raise** (`validate.ts:119-123`); only unreadable/non-blank values raise
  `INVALID_*`.
- **referenceDate null disables date rules**: if `SubmissionDate` is absent, `referenceDate` is `null`
  and all date-window rules silently do not apply (`validate.ts:32-39`) — root of partial-export silence.
- **Group coherence skipped when child column absent** (`validate.ts:412-425`, gated on
  `presentColumns`).
- Workers: 120 s timeout then abort; unsupported environments fall back to inline execution.
- Override values are re-coerced through the schema on save (`RowDrawer.tsx:113-116`).

## 12. Auth (none — single-user local)

No login, session, role or permission model. Single-user local app by design. Threat model is
*data at rest on a shared machine*: AES-GCM at rest protects against someone opening the same
browser profile later or copying the data folder, but not against someone logged in as you while
using the app. Key is origin-bound in IndexedDB; no passphrase, no recovery, no rotation
(`src/lib/crypto.ts:59-82`). CSP `connect-src 'self' data: blob:` enforces no egress.

## 13. Testing procedures and commands

Vitest ^5.0.1, `environment: "node"`, pattern `tests/**/*.test.ts`, `@` → `./src`. 19 files /
212 tests, all passing (~6.3 s). No coverage provider/threshold, no e2e/browser harness (no
Playwright/jsdom/RTL); workers are pure functions precisely so they are testable in Node.

Commands:
- `node .\node_modules\vitest\vitest.mjs run` (or `npm run test`)
- `node .\node_modules\vitest\vitest.mjs` (watch)

Five gates (run in order): types (`tsc --noEmit`), lint (`eslint .`), tests, build, offline
(`node scripts/check-offline.mjs`). `npm run ci` chains the first four only (not offline).

## 14. Build/execution commands (Windows gotcha)

Because the repo path contains `&`, npm's `.bin` shims break under `cmd`. Call binaries directly
through `node`:

```
node .\node_modules\typescript\lib\tsc.js --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\vitest\vitest.mjs run
node .\node_modules\next\dist\bin\next build
node .\scripts\check-offline.mjs
```

npm scripts: `dev`, `build`, `start` (limited use for export mode), `lint`, `typecheck`, `test`,
`test:watch`, `embed:templates`, `make:sample` (currently broken), `build:check-offline`,
`build:all`, `ci`. Note `next build` deletes `out/dev`, breaking a running `next dev` until
restart; `next dev`/`build` rewrite the `AGENTS.md` rules block (commit it). Vitest 5 rejects
`--reporter=basic`. `file://` is not supported for `out/`.

## 15. Important business rules

- **Header resolution ladder** (`headerNormalizer.ts:419-437`): exact code/label → embedded code
  token → numbering-stripped label → fuzzy Dice (≥3 header words, ≥2 shared, ≥0.6, ties rejected)
  → `nearWordMatch` (score ≥4, with `\p{M}`-aware guards).
- **presentColumns** (`derive.ts:54-58`): distinguishes "file lacks column" from "column present but
  blank"; `comparisons.ts:44-48` (`inFile`) is canonical consumer.
- **Partial-export silence**: absent inputs disable the rule set (`referenceDate` null) and
  comparisons report `columnsMissing`; UI does not escalate.
- **Boolean indicators**: `coerceNumber(true)` is `null`; booleans counted via `coerceBoolean`,
  value = Yes answers, `missingRate = 1 - answered/total` (`indicators.ts:236-270`).
- **Frozen chart images**: PNGs captured at "Add to report" time; re-editing does not update saved
  decks (`report/page.tsx:92-118`).
- **Re-import strands decisions**: new import mints a new dataset id (`datasetStore.ts:42`).
- **MISSING_REQUIRED disabled**: `required: true` on `B8` (`v2026-1.ts:178`) has no producer.
- **pmsma absent**: type only.
- **Collapsed columns**: repeated titles merge; `cause` is `sheet-code` only when every column in
  the group read its code from the file, else `resolved-title` (`normalize.ts:508-535`).
- **Unmatched titles**: mapping card over all 253 columns; choice saved by file name
  (`ingest/page.tsx:324-379`).
- **Transposed detection**: ≥30 rows, ≥2:1 ratio, two signals; manual override
  (`normalize.ts:322-344`).
- **Multi-row header scan**: rows 1–3 scanned for code row (≥90% known codes) (`normalize.ts:355-408`).
- **Keep/drop/override**: drop/override require written justification (`RowDrawer.tsx:62`); override
  re-coerced on save.
- **Pending** rows still flow into charts/reports (`derive.ts:50,63`).
- **Unresolved errors block viz and report** (`review/page.tsx:146-153`, `report/page.tsx:180-191`).
- **Partial comparison gate**: not drawn until opt-in (`viz/page.tsx:335-366`).
- **CSV**: header `label (code)`, booleans `1`/`0`, CRLF (`csv.ts:17-30`).
- **Audit log** sorted by `decidedAt` (`review/page.tsx:304-332`, `reportContext.ts:65-74`).
- **Manifest**: SHA-256 over canonical JSON of context + rows hash (`reportContext.ts:111-118`).

## 16. Known limitations

- `pmsma` is a type, not a feature (`schema/index.ts:5`); `MISSING_REQUIRED` never fires;
  re-import strands decisions.
- `npm run make:sample` broken (ESM in `.cjs`); hard-coded path in `make-shape-sample.mjs`.
- `anc-pnc-bias` declares `grouped-bar` with a single `seriesKeys` entry → falls through to a
  single-series bar, discarding `extra.groups` (`comparisons.ts:452-459`, `ChartCanvas.tsx:256`).
- Comparison #21 filed under category index 1, so optgroup lists 4,5,6,7,21
  (`comparisons.ts:1059`); comparison mode feeds stub `dateSpanDays: 0` / `numericShape: "flat"`
  (`comparisons.ts:239-257`).
- `zod` declared but unused; partial-export silence (see §15); column collapse merges values.
- No key recovery/backup/passphrase; no service worker; chart images frozen at capture time.
- DOCX depends on embedded template; workers best-effort; error context discarded in
  `derive.ts:32-36`; `as unknown as` casts at trust boundaries.
- No CI, coverage, formatter, editorconfig, e2e/browser tests; a11y debt (`DatasetPicker.tsx:49-56`);
  perf debt (`idb.ts:99-117`, no virtualisation).

## 17. Common pitfalls

- `&` in repo path breaks npm shims — call `node` directly (§14); `next build` deletes `out/dev`.
- `next dev`/`build` rewrite `AGENTS.md` — commit, don't delete; Vitest 5 rejects `--reporter=basic`.
- `make:sample` broken; `file://` not supported for `out/`; `crypto.subtle` needs secure context.
- Partial file can report "0 errors" — check column coverage; read `presentColumns` for absent vs blank.
- Boolean fields are not numbers (`coerceNumber(true)` is `null`); `nearWordMatch` guards load-bearing.
- Collapsed columns still merge values; override values re-coerced (bad coercer passes through).
- `keep` with `__all` acknowledges every error code; pending rows still flow into charts/reports.
- Chart images frozen at add-time; comparison #21 in category index 1; grouped-bar needs
  `seriesKeys.length > 1`.

## 18. Files requiring extra care

- `src/schema/engine/headerNormalizer.ts` — H13 false-match guard; changing the ladder can mis-map
  every stray title.
- `src/schema/engine/normalize.ts` — orientation, header layout, collapse logic; central to import.
- `src/lib/comparisons.ts` — largest file (~1100 lines); 21 comparisons, stubs, category
  misnumbering, `anc-pnc-bias` fallthrough.
- `src/lib/crypto.ts` — key management; no recovery; changing envelope breaks existing data.
- `src/lib/storage/idb.ts` — DB versioning and wipe; stale-DB self-heal on open.
- `src/schema/versions/v2026-1.ts` — 129 fields + 37 rules; schema hash recorded on datasets.
- `src/schema/columns-vhsnd.ts` — generated; edit `data/vhsnd-columns.csv` + run `gen-columns.mjs`.
- `src/export/templates.generated.ts` — generated; run `embed:templates`.
- `src/lib/derive.ts` — fallback that silently skips coercion.
- `src/schema/engine/validate.ts` — three-pass engine; keep the `RULE_EVALUATION_ERROR` catch.
- `src/lib/workers.ts` — worker/fallback parity; both must call the same pure payload.

## 19. Safe modification guidelines

- Run all five gates before committing; `npm run ci` covers four (add offline manually).
- Never hand-edit generated files; regenerate with the documented script.
- Update docs in the same commit as the code they describe.
- Add a regression test for any bug fix (this repo pins regressions deliberately).
- Preserve `presentColumns` semantics; read it rather than inferring absence from blank values.
- Do not relax header-normalizer guards or remove the `RULE_EVALUATION_ERROR` catch.
- Keep worker payload functions pure and directly testable in Node.
- Use the `@/*` alias; keep imports flowing in the documented direction.
- No `any`; if a cast is unavoidable, use `as unknown as` at a trust boundary and note it.
- Do not introduce server-only APIs, `fetch` to remote hosts, or env vars — static export only.
- Re-run `build:check-offline` after any change touching assets/URLs.
- Commit `AGENTS.md` changes produced by `next dev`/`build` rather than deleting them.
- For schema changes, remember `schemaHash` is recorded on every dataset; old datasets stay
  interpretable only if versioning is respected.