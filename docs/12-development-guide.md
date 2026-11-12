# 12 — Development Guide

**Scope:** how work is organised in this repository — its conventions, the schema DSL and how to extend it, the generated-file pipeline, the git workflow, the coding standards, and the traps.

Related reading: [`DATA-MODEL.md`](DATA-MODEL.md) (**the recipes** — field, rule, indicator, comparison, schema version), [`DEVELOPMENT.md`](DEVELOPMENT.md) (the short companion), [`PIPELINE.md`](PIPELINE.md) (the full codemap), [`13-testing-and-quality.md`](13-testing-and-quality.md) (the gates), [`10-configuration-and-environment.md`](10-configuration-and-environment.md) (config files), [`11-installation-and-setup.md`](11-installation-and-setup.md) (setup).

---

## 1. Repository conventions

### 1.1 Layout

```
src/
  app/          5 routes; layout.tsx is the ONLY server component
  components/   7 presentational components (all "use client")
  contracts/    pure TypeScript types — no runtime dependencies
  export/       the four writers: csv, docx, pptx, report context
  lib/          cross-cutting logic: crypto, storage, derive, insights, comparisons, workers
  schema/       the DSL, the column registry, the engine, the versions
  stores/       4 zustand stores
  workers/      the 2 worker entry points
tests/          19 files, 212 tests — mirrors the src/ concerns
scripts/        9 Node maintenance scripts (8 ESM, 1 CJS)
data/           vhsnd-columns.csv — the column registry source of truth
templates/      DOCX/PPTX letterheads to embed
sample-data/    three committed import fixtures
vendor/         xlsx-0.20.3.tgz — must stay tracked
```

### 1.2 Layering (and it is genuinely enforced by structure)

| Layer | Rule | Evidence |
| --- | --- | --- |
| `src/contracts/` | **Zero runtime imports.** Only `import type` between contracts. | The only import in the whole folder is `import type { CellValue } from "./dataset";` at `src/contracts/resolution.ts:1` |
| `src/schema/` | Imports only from within `src/schema/`. | `src/schema/indicators.ts` imports `@/schema/engine/cellCoercers`, `@/schema/engine/groupChildren`, `@/schema/columns-vhsnd`, `@/schema` — never `@/lib/*` |
| `src/lib/` | May import `@/contracts/*` and `@/schema/*`; may **not** import `@/components/*` or `@/app/*`. | `src/lib/storage/idb.ts:1-3` imports contracts + `@/lib/crypto` only |
| `src/stores/` | Imports `@/contracts/*` and `@/lib/storage/idb`. Never imports a component. | `src/stores/datasetStore.ts:1-13` |
| `src/components/`, `src/app/` | The only layers that touch the DOM, `window`, `Blob` and `Worker`. | `src/app/report/page.tsx:1` `"use client"` |

The practical consequence: **the schema engine, the indicators, the comparisons and the derivation logic are all pure and DOM-free**, which is exactly why the Vitest suite can run them in a `node` environment (`vitest.config.ts:6`). Do not break this by importing a browser API into `src/schema/`.

### 1.3 Naming

| Thing | Convention | Example |
| --- | --- | --- |
| Physical column codes | `UPPER_SNAKE`, from the official form | `H1HB`, `ANM2`, `G1_D` |
| Schema field ids | identical to the physical column code | `FieldDef.id` (`src/schema/dsl.ts:30`) |
| Cross-field rule ids | `X###`, with a deliberate permanent gap at `X016` | `X001` … `X023-*` |
| Violation codes | `UPPER_SNAKE`, **permanent once shipped** | `INVALID_ORDINAL`, `SENTINEL_NOT_APPLICABLE` |
| Indicator ids | kebab-case (one exception: `"uw in-registration"`) | `src/schema/indicators.ts` |
| Comparison ids | kebab-case | `src/lib/comparisons.ts` |
| Comparison labels | numbered `"1."` … `"21."`; note #21 sits in category 2, so **UI grouping ≠ numbering** | `src/lib/comparisons.ts` |
| Files | kebab-case | `headerNormalizer.ts`, `two-row-odk-export.test.ts` |
| Components | PascalCase `.tsx` | `ChartCanvas.tsx` |
| Stores | camelCase `*Store.ts` | `datasetStore.ts` |

### 1.4 Cross-file import style

Always use the **`@/` alias**, never a deep relative path:

```ts
import { SCHEMA_VERSION, computeSchemaHash } from "@/schema";       // src/stores/datasetStore.ts:5
import { decryptBytes, decryptString } from "@/lib/crypto";          // src/lib/storage/idb.ts:3
import type { RowResolution } from "@/contracts/resolution";        // src/lib/storage/idb.ts:2
```

The alias is declared once for TypeScript (`tsconfig.json:25-29`) and mirrored for Vitest (`vitest.config.ts:10-14`) — that mirroring is why tests import application modules unchanged.

Relative imports *within* the same folder are fine and are used, e.g. `src/schema/engine/accessors.ts` imports `"./cellCoercers"`.

### 1.5 Comments and documentation

This codebase explains **why**, not **what**. The existing style, which new code should match:

- A block comment at the top of a module stating the problem being solved (`src/lib/storage/idb.ts:5-13`, `src/lib/crypto.ts:9-17`, `src/schema/dsl.ts:67-71`).
- A comment on any non-obvious constant or invariant (`src/contracts/violation.ts:32-40` explains why `rowId` + `code` alone are not a unique key).
- A comment explaining a deliberate trade-off or a bug that must not be "fixed" (`src/schema/engine/groupChildren.ts:7-9`); every exported public function carries a JSDoc-style doc comment.

---

## 2. The schema DSL

The DSL is the mechanism by which the real-world survey form is expressed as code. It lives in **`src/schema/dsl.ts`** (231 lines).

### 2.1 The core types

| Type | Line | Purpose |
| --- | ---: | --- |
| `FieldType` | `src/schema/dsl.ts:4-16` | `"boolean" \| "integer" \| "number" \| "date" \| "time" \| "datetime" \| "text" \| "choice" \| "group" \| "ordinal"` |
| `GroupOption` | `src/schema/dsl.ts:18-22` | `{ code, label, kind? }` for select-multiple options |
| `FieldDef` | `src/schema/dsl.ts:29-60` | One logical field: type, required, value set, ordinal scale, sentinels, free-text flag, range, unit, date range, group options, default severity |
| `RuleContext` | `src/schema/dsl.ts:62-65` | `{ refDate }` — the deterministic reference day for "relative today" checks |
| `CrossFieldRuleDef` | `src/schema/dsl.ts:72-81` | `{ id, code, severity, category, description, appliesTo, violates, describe }` |
| `DatasetSchemaDef` | `src/schema/dsl.ts:83-89` | `{ sourceKind, fields, crossFieldRules, knownColumns }` |
| `SchemaDef` | `src/schema/dsl.ts:91-94` | `{ version, datasets }` |

### 2.2 The builder helpers

`src/schema/dsl.ts:102-169` provides the shorthands the schema version file actually uses: `group()` (`:102`), `rule()` (`:110`), `yesNo()` (`:115`), `ordinalField()` (`:123`), `countWithSentinel()` (`:143`), `count()` (`:159`), `date()` (`:163`), `text()` (`:167`).

### 2.3 The three rules that govern every extension

1. **Rules must be pure and deterministic.** `src/schema/dsl.ts:67-71`: *"Both predicates must be pure and deterministic (no `Date.now`, no randomness, no order dependence)."* A rule that throws degrades to a deterministic `RULE_EVALUATION_ERROR` warning rather than crashing (`src/schema/engine/validate.ts:72-82`) — so prefer `appliesTo` guards over try/catch.
2. **Eligibility is separated from failure.** `appliesTo` decides whether a rule applies; `violates` decides whether it fires. Never flag a row a rule does not apply to (`src/schema/dsl.ts:67-70`).
3. **Use the accessors, never raw values.** `src/schema/engine/accessors.ts:4-56` exports `n, num, b, d, t, dt, s, isDefined, groupSelected, groupAny, groupHasData, cmpDay, fmtDay`. Reading `row.values[…]` directly bypasses coercion and range handling.

### 2.4 Schema identity and hashing

`projectSchema` (`src/schema/dsl.ts:178-215`) projects a `SchemaDef` into normalised plain JSON with sorted keys, dropping function bodies but retaining rule identity via id/code/severity. `stableStringify` (`:217-219`) and `sortKeys` (`:221-230`) give the canonical form.

`src/schema/index.ts` then exposes:

- `SCHEMA_VERSION = "2026.1"` (`src/schema/index.ts:4`)
- `getSchema(version)` (`:12-18`) — throws on an unknown version
- `getDatasetSchema(version, kind)` (`:20-25`)
- `canonicalSchemaJson(version)` (`:28-30`)
- `computeSchemaHash(version)` (`:32-38`) — SHA-256 hex of the canonical JSON

> **Load-bearing invariant:** the **order of the `fields` array feeds the projection, therefore the canonical JSON, therefore the `schemaHash`** (`src/schema/dsl.ts:184-203`). Inserting a field in the middle changes the hash of every dataset created afterwards. Append, or accept the hash churn deliberately.

---

## 3. Extending the model

> **The full recipes live in [`DATA-MODEL.md` Part C](DATA-MODEL.md#part-c--extension-recipes).** This section is the map; the recipes there are the procedure, with exact file paths, code snippets and the tests to update.

| I want to add… | The recipe | Files it touches | The count assertion that breaks |
| --- | --- | --- | --- |
| **A physical column** | [`DATA-MODEL.md` §7a](DATA-MODEL.md#7a--add-a-column-to-the-253-column-registry) | `data/vhsnd-columns.csv` → (generated) `src/schema/columns-vhsnd.ts` | `tests/schema/columns.test.ts:6-8` pins the registry size at 253 |
| **A schema field** | [`DATA-MODEL.md` §7b](DATA-MODEL.md#7b--add-a-field-to-the-schema) | `src/schema/versions/v2026-1.ts` | `schemaHash` changes; `tests/schema/columns.test.ts:46-54` |
| **A validation rule** | [`DATA-MODEL.md` §7c](DATA-MODEL.md#7c--add-a-validation-rule) | `src/schema/versions/v2026-1.ts` (cross-field) or `src/schema/engine/validate.ts` (cell-level) | `tests/schema/rules.test.ts:6-20` (code classification) and `:44-52` (group-rule counts) |
| **An indicator** | [`DATA-MODEL.md` §7d](DATA-MODEL.md#7d--add-an-indicator) | `src/schema/indicators.ts` | `tests/indicators.test.ts` (behaviour) |
| **A comparison** | [`DATA-MODEL.md` §7e](DATA-MODEL.md#7e--add-a-comparison) | `src/lib/comparisons.ts` | `tests/comparisons.test.ts:359-361` pins `toHaveLength(21)` |
| **A schema version** | [`DATA-MODEL.md` §7f](DATA-MODEL.md#7f--add-a-schema-version) | `src/schema/versions/v2026-2.ts` + `src/schema/index.ts` | `tests/indicators.test.ts:72` hard-codes `"2026.1"` |

### 3.1 The non-negotiable part of every extension

**Update the count assertions in the same commit.** The suite pins hard numbers so that a silent scope change is impossible:

- `tests/schema/columns.test.ts:6-8` — 253 columns.
- `tests/comparisons.test.ts:359-361` — 21 comparisons across 6 categories.
- `tests/schema/rules.test.ts:44-52` — no unreachable group rules.
- `tests/sample-data.test.ts:36-41` — every registry code must appear in `sample-data/vhsnd-sample.xlsx`, minus a small exemption set.
- `tests/indicators.test.ts:72` — the schema version literal.

A change that adds a column without updating `tests/schema/columns.test.ts` will fail loudly. That is the point.

### 3.2 Adding a chart type (not in the DSL)

The full steps are in [`DEVELOPMENT.md`](DEVELOPMENT.md#a-chart-type): add the kind to the `ChartKind` union (`src/contracts/chart.ts`), add its label to `KIND_LABEL` (`src/schema/indicators.ts:284-303`), render it in `src/components/ChartCanvas.tsx`, and return it from `suggestCharts` (`src/schema/indicators.ts:306-345`). Four of the eighteen kinds are hand-drawn SVG; the rest are recharts. Reuse the shared tooltip so hover text stays consistent.

---

## 4. Regenerating the generated files

| Generated file | Command | npm script? | Commit the output? |
| --- | --- | --- | --- |
| `src/schema/columns-vhsnd.ts` | `node scripts/gen-columns.mjs` | **No** — run it manually | **Yes** |
| `src/export/templates.generated.ts` | `node scripts/embed-templates.mjs` | Yes — `npm run embed:templates` | **Yes** |
| `templates/default/vhsnd-letter.docx` | `node scripts/make-default-templates.mjs` | Yes — part of `npm run embed:templates` | **Yes** |
| `AGENTS.md` rules block | `next dev` / `next build` | automatic | **Yes** — see §5 |
| `next-env.d.ts`, `tsconfig.tsbuildinfo` | Next.js / `tsc` | automatic | **No** — gitignored (`.gitignore:41`, `:40`) |
| `out/**` | `next build` | automatic | **No** — gitignored (`.gitignore:18`) |

The rule is simple: **edit the source of truth, regenerate, commit both.** Never hand-edit a file whose first lines say `AUTO-GENERATED` (`src/schema/columns-vhsnd.ts:1-3`, `src/export/templates.generated.ts:1-3`).

### 4.1 The column CSV format

`data/vhsnd-columns.csv` is ordered **`label,code`** — label first, no header row, and labels containing commas must be quoted. The parser honours the quoting (`scripts/gen-columns.mjs:16-48`). The generated file is sorted **by code** (`scripts/gen-columns.mjs:63`), so its order does not match the CSV. Rows with an empty code are skipped with a warning (`scripts/gen-columns.mjs:53-56`).

---

## 5. `AGENTS.md` and the `nextjs-agent-rules` block

`AGENTS.md` is 9 lines and contains exactly one thing: a `nextjs-agent-rules` block between `<!-- BEGIN:nextjs-agent-rules -->` (`AGENTS.md:1`) and `<!-- END:nextjs-agent-rules -->` (`AGENTS.md:9`).

The block warns that this Next.js version has breaking changes and points contributors at `node_modules/next/dist/docs/`. Most importantly, `AGENTS.md:7` says:

> *"This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean."*

### 5.1 What this means in practice

- **Do not delete the block.** `next dev` will put it back, and your working tree will show an uncommitted change to `AGENTS.md` forever.
- **Do commit it** alongside your work. It is tracked in git; the block changing is a normal, expected diff.
- **Read the relevant guide under `node_modules/next/dist/docs/`** before writing code against a Next.js API whose behaviour you are unsure of. This is a breaking-changes version — `next@16.3.6` (`package.json:24`).

`CLAUDE.md` is a one-line pointer to the same file:

```
@AGENTS.md
```

— `CLAUDE.md:1`. Both tools therefore read identical instructions.

---

## 6. CODING STANDARDS

These are the rules this codebase already follows. New code is expected to follow them too.

### 6.1 TypeScript

1. **`strict: true` is on** (`tsconfig.json:11`) and there are no `any` escapes anywhere. A scan of all 48 `src/` TypeScript files for `: any`, `<any>` or `as any` returns **zero matches**.
2. **Never introduce `any`.** Use `unknown` and narrow it, or define a real type.
3. **`as unknown as X` is permitted only at a Web API boundary.** All nine occurrences in `src/` are exactly that:

   | Site | Boundary being bridged |
   | --- | --- |
   | `src/lib/crypto.ts:24`, `:37`, `:55` | `Uint8Array` → `BufferSource` for `crypto.subtle` |
   | `src/export/reportContext.ts:45` | `Uint8Array` → `BufferSource` for `crypto.subtle.digest` |
   | `src/export/docxReporter.ts:21`, `:47` | untyped `docx-templates` API |
   | `src/lib/workers.ts:54`, `:131` | `URL` → the `Worker` constructor's `string` overload |
   | `src/lib/workerScope.ts:8` | `globalThis` → the minimal `WorkerScope` interface |

   A cast anywhere else is a bug hiding behind a type error.
4. **Prefer the domain types over `unknown`.** `CellValue = string | number | boolean | null` (`src/contracts/dataset.ts:1`) covers every cell; `Violation.rawValue` is `unknown` *by design* (`src/contracts/violation.ts:24`) because it can be any offending value.
5. **`noEmit: true`** (`tsconfig.json:12`) — `tsc` is a checker, never a builder. Never add `tsc` output flags.
6. **Type-only imports** use `import type { … }` (`src/contracts/resolution.ts:1`, `src/stores/datasetStore.ts:2-5`) so `isolatedModules` (`tsconfig.json:17`) stays happy and runtime imports are not accidentally emitted.

### 6.2 Imports and paths

- Always `@/…` for cross-folder imports; relative only within a folder.
- **No deep relative paths** (`../../lib/…`) — they break the moment a file moves and they defeat the `@` alias.
- Keep `src/contracts/` free of runtime imports and `src/schema/` free of `@/lib` imports (§1.2).

### 6.3 Comments

Explain *why*, never *what*. The existing bar is high — see §1.5. A comment that restates the code is noise; delete it.

### 6.4 Dependencies

**Do not add a new runtime dependency without a demonstrated need.** The bundle is shipped to district machines over constrained networks, and the whole architecture is built around "no server, no network, everything on device".

Before adding one, check whether the platform already does it — spreadsheets (`xlsx`, vendored tarball, `package.json:30`), charts (`recharts`, `package.json:29`, plus hand-drawn SVG in `src/components/ChartCanvas.tsx`), PPTX (`pptxgenjs`, `:26`), DOCX (`docx-templates`, `:21`), key/value IndexedDB (`idb-keyval`, `:23`), state (`zustand`, `:32`), file drop (`react-dropzone`, `:28`), image capture (`html-to-image`, `:22`). `zod` is installed (`:31`) **but unused** — no `from "zod"` in `src/`, `tests/` or `scripts/` — so do not add the first usage casually.

Any new dependency must also survive the offline build gate (`scripts/check-offline.mjs`) — if it phones home, the build refuses to ship.

### 6.5 Determinism

Anything that feeds the report manifest must be deterministic: no `Date.now()` in rule logic, no randomness, no iteration-order dependence. The manifest hash is computed over a canonical, key-sorted projection (`src/export/reportContext.ts:35-42`, `:111-117`) — a change that makes the output non-deterministic breaks the provenance guarantee the product promises (`src/app/report/page.tsx:230-231`).

---

## 7. Common pitfalls

### 7.1 The dev server and the export share `out/`

`next.config.ts:6` sets `distDir: "out"`, and `next dev` keeps its manifests under `out/dev/`. `next build` **rebuilds `out/` from scratch and deletes `out/dev/`**.

Consequences:

- **Run `next build` and your running dev server is broken until you restart it.** Restart `next dev` after any build.
- A build run *while* `next dev` is up leaves that server in a broken state until it is restarted (`docs/DEVELOPMENT.md:78`, `PROJECT_CONTEXT.md` §13.5).
- `scripts/check-offline.mjs:51` explicitly skips the `out/dev` directory when scanning, because those dev-only chunks must not fail the shipping gate.

### 7.2 The rest of them

| Pitfall | What actually happens | Where |
| --- | --- | --- |
| **Hand-editing a generated file** | The edit is silently undone the next time anyone runs the generator, and it is invisible in the diff between source and output. Edit `data/vhsnd-columns.csv` or `templates/` and regenerate. | `src/schema/columns-vhsnd.ts:1-3`, `src/export/templates.generated.ts:1-3` |
| **Swapping the CSV column order** | `data/vhsnd-columns.csv` is **`label,code`**, not `code,label`. Swap them and every label silently becomes a code. | `scripts/gen-columns.mjs:16-48` |
| **`required: true` does nothing** | There is no `MISSING_REQUIRED` producer; blanks return early. Setting `required` on a field has **no effect** on validation today. | `src/schema/engine/validate.ts:119-123` |
| **`SCHEMA_VERSION` exists as three literals** | Change one, change all three. | `src/schema/index.ts:4`, `src/schema/versions/v2026-1.ts`, `tests/indicators.test.ts:72` |
| **Group roots are a hand-maintained list** | Forget `VHSND_GROUP_ROOTS` and `isDirectChildOf` lets a parent absorb a nested group's children — the exact `C10` / `C10_1` bug documented in that file's header comment. | `src/schema/engine/groupChildren.ts:7-9`, `:11-14` |
| **`presentColumns` is not "has values"** | A column present in the file but empty everywhere is **not** missing. Snapshots built by hand in tests omit the list and fall back to value probing, which produces false "column missing" results in every comparison. | `src/contracts/dataset.ts:39` |
| **The `&` in the checkout path** | `npm run lint`, `npm test`, `npm run typecheck` and `npm run build` may all fail to resolve their binaries; call `node` directly. | [`11` §4](11-installation-and-setup.md#4-run-in-development) |
| **`npm run make:sample` is broken** | `scripts/make-sample-data.cjs` contains ESM `import` statements inside a `.cjs` file, so Node throws `Cannot use import statement outside a module`. The committed fixture is current, so it is not blocking — but the script cannot regenerate it. | `scripts/make-sample-data.cjs`, `eslint.config.mjs:9-10` |
| **`npm start` does nothing useful** | `output: "export"` means there is no server build. Serve `out/` statically. | `next.config.ts:4` |

---

## 8. Git workflow and commit style

### 8.1 Observed commit style

The repository has **28 commits** on a single branch (`main`). The style is consistent and worth matching:

| Property | Observed |
| --- | --- |
| Subject case | **28 of 28 start lowercase.** |
| Trailing period | **0 of 28.** |
| Length | One line; subjects range from 3 words ("creating files") to 15 ("read the form's own code row wherever it sits, and stop blaming the export for our own merges"). |
| Mood | Predominantly **imperative** ("count Yes for boolean indicators…", "separate absent columns from blank ones…", "hardening ingest and review against real odk exports"). The three earliest commits are noun phrases ("creating files", "adding backend", "first commit"). |
| Conventional prefixes | Rare — exactly **1 of 28** uses one (`docs: recite line numbers, counts and HEAD after the indicator/tooltip fixes`). |
| Body | Used on most commits — 200 non-empty body lines across the history. Bodies explain **what the bug was, in measured numbers**, and often close with a verification line. |

Example (`dd9c0bf`, the most recent commit) — note the shape and the final verification paragraph:

```
document the pipeline, data model and full project context

Replace the stock create-next-app README with a dual-audience guide, add a
contributor guide and a schema reference, and add a root PROJECT_CONTEXT.md that
records the architecture, business logic, storage design, known defects and
deployment gaps as verified from source.

...

Verified before commit: tsc --noEmit clean, eslint clean, 19 test files / 212
tests passing, next build emitting 6 static routes, and check-offline reporting
no remote references in the export.
```

### 8.2 The house rules this implies

1. **Lowercase, imperative, no trailing period.** `fix the header collapse`, not `Fixed the header collapse.`
2. **Put the *why* in the body, with numbers.** Several commits quote measured before/after figures ("210/253 recognised … 252/253 recognised"). That is the house style.
3. **End the body with the gates you ran.** "Gates: tsc clean, eslint clean, 19 files / 212 tests pass, next build 6 routes, check-offline OK." (commit `7ba9745`).
4. **Scope to one topic.** The history shows tight, single-purpose commits ("count the vial answer instead of raising it as an error").
5. **Commit generated output together with its source**, and **commit the `AGENTS.md` block** (§5).
6. **Never commit `out/`, `.next/`, `node_modules/`, `next-env.d.ts` or `tsconfig.tsbuildinfo`** — all gitignored (`.gitignore:4`, `:17-18`, `:40-41`).

### 8.3 Branching

Only `main` exists locally and on `origin` (`git branch -a` → `* main`, `remotes/origin/main`). There is no release branch, no tag, and no release process in the repository. **The branching and release policy is Not verified from the current repository.**

---

## 9. Troubleshooting

Development-workflow traps only. Setup and environment failures are in [`11-installation-and-setup.md` §8](11-installation-and-setup.md#8-troubleshooting); the longer table lives in [`DEVELOPMENT.md`](DEVELOPMENT.md#troubleshooting).

| Symptom | Cause | Fix |
| --- | --- | --- |
| Dev server 404s or hangs after a build | `next build` deleted `out/dev/` | Restart `next dev` (§7.1) |
| `AGENTS.md` shows up dirty after running anything | `next dev` / `next build` rewrite the block | Commit it — do not delete it (§5) |
| Import says "N column titles could not be matched" | Titles are not in the alias ladder | Use the manual `<select>` mapping, or add a `HINDI_ALIASES` entry |
| Import says "columns could not be told apart" | Duplicate titles collapsed | Rename in the source, or accept the collapse — it is reported, not guessed |
| Chart shows "Columns not in this file" | The export is partial | Correct behaviour — `columnsMissing` is surfaced on purpose |
| A comparison throws on an empty dataset | A new comparison did not handle `compute([])` | `tests/comparisons.test.ts:368-383` requires it not to throw — see [`DATA-MODEL.md` §7e](DATA-MODEL.md#7e--add-a-comparison) |
| A new column breaks two tests you did not touch | The registry size and the sample-workbook coverage are pinned | `tests/schema/columns.test.ts:6-8` and `tests/sample-data.test.ts:36-41` — update both (§3.1) |
| The offline gate fails after adding a link | A remote URL reached the built output | Host the asset locally or inline it (`scripts/check-offline.mjs:31-34`) |
| Tests pass locally, fail elsewhere | Stale `out/` or `tsbuildinfo` | Rebuild, and make sure all five gates run (§10) |

---

## 10. Before you commit

Run all five gates. `npm run ci` runs gates 1–4; the offline gate is separate.

| # | Gate | npm | Direct `node` (works with `&`) |
| --- | --- | --- | --- |
| 1 | Types | `npm run typecheck` | `node .\node_modules\typescript\bin\tsc --noEmit` |
| 2 | Lint | `npm run lint` | `node .\node_modules\eslint\bin\eslint.js .` |
| 3 | Tests | `npm run test` | `node .\node_modules\vitest\vitest.mjs run` |
| 4 | Build | `npm run build` | `node .\node_modules\next\dist\bin\next build` |
| 5 | Offline | `npm run build:check-offline` | `node .\scripts\check-offline.mjs` |

Details and what each gate proves: [`13-testing-and-quality.md`](13-testing-and-quality.md) §4.
