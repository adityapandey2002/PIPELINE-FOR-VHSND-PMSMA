# 03 — Project Structure

> **Scope of this document.** An accurate map of the repository: every directory, what it is for,
> which files are generated rather than authored, and the command that regenerates each one.
>
> **Evidence rule.** The tree below is a listing of the actual working tree. File and line counts
> were measured directly. Anything not establishable from the repository is written as
> **"Not verified from the current repository."**
>
> **Companion documents** — [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) §5 (the canonical folder
> map) · [`01-project-overview.md`](01-project-overview.md) (what the app does) ·
> [`02-technology-stack.md`](02-technology-stack.md) (every dependency and where it is used) ·
> [`PIPELINE.md`](PIPELINE.md) §7 (the full file-by-file inventory) ·
> [`DEVELOPMENT.md`](DEVELOPMENT.md) (how to change the app).

---

## 1. The tree

Excluded from the tree, by design: `node_modules/`, `.git/`, `.next/`, `out/`, `coverage/` and
`build/`. All six are gitignored build or dependency artefacts (`.gitignore:4`, `:14`, `:17-18`,
`:21`) and none of them is authored. `vendor/` **is** shown — see §4.

```
.
├── .gitignore                  ignore rules; forces !vendor/** to stay tracked (:43-48)
├── AGENTS.md                   Next.js agent-rules block; re-written by next dev / next build
├── CLAUDE.md                   one line: "@AGENTS.md"
├── eslint.config.mjs           ESLint 9 flat config — next/core-web-vitals + next/typescript
├── next-env.d.ts               Next.js-generated type shim (gitignored, :41)
├── next.config.ts              output:"export", trailingSlash, distDir:"out", reactCompiler
├── package-lock.json           committed lockfile
├── package.json                dependencies, scripts, image-size override
├── pdf-extracted.txt           extracted specification text the 253-column form was derived from
├── PROJECT_CONTEXT.md          single-file source of truth, 20 sections, every claim cited
├── README.md                   product overview (Part A) + technical deep dive (Part B)
├── tsconfig.json               strict TypeScript, "@/* → ./src/*"
├── tsconfig.tsbuildinfo        incremental build cache (gitignored via *.tsbuildinfo, :40)
├── vitest.config.ts            node environment, tests/**/*.test.ts, "@" alias
│
├── data/
│   └── vhsnd-columns.csv       SOURCE OF TRUTH: 253 "label,code" rows → src/schema/columns-vhsnd.ts
│
├── docs/
│   ├── 01-project-overview.md  what it does, for whom, scope reality, design principles
│   ├── 02-technology-stack.md  every technology, version, usage site, relationship
│   ├── 03-project-structure.md this file
│   ├── 08-api-documentation.md the de-facto TypeScript module API (no network API exists)
│   ├── 09-authentication-and-authorization.md
│   ├── 10-configuration-and-environment.md
│   ├── 11-installation-and-setup.md
│   ├── 12-development-guide.md
│   ├── 13-testing-and-quality.md
│   ├── AI_AGENT_CONTEXT.md     practical context for an AI coding agent
│   ├── DATA-MODEL.md           253-column registry, DSL, 37 rules, 21 indicators, 21 comparisons
│   ├── DEVELOPMENT.md          setup, the five gates, scripts, traps
│   ├── PIPELINE.md             line-cited codemap of the 8-stage pipeline + file inventory
│   ├── README.md               documentation index and topic map
│   └── diagrams/              4 Markdown diagram documents
│
├── public/
│   ├── file.svg                stock create-next-app asset (unused by the app)
│   ├── globe.svg               stock create-next-app asset
│   └── window.svg              stock create-next-app asset
│
├── sample-data/                committed fixtures — real and synthetic exports
│   ├── DATA_EX_SHAPE.csv       two-row ODK-style CSV twin (3 rows, 251 of 253 columns)
│   ├── DATASET_1.xlsx          real label-headed export (sheet 15 × 91 → 14 rows)
│   └── vhsnd-sample.xlsx       160-row synthetic workbook with deliberately broken rows
│
├── scripts/                    9 Node maintenance scripts (build-time only, never shipped)
│   ├── check-offline.mjs       offline build gate over out/**  — wired to build:check-offline
│   ├── embed-templates.mjs     emit src/export/templates.generated.ts  — wired to embed:templates
│   ├── make-default-templates.mjs  normalise templates/default/  — wired to embed:templates
│   ├── gen-columns.mjs         data/vhsnd-columns.csv → src/schema/columns-vhsnd.ts (manual)
│   ├── make-sample-data.cjs    build sample-data/vhsnd-sample.xlsx  — wired to make:sample (BROKEN)
│   ├── make-shape-sample.mjs   build sample-data/DATA_EX_SHAPE.csv (manual)
│   └── debug-raw.cjs · diagnose-workbook.cjs · diagnose-workbook.mjs   ad-hoc debugging (manual)
│
├── src/                        50 files / 10,521 lines  ← all application code
│   ├── app/                    App Router; every page is a client component  (8 files / 2,124)
│   │   ├── favicon.ico
│   │   ├── globals.css         design tokens (--warning, --warning-soft, --info, --info-soft; :14-17)
│   │   ├── layout.tsx          root layout, metadata, CSP <meta> tag (:10-25, injected :31)
│   │   ├── page.tsx            landing: stage cards, local dataset table, privacy note
│   │   ├── ingest/page.tsx     drop zone, orientation, header mapping, insights
│   │   ├── review/page.tsx     violation table, severity filters, RowDrawer, audit log
│   │   ├── viz/page.tsx        indicator/comparison charts, partial gate, PNG capture
│   │   └── report/page.tsx     PPTX/DOCX/CSV/JSON exports, manifest stats, data wipe
│   │
│   ├── components/             shared UI  (7 files / 1,180)
│   │   ├── AppShell.tsx        nav (:8-13) + hydration gate (:19-32)
│   │   ├── ChartCanvas.tsx     all 18 chart kinds, one shared tooltip, 4 custom SVG renderers
│   │   ├── ColorPicker.tsx     palette swatches, multi-select
│   │   ├── DatasetPicker.tsx   local dataset list + switcher
│   │   ├── InsightPanel.tsx    collapsible card wrapping SummaryCards
│   │   ├── RowDrawer.tsx       per-row decision form (justification required, :62)
│   │   └── SummaryCard.tsx     metric tile (value + tone)
│   │
│   ├── contracts/              shared types + pure helpers ← the internal "API"  (5 files / 296)
│   │   ├── chart.ts            ChartKind, ChartConfig, SavedChart, ChartSuggestion
│   │   ├── dataset.ts          CellValue, NormalizedRow, DatasetSnapshot, DatasetSummary
│   │   ├── indicator.ts        IndicatorDef, Aggregation, DataType, ComputedStats
│   │   ├── resolution.ts       RowResolution, ResolutionStatus, CleanRow, applyResolution
│   │   └── violation.ts        Violation, Severity, ViolationCategory, violationKey
│   │
│   ├── export/                 report writers  (5 files / 358)
│   │   ├── csv.ts              cleaned CSV writer + downloadBlob
│   │   ├── docxReporter.ts     docx-templates renderer + chart image helper
│   │   ├── pptxReporter.ts     pptxgenjs deck builder
│   │   ├── reportContext.ts    deterministic context + SHA-256 manifest (:111-118)
│   │   └── templates.generated.ts   GENERATED — embedded DOCX template bytes
│   │
│   ├── lib/                    cross-cutting domain services  (8 files / 1,948)
│   │   ├── comparisons.ts      21 comparisons across 6 categories (largest source file)
│   │   ├── crypto.ts           AES-GCM encrypt/decrypt + key management
│   │   ├── derive.ts           deriveCleanRows, unresolvedErrors
│   │   ├── ingestCopy.ts       user-facing wording for collapsed columns
│   │   ├── insights.ts         dataset / cleaning / viz insights
│   │   ├── storage/idb.ts      versioned IndexedDB wrapper, all read/write helpers, wipe
│   │   ├── workerScope.ts      typed globalThis shim for worker modules
│   │   └── workers.ts          runParse / runValidate + main-thread fallback
│   │
│   ├── schema/                 the survey form as code  (11 files / 4,270)
│   │   ├── columns-vhsnd.ts    GENERATED from data/vhsnd-columns.csv — do not hand-edit
│   │   ├── dsl.ts              field/rule DSL + canonical projection + stable stringify
│   │   ├── index.ts            SCHEMA_VERSION, SUPPORTED_DATASET_KINDS (:5), schema hash
│   │   ├── indicators.ts       21 indicator definitions, evaluation, chart suggestions
│   │   ├── engine/             the parsing + validation machinery  (6 files / 1,954)
│   │   │   ├── accessors.ts    value access helpers for predicates
│   │   │   ├── cellCoercers.ts boolean/int/number/date/time/serial/sentinel coercion
│   │   │   ├── groupChildren.ts select-multiple child resolution (nested roots explicit)
│   │   │   ├── headerNormalizer.ts  the header resolution ladder + fuzzy matching
│   │   │   ├── normalize.ts    AOA → ParsedSheet, orientation, header layout
│   │   │   └── validate.ts     validateRows — the three-pass contradiction engine
│   │   └── versions/v2026-1.ts the 2026.1 schema: 129 fields + 37 cross-field rules (675 lines)
│   │
│   ├── stores/                 Zustand  (4 files / 245)
│   │   ├── chartStore.ts       saved charts + PNG blob references
│   │   ├── datasetStore.ts     active snapshot + validation cache
│   │   ├── resolutionStore.ts  per-row decisions
│   │   └── workflowStore.ts    activeDatasetId + hydration flag (encrypted persist, :13-30)
│   │
│   └── workers/                off-thread entry points  (2 files / 146)
│       ├── parseWorker.ts      parsePayload (pure) + worker scope wiring
│       └── validateWorker.ts   validatePayload (pure) + worker scope wiring
│
├── templates/
│   └── default/vhsnd-letter.docx   the DOCX letter template (embedded at build time)
│
├── tests/                      19 files / 212 tests  (see §6)
│   ├── engine/                 coercers.test.ts · validate.test.ts
│   ├── schema/                 columns.test.ts · headerNormalizer.test.ts · rules.test.ts
│   └── (top level)             comparisons · dataset-1-odk · derive · docx-template
│                               header-mapping · indicators · ingest-copy · insights
│                               odk-import · sample-data · three-row-header
│                               transposed-import · two-row-odk-export · violation-identity
│                               (all *.test.ts)
│
└── vendor/
    └── xlsx-0.20.3.tgz        SheetJS 0.20.3, vendored — TRACKED IN GIT (see §4)
```

---

## 2. Directory roles

| Directory | Role | Key evidence |
|---|---|---|
| `src/app/` | **Routes.** The App Router layer. Five authored pages plus the root layout. Every page carries `"use client"`, so the app is effectively a single-page client application; `layout.tsx` exists for metadata and to inject the CSP | `src/app/layout.tsx:4-8`, `:10-25`; `PROJECT_CONTEXT.md` §8.1 |
| `src/components/` | **Shared UI.** Seven components used by more than one route. `ChartCanvas.tsx` is the single rendering surface for all 18 chart kinds — 14 via recharts, 4 hand-drawn SVG (`CUSTOM_KINDS`, `src/components/ChartCanvas.tsx:42`) | `src/components/ChartCanvas.tsx:5-32`, `:208-213` |
| `src/contracts/` | **The internal API.** Shared types and pure helpers that both the domain layer and the UI layer speak. This is what keeps a client-only app from collapsing into tangled components. It imports **no** third-party package | `src/contracts/dataset.ts:13`; `PROJECT_CONTEXT.md` §4.1, §7.2 |
| `src/export/` | **Report writers.** Turn the derived clean rows into four downloadable artefacts, and produce the deterministic `ReportContext` that the SHA-256 manifest covers | `src/export/reportContext.ts:35-42` (canonicalisation), `:111-118` (manifest) |
| `src/lib/` | **Cross-cutting domain services.** Comparisons, derivation, insights, crypto, IndexedDB access and the worker entry point. `src/lib/storage/` is a sub-directory because persistence is its own concern | `src/lib/storage/idb.ts:23-26`; `src/lib/workers.ts:47-186` |
| `src/schema/` | **The survey form as code.** The column registry, the field/rule DSL, the concrete `2026.1` version and the engine that parses and validates against them. It is the largest subtree (4,270 lines). `src/schema/engine/` holds the **six** files that do the actual work — orientation detection, header resolution, cell coercion, group-child resolution and the three-pass validation engine; `src/schema/versions/` holds one file per schema version, keyed by version string in the `SCHEMAS` map (only `v2026-1.ts` exists today) | `src/schema/index.ts:4-10`; `src/schema/engine/validate.ts:41-95` |
| `src/stores/` | **Zustand.** Four small stores: the active-dataset pointer, the loaded snapshot, per-row decisions and saved charts. `workflowStore` is the only one persisted, and it persists through an **encrypted** adapter | `src/stores/workflowStore.ts:13-30` |
| `src/workers/` | **Web Worker entry points.** Both files hold a pure payload function plus the worker scope wiring, so the same code can run in a worker, on the main thread, or under Vitest | `src/workers/parseWorker.ts:31`, `:51-53`; `src/lib/workers.ts:98-116` |
| `tests/` | **Unit suite only.** Pure Node, no DOM, no browser harness — which is precisely why the workers were written as pure functions | `vitest.config.ts:6`; `PROJECT_CONTEXT.md` §15.3 |
| `scripts/` | **Nine build/diagnostic scripts.** They run in Node, are never bundled, and are excluded from the ESLint default-ignore set only where they are CommonJS | `scripts/check-offline.mjs:18-34`; `eslint.config.mjs:8-15` |
| `data/` | **The column registry source.** `vhsnd-columns.csv` holds 253 `label,code` rows and is the file you edit to change the form | `scripts/gen-columns.mjs:9-10` |
| `sample-data/` | **Committed fixtures.** Real and synthetic exports used by the import tests and available for manual trials | `PROJECT_CONTEXT.md` §12.5 |
| `templates/default/` | The DOCX letter template, embedded into the bundle at build time so the app never fetches its own assets | `src/export/templates.generated.ts:1-3` |
| `public/` | Static assets. The three SVGs are stock create-next-app files; the app does not reference them | `PROJECT_CONTEXT.md` §14.6 |
| `docs/` | The documentation suite, indexed by `docs/README.md`; `diagrams/` holds four Markdown diagram documents | `docs/README.md:45-57` |
| `vendor/` | The vendored SheetJS tarball — see §4 | `package.json:30`; `.gitignore:43-48` |

---

## 3. `src/` by size

| Path | Files | Lines | Notes |
|---|---:|---:|---|
| `src/schema/` (incl. `engine/`, `versions/`) | 11 | 4,270 | Largest subtree; `columns-vhsnd.ts` (1,027) and `versions/v2026-1.ts` (675) are the two biggest files |
| `src/app/` | 8 | 2,124 | `viz/page.tsx` (473) and `ingest/page.tsx` (466) are the largest pages; `favicon.ico` is binary |
| `src/lib/` | 8 | 1,948 | `comparisons.ts` alone is 1,103 lines — the largest authored source file in the repository |
| `src/components/` | 7 | 1,180 | `ChartCanvas.tsx` (582) carries every chart kind |
| `src/export/` | 5 | 358 | |
| `src/contracts/` | 5 | 296 | The smallest layer, and the one with the most leverage |
| `src/stores/` | 4 | 245 | |
| `src/workers/` | 2 | 146 | |
| **Total** | **50** | **10,521** | Matches the figure in `README.md` ("50 files / 10,521 lines") |

The five largest files by line count are `src/lib/comparisons.ts` (1,103),
`src/schema/columns-vhsnd.ts` (1,027, **generated**), `src/schema/versions/v2026-1.ts` (675),
`src/schema/engine/normalize.ts` (599) and `src/components/ChartCanvas.tsx` (582).

---

## 4. `vendor/` — the one artefact that must stay tracked

`vendor/xlsx-0.20.3.tgz` is the SheetJS 0.20.3 distribution, installed through
`"xlsx": "file:vendor/xlsx-0.20.3.tgz"` (`package.json:30`).

**Why it is tracked rather than fetched from npm:**

| Reason | Detail |
|---|---|
| `npm install` would otherwise fail | The dependency specifier points at the local path; the tarball must exist in the checkout for the install to resolve |
| SheetJS is no longer published to public npm | The upstream project moved to its own distribution channel, so a registry install is not available for this version |
| Reproducible, offline-capable builds | The tarball is the artefact of record. Its provenance is **not** verifiable from `package-lock.json` alone — a supply-chain caveat worth stating plainly (`PROJECT_CONTEXT.md` §10.3) |

`.gitignore` deliberately guards this with explicit negations and a comment saying so:

```
# vendored dependencies — MUST stay tracked.
# package.json resolves "xlsx" as file:vendor/xlsx-0.20.3.tgz, so this tarball is
# required for `npm install`. Never blanket-ignore archives; the negation below
# fails loudly if someone adds a rule that would swallow it.
!vendor/
!vendor/**
```
(`.gitignore:43-48`)

No other binary or vendored artefact is tracked. `sample-data/*.xlsx` and
`templates/default/vhsnd-letter.docx` are committed **fixtures and assets**, not vendored code.

---

## 5. Generated files

**Never edit these by hand.** Each one is overwritten by its regeneration command.

| Generated file | Generated by | Command | Source of truth |
|---|---|---|---|
| `src/schema/columns-vhsnd.ts` | `scripts/gen-columns.mjs` | `node scripts/gen-columns.mjs` | `data/vhsnd-columns.csv` (253 rows) |
| `src/export/templates.generated.ts` | `scripts/embed-templates.mjs` | `npm run embed:templates` (runs `make-default-templates.mjs` first, then `embed-templates.mjs` — `package.json:14`) | `templates/default/vhsnd-letter.docx` |
| `sample-data/vhsnd-sample.xlsx` | `scripts/make-sample-data.cjs` | `npm run make:sample` — **currently broken**: the `.cjs` file uses ESM syntax (`PROJECT_CONTEXT.md` §16.2, defect **D1**) | `scripts/make-sample-data.cjs` |
| `sample-data/DATA_EX_SHAPE.csv` | `scripts/make-shape-sample.mjs` | `node scripts/make-shape-sample.mjs` — has a hard-coded absolute path, so it fails outside one machine's layout (`PROJECT_CONTEXT.md` §16.2, defect **D6**) | `scripts/make-shape-sample.mjs` |
| `AGENTS.md` | Next.js itself | `next dev` / `next build` rewrite the agent-rules block | `next` |
| `next-env.d.ts` | Next.js itself | `next dev` / `next build` | `next` |
| `out/**` | Next.js static export | `npm run build` | `next.config.ts:4-6` |
| `tsconfig.tsbuildinfo` | TypeScript incremental mode | `npm run typecheck` | `tsconfig.json:19` |

### 5.1 What the two active generators actually do

**`scripts/gen-columns.mjs`** reads `data/vhsnd-columns.csv`, parses each row honouring quoted
labels that contain commas (`:15-48`), skips rows with an empty code with a warning (`:53-56`),
de-duplicates by code keeping the first occurrence (`:57-59`), sorts by code with a numeric-aware
collation (`:63`), and writes `VHSND_COLUMNS`, `VHSND_COLUMN_MAP` and `columnLabel(code)` into
`src/schema/columns-vhsnd.ts` (`:65-79`). The emitted file carries the header
`// AUTO-GENERATED by scripts/gen-columns.mjs from data/vhsnd-columns.csv. / // Do not edit by hand.`
(`src/schema/columns-vhsnd.ts:1-3`).

**`npm run embed:templates`** is a two-step pipeline (`package.json:14`):
`scripts/make-default-templates.mjs` normalises the template in `templates/default/`, then
`scripts/embed-templates.mjs` emits `src/export/templates.generated.ts` — the DOCX bytes as base64
inside the bundle, so the app never performs a `fetch()` for its own assets
(`src/export/templates.generated.ts:1-3`). The generated module exposes `templates` and
`getTemplate(rel)` (`:5-15`); today it contains one entry, `default/vhsnd-letter.docx` (`:7-9`).

`npm run build:all` chains the shippable pipeline: `build` → `build:check-offline` →
`embed:templates` (`package.json:17`).

---

## 6. Tests

| Property | Value | Evidence |
|---|---|---|
| Test files | **19** | file listing of `tests/` (14 at the top level, 2 in `engine/`, 3 in `schema/`) |
| Test count | **212** | `PROJECT_CONTEXT.md` §15.1 (verified by re-running the suite on 2026-10-03) |
| Lines | 2,578 | measured |
| Runner | Vitest ^5.0.1, `environment: "node"` | `vitest.config.ts:6` |
| Pattern | `tests/**/*.test.ts` | `vitest.config.ts:7` |
| Alias | `@` → `./src` | `vitest.config.ts:10-14` |
| Coverage | **Not configured** — no provider, no threshold | `vitest.config.ts`; `PROJECT_CONTEXT.md` §15.1 |
| Browser / e2e harness | **None** — no Playwright, no jsdom, no React Testing Library | `PROJECT_CONTEXT.md` §15.3 |

**Not verified from the current repository:** the 212-test count could not be re-run while writing
this document, because `node_modules/` is not present in this working copy — the count is quoted
from `PROJECT_CONTEXT.md` §15.1, which records it as verified on 2026-10-03. The **file** count (19)
was confirmed by direct listing.

The heaviest test files are `tests/comparisons.test.ts` (40 tests),
`tests/engine/validate.test.ts` (36) and `tests/engine/coercers.test.ts` (25)
(`PROJECT_CONTEXT.md` §15.2). The suite is entirely unit-level: **no UI component, route, storage,
crypto, store, export-writer or manifest-determinism test exists** (`PROJECT_CONTEXT.md` §15.3).

---

## 7. Root configuration files

| File | Purpose | Notable settings |
|---|---|---|
| `package.json` | Dependencies, scripts, overrides | `overrides: { "image-size": "2.0.4" }` (`:44-46`); 12 scripts (`:6-19`) |
| `next.config.ts` | Framework configuration | `output: "export"`, `trailingSlash: true`, `distDir: "out"`, `images.unoptimized: true`, `reactCompiler: true` (`:3-11`) |
| `tsconfig.json` | TypeScript configuration | `strict: true`, `noEmit: true`, `target: ES2017`, `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `plugins: ["next"]`, alias `@/*` → `./src/*` (`:2-30`) |
| `vitest.config.ts` | Test runner configuration | `environment: "node"`, `include: ["tests/**/*.test.ts"]`, alias `@` → `./src` (`:4-15`) |
| `eslint.config.mjs` | Lint configuration | `eslint-config-next/core-web-vitals` + `/typescript`; one `**/*.cjs` override (`:8-15`); global ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts` (`:17-23`) |
| `.gitignore` | Ignore rules | `/node_modules`, `/.next/`, `/out/`, `/coverage`, `/build`, `.env*`, `.vercel`, `*.tsbuildinfo`, `next-env.d.ts`; `!vendor/**` (`:43-48`) |
| `package-lock.json` | Committed lockfile | Pins the transitive tree, including the vendored `xlsx` |
| `AGENTS.md` / `CLAUDE.md` | Agent-rules block, auto-rewritten by Next.js; `CLAUDE.md` is a one-line pointer (`@AGENTS.md`) | Read `AGENTS.md` before writing any Next.js code |
| `pdf-extracted.txt` | Extracted specification text | The origin of the 253-column form and the rule set; reference only, not read by the app |

**Not present in the repository** (verified by listing and by grep): no `.github/` or any other CI
configuration, no `.prettierrc*`, no `.editorconfig`, no `Dockerfile`, no `vercel.json`,
`netlify.toml` or `firebase.json`, no `LICENSE`, no `CHANGELOG`, no `CONTRIBUTING.md`, no
`CODEOWNERS`, and no screenshots or visual documentation. `PROJECT_CONTEXT.md` §16.6 and its
"Unavailable" table record each of these absences.

---

## 8. Quick metrics

| Metric | Value |
|---|---:|
| Source files in `src/` | 50 |
| Lines in `src/` | 10,521 |
| Test files / tests / lines | 19 / 212 / 2,578 |
| Maintenance scripts | 9 |
| Column-registry rows (`data/vhsnd-columns.csv`) | 253 |
| Tracked vendored binaries | 1 (`vendor/xlsx-0.20.3.tgz`) |
| Backend services | 0 |
