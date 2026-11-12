# 02 — Technology Stack

> **Scope of this document.** Every technology the repository actually uses: its declared version,
> where in the tree it is used, why it matters in this specific application, and how it relates to
> the others.
>
> **Evidence rule.** Versions are quoted from `package.json`; usage sites are cited as
> `path:line`. Anything not establishable from the repository is written as
> **"Not verified from the current repository."**
>
> **Companion documents** — [`PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) §3 (the canonical tech-stack
> section) · [`01-project-overview.md`](01-project-overview.md) (what the app is for) ·
> [`03-project-structure.md`](03-project-structure.md) (where every file lives) ·
> [`PIPELINE.md`](PIPELINE.md) (stage-by-stage codemap) · [`DEVELOPMENT.md`](DEVELOPMENT.md) (setup
> and gates).

---

## 1. Runtime stack

| Technology | Version (`package.json`) | Where it is used | Why it matters here | Relationship to the others |
|---|---|---|---|---|
| **Next.js** (App Router) | `16.3.6` (pinned, no caret) | `next.config.ts:3-11`; all routes in `src/app/**` | Provides the App Router, the client-component model and — critically — the **static export** that makes a serverless deployment possible. `output: "export"` (`next.config.ts:4`) is what allows the whole app to be a folder of HTML/JS with no runtime server | The outermost layer. It compiles React 19, resolves the `@/*` path alias, and produces `out/`. It also rewrites the `AGENTS.md` rules block on every `next dev` / `next build` |
| **React / React DOM** | `19.2.8` (pinned) | Every page under `src/app/**` carries `"use client"`; `src/components/**` | The rendering model. Because every page is a client component, `src/app/layout.tsx` exists only for metadata and the CSP `<meta>` tag (`src/app/layout.tsx:4-8`, `:10-25`) | React supplies the rendering surface that `recharts` and the 4 hand-written SVG renderers draw into; the React Compiler optimises the result of both |
| **TypeScript** | `^5` (`strict: true`, `noEmit`) | Whole `src/`, `tests/`, `scripts/` | The domain is expressed as types and predicates rather than data tables, so the compiler is the primary correctness tool. `strict: true` and `noEmit: true` are set at `tsconfig.json:11` and `:12` | `tsconfig.json` also supplies the `@/* → ./src/*` alias (`tsconfig.json:25-29`), which `vitest.config.ts:10-14` mirrors — that is why tests import application modules unchanged |
| **React Compiler** | enabled via `reactCompiler: true` (`next.config.ts:10`); `babel-plugin-react-compiler@^1.0.0` in `devDependencies` (`package.json:38`) | Build-time only; applies to every component in `src/app/**` and `src/components/**` | Automatically memoises component output, which matters because charts re-render against large derived datasets. It is opt-in via `next.config.ts`, not a separate build script | Depends on the Babel plugin being installed — `package.json:38` exists specifically because `reactCompiler: true` requires it (README Part B) |
| **Zustand** | `^5.0.15` | `src/stores/workflowStore.ts`, `datasetStore.ts`, `resolutionStore.ts`, `chartStore.ts` | Four small stores instead of one god-store. `workflowStore` is wrapped in `persist` over an **encrypted** storage adapter (`src/stores/workflowStore.ts:13-30`, `:24`), so the "which dataset am I on" pointer is persisted as ciphertext | Bridges React and the persistence layer. The other three stores write through to IndexedDB directly (`src/lib/storage/idb.ts`), so Zustand is the *in-memory* layer, IndexedDB the *durable* layer, and `src/lib/crypto.ts` sits between them |
| **recharts** | `^3.10.1` | `src/components/ChartCanvas.tsx:5-32` (component imports), `:42` (custom-kind set), `:208-213` (dispatch) | Renders 14 of the 18 chart kinds. The remaining 4 — box, gauge, waffle, heatmap — are hand-drawn SVG in the same file (`CUSTOM_KINDS`, `src/components/ChartCanvas.tsx:42`), because recharts has no native equivalent for them | The only charting dependency. It is used exclusively inside `ChartCanvas.tsx`; no other component imports it. Its output is later rasterised by `html-to-image` |
| **SheetJS (`xlsx`)** | `0.20.3`, **vendored tarball**: `"xlsx": "file:vendor/xlsx-0.20.3.tgz"` (`package.json:30`) | Dynamically imported inside the worker: `const { read, utils } = await import("xlsx");` (`src/workers/parseWorker.ts:31`) | Reads `.xlsx`, `.xls`, `.ods` and `.csv`. Loaded with a *dynamic* `import()` so it is fetched into the worker chunk rather than the main bundle, and so the module is only evaluated when a file is actually dropped | The only third-party library that touches raw user bytes. It is the reason the parse stage must run in a Web Worker (`src/lib/workers.ts:47-118`) |
| **pptxgenjs** | `^4.0.1` | `src/export/pptxReporter.ts:1` | Builds the PowerPoint deck in-browser: title slide, cleaning summary, indicators, one slide per saved chart, audit appendix (`src/export/pptxReporter.ts:20-112`) | Consumes the `ReportContext` produced by `src/export/reportContext.ts` and the PNG blobs produced by `html-to-image` |
| **docx-templates** | `^4.15.0` | `src/export/docxReporter.ts:1` (`createReport`) | Renders the Word letter from an embedded `.docx` template using `{{…}}` placeholders, `FOR` loops and an `IMAGE` helper (`src/export/docxReporter.ts:13-51`) | Requires `src/export/templates.generated.ts` — the base64-embedded template bytes — so that the app never performs a `fetch()` for its own assets (`src/export/templates.generated.ts:1-3`). The chart images it embeds are the same PNGs the PPTX uses |
| **html-to-image** | `^1.11.13` | `src/app/viz/page.tsx:5` (`toPng`), `:130-134` | Converts the live chart DOM into a PNG at `pixelRatio: 2` on a white background, so the chart can be embedded in the PPTX and DOCX (`src/app/viz/page.tsx:126-158`) | Bridges the React/recharts rendering tree and the export writers. This is the only `fetch()` in the source, and it converts an in-memory `data:` URL to a Blob (`src/app/viz/page.tsx:135`) — it is not a network call |
| **react-dropzone** | `^20.1.2` | `src/app/ingest/page.tsx:5` (`useDropzone`), `:142-169` | Provides the drag-and-drop target. The extension guard is app-level code, not library behaviour (`src/app/ingest/page.tsx:146-151`) | The first touchpoint of the whole pipeline — it produces the `File` whose `arrayBuffer()` becomes the worker payload (`src/app/ingest/page.tsx:156-162`) |
| **idb-keyval** | `^6.3.0` | `src/lib/crypto.ts:1-3` — `createStore("pipeline-crypto", "keyval")` | Used for **exactly one thing**: holding the raw AES-GCM key in a separate IndexedDB database. The main application database is hand-rolled instead, so it can be opened at an explicit version and self-heal (`src/lib/storage/idb.ts:5-13`, `:23-26`) | Deliberately asymmetric with `src/lib/storage/idb.ts`. `idb-keyval` pins its database at version 1, which is why it could not be used for the main store. The separation also means `eraseAllLocalData()` can delete the key and the data independently (`src/lib/storage/idb.ts:260-273`) |
| **Web Crypto API — AES-GCM** | browser built-in (no package) | `src/lib/crypto.ts:18-27` (string), `:41-49` (bytes), `:74-77` (key generation), `:59-82` (key management) | Encryption at rest. AES-GCM-256 with a fresh 12-byte IV per operation; strings are stored as `v1.<iv-b64>.<cipher-b64>` envelopes (`src/lib/crypto.ts:16`, `:26`) | Requires a **secure context** — see §5. The key is generated once, stored raw, and memoised in memory (`src/lib/crypto.ts:59-82`); there is no passphrase and no KDF |
| **IndexedDB** | browser built-in (no package) | `src/lib/storage/idb.ts:23-26` (`DB_NAME = "vhsnd-pipeline"`, `DB_VERSION = 2`), `:30-45` (`openDB` + `onupgradeneeded`), `:260-273` (wipe) | The only persistence layer. Six object stores — `ds`, `res`, `chart`, `blob`, `validation`, `ui` (`src/lib/storage/idb.ts:25`) — all encrypted before write | Sits behind `src/lib/crypto.ts` on every write path, and behind Zustand's `persist` adapter for the workflow pointer (`src/stores/workflowStore.ts:24`) |
| **Web Workers** | browser built-in (no package) | `src/lib/workers.ts:36-58` (parse), `:121-134` (validate), `src/workers/parseWorker.ts`, `src/workers/validateWorker.ts`, `src/lib/workerScope.ts` | Keeps the two CPU-heavy stages off the UI thread. 120-second timeout for both (`src/lib/workers.ts:62`, `:138`), with a main-thread fallback that calls the *same* pure payload function (`:98-116`, `:168-184`) so behaviour cannot drift | The workers are created with `{ type: "module" }` (`src/lib/workers.ts:54`, `:131`), which is why the CSP must allow `worker-src 'self' blob: data:` (`src/app/layout.tsx:21`) |

---

## 2. Build and quality tooling

| Tool | Version | Where it is configured | Role |
|---|---|---|---|
| **Vitest** | `^5.0.1` | `vitest.config.ts:4-15` | Test runner. `environment: "node"` (`:6`), `include: ["tests/**/*.test.ts"]` (`:7`), alias `@` → `./src` (`:10-14`). **No coverage provider and no threshold are configured** — coverage reporting is absent from the project entirely |
| **ESLint** | `^9` | `eslint.config.mjs:1-26` | Flat config. Composes `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript` (`:2-3`, `:6-7`), with one override disabling `@typescript-eslint/no-require-imports` for `**/*.cjs` because the Node maintenance scripts are CommonJS by extension (`:8-15`). Global ignores: `.next/**`, `out/**`, `build/**`, `next-env.d.ts` (`:17-23`) |
| **eslint-config-next** | `16.3.6` (pinned to the Next.js version) | `eslint.config.mjs:2-3` | Supplies the framework lint rules; pinned so lint rules and framework version cannot drift apart |
| **TypeScript** | `^5` | `tsconfig.json` | `target: ES2017`; `lib: ["dom","dom.iterable","esnext"]`; `strict: true`; `noEmit: true`; `moduleResolution: "bundler"`; `jsx: "react-jsx"`; `plugins: ["next"]` (`tsconfig.json:2-30`) |
| **Next.js build** | `16.3.6` | `next.config.ts`; `package.json:8` (`"build": "next build"`) | Emits the static export to `out/` (`next.config.ts:6` `distDir: "out"`), with `trailingSlash: true` (`:5`) so directory-style URLs work on a plain file server, and `images.unoptimized: true` (`:7-9`) because there is no image server |
| **Offline build gate** | repo-local script | `scripts/check-offline.mjs:18-34` | Scans `out/**/*.{js,html}` for absolute `https?://` URLs and remote `src`/`href` attributes; exits non-zero on a hit so a shipping artefact that could phone home is refused |
| **@types/node** | `^24.13.6` | `package.json:35` | Node 24 typings are assumed, implying a modern LTS Node for the build and the maintenance scripts |
| **@types/react, @types/react-dom** | `^19` | `package.json:36-37` | React 19 type definitions |

---

## 3. Declared but unused

### `zod` — declared dependency, never imported

| Fact | Evidence |
|---|---|
| `zod` is a **declared runtime dependency** | `"zod": "^4.6.5"` in `dependencies` (`package.json:31`) |
| It is **never imported anywhere** in `src/`, `tests/` or `scripts/` | A recursive search for the string `zod` across every `.ts`, `.tsx`, `.mjs` and `.cjs` file in those three trees returns **no matches** |
| The schema system does **not** use it | The DSL is hand-written: `group`, `rule`, `yesNo`, `ordinalField`, `countWithSentinel`, `count`, `date`, `text`, plus `projectSchema` and `stableStringify` (`src/schema/dsl.ts`) |
| It is **not** required by any other package | `package-lock.json` shows `docx-templates` depends only on `jszip` and `sax` (`package-lock.json:3433-3436`). The only dependents of `zod` here are `eslint-plugin-react-hooks` and `zod-validation-error` — both **dev-side** |
| It is recorded as a confirmed defect | `PROJECT_CONTEXT.md` §16.2, item **D5** |

**Status: `zod@^4.6.5` is a declared dependency that is unused in `src/`, `tests/` and `scripts/`.**
It contributes nothing to the runtime bundle today. Removing it from `dependencies` is safe for the
runtime tree, and linting is unaffected because `eslint-plugin-react-hooks` declares `zod` as its own
dependency and npm installs it transitively for the dev tree regardless. See
[`17-integrations-and-third-party-services.md` §6.1](17-integrations-and-third-party-services.md) for
the full correction.

**No other declared dependency is unused.** Every other entry in `dependencies` has at least one
import site in `src/` — the import sites are listed in the first column of §1.

---

## 4. How the technologies fit together

```
                       Next.js 16.3.6  (static export → out/)
                                  │
                 React 19.2.8 + React Compiler  (all pages "use client")
                                  │
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   Zustand 5                recharts 3.10.1          html-to-image
   (4 stores)               + 4 custom SVG           (toPng, ×2)
        │                         │                         │
        └──────────────┬──────────┘                         │
                       │                                    │
              src/lib/derive.ts                       PNG blobs
        (clean / dropped / pending)                         │
                       │                                    │
     ┌─────────────────┼─────────────────┐                  │
     │                 │                 │                  │
 SheetJS 0.20.3   src/schema/**      src/lib/            │
 (vendored .tgz)   (DSL + engine)    comparisons.ts ──────┘
     │                 │                 │
     └── Web Worker ───┘                 │
       (src/lib/workers.ts)              │
                                         ▼
                        src/export/reportContext.ts
                         (canonical JSON + SHA-256 manifest)
                                         │
                        ┌────────────────┼────────────────┐
                        ▼                ▼                ▼
                  pptxgenjs 4     docx-templates     CSV writer
                  (.pptx)         4.15 (.docx)      (cleaned .csv)
                                     │
                              idb-keyval + Web Crypto
                              (AES-GCM-256, key in a separate DB)
```

The dependency graph is deliberately **shallow and acyclic**: `src/contracts/` holds the shared
vocabulary, `src/schema/` and `src/lib/` hold the domain, `src/stores/` holds state, and
`src/export/` holds the writers. No third-party package is imported by more than one layer, and no
package is imported at all by `src/contracts/` (`PROJECT_CONTEXT.md` §4.1).

### 4.1 Notable version constraints

| Constraint | Reason | Evidence |
|---|---|---|
| `xlsx` resolves to a **local tarball**, not the npm registry | SheetJS no longer publishes current versions to public npm. This makes builds reproducible and offline-installable, but it also means the tarball is the artefact of record and its provenance is not verifiable from `package-lock.json` alone | `package.json:30`; `vendor/xlsx-0.20.3.tgz`; `PROJECT_CONTEXT.md` §10.3 |
| `overrides: { "image-size": "2.0.4" }` | Forces `pptxgenjs`'s transitive `image-size@^1.2.1` down to 2.0.4 | `package.json:44-46` |
| `next` and `react`/`react-dom` pinned exactly (no caret) | Framework and runtime are held at a known-good pair — `eslint-config-next` is pinned to `16.3.6` to match | `package.json:24`, `:27-28`, `:37` |
| `babel-plugin-react-compiler` is a **dev** dependency | It is only needed at build time by `reactCompiler: true` | `package.json:38`; `next.config.ts:10` |
| `distDir: "out"` collides with `next dev` | `next build` deletes `out/dev`, which breaks a running dev server until it is restarted | `next.config.ts:6`; `PROJECT_CONTEXT.md` §13.5 |

---

## 5. Runtime environment requirements

| Requirement | Why it is needed | Evidence |
|---|---|---|
| **A secure context** — HTTPS or `localhost` | `crypto.subtle` is unavailable over plain `http://` on a non-localhost origin. Without it, encryption of every IndexedDB write and the SHA-256 manifest both fail | `src/lib/crypto.ts:21`, `:44`, `:55`; `src/schema/index.ts:36`; `src/export/reportContext.ts:44-47` |
| **Module Web Workers** | Both heavy stages prefer a real `Worker`; the code probes capability first (`canUseWorker`, `src/lib/workers.ts:36-44`) and falls back to the main thread when the probe fails | `src/lib/workers.ts:36-58`, `:90-116`, `:121-134`, `:163-184` |
| **IndexedDB with a supported quota** | The full survey snapshot, all resolutions, the validation cache, chart metadata and PNG blobs are held locally. Quota is browser- and device-dependent | `src/lib/storage/idb.ts:23-26`; `PROJECT_CONTEXT.md` §6.5 notes there is **no quota management** |
| **ES2017+ JavaScript with `TextEncoder`/`TextDecoder`, `btoa`/`atob`** | The crypto envelope encoding depends on all four | `src/lib/crypto.ts:6-7`, `:84-94`; `tsconfig.json:3` |
| **A static file server over HTTP(S)** — `file://` is **not** supported | Next.js emits root-absolute `/_next/...` asset URLs (which 404 under `file://`), `crypto.subtle` is unavailable in a `file://` origin, and module workers are restricted | `PROJECT_CONTEXT.md` §13.4 |
| **A modern desktop browser** (Chrome, Edge or Firefox per `README.md`) | The app uses `crypto.subtle`, module workers, IndexedDB, `OffscreenCanvas`-free but DOM-based PNG capture | `README.md` Part A; `src/app/viz/page.tsx:130` |
| **Node.js (modern LTS) — build time only** | The build, the lint, the tests and the nine maintenance scripts all run in Node. `@types/node@^24.13.6` implies Node 24 typings | `package.json:35`; `scripts/**` |
| **No environment variables** | `process.env` does not appear anywhere in `src/`; there is no `.env.example` | `PROJECT_CONTEXT.md` §11.1 |

### 5.1 The Windows path caveat

The checkout path contains `&`. Every command that shells out through `node_modules/.bin` breaks
because `cmd` splits the path at the ampersand. Call the binaries through `node` directly:

```powershell
node .\node_modules\typescript\bin\tsc --noEmit
node .\node_modules\eslint\bin\eslint.js .
node .\node_modules\vitest\vitest.mjs run
node .\node_modules\next\dist\bin\next build
node .\scripts\check-offline.mjs
```

`README.md` (Quick start, warning box) and `PROJECT_CONTEXT.md` §12.6 record the same workaround.

---

## 6. Not verified from the current repository

| Item | Status |
|---|---|
| The exact installed versions behind the `^` ranges (e.g. `recharts` 3.10.1 vs. a later 3.x) | Not verified from the current repository — `node_modules/` is not present in this working copy, so only the declared ranges in `package.json` can be quoted |
| The browser matrix actually in use on district machines | Not verified from the current repository — no browser support policy, `.browserslistrc` or real-world report exists |
| Bundle sizes, chunk splits, and the production bundle's weight | Not verified from the current repository — no bundle analyser, size budget or build-size report exists; `PROJECT_CONTEXT.md` §14.5 lists "large dependencies bundled" as a static-analysis risk only |
| Any hosting, CDN, font service or third-party runtime integration | None exists — `src/app/layout.tsx:19` locks `connect-src` to `'self' data: blob:` and `scripts/check-offline.mjs:18-34` enforces it at build time |
