# 10 — Configuration and Environment

**Scope:** every knob, file and setting that changes how this application behaves. The headline finding is that **there are no environment variables at all** — the app has no server-side configuration surface — and the entire configuration story is six small files at the repository root plus the generated-file pipeline.

Related reading: [`11-installation-and-setup.md`](11-installation-and-setup.md) (running it), [`12-development-guide.md`](12-development-guide.md) (workflow and conventions), [`13-testing-and-quality.md`](13-testing-and-quality.md) (the gates), [`09-authentication-and-authorization.md`](09-authentication-and-authorization.md) (there is nothing to authenticate against).

---

## 1. Environment variables: none

### 1.1 The proof

`process.env` does not appear in the application source.

```
Get-ChildItem .\src,.\scripts,.\tests -Recurse -File -Include *.ts,*.tsx,*.mjs,*.cjs |
  Select-String -Pattern 'process\.env'
→ NO MATCHES (76 files scanned: 48 in src/, 9 in scripts/, 19 in tests/)
```

The only `process.env` occurrences anywhere in the working tree are inside `out/dev/build/chunks/**` and `out/dev/static/chunks/**` — those are **Next.js/Turbopack runtime internals** emitted into the dev-server scratch directory, not application code. They are gitignored (`.gitignore:18` → `/out/`).

Corroborating evidence:

| Check | Result |
| --- | --- |
| `.env` file | absent |
| `.env.example`, `.env.local` | absent |
| `import.meta.env` in `src/` | absent |
| `next.config.ts` `env:` key | absent |
| `NODE_ENV` references in app code | absent (Next.js sets it itself) |

### 1.2 Why the ignore rules still mention `.env`

`.gitignore` ignores env files **as a default precaution**, not because the app needs one:

- `.gitignore:33-34` — `# env files (can opt-in for committing if needed)` / `.env*`
- `.gitignore:88-90` — `# local env overrides (the app reads no env vars today; ignore them if added)` / `.env*.local` / `*.local`

The comment at `.gitignore:88` is explicit: *the app reads no env vars today*. The rules exist so that the day someone adds one, the secret is not accidentally committed.

> **Watch out:** `.gitignore:90` ignores `*.local` — that pattern is broader than env files and will also match any file ending in `.local` (for example `foo.local`). This is inherited from the create-next-app template, not a deliberate choice.

### 1.3 There is nothing to configure at runtime

Because `next.config.ts:4` sets `output: "export"`, the shipped artefact is a directory of static files. There is no process to read configuration from, no `.env` to load, and no connection string, API key, feature flag or log level to set.

If a future change introduces a configuration value, the natural home is a module-level constant in the owning source file (for example `SCHEMA_VERSION` at `src/schema/index.ts:4` or `DB_VERSION` at `src/lib/storage/idb.ts:24`), **not** an environment variable — that keeps the "no configuration, no secrets" property intact.

---

## 2. The real configuration files

### 2.1 `next.config.ts` — the build configuration

Whole file is 13 lines (`next.config.ts:1-13`).

| Key | Line | Value | Effect |
| --- | ---: | --- | --- |
| `output` | `next.config.ts:4` | `"export"` | Static export. **No server process at runtime**, which is why there is no middleware, no API route, no `headers()` and no auth surface (see [`09`](09-authentication-and-authorization.md) §2.4). |
| `trailingSlash` | `next.config.ts:5` | `true` | Emits `out/ingest/index.html` rather than `out/ingest.html`, so a plain static file server with directory indexes works. Users must navigate to `/ingest/`, not `/ingest`. |
| `distDir` | `next.config.ts:6` | `"out"` | The export is written to `out/`. **Consequence:** `next dev` keeps its own manifests under `out/dev/`, and `next build` deletes `out/` — so a build invalidates a running dev server. See [`12-development-guide.md`](12-development-guide.md) §7. |
| `images.unoptimized` | `next.config.ts:7-9` | `true` | No image-optimisation server is needed at runtime; `<Image>` emits the original file. |
| `reactCompiler` | `next.config.ts:10` | `true` | React Compiler is enabled for the app. The matching Babel plugin is a dev dependency (`package.json:38`, `babel-plugin-react-compiler@^1.0.0`). |

**Deliberately absent** from `next.config.ts`: `basePath`, `assetPrefix`, `env`, `publicRuntimeConfig`, `headers()`, `redirects()`, `rewrites()`, `webpack`, `turbopack`, `experimental`, `serverExternalPackages`, `i18n`, `generateBuildId`. None of them is needed for a fully static, single-origin export.

### 2.2 `tsconfig.json` — the type configuration

Whole file is 44 lines (`tsconfig.json:1-44`).

| Setting | Line | Value | Note |
| --- | ---: | --- | --- |
| `target` | `tsconfig.json:3` | `"ES2017"` | Conservative browser baseline. |
| `lib` | `tsconfig.json:4-8` | `["dom", "dom.iterable", "esnext"]` | DOM types are required: `crypto.subtle`, `IndexedDB`, `Worker`, `Blob`. |
| `allowJs` | `tsconfig.json:9` | `true` | — |
| `skipLibCheck` | `tsconfig.json:10` | `true` | — |
| **`strict`** | `tsconfig.json:11` | `true` | The core quality gate. See [`12-development-guide.md`](12-development-guide.md) §6. |
| **`noEmit`** | `tsconfig.json:12` | `true` | `tsc` is a checker only; Next.js does the emitting. This is what makes `npm run typecheck` → `tsc --noEmit` safe. |
| `esModuleInterop` | `tsconfig.json:13` | `true` | — |
| `module` / `moduleResolution` | `tsconfig.json:14-15` | `"esnext"` / `"bundler"` | Matches the bundler-based Next.js build. |
| `resolveJsonModule` | `tsconfig.json:16` | `true` | — |
| `isolatedModules` | `tsconfig.json:17` | `true` | Required by Next.js. |
| `jsx` | `tsconfig.json:18` | `"react-jsx"` | Automatic runtime. |
| `incremental` | `tsconfig.json:19` | `true` | Produces `tsconfig.tsbuildinfo` (gitignored, `.gitignore:40`). |
| `plugins` | `tsconfig.json:20-24` | `[{ "name": "next" }]` | Next.js's own TS plugin. |
| **`paths`** | `tsconfig.json:25-29` | `"@/*"` → `"./src/*"` | The path alias every module uses. Mirrored in `vitest.config.ts:10-14` so tests import application modules unchanged. |

`include` (`tsconfig.json:31-40`) covers `next-env.d.ts`, all `**/*.ts(x|mts)`, and — notably — the **generated types of both build modes**: `.next/types/**/*.ts`, `.next/dev/types/**/*.ts`, `out/types/**/*.ts`, `out/dev/types/**/*.ts` (`tsconfig.json:35-39`). `exclude` is `node_modules` (`tsconfig.json:41-43`).

### 2.3 `eslint.config.mjs` — the lint configuration

Whole file is 26 lines (`eslint.config.mjs:1-26`). ESLint 9 **flat config**.

| Element | Line | Purpose |
| --- | ---: | --- |
| `defineConfig`, `globalIgnores` from `eslint/config` | `eslint.config.mjs:1` | Flat-config helpers. |
| `eslint-config-next/core-web-vitals` | `eslint.config.mjs:2`, `:6` | Next.js core-web-vitals rule set. |
| `eslint-config-next/typescript` | `eslint.config.mjs:3`, `:7` | TypeScript-aware rules. |
| **`.cjs` override** | `eslint.config.mjs:8-15` | `@typescript-eslint/no-require-imports` is turned **off** for `**/*.cjs`. The comment at `:9-10` explains why: "Node maintenance scripts are CommonJS by extension (`.cjs`), so `require` is the only way for them to load a module." |
| **`globalIgnores`** | `eslint.config.mjs:16-23` | Overrides eslint-config-next's own defaults. Ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts` (`:19-22`). The comment at `:16` marks this as a deliberate override, not an addition. |

There is **no** `.eslintignore`, **no** `.prettierrc`, **no** `prettier.config.mjs` and **no** formatting tool configured. Formatting is therefore a matter of hand convention, not automation.

### 2.4 `vitest.config.ts` — the test configuration

Whole file is 15 lines (`vitest.config.ts:1-15`).

| Element | Line | Value | Effect |
| --- | ---: | --- | --- |
| `environment` | `vitest.config.ts:6` | `"node"` | **No DOM.** Browser APIs must be stubbed; Node's global `crypto` *is* available, which is why `crypto.subtle` code paths work in tests. |
| `include` | `vitest.config.ts:7` | `["tests/**/*.test.ts"]` | Only `tests/`, only `.test.ts`. Nothing under `src/` is picked up as a test. |
| `reporters` | `vitest.config.ts:8` | `["default"]` | Fixed. Vitest 5 rejects `--reporter=basic`; do not pass it. |
| `resolve.alias` | `vitest.config.ts:10-14` | `"@"` → `path.resolve(__dirname, "./src")` | Mirrors `tsconfig.json:25-29` so `@/…` imports work unchanged in tests. |

**Not configured:** no `coverage` block — no provider, no `reporter`, no `thresholds` (so `vitest run --coverage` has no configured provider), no `globals`, no `setupFiles`, no `pool`/`threads` tuning, no `testTimeout` override (the suite relies on the 120 s worker timeouts in `src/lib/workers.ts:62`, `:140` rather than Vitest's own timeout). See [`13-testing-and-quality.md`](13-testing-and-quality.md) §6.

### 2.5 `.gitignore` — what is deliberately not tracked

103 lines (`.gitignore:1-103`). The entries that matter for configuration:

| Pattern | Line | Effect |
| --- | ---: | --- |
| `/node_modules` | `.gitignore:4` | — |
| `/coverage` | `.gitignore:14` | Coverage output is ignored, but **no coverage tool is configured** — this is a leftover default. |
| `/.next/` | `.gitignore:17` | Next.js dev/build cache. |
| `/out/` | `.gitignore:18` | The static export **and** the dev-server scratch directory. The shippable artefact is not committed. |
| `/build` | `.gitignore:21` | — |
| `.env*` | `.gitignore:34` | See §1.2. |
| `.vercel` | `.gitignore:37` | Hints at a past or intended Vercel usage — **not evidence of a deployment**. |
| `*.tsbuildinfo` | `.gitignore:40` | Incremental-compiler cache. |
| `next-env.d.ts` | `.gitignore:41` | Regenerated by Next.js. |
| `!vendor/` / `!vendor/**` | `.gitignore:47-48` | **Critical.** `package.json:30` resolves `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`, so the vendored tarball must stay tracked or `npm install` fails. The comment at `.gitignore:43-46` warns: "Never blanket-ignore archives; the negation below fails loudly if someone adds a rule that would swallow it." |
| `*.log`, `logs/`, `*.pid`, `*.seed` | `.gitignore:69-77` | Runtime noise. |
| `tmp/`, `temp/`, `.tmp/`, `.cache/` | `.gitignore:80-84` | Scratch output. |
| `.env*.local`, `*.local` | `.gitignore:89-90` | See §1.2. |
| `.vite/`, `.turbo/`, `.eslintcache`, `.parcel-cache/` | `.gitignore:93-96` | Tool caches. |
| `junit.xml`, `test-results/`, `playwright-report/`, `blob-report/`, `.playwright/` | `.gitignore:99-103` | Test-report artefacts for tooling that **does not exist** in this repo. |

The Windows-noise block (`.gitignore:50-57`) exists because this checkout lives on Windows.

### 2.6 `package.json` — dependencies and overrides

- `package.json:4` — `"private": true`. npm will refuse to publish this package.
- `package.json:30` — `"xlsx": "file:vendor/xlsx-0.20.3.tgz"`, a local tarball, not a registry package. This is the offline-install story for the spreadsheet parser.
- `package.json:44-46` — `overrides: { "image-size": "2.0.4" }`, pinning a transitive dependency.
- `package.json:24` — `next` is pinned exactly (`"16.3.6"`), as are `react`/`react-dom` (`19.2.8`, `package.json:27-28`), `eslint-config-next` (`16.3.6`, `package.json:40`) and `eslint` (`^9`, `package.json:39`).

### 2.7 Files that are generated, not configured

| File | Generated by | Committed? |
| --- | --- | --- |
| `src/schema/columns-vhsnd.ts` | `node scripts/gen-columns.mjs` from `data/vhsnd-columns.csv` (`scripts/gen-columns.mjs:9-10`) | **Yes** — commit both the CSV and the generated file. |
| `src/export/templates.generated.ts` | `node scripts/embed-templates.mjs` from `templates/**` (`scripts/embed-templates.mjs:13-14`) | **Yes** |
| `templates/default/vhsnd-letter.docx` | `node scripts/make-default-templates.mjs` | **Yes** |
| `AGENTS.md` (rules block) | `next dev` / `next build` — `AGENTS.md:7` | **Yes** — commit it, do not delete it. See [`12-development-guide.md`](12-development-guide.md) §5. |
| `next-env.d.ts` | Next.js / TypeScript | No (`.gitignore:41`) |
| `tsconfig.tsbuildinfo` | `tsc --incremental` | No (`.gitignore:40`) |
| `out/**` | `next build` | No (`.gitignore:18`) |

---

## 3. The npm scripts

All twelve scripts, verbatim from `package.json:6-19`.

| Script | Exact command | Line | What it does |
| --- | --- | ---: | --- |
| `dev` | `next dev` | `package.json:7` | Development server with hot reload. Writes its scratch manifests into `out/dev/`. |
| `build` | `next build` | `package.json:8` | Production build → **static export** written to `out/`. Wipes `out/` first, including `out/dev/`. |
| `start` | `next start` | `package.json:9` | **Not meaningful for this project.** `output: "export"` means there is no server build to start. See §5. |
| `lint` | `eslint` | `package.json:10` | Lints using the flat config. No path argument — ESLint's default discovery applies. |
| `typecheck` | `tsc --noEmit` | `package.json:11` | Type-checks only (`noEmit: true`, `tsconfig.json:12`). |
| `test` | `vitest run` | `package.json:12` | Runs the suite once and exits. |
| `test:watch` | `vitest` | `package.json:13` | Watch mode. |
| `embed:templates` | `node scripts/make-default-templates.mjs && node scripts/embed-templates.mjs` | `package.json:14` | Rebuilds the default DOCX letter, then base64-embeds everything under `templates/` into `src/export/templates.generated.ts`. |
| `make:sample` | `node scripts/make-sample-data.cjs` | `package.json:15` | Regenerates `sample-data/vhsnd-sample.xlsx`. **Currently broken** — the `.cjs` file contains ESM `import` statements. See [`12-development-guide.md`](12-development-guide.md) §7. |
| `build:check-offline` | `node scripts/check-offline.mjs` | `package.json:16` | **Gate 5.** Fails if the emitted static output references any remote `http(s)://` URL (`scripts/check-offline.mjs:18-34`). Requires `out/` to exist (`:13-16`). |
| `build:all` | `npm run build && npm run build:check-offline && npm run embed:templates` | `package.json:17` | The full shippable pipeline: export → offline gate → embed templates. |
| `ci` | `npm run typecheck && npm run lint && npm run test && npm run build` | `package.json:18` | Gates 1–4. **Does not include the offline gate.** |

Two scripts shell out to `node scripts/*.mjs` directly and therefore work regardless of the `&`-in-path problem; the rest rely on npm's `.bin` shims and may not (see [`11-installation-and-setup.md`](11-installation-and-setup.md) §4).

### 3.1 The gate chain

```
typecheck ──▶ lint ──▶ test ──▶ build          (npm run ci, package.json:18)
                                              ◀── build:check-offline  (not in ci)
                                              ◀── embed:templates      (not in ci)
```

`npm run build:all` (`package.json:17`) is the only script that chains build → offline gate → templates.

---

## 4. Generated-file pipeline

Three files are generated from a source-of-truth artefact. **Never hand-edit a generated file.**

```
data/vhsnd-columns.csv                     (source of truth, hand-edited)
        │
        │  node scripts/gen-columns.mjs          ← NO npm script; run manually
        │  (scripts/gen-columns.mjs:9-10)
        ▼
src/schema/columns-vhsnd.ts               (253-column { code, label } registry,
                                           AUTO-GENERATED header at :65-67)

templates/default/vhsnd-letter.docx
templates/<dir>/*.{docx,pptx}              (hand-authored / official letterhead)
        │
        │  npm run embed:templates
        │    ├─ node scripts/make-default-templates.mjs  → templates/default/vhsnd-letter.docx
        │    └─ node scripts/embed-templates.mjs         (scripts/embed-templates.mjs:13-14)
        ▼
src/export/templates.generated.ts         (base64 registry, AUTO-GENERATED header at :42-44)

npm run build  →  out/                    (gitignored, .gitignore:18)
```

Notes:

- The column CSV is ordered **`label,code`** — label first, no header row, labels containing commas must be quoted (`scripts/gen-columns.mjs:16-48` parses the quoting). The generated file is **sorted by code** (`scripts/gen-columns.mjs:63`), so its order does not match the CSV.
- `gen-columns.mjs` warns and skips any row with an empty code (`scripts/gen-columns.mjs:53-56`).
- `embed-templates.mjs` scans one level of `templates/*/` for `.docx`/`.pptx` (`scripts/embed-templates.mjs:17-29`) and emits an empty registry with a warning if none are found (`:38-40`).
- The Report screen reads the embedded registry at `src/app/report/page.tsx:11` and shows **"DOCX (template pending)"** when it is empty (`src/app/report/page.tsx:200-201`, and the error message at `:101`).

---

## 5. `next start` is not a valid path for this project

`package.json:9` defines `start` as `next start`, but the build is a **static export** (`next.config.ts:4`) with `distDir: "out"` (`next.config.ts:6`). There is therefore:

- no server bundle to start,
- no `output: "standalone"` server,
- no runtime Node process of any kind.

`npm start` will not serve this application. The production path is: `npm run build`, then serve the `out/` directory from **any static file server** that honours directory indexes (because `trailingSlash: true`, `next.config.ts:5`).

Two further constraints on any host:

1. **HTTPS or `localhost`** — `crypto.subtle` requires a secure context (`src/lib/crypto.ts:21-25`, `src/export/reportContext.ts:45`). Without it, encryption, persistence and the SHA-256 manifest all fail.
2. **`file://` does not work** — built pages reference root-absolute `/_next/…` assets, and `crypto.subtle` is unavailable on a `file://` origin in most browsers.

Which host actually serves `out/` in production is **Not verified from the current repository.** There is no `Dockerfile`, no `vercel.json`, no `netlify.toml`, no `firebase.json` and no deployment documentation in the tree. `.gitignore:37` ignores `.vercel`, which hints at a past or intended Vercel usage but is not evidence of a deployment.

---

## 6. Configuration summary

| Question | Answer |
| --- | --- |
| Environment variables | **None.** `process.env` — 0 matches in 76 source files. |
| `.env` file needed | No. |
| Server-side configuration | **None needed** — there is no server (`next.config.ts:4`). |
| Feature flags | None. Behaviour is compile-time constants (e.g. `SCHEMA_VERSION`, `src/schema/index.ts:4`; `DB_VERSION`, `src/lib/storage/idb.ts:24`). |
| Runtime configuration file | None. The only user-facing "configuration" is the operator's own data (imported exports) and, optionally, a letterhead template in `templates/`. |
| Build-time configuration | `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts` — all four are in the table above. |
| Secrets in the repository | **None.** No `.env`, no `*.pem` (also gitignored at `.gitignore:25`), no API keys. |
| Deployment host | **Not verified from the current repository.** |
| CI configuration | **None.** No `.github/`, no `.gitlab-ci.yml`, no Jenkinsfile, no Azure Pipelines. See [`13-testing-and-quality.md`](13-testing-and-quality.md) §6. |
