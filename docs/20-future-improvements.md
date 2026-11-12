# 20 — Future improvements

**Scope.** A catalogue of changes that would make this application better, organised by the kind of
value they deliver.

---

## 0. Read this first: there is no roadmap in this repository

**This repository contains no roadmap, no backlog, no issue-tracker export, no `CHANGELOG`, and no
`TODO` list.** Verified:

| Thing | Present? | Evidence |
|---|---|---|
| `CHANGELOG.md` / `CHANGELOG` | **No** | Not in the repository root |
| `ROADMAP.md` / `BACKLOG.md` / `TODO.md` | **No** | Not in the repository root |
| `.github/` (issues export, milestones, projects) | **No** | The directory does not exist |
| Any other CI config (`.gitlab-ci.yml`, `azure-pipelines.yml`, `Jenkinsfile`) | **No** | None present |
| `TODO` / `FIXME` / `XXX` / `HACK` markers in `src/`, `scripts/`, `tests/` | **No** | A search across all three trees returns **zero** matches |

The consequence is important and worth stating plainly: **every item in this document is my
logical extension of the current design, not a commitment.** There is no stakeholder sign-off
behind any of it, no agreed priority, no owner, and no date. The grouping and the ordering are my
assessment of what matters, based on the code.

Each item below is therefore labelled:

> **Status: proposal — not a commitment.**

The only things in this repository that *are* commitments are the code and the tests. Where a
proposal would change observable behaviour, that is called out in its **Risk** row.

---

## 1. Fix first — correctness and trust

These are items where the application currently **shows something other than the truth**, or where a
**documented workflow does not work**. They come first because everything else is less valuable while
the app can mislead a health official.

### 1.1 `anc-pnc-bias` renders as the wrong chart type

| | |
|---|---|
| **Rationale** | The comparison declares `kind: "grouped-bar"` but supplies a **single** `seriesKeys` entry, so `ChartCanvas` never takes the grouped branch and silently falls through to the default single-series bar over `series.points` — discarding `extra.groups`. The user gets a chart that is not the chart the registry says it is. |
| **Evidence** | `src/lib/comparisons.ts:452-459` (one `seriesKeys` entry) vs `src/components/ChartCanvas.tsx:256` (`extra.seriesKeys.length > 1` required). The sibling comparison `gdm-bottleneck` passes two series keys and is correct. |
| **Files touched** | `src/lib/comparisons.ts` (the `anc-pnc-bias` entry) **or** `src/components/ChartCanvas.tsx` (relax the condition) |
| **Risk** | **Low**, but the two fixes are not equivalent. Supplying a second series key changes the *data* the chart shows; relaxing the `ChartCanvas` condition changes how *every* grouped-bar comparison renders. The second option is the more dangerous one, because it would also affect `gdm-bottleneck` and any future comparison. A browser-level test (§4.3) would settle which is correct. |
| **Status** | Proposal — not a commitment. |

### 1.2 Two stub statistics are presented as measurements

| | |
|---|---|
| **Rationale** | In **comparison mode**, the insight tiles "Date span (days)" and "Shape" show `0` and `flat` — but those are **hard-coded constants**, not measurements of the dataset. In indicator mode they are real. A user comparing two things sees numbers that mean nothing and has no way to know that. |
| **Evidence** | `src/lib/comparisons.ts:252` (`dateSpanDays: 0`) and `:254` (`numericShape: "flat"`), read by `src/app/viz/page.tsx:216` and `:243`. The real computations are at `src/schema/indicators.ts:177-181` and `:257-261`. |
| **Files touched** | `src/lib/comparisons.ts` (`mkSeries`), `src/app/viz/page.tsx` (the two tiles) |
| **Risk** | **Low.** Two honest options, and the choice is a product decision: (a) compute the real values for comparisons too, or (b) **hide the two tiles in comparison mode** and label the rest as comparison-scoped. Option (b) is smaller and cannot be wrong; option (a) is more informative but "date span" and "shape" have no natural meaning for a cross-sectional comparison, so it may be (b) in disguise. |
| **Status** | Proposal — not a commitment. |

### 1.3 `npm run make:sample` does not work

| | |
|---|---|
| **Rationale** | The documented way to regenerate the demo fixture fails: `scripts/make-sample-data.cjs` uses ESM `import` in a `.cjs` file. `node --check` on it throws `SyntaxError: Cannot use import statement outside a module`. The committed fixture is current, so nothing is blocked — but the next person who needs to change the sample data hits this first. |
| **Evidence** | `scripts/make-sample-data.cjs:10-12`; `package.json:15`; `eslint.config.mjs:8-15` (the carve-out that assumes `.cjs` means `require`). |
| **Files touched** | `scripts/make-sample-data.cjs`, possibly `package.json:15` |
| **Risk** | **Low.** Converting to `require` is mechanical (the rest of the file is plain JS — no top-level `await`, no `import.meta`). The alternative, renaming to `.mjs`, keeps the modern syntax but makes the three `.cjs` scripts inconsistent and requires doc updates. **This is a documented defect, not a design decision.** |
| **Status** | Proposal — not a commitment. |

### 1.4 `scripts/make-shape-sample.mjs` hard-codes another machine's path

| | |
|---|---|
| **Rationale** | The default input is an absolute path on a specific person's machine, so the script fails everywhere else. It also hard-codes a home-directory path into a tracked source file, which is a small privacy smell given that this project is about health data. |
| **Evidence** | `scripts/make-shape-sample.mjs:14` — `process.argv[2] ?? "C:/Users/DADITYA/Downloads/DATA_EX.csv"`. |
| **Files touched** | `scripts/make-shape-sample.mjs` |
| **Risk** | **Low.** Require the argument explicitly and print usage on its absence. The usage message should also mention that the `PSEUDONYMS` map (`:17-24`) only covers five names and that any other name becomes `Worker <index>` (`:61`) — safe by default, but worth saying out loud before someone commits a fixture. |
| **Status** | Proposal — not a commitment. |

### 1.5 Partial-import silence — "0 errors" can mean "nothing was checked"

| | |
|---|---|
| **Rationale** | With a partially-recognised export, the parser may recognise only ~90 of 253 columns. `referenceDate(rows)` then returns `null` (no `SubmissionDate`), and **every date-dependent cross-field rule becomes inapplicable**. The rule engine is silent by design; the review banner only counts unresolved errors. The result is that a file the app barely understood is presented as **"0 errors"** — indistinguishable from a genuinely clean file. This is the single most trust-damaging behaviour in the application. |
| **Evidence** | `src/schema/engine/validate.ts:32-39` (`referenceDate`) and `:47`; the guard `ctx.refDate !== null` at `src/schema/versions/v2026-1.ts:561-562`; measured: `sample-data/DATASET_1.xlsx` recognises 90 of 253 columns, lacks `SubmissionDate`/`B8`, and produces **0** violations (`docs/PIPELINE.md` §5.3). |
| **Files touched** | `src/app/ingest/page.tsx` (the success card, `:100-104,244-248`), `src/app/review/page.tsx` (the coverage copy, `:208-211`), `src/schema/engine/validate.ts` (optionally, surface a "N rules inapplicable" count) |
| **Risk** | **Medium, and the risk is in the direction of being too loud.** The app already distinguishes "the file lacks this column" from "the file has it and nobody filled it" via `presentColumns` — the machinery exists. The change is to surface it, e.g. "**12 of 37 cross-field rules could not be evaluated because this export does not contain `SubmissionDate`**. 0 errors found does not mean this file is clean." Adding a hard block would be too aggressive (a legitimate file may legitimately lack a date column), but a prominent, specific warning is clearly right. |
| **Note** | This item also removes a chunk of wasted work (§4.5 of the performance document), because a mostly-unrecognised file is mostly uncheckable. |
| **Status** | Proposal — not a commitment. |

### 1.6 The disabled `MISSING_REQUIRED` flag

| | |
|---|---|
| **Rationale** | The schema declares a field mandatory — `dat("B8", true)` at `src/schema/versions/v2026-1.ts:178`, where `dat` sets `required` (`:152`) and `FieldDef.required` is part of the canonical projection (`src/schema/dsl.ts:33,188`). But **no code path emits the violation**: `collectFieldViolations` returns immediately on a blank value (`src/schema/engine/validate.ts:119-123`), and the string `MISSING_REQUIRED` appears nowhere in `src/` — only in two tests that assert its absence (`tests/sample-data.test.ts:63`, `tests/engine/validate.test.ts:129-131`). A declared guarantee that does not hold is worse than no guarantee. |
| **Files touched** | `src/schema/engine/validate.ts` (emit it), `src/schema/versions/v2026-1.ts` (keep or drop the flag), `tests/engine/validate.test.ts` and `tests/sample-data.test.ts` (flip the assertions) |
| **Risk** | **High, and deliberately so.** Turning it on changes the meaning of every existing dataset: `B8` is the visit date, and the committed synthetic fixture has a row with `B8` deliberately removed (`scripts/make-sample-data.cjs:121`). Enabling the rule would turn that into an error. The two acceptable outcomes are: implement it **and** fix the fixture and the test expectations, or **remove the `required` flag** so the schema stops claiming something the engine does not do. The second is cheaper and is the honest minimum. |
| **Status** | Proposal — not a commitment. |

### 1.7 Comparison numbering no longer follows category order

| | |
|---|---|
| **Rationale** | #21 (`good-vs-bad-practice`) is filed under `COMPARISON_CATEGORIES[1]`, so the "2 · Service & Infrastructure Readiness" optgroup lists 4, 5, 6, 7 **and 21**, while the other categories run 1–3 and 8–20. The UI implies an ordering the data does not have, and a reader looking for "comparison 8" finds it in a different category than expected. |
| **Evidence** | `src/lib/comparisons.ts:1057-1059` (the `category:` field of entry 21) against `:320-1090` (the registry order); the optgroup is built at `src/app/viz/page.tsx:286-293`. |
| **Files touched** | `src/lib/comparisons.ts` (either move the entry into its own category, or renumber), `src/app/viz/page.tsx` (if the numbering becomes derived) |
| **Risk** | **Low.** The safest fix is to derive the displayed number from the registry position rather than from the hand-written `label` string, so it can never drift again. That does mean the numbers change, and any document, screenshot or training material that cites "comparison 21" becomes wrong. |
| **Status** | Proposal — not a commitment. |

### 1.8 Dependency hygiene — `zod` and `jszip`

| | |
|---|---|
| **Rationale** | `zod@^4.6.5` is a production dependency (`package.json:31`) that is **never imported**, and it is the largest unused package in the tree (6,140,311 bytes installed, 840 files). Conversely `jszip` is used **directly** by `scripts/make-default-templates.mjs:17` and `tests/docx-template.test.ts:2` but is **not declared** — it only resolves because `docx-templates` depends on it (`package-lock.json:3434`). |
| **Files touched** | `package.json`, `package-lock.json`. The `PROJECT_CONTEXT.md` and `docs/PIPELINE.md` lines that previously said `zod` is a dependency of `docx-templates` have already been corrected — see [`17-integrations-and-third-party-services.md` §6.1](17-integrations-and-third-party-services.md) |
| **Risk** | **Low.** Moving `zod` to `devDependencies` (or removing it) changes only the lock file's dev/production marking; `eslint-plugin-react-hooks` still installs it transitively (`package-lock.json:4010-4016`), so linting is unaffected. Declaring `jszip` explicitly removes an accidental reliance on hoisting. |
| **Status** | Proposal — not a commitment. Detail and the full correction are in [`17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) §6. |

---

## 2. Data integrity and recovery

The app's key-management model is a deliberate trade-off: encrypt at rest, no passphrase, no
friction (`src/lib/crypto.ts:9-17`). The consequence — **there is no disaster recovery** — is
currently a documented property rather than a defect. These proposals change that trade-off.

### 2.1 Key export / import, or an optional passphrase

| | |
|---|---|
| **Rationale** | The AES-256-GCM key is generated on first use and stored as **raw bytes** in a separate IndexedDB database, `pipeline-crypto` (`src/lib/crypto.ts:3-4,61-82`). Clearing site data destroys it, and with it every encrypted dataset. There is no passphrase, no key export and no backup. The key is also bound to the **origin**, so data cannot move between machines, browsers or ports. |
| **Files touched** | `src/lib/crypto.ts` (key derivation, an export/import pair, an optional passphrase wrapping the stored key), `src/app/report/page.tsx` (a "backup / restore" panel), `src/lib/storage/idb.ts` (possibly a second key store) |
| **Risk** | **Medium, and it goes against the stated design goal.** The threat model at `src/lib/crypto.ts:9-17` is explicitly "at rest, against disk and copy artefacts on shared machines", and the explicit goal is to avoid "the user-friction of passphrases". A passphrase reintroduces exactly that friction; a key-export button creates a file that must be protected as carefully as the data itself. The middle path — an **optional** passphrase, defaulting to off, plus an explicit "export key file" action behind a confirmation — preserves the current default behaviour while removing the single point of failure. That middle path is the one worth proposing. |
| **Status** | Proposal — not a commitment. |

### 2.2 Encrypted dataset bundles — making work portable

| | |
|---|---|
| **Rationale** | A dataset, its decisions, its validation cache and its captured charts all live in one browser on one machine. A supervisor who hands the laptop to a colleague cannot pass the work on; a second device starts from zero. |
| **Files touched** | `src/export/` (a new bundle writer), `src/lib/storage/idb.ts` (a bundle import that restores the `ds`, `res`, `chart`, `blob` and `validation` stores), `src/app/report/page.tsx` (export/import buttons) |
| **Risk** | **Medium.** The bundle must be encrypted with a key the receiving machine can use — which means §2.1 has to be solved first, or the bundle is encrypted with a bundle-specific key that the user supplies (a passphrase). It also creates a new exfiltration path in a project whose whole point is that data does not leave the device, so the UI copy and the CSP story would need revisiting. |
| **Status** | Proposal — not a commitment. |

### 2.3 Carrying decisions across a re-import

| | |
|---|---|
| **Rationale** | A new import always mints a fresh `crypto.randomUUID()` id (`src/stores/datasetStore.ts:42`), so **decisions do not carry over**. Re-importing a corrected file means redoing every review decision — the most painful step in the workflow. The app does detect the earlier import and offers "Open the previous import" (`src/app/ingest/page.tsx:278-302`), which is honest but does not carry the work forward. |
| **Files touched** | `src/stores/datasetStore.ts` (the id minting), `src/app/ingest/page.tsx` (the duplicate-import card), `src/lib/storage/idb.ts` (copying resolutions to the new dataset id) |
| **Risk** | **Medium — this is a data-integrity feature, so a naive implementation is dangerous.** Carrying decisions by *file name + row count + schema version* (what the app already compares at `src/app/ingest/page.tsx:120-129`) is unsafe if the file's contents changed: a row that was "kept with reason X" may now hold a different value. The sound version keys on a **content hash** of the source file and, ideally, on a per-row hash, so a decision is only carried to an identical row. That is a meaningful amount of new logic in the audit-critical path. |
| **Status** | Proposal — not a commitment. |

---

## 3. Schema and domain coverage

### 3.1 Implement `pmsma` as a second dataset kind

| | |
|---|---|
| **Rationale** | The product is named "VHSND & PMSMA Pipeline" and the brand appears in the app shell (`src/components/AppShell.tsx:39`), but **only `vhsnd` exists**. `DatasetKind` is `"vhsnd" | "pmsma"` (`src/contracts/dataset.ts:13`), `SUPPORTED_DATASET_KINDS = ["vhsnd"]` (`src/schema/index.ts:5`), and `SCHEMAS` holds one entry (`:8-10`). A user expecting PMSMA support finds nothing. |
| **Files touched** | `data/pmsma-columns.csv` (new), `src/schema/columns-pmsma.ts` (generated), `src/schema/versions/v2026-1.ts` (a second dataset entry in the `datasets` map), `src/schema/index.ts:5` (add the kind), `src/app/ingest/page.tsx` (a kind selector — the app currently hard-codes `"vhsnd"` at `src/stores/datasetStore.ts:27,40` and `src/workers/parseWorker.ts:54`), `src/workers/validateWorker.ts:22` (the same hard-code) |
| **Risk** | **High, and mostly it is a *content* risk rather than a code risk.** The plumbing is already shaped for it — `DatasetSchemaDef` has a `datasets` map keyed by kind (`src/schema/dsl.ts:91-94`) and `getDatasetSchema(version, kind)` already throws for an unknown kind (`src/schema/index.ts:19-22`). The real work is **obtaining and transcribing the PMSMA form**: its column registry, its 129-equivalent fields, its cross-field rules and its indicators. None of that can be inferred from the VHSND schema. Indicators and comparisons would also need their own PMSMA variants, or the PMSMA path would produce charts the VHSND ones cannot. |
| **Status** | Proposal — not a commitment, and §6 Q2 asks whether it is even wanted. |

### 3.2 Ship a `2026.2` schema alongside `2026.1`

| | |
|---|---|
| **Rationale** | The schema is versioned and the machinery is already in place — `SCHEMA_VERSION = "2026.1"` (`src/schema/index.ts:4`), `SCHEMAS` is a version → schema map (`:8-10`), `getDatasetSchema` throws on an unknown version (`:13-17`), and every dataset records both `schemaVersion` and `schemaHash` (`src/contracts/dataset.ts:28-29`). Today there is exactly one version, so the versioning has never been exercised. When the official form changes, there is no way to open an old dataset under the old rules. |
| **Files touched** | `src/schema/versions/v2026-2.ts` (new), `src/schema/index.ts:4,8-10` (register it), `src/stores/datasetStore.ts:41` (the default version), `src/schema/dsl.ts` (nothing — the `SchemaDef` shape already supports it) |
| **Risk** | **Medium.** The mechanism is sound, but two things need care. First, `computeSchemaHash` is recorded on every dataset and included in the report manifest, so a new version changes hashes and any audit trail that pinned a hash needs a note. Second, `src/lib/derive.ts:26-38` resolves the coercer from `dataset.schemaVersion`, and on failure **silently falls back to writing values through without coercion** — so an old dataset opened under a broken schema path would be quietly corrupted. That fallback should be fixed before, or at the same time as, multi-version support. |
| **Status** | Proposal — not a commitment. |

### 3.3 Smaller schema items

| Item | Rationale | Files | Risk |
|---|---|---|---|
| **Column registry editable in the app** | The registry is a 253-row CSV compiled into TypeScript (`data/vhsnd-columns.csv` → `src/schema/columns-vhsnd.ts`). An official cannot add a locally-renamed column without a code change. | `src/schema/columns-vhsnd.ts`, `src/lib/storage/idb.ts` (a user override store), `src/app/ingest/page.tsx` | **Medium** — it changes `schemaHash`, which is in the audit manifest. |
| **Rule-authoring UI** | The rule DSL is code-only (`src/schema/dsl.ts`). A data engineer cannot add a rule without a release. | new UI, `src/schema/versions/` | **High** — rules are audit-critical; a UI that produces them must produce deterministic, hashable output. |
| **Column registry in the app** | The manual `<select>` mapping on the Ingest screen already covers all 253 columns and is saved per file (`src/app/ingest/page.tsx:335-369`, `src/lib/storage/idb.ts:217-228`). Promoting per-file mappings to a global registry is a small, natural extension. | `src/lib/storage/idb.ts`, `src/schema/engine/headerNormalizer.ts` | **Low** — per-file overrides already work today. |

---

## 4. Engineering quality

### 4.1 A CI workflow that runs the gates

| | |
|---|---|
| **Rationale** | `npm run ci` exists (`package.json:18`) and chains typecheck → lint → test → build, but **nothing runs it**. There is no `.github/` directory and no other CI configuration. Five gates are documented (`docs/DEVELOPMENT.md:66-80`) and enforced by discipline alone. |
| **Files touched** | `.github/workflows/ci.yml` (new), possibly `package.json` (a `ci:all` script that includes `check-offline`, since `npm run ci` deliberately omits it — `PROJECT_CONTEXT.md` §15.4) |
| **Risk** | **Low**, with two caveats. The `&` in the checkout path breaks npm's `.bin` shims on Windows, so the workflow must either call the binaries through `node` directly (as `docs/PIPELINE.md` §5.1 does) or check out to a path without `&`. And CI needs `npm ci`, which requires the lock file to be in sync — which §4.8's dependency-hygiene item would need to be done first, or at least in the same change. |
| **Status** | Proposal — not a commitment. |

### 4.2 A coverage provider and a ratchet threshold

| | |
|---|---|
| **Rationale** | `vitest.config.ts` has **no coverage provider and no threshold** (`:4-9`). The untested surface is large and well documented: all 7 components, all 5 pages, the worker wiring, the storage layer, the crypto layer, all 4 stores, the PPTX/CSV/report-context writers, and the manifest determinism path (`PROJECT_CONTEXT.md` §15.3). The audit-critical hash path has no test at all. |
| **Files touched** | `vitest.config.ts`, `package.json` (add `@vitest/coverage-v8`), `tests/` |
| **Risk** | **Low if the threshold is a ratchet** (a floor that only rises), **medium if it is a fixed number** (a fixed floor set today would be arbitrary and would fail the build on day one). The valuable first step is not a threshold at all but **covering the manifest path** (`src/export/reportContext.ts:111-118`) and the storage round-trip — both are audit-critical and both are untested. |
| **Status** | Proposal — not a commitment. |

### 4.3 Browser-level tests for `ChartCanvas` and the viz page

| | |
|---|---|
| **Rationale** | §1.1 is exactly the class of bug a render test catches: the comparison's payload is correct, the registry is correct, and the **component** ignores it. The suite is a pure-Node unit suite (`vitest.config.ts:6`, `environment: "node"`) with no jsdom, no React Testing Library and no Playwright — which is why `tests/comparisons.test.ts` exercises `compute()` but never the DOM. |
| **Files touched** | `vitest.config.ts` (or a separate Playwright config), `tests/` (new), `package.json` |
| **Risk** | **Medium** — mostly in *cost*, not correctness. A browser harness adds a heavyweight dependency to a project that has deliberately kept itself small and offline. A lighter middle path exists: a jsdom-based render test of `ChartCanvas` with a mocked `recharts`, asserting which branch is taken for a given `kind` + `extra` combination. That would have caught §1.1 without a browser. |
| **Status** | Proposal — not a commitment. |

### 4.4 Split `src/lib/comparisons.ts`

| | |
|---|---|
| **Rationale** | The file is ~1,050–1,100 lines and holds 21 comparisons across 6 categories plus the standardisation helpers, the row helpers and the result shapes. It is the largest source file in the project (`PROJECT_CONTEXT.md` §16.6) and it is the file a data engineer must read to add or change a comparison. |
| **Files touched** | `src/lib/comparisons.ts` → `src/lib/comparisons/{index.ts,helpers.ts,cascades.ts,readiness.ts,supply.ts,counselling.ts,digital.ts,vulnerable.ts}` |
| **Risk** | **Low to medium.** The mechanical part is safe. The risk is in the **shared helpers** — `stdBool`, `stdNum`, `countTrue`, `pctTrue`, `meanPctTrue`, `meanDetail`, `presentCodes`, `inFile` (`src/lib/comparisons.ts:8-163`) — which several categories use. Splitting them carelessly would either duplicate them (divergence) or create an import cycle. They should move into a `helpers` module that the category modules import, and `tests/comparisons.test.ts` (40 tests) must keep passing unchanged. |
| **Status** | Proposal — not a commitment. |

### 4.5 Virtualise the review and dataset tables

| | |
|---|---|
| **Rationale** | Both tables render every row as a real DOM node: the review table at `src/app/review/page.tsx:260-288` and the dataset list at `src/app/page.tsx:112-132`. The committed synthetic fixture alone produces **3,773 violations** (320 errors + 3,146 warnings + 307 infos), so the review page builds thousands of `<tr>` elements with six `<td>` each. |
| **Files touched** | `src/app/review/page.tsx`, `src/app/page.tsx`, `src/components/DatasetPicker.tsx` |
| **Risk** | **Medium.** A hand-rolled window is easy to get subtly wrong — scroll anchoring, keyboard navigation, the selected row, and the fact that the row drawer is driven by a click on a `<tr>`. A third-party virtualiser would add a dependency to a project that has none of that kind. Pagination is the lower-risk alternative and would also help the DOM, though it changes the interaction model. |
| **Status** | Proposal — not a commitment. Detail and measurement in [`19-performance-and-scalability.md`](19-performance-and-scalability.md) §4.5. |

### 4.6 Cache the `listDatasets` summaries

| | |
|---|---|
| **Rationale** | `listDatasets()` decrypts and `JSON.parse`s the **entire** stored dataset for every saved dataset, sequentially, in order to return eight summary fields (`src/lib/storage/idb.ts:99-117`). It is called from the landing page, the dataset picker and the ingest screen's duplicate check. |
| **Files touched** | `src/lib/storage/idb.ts`, `src/stores/datasetStore.ts` |
| **Risk** | **Medium** — it touches the storage layer, which is also where the wipe lives (`eraseAllLocalData`, `:260-273`). A summary store must be wiped in exactly the same way as the snapshots, or "Erase all local data" would leave filenames behind, which would be a privacy defect in a project whose central promise is that nothing lingers. |
| **Status** | Proposal — not a commitment. |

### 4.7 Prettier and `.editorconfig`

| | |
|---|---|
| **Rationale** | There is no `.prettierrc*` and no `.editorconfig`; formatting is whatever ESLint happens to accept (`PROJECT_CONTEXT.md` §16.6). Long inline `style` objects — the dominant styling idiom in this codebase — are exactly the case where an opinionated formatter and an editor config help most. |
| **Files touched** | `.prettierrc*` (new), `.editorconfig` (new), `package.json` (a `format` script), plus a one-off reformat |
| **Risk** | **Low**, but a reformat produces a large diff that obscures real changes. It should be its own commit. A `.prettierignore` should exclude the three generated files (`src/schema/columns-vhsnd.ts`, `src/export/templates.generated.ts`, and the lock file). |
| **Status** | Proposal — not a commitment. |

### 4.8 Replace the meta CSP with a nonce-based one — and what that costs

| | |
|---|---|
| **Rationale** | The current policy includes `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (`src/app/layout.tsx:15`). `'unsafe-eval'` re-enables code generation from string, so a DOM-based injection would not be contained. The comment in the source is candid about why: "a static offline app cannot use nonces (no server), so inline must be permitted" (`src/app/layout.tsx:12-14`). |
| **Files touched** | `src/app/layout.tsx:10-25`, `next.config.ts`, and possibly the hosting configuration |
| **Risk** | **High, and it is a trade rather than a fix.** Nonces require a **server** to generate a fresh, unpredictable value per response and to attach the matching `Content-Security-Policy` **header**. A pure static export (`next.config.ts:4`) cannot do that — which means **giving up `output: "export"`** and shipping a server. That is a fundamental architectural change: the app becomes a running service, the deployment story changes completely, and the "download the folder, open it from a file share" distribution model (`PROJECT_CONTEXT.md` §13.4) is lost. The static-export model is the source of most of this project's operational simplicity. **The trade should be made deliberately, not as a lint fix.** The alternative — keeping the static export and accepting `'unsafe-eval'` — is defensible precisely because there is no untrusted input rendered as markup anywhere in `src/`. |
| **Status** | Proposal — not a commitment. **Explicitly a trade-off, not a recommendation.** |

---

## 5. Product and operations

### 5.1 A service worker for true offline installability

| | |
|---|---|
| **Rationale** | The app calls itself offline-first, and it genuinely processes data offline — but **nothing precaches the artefact**. There is no service-worker registration anywhere in `src/`. "Works offline" therefore depends entirely on how `out/` is served, and the app cannot be installed to a home screen. |
| **Files touched** | new `public/sw.js` (or an `app/` route), `src/app/layout.tsx` (registration), `next.config.ts` |
| **Risk** | **Medium — and it introduces a class of bug that does not exist today: stale caches.** A service worker that serves a cached build will silently serve an **old schema** to a user who has a new build, which is exactly the kind of quiet inconsistency this project has worked hard to eliminate. It also interacts badly with the CSP (`worker-src 'self' blob: data:` already permits it, `src/app/layout.tsx:21`) and with `trailingSlash: true` routing. If it is done, it needs an explicit update strategy and a visible version indicator. |
| **Status** | Proposal — not a commitment. |

### 5.2 A deployment recipe and a documented update path

| | |
|---|---|
| **Rationale** | Deployment is "Not found in codebase" (`PROJECT_CONTEXT.md` §13.2): no Dockerfile, no `vercel.json`, no `netlify.toml`, no `firebase.json`, no CI, and no documentation. `.vercel` is in `.gitignore`, which hints at an intended Vercel usage but is not evidence of one. There is also no documented answer to "how does a district machine get the new version?" — which matters for a tool whose output is an audit artefact. |
| **Files touched** | new `docs/DEPLOYMENT.md` or a section in `docs/DEVELOPMENT.md`; possibly a `Dockerfile` or a hosting config |
| **Risk** | **Low technically, high in process.** The document must answer the questions in §6 Q1 and Q7 before it can be written: who hosts it, over what URL, who operates it, and how updates roll out. |
| **Status** | Proposal — not a commitment. |

### 5.3 A print / PDF-friendly report stylesheet

| | |
|---|---|
| **Rationale** | District review is often printed. The current app has no print stylesheet — the design tokens live in `src/app/globals.css` and are screen-oriented. The Report screen shows the summary in the DOM (`src/app/report/page.tsx:213-220`), so `Ctrl+P` produces something usable but unconsidered. |
| **Files touched** | `src/app/globals.css` (a `@media print` block), possibly `src/app/report/page.tsx` (a print-only layout) |
| **Risk** | **Low.** Purely additive CSS. The one caveat is that the app's colours are chosen for screen contrast and may not survive a monochrome print — worth checking the warning/error badges, which currently rely on hue. |
| **Status** | Proposal — not a commitment. |

### 5.4 Dark mode and a mobile layout

| | |
|---|---|
| **Rationale** | The app defines CSS custom properties for tone (`--info`, `--warning`, `--warning-soft`; `src/app/globals.css`) but no `prefers-color-scheme` block, and no dark theme. It is also not mobile-adapted — `PROJECT_CONTEXT.md` §16.7 lists mobile-specific layout as explicitly out of scope. A health worker reviewing data on a phone between visits is a plausible user. |
| **Files touched** | `src/app/globals.css`, and potentially every component (the codebase mixes CSS classes with large inline `style` objects, which do not respond to a theme token change) |
| **Risk** | **Medium, and it is larger than it looks.** The inline-style idiom means a theme is not a matter of swapping CSS variables — every inline colour has to be found and converted. That is a wide, low-risk-per-change but high-volume diff. Mobile layout is a separate and larger piece of work: the review table has six columns and the row drawer is a sticky side panel. |
| **Status** | Proposal — not a commitment. |

### 5.5 Devanagari localisation

| | |
|---|---|
| **Rationale** | The domain is Hindi-first — the survey form's own labels are Devanagari, the header normaliser carries a 180-line `HINDI_ALIASES` map (`src/schema/engine/headerNormalizer.ts:34-216`) and a Hindi stopword list (`:258-283`) — but the **UI is English-only**. The user is an English-or-Hindi bilingual district official; the app does not currently meet them in their own language. |
| **Files touched** | a new i18n layer, every user-facing string in `src/app/**` and `src/components/**`, and `src/lib/ingestCopy.ts` (which holds the deliberately careful wording for collapsed columns) |
| **Risk** | **Medium to high, and the risk is linguistic, not technical.** This app makes strong claims about honesty in its wording ("Columns not in this file", "could not be told apart"). The English copy was written carefully — `src/lib/ingestCopy.ts:11-24` distinguishes the file's fault from ours. Translating it means either finding equally careful Hindi, or losing that distinction. The `HINDI_ALIASES` map shows the domain vocabulary is already known, but UI copy is a different register from column labels. |
| **Status** | Proposal — not a commitment. §6 Q8 asks how high this should be prioritised. |

---

## 6. Open questions that need a human decision

These are **TBD — user input required**. None can be answered from the code, and several change the
shape of the proposals above.

| # | Question | Why it matters | Which proposals it blocks |
|---|---|---|---|
| **Q1** | **Where is `out/` hosted?** GitHub Pages, S3 + CloudFront, an Azure blob share, a district file share, Vercel — and what is the production URL? | Determines the deployment recipe, whether HTTPS is guaranteed (and therefore whether `crypto.subtle` works), and whether a service worker is even possible. | §5.1, §5.2, and the feasibility of §4.8 |
| **Q2** | **Is `pmsma` genuinely on the roadmap?** | The product name promises two survey types; only one exists. If PMSMA is never coming, the name and the `DatasetKind` union should change instead. If it is coming, it is a substantial content project, not a code one. | §3.1, §3.3 |
| **Q3** | **What is the real maximum dataset size and machine?** | Every performance mitigation in [`19-performance-and-scalability.md`](19-performance-and-scalability.md) is ordered on an assumption about this. The highest figure exercised so far is 693 rows × 252 columns. | §4.5, §4.6, and the priority of §1.5 |
| **Q4** | **Has partial-import silence actually been seen in the field?** | The mechanism is verified in code and measured against fixtures, but **no one has reported it from a real district machine**. That determines whether §1.5 is a polish item or a trust emergency. | §1.5 |
| **Q5** | **What is the acceptable key-loss tolerance?** | If losing a district laptop's data is catastrophic, §2.1 is not optional. If re-import is acceptable, the current zero-friction model is right and should stay. | §2.1, §2.2 |
| **Q6** | **Who owns this, and under what licence?** | Nothing in the repository states an owner, a licence or a governance model. This determines whether "pmsma", "National Health Mission" and the survey form's structure may be used and redistributed. | Everything downstream of Q1 |
| **Q7** | **What is the browser support matrix?** | The app needs Web Workers, module Workers, `crypto.subtle`, IndexedDB and ES2020-class syntax. No supported-browser list exists, and §4.8 (nonce CSP), §5.1 (service worker) and the `file://` question all depend on it. | §4.8, §5.1, §5.4 |
| **Q8** | **How high is localisation?** | Devanagari UI is a meaningful quality-of-life improvement for the actual users, and a large piece of work with a linguistic risk. It competes directly with §5.4 for the same effort. | §5.5, §5.4 |
| **Q9** | **Is multi-user or shared-machine operation expected?** | `PROJECT_CONTEXT.md` §16.7 lists authentication and multi-user support as out of scope. If two officials share a machine, the single-origin, single-key model is a problem rather than a feature. | §2.1, §2.2 |

---

## 7. Cross-references

| Topic | Document |
|---|---|
| The known-issues register this document draws from | `PROJECT_CONTEXT.md` §16 |
| Full detail on the two broken scripts (§1.3, §1.4) | [`docs/18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) §4 |
| The measured performance baseline and the mitigation list | [`docs/19-performance-and-scalability.md`](19-performance-and-scalability.md) §3, §6 |
| The libraries, the CSP and the "no network" proof | [`docs/17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) |
| Stage-by-stage codemap | [`docs/PIPELINE.md`](PIPELINE.md) |
| Schema, rules, indicators, comparisons — with extension recipes | [`docs/DATA-MODEL.md`](DATA-MODEL.md) |
| Contributor setup and the five gates | [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) |

---

*Every claim in this document was read from the source at the time of writing. Nothing in it is a
commitment, a schedule or an agreed priority — the repository contains no roadmap, backlog,
`CHANGELOG` or `TODO` list from which such a thing could be derived. Where a fact could not be
established from the repository it is marked **Not verified from the current repository.***
