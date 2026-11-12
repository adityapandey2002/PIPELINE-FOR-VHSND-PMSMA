# 17 — Integrations & third-party services

**Scope.** This document answers one question: *does this application talk to anything outside the
browser tab, and if not, what is actually bundled?* It is the companion to
[`PROJECT_CONTEXT.md` §10](../PROJECT_CONTEXT.md) (the summary) and
[`docs/PIPELINE.md`](PIPELINE.md) (the stage-by-stage codemap). Architecture lives in
[`04-system-architecture.md`](04-system-architecture.md); the dependency inventory lives in
[`02-technology-stack.md`](02-technology-stack.md).

**Status legend:** *Implemented* · *Declared but unused* · *Absent — verified*

---

## 1. The headline

**This application integrates with nothing over the network. Not one byte of survey data, and not one
request of any kind, ever leaves the browser origin.**

Concretely, the following do **not** exist anywhere in this repository — verified by source inspection,
by a build gate, and by the Content-Security-Policy the app ships with:

| Category | Status | How it was verified |
|---|---|---|
| HTTP client to any third-party host | **Absent** | No `fetch`/`XMLHttpRequest`/`WebSocket`/`EventSource` call to an absolute URL in `src/`. The only `fetch` in the app reads a `data:` URL (`src/app/viz/page.tsx:135`); see §1.3. |
| Analytics / telemetry / usage reporting | **Absent** | No analytics SDK, no beacon, no `navigator.sendBeacon`, no `gtag`/`analytics`/`sentry`/`datadog` package in `package.json:20-43`. |
| Error reporting / crash reporting | **Absent** | No Sentry/Bugsnag/Rollbar import; the only `console.error` is a local log (`src/app/viz/page.tsx:154`). |
| Authentication / identity provider | **Absent** | No login, session, token, JWT, OAuth or SAML code. `src/contracts/` has no user/session type; `PROJECT_CONTEXT.md` §14.3 records auth as "Not found in codebase". |
| Payment / billing | **Absent** | No Stripe/PayPal/Razorpay dependency; no pricing surface anywhere in `src/app/`. |
| Maps / geocoding | **Absent** | No Leaflet/Mapbox/Google Maps dependency. The "geospatial" indicator type (`src/schema/indicators.ts:57`) is a *grouping dimension* (`B2A`, the block code) computed in JavaScript, not a map. |
| Messaging / chat / notifications | **Absent** | No WebSocket, no push, no email SDK, no SMS gateway. |
| Email / SMS | **Absent** | No `nodemailer`/SendGrid/Twilio dependency; the only "mail" concept is the `.docx` letter (`src/export/docxReporter.ts`), which is a file download, not a message. |
| AI / LLM service | **Absent** | No model SDK, no API key, no inference endpoint. The word "indicator" in this app means a *survey statistic*, not an AI output. |
| Cloud storage / object store | **Absent** | Persistence is browser IndexedDB only (`src/lib/storage/idb.ts:23-25`). |
| CDN / font host / external asset | **Absent** | `img-src 'self' data: blob:`, `font-src 'self' data:` (`src/app/layout.tsx:17-18`); `images.unoptimized: true` (`next.config.ts:7-9`); `public/*.svg` are stock local assets. |
| Server-side runtime | **Absent** | `output: "export"` (`next.config.ts:4`) — the shipped artefact is a static file tree with no Node process. |
| Environment variables / API keys | **Absent** | `process.env` does not appear in `src/`. There is no `.env.example`. |
| Third-party JavaScript loaded at runtime | **Absent** | Every script is same-origin; `script-src 'self' 'unsafe-inline' 'unsafe-eval'` (`src/app/layout.tsx:15`) permits no remote origin. |

### 1.1 Proof one — the shipped Content-Security-Policy

The CSP is injected as an HTML `<meta http-equiv>` in the root layout (`src/app/layout.tsx:10-25`,
injected at `:31`), because a static export has no server to issue a header. The decisive directive:

```
connect-src 'self' data: blob:      ← src/app/layout.tsx:19
```

`connect-src` governs `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `sendBeacon`. With
it pinned to `'self' data: blob:`, the browser itself will refuse any connection to a remote host —
so even if a future contributor added one, it would fail closed rather than silently exfiltrate.

The supporting directives are equally tight: `object-src 'none'` (`src/app/layout.tsx:22`),
`base-uri 'none'` (`:23`), `form-action 'self'` (`:24`), `worker-src 'self' blob: data:` (`:21`).

**Honest caveat.** `script-src` includes `'unsafe-inline' 'unsafe-eval'` (`src/app/layout.tsx:15`),
which is a necessary consequence of a static export with no nonce source and materially weakens the
policy. The compensating control is that no untrusted input is ever rendered as markup — survey values
go through React text nodes, and there is no `dangerouslySetInnerHTML` anywhere in `src/`. A meta-tag
CSP also cannot carry `frame-ancestors` or `report-uri`. See `PROJECT_CONTEXT.md` §14.2.

### 1.2 Proof two — the source itself

A repository-wide grep for `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`,
`axios`, `ky` and `node-fetch` across `src/`, `tests/` and `scripts/` returns **two** hits, and
neither is a network call to a host:

| Hit | Location | What it actually is |
|---|---|---|
| `fetch(dataUrl)` | `src/app/viz/page.tsx:135` | `dataUrl` is the return value of `toPng(...)` at `:130`. `html-to-image`'s `toPng` is implemented as `canvas.toDataURL()` (`node_modules/html-to-image/lib/index.js:127-140`), i.e. it returns a `data:image/png;base64,…` string. `fetch()` on a `data:` URL resolves entirely in-process; **no socket is opened**. It exists only to turn the PNG data URL into a `Blob` for storage. |
| `fetch()` in a comment | `src/export/templates.generated.ts:3` | A generated-file comment explaining that templates are embedded so the app never performs a `fetch()` for them. |

There is no `axios`, `ky` or `node-fetch` dependency in `package.json:20-43` to call in the first
place.

### 1.3 Proof three — the build gate

`scripts/check-offline.mjs` is a fifth gate that runs over the emitted static export and **fails the
build** if it finds anything that could phone home:

```js
const remoteCall = /(?:fetch|WebSocket|EventSource|XMLHttpRequest)\(\s*["'`](https?:\/\/[^"'`]+)/g;  // :18
const scriptSrc = /(?:src|href)=["'](https?:\/\/)/g;                                                        // :19
```

It walks `out/**` (`:46-55`), reads every `.js` and `.html` file (`:23`), scans the first 400 000
characters of each JS bundle (`:25`), and exits non-zero on any match (`:30-34`). The `out/dev`
scratch directory is explicitly skipped (`:51`) because `next dev` writes dev-only tooling there that
is never shipped.

The gate's limit is worth stating plainly: it is a **regex over emitted text**, not a sandboxed
network trace. It would not catch a request assembled at runtime from concatenated parts. It is a
cheap, diff-able guarantee — the script's own header calls it "a cheap, diff-able guarantee that the
artifact cannot phone home" (`:5-6`) — not a proof.

### 1.4 Proof four — there is no server to talk to

`next.config.ts:4` sets `output: "export"`. The build emits a directory of static files
(`out/index.html`, `out/ingest/index.html`, `out/review/index.html`, `out/viz/index.html`,
`out/report/index.html`, `out/_not-found/index.html`) and **no Node process ever serves the app**
(`PROJECT_CONTEXT.md` §13.1). There are no route handlers, no server actions, no middleware, and no
`server*` modules under `src/`.

---

## 2. The integration surface

The complete list of everything the application integrates with, and whether it uses the network.

| # | Integration | Kind | Network use | Where it lives | Notes |
|---|---|---|---|---|---|
| 1 | `xlsx` (SheetJS 0.20.3) | bundled runtime library | **No** | `src/workers/parseWorker.ts:31` | Reads `.xlsx/.xls/.ods/.csv` locally. Installed from the vendored tarball — see §3.1. |
| 2 | `recharts` | bundled runtime library | **No** | `src/components/ChartCanvas.tsx:4-32` | SVG chart rendering in the DOM. |
| 3 | `pptxgenjs` | bundled runtime library | **No** | `src/export/pptxReporter.ts:1` | Builds a `.pptx` byte stream in memory. |
| 4 | `docx-templates` | bundled runtime library | **No** | `src/export/docxReporter.ts:1` | Fills the embedded `.docx` template. |
| 5 | `html-to-image` | bundled runtime library | **No** | `src/app/viz/page.tsx:5` | Rasterises the chart card to a PNG data URL. |
| 6 | `react-dropzone` | bundled runtime library | **No** | `src/app/ingest/page.tsx:5` | Drag-and-drop file input. |
| 7 | `zustand` | bundled runtime library | **No** | `src/stores/*.ts:1` | Client state; the `persist` middleware uses the encrypted local adapter. |
| 8 | `idb-keyval` | bundled runtime library | **No** | `src/lib/crypto.ts:1` | Holds the AES key in its own IndexedDB database. |
| 9 | `zod` | **declared, never imported** | **No** | `package.json:31` only | See §6. |
| 10 | Browser platform APIs | platform, not third-party | **No** | see §7 | Web Crypto, IndexedDB, Web Workers, File/Blob, `URL.createObjectURL`. |
| 11 | `eslint-config-next`, `vitest`, `typescript`, `next`, `eslint`, `@types/*`, `babel-plugin-react-compiler` | build-time toolchain | **No** (build only) | `package.json:34-43` | Dev-time only; never shipped in the bundle. |
| 12 | `jszip` | transitive, used directly by two scripts/tests | **No** | `scripts/make-default-templates.mjs:17`, `tests/docx-template.test.ts:2` | Not declared in `package.json`; it arrives transitively through `docx-templates` (`package-lock.json:3434`). See §6.1. |

**Every row reads "No" in the network column, and that is not an approximation — it is enforced by
§1.1–§1.3.**

---

## 3. The eight bundled runtime libraries

Each subsection states: what it is for, where it is used (`file:line`), what it explicitly does
**not** do, and how it relates to the others.

### 3.1 `xlsx` — SheetJS 0.20.3, installed from a vendored tarball

| | |
|---|---|
| **Version** | 0.20.3 |
| **Declared as** | `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` (`package.json:30`) |
| **Artefact** | `vendor/xlsx-0.20.3.tgz` — 2 409 319 bytes on disk |

**Purpose.** The only way the app reads a spreadsheet. It is loaded *dynamically inside the parse
worker* — `const { read, utils } = await import("xlsx")` (`src/workers/parseWorker.ts:31`) — so the
2.3 MB library is fetched as a separate chunk and parsed off the main thread rather than sitting in
the initial page bundle.

**Where it is used.**

- `src/workers/parseWorker.ts:32-35` — `read(new Uint8Array(payload.buffer), { type: "array", cellDates: true })`.
- `src/workers/parseWorker.ts:43-48` — `utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: true, blankrows: false })`. The `header: 1` option is **load-bearing**: it produces an *array of arrays* instead of an array of objects, which is what stops the form's repeated "Others (Specify)" labels from collapsing into one key and stops a physical code row from being ingested as data. The comment at `:40-42` says exactly this.
- `scripts/make-sample-data.cjs:12`, `scripts/diagnose-workbook.cjs:9`, `scripts/diagnose-workbook.mjs:9`, `scripts/debug-raw.cjs:2` — the same library, used offline to build and inspect fixtures.

**What it does NOT do.** It performs **no** network access. SheetJS's "CDN" distribution mode — where
`XLSX.set_cdn`/`cdn_is` redirects the library to fetch a remote copy — is never enabled anywhere in
this repo; there is no `set_cdn`, `cdn_is` or `cdn_version` call in `src/`. Reading is entirely
in-memory over the `ArrayBuffer` the user dropped.

**Relationship to the others.** `xlsx` is the *only* library that touches user-supplied bytes. It
feeds `src/schema/engine/normalize.ts`, which feeds the coercion and validation layers; it has no
relationship to the charting or export libraries except through the shared `DatasetSnapshot` shape.

**The supply-chain trade-off (important).** Installing from a local tarball rather than the npm
registry is a **deliberate reproducibility / offline-build choice**: the build does not depend on the
registry being reachable, and the exact bits are pinned. The cost is that the tarball **is the
artefact of record** — `package-lock.json` records the `file:` reference, not a registry URL with an
`integrity` hash, so **the provenance of the vendored SheetJS build is not verifiable from
`package-lock.json` alone**. Anyone auditing this repository must obtain the tarball's provenance
out-of-band (e.g. by hashing it against the upstream release). `PROJECT_CONTEXT.md` §10.3 records the
same conclusion.

### 3.2 `recharts`

| | |
|---|---|
| **Version** | `^3.10.1` (`package.json:29`) |

**Purpose.** All fourteen recharts-backed chart kinds.

**Where it is used.** `src/components/ChartCanvas.tsx:4` (types) and `:5-32` (twenty-six named
components: `Area`, `Bar`, `CartesianGrid`, `Cell`, `ComposedChart`, `Funnel`, `LabelList`, `Legend`,
`Line`, `Pie`, `PolarGrid`, `Radar`, `ResponsiveContainer`, `Scatter`, `Tooltip`, `XAxis`, `YAxis`, …).
Four further kinds — `box`, `gauge`, `waffle`, `heatmap` — are hand-drawn SVG and are dispatched
separately (`CUSTOM_KINDS` at `:42`).

**What it does NOT do.** It renders SVG into the DOM. It has no data-source plugin, no server mode,
no telemetry. Every chart is fed from in-memory `series.points`.

**Relationship to the others.** `recharts` is the *consumer* of the output of `src/schema/indicators.ts`
and `src/lib/comparisons.ts`; it knows nothing about the survey. Its output is later rasterised by
`html-to-image` (§3.5) and embedded by `pptxgenjs` (§3.3) and `docx-templates` (§3.4).

### 3.3 `pptxgenjs`

| | |
|---|---|
| **Version** | `^4.0.1` (`package.json:26`) |

**Purpose.** Builds the PowerPoint deck entirely in the browser.

**Where it is used.** `src/export/pptxReporter.ts:1` (import), `:24` (`new PptxGenJS()`), `:108`
(`await pptx.write({ outputType: "arraybuffer" })`), `:109-111` (wrapped in a `Blob`). The deck has
five slide types: title (`:30-41`), cleaning summary (`:44-60`), headline indicators (`:63-69`), one
slide per saved chart (`:72-89`), and the audit appendix (`:92-106`).

**What it does NOT do.** It does not fetch an image to embed: chart images are already local PNG
blobs, converted to a data URL by `blobToDataUrl` using `FileReader` (`:114-121`) and handed to
`slide.addImage({ data: dataUrl, … })` (`:81-85`). No template download, no cloud service, no
licence check.

**Relationship to the others.** Consumes `ReportContext` from `src/export/reportContext.ts` (the
deterministic context + SHA-256 manifest) plus the PNG blobs that `html-to-image` produced.

### 3.4 `docx-templates`

| | |
|---|---|
| **Version** | `^4.15.0` (`package.json:21`) |
| **Runtime dependencies** | `jszip`, `sax` only (`package-lock.json:3433-3436`) |

**Purpose.** Fills a `.docx` template with the report context and the captured chart images.

**Where it is used.** `src/export/docxReporter.ts:1` (`createReport`), `:25-46` (`createReport({ template, data, additionalJsContext, cmdDelimiter: ["{{", "}}"], processLineBreaks: true })`). The `additionalJsContext.chartImage` helper (`:28-43`) resolves a chart `blobKey` to an `ArrayBuffer` plus computed centimetre dimensions, which the template calls via `{{IMAGE chartImage($chart.blobKey)}}`
(`scripts/make-default-templates.mjs:51`).

**What it does NOT do.** The template is **not fetched**. It is embedded in the bundle as base64 by
`scripts/embed-templates.mjs` and read from `src/export/templates.generated.ts:5-11`; the generated
file's own header comment states the app "never performs a `fetch()` for its official templates"
(`src/export/templates.generated.ts:2-3`). If no template is embedded, the export button is disabled
and reads "DOCX (template pending)" (`src/app/report/page.tsx:200-201`).

**Relationship to the others.** It is the only consumer of the embedded-template registry and the only
library that pulls in `jszip` — which the repo also uses directly in
`scripts/make-default-templates.mjs:17` and `tests/docx-template.test.ts:2` (see §6.1).

### 3.5 `html-to-image`

| | |
|---|---|
| **Version** | `^1.11.13` (`package.json:22`) |

**Purpose.** Rasterises the live chart card into a PNG that can be embedded in a deck or a letter.

**Where it is used.** `src/app/viz/page.tsx:5` (import), `:130-134` —
`toPng(chartRef.current, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true })` — inside
`handleAddToReport` (`:126-158`). The result is converted to a `Blob` at `:135` and persisted via
`addChart` (`:148-152`).

**What it does NOT do.** The capture is a **one-time, user-initiated action**, not a render-time
effect. `cacheBust: true` adds a cache-busting query to *same-origin* asset URLs so the clone is
not served from cache; it does not reach a third-party host. And as established in §1.2, the
`fetch(dataUrl)` at `:135` reads a `data:` URL.

**Relationship to the others.** It is the bridge between `recharts`' DOM output and the two document
writers. Because the PNG is frozen at capture time, exports embed the image as it was when the user
clicked "Add to report" — a documented divergence risk (`PROJECT_CONTEXT.md` §16.3).

### 3.6 `react-dropzone`

| | |
|---|---|
| **Version** | `^20.1.2` (`package.json:28`) |

**Purpose.** The drag-and-drop file input on the Ingest screen.

**Where it is used.** `src/app/ingest/page.tsx:5` (`useDropzone`), consumed by `onDrop`
(`:142-169`). The extension guard is **app code, not library behaviour** (`:146-151`): only
`xlsx`, `xls`, `ods` and `csv` are accepted; anything else is rejected with a message before the
file is read.

**What it does NOT do.** It reads the file locally through `file.arrayBuffer()` (`:157`). There is no
upload target, no `useFsAccessApi` network filesystem, no server-side handling. Nothing about the
library implies a network destination; the destination is whatever the application chooses, and this
application chooses none.

**Relationship to the others.** It is the sole entry point for user data, upstream of `xlsx`
(§3.1). It shares no state with the stores.

### 3.7 `zustand`

| | |
|---|---|
| **Version** | `^5.0.15` (`package.json:32`) |

**Purpose.** Client-side state for the four stores.

**Where it is used.** `src/stores/workflowStore.ts:1`, `src/stores/datasetStore.ts:1`,
`src/stores/resolutionStore.ts:1`, `src/stores/chartStore.ts:1`. Only `workflowStore` uses the
`persist` middleware, and it is wired to the **encrypted local adapter**, not to `localStorage`:
`createJSONStorage(() => createEncryptedStorage())` (`src/stores/workflowStore.ts:24`), where
`createEncryptedStorage` is defined in `src/lib/storage/idb.ts:239-252` and encrypts every value with
AES-GCM before it is written to the `ui` object store.

**What it does NOT do.** It performs no network I/O; the default `localStorage` adapter is not used.
It has no devtools server, no remote sync, no persistence middleware beyond the one above.

**Relationship to the others.** `zustand` is the glue between `src/lib/storage/idb.ts` (persistence),
`src/lib/crypto.ts` (encryption) and the pages. It holds the `DatasetSnapshot` in memory, which is
why the app's peak memory is roughly twice the dataset size — see
[`19-performance-and-scalability.md`](19-performance-and-scalability.md).

### 3.8 `idb-keyval`

| | |
|---|---|
| **Version** | `^6.3.0` (`package.json:23`) |

**Purpose.** A tiny promise wrapper over IndexedDB, used for exactly one thing: holding the AES key.

**Where it is used.** `src/lib/crypto.ts:1` (`createStore`, `get`, `set`), `:3`
(`createStore("pipeline-crypto", "keyval")`) — a **separate database** from the application's own
`vhsnd-pipeline` database (`src/lib/storage/idb.ts:23`) — and `:4` (`KEY_NAME = "app-key-v1"`).
Read at `:63`, written at `:79`.

**What it does NOT do.** It performs no network access and no encryption itself; it stores the raw
key bytes, and the encryption happens in `src/lib/crypto.ts` via `crypto.subtle` (Web Crypto, a
browser built-in — not a third-party service).

**Relationship to the others.** It is deliberately **not** the same storage layer as
`src/lib/storage/idb.ts`. The app's own data goes through a hand-rolled versioned IndexedDB wrapper
(`idb.ts:30-45`) with explicit `onupgradeneeded` store creation, because `idb-keyval`'s `createStore`
pins every database at version 1 and cannot upgrade an existing store set — the rationale is written
out in the file's header comment (`src/lib/storage/idb.ts:5-13`). The split means
`eraseAllLocalData()` can delete the key database and the data database together
(`idb.ts:260-273`), and it means the key is never co-located with the ciphertext in one store.

---

## 4. How the libraries relate to one another

```
user file
   │  react-dropzone            (src/app/ingest/page.tsx:5)
   ▼
ArrayBuffer ──► xlsx (dynamic import, inside the worker)
   │               src/workers/parseWorker.ts:31-48
   ▼
normalizeAoa / headerNormalizer / cellCoercers
   ▼
validateRows ──► DatasetSnapshot
   │                 │
   │                 ├─► zustand store (in-memory)  ─► idb-keyval (AES key)
   │                 └─► idb.ts (encrypted IndexedDB)
   ▼
indicators.ts / comparisons.ts
   ▼
recharts ──► DOM chart ──► html-to-image ──► PNG Blob
   │                                            │
   ▼                                            ▼
ReportContext ────────────────────────► pptxgenjs  /  docx-templates
 (SHA-256 manifest)                        (local .pptx / .docx bytes)
```

Three observations worth stating:

1. **The data path never touches the network layer.** Every arrow above is a function call, an
   IndexedDB transaction, or a `Blob`/`ArrayBuffer` hand-off.
2. **Two libraries are deliberately loaded late.** `xlsx` is dynamically imported inside the worker
   (`src/workers/parseWorker.ts:31`); `docx-templates` is imported statically but only consumed on
   the Report screen (`src/export/docxReporter.ts:1`). Neither is required to render the landing page.
3. **The export libraries are only reachable through the report context**, which carries the
   SHA-256 manifest (`src/export/reportContext.ts:111-118`). This keeps the audit binding in one
   place instead of being re-derived per format.

---

## 5. Build-time tools

These never ship in the browser bundle; they exist to build, type-check, lint and test it.

| Tool | Version | Role | Where it is configured |
|---|---|---|---|
| `next` | `16.3.6` (`package.json:24`) | Framework + static export | `next.config.ts:3-11` |
| `typescript` | `^5` (`package.json:37`) | Type checking (`strict`, `noEmit`) | `tsconfig.json` |
| `eslint` + `eslint-config-next` | `^9` / `16.3.6` (`package.json:36,40`) | Lint rules, flat config | `eslint.config.mjs:5-24` |
| `vitest` | `^5.0.1` (`package.json:42`) | Unit test runner | `vitest.config.ts:4-15` |
| `@types/node`, `@types/react`, `@types/react-dom` | `^24.13.6` / `^19` (`package.json:35-37`) | Type declarations | — |
| `babel-plugin-react-compiler` | `^1.0.0` (`package.json:38`) | React Compiler transform | enabled via `reactCompiler: true` (`next.config.ts:10`) |

None of these are "integrations" in the product sense: they run on a developer machine or a CI
runner, they have no runtime component, and none of them is given a third-party service account or
API key. There is no `.env`, no secret, and no credential anywhere in the repository.

`eslint-config-next` is worth a single line of its own: the flat config at `eslint.config.mjs:5-24`
extends `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`, and adds one
override that disables `@typescript-eslint/no-require-imports` for `**/*.cjs` (`:8-15`) because the
Node maintenance scripts are CommonJS by extension. That override is direct evidence that the `.cjs`
scripts are intended to use `require` — a fact that matters in
[`18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md).

---

## 6. `zod` — declared, never imported

`"zod": "^4.6.5"` appears in `package.json:31`. A grep for `from "zod"` / `require("zod")` across
`src/`, `tests/` and `scripts/` returns **no matches**. The schema system uses its own DSL
(`src/schema/dsl.ts`) — `group`, `rule`, `yesNo`, `ordinalField`, `countWithSentinel`, `count`,
`date`, `text` — and its own canonical projection (`projectSchema`, `stableStringify`).

### 6.1 A correction to the record

`PROJECT_CONTEXT.md` §3.3 and `docs/PIPELINE.md` §6.2 both state that `zod` "is also a transitive
dependency of `docx-templates`". **That is not what the lock file says.** The `docx-templates`
entry declares exactly two runtime dependencies — `jszip` and `sax`
(`package-lock.json:3433-3436`) — and the installed package's own `package.json` agrees. Nothing
imports `zod` from `docx-templates`.

The package that *does* pull `zod` in, in this repository, is **`eslint-plugin-react-hooks`**
(`package-lock.json:4010-4016`), which lists `zod` and `zod-validation-error` as ordinary
dependencies. `eslint-plugin-react-hooks` arrives via `eslint-config-next`, i.e. it is a **dev**
dependency.

**What this means in practice.**

- Removing `"zod"` from `dependencies` in `package.json` does **not** break `docx-templates` — it
  never needed it.
- It does **not** break linting either: `eslint-plugin-react-hooks` declares `zod` as its own
  dependency, so npm installs it transitively for the dev tree regardless.
- The runtime effect of removing it is that `zod` stops being a **production** dependency in the
  lock file. Because `zod` is currently a top-level production dependency, its lock entry
  (`package-lock.json:7894-7902`) is *not* marked `"dev": true`; after removal it would be, and the
  client bundle would be unaffected either way because nothing imports it.

**Recommendation.** Move `zod` out of `dependencies` into `devDependencies` (or remove it from
`dependencies` entirely and let `eslint-plugin-react-hooks` own it), and correct the two companion
documents. The "removal needs care" framing in the existing docs is right in spirit — a lock-file
change is needed — but the stated reason is wrong.

### 6.2 `jszip` — used directly but not declared

`jszip` is required by `scripts/make-default-templates.mjs:17` (to build the generic DOCX template)
and by `tests/docx-template.test.ts:2` (to inspect the embedded template). It is **not** in
`package.json`; it is present only because `docx-templates` depends on it
(`package-lock.json:3434`, resolved at `:5280-5291`). This works today because npm hoists it to
`node_modules/jszip`, but it is an undeclared dependency — the same class of problem as `zod`, just
in the opposite direction. Declaring `jszip` explicitly in `devDependencies` would make the two
usages legitimate rather than accidental.

---

## 7. Browser platform APIs (not third-party services)

For completeness, these are the platform capabilities the app depends on. They ship with the
browser, work offline, and involve no external party — but they are genuine "integration points"
that a deployment must satisfy.

| API | Used for | Where |
|---|---|---|
| **Web Crypto** (`crypto.subtle`) | AES-256-GCM encrypt/decrypt; SHA-256 manifest | `src/lib/crypto.ts:21,37,44,55,74`; `src/export/reportContext.ts:111-118` |
| **IndexedDB** | All persistence | `src/lib/storage/idb.ts:30-45`; `src/lib/crypto.ts:3` |
| **Web Workers** (module type) | Off-thread parse and validate | `src/lib/workers.ts:36-58,128-134`; `src/workers/parseWorker.ts:81-96` |
| **`crypto.randomUUID()`** | Dataset and chart identifiers | `src/stores/datasetStore.ts:42` |
| **File / Blob / `FileReader`** | Read the dropped file; build export blobs | `src/app/ingest/page.tsx:157`; `src/export/pptxReporter.ts:114-121`; `src/export/csv.ts:32-41` |
| **`URL.createObjectURL`** | Download links and chart thumbnails | `src/export/csv.ts:33`; `src/app/viz/page.tsx:114` |
| **Canvas** (`toDataURL`) | PNG rasterisation | via `html-to-image` (`node_modules/html-to-image/lib/index.js:136`) |

**Secure-context requirement.** `crypto.subtle` is unavailable over plain `http://` on a non-localhost
origin. This means the app **must** be served over HTTPS or `localhost` — it cannot simply be opened
from a file share over HTTP, and `file://` will not work at all (`PROJECT_CONTEXT.md` §13.3-13.4).

---

## 8. What is explicitly absent

For completeness, the following were searched for and **not found** in this repository. They are
recorded here so that a future reader knows the absence was checked, not assumed.

| Thing | Status |
|---|---|
| `route.ts` / API handlers | Absent — no matches under `src/` |
| `"use server"` server actions | Absent — every page is `"use client"` |
| `middleware.ts` | Absent |
| `process.env` in `src/` | Absent |
| `.env` / `.env.example` | Absent (`.gitignore` excludes `.env*` as a default) |
| Dockerfile, `vercel.json`, `netlify.toml`, `firebase.json` | Absent |
| GitHub Actions / any CI config | Absent (`.github/` does not exist) |
| Service worker registration / `sw.js` | Absent |
| `dangerouslySetInnerHTML` | Absent |
| Any `TODO`/`FIXME` marker | Absent — the technical debt lives in documentation only (`PROJECT_CONTEXT.md` §16.6) |
| `zod` import | Absent (declared only — §6) |

---

## 9. What would have to change to add a network integration

Not a recommendation — a checklist, because the current design makes several things load-bearing.

1. **`src/app/layout.tsx:19`** — `connect-src` would need the new origin, which weakens the central
   privacy guarantee and should be treated as a product decision, not a build change.
2. **`scripts/check-offline.mjs:18-19`** — the gate would have to be taught the new exception, or it
   will correctly fail the build.
3. **The privacy copy** — `src/app/page.tsx:138-145` ("Privacy by design"), the AppShell tooltip
   (`src/components/AppShell.tsx:53-55`), the Report page privacy note
   (`src/app/report/page.tsx:233-237`), and `package.json:5`'s own description all assert that
   nothing is transmitted. Each would become false.
4. **`src/lib/crypto.ts`** — the key model assumes a single origin and a single device
   (`PROJECT_CONTEXT.md` §14.4); a server-held identity would need a different key-management story.
5. **The threat model** at `src/lib/crypto.ts:9-17` is explicitly "at rest, against disk and copy
   artefacts on shared machines". Sending data off-device invalidates the assumption that the
   dataset never leaves the machine.

---

## 10. Cross-references

| Topic | Document |
|---|---|
| Stage-by-stage codemap with `file:line` | [`docs/PIPELINE.md`](PIPELINE.md) |
| Contributor setup, gates, script reference | [`docs/DEVELOPMENT.md`](DEVELOPMENT.md) |
| Security model, CSP, threat model | `PROJECT_CONTEXT.md` §14 · [`docs/09-authentication-and-authorization.md`](09-authentication-and-authorization.md) |
| Dependency inventory and versions | [`docs/02-technology-stack.md`](02-technology-stack.md) |
| The nine maintenance scripts (incl. the two known-broken ones) | [`docs/18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) |
| Performance and bundle-size cost of these libraries | [`docs/19-performance-and-scalability.md`](19-performance-and-scalability.md) |
| Supply-chain remediation options | [`docs/20-future-improvements.md`](20-future-improvements.md) |

---

*Every claim in this document was read from the source at the time of writing. Where a fact could
not be established from the repository — notably anything about how `out/` is actually hosted, or
the real-world provenance of the vendored SheetJS tarball — it is marked
**Not verified from the current repository.**
