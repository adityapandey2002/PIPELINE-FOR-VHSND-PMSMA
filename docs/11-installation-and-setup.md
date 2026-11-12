# 11 — Installation and Setup

**Scope:** getting the application running on a fresh machine, from clone to a served static export.

**There is no backend to install.** No database, no Docker, no server, no API keys, no environment variables. `npm install` is the whole dependency story; the rest is `npm run dev` for development or `npm run build` + a static file server for production.

Related reading: [`10-configuration-and-environment.md`](10-configuration-and-environment.md) (what is configurable — almost nothing), [`12-development-guide.md`](12-development-guide.md) (day-to-day workflow), [`13-testing-and-quality.md`](13-testing-and-quality.md) (the five gates), [`DEVELOPMENT.md`](DEVELOPMENT.md) (the shorter companion guide).

---

## 1. Prerequisites

| Requirement | Detail | Evidence |
| --- | --- | --- |
| **Node.js** | Modern LTS. The repository's own docs state "Node 20+ (developed on Node 26)" — `docs/DEVELOPMENT.md:24`. Node typings are declared for Node 24 (`@types/node@^24.13.6`, `package.json:35`). This checkout was last run on **Node v26.7.0**. | `package.json:35`, `docs/DEVELOPMENT.md:24` |
| **npm** | A current npm; `package-lock.json` is committed, so `npm ci` is reproducible. This checkout runs **npm 11.19.0**. | `package-lock.json`, `docs/DEVELOPMENT.md:25` |
| **A browser in a secure context** | `crypto.subtle` (encryption **and** the SHA-256 manifest) requires a **secure context**: `https://` or `http://localhost` / `127.0.0.1`. On plain `http://` to a LAN IP the app will fail at the first write. | `src/lib/crypto.ts:21-25`, `:74-79`; `src/export/reportContext.ts:45` |
| **A modern browser, generally** | IndexedDB, Web Crypto, Web Workers, `Blob`/`File`, ES modules, `Array.prototype.at`, `structuredClone`-era APIs. Chromium, Firefox and current Safari are all fine; the app is tested in Chromium-class browsers only (no e2e harness exists — see [`13`](13-testing-and-quality.md) §5). | `src/lib/storage/idb.ts:30-45`, `src/lib/workers.ts:36-44` |
| ~~Database~~ | **Not required.** Storage is IndexedDB in the browser. | `src/lib/storage/idb.ts:23-25` |
| ~~Docker~~ | **Not required.** No `Dockerfile`, no `docker-compose.yml`, no `.dockerignore` in the tree. | verified by file listing |
| ~~Web server / Node server~~ | **Not required for development.** For production you need *some* static file server — see §5. | `next.config.ts:4` |

### 1.1 The one non-obvious prerequisite

The vendored spreadsheet parser is installed from a **local tarball**, not from the registry:

```json
"xlsx": "file:vendor/xlsx-0.20.3.tgz"
```
— `package.json:30`

The tarball is committed (`vendor/xlsx-0.20.3.tgz`, 2.4 MB) and `.gitignore:43-48` deliberately negates the ignore rules so it stays tracked:

> *"package.json resolves `xlsx` as file:vendor/xlsx-0.20.3.tgz, so this tarball is required for `npm install`. Never blanket-ignore archives; the negation below fails loudly if someone adds a rule that would swallow it."*

If `npm install` fails with a missing-tarball error, the clone is incomplete — re-clone rather than trying to fetch `xlsx` from npm.

---

## 2. Clone

```bash
git clone <repository-url>
cd <repository-name>
```

**Read the checkout path before you continue.** If the absolute path contains `&` — and *this project's own folder is named `PIPELINE-FOR-VHSND&PMSMA`* — then `npm`'s `.bin` shims will not work. See §4, which is the single most important operational note in this document.

If you have the freedom to choose, **clone to a path without `&`**; that fixes every symptom at once.

Verify the clone landed completely:

```bash
git status          # expect: clean working tree
ls vendor           # expect: xlsx-0.20.3.tgz
```

---

## 3. Install

```bash
npm install
```

Or, for an exact reproduction of the lockfile:

```bash
npm ci
```

What this installs:

| Group | Packages | Notes |
| --- | --- | --- |
| Runtime | `docx-templates`, `html-to-image`, `idb-keyval`, `next@16.3.6`, `pptxgenjs`, `react@19.2.8`, `react-dom@19.2.8`, `react-dropzone`, `recharts`, `xlsx` (local tarball), `zod` (declared but **unused** — no `from "zod"` anywhere in `src/`, `tests/` or `scripts/`), `zustand` | `package.json:20-33` |
| Development | `@types/node`, `@types/react`, `@types/react-dom`, `babel-plugin-react-compiler`, `eslint@^9`, `eslint-config-next@16.3.6`, `typescript@^5`, `vitest@^5.0.1` | `package.json:34-43` |
| Overrides | `image-size` pinned to `2.0.4` | `package.json:44-46` |

No post-install script, no database migration, no `.env` to create.

> **If `npm install` succeeds but `npm run <anything>` fails with a shim error**, that is §4, not a broken install.

---

## 4. Run in development

### 4.1 The normal command

```bash
npm run dev          # → next dev  (package.json:7)
```

Open <http://localhost:3000>. **Use trailing slashes** — `/ingest/`, `/review/`, `/viz/`, `/report/` — because `next.config.ts:5` sets `trailingSlash: true`.

### 4.2 The Windows `&` gotcha — call `node` directly

**Symptom.** In a checkout whose path contains `&`, `cmd` splits the path when npm resolves a local binary, and every command that shells out to a `.bin` shim fails:

```
'PMSMA\node_modules\.bin\' is not recognized as an internal or external command.
Cannot find module 'C:\Users\...\Downloads\typescript\bin\tsc'
```

This affects `npx <pkg>`, `npm run lint`, `npm test`, `npm run typecheck` and `npm run build` — documented at `docs/DEVELOPMENT.md:37-47`.

**Two ways out.**

1. **Preferred:** clone to a path without `&`. One change fixes everything.
2. **Otherwise:** invoke the package entry points through `node` directly. These are the exact working commands for this repository:

```powershell
# Development server
node .\node_modules\next\dist\bin\next dev --turbo --port 3000 --hostname 127.0.0.1

# Type check
node .\node_modules\typescript\bin\tsc --noEmit

# Lint
node .\node_modules\eslint\bin\eslint.js .

# Tests
node .\node_modules\vitest\vitest.mjs run

# Offline build gate
node .\scripts\check-offline.mjs
```

Notes on these commands:

- `--turbo`, `--port` and `--hostname` are **Next.js CLI flags**, not `package.json` script arguments — `package.json:7` is the bare `next dev`. Turbopack is the default bundler in Next 16 (`docs/AI_AGENT_CONTEXT.md:40`, `PROJECT_CONTEXT.md:180`). The exact flag acceptance was **Not verified from the current repository** — `node_modules/` was not installed in this checkout at the time of writing.
- `--hostname 127.0.0.1` keeps the dev server on the loopback interface, which is also what makes it a **secure context** for `crypto.subtle`. Binding to `0.0.0.0` and browsing to a LAN IP would break encryption over plain HTTP.
- `node .\node_modules\typescript\bin\tsc` and `node .\node_modules\typescript\lib\tsc.js` are equivalent entry points; the repository's own docs use the `lib\tsc.js` form (`docs/DEVELOPMENT.md:55`, `PROJECT_CONTEXT.md:999`).
- `node .\scripts\check-offline.mjs` and the other `scripts/*.mjs` files already shell out to `node`, so `npm run build:check-offline` works in both cases (`docs/DEVELOPMENT.md:62`).

### 4.3 Smoke test

1. Open <http://localhost:3000> — you should see the four stage cards (Ingest → Review → Visualise → Report) from `src/app/page.tsx:11-40`.
2. Go to **Ingest** and drop `sample-data/vhsnd-sample.xlsx`. It is a 160-row synthetic workbook with deliberately planted contradictions, so the Review screen will have real work to do.
3. Review → resolve a few rows → **Visualise** → add a chart → **Report** → download the CSV, the audit JSON and the PPTX.

The DOCX button will read **"DOCX (template pending)"** until `npm run embed:templates` has been run — see §6.

---

## 5. Production: build a static export and serve it

### 5.1 `next start` does not work for this project

`package.json:9` defines `"start": "next start"`, but that command **cannot serve this application**:

- `next.config.ts:4` — `output: "export"` → the build emits static files, not a server bundle.
- `next.config.ts:6` — `distDir: "out"` → the output is a directory.
- With export mode there is no `.next/server` runtime, no Node process, no `output: "standalone"` server, and no request handler to authenticate, route or render.

**The production path is: `npm run build`, then serve `out/` from a static file server.**

### 5.2 Build

```bash
npm run build            # → next build  (package.json:8)
```

Result — a pure static export in `out/`:

```
out/index.html
out/ingest/index.html
out/review/index.html
out/viz/index.html
out/report/index.html
out/404.html
out/_not-found/index.html
out/_next/**            (JS/CSS chunks, fonts, static assets)
```

No Node process, no database, no server-side rendering at runtime, no `out/dev/` (that is dev-server scratch space and is deleted by the build).

### 5.3 Serve it

Any static file server that honours **directory indexes** works, because `trailingSlash: true` (`next.config.ts:5`) makes `/ingest/` resolve to `out/ingest/index.html`.

Two hard requirements:

| Requirement | Why | Evidence |
| --- | --- | --- |
| **HTTPS, or `http://localhost`** | `crypto.subtle` requires a secure context. Without it, encryption, persistence and the SHA-256 manifest all fail. | `src/lib/crypto.ts:21-25`; `src/export/reportContext.ts:45` |
| **A real HTTP origin** | `file://` **does not work**: built HTML references root-absolute `/_next/…` assets (which resolve to the filesystem root under `file://`), `crypto.subtle` is unavailable on a `file://` origin in most browsers, and module Workers / blob URLs are restricted there. | `PROJECT_CONTEXT.md` §13.4 |

An HTTP file share on a LAN is the intended shape of deployment — but it must be HTTPS, or the crypto will not work.

### 5.4 The offline gate is a release step, not part of `npm run ci`

```bash
npm run build:check-offline   # → node scripts/check-offline.mjs  (package.json:16)
```

It scans every `.js`/`.html` under `out/` for `fetch`/`WebSocket`/`EventSource`/`XMLHttpRequest` calls to an `http(s)://` URL and for remote `src=`/`href=`, and refuses to ship if it finds any (`scripts/check-offline.mjs:18-34`). `npm run ci` (`package.json:18`) does **not** include it; `npm run build:all` (`package.json:17`) does.

### 5.5 Deployment host — unestablished

**Not verified from the current repository.** There is no `Dockerfile`, no `docker-compose.yml`, no `vercel.json`, no `netlify.toml`, no `firebase.json`, no GitHub Actions workflow and no deployment documentation in the tree. `.gitignore:37` ignores `.vercel`, which hints at a past or intended Vercel usage but is **not** evidence of a deployment.

What a host must provide, in summary: HTTPS (or localhost), directory-index support, correct MIME types for `.js` module workers, and enough disk for the export plus the operator's local data (which lives in the browser, not on the host).

---

## 6. Fixtures and templates

Everything below is committed to the repository, so a fresh clone has all of it.

### 6.1 `sample-data/` — import fixtures

| Path | Contents | Used by |
| --- | --- | --- |
| `sample-data/vhsnd-sample.xlsx` | 160-row synthetic workbook with deliberately broken rows, so every stage has something to do. | `tests/sample-data.test.ts`; the manual smoke test in §4.3 |
| `sample-data/DATASET_1.xlsx` | A real label-headed ODK/Excel export — the shape district users actually produce. | `tests/odk-import.test.ts`, `tests/dataset-1-odk.test.ts` |
| `sample-data/DATA_EX_SHAPE.csv` | Two-row-header CSV twin (label row + code row). | `tests/two-row-odk-export.test.ts` |

Regenerating the synthetic sample: `npm run make:sample` → `node scripts/make-sample-data.cjs` (`package.json:15`). **This script is currently broken** — it contains ESM `import` statements inside a `.cjs` file, so Node throws `Cannot use import statement outside a module`. The committed `.xlsx` is up to date, so this is not blocking. See [`12-development-guide.md`](12-development-guide.md) §7.

### 6.2 `templates/` — report letterheads

| Path | Contents |
| --- | --- |
| `templates/default/vhsnd-letter.docx` | A generic, valid DOCX letter with `{{…}}` placeholders (`{{dataset.name}}`, `{{summary.*}}`, `{{FOR chart IN charts}}`, `{{IMAGE chartImage($chart.blobKey)}}`, `{{manifest}}` — `scripts/make-default-templates.mjs:33-66`). |

To use your own official letterhead, drop a `.docx` (or `.pptx`) into `templates/<dir>/` and run:

```bash
npm run embed:templates
```

That rebuilds the default template and re-embeds everything into `src/export/templates.generated.ts` (`package.json:14`). **This step is mandatory** — the Report screen reads the generated registry (`src/app/report/page.tsx:11`) and shows "DOCX (template pending)" while it is empty (`src/app/report/page.tsx:200-201`).

The PPTX deck needs no template — `src/export/pptxReporter.ts` builds its slides directly.

### 6.3 `data/` and reference material

| Path | Contents |
| --- | --- |
| `data/vhsnd-columns.csv` | The source of truth for the 253-column registry: `label,code` pairs, no header row, quoted labels where they contain commas. `node scripts/gen-columns.mjs` turns it into `src/schema/columns-vhsnd.ts`. |
| `pdf-extracted.txt` | Extracted text of the survey specification — reference material for understanding the form, not used by the build. |

---

## 7. Full command reference

Everything the operator needs, in one place. The middle column is the normal `npm` invocation; the right column is the equivalent that works in a path containing `&`.

| Purpose | npm | Direct `node` |
| --- | --- | --- |
| Install | `npm install` | — |
| Dev server | `npm run dev` | `node .\node_modules\next\dist\bin\next dev --turbo --port 3000 --hostname 127.0.0.1` |
| Production build | `npm run build` | `node .\node_modules\next\dist\bin\next build` |
| Serve production | *(none — `npm start` does not work)* | serve `out/` from any static file server |
| Types | `npm run typecheck` | `node .\node_modules\typescript\bin\tsc --noEmit` |
| Lint | `npm run lint` | `node .\node_modules\eslint\bin\eslint.js .` |
| Tests | `npm run test` | `node .\node_modules\vitest\vitest.mjs run` |
| Tests, watch | `npm run test:watch` | `node .\node_modules\vitest\vitest.mjs` |
| Offline gate | `npm run build:check-offline` | `node .\scripts\check-offline.mjs` |
| Embed templates | `npm run embed:templates` | `node .\scripts\make-default-templates.mjs` then `node .\scripts\embed-templates.mjs` |
| Regenerate columns | *(no npm script)* | `node .\scripts\gen-columns.mjs` |
| All gates 1–4 | `npm run ci` | run the four commands above in order |
| Full shippable pipeline | `npm run build:all` | build → offline gate → embed templates |

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `'…\node_modules\.bin\' is not recognized` | `&` in the checkout path | Use the `node …` commands in §7, or re-clone without `&` |
| `Cannot find module '…/xlsx-0.20.3.tgz'` | Incomplete clone — the vendored tarball is missing | Re-clone; the tarball must be tracked (`package.json:30`, `.gitignore:43-48`) |
| Dev server 404s or hangs after a build | `next build` **deletes `out/`**, including `out/dev/` where the dev server keeps its manifests | Restart `next dev` (`docs/DEVELOPMENT.md:78`) |
| App loads but the first write throws | Not a secure context — `crypto.subtle` unavailable over plain `http://` to a LAN IP | Use `https://`, or `http://localhost` / `http://127.0.0.1` |
| `crypto.subtle` undefined in the console | Same as above | Same as above |
| DOCX button reads "DOCX (template pending)" | The embedded template registry is empty | `npm run embed:templates` |
| `npm start` errors or exits immediately | Export mode — there is no server build | Serve `out/` statically (§5.3) |
| Opening `out/index.html` from disk shows a blank page | `file://` is not supported — root-absolute `/_next/…` assets 404, and `crypto.subtle` is unavailable | Serve `out/` over HTTP(S) |
| `npm run make:sample` throws `Cannot use import statement outside a module` | `scripts/make-sample-data.cjs` uses ESM syntax in a `.cjs` file | The committed fixture is current; convert the script to `require` if you need to regenerate it |
| `npm run lint` reports errors in `scripts/*.cjs` about `require` | The `.cjs` override is in `eslint.config.mjs:8-15` — check that the file still ends in `.cjs` | Rename the extension back to `.cjs` |
| The offline gate fails after adding a link | A remote URL reached the built output | Host the asset locally or inline it; the gate refuses to ship (`scripts/check-offline.mjs:31-34`) |

More: [`DEVELOPMENT.md` § Troubleshooting](DEVELOPMENT.md#troubleshooting) and [`12-development-guide.md`](12-development-guide.md) §7.
