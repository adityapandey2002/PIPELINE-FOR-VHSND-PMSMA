# 01 — Project Overview

> **Scope.** What the application does, the problem it exists to solve, who uses it, what it
> actually delivers today, and the design principles that explain most of the decisions in the
> codebase. **Evidence rule:** every technical claim carries a `path:line` citation; anything not
> establishable from the repository is written as **"Not verified from the current repository."**
> **Companion documents** (read rather than duplicate):
> [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) (single-file source of truth, 20 sections) ·
> [`02-technology-stack.md`](02-technology-stack.md) · [`03-project-structure.md`](03-project-structure.md) ·
> [`PIPELINE.md`](PIPELINE.md) (stage-by-stage codemap) ·
> [`DATA-MODEL.md`](DATA-MODEL.md) (253-column schema) ·
> [`DEVELOPMENT.md`](DEVELOPMENT.md) (setup and gates) ·
> [`../README.md`](../README.md) (plain-language product narrative).

---

## 1. What the application is

An **offline-first, browser-only data-cleaning and reporting pipeline** for VHSND (Village Health &
Sanitation Day) household survey sessions.

The complete loop, end to end and entirely on-device:

1. A health official drops an ODK/Excel export into the browser.
2. The app normalises the workbook against the survey schema.
3. It flags contradictions inside the data.
4. A human adjudicates every flagged row with a written justification.
5. The result is charted and exported as a signed-off report.

**Nothing is uploaded.** There is no server component: the build is a pure static export
(`next.config.ts:4` → `output: "export"`), every page is a client component, all survey data lives
in the browser's IndexedDB encrypted at rest, and a Content-Security-Policy plus a build gate
enforce that no request ever leaves the origin (`src/app/layout.tsx:10-25`,
`scripts/check-offline.mjs:18-34`).

There are **zero backend services** — no API route handlers, no server actions, no middleware, and
no environment variable is read anywhere in `src/` (`PROJECT_CONTEXT.md` §7.1). The application's
"API" is its TypeScript module boundaries, documented in
[`08-api-documentation.md`](08-api-documentation.md).

### 1.1 The domain objects it operates on

| Concept | Meaning | Where it is defined |
|---|---|---|
| **VHSND** | Village Health, Sanitation and Nutrition Day — the monthly village camp this form reports on | `README.md` glossary |
| **PMSMA** | Pradhan Mantri Surakshit Matritva Abhiyan — the safe-motherhood visit programme. **Declared as a type only**; see §4 | `src/contracts/dataset.ts:13` |
| **Field code** | The stable identifier of a survey question, e.g. `B8` = "Date of visit". Codes — not labels — are the join key everywhere | `src/schema/columns-vhsnd.ts` (generated) |
| **Violation** | One problem detected in one row: `{rowId, code, fieldId?, ruleId?, severity, category, rawValue}`, rated `error` · `warning` · `info` | `src/contracts/violation.ts`; `src/schema/engine/validate.ts:41-95` |
| **Resolution** | The human decision on a row: `pending` · `keep` · `drop` · `override` | `src/contracts/resolution.ts` |
| **Manifest** | A SHA-256 fingerprint over the canonical report context plus a hash of the cleaned rows | `src/export/reportContext.ts:111-118` |

The full glossary — 34 terms from *sentinel* to *manifest* — is in
[`PROJECT_CONTEXT.md` §20](../PROJECT_CONTEXT.md); it is not duplicated here.

### 1.2 Scale (measured, not estimated)

| Quantity | Value | Evidence |
|---|---:|---|
| Column registry | 253 columns | `data/vhsnd-columns.csv`; `PROJECT_CONTEXT.md` §1.4 |
| Schema fields | 129 (14 select-multiple groups) | `src/schema/versions/v2026-1.ts` |
| Cross-field rules | 37 (11 error / 23 warning / 3 info) across 24 distinct codes | `src/schema/engine/validate.ts:60-83` |
| Indicators | 21 | `src/schema/indicators.ts:42-94` |
| Comparisons | 21 across 6 categories | `src/lib/comparisons.ts:320-1090` |
| Chart kinds rendered | 18 (14 via recharts, 4 hand-drawn SVG) | `src/components/ChartCanvas.tsx:42`, `:208-213` |
| Source files / tests | 50 in `src/` · 19 test files / 212 tests | file listing; `PROJECT_CONTEXT.md` §15.1 |
| Backend services | **0** | `PROJECT_CONTEXT.md` §7.1 |

---

## 2. The problem it solves

Frontline health workers fill in a supervision form for VHSND camps and PMSMA visits. The form is
collected with an ODK-style app and exported as a spreadsheet. Three things then go wrong
(`README.md` Part A).

**Problem 1 — the spreadsheet is messy.** Real exports arrive with two or three header rows, Hindi
or translated column titles, sideways (transposed) layouts, and columns that do not line up with the
official 253-column VHSND form. Analysts end up renaming columns by hand in Excel, and every
re-export invalidates that manual work.

**Problem 2 — the numbers contradict each other.** A row can say "session not held" *and* "38
mothers attended". A supervisor can record fewer women sampled than women diagnosed, or a visit date
after the submission date. In a spreadsheet nobody notices; in a report those numbers get published.

Problem 2 is the one that shapes the whole design: a contradiction cannot be resolved by a
formula, because only a human who knows the district can say whether the session happened and the
register was mis-filled, or the row was entered against the wrong camp. Hence **human adjudication
with a written reason** is not a feature bolted on at the end — it is the centre of the product (§7).

**Problem 3 — provenance.** Even a clean dataset is not defensible if nobody can say who changed
what, and why. The application records every decision with a timestamp and a justification, and
seals the final report with a SHA-256 manifest (`src/export/reportContext.ts:64-119`).

---

## 3. Who it is for

| Audience | Need | Where the app serves it |
|---|---|---|
| District / block health officials | Clean an ODK export and produce a defensible report **without uploading health data** | The whole four-stage flow; encryption at rest (`src/lib/crypto.ts:18-82`) |
| Programme reviewers and auditors | Reconstruct *why* each row was kept, dropped or overridden | Audit log in every export (`src/export/reportContext.ts:65-74`) plus the SHA-256 manifest (`:111-118`) |
| Data engineers | Extend the schema, rules, indicators and comparisons through a typed DSL rather than ad-hoc code | `src/schema/dsl.ts`, `src/schema/versions/v2026-1.ts`; recipes in [`DATA-MODEL.md`](DATA-MODEL.md) |

**Not verified from the current repository:** no user research, persona document, stakeholder list or
support ticket exists in the repo. The audience table above is inferred from the code's purpose and
from `README.md` Part A; it is not validated research.

---

## 4. Scope reality: only `vhsnd` exists

This must be stated plainly, because the product name promises two survey types and only one is
built.

| Dataset kind | Status | Evidence |
|---|---|---|
| `vhsnd` | **Implemented** — the only registered schema | `SUPPORTED_DATASET_KINDS = ["vhsnd"]` (`src/schema/index.ts:5`); schema at `src/schema/versions/v2026-1.ts` |
| `pmsma` | **Type only — not implemented** | `export type DatasetKind = "vhsnd" \| "pmsma";` (`src/contracts/dataset.ts:13`). There is no `pmsma` schema, no column registry, no rules, no indicators, and no UI entry point |

Concretely, `pmsma` today means exactly this: a second string literal in a TypeScript union
(`src/contracts/dataset.ts:13`). `getDatasetSchema(version, "pmsma")` would throw
(`src/schema/index.ts:20-25`). `PROJECT_CONTEXT.md` §16.1 lists this as the first
**partially implemented** feature: *"The product name promises two survey types; only one exists.
Users expecting PMSMA support will find nothing."*

Two related scope statements, also plainly:

- **`MISSING_REQUIRED` never fires.** The `required: true` flag on field `B8`
  (`src/schema/versions/v2026-1.ts:178`) has no producer anywhere in `validate.ts`; it is referenced
  only by tests (`tests/sample-data.test.ts:63`, `tests/engine/validate.test.ts:129-131`).
  `PROJECT_CONTEXT.md` §16.1.
- **Re-importing a corrected file strands every decision.** A new import always mints a fresh
  `crypto.randomUUID()` dataset id (`src/stores/datasetStore.ts:42`), so adjudications do not carry
  over. `PROJECT_CONTEXT.md` §16.1.

---

## 5. How a user actually uses it

The navigation is a four-step rail defined in `src/components/AppShell.tsx:8-13`. The landing page
`/` is a stage directory and dataset picker, not part of the flow.

```
/  →  /ingest  →  /review  →  /viz  →  /report
```

### Stage 1 — Ingest (`src/app/ingest/page.tsx`)

The user drops a single `.xlsx`, `.xls`, `.ods` or `.csv` file onto a drop zone. The extension is
guarded before any work starts (`src/app/ingest/page.tsx:146-151`). The raw `ArrayBuffer` is kept
in component state so the same file can be re-read without re-picking it (`:156-162`).

Behind the scenes the worker resolves three hard problems:

| Problem | Mechanism | Citation |
|---|---|---|
| "Which row holds the codes?" | `detectHeaderLayout` scans rows 1–3 for the form's own code row (≥90 % known codes); falls back to a repeated-label row, then a single label row | `src/schema/engine/normalize.ts:355-408` |
| "The export is sideways" | `detectTransposed` requires ≥30 rows, a ≥2:1 row:column ratio and two independent signals | `src/schema/engine/normalize.ts:322-344` |
| "The titles are Hindi, numbered or free text" | A five-step resolution ladder: exact code/label → embedded code token → numbering-stripped label → fuzzy Dice match → narrow near-word match. Ambiguous ties are **rejected, not guessed** | `src/schema/engine/headerNormalizer.ts:419-437` |

Titles the schema could not place are surfaced to the user as an explicit mapping card — one
`<select>` per unmatched title across all 253 columns (`src/app/ingest/page.tsx:324-379`). The
choice is saved against the file name and replayed on the next read of the same file.

### Stage 2 — Review (`src/app/review/page.tsx`)

Violations are deduplicated by `${rowId}|${code}|${fieldId ?? ruleId}|${rawValue}`
(`src/contracts/violation.ts:42`), filtered by severity, and listed. Opening a row opens the
`RowDrawer`, where the user records one of three decisions: **keep** the row (optionally
acknowledging specific error codes, or all of them), **drop** the row, or **override** a field
value. **Drop and override both require a written justification** — the drawer refuses to save
without one (`src/components/RowDrawer.tsx:62`), and the override value is re-coerced through the
schema before it is written (`src/components/RowDrawer.tsx:113-116`).

"Still pending" is defined precisely: an `error`-severity violation whose row is undecided, or kept
without acknowledging that code (`src/lib/derive.ts:74-90`). A hard gate blocks the next stage while
any unresolved error remains — the "Continue to Visualise" button is disabled, not merely
discouraged (`src/app/review/page.tsx:146-153`).

### Stage 3 — Visualise (`src/app/viz/page.tsx`)

The user picks one of 21 indicators or 21 comparisons, optionally overrides the recommended chart
kind and picks a palette. Two honesty mechanisms operate here. **The partial-comparison gate:** a
comparison whose input columns the file does not contain is **not drawn** until the user explicitly
opts in, so a truncated file can never be read as a smaller result
(`src/app/viz/page.tsx:335-366`). **No bare percentages:** every series point carries a `unit` and a
`detail` string such as *"9 of 20 sites"*, so numerator and denominator are always visible
(`src/lib/comparisons.ts:71-94`).

"Add to report" rasterises the live chart node to a PNG at `pixelRatio: 2` on a white background
(`src/app/viz/page.tsx:126-158`) and stores both metadata and encrypted blob.

### Stage 4 — Report (`src/app/report/page.tsx`)

Export is blocked while any unresolved error exists or the cleaned set is empty
(`src/app/report/page.tsx:180-191`). Four artefacts are produced in-browser and downloaded as
object URLs:

| Format | Produced by | Notes |
|---|---|---|
| `.pptx` | `src/export/pptxReporter.ts:20-112` | Title slide, cleaning summary, indicators, one slide per saved chart, audit appendix |
| `.docx` | `src/export/docxReporter.ts:13-51` | `docx-templates` with a `{{chartImage blobKey}}` helper; requires the embedded template |
| Cleaned `.csv` | `src/export/csv.ts:17-30` | Header is `Label (CODE)`; booleans as `1`/`0`; CRLF endings |
| Audit `.json` | `src/app/report/page.tsx:87-91` | The full `ReportContext`, manifest included |

The same screen also offers **Erase all local data**, which deletes every database whose name
starts with `vhsnd-pipeline` or `pipeline-crypto` (`src/app/report/page.tsx:129-134` →
`src/lib/storage/idb.ts:260-273`).

---

## 6. Value proposition

| For the health official | For the reviewer / auditor |
|---|---|
| No upload, no account, no internet, no server | Every decision is reconstructable: who decided, when, and why |
| Column renaming is automatic instead of manual | A SHA-256 manifest ties a delivered report to a specific cleaned dataset |
| Contradictions are surfaced before they reach a slide | Missing input is disclosed ("Cannot show this in full") rather than silently defaulted |
| Work survives a closed tab — state is persisted locally | The audit trail travels inside every export, including the PPTX appendix |

The honest summary: the product's value is **not** faster spreadsheets. It is the conversion of an
unattended, unprovable spreadsheet into a **defensible, self-audited artefact** — produced without
ever moving the health data off the machine.

---

## 7. Design principles

Five principles explain the majority of the codebase's decisions. Each is stated here with the
mechanism that implements it.

### 7.1 Offline-first, and there is no server

The build is a static export (`next.config.ts:4-6`); every page carries `"use client"`; there is no
API tier, no middleware, no auth. The two CPU-heavy stages — SheetJS parsing and the contradiction
engine — run in **Web Workers** with a 120-second timeout and an inline fallback
(`src/lib/workers.ts:26-186`). Because a static export has no server to issue CSP nonces, the CSP
must permit `'unsafe-inline'` and `'unsafe-eval'` in `script-src`; the compensating control is that
no untrusted input is ever rendered as markup (`src/app/layout.tsx:12-15`).

### 7.2 Data never leaves the device

Two independent controls enforce this. **Runtime:** `connect-src 'self' data: blob:`
(`src/app/layout.tsx:19`) means no remote origin is connectable at all. **Build time:**
`scripts/check-offline.mjs:18-34` scans every emitted `.js`/`.html` file for absolute `https?://`
URLs and remote `src`/`href` attributes and exits non-zero on a hit, so a shipping artefact that
could phone home is refused.

### 7.3 Honesty about partial data

The single most repeated design idea in the codebase. A truncated export must never be mistaken for
a clean one.

- **`presentColumns`** distinguishes *"the file does not have this column"* from *"the file has it
  and nobody filled it"*. Every clean row carries the codes the source file physically held
  (`src/lib/derive.ts:54-58`, `src/contracts/resolution.ts:19-29`). `columnsMissing` is built from
  it, so "Not in this file" names columns the file genuinely lacks, never a carried-but-empty column
  (`src/lib/comparisons.ts:44-48`).
- **The partial-comparison gate** withholds a chart entirely until the user opts in, and the
  rendered chart then carries an explicit "Partial view" line (`src/app/viz/page.tsx:335-366`).
- **Collapsed columns are reported, not silently merged**, with a `cause` that distinguishes the
  file's fault from the tool's (`src/schema/engine/normalize.ts:508-535`;
  `src/lib/ingestCopy.ts:11-24`).
- **Blank cells raise nothing at all** (`src/schema/engine/validate.ts:119-123`) — silence is
  reserved for "no data", never for "we did not check".

### 7.4 Human adjudication with justification

The machine detects; a person decides; the reason is mandatory and travels with the data. `drop`
and `override` cannot be saved without a written reason (`src/components/RowDrawer.tsx:62`), and
override values are re-coerced through the schema on save, so a human correction cannot smuggle in
a value the field type forbids (`src/components/RowDrawer.tsx:113-116`). Every non-pending
resolution is written into the audit sorted by `decidedAt`
(`src/export/reportContext.ts:65-74`), and the audit is embedded in **every** export format,
including the PPTX appendix (`src/export/pptxReporter.ts:20-112`).

### 7.5 Never lose a decision, never invent a value

- **Ambiguity is rejected, not guessed.** Fuzzy header ties are refused rather than resolved
  arbitrarily (`src/schema/engine/headerNormalizer.ts:343-371`); unmatched titles are handed back
  to the user (`src/app/ingest/page.tsx:324-379`).
- **A rule that throws must not crash an import.** It degrades to a `RULE_EVALUATION_ERROR` finding
  (`src/schema/engine/validate.ts:72-82`).
- **Missing input silently disables dependent rules, and that is a known, documented risk** — with
  a label-headed file the parser may recognise only ~90 of 253 columns, `referenceDate` returns
  `null` (`src/schema/engine/validate.ts:32-39`), and the whole cross-field rule set reports zero
  findings while the UI says "0 errors". `PROJECT_CONTEXT.md` §16.3 rates this the highest-consequence
  open issue in the repository.
- **A rule registry is data, not code.** `MISSING_REQUIRED` is declared but has no producer — an
  example where the declaration outran the implementation (§4).

---

## 8. What this application is not

Stated explicitly so no reader over-reads the scope:

| Not present | Evidence |
|---|---|
| A server, API, or database server | `next.config.ts:4`; `PROJECT_CONTEXT.md` §7.1 |
| Authentication, multi-user support, roles, or permissions | no auth code in `src/`; `PROJECT_CONTEXT.md` §14.3 |
| Telemetry, analytics, error reporting, or any third-party service | no remote origin in source; `PROJECT_CONTEXT.md` §10.1 |
| A service worker / installable PWA | no SW registration anywhere in `src/`; `PROJECT_CONTEXT.md` §2.2 F27 |
| Key backup, passphrase, or key rotation | `src/lib/crypto.ts:59-82`; `PROJECT_CONTEXT.md` §14.4 |
| `pmsma` support | `src/schema/index.ts:5`; `src/contracts/dataset.ts:13` |
| CI/CD, coverage reporting, e2e/browser tests | no CI config; no coverage provider in `vitest.config.ts`; no Playwright/jsdom/RTL; `PROJECT_CONTEXT.md` §16.6 |
| A documented hosting target or production URL | `PROJECT_CONTEXT.md` §13.2 — **Not verified from the current repository.** |

The app also **cannot be opened from the filesystem**: Next.js emits root-absolute `/_next/...`
asset URLs and `crypto.subtle` is unavailable in a `file://` origin, so the export must be served
over HTTP(S) or from `localhost` (`PROJECT_CONTEXT.md` §13.4).

---

## 9. Where to read next

| Question | Document |
|---|---|
| Which dependency does what, and where? | [`02-technology-stack.md`](02-technology-stack.md) |
| Where does each file live, and what regenerates it? | [`03-project-structure.md`](03-project-structure.md) |
| How does the pipeline flow, stage by stage? | [`PIPELINE.md`](PIPELINE.md) |
| What are the 253 columns, the 37 rules, the 21 indicators? | [`DATA-MODEL.md`](DATA-MODEL.md) |
| How do I set it up and run the gates? | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| What is known-broken, and what is merely absent? | [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) §16 |
| What is the internal module API? | [`08-api-documentation.md`](08-api-documentation.md) |
