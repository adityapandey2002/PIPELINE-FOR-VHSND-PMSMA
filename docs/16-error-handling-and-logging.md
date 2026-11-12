# 16 — Error Handling and Logging

**Scope:** how this application fails, what it does when it fails, what it shows the user, what it
records, and — stated plainly and up front — **what it does not record at all**.

**Four facts up front:**

1. **There is no error boundary anywhere in the application.** No `error.tsx`, no `global-error.tsx`,
   no `not-found.tsx` — a glob over `src/**` for those filenames returns **no matches**. A render-time
   exception unmounts the whole tree.
2. **The rule engine degrades a throwing predicate into a violation instead of crashing the import**
   (`src/schema/engine/validate.ts:72-82`). This is the most important error-handling decision here.
3. **The coercer fallback in `src/lib/derive.ts:31-36` silently drops schema coercion**, so override
   values can be written unvalidated. This is a **real weakness** and is documented as one in §3.
4. **There is no logging framework, no structured logger, no telemetry and no error-reporting service.
   The only `console.*` call in the entire application is `console.error` at
   `src/app/viz/page.tsx:154`** — verified by searching all of `src/` for `console\.`, which returns
   exactly one match.

Related reading: [`15-security-documentation.md`](15-security-documentation.md) (CSP, encryption, what
"no upload" means), [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md)
(serving), [`13-testing-and-quality.md`](13-testing-and-quality.md) (what is and is not tested),
[`../PROJECT_CONTEXT.md` §16](../PROJECT_CONTEXT.md#16-known-issues-limitations--technical-debt)
(technical debt), [`PIPELINE.md`](PIPELINE.md) (the codemap).

---

## 1. The shape of error handling here

### 1.1 There is no error boundary

A glob for `src/**/{error,global-error,not-found,loading,template}.tsx` returns **no files**.

| Situation | Result |
| --- | --- |
| A component throws during render | React unmounts the whole tree. The user sees a blank page. **No message, no recovery button.** |
| An exception in an async event handler | It becomes an **unhandled promise rejection**. React does not catch it; the UI stays as it was. |
| An exception in a `useEffect` | Same — unhandled rejection, no visible effect. |

The one place a render-time throw is *likely* is `src/components/RowDrawer.tsx:36-39`, which calls
`getDatasetSchema(...)` **outside any try/catch** (§3.4).

### 1.2 Every `catch` in the application

A search of `src/` for `catch` / `try {` / `.catch(` returns 28 matches, resolving to **eight distinct
error-handling sites** — one per pattern below, plus two that are silent by design:

- **E1** `src/schema/engine/validate.ts:61-82` — `try/catch` per rule → a violation (§2).
- **E2** `src/lib/derive.ts:31-36` — `try/catch` → `null` on schema resolution failure (§3).
- **E3** `src/lib/workers.ts:51-58`, `:129-134` — `try/catch` → `worker = null` (§4).
- **E4** `src/workers/parseWorker.ts:87-95`, `src/workers/validateWorker.ts:36-43` — `try/catch` →
  `{ok:false, error}` (§4.3).
- **E5** `src/app/ingest/page.tsx:71-137`, `:163-166` — `try/catch` + `.catch()` → `setError` (§5.1).
- **E6** `src/app/report/page.tsx:61-126` — `try/catch/finally` → `setError` (§5.4).
- **E7** `src/app/viz/page.tsx:129-157` — `try/catch/finally` → `console.error` (§5.3).
- **E8** `src/stores/datasetStore.ts:62-73` — `try/catch` → `set({ error })`, **but the `error` field is
  never rendered** (§5.6).

Two further catches are silent by design: `src/app/viz/page.tsx:118` (`.catch(() => undefined)` on a
thumbnail load) and `src/lib/workers.ts:115`, `:183` (`.catch((err) => reject(err))` on the inline
fallback's dynamic `import`).

### 1.3 The error-message convention

Wherever an error reaches the user it is a plain string derived from `err.message` —
`setError(err instanceof Error ? err.message : String(err))` (`src/app/ingest/page.tsx:136`, `:165`;
`src/app/report/page.tsx:123`; `src/stores/datasetStore.ts:72`). There is no error code, no stack, no
correlation id, and no distinction between a user-facing problem and a programming error. **The user
sees the raw exception message**, which for a library failure can be cryptic (e.g. *"Unsupported
encrypted payload format."* from `src/lib/crypto.ts:32`).

---

## 2. Pattern (a) — a throwing rule degrades into a violation

### 2.1 The code

`src/schema/engine/validate.ts:60-83` — the `try` wraps the **whole** predicate evaluation
(`appliesTo`, `violates` *and* `describe`):

```ts
try {
  if (rule.appliesTo(row, ctx) && rule.violates(row, ctx)) {
    rowViolations.push({ rowId: row.id, ruleId: rule.id, code: rule.code, severity: rule.severity,
                         category: rule.category, message: rule.describe(row, ctx) });
  }
} catch {
  // A throwing rule must never crash validation; deterministic message.
  rowViolations.push({ rowId: row.id, ruleId: rule.id, code: "RULE_EVALUATION_ERROR",
                       severity: "warning", category: "coherence",
                       message: `Rule ${rule.code} could not be evaluated for this row.` });
}
```

### 2.2 What it guarantees

**A row can never crash the import, and the import can never crash the app.**

- The degradation is **deterministic**: the replacement violation always has the same `code`
  (`RULE_EVALUATION_ERROR`), the same `severity` (`warning`), the same `category` (`coherence`) and a
  fixed message naming the rule that failed. Nothing depends on the exception's contents.
- The failure is **counted, not swallowed**: the synthetic violation is pushed into `rowViolations`, so
  it increments `counts.warning` (`:86`), appears in `byRow` (`:85`), and is listed in the review table
  like any other finding.

### 2.3 Why the severity is `warning`, and why that matters

A rule-evaluation failure is a **warning**, not an error. That is deliberate, and it has a direct
consequence: **a broken rule cannot block the report.** `unresolvedErrors`
(`src/lib/derive.ts:74-90`) counts only `severity === "error"`, and the export is blocked only by
unresolved *errors* (`src/app/report/page.tsx:165`, `:180-191`). So if a rule predicate throws for
every row in a dataset, the review screen shows thousands of warnings, the error count stays at zero,
and **the user can still export**.

That is the right trade-off for the stated goal ("never crash validation"), but it should be stated:
**a systematically broken rule fails silently in the sense that it will not stop a report.** The signal
exists, but only as a warning row the user has to notice.

### 2.4 What this pattern does **not** cover

| Not covered | Consequence |
| --- | --- |
| A throw in **pass 1** (`collectFieldViolations`, `:57`) or **pass 2** (`checkGroupSelections`, `:59`) | Neither is inside a `try`. A throw there propagates out of `validateRows` and fails the whole validation run — as `{ok:false, error}` in the worker path (§4.3), or a rejected promise inline. |
| A throw in `rule.describe` for a rule that *did* violate | Covered — it is inside the same `try`, so it produces the same `RULE_EVALUATION_ERROR`. |
| **Silent under-reporting** | The synthetic warning is indistinguishable, to the user, from a genuine rule finding. There is no aggregate "N rules failed to evaluate" counter. |

The behaviour is pinned by a test — *"Rule robustness — a rule that throws degrades to a deterministic
warning instead of crashing"* (`tests/engine/validate.test.ts`, per `PROJECT_CONTEXT.md` §15.2).

---

## 3. Pattern (b) — the coercer fallback to `null` (a **real weakness**)

### 3.1 The code and its own comment

`src/lib/derive.ts:19-38` — the comment states the intent:

> *"Field coercion for a dataset, or null when its schema cannot be resolved. A dataset saved under an
> older schema version must not break the review screen, so callers fall back to leaving values
> untouched."*

The mechanism (`src/lib/derive.ts:31-36`): `built = buildFieldCoercer(getDatasetSchema(dataset.schemaVersion, dataset.kind).fields)`
is wrapped in a `try`, and the `catch` sets `built = null` before caching it in `coercerCache`.
`getDatasetSchema` throws in exactly two situations (`src/schema/index.ts:12-25`):
`Unknown schema version "…"`, or `Schema … has no dataset "…"`.

### 3.2 What it means downstream

`deriveCleanRows` passes the coercer into `applyResolution` (`src/lib/derive.ts:53`:
`applyResolution(row, res, coercer?.coerce)`), and `applyResolution` uses it **only if it is defined**
(`src/contracts/resolution.ts:41-52`) — the `coerce ? … : merged` ternary at `:47-52` returns the
merged values **with no coercion at all** when the coercer is `undefined`. The comment above it
(`:43-44`, *"a stored replacement can never carry a shape its column cannot hold"*) is therefore
**false in this path**.

So when the schema cannot be resolved:

1. **Override values are written into the clean rows completely unvalidated** — the comment on
   `src/contracts/resolution.ts:43-44` ("a stored replacement can never carry a shape its column
   cannot hold") is **false in this path**.
2. The value that reaches the CSV export, the charts and the report is whatever the user typed,
   coerced by nothing.
3. **The failure is invisible.** `built = null` is not logged, not surfaced, not counted. The review
   screen renders normally. There is no "coercion was disabled" indicator anywhere.

### 3.3 Why this is a weakness, stated plainly

| Aspect | Assessment |
| --- | --- |
| **Availability trade-off** | Defensible. A dataset saved under a retired schema version must not brick the review screen — that is what the comment says (`:20-22`), and it is a real failure mode after a schema-version bump. |
| **Integrity** | **Weak.** The fallback is *silent* and disables a validation control rather than degrading the data. A value the schema would have rejected is written through. |
| **Detectability** | **None.** No log line, no UI banner, no counter. An operator has no way to know that overrides in that dataset were written unvalidated. |
| **Scope** | Narrow but real: it affects **every override value in the dataset**, and it affects the exported CSV, the charts and the manifest — the outputs the whole audit trail is supposed to vouch for. |
| **Reachability** | `SCHEMA_VERSION` is `"2026.1"` (`src/schema/index.ts:4`) and `SUPPORTED_DATASET_KINDS` is `["vhsnd"]` (`:5`), so this is reachable in the **future** (a schema bump with no migration path), not today. |

**Honest summary:** a deliberate availability-over-integrity trade-off whose *documentation* is present
(`:19-23`) but whose *consequences* are surfaced to nobody. `PROJECT_CONTEXT.md` §16.3 records it as
*"Error context discarded in one place"*. This document does not soften that.

### 3.4 The same schema call, **unprotected**, one file over

`src/components/RowDrawer.tsx:36-39` calls `buildFieldCoercer(getDatasetSchema(dataset.schemaVersion,
dataset.kind).fields)` inside a `useMemo` — **with no `try/catch`.** `getDatasetSchema` throws for an
unknown version or kind, so under exactly the condition that makes `derive.ts` degrade gracefully, the
drawer **throws during render**. With no error boundary (§1.1), **the entire application tree unmounts**
and the user gets a blank page.

The same failure is therefore handled in one place and unhandled in another — and the unhandled one is
the one that destroys the screen. `PROJECT_CONTEXT.md` §16.3 records the *discarded error* in
`derive.ts`; this **thrown error** in `RowDrawer.tsx` is a separate and more severe instance.

### 3.5 The caching detail

`coercerCache` (`src/lib/derive.ts:24`) is a module-level `Map` keyed by
`` `${schemaVersion}:${kind}` ``. Once a `null` is cached for a key, **every subsequent dataset with
that version+kind gets `null` too** — the failure is sticky for the life of the page.

---

## 4. Pattern (c) — `WorkerUnavailableError` and the worker → inline fallback

### 4.1 The capability probe and the two paths

`src/lib/workers.ts:35-44` — a worker is constructed and immediately terminated purely to test whether
the browser allows it (`canUseWorker`). Construction is itself wrapped in a second `try/catch` at the
call sites (`:51-58`, `:129-134`), so a failure at either point yields `worker = null`.

| | Worker path | Inline fallback |
| --- | --- | --- |
| Trigger | `canUseWorker` true | `canUseWorker` false **or** construction throws |
| Mechanism | `new Worker(new URL("../workers/parseWorker.ts", import.meta.url), { type: "module" })` (`:52-54`); validate at `:130-131` | Dynamic `import("@/workers/parseWorker")` then `parsePayload(...)` on the main thread (`:98-115`); validate at `:168-183` |
| Timeout | 120 000 ms (`:62` parse, `:138` validate) → `reject(new Error("Parse timed out."))` | **None** — the inline path runs to completion |
| Transport | `postMessage`/`onmessage` with `{ok:true,…} \| {ok:false,error}` | A direct promise |
| Same code? | **Yes** — both call the same pure `parsePayload` / `validatePayload` | — |

**The shared-code property is the important one.** The fallback imports *the same function* the worker
runs, so behaviour cannot drift between the two paths (`PROJECT_CONTEXT.md` §4.4). That is why the
fallback is safe to have at all.

### 4.2 The error class

`src/lib/workers.ts:26-33` defines `WorkerUnavailableError extends Error`, whose message is *"Web
Workers are not available in this environment; running the pipeline on the main thread (larger files
may feel slower)."* It is thrown in exactly two places — **only when there is no `window` at all**
(`:92-95`, `:164-167`), where the comment reads *"In Node tests/dev we have no Worker module context;
caller can import parsePayload directly. Reject with a clear signal."*

**In a browser this class is never thrown.** It is the Node/test-environment signal: in Node there is
no `Worker` and no `window`, so the pipeline cannot run in-process; the caller is expected to import
`parsePayload` / `validatePayload` directly. That is exactly why the workers' payloads are written as
pure, directly testable functions (`PROJECT_CONTEXT.md` §4.4).

### 4.3 Failure inside a worker

The worker scope catches everything (`src/workers/parseWorker.ts:87-95`,
`src/workers/validateWorker.ts:36-43`) and posts `{ ok: false, error }`, where `error` is
`err instanceof Error ? err.message : String(err)`. The host turns that into a rejection
(`src/lib/workers.ts:69-72`, `:145-148`: `reject(new Error(msg.error))`). So a SheetJS failure inside
the worker reaches the UI as a plain `Error` whose message is the library's message. A
`worker.onerror` handler (`:75-79`, `:151-155`) covers the case where the worker itself fails to
start, producing `Parse worker error: …`.

### 4.4 What the user is told about a worker failure

**In the ingest screen: the message.** `runParse` / `runValidate` rejections propagate into the
`try/catch` at `src/app/ingest/page.tsx:71-137` and are rendered in the error card (`:228-233`).

**About the fallback itself: nothing.** When the worker cannot be created and the inline path is taken,
**the user is never told.** The pipeline is slower and the UI may stutter, but no message appears —
the `WorkerUnavailableError` text is never shown to anyone, because in a browser the inline path is
taken *instead of* throwing it. `PROJECT_CONTEXT.md` §16.3 lists this as *"Workers are best-effort …
Environments that block module workers silently lose the off-thread benefit and pay it on the main
thread."*

---

## 5. Pattern (d) — the ingest phase error state and the per-page error surfaces

### 5.1 `/ingest` — the phase machine

`src/app/ingest/page.tsx:18`:

```ts
type Phase = "idle" | "reading" | "parsing" | "validating" | "done" | "error";
```

| Transition | Code |
| --- | --- |
| `idle → reading` | `:153` (on drop), `:60` (inside `ingestBuffer`) |
| `reading → parsing` | the `onProgress` callback at `:81` |
| `parsing → validating` | `:83-84` — *"Checking for contradictions…"* |
| `validating → done` | `:133` |
| any → `error` | `:135` (the catch), `:148` (the extension guard) |

The error card (`:228-233`) renders the message under the heading *"Could not import this file"*, in a
card with `borderColor: "var(--error)"` and `background: "var(--error-soft)"`. Two distinct entry
points set it:

1. **The extension guard** (`:146-151`) — a synchronous rejection before any work starts:
   `Unsupported file type ".pdf". Expected .xlsx, .xls, .ods or .csv.`
2. **The pipeline catch** (`:134-137`) — anything thrown by parse, dataset creation, validation or the
   validation-cache write: a `WorkerUnavailableError`, a parse timeout, a SheetJS error, an IndexedDB
   write failure. A second catch guards the `file.arrayBuffer()` promise chain (`:163-166`).

**Note:** the phase string `parsing` is never actually set — the union at `:18` includes it, but the
code goes `reading → validating` (`:60`, `:83`). `busy` at `:202` checks for all three. Harmless, but
the phase union over-declares its states.

### 5.2 `/review` — three states, no error state

| State | Trigger | Rendering |
| --- | --- | --- |
| No dataset selected | `!activeDatasetId` (`:98-104`) | `AppDatasetPicker` |
| Loading | `loading \|\| (dataset && dataset.id !== activeDatasetId)` (`:106-117`) | Spinner + *"Loading dataset…"* |
| Dataset missing | `!dataset` (`:119-127`) | *"Dataset not found."* |
| Normal | otherwise | The full review screen |

**There is no error surface on `/review`.** *"Dataset not found."* (`:123`) is the only failure text,
and it is **misleading**: it renders for *any* falsy `dataset`, including the case where the dataset
exists but failed to decrypt or failed to load (§5.6).

### 5.3 `/viz` — the one `console.error`, and no UI error at all

`src/app/viz/page.tsx:126-158` — `handleAddToReport` wraps the whole capture in
`try { … } catch (err) { console.error("Chart capture failed:", err); } finally { setCapturing(false); }`
(`:153-157`). The captured work is `toPng(chartRef.current, { pixelRatio: 2, backgroundColor: "#ffffff",
cacheBust: true })` (`:130-134`), the `data:` URL is turned into a blob by `fetch(dataUrl)`
(`:135`), and the result is written by `addChart(...)` (`:148-152`).

**This is the weakest error surface in the application.** A chart capture failure — a tainted canvas, a
failed `toPng`, an IndexedDB write failure on the blob — is written to the browser console and
**nothing else**. The button stops saying *"Capturing…"* and returns to *"Add to report"*. The user has
no idea the capture failed, and `addChart` never ran, so no chart was added — **silently**.

There is also **no error state for the page itself**: like `/review`, `/viz` has loading / not-found /
normal states only (`:160-187`).

### 5.4 `/report` — the export error surface

`src/app/report/page.tsx:34-36` declares `error` state, cleared at the start of each export (`:59`),
set in the catch (`:122-123`), and rendered at `:210-212` as a red line under the download buttons
(`<p className="small" style={{ color: "var(--error)", marginTop: 12 }}>{error}</p>`).

`doExport` wraps the whole export in `try/catch/finally` (`:61-126`), so any failure in
`buildReportContext`, `cleanRowsToCsv`, `generatePptxReport`, `renderDocxReport` or `loadChartBlob`
surfaces as that line. The `finally` at `:124-126` always clears `running`, so the buttons never get
stuck showing *"Building…"*.

The one **expected** failure is thrown deliberately (`:100-102`): *"No official .docx template has been
installed yet. Drop one into templates/ and re-run npm run embed:templates."* — though in practice the
DOCX button is *disabled* when there is no template (`:200`), so this path is only reachable if the
template disappears between render and click.

### 5.5 `/` — a silent, unhandled failure

`src/app/page.tsx:47-55` calls `listDatasets().then((d) => { if (alive) setDatasets(d); });` inside a
`useEffect` — **there is no `.catch()`**. If `listDatasets()` rejects — IndexedDB unavailable, the
database blocked by another tab, a decryption failure (`src/lib/storage/idb.ts:104-105` calls
`decryptString`, which throws on a bad payload or a failed GCM tag check) — the rejection is
**unhandled**, nothing is logged, and the page renders its empty state *"No datasets on this machine
yet."* (`:97-101`).

**The user is told the machine has no datasets when the truth may be that they could not be read.**
That is a misleading error surface, and the most likely one a user will actually meet after a browser
update or a profile migration.

### 5.6 Failures that are **not** surfaced anywhere

| Failure | Where | What the user sees |
| --- | --- | --- |
| **Dataset load failure** (decrypt error, missing database) | `src/stores/datasetStore.ts:62-73` catches it and sets `{ loading: false, error }` | **Nothing.** The store's `error` field (`datasetStore.ts:26`, `:38`) is **never read by any component** — no page selects `s.error` (verified across all five pages). The page falls through to *"Dataset not found."* (§5.2) |
| **Re-validation failure** | `src/app/review/page.tsx:77-96` — `try { … } finally { … }` with **no `catch`** | **Nothing.** An unhandled rejection; the button returns to *"Re-run validation"* as if nothing happened, and the cached validation is left in place. |
| **Chart thumbnail load failure** | `src/app/viz/page.tsx:118` — `.catch(() => undefined)` | **Nothing.** The thumbnail slot keeps spinning forever (`:448`). |
| **Decision save failure** (IndexedDB write) | `src/components/RowDrawer.tsx:83`, `:99`, `:117` — `await setResolution(…)` with **no `try/catch`** | **Nothing.** An unhandled rejection; the drawer never closes (`onClose()` at `:91`/`:106`/`:125` is never reached), and the decision is not saved. |
| **Wipe failure** | `src/app/report/page.tsx:131` — `await eraseAllLocalData()` with **no `try/catch`** | **Nothing.** An unhandled rejection; `setCleared`/`router.push("/")` at `:132-133` are never reached. |
| **Render-time throw** | `src/components/RowDrawer.tsx:37` (§3.4) | **A blank page** — no error boundary (§1.1). |

---

## 6. Pattern (e) — the export block conditions

### 6.1 The two conditions

`src/app/report/page.tsx:165`:

```ts
const blocked = unresolved > 0 || clean.rows.length === 0;
```

`unresolved` comes from `unresolvedErrors(validation.violations, resolutions).length`
(`src/app/report/page.tsx:50-53`); `clean.rows` from `deriveCleanRows` (`:45-48`). The banner at
`:180-191` names which condition applies — `` `${unresolved} unresolved error(s) must be fixed before a
report can be generated.` `` or *"The cleaned dataset is empty; import a dataset and review it first."*
— plus a link back to `/review` (`:187-189`).

| Button | Blocked by `blocked`? | Cite |
| --- | --- | --- |
| Slide deck (PPTX) | **Yes** | `:197` |
| Official letter (DOCX) | **Yes** | `:200` |
| Cleaned data (CSV) | **Yes** | `:203` |
| Audit log (JSON) | **No** — only `running !== null` | `:206` |

**The audit JSON is deliberately not blocked.** It is the raw accountability record — the audit list,
the summary, the manifest — and it is most useful *precisely when* the review is unfinished. The
consequence: **the JSON export can be produced from a dataset with unresolved errors**, and its
`summary.unresolvedErrors` field (`src/export/reportContext.ts:103`) records that fact.

### 6.2 The DOCX-specific condition

The DOCX button has a third, independent block (`:200`):
`disabled={blocked || running !== null || !docTemplate}`, with the tooltip *"Install a template in
templates/ first."* and a label of *"DOCX (template pending)"* (`:201`). This is the one place the UI
states a *configuration* problem rather than a data problem.

### 6.3 The upstream block

`/review` blocks the move to `/viz` the same way (`:146-153`): the "Continue to Visualise" button is
`disabled={unresolved.length > 0}` with the tooltip `` `${unresolved} unresolved error(s) block this
step.` ``, and `onClick={() => router.push("/viz")}`.

So the chain is: **`/review` blocks `/viz` on unresolved errors; `/report` blocks the substantive
exports on unresolved errors *or* an empty clean set.** `/viz` itself does **not** block — the
"Continue to Report" button (`src/app/viz/page.tsx:199-201`) is always enabled, so a user can reach
`/report` and see the block banner there. That is deliberate (the user should see *why* they cannot
export rather than being silently prevented from navigating), but it means `/viz` can display charts
derived from rows that still carry unresolved errors.

---

## 7. Logging

### 7.1 There is no logging framework

State this plainly, because it changes what an operator can do:

| Thing | Status | How verified |
| --- | --- | --- |
| A logging library (pino, winston, loglevel, …) | **Absent** | `package.json:20-33` — the dependencies are `docx-templates`, `html-to-image`, `idb-keyval`, `next`, `pptxgenjs`, `react`, `react-dom`, `react-dropzone`, `recharts`, `xlsx`, `zod`, `zustand`. No logger. |
| A structured logger module in `src/` | **Absent** | No `logger.ts`. `src/lib/` holds `comparisons.ts`, `crypto.ts`, `derive.ts`, `ingestCopy.ts`, `insights.ts`, `workerScope.ts`, `workers.ts`, `storage/idb.ts` — no logging module. |
| A log level, a log format, a log sink | **Absent** | — |
| An error-reporting service (Sentry, Bugsnag, Rollbar, …) | **Absent** | No such dependency; no `dsn`, no init call. |
| Analytics / telemetry | **Absent** | `PROJECT_CONTEXT.md` §10.1 — *"no analytics, no telemetry, no error reporting"*. |
| A persisted application log | **Absent** | The only persisted state is the six encrypted object stores (`src/lib/storage/idb.ts:25`). No log store exists. |
| Server-side logging | **Not applicable** | There is no server (`next.config.ts:4`). |

### 7.2 The one `console` call in the whole application

Searching all of `src/` for `console\.` returns **exactly one match**:

```
src/app/viz/page.tsx:154:      console.error("Chart capture failed:", err);
```

Two things follow:

1. **Every other failure in the application is invisible after the fact.** There is no trail. When the
   user reports "the app did something wrong", there is nothing to inspect — not in the console
   (except for chart capture), not on disk, not anywhere.
2. **The one place that does log is a user-facing failure with no user-facing message** (§5.3). The
   information goes to a developer tool the health official does not have open.

> The build scripts do log — `scripts/check-offline.mjs:14`, `:30`, `:32`, `:35` — but those are
> **build-time** Node scripts, not the application.

### 7.3 What stands in for logging

Three substitutes, in order of usefulness. **The violation list** (`src/contracts/violation.ts`) gives
every finding the engine produced — row id, code, severity, message — and is embedded in every export
(`src/export/reportContext.ts:65-74`); but it records *data* findings, not *program* errors, so the
only internal error in it is `RULE_EVALUATION_ERROR` (§2.2). **That violation** is the only
self-reported internal error in the system, and it covers only cross-field rule predicates (§2.4).
**The on-screen error strings** are the last error the user saw, in the ingest card or the export card
— ephemeral, gone on navigation, not persisted.

---

## 8. What happens to user data when something fails

### 8.1 Nothing is uploaded

An error changes nothing about egress. `connect-src 'self' data: blob:` (`src/app/layout.tsx:19`) is a
runtime policy that does not relax on failure, and there is no `fetch` to a remote origin anywhere in
`src/` (the only `fetch` is `src/app/viz/page.tsx:135`, reading a local `data:` URL). **A failed
import does not send the half-parsed file anywhere.** The buffer lives in memory
(`src/app/ingest/page.tsx:31`, `:159`) and in the worker's `postMessage` transfer
(`src/lib/workers.ts:89`), and is discarded when the page unloads.

### 8.2 Each IndexedDB operation is its own transaction

`src/lib/storage/idb.ts:47-49` opens a transaction per operation —
`openDB().then((db) => db.transaction(store, mode).objectStore(store))`. Every helper — `storeSet`
(`:59-66`), `storeGet` (`:68-71`), `storeDelete` (`:73-80`), `storeKeys` (`:82-85`) — opens **its own
single-store transaction** and resolves on that request's `onsuccess` or rejects on its `onerror`.
There is no multi-store `db.transaction([…], …)` anywhere.

**Consequence:** a failed write leaves **nothing half-written**. IndexedDB transactions are atomic per
transaction, so a rejected `put` rolls that store's write back entirely, and a crash mid-write cannot
leave a record half-updated.

### 8.3 But there is **no cross-store atomicity**

Because each store is a separate transaction, a sequence spanning several stores is **not atomic**:

| Operation | Span | What a mid-sequence failure leaves behind |
| --- | --- | --- |
| `deleteDataset(id)` (`idb.ts:119-123`) | `ds` then `res` — **two transactions** | The snapshot is deleted and the resolutions are not: an orphaned decisions map. |
| `addChart(...)` (`src/stores/chartStore.ts:49-63`) | `blob` then `chart` — **two transactions** | An orphaned encrypted PNG with no metadata pointing at it. It is never garbage-collected. |
| `deleteChart(id)` (`idb.ts:166-173`) | `blob` then `chart` | A chart metadata record pointing at a **missing blob**. `loadChartBlob` then returns `null` (`idb.ts:182`) and the PPTX exporter substitutes an empty blob (`src/app/report/page.tsx:94`). |
| `eraseAllLocalData()` (`idb.ts:260-273`) | One `deleteDatabase` per database, under `Promise.all` | If one deletion is `onblocked` it **resolves as success** (`:270`), so the app reports "Local data erased" while a database survives. |
| `createDataset` + `setValidation` (`src/app/ingest/page.tsx:85`, `:94`) | `ds` then `validation` — **two transactions** | A dataset with **no cached validation**. The review screen then shows zero violations, because `loadValidation` returns `null` (`idb.ts:201-203`) and `validation?.violations ?? []` (`src/app/review/page.tsx:46`) yields an empty list. **A failed validation-cache write therefore looks like a clean dataset.** |

**The last row is the most consequential.** It is not hypothetical: `createDataset` awaits `saveDataset`
(`src/stores/datasetStore.ts:55`) and `setValidation` awaits `saveValidation` (`:80-85`) as two
separate transactions, and the ingest flow awaits them separately (`src/app/ingest/page.tsx:85`,
`:94-99`). If the second write fails — quota exceeded, private-mode storage pressure, a blocked
upgrade — the dataset is stored, the validation is not, and the review screen reports no violations.
The user sees *"Imported successfully · 0 errors"* (`src/app/ingest/page.tsx:236-240`).

### 8.4 What is *not* protected at all

| Not protected | Detail |
| --- | --- |
| **The in-memory dataset** | The whole snapshot is held in the Zustand store (`src/stores/datasetStore.ts:56`) *and* on disk. A crash loses the in-memory copy only; the disk copy survives. |
| **A partially-parsed import** | If the parse succeeds but validation throws (§2.4), the dataset has already been written (`src/app/ingest/page.tsx:85` precedes the validation at `:88`). The stored dataset is complete; only the *derived* violation list is missing. |
| **The exported files** | A download that fails mid-write leaves a truncated file in the user's downloads folder. There is no atomic download. |
| **Chart PNGs** | Captured at add-time and stored encrypted (`src/lib/storage/idb.ts:175-178`). A capture failure (§5.3) means no chart — and the failure is invisible. |

---

## 9. Recommendations — **not implemented**

**Nothing in this section exists in the code.** These are proposals, sized honestly.

### 9.1 Error boundary and error surfaces

| # | Recommendation | Would require | Why it matters |
| --- | --- | --- | --- |
| R1 | **Add `src/app/error.tsx`** — a route-level error boundary with a "try again" button and a copyable error code | One new file; Next.js App Router supports `error.tsx` per route segment | Turns a blank page into a recoverable screen. Highest value per line of any recommendation here. |
| R2 | **Add `src/app/global-error.tsx`** — the last-resort boundary for errors in the root layout | One new file | Catches what `error.tsx` cannot (an error in the layout itself). |
| R3 | **Wrap `RowDrawer`'s coercer build** in the same `try/catch` that `derive.ts` uses, and surface "coercion unavailable" as a banner | `src/components/RowDrawer.tsx:36-39` | Closes the blank-page failure in §3.4 and makes the §3 weakness visible. |
| R4 | **Render the `datasetStore.error` field** on `/review` and `/report` instead of the misleading *"Dataset not found."* | `src/app/review/page.tsx:119-127`; `src/app/report/page.tsx:157-163` | The store already captures the message; nothing displays it. |
| R5 | **Add `.catch()` to `listDatasets()`** on the landing page and show an explicit "could not read local datasets" state | `src/app/page.tsx:49-51` | Stops "no datasets" from meaning "could not read datasets" (§5.5). |
| R6 | **Add a `catch` to `handleRevalidate`** and show the failure inline | `src/app/review/page.tsx:77-96` | A failed re-validation currently looks like a successful one. |
| R7 | **Wrap the `await setResolution(...)` calls in `RowDrawer.save()`** and show the failure in the drawer | `src/components/RowDrawer.tsx:83`, `:99`, `:117` | A decision that failed to save currently looks like it saved. |
| R8 | **Make `handleAddToReport` show its error** (the same treatment as `/report`) rather than only logging it | `src/app/viz/page.tsx:153-154` | The one place that logs is the one place the user most needs to be told (§5.3). |

### 9.2 Structured logging

| # | Recommendation | Would require | Notes |
| --- | --- | --- | --- |
| R9 | **A minimal internal logger module** — `src/lib/log.ts` — with levels, a `[stage]` tag and a ring buffer of the last N entries, exposed on a debug screen | One new module + one debug route | A logger is pointless without somewhere to *read* the log. A ring buffer plus a `/debug` route gives the operator (and the next developer) something to send. **It stays local** — it must not become telemetry. |
| R10 | **Log the swallowed failures that currently vanish** — the `derive.ts` coercion fallback (§3.1), the worker→inline transition (§4.4), the `loadChartBlob` rejection (§5.6), and the `onblocked` wipe (§8.3) | One call at each of those four sites | These are the four places where the application currently knows something went wrong and says nothing. |
| R11 | **Tag every log line with a correlation id** (the dataset id, `src/stores/datasetStore.ts:42`) | R9 | Without it, a log from one dataset cannot be distinguished from another. |
| R12 | **Write the log into the encrypted `ui` store**, not `localStorage` | `src/lib/storage/idb.ts:239-252` | The log will contain file names and error text — it must be encrypted like everything else. |
| R13 | **A "Download diagnostics" button** on the report screen that emits the log as a file | One button + `downloadBlob` (`src/export/csv.ts:32-41`) | Lets a user send a diagnostic bundle to a maintainer **without** the data leaving the device — the log would hold error text and ids, not survey values. |

> **Explicitly not recommended:** sending anything to a remote error-reporting service. It would break
> `connect-src 'self' data: blob:` (`src/app/layout.tsx:19`) and fail the offline build gate
> (`scripts/check-offline.mjs:18`), and it would contradict the app's core promise. If diagnostics
> ever leave the device, it must be a **manual, user-initiated download**.

### 9.3 Smaller, surgical fixes

These belong with §9.1 — they are the same class of fix, at a smaller scale.

| # | Recommendation | Would require |
| --- | --- | --- |
| R14 | **Make the ingest import atomic**: write the dataset and its validation cache in one multi-store transaction (`db.transaction(["ds","validation"], "readwrite")`) | `src/lib/storage/idb.ts`; closes the "looks clean but was never validated" hole (§8.3) |
| R15 | **Detect a missing validation cache** and re-validate on load rather than showing zero violations | `src/stores/datasetStore.ts:60-74` |
| R16 | **Make `eraseAllLocalData` report what it actually deleted**, and surface `onblocked` as a warning | `src/lib/storage/idb.ts:260-273` |
| R17 | **Log the worker→inline transition** so a slow session is explainable | `src/lib/workers.ts:90-116`, `:163-184` |
| R18 | **Give `RULE_EVALUATION_ERROR` an aggregate counter** ("12 rows could not be checked") rather than only per-row warnings | `src/schema/engine/validate.ts:74-82`; `src/lib/insights.ts` |

---

## 10. Cross-references

| Concern | Document |
| --- | --- |
| The CSP, encryption at rest, data locality, secrets, gaps | [`15-security-documentation.md`](15-security-documentation.md) |
| Serving requirements, TLS, `file://` | [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) |
| What is and is not tested (the manifest path is not) | [`13-testing-and-quality.md`](13-testing-and-quality.md) |
| The pipeline codemap, stage by stage | [`PIPELINE.md`](PIPELINE.md) |
| Everything about the project, cited | [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) §16 |

**Verified against the working tree at commit `dd9c0bf` (branch `main`).**
