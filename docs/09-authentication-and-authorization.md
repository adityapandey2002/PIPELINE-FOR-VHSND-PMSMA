# 09 — Authentication and Authorization

**Scope:** every access-control, identity and credential mechanism in this repository — and, more importantly, every one that is *absent*.

**Short answer: there are none.** The VHSND & PMSMA Pipeline has **no authentication, no authorization, no user model, no sessions, no roles, no password hashing, no middleware, no rate limiting and no CORS configuration**. This is not a gap that was discovered late; it is the design. The app is a static, single-operator, on-device tool whose only access control is *whoever can open the page in the browser on this machine*.

Everything below is grounded in the source. Claims that could not be established from the repository are marked **"Not verified from the current repository."**

Related reading: [`PIPELINE.md`](PIPELINE.md) (full codemap), [`PROJECT_CONTEXT.md` §14](../PROJECT_CONTEXT.md) (security summary), [`08-api-documentation.md`](08-api-documentation.md) (the de-facto internal API), [`10-configuration-and-environment.md`](10-configuration-and-environment.md) (there are no environment variables to configure).

---

## 1. Capability summary

| Capability | Status | Primary evidence |
| --- | --- | --- |
| User accounts / user model | **Absent** | no `User` type anywhere; `src/contracts/` holds five domain types only (`dataset.ts`, `chart.ts`, `indicator.ts`, `resolution.ts`, `violation.ts`) |
| Login / sign-in UI | **Absent** | `src/app/` has exactly five pages — `/`, `/ingest`, `/review`, `/viz`, `/report` — none is a sign-in screen |
| Credential storage | **Absent** | `grep -i 'password'` → 0 matches in 76 files |
| Password hashing (bcrypt/argon2/scrypt/pbkdf2) | **Absent** | `grep -i 'bcrypt\|argon\|scrypt\|pbkdf\|salt'` → 0 matches |
| Session cookies | **Absent** | `grep -i 'cookie'` → 0 matches; there is no server to set one |
| Server-side sessions | **Absent** | `next.config.ts:4` `output: "export"` — no server process exists at runtime |
| Roles / permissions / RBAC | **Absent** | `grep -i 'role\|permission'` → 0 matches |
| API keys / bearer tokens / JWT | **Absent** | `grep -i 'apikey\|api_key\|bearer\|jwt'` → 0 matches |
| CSRF protection | **Absent / not applicable** | `grep -i 'csrf'` → 0 matches; no cross-origin form posts exist |
| Middleware | **Absent** | no `middleware.ts` file anywhere in the repo; the only "middleware" hit is `zustand/middleware` at `src/stores/workflowStore.ts:2` |
| Rate limiting / throttling | **Absent** | `grep -i 'rate.?limit'` → 0 matches |
| CORS configuration | **Absent** | `grep -i 'cors'` → 0 matches; no `headers()` call, no `next.config` CORS key |
| Server actions / API routes | **Absent** | no `route.ts` anywhere under `src/`; no `src/app/api/` directory |
| Audit trail (not auth, but the substitute) | **Present** | `src/export/reportContext.ts:8-14`, `:64-119` |

---

## 2. Evidence of absence

### 2.1 How the search was done

All absence claims below come from one reproducible sweep: every `.ts`, `.tsx`, `.mjs` and `.cjs` file in `src/` (48), `scripts/` (9) and `tests/` (19) — **76 files** — searched case-insensitively for each term. The counts are quoted verbatim.

```
Get-ChildItem .\src,.\scripts,.\tests -Recurse -File -Include *.ts,*.tsx,*.mjs,*.cjs |
  Select-String -Pattern '<term>' -CaseSensitive:$false
```

### 2.2 Term-by-term results

| Search term | Matches | Interpretation |
| --- | ---: | --- |
| `login` | **0** | no sign-in of any kind |
| `password` | **0** | no credential, no password field, no password prompt |
| `role` | **0** | no roles, no role checks, no role type |
| `permission` | **0** | no permission model |
| `bearer` | **0** | no bearer-token handling |
| `jwt` | **0** | no JSON Web Tokens |
| `cookie` | **0** | no cookies read or written |
| `csrf` | **0** | no CSRF token |
| `cors` | **0** | no CORS headers, no `Access-Control-*` |
| `rate.?limit` | **0** | no throttling of any kind |
| `bcrypt`, `argon`, `scrypt`, `pbkdf`, `salt` | **0** | no password hashing — there is nothing to hash |
| `apiKey`, `api_key` | **0** | no API keys |
| `auth` | **2** | **both false positives** — `src/export/pptxReporter.ts:26` (`pptx.author = ctx.app.name;`, the document *author* metadata) and `src/schema/engine/validate.ts:376` (the English word "authoritative" in a comment) |
| `passphrase` | **1** | `src/lib/crypto.ts:14` — and it is a comment stating the design **deliberately avoids** passphrases (see §4.1) |
| `session` | **109** | **every one is the domain noun "survey session"**, never an auth session. Examples: `src/app/ingest/page.tsx:40` (`const sessionDatasetId = useRef<string | null>(null);`), `src/app/ingest/page.tsx:209` ("exported from the ODK/Excel survey form for VHSND sessions"), `src/lib/comparisons.ts:845` ("mean of N sessions") |
| `token` | **62** | **every one is an ODK select-multiple option token**, not a credential. Examples: `src/contracts/violation.ts:40` ("select-multiple option token"), `src/schema/engine/cellCoercers.ts:7` ("Raw tokens that mean 'no answer' in ODK/Excel exports") |
| `middleware` | **1** | `src/stores/workflowStore.ts:2` — `import { createJSONStorage, persist } from "zustand/middleware";` — the **zustand** middleware, unrelated to Next.js request middleware |

Two names in the codebase *look* like access control and are not:

- `resetSession()` — `src/stores/workflowStore.ts:10` (declared) and `:20` (implemented) — clears `activeDatasetId`. It resets *workflow state*, not an identity.
- `persist(..., { name: "workflow" })` — `src/stores/workflowStore.ts:22-29` — persists the active dataset id into **encrypted IndexedDB** via `createEncryptedStorage()` (`src/lib/storage/idb.ts:239-252`). It is local UI state, not a session token.

### 2.3 No middleware file exists

A recursive search for `middleware.ts` / `middleware.js` / `middleware.tsx` outside `node_modules`, `.next` and `out` returns **no files**. There is no request pipeline to hook into: `next.config.ts:4` sets `output: "export"`, so the built artefact is a pile of static files and there is no request to intercept.

### 2.4 No server, therefore no server-side auth surface

- `next.config.ts:4` — `output: "export"` (static export; no Node server at runtime).
- `next.config.ts:6` — `distDir: "out"`.
- No `route.ts` under `src/`; no `src/app/api/` directory; no `"use server"` action files.
- `src/app/layout.tsx:10-25` sets the CSP as an HTML `<meta http-equiv>` tag, injected at `src/app/layout.tsx:31` — a technique used *because* there is no server that could send a header. The comment at `src/app/layout.tsx:12-14` says so explicitly.

Every screen is a client component (`"use client"` at `src/app/page.tsx:1`, `src/app/ingest/page.tsx:1`, `src/app/report/page.tsx:1`, and the same in `review/` and `viz/`). The only server component is the root layout.

### 2.5 No environment variables

There is nothing to configure, so there is nothing to leak. `process.env` does not appear in `src/`, `scripts/` or `tests/` (0 matches across the same 76 files). The only `process.env` occurrences in the working tree are inside `out/dev/build/chunks/**` — Next.js/Turbopack runtime internals, not application code. See [`10-configuration-and-environment.md`](10-configuration-and-environment.md) §1.

---

## 3. The resulting trust model

Because none of the above exists, the security boundary of this application is **the origin and the machine**.

### 3.1 The trust boundary

```
  ┌────────────────────────────────────────────────────────────┐
  │  District operator's machine                               │
  │                                                            │
  │   Browser profile  ── origin (http://host:port or https)  │
  │      ├─ app bundle (static HTML/JS)                       │
  │      ├─ IndexedDB "vhsnd-pipeline"   (v2)  ← datasets …   │
  │      ├─ IndexedDB "pipeline-crypto"        ← AES key …     │
  │      └─ downloads (PPTX / DOCX / CSV / audit JSON)        │
  └────────────────────────────────────────────────────────────┘
```

Everything inside that box is reachable by anyone who can load the origin in that browser profile. There is no identity to check, so there is nothing to check *against*.

### 3.2 What "access control" reduces to

| Layer | What it actually protects | What it does **not** protect |
| --- | --- | --- |
| Physical / OS access | The machine itself, the user account, disk encryption, screen lock | A second person with a logged-in session |
| Browser profile | Cookies, IndexedDB, localStorage are scoped to the OS user | Another OS user on a shared machine, unless the profile is locked |
| Origin | `crypto.subtle` and IndexedDB are origin-bound, so one origin's data is unreadable from another origin | Anyone who reaches the same origin from the same browser profile |
| CSP (`src/app/layout.tsx:10-25`) | Blocks the app from *connecting out* to a remote host and blocks plugin/`base` injection | It is not an identity mechanism — it constrains what the page may load, not who may use it |
| Offline build gate (`scripts/check-offline.mjs:18-34`) | Fails the build if the emitted JS/HTML references a remote `http(s)://` URL | It proves *absence of egress*, not *presence of an authorised user* |

### 3.3 The single-operator assumption

The application is explicitly built for one operator at a time on one machine:

- One active dataset at a time — `activeDatasetId: string | null` (`src/stores/workflowStore.ts:6`).
- One dataset list with no owner column — `DatasetSummary` (`src/contracts/dataset.ts:42-50`) carries no user field.
- The audit trail records **decisions about rows**, not **who decided** — `AuditRecord` (`src/export/reportContext.ts:8-14`) is `{ rowId, status, keptViolations, justification, decidedAt }`. There is no `actor` field, because there is no actor to record.
- Every resolution carries a free-text `justification` but no author — `src/contracts/resolution.ts` (see `RowResolution`).

### 3.4 What an attacker would need

To read another operator's data they would need one of:

1. The same browser profile on the same machine (no unlock step in the app).
2. The origin key (`pipeline-crypto` / `app-key-v1`) — which lives in the *same* profile, so (1) is the realistic route.
3. A copy of `out/` plus the origin's IndexedDB — the export alone is inert; the data never leaves IndexedDB.

The app's own code states this trade-off at `src/lib/crypto.ts:9-17`:

> *"This protects health data at rest against disk/copy artifacts on shared machines (the realistic threat model for these district computers) without the user-friction of passphrases."*

In other words: the threat model is **data-at-rest artefacts on a shared machine**, and the chosen control is encryption-at-rest, *not* identity. The design deliberately trades authentication away to avoid passphrases.

---

## 4. What *is* present instead

These are the real protections in the codebase. None of them is an access-control mechanism; they are the controls that remain once access control is out of scope.

### 4.1 Encrypted local storage (AES-256-GCM)

- `src/lib/crypto.ts:5` — `ALGO = "AES-GCM"`; `:18-27` `encryptString`, `:29-39` `decryptString`, `:41-49` `encryptBytes`, `:51-57` `decryptBytes`.
- Payload format is `"v1.<ivB64>.<cipherB64>"` (`src/lib/crypto.ts:16`, produced at `:26`); a payload with the wrong shape or version throws `"Unsupported encrypted payload format."` (`src/lib/crypto.ts:31-33`).
- A fresh 12-byte IV per operation — `crypto.getRandomValues(new Uint8Array(12))` at `src/lib/crypto.ts:20` and `:43`.
- The 256-bit key is generated once via `crypto.subtle.generateKey` (`src/lib/crypto.ts:74-77`) and its **raw bytes** are stored in a **separate** IndexedDB database, `pipeline-crypto` / store `keyval` (`src/lib/crypto.ts:3-4`, written at `:79`).
- Every persisted record is written through `encryptString` / `encryptBytes`: datasets (`src/lib/storage/idb.ts:90`), resolutions (`:128`), chart metadata (`:151`), chart blobs (`:177`), the validation cache (`:197`), header overrides (`:221`), and the persisted UI state (`:246`).
- The key is **origin-bound** and **not exportable** — `extractable` is `false` on the imported key (`src/lib/crypto.ts:69`) and the cached `CryptoKey` lives only in memory (`src/lib/crypto.ts:59`).

### 4.2 Content Security Policy

`src/app/layout.tsx:10-25`, injected as a `<meta http-equiv>` at `src/app/layout.tsx:31`:

| Directive | Value | Why it matters here |
| --- | --- | --- |
| `default-src` | `'self'` | baseline |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | the two `unsafe-*` are a **necessary consequence** of a static export with no server to issue nonces (comment at `src/app/layout.tsx:12-14`) |
| `style-src` | `'self' 'unsafe-inline'` | React inline styles |
| `img-src` | `'self' data: blob:` | captured chart images |
| `font-src` | `'self' data:` | — |
| `connect-src` | `'self' data: blob:` | **no remote origin is connectable — this is what enforces "nothing is uploaded"** |
| `media-src` | `'self'` | — |
| `worker-src` | `'self' blob: data:` | module + blob workers |
| `object-src` | `'none'` | no plugins |
| `base-uri` | `'none'` | no `<base>` hijacking |
| `form-action` | `'self'` | no form exfiltration |

A meta-tag CSP cannot enforce `frame-ancestors` or `report-uri` — it is not a defence against clickjacking.

### 4.3 Offline build gate

`scripts/check-offline.mjs` is a build-time gate, not a runtime control:

- It walks `out/` (`:46-55`) and fails the build if any emitted `.js`/`.html` contains a `fetch`/`WebSocket`/`EventSource`/`XMLHttpRequest` call to an `http(s)://` URL, or a remote `src=`/`href=` (`:18-19`).
- It exits non-zero with `"Refusing to ship."` (`:31-34`) and succeeds with `"OK - no remote references in static export."` (`:35`).
- It deliberately skips the `out/dev` scratch directory (`:51`), which is where `next dev` keeps its manifests.
- Wired as `npm run build:check-offline` (`package.json:16`).

This is the mechanism that makes "no server" enforceable rather than aspirational.

### 4.4 Audit log and SHA-256 manifest

- `AuditRecord` — `src/export/reportContext.ts:8-14`: `{ rowId, status, keptViolations, justification, decidedAt }`.
- The audit array is built from every resolution whose status is not `"pending"` and sorted by `decidedAt` — `src/export/reportContext.ts:65-74`.
- `sha256Hex` — `src/export/reportContext.ts:44-47` — `crypto.subtle.digest("SHA-256", …)` rendered as lowercase hex.
- Two hashes are folded into the manifest: `rowsHash` over the canonicalised cleaned rows (`:114`) and `manifest` over the whole context including `rowsHash` (`:116`). Canonicalisation sorts object keys recursively (`src/export/reportContext.ts:35-42`), so the hash is stable.
- The manifest is attached to every export: the audit JSON is the report context verbatim (`src/app/report/page.tsx:86-90`), and the PPTX footer prints `manifest.slice(0, 12)` (`src/export/pptxReporter.ts:39`). The DOCX template carries `{{manifest}}` (`scripts/make-default-templates.mjs:64`).
- The user-facing description: `src/app/report/page.tsx:230-231` — "Every export carries a SHA-256 manifest binding the content to the cleaned dataset."

This is provenance for *data*, not for *users*. There is no signature and no actor.

### 4.5 Erase / wipe path

- `eraseAllLocalData()` — `src/lib/storage/idb.ts:260-273`. It enumerates `indexedDB.databases()` and deletes every database whose name starts with `vhsnd-pipeline` **or** `pipeline-crypto` (`:265`). Deleting `pipeline-crypto` destroys the key along with the data, which is what makes the wipe permanent — there is no recovery path by design.
- It resolves rather than rejects on `error` and `blocked` (`:269-270`) so a blocked deletion cannot leave the UI hanging.
- The UI trigger is the "Erase all local data" button on the Report screen, guarded by a `window.confirm` ("This cannot be undone.") — `src/app/report/page.tsx:129-134`, button at `:238-240`.
- The landing page promises exactly this affordance — `src/app/page.tsx:141-143`: "You can erase everything with one action from the Report step."

### 4.6 Summary of the compensating controls

| Control | Type | Where |
| --- | --- | --- |
| AES-256-GCM at rest | confidentiality | `src/lib/crypto.ts:5`, `:18-57` |
| Key held in a separate DB, non-extractable, origin-bound | key isolation | `src/lib/crypto.ts:3-4`, `:65-71` |
| CSP locking `connect-src` to `'self'` | egress prevention | `src/app/layout.tsx:19` |
| Offline build gate | egress prevention (build time) | `scripts/check-offline.mjs:18-34` |
| Audit log + SHA-256 manifest | integrity / provenance | `src/export/reportContext.ts:44-47`, `:64-119` |
| Erase-all path | data lifecycle / user control | `src/lib/storage/idb.ts:260-273` |

---

## 5. Recommendations (not implemented)

> **These are proposals only.** Nothing in this section exists in the repository. Each item is labelled with what it would replace, why it is being proposed, and what it would cost. Treat them as a design backlog, not as documentation of behaviour.

### 5.1 Proposal — passphrase-protected key (key recovery)

**Proposal.** Wrap the AES key with a key derived from an operator-supplied passphrase (PBKDF2 or Argon2id) so that the raw key is never stored unwrapped, and let the operator recover their workspace on a new machine with the passphrase.

**Why.** Today the key is stored as raw bytes in `pipeline-crypto` (`src/lib/crypto.ts:63-79`). Clearing site data, a browser reinstall, or a profile reset destroys the key, and therefore every encrypted dataset — with no recovery path. `PROJECT_CONTEXT.md` §14.4 states this plainly: "this app has no disaster recovery."

**Trade-off.** The current design deliberately rejects this: `src/lib/crypto.ts:9-17` says the goal is protection "without the user-friction of passphrases". A passphrase is also a new secret that can be lost or forgotten, and would need its own recovery story.

**Status: not implemented. No passphrase code, KDF parameters, or recovery flow exists in the repository.**

### 5.2 Proposal — export / import of the workspace

**Proposal.** Let the operator export an encrypted bundle (datasets + resolutions + charts + the wrapped key) as a single file, and import it on another machine with a passphrase.

**Why.** The key is origin-bound, so data cannot move between machines, browsers or ports. A deliberate privacy property, but also a single point of failure.

**Trade-off.** A bundle that leaves the machine is a new exfiltration path and must itself be encrypted with a passphrase, which reintroduces §5.1.

**Status: not implemented. No import/export-of-workspace code path exists. (The existing exports — PPTX, DOCX, CSV, audit JSON — are *outputs*, not workspace snapshots.)**

### 5.3 Proposal — key rotation

**Proposal.** Allow re-wrapping the data under a fresh key while keeping the old key available for decryption of historical records, and stamp each record with the key id that encrypted it.

**Why.** `KEY_NAME = "app-key-v1"` (`src/lib/crypto.ts:4`) is fixed for the life of the installation. If the key is ever suspected to have been exposed, there is no way to replace it without losing the data it protects.

**Trade-off.** Rotation requires every stored record to be re-encrypted or to carry a key identifier, which touches every writer in `src/lib/storage/idb.ts`.

**Status: not implemented. There is no key id on any stored record and no rotation routine.**

### 5.4 Proposal — multi-device / shared workspace

**Proposal.** If more than one operator must work on the same district data, introduce real accounts with roles (e.g. `operator`, `reviewer`, `viewer`), server-side sessions, and a server that enforces authorisation — replacing the static-export model entirely.

**Why.** The single-active-dataset model (`src/stores/workflowStore.ts:6`), the owner-less `DatasetSummary` (`src/contracts/dataset.ts:42-50`) and the actor-less `AuditRecord` (`src/export/reportContext.ts:8-14`) all assume one person, one machine, one browser.

**Trade-off.** This is a server, a database, a network dependency and a credential store — the exact things `next.config.ts:4` (`output: "export"`), `scripts/check-offline.mjs` and the whole "nothing leaves this device" promise are designed to avoid. It would also invalidate the CSP's `connect-src 'self'` posture and the offline build gate's guarantee.

**Status: not implemented, and architecturally incompatible with the current static-export design without a rewrite.**

### 5.5 Explicitly out of scope (for completeness)

The following were also considered and are **not** recommended for this application as currently deployed, because they address threat models the design does not claim to cover:

- **Rate limiting / brute-force lockout** — pointless without authentication; there are no credentials to guess.
- **CSRF tokens** — the app has no server and no cross-origin form targets (`form-action 'self'`, `src/app/layout.tsx:24`).
- **CORS headers** — the app is a static file server, not an API. `connect-src 'self'` is the equivalent guarantee and it is stronger for this case.
- **Two-factor authentication** — subsumed by §5.4; meaningless under §5.1 without a server.

---

## 6. What is not established

- **Who operates the app and how workstations are locked down** — *Not verified from the current repository.* There is no deployment, provisioning or workstation-hardening documentation.
- **Whether the deployment host sits behind an authenticating proxy** (SSO, basic auth, VPN) — *Not verified from the current repository.* No proxy, reverse-proxy or hosting configuration exists in the tree.
- **Whether districts share machines between operators** — *Not verified from the current repository.* The code's own comment (`src/lib/crypto.ts:11-13`) assumes shared machines exist.
- **The production origin/URL** — *Not verified from the current repository.* See [`11-installation-and-setup.md`](11-installation-and-setup.md) §5.5.
