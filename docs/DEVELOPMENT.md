# Development guide

How to work on this repository: environment, gates, test conventions, scripts, and the traps it sets.

- **[Environment](#environment)** — what you need, and the `&` problem
- **[The five gates](#the-five-gates)** — what must pass before you commit
- **[Running the app](#running-the-app)**
- **[Test conventions](#test-conventions)**
- **[Where to change what](#where-to-change-what)**
- **[Generated files](#generated-files)**
- **[Scripts](#scripts)**
- **[Adding things](#adding-things)** — charts, templates, tests, pages
- **[Troubleshooting](#troubleshooting)**
- **[Known broken and partial tooling](#known-broken-and-partial-tooling)**

Data structures, schema rules, indicators and comparisons are documented separately in [`DATA-MODEL.md`](DATA-MODEL.md). The full codemap, with every claim cited as `file:line`, is [`PIPELINE.md`](PIPELINE.md).

---

## Environment

| | |
| --- | --- |
| Runtime | Node 20+ (developed on Node 26) |
| Package manager | npm (`package-lock.json` is committed; 353 top-level packages) |
| Framework | Next.js 16.3.6, App Router, static export |
| Language | TypeScript 5.9, `strict`, `noEmit` |
| Tests | Vitest 5, `environment: "node"` |
| Lint | ESLint 9 flat config |

```bash
npm install
```

No `.env` file is needed. The app has no server, no database and no API keys — everything that would normally be a backend runs in the browser.

### The `&` in the path

If the checkout path contains an ampersand — this project's own folder is named `PIPELINE-FOR-VHSND&PMSMA` — then `cmd` splits the path when npm writes its `.bin` shims, and every command that resolves a local binary fails:

```
npx tsc --version
# 'PMSMA\node_modules\.bin\' is not recognized as an internal or external command.
# Cannot find module 'C:\Users\...\Downloads\typescript\bin\tsc'
```

This affects `npx <pkg>`, `npm run lint`, `npm test`, `npm run typecheck` and `npm run build`.

**Workarounds**

1. Clone to a path without `&` (preferred — fixes everything at once).
2. Or call the entry points through `node` directly:

```bash
node .\node_modules\typescript\lib\tsc.js --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\vitest\vitest.mjs run
node .\node_modules\next\dist\bin\next build
node scripts\check-offline.mjs
```

Scripts that already shell out to `node scripts/*.mjs` (for example `npm run build:check-offline`) work in both cases.

---

## The five gates

All five must be green before committing. `npm run ci` runs gates 1–4.

| # | Gate | npm | Direct `node` (works with `&`) | Passes when |
| --- | --- | --- | --- | --- |
| 1 | Types | `npm run typecheck` | `node .\node_modules\typescript\lib\tsc.js --noEmit` | zero errors |
| 2 | Lint | `npm run lint` | `node .\node_modules\eslint\bin\eslint.js .` | zero warnings/errors |
| 3 | Tests | `npm run test` | `node .\node_modules\vitest\vitest.mjs run` | 19 files / 212 tests pass |
| 4 | Build | `npm run build` | `node .\node_modules\next\dist\bin\next build` | static export written to `out/`, 6 routes |
| 5 | Offline | `npm run build:check-offline` | `node scripts/check-offline.mjs` | `no remote references in static export` |

Gate 4 **wipes `out/`**, including `out/dev` where the dev server keeps its manifests. Restart `next dev` after any build.

Vitest's reporter is fixed in `vitest.config.ts` (`reporters: ["default"]`); do not pass `--reporter=basic` — Vitest 5 rejects it.

---

## Running the app

```bash
node .\node_modules\next\dist\bin\next dev     # or: npm run dev
```

Open <http://localhost:3000> — **use trailing slashes** (`/viz/`, not `/viz`), because the build sets `trailingSlash: true`.

Quick smoke test: drop `sample-data/vhsnd-sample.xlsx` on the Ingest screen. It has 160 rows with nine planted contradictions (rows 4, 6, 8, 10, 12, 14, 16, 18, 20 — see `scripts/make-sample-data.cjs:114-123`), so Review, Visualise and Report all have something to do.

To try a real export, `sample-data/DATASET_1.xlsx` and `sample-data/DATA_EX_SHAPE.csv` are committed fixtures; their measured results are recorded in [`PIPELINE.md` §5.3](PIPELINE.md).

---

## Test conventions

- Location: `tests/**\/*.test.ts` (also `tests/engine/` and `tests/schema/`). Vitest runs them in the **node** environment, so browser APIs are not available unless you stub them; Node's global `crypto` is.
- **Golden + silent pairs.** Almost every rule and coercion test asserts two things: it *flags* the bad case, and it is *silent* on the good case. Pattern at `tests/engine/validate.test.ts:17-38`.
- **Counts are asserted, not assumed.** `tests/schema/columns.test.ts` pins the registry size, rule-id uniqueness and code shape; `tests/comparisons.test.ts:360` pins the comparison count; `tests/indicators.test.ts` pins indicator behaviour.
- **Fixtures are real files.** `sample-data/` is checked in and asserted against (`tests/sample-data.test.ts` requires every registry code to appear in the sample workbook, minus a small exemption list).
- Line numbers drift; when a test fails after a refactor, fix the test's expectations rather than the assertion style.

Current inventory (see [`PIPELINE.md` §5.2](PIPELINE.md) for the per-file breakdown): **19 files, 212 tests.**

---

## Where to change what

| I want to change… | Start here | Full recipe |
| --- | --- | --- |
| A column in the official form | `data/vhsnd-columns.csv` | [`DATA-MODEL.md` §7a](DATA-MODEL.md) |
| A field's type, range or options | `src/schema/versions/v2026-1.ts` | [`DATA-MODEL.md` §7b](DATA-MODEL.md) |
| A validation rule | `src/schema/versions/v2026-1.ts` (cross-field) or `src/schema/engine/validate.ts` (cell-level) | [`DATA-MODEL.md` §7c](DATA-MODEL.md) |
| A headline indicator | `src/schema/indicators.ts` | [`DATA-MODEL.md` §7d](DATA-MODEL.md) |
| A comparison chart | `src/lib/comparisons.ts` | [`DATA-MODEL.md` §7e](DATA-MODEL.md) |
| A new schema version | `src/schema/versions/` + `src/schema/index.ts` | [`DATA-MODEL.md` §7f](DATA-MODEL.md) |
| Recognising a column title from an export | `src/schema/engine/headerNormalizer.ts` | [Adding things](#adding-things) |
| A chart type | `src/contracts/chart.ts` + `src/components/ChartCanvas.tsx` | [Adding things](#adding-things) |
| The Word letter | `templates/default/` + `npm run embed:templates` | [Adding things](#adding-things) |
| A screen or route | `src/app/<route>/page.tsx` | [Adding things](#adding-things) |
| Wording shown in the UI | `src/app/ingest/page.tsx`, `src/lib/ingestCopy.ts` | — |

---

## Generated files

Never edit these by hand — regenerate them, and commit both the source and the output.

| File | Produced by | Trigger |
| --- | --- | --- |
| `src/schema/columns-vhsnd.ts` | `node scripts/gen-columns.mjs` | after editing `data/vhsnd-columns.csv` (no npm script — run it manually) |
| `src/export/templates.generated.ts` | `node scripts/embed-templates.mjs` | `npm run embed:templates` |
| `templates/default/vhsnd-letter.docx` | `node scripts/make-default-templates.mjs` | `npm run embed:templates` |
| `AGENTS.md` rules block | `next dev` / `next build` | automatic — commit it, do not delete it |
| `next-env.d.ts`, `tsconfig.tsbuildinfo` | TypeScript/Next | automatic, gitignored where relevant |

The CSV is ordered **`label,code`** (label first, no header row, quote labels that contain commas). The generated file is sorted by code, so its order does not match the CSV.

---

## Scripts

All in `scripts/`, run with plain `node`.

| File | Purpose |
| --- | --- |
| `check-offline.mjs` | Gate 5 — scans `out/**/*.js,html` for absolute `https?://` URLs and remote `src`/`href`; skips the `out/dev` scratch directory |
| `gen-columns.mjs` | `data/vhsnd-columns.csv` → `src/schema/columns-vhsnd.ts` |
| `make-default-templates.mjs` | Builds a minimal valid DOCX with `{{…}}` placeholders using JSZip |
| `embed-templates.mjs` | Scans `templates/*/` for `.docx`/`.pptx`, base64s them into `src/export/templates.generated.ts` |
| `make-sample-data.cjs` | Regenerates `sample-data/vhsnd-sample.xlsx` — 160 rows, seeded PRNG, nine planted contradictions (**currently broken**, see below) |
| `make-shape-sample.mjs` | Builds the two-row-header fixture `sample-data/DATA_EX_SHAPE.csv` from a real export, pseudonymising names |
| `diagnose-workbook.cjs` / `.mjs` | Prints sheets, header rows and critical-column presence for one workbook |
| `debug-raw.cjs` | Dumps the first four raw array-of-arrays rows per sheet — use this when header detection misbehaves |

Diagnostics are the first thing to reach for when an import goes wrong:

```bash
node scripts/debug-raw.cjs path\to\export.xlsx
node scripts/diagnose-workbook.mjs path\to\export.xlsx
```

---

## Adding things

### A header title that is not being recognised

The resolver is `resolve(header)` at `src/schema/engine/headerNormalizer.ts:418-433`, which tries, in order:

1. **The merged alias map** (`aliasToCanonical`, built at `:380-403`) keyed by `normalizeKey` (trim, lowercase, collapse whitespace, unify dashes) — this single map holds every registry code, every registry label, and every `HINDI_ALIASES` entry.
2. **A code token inside the title** — a regex scan for a known column code (`:406-414`).
3. The same map again after stripping a leading list number (`1. `, `2) ` …) (`:420-424`).
4. **Word-set fuzzy** — `fuzzyLabelMatch` (`:343-371`) over `fuzzyKey` words (lowercased, punctuation collapsed, letters/marks/numbers kept): needs at least 3 header words, at least 2 shared with a label, either containment or a Dice score ≥ 0.6, and must not be a tie between two candidates.
5. **Near-word fuzzy** — `nearWordMatch` (`:304-341`) stems both sides (removing `HINDI_STOPWORDS`, `:258-283`), requires the same script, a shared stem of at least 2 characters, no digits, and a best score of at least 4.
6. Otherwise the title is returned unchanged — it appears in the **"N column titles could not be matched"** card.

Add an entry to `HINDI_ALIASES` (`headerNormalizer.ts:34-216`, case-insensitive keys) for a known title; add the code to `CODE_TOKEN` (`headerNormalizer.ts:406-407`) only if the code itself will not match the generic token regex (lowercase or digit-free codes such as `New`, `starttime`, `remarks`).

The Ingest screen also offers a **manual** fix: unmatched titles get a `<select>` over all 253 columns, and the mapping is saved per file name under `hdr:<fileName>` so the next import of the same file arrives already mapped.

### A chart type

1. Add the kind to the `ChartKind` union in `src/contracts/chart.ts:1-19` — 18 kinds exist today.
2. Add its human label to `KIND_LABEL` in `src/schema/indicators.ts:284-303`.
3. Render it in `src/components/ChartCanvas.tsx`. Four kinds are hand-drawn SVG (`box`, `gauge`, `waffle`, `heatmap`, dispatch at `ChartCanvas.tsx:42`); the other 14 are recharts. Reuse the shared tooltip (`ChartCanvas.tsx:68-121`) so hover text stays consistent.
4. Return the kind from an indicator suggestion (`suggestCharts`, `indicators.ts:306-345`) or a comparison's `mkResult(...)`.

### The Word letter

1. Edit `templates/default/vhsnd-letter.docx` (or drop any `.docx` into `templates/<dir>/`).
2. Available placeholders: `{{dataset.name}}`, `{{summary.*}}`, `{{FOR chart IN charts}}`, `{{IMAGE chartImage($chart.blobKey)}}`, `{{manifest}}` — see `scripts/make-default-templates.mjs:33-66`.
3. Run `npm run embed:templates`. This is mandatory: the Report page reads `src/export/templates.generated.ts`, and shows **"DOCX (template pending)"** when the registry is empty.

The PPTX deck needs no template — `src/export/pptxReporter.ts` builds five slide types directly.

### A screen

Create `src/app/<route>/page.tsx` with `"use client"` at the top (the root layout is the only server component). If the screen needs the active dataset, copy the pattern used by `review`, `viz` and `report`: read `activeDatasetId`, render `DatasetPicker` when it is `null`, otherwise load the snapshot and charts. Add the route to the nav in `src/components/AppShell.tsx`.

Remember `output: "export"` — no API routes, no server actions, no middleware, no `headers()`. The CSP is an HTML `<meta>` tag for exactly that reason.

### A test

Add `tests/<thing>.test.ts`, import from `@/…`, and follow the golden + silent pattern. If you add a rule, indicator or comparison, the count assertions in `tests/schema/columns.test.ts`, `tests/indicators.test.ts` and `tests/comparisons.test.ts` must be updated in the same commit.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `'…\node_modules\.bin\' is not recognized` | `&` in the checkout path | call binaries with `node` (see [Environment](#the--in-the-path)) |
| Dev server hangs or 404s after a build | `next build` deleted `out/dev` | restart `next dev` |
| `AGENTS.md` shows up dirty after running anything | `next dev`/`next build` rewrite the block | commit it |
| Import says "N column titles could not be matched" | titles not in the alias ladder | use the manual `<select>` mapping, or add `HINDI_ALIASES` |
| Import says "columns could not be told apart" | duplicate titles collapsed | rename in the source, or accept the collapse — it is reported, not guessed |
| Chart shows "Columns not in this file" | the export is partial | that is correct behaviour; `columnsMissing` is surfaced on purpose |
| DOCX button says "template pending" | empty template registry | `npm run embed:templates` |
| Offline gate fails after adding a link | a remote URL in built output | host the asset locally, or inline it |
| Tests pass locally, fail in CI | stale `out/` or `tsbuildinfo` | rebuild, and make sure CI runs all five gates |

## Known broken and partial tooling

- **`npm run make:sample` fails on modern Node.** `scripts/make-sample-data.cjs` contains ESM `import` statements inside a `.cjs` file, so `node --check` throws `Cannot use import statement outside a module`. The committed `sample-data/vhsnd-sample.xlsx` is up to date, so this is not blocking; fix by converting the file to `require` calls (which is what `eslint.config.mjs:9-10` already assumes `.cjs` files use).
- **`scripts/make-shape-sample.mjs` defaults to another machine's path** (`C:/Users/DADITYA/Downloads/DATA_EX.csv`) — always pass an explicit input file.
- **`npm start` does nothing useful.** With `output: "export"` there is no server; serve the `out/` folder from a static web root instead. Built pages reference root-absolute `/_next/…` assets, so opening `out/index.html` over `file://` will not work.
- **`zod` is declared but unused** — no `from "zod"` anywhere in `src/`, `tests/` or `scripts/`.

See [`PIPELINE.md` §6](PIPELINE.md) for the product-level limitations (disabled rules, partial-export silence, PMSMA not implemented).
