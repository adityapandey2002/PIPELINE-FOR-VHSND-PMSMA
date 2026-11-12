# 19 — Performance & scalability

**Scope.** What this application does efficiently, where it will fall over as data grows, and what
should be done about it — with an explicit separation between what was **measured** and what was
**read from the source**.

Companion documents: [`docs/PIPELINE.md`](PIPELINE.md) (stage codemap),
[`docs/17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md)
(the libraries whose size dominates this discussion), and
[`docs/20-future-improvements.md`](20-future-improvements.md) (the mitigations as work items).

---

## 1. Read this first: there is no performance measurement in this repository

**There is no benchmark, no profiling harness, no performance budget, no bundle-size check and no
load-time assertion anywhere in this codebase.**

| Thing you might expect to find | Present? | Evidence |
|---|---|---|
| A benchmark suite (`bench/`, `benchmark/`, `*.bench.ts`) | **No** | No such file or directory exists |
| A performance test inside the Vitest suite | **No** | `vitest.config.ts:7` includes only `tests/**/*.test.ts`; the 19 files / 212 tests are all correctness assertions |
| A timing or memory assertion | **No** | No `performance.now()`, `Date.now()` comparison, `process.hrtime` or heap measurement in `tests/` |
| A bundle-size budget or CI size gate | **No** | No `.github/`, no CI config at all (`PROJECT_CONTEXT.md` §16.6) |
| A `lighthouse` / `web-vitals` integration | **No** | Not in `package.json:20-43`; no `web-vitals` dependency |

**Therefore, in this document:**

- Statements marked **Measured** come from reading the built artefact and the committed fixtures
  on disk — they are real numbers, reproducible by re-running the commands shown.
- Statements marked **Static analysis** are conclusions drawn by reading the source. They describe
  *algorithmic shape and likely cost*, not observed latency. They have **not** been reproduced in a
  browser, and **no timing was taken**.

The two are not interchangeable. A static analysis saying "this is O(rows × columns)" is a claim
about the code; a measurement saying "this took 4.2 s on a 693-row file" is a claim about one
machine, one browser, one file. Where a number would be needed to make a decision, this document
says so rather than inventing one.

---

## 2. What is already efficient

These are real design decisions, not incidental good luck. Each is cited.

### 2.1 Parse and validate run in Web Workers

The two expensive stages — reading the workbook and running the contradiction engine — are the only
heaviest work in the pipeline, and both are pushed off the main thread.

- `runParse` constructs a **module** Worker (`src/lib/workers.ts:52-55`), guarded by a capability
  probe that builds and immediately terminates a test worker (`:36-44`).
- `runValidate` does the same (`:129-132`).
- Both have a **120 000 ms timeout** (`:62` for parse, `:138` for validate).
- Both have an **inline fallback**: the *same pure payload function* is `import()`ed and run on
  the main thread (`:98-115`, `:168-183`). Because the worker and the fallback call the same
  `parsePayload` / `validatePayload`, behaviour cannot drift between the two paths
  (`PROJECT_CONTEXT.md` §4.4).

**Why this is the single most important decision in the app:** without it, a 250-column ×
700-row parse would freeze the tab for seconds and the user would have no idea whether it had
hung. The fallback means the app still works when module workers are blocked
(see [`18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) §5.3).

### 2.2 The workbook is transcribed to array-of-arrays exactly once

`src/workers/parseWorker.ts:43-48` reads the sheet with `header: 1`, producing an array of arrays.
This happens **once**, inside the worker, and the result is what every later stage consumes.

Two consequences worth naming:

- It is what prevents the form's repeated "Others (Specify)" labels from collapsing into one key —
  object-keyed transcription would make them indistinguishable (the comment at `:40-42`).
- It is done **once**, not per render or per column. A later implementation that re-read the sheet
  per column would be O(columns) times worse; this one is not.

### 2.3 Field coercers are cached per schema version

`src/lib/derive.ts:24-38` keeps a module-level `Map<string, FieldCoercer | null>` keyed by
`` `${dataset.schemaVersion}:${dataset.kind}` ``. `buildFieldCoercer` is called once per
schema/version pair, not once per row or once per derive.

**Honest caveat:** the `catch` at `:33-35` swallows the error and caches `null`, after which
override values are written through **without coercion**. The behaviour is documented in the
comment above the function (`:19-23`), but the underlying error is discarded
(`PROJECT_CONTEXT.md` §16.3). This is a correctness concern, not a performance one, and is listed
as a fix-first item.

### 2.4 Chart PNGs are captured once, at add-time

`src/app/viz/page.tsx:126-158` — `handleAddToReport` rasterises the chart card **once**, when the
user clicks "Add to report", and stores the PNG blob plus its dimensions
(`:148-152`). The export path re-uses those bytes; it does **not** re-render the chart.

The cost of this decision: exports embed the PNG as it was at capture time, so re-editing a chart
later does not update previously saved decks — a silent divergence between the report and the
current data (`PROJECT_CONTEXT.md` §16.3). The performance benefit is that exporting a 20-chart
deck does not re-render 20 charts.

### 2.5 The schema hash is computed once per dataset creation

`src/stores/datasetStore.ts:41` — `const schemaHash = await computeSchemaHash(SCHEMA_VERSION)`,
inside `createDataset`. It is not recomputed per render, per row or per export.

### 2.6 Heavy libraries are code-split, not bundled globally

**Measured.** The build in this checkout puts the libraries behind route boundaries rather than in
a single global bundle:

| Chunk (in `out/_next/static/chunks/`) | Bytes | Contains | Reached from |
|---|---:|---|---|
| `0ljhhgsl458oz.js` | 541,755 | **recharts** | `/viz/` only |
| `322ddl9b3md5s.js` | 456,121 | **pptxgenjs + docx-templates + jszip + pako** | `/report/` only |
| `418xgm9x_lv26.js` | 364,691 | **SheetJS / xlsx** | **not referenced by any page's HTML** — loaded on demand by the worker (`src/workers/parseWorker.ts:31`) |
| `3knl474w1rpld.js` | 59,090 | xlsx-related glue | `/ingest/` |

SheetJS — the 2.3 MB vendored tarball on disk — is **not** in any page's initial payload. The
dynamic `await import("xlsx")` inside the parse worker is what achieves that, and it was clearly
deliberate.

### 2.7 The comparison "partial view" gate avoids wasted work

A comparison whose columns the file lacks is not drawn until the user opts in
(`src/app/viz/page.tsx:335-366` per `PROJECT_CONTEXT.md` F13). The computation still runs, but the
user is not shown a misleading chart, and the "Add to report" path stays locked until they accept
the partial view.

---

## 3. Measured figures

### 3.1 Shipped bundle, by route

**Measured** from the `out/` tree in this checkout, by resolving every `<script src>` in each
route's HTML and summing the referenced files. **Uncompressed** bytes. The `out/dev/` subtree
(145 JS files, 25,880,189 bytes) is dev-server scratch, is correctly excluded from the offline
gate (`scripts/check-offline.mjs:51`), and is **not** part of the shipped artefact.

| Route | JS chunks referenced | Referenced JS | HTML |
|---|---:|---:|---:|
| `/` | 8 | 589,319 | 7,704 |
| `/ingest/` | 10 | 687,306 | 8,692 |
| `/review/` | 10 | 680,589 | 8,692 |
| `/viz/` | 10 | **1,207,755** | 8,686 |
| `/report/` | 12 | **1,219,914** | 9,164 |

The whole shipped export (`out/` minus `out/dev/`) is **45 files / 2,655,141 bytes** of JS, HTML
and CSS.

**Reading the numbers.**

- The **shared baseline is ~585,660 bytes** of JS on every route (React, React DOM, the Next.js
  runtime and the app shell). That is the floor, before any domain code.
- `/viz/` costs **+618,095 bytes** over the landing page — entirely `recharts`.
- `/report/` costs **+630,595 bytes** over the landing page — entirely `pptxgenjs` +
  `docx-templates` + `jszip` + `pako`.
- **The Report screen loads 1.2 MB of JavaScript to render four buttons and a table.** The two
  export libraries are only needed when the user actually clicks "Slide deck (PPTX)" or
  "Official letter (DOCX)" (`src/app/report/page.tsx:91-121`). A `dynamic import()` inside
  `doExport` would move ~630 KB out of the initial payload and into the click.

**Caveats.** One build, one machine, uncompressed. No build-to-build variance was measured. The
figures were taken from the tree present in this checkout; a fresh `npm run build` may differ.

### 3.2 Committed fixtures

**Measured** on disk:

| Fixture | Bytes | Header layout | Rows | Columns present / recognised | Findings |
|---|---:|---|---:|---|---|
| `sample-data/DATASET_1.xlsx` | 16,593 | single label row (`headerRow: 1`) | 14 | 91 label columns → **90 present**, **90 of 253 recognised**; `SubmissionDate`, `starttime`, `endtime`, `B8` absent → `refDate = null` | **0** violations — every cross-field rule is inapplicable; 0 unmatched titles; 1 collapsed group (`resolved-title`: 2 titles merged onto `H1PB2`); comparisons **7 full / 14 partial** |
| `sample-data/DATA_EX_SHAPE.csv` | 12,606 | two-row (`headerRow: 2`) | 3 | 251 of 253 (`G1_D`, `remarks` absent) | 0 violations |
| `sample-data/vhsnd-sample.xlsx` | 1,017,303 | single code row (`headerRow: 1`) | 160 | 252 of 253 (`G1_D` absent) | **320 errors / 3146 warnings / 307 infos** across 26 distinct codes |

(Header layout, row counts, column counts and finding counts are the measured values recorded in
[`docs/PIPELINE.md` §5.3](PIPELINE.md); the byte counts are from the files on disk today.)

**The largest dataset anyone has actually run through this code** is recorded in the same section,
from three exports supplied for measurement and **not stored in this repository**:

| Export | Sheet | Read as | Result |
|---|---|---|---|
| `DATA_EXAMPLE.csv` | 252 × 7, fields down column A | flipped (`transposed: true`), 5 rows, `headerRow: 2` | 21 of 21 comparisons full; 251 of 253 present |
| `DATASET.xlsx` | 24 × 252 | upright, `headerRow: 2`, 22 rows | 21 of 21 full; 251 of 253 present; 0 errors, 0 warnings |
| `VHSND_DATASET.xlsx` | 696 × 252, three header rows | `headerRow: 3`, **693 rows** | **252 of 253 recognised**; `collapsedColumns` empty; `unmappedHeaders` absent; 21 of 21 comparisons full |

**693 rows × 252 columns is the highest-water mark that has been exercised.** Everything in §4
below is an extrapolation from that, not an observation of failure.

### 3.3 Installed dependency footprint

**Measured** — total bytes of every file in the installed package directory. This is an **upper
bound** on what the bundler can include; tree-shaking and minification reduce it. It is useful as a
*relative* signal between libraries.

| Package | Installed bytes | Files |
|---|---:|---:|
| `xlsx` | 8,076,339 | 26 |
| `recharts` | 7,452,998 | 839 |
| `zod` | 6,140,311 | 840 |
| `pptxgenjs` | 5,043,412 | 84 |
| `docx-templates` | 1,240,345 | 31 |
| `jszip` | 693,061 | 53 |
| `react-dropzone` | 341,097 | 11 |
| `html-to-image` | 315,082 | 82 |
| `zustand` | 95,173 | 52 |
| `idb-keyval` | 55,849 | 12 |

`zod` is listed because it is the largest *unused* dependency in the tree — see
[`17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) §6.

---

## 4. Concrete scaling risks

Each entry states the shape of the problem, the citation, and why it bites. All are **static
analysis** unless marked otherwise.

### 4.1 `listDatasets()` decrypts every stored snapshot, sequentially

`src/lib/storage/idb.ts:99-117`:

```ts
export async function listDatasets(): Promise<DatasetSummary[]> {
  const ks = await storeKeys(P.datasets);
  const out: DatasetSummary[] = [];
  for (const k of ks) {
    const raw = await storeGet<string>(P.datasets, k);
    if (!raw) continue;
    const snap = JSON.parse(await decryptString(raw)) as DatasetSnapshot;   // ← full decrypt + parse
    out.push({ id: snap.id, kind: snap.kind, name: snap.name, /* …8 more fields… */ });
  }
  return out.sort(/* … */);
}
```

To render **eight summary fields**, the function reads, base64-decodes, AES-GCM-decrypts, and
`JSON.parse`s the **entire dataset** — every row, every cell of every row — for **every** stored
dataset. The `await` inside the `for` loop makes it strictly **sequential**: the datasets are
decrypted one after another, never concurrently.

**Who pays this cost:** the landing page (`src/app/page.tsx:49`), the dataset picker
(`src/components/DatasetPicker.tsx:14`) and the ingest screen's duplicate-import check
(`src/app/ingest/page.tsx:119`). So the *ingest* screen — the one place the user is waiting for
parse to finish — performs a full decrypt of every stored dataset on every import.

**Why it matters:** the cost is O(total stored bytes), not O(dataset count). A user who has
imported five 693-row datasets pays five full decrypt-and-parse operations on the landing page,
every time they open it. The summary fields it needs (`id`, `kind`, `name`, `fileName`,
`totalRows`, `importedAt`, `schemaVersion`) are a tiny fraction of the stored payload.

**Fix direction:** store a summary record alongside (or instead of) the full snapshot, so the
listing path never decrypts the bulk. This is item **M1** in §6.

### 4.2 The full dataset is held in memory *and* on disk — peak ≈ 2× (transiently ≈ 3×)

**Static analysis.**

- The parsed snapshot is held in the Zustand store: `set({ dataset: snapshot, … })`
  (`src/stores/datasetStore.ts:56`).
- It is simultaneously written to disk: `await saveDataset(snapshot)` (`:55`), which does
  `encryptString(JSON.stringify(snapshot))` (`src/lib/storage/idb.ts:90`).
- On the ingest screen the **raw `ArrayBuffer` is also retained** in component state
  (`src/app/ingest/page.tsx:159`) so the file can be re-read without re-picking it.

At the moment of `saveDataset`, three representations coexist: the snapshot object, its JSON
string, and the base64 ciphertext. `loadDataset` is the mirror image — the base64 string, the
decrypted JSON string and the parsed object (`src/lib/storage/idb.ts:93-97`).

**Peak memory ≈ 2× the dataset size** as a steady state, with a transient spike above that during
save and load. On a 693-row × 252-column dataset this is the difference between "fine" and "the tab
dies", and it is the reason the app can become unresponsive on a district laptop with modest RAM.

### 4.3 The column-statistics pass builds a `Map` and a `Set` per column, over every row

`src/lib/insights.ts:43-52`:

```ts
for (const row of dataset.rows) {
  for (const [code, val] of Object.entries(row.values)) {
    withValues.add(code);
    if (val !== null && val !== undefined && val !== "") {
      filledMap.set(code, (filledMap.get(code) ?? 0) + 1);
      if (!uniqueMap.has(code)) uniqueMap.set(code, new Set());
      uniqueMap.get(code)!.add(val);     // ← a Set of every distinct value in the column
    }
  }
}
```

Two things scale badly here:

1. **`Object.entries(row.values)` per row** allocates a fresh array of `[key, value]` pairs for
   every row — 693 allocations of up to 252 pairs.
2. **`uniqueMap` retains every distinct value of every column for the lifetime of the call.** For a
   mostly-binary survey, that is small; but a column of free-text remarks, or a numeric column
   with 693 distinct values, is retained in full. The unique counts are used only for
   `ColumnStat.unique` (`:58`), which the UI shows but never needs per *value*.

**When it runs:** `computeDatasetInsights` is called from `src/app/review/page.tsx:75`,
`src/app/viz/page.tsx:95` and `src/app/ingest/page.tsx:117` — i.e. on three of the five screens.
On the review screen it is memoised on `[dataset]` (`:75`), so it re-runs whenever the dataset
object identity changes.

**Fix direction:** the fill counts need only a `Map<string, number>`; the `Set` is needed only for
`unique`, which could be computed with a bounded sketch or dropped.

### 4.4 Indicators and comparisons make repeated full passes, with no memoisation in the UI path

**Static analysis — and this is the most concrete repeated-work finding.**

The viz screen recomputes the same things several times per input change:

| What | Where | Cost |
|---|---|---|
| `deriveCleanRows(dataset, violations, resolutions)` | `src/app/viz/page.tsx:57` | one full pass over every row |
| `evaluateIndicator(cleanRows, selectedIndicator)` | `src/app/viz/page.tsx:65` | one full pass |
| `evaluateIndicator(cleanRows, i)` for **every** indicator | `src/app/viz/page.tsx:66` | up to **21** full passes |
| `evaluateIndicator(cleanRows, indicator)` | `src/app/viz/page.tsx:71` | one full pass — the same indicator again |
| `deriveCleanRows` **again**, inside `computeVizInsights` | `src/lib/insights.ts:146` | another full pass |
| `computeDatasetInsights` | `src/lib/insights.ts:43-89` | the Map/Set pass of §4.3 |

The worst case is `src/app/viz/page.tsx:65-67`: when the selected indicator yields no points, the
code scans the whole indicator registry looking for one that does —

```ts
const fallback = VHSND_INDICATORS.find((i) => evaluateIndicator(cleanRows, i).points.length > 0);
```

— calling `evaluateIndicator` for up to 21 indicators over all clean rows, **and then computing the
selected one again** at `:71`.

On the review screen, one memo recomputation performs `deriveCleanRows` at `:63`, then
`computeCleaningInsights` calls it **again** (`src/lib/insights.ts:109`), then
`computeDatasetInsights` does the Map/Set pass (`:75`).

And `buildReportContext` evaluates **every** indicator definition to produce the headline figures
(`src/export/reportContext.ts:83`).

**Inside the comparisons themselves** there is duplicated work too. `meanPctTrue` calls
`presentCodes` and then `countTrue` once per code (`src/lib/comparisons.ts:117-122`), and
`meanDetail` calls `presentCodes` and `countTrue` **again** for the same columns (`:125-129`). A
comparison such as `anc-pnc-bias` (`:434-460`) therefore visits every ANC and PNC row **twice**:
once for the value and once for the hover detail. `countTrue` itself normalises every cell
through `stdBool` (`:8-17`), which lower-cases and splits strings — work repeated for a value that
has already been computed.

**Why it matters:** none of these are individually catastrophic at 693 rows. Together they mean
that a single interaction on the viz screen can walk the dataset a dozen or more times. At 10× the
data, that is the difference between a responsive screen and a spinner.

### 4.5 No list virtualisation in the review table or the dataset list

Both tables render **every** row as a real DOM node:

- Review: `{listed.map(({ violation: v, key }) => { … return <tr> … })}` —
  `src/app/review/page.tsx:260-288`. `listed` is `keyedViolations(filtered)` (`:51`), i.e. every
  filtered violation.
- Dataset list: `{datasets.map((d) => (<tr key={d.id}> …))}` — `src/app/page.tsx:112-132`.
- Dataset picker: the same pattern — `src/components/DatasetPicker.tsx`.

A repository-wide search for `virtual`, `windowing`, `IntersectionObserver` or any pagination
primitive returns **no matches** in `src/`. The only slicing anywhere is the "show all sparse
columns" toggle on the ingest page (`src/app/ingest/page.tsx:444`).

**Why it matters:** the committed synthetic fixture alone produces **320 errors + 3146 warnings +
307 infos = 3773 violations** (`docs/PIPELINE.md` §5.3). The review table renders 3,773 `<tr>`
elements with six `<td>` each — roughly 25,000 DOM nodes — on a page that also has a sticky drawer.
On the `VHSND_DATASET.xlsx` export the count would be different but the shape is the same.

**Fix direction:** window the table (render the visible slice plus an overscan), or paginate.
A third-party virtualiser is not required — the table is simple enough for a hand-rolled window.

### 4.6 recharts renders one SVG element per data point, with no downsampling

`src/components/ChartCanvas.tsx` renders its series straight into recharts components — `<Bar>`,
`<Line>`, `<Pie>`, `<Scatter>` and so on. recharts emits SVG, so **the DOM node count grows with
the number of data points**.

A repository-wide search for `downsample`, `maxPoints` or any point-capping logic returns **no
matches** in `src/`. The only length reduction anywhere is a 30-character truncation on box-plot
labels (`src/components/ChartCanvas.tsx:401`).

**Why it matters:** the exposure is real for two of the chart kinds:

- **Categorical breakdowns** iterate the child columns of a group. `isDirectChildOf` over the
  registry means a breakdown can emit as many points as the group has options
  (`src/schema/indicators.ts:213-224`).
- **Time series** emit one point per distinct day (`src/schema/indicators.ts:169-175`). For a
  monthly supervision survey the cardinality is low, but the code has no upper bound on it.

The PNG capture at add-time (`src/app/viz/page.tsx:130-134`) rasterises the whole chart at
`pixelRatio: 2`, so a large chart also becomes a large PNG in memory and on disk.

**Fix direction:** cap or bucket points above a threshold (a time series with 700 days should be a
line of 700 points at most, and probably a bucket), and cap categorical breakdowns.

### 4.7 The bundled dependency footprint

**Measured** in §3.1 and §3.3. The three heaviest shipped chunks are `recharts` (541,755 bytes),
`pptxgenjs` + `docx-templates` + `jszip` + `pako` (456,121 bytes) and SheetJS (364,691 bytes,
correctly lazily loaded).

The specific waste is the **Report page**: 1,219,914 bytes of initial JS to render a page whose
only interactive elements are four buttons. Moving the two export libraries behind a dynamic
`import()` inside `doExport` (`src/app/report/page.tsx:91-121`) would drop the route's initial
payload by roughly half.

### 4.8 A note on what is *not* a risk

For balance, and because the absence is a design property worth protecting:

- **Storage is not a scaling risk in the usual sense.** Everything is one browser's IndexedDB on
  one machine. There is no server, no database, no queue and no concurrent-user contention.
- **There is no network latency in the critical path.** Once the page has loaded, no stage of the
  pipeline waits on a remote host. This is unusual and valuable.
- **The parse timeout is generous** (120 s, `src/lib/workers.ts:62,138`), so a very large workbook
  fails loudly rather than hanging.

---

## 5. Where the current design would break first

**Static analysis**, extrapolated from §4. Ordered by how likely each is to bite first.

| Rank | Risk | Trigger | First symptom |
|---|---|---|---|
| 1 | Review table DOM explosion (§4.5) | A few thousand violations | Sluggish scrolling, the row drawer lagging behind clicks |
| 2 | Repeated full passes in the UI path (§4.4) | A few thousand rows | The viz screen stutters when switching indicator or comparison |
| 3 | `listDatasets()` decrypt-everything (§4.1) | Several saved datasets | The landing page takes noticeably longer with each import |
| 4 | Peak memory ≈ 2×, transiently 3× (§4.2) | A large dataset on a low-RAM machine | The tab is killed or becomes unresponsive |
| 5 | SVG per point, no downsampling (§4.6) | A high-cardinality dimension | The chart is slow to render and the PNG capture is slow |
| 6 | The column-statistics `Set` retention (§4.3) | Wide rows with high-cardinality columns | Memory grows during the ingest pass |

---

## 6. Prioritised mitigations

Ordered by (benefit ÷ risk). Each is a *candidate*; none is a commitment — see
[`20-future-improvements.md`](20-future-improvements.md) for how these map onto the broader
roadmap discussion.

| # | Mitigation | Targets | Effort | Risk | Why first |
|---|---|---|---|---|---|
| **M1** | Store a lightweight summary record next to (or instead of) the full snapshot, so `listDatasets()` never decrypts the bulk | §4.1 | Medium | Medium — touches the storage layer and the wipe semantics (`src/lib/storage/idb.ts:260-273`) | Biggest single win on the landing page, and it also removes a decrypt from the ingest path |
| **M2** | `await import()` the two export libraries inside `doExport` | §4.7 | Low | Low — the exports are already async | Drops ~630 KB from the Report route's initial payload; one-line-shaped change at `src/app/report/page.tsx:91-121` |
| **M3** | Window the review table (render a visible slice + overscan) | §4.5 | Medium | Medium — a hand-rolled window is easy to get subtly wrong (scroll position, selection) | The 3,773-violation fixture already exercises this; it is the first thing a real user hits |
| **M4** | Memoise `deriveCleanRows` once per page and pass the result into `computeCleaningInsights` / `computeVizInsights` instead of recomputing it | §4.4 | Low | Low — these are pure functions, so the change is mechanical | Removes 2–3 full passes per screen for very little code |
| **M5** | Cache `evaluateIndicator` per (indicator id, rows identity); stop re-scanning all 21 indicators at `src/app/viz/page.tsx:66` | §4.4 | Low | Low | The 21-indicator fallback scan is the single worst offender in the viz path |
| **M6** | Replace the per-column `Set` in `computeDatasetInsights` with a bounded unique-count sketch, or compute `unique` lazily | §4.3 | Low | Low | The fill-rate statistics are what the UI actually uses |
| **M7** | Compute `countTrue` once per (rows, code) and reuse it for both the value and the hover detail | §4.4 | Low | Low | Halves the comparison arithmetic; the detail string and the value come from the same number |
| **M8** | Cap or bucket chart points above a threshold (time series, categorical breakdowns) | §4.6 | Low | Medium — changes what the user sees, so it needs a stated rule | Prevents an unbounded SVG explosion |
| **M9** | Add a bundle-size budget to CI (a size assertion on the shipped chunks) | §4.7 | Medium | Low | Nothing prevents the bundle growing back after M2 |
| **M10** | Add a benchmark harness — a fixed fixture, a wall-clock budget, and a memory ceiling | §1 | Medium | Low | **Until this exists, every performance claim in this document remains static analysis.** |

**M10 is the prerequisite for everything else being provable.** Until there is a number to hold,
"the app is fast enough" is an opinion.

---

## 7. Open questions that need a human decision

These are **TBD — user input required**. They are not technical questions the code can answer.

1. **What is the real maximum workbook size?** The highest-water mark exercised is 693 rows ×
   252 columns (`docs/PIPELINE.md` §5.3). Is that typical, the worst case, or the easy case? A
   district block running one supervision round per month over a whole block could plausibly be
   10× that.
2. **What is the real maximum number of saved datasets on one machine?** `listDatasets()` (§4.1)
   scales with this directly, and the current UX actively encourages re-imports — each of which
   mints a new dataset id (`src/stores/datasetStore.ts:42`).
3. **What is the target hardware?** A district laptop with 4 GB of RAM behaves very differently
   from a modern desktop. The peak-memory figure in §4.2 cannot be assessed without this.
4. **Is the 120-second worker timeout the right budget?** It is generous for a 693-row file
   (which is fast) and possibly too generous for a 50,000-row one (where the user is left staring
   at a spinner for two minutes before an error).
5. **Is the app expected to be run on a tablet or phone?** The screens are not mobile-adapted
   (`PROJECT_CONTEXT.md` §16.7), and a smaller memory ceiling changes the priority order above.
6. **Should a partially-read import be refused?** On a large, partially-recognised file the app
   currently does the full work and then reports "0 errors" — the fix-first item in
   [`20-future-improvements.md`](20-future-improvements.md) §1 would also prevent a lot of wasted
   computation.

---

## 8. Cross-references

| Topic | Document |
|---|---|
| Where each stage's code lives | [`docs/PIPELINE.md`](PIPELINE.md) |
| The libraries that dominate the bundle | [`docs/17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) |
| Build gates and the offline gate | [`docs/18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) |
| Mitigations as roadmap items; open questions | [`docs/20-future-improvements.md`](20-future-improvements.md) |
| Known performance debt, as recorded elsewhere | `PROJECT_CONTEXT.md` §14.5, §16.4, §16.6 |
| Schema, indicators, comparisons | [`docs/DATA-MODEL.md`](DATA-MODEL.md) |

---

*Every claim in this document is either **Measured** (with the artefact or file it came from named)
or **Static analysis** (reading the source). No timing was taken, because no timing harness exists
in this repository — see §1. Where a figure could not be established from the repository it is
marked **Not verified from the current repository.***
