# 15 — Security Documentation

**Scope:** every security control, threat, limit and gap in this repository — the threat model as the
code itself states it, the Content-Security-Policy directive by directive, encryption at rest, data
locality, input validation, secrets, accountability, and the wipe path. Then the gaps, plainly, and
recommendations that are **not implemented**.

**Three facts up front:**

1. **There is no authentication, no authorisation and no server.** The app is a static, single-operator,
   on-device tool; `connect-src 'self' data: blob:` (`src/app/layout.tsx:19`) plus the absence of any
   `fetch` to a remote host means **nothing is uploaded** (`PROJECT_CONTEXT.md` §7.1, §10.1).
2. **All local data is encrypted at rest with AES-256-GCM**, with the key in a *separate* IndexedDB
   database (`src/lib/crypto.ts:3`, `:18-27`, `:59-82`).
3. **The CSP is delivered as a `<meta http-equiv>` tag** (`src/app/layout.tsx:31`) and must therefore
   include `'unsafe-inline' 'unsafe-eval'` — a necessary consequence of a static export with no server
   to issue nonces. It **cannot** enforce `frame-ancestors` or `report-uri` (§3.4).

**No security control is invented in this document.** Where a control is absent it is listed as absent.
Claims that could not be established from the repository are marked *Not verified from the current
repository.*

Related reading: [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) (serving
requirements, TLS, `file://`), [`09-authentication-and-authorization.md`](09-authentication-and-authorization.md)
(the full absence-sweep for auth), [`16-error-handling-and-logging.md`](16-error-handling-and-logging.md)
(failure modes), [`../PROJECT_CONTEXT.md` §14](../PROJECT_CONTEXT.md#14-security--performance)
(the single-file source of truth), [`07-database-documentation.md`](07-database-documentation.md)
(the storage layout).

---

## 1. Threat model (as documented in the source)

The threat model is not written in a security-policy document; it is written in a code comment in
`src/lib/crypto.ts:9-17`:

```
/**
 * Envelope-encrypt a UTF-8 string with AES-GCM. The key is generated once,
 * stored in its own IndexedDB store, and re-used across sessions. This
 * protects health data at rest against disk/copy artifacts on shared machines
 * (the realistic threat model for these district computers) without the
 * user-friction of passphrases.
 *
 * Format: "v1.<ivB64>.<cipherB64>"
 */
```

Read literally, that states four things:

| Element of the model | Statement | Where it binds |
| --- | --- | --- |
| **Asset** | Health survey data (VHSND household session records) held in the browser | `src/lib/storage/idb.ts:25` — stores `ds`, `res`, `chart`, `blob`, `validation`, `ui` |
| **Adversary** | Anyone who obtains a *copy* of the disk — a shared district machine, a stolen laptop, a backup image, a copied profile directory | §2 (encryption at rest) |
| **Attack surface considered** | **At rest only.** The design explicitly does *not* defend against a live attacker at the keyboard, because there is no passphrase step to slow them down | §2, §4 (no auth) |
| **Explicit trade-off** | Protection **without the user friction of passphrases** — a deliberate prioritisation of usability over key custody | §2.4 and §9 (G1, "no key recovery") |

### 1.1 What the model does **not** claim

Stating the model honestly requires naming its limits:

- **Not** a defence against a malicious script on the same origin. The AES key is generated
  **extractable** (`src/lib/crypto.ts:74` — `generateKey({…}, true, …)`) and its raw bytes are written
  to IndexedDB (`:78-79`), so anything executing in this origin can read the key and decrypt
  everything. Encryption at rest defends against *disk and copy artefacts*, not against same-origin
  code execution.
- **Not** a defence against a compromised browser, a malicious extension with host permissions, or a
  user who walks away from an unlocked session.
- **Not** a confidentiality boundary between two people using the same machine profile (§4).
- **Not** a defence against a malicious *file*. A crafted workbook is parsed by SheetJS with no content
  scanning (§5.6).

---

## 2. Encryption at rest

### 2.1 The scheme

| Property | Value | Cite |
| --- | --- | --- |
| Algorithm | **AES-GCM** | `src/lib/crypto.ts:5` (`const ALGO = "AES-GCM"`) |
| Key length | **256 bits** | `src/lib/crypto.ts:74` (`generateKey({ name: ALGO, length: 256 }, …)`) |
| Key usage | `["encrypt", "decrypt"]` only — **not** `sign`/`verify` | `src/lib/crypto.ts:70`, `:75-76` |
| IV | **12 random bytes, fresh for every operation** | `src/lib/crypto.ts:20` (strings), `:43` (bytes) — `crypto.getRandomValues(new Uint8Array(12))` |
| String ciphertext format | `v1.<base64 IV>.<base64 ciphertext>` | `src/lib/crypto.ts:16`, `:26` |
| Byte ciphertext format | `[IV(12) ‖ ciphertext]` | `src/lib/crypto.ts:41-49` |
| Integrity | AES-GCM's authentication tag — `crypto.subtle.decrypt` throws on a tampered payload | `src/lib/crypto.ts:37`, `:55` |
| Format validation on read | `decryptString` rejects anything not `v1.<b64>.<b64>` | `src/lib/crypto.ts:30-33` |
| Key caching | The imported `CryptoKey` is held in a module-level variable after first use | `src/lib/crypto.ts:59`, `:62` |
| Key storage | A **separate** IndexedDB database, `pipeline-crypto`, store `keyval`, key name `app-key-v1` | `src/lib/crypto.ts:3-4` (`createStore("pipeline-crypto", "keyval")`) |

**Fresh IV per operation** is the property that makes the GCM nonce safe to reuse the key across
sessions: two encryptions of the same plaintext produce different ciphertexts, so an observer with the
key store and the data store still cannot tell that two records are equal without decrypting them.

### 2.2 Why the key lives in a separate database

`src/lib/crypto.ts:3` creates the key store with `idb-keyval`'s `createStore("pipeline-crypto", "keyval")`,
while all application data lives in `vhsnd-pipeline` (`src/lib/storage/idb.ts:23`). Two consequences:

1. **The key is never co-located with the ciphertext in the same object store** — copying the
   `vhsnd-pipeline` database off a machine does not carry the key with it.
2. **`eraseAllLocalData()` can delete both** — it filters on the name prefixes `vhsnd-pipeline` and
   `pipeline-crypto` (`src/lib/storage/idb.ts:265`).

### 2.3 What is encrypted

Every write to IndexedDB goes through the crypto module — `src/lib/storage/idb.ts` re-exports
`encryptString`/`decryptString`/`encryptBytes`/`decryptBytes` (`:254`) and uses them at:

| Store | What it holds | Encrypted how | Cite |
| --- | --- | --- | --- |
| `ds` | `DatasetSnapshot` — every row, every value | `encryptString(JSON.stringify(snapshot))` | `idb.ts:89-91` |
| `res` | Per-row adjudication decisions | `encryptString(JSON.stringify(map))` | `idb.ts:127-129` |
| `chart` | Chart metadata and config | `encryptString(JSON.stringify(meta))` | `idb.ts:150-152` |
| `blob` | Captured chart PNG bytes | `encryptBytes(bytes)` — byte-wise, IV prefixed | `idb.ts:175-178` |
| `validation` | Violations, counts, by-row index | `encryptString(JSON.stringify(cache))` | `idb.ts:196-198` |
| `ui` | Header overrides **and the Zustand workflow store** | `encryptString` | `idb.ts:217-222`, `:239-252` |

**There is no unencrypted application data in IndexedDB.** The only plaintext that ever touches disk is
the AES key itself, in the separate `pipeline-crypto` database (§2.2).

### 2.4 The key lifecycle gap

`getAppKey` (`src/lib/crypto.ts:61-82`):

- Looks up `app-key-v1` in the key store; if present, imports it (`:63-72`).
- If absent, generates a 256-bit AES-GCM key, **exports it raw** and stores it (`:74-79`).
- The in-memory copy is cached (`:59`, `:80`).

There is **no passphrase, no key export/import, no key backup and no rotation**. Consequences:

| Consequence | Detail |
| --- | --- |
| **Clearing site data destroys the key** | and therefore every dataset, resolution, chart and validation cache. There is no recovery path. `PROJECT_CONTEXT.md` §14.4 calls this out as *"this app has no disaster recovery"*. |
| **Data is bound to the origin** | IndexedDB is per-origin, so a dataset does not move between machines, browsers, ports or protocols. A privacy property and a single point of failure at once. |
| **`app-key-v1` is fixed for the life of the installation** | no rotation, no re-encryption sweep, no key id in the ciphertext envelope (although the `v1.` prefix leaves room for one — see §9). |

---

## 3. Content Security Policy

### 3.1 Where it comes from

The policy is a **constant in the root layout**, injected as a `<meta http-equiv>` tag in `<head>`
(`src/app/layout.tsx:31`: `<meta httpEquiv="Content-Security-Policy" content={CSP} />`). The constant
itself is `src/app/layout.tsx:10-25`:

```ts
const CSP = [
  "default-src 'self'",                                       // :11
  // Next.js injects inline hydration/bootstrap scripts; a static offline app
  // cannot use nonces (no server), so inline must be permitted. Everything
  // else (remote origins, plugins) stays blocked.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",           // :15
  "style-src 'self' 'unsafe-inline'",                         // :16
  "img-src 'self' data: blob:",                               // :17
  "font-src 'self' data:",                                    // :18
  "connect-src 'self' data: blob:",                           // :19
  "media-src 'self'",                                         // :20
  "worker-src 'self' blob: data:",                            // :21
  "object-src 'none'",                                        // :22
  "base-uri 'none'",                                          // :23
  "form-action 'self'",                                       // :24
].join("; ");                                                  // :25
```

Every line above was read from `src/app/layout.tsx` and is reproduced verbatim; the directive values are
also tabulated in §3.2.

### 3.2 Directive by directive

| Directive | Value | **Covers** | **Does NOT cover** |
| --- | --- | --- | --- |
| `default-src` | `'self'` | The fallback for every directive that is not listed. Anything not explicitly allowed below is restricted to the app's own origin. | Does not restrict `script-src`, `connect-src` etc., which have their own explicit values. |
| `script-src` | `'self' 'unsafe-inline' 'unsafe-eval'` | Scripts loaded from the app's own origin; **inline** scripts (Next.js hydration/bootstrap); **`eval`-style** code generation. | **Does not prevent** a DOM-based injection from executing code: `'unsafe-eval'` re-enables `eval`/`new Function`/string timers, so injected script that reaches the DOM is not contained. This materially weakens the directive — see §3.3. |
| `style-src` | `'self' 'unsafe-inline'` | Stylesheets from the origin plus inline `style` attributes (the app uses inline style objects extensively, e.g. `src/app/ingest/page.tsx:229`, `:235`). | Does not constrain CSS-based exfiltration (`background: url(...)` to a remote host is limited only by `img-src`, not by `style-src`). |
| `img-src` | `'self' data: blob:` | Images from the origin; `data:` URIs; `blob:` object URLs. Needed for the captured chart PNGs (`src/app/viz/page.tsx:114` creates a blob URL; `:135` fetches a `data:` URL). | Does not cover `<video>`/`<audio>` (that is `media-src`) or CSS `url()` fetches in some browsers. |
| `font-src` | `'self' data:` | Font files from the origin and `data:` fonts. | — |
| `connect-src` | `'self' data: blob:` | **The data-locality control.** `fetch`/XHR/WebSocket/EventSource may only target the app's own origin, plus `data:` and `blob:` schemes. **No remote origin is connectable.** | Does not stop a `data:`-URL read of local data by an injected script; does not stop reading from IndexedDB (IndexedDB is not governed by CSP). |
| `media-src` | `'self'` | `<audio>`/`<video>` from the origin only. | — |
| `worker-src` | `'self' blob: data:` | The module workers (`src/lib/workers.ts:52-54`, `:130-131`) and any blob/data worker. | — |
| `object-src` | `'none'` | **No plugins, no `<object>`, no `<embed>`, no Flash/PDF viewers.** This is the directive that stops plugin-based content from executing. | — |
| `base-uri` | `'none'` | A `<base>` tag cannot be injected to re-point relative URLs at an attacker's origin. | Does not affect `form-action`. |
| `form-action` | `'self'` | Form submissions cannot be redirected to a third party — no exfiltration via a form POST. | The app has no forms that submit anywhere; this is belt-and-braces. |

### 3.3 The honest assessment of `script-src`

`script-src 'self' 'unsafe-inline' 'unsafe-eval'` is **weaker than it looks**. With `'unsafe-eval'`
present, a DOM-based injection (e.g. an attribute breakout that reaches an inline script context) is
**not contained** by the CSP. There is no nonce-based alternative available here: a nonce must be
issued per response by a server, and there is no server (`next.config.ts:4`, `output: "export"`).
The in-code justification is at `src/app/layout.tsx:12-14`.

**The real compensating control is that there is no untrusted input rendered as markup.**
Survey values, justifications, file names and override values are all rendered through React text
nodes and JSX attributes — never `dangerouslySetInnerHTML`. A repository-wide search for
`dangerouslySetInnerHTML` across `src/` returns **0 matches**. That is the control that actually
prevents survey data from becoming executable script.

### 3.4 What a meta-tag CSP cannot do

| Cannot be expressed in a `<meta http-equiv>` CSP | Consequence for this project |
| --- | --- |
| `frame-ancestors` | **Clickjacking protection is absent from the application.** It can only be added by the host as a response header (`X-Frame-Options` or `frame-ancestors`). No host configuration exists in this repository — see [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) §7. |
| `report-uri` / `report-to` | **No violation reporting.** The browser silently blocks; nothing is logged or reported. |
| `sandbox` | — |
| `upgrade-insecure-requests` | — |

A meta-tag CSP also applies to the document **after** it has been parsed, so a small amount of
pre-tag content can be affected — irrelevant here, since the app is entirely client-rendered.

### 3.5 CSP is one layer, not the whole defence

| Layer | Where |
| --- | --- |
| Runtime enforcement | The CSP meta tag (`src/app/layout.tsx:31`) |
| Build-time enforcement | The offline gate `scripts/check-offline.mjs:18-35` — fails the build if the emitted bundle references a remote URL |
| Source-level assurance | No `fetch`/`XHR`/`WebSocket` to any remote origin exists in `src/` (§4) |

---

## 4. Data locality — "nothing is uploaded"

### 4.1 The claim and its enforcement

The app asserts, in the UI, that nothing leaves the device:

- `src/app/page.tsx:62-64` — *"Nothing is uploaded; the browser application stays fully usable offline."*
- `src/app/page.tsx:141-143` — *"Survey exports never leave this device. All datasets, corrections, charts, and drafts are encrypted (AES-256-GCM)…"*
- `src/app/report/page.tsx:234-237` — *"All files are produced in this browser and nothing is transmitted."*
- `src/components/AppShell.tsx:53-55` — the "Offline workspace" link's tooltip: *"All data lives on this machine. Nothing is uploaded."*

These are enforced by three independent facts:

1. **`connect-src 'self' data: blob:`** (`src/app/layout.tsx:19`) — the browser itself refuses any
   cross-origin request.
2. **No remote call exists in the source.** The only `fetch` in all of `src/` is
   `src/app/viz/page.tsx:135` — `await (await fetch(dataUrl)).blob()` — where `dataUrl` is the
   `data:image/png;base64,…` produced a few lines earlier by `html-to-image`'s `toPng`
   (`src/app/viz/page.tsx:130`). It reads a local data URL; it contacts nothing.
3. **No API tier exists.** No `route.ts`, no `"use server"`, no `middleware.ts`, no `process.env`
   anywhere in `src/` (`PROJECT_CONTEXT.md` §7.1, §11.1).

The other `blob:` uses are equally local: `URL.createObjectURL` for chart thumbnails
(`src/app/viz/page.tsx:114`) and for triggering the export downloads
(`src/export/csv.ts:33`, `:40`).

### 4.2 What is *not* prevented by data locality

| Not prevented | Why |
| --- | --- |
| A user manually uploading the exported CSV/PPTX/DOCX to Drive, email or WhatsApp | The app cannot control what a user does with a file it produced. This is the single most likely real-world egress path, and it is worth stating plainly in any handover. |
| A same-origin script (XSS) reading IndexedDB | CSP `connect-src` does not govern IndexedDB. See §1.1. |
| The browser itself phoning home (telemetry, update checks, Safe Browsing, extension traffic) | Outside the page's control and outside the CSP's scope. |

---

## 5. Input validation

There are five distinct validation layers. None of them is a general-purpose validation library —
`zod` is a declared dependency but **never imported** anywhere in `src/`, `tests/` or `scripts/`
(`PROJECT_CONTEXT.md` §3.3, §16.2 D5).

### 5.1 File-type guard (ingest)

`src/app/ingest/page.tsx:142-151`:

```ts
const onDrop = useCallback((files: File[]) => {
  const file = files[0];                                     // :144
  if (!file) return;
  const ext = file.name.split(".").pop()?.toLowerCase();      // :146
  if (!["xlsx", "xls", "ods", "csv"].includes(ext ?? "")) {    // :147
    setPhase("error");
    setError(`Unsupported file type ".${ext}". Expected .xlsx, .xls, .ods or .csv.`);
    return;
  }
```

Three supporting details:

- **`multiple: false`** (`src/app/ingest/page.tsx:193`) — the dropzone accepts one file.
- **`files[0]`** (`:144`) — even if more than one were somehow supplied, only the first is read.
- **The `accept` map** (`:195-199`) lists the MIME types and extensions, which filters the native
  file picker. It is a convenience; the extension guard at `:146-151` is the actual check.

**Limitation, stated honestly:** the guard inspects the **file name extension only**. It does not
inspect magic bytes, does not verify that the content is a spreadsheet, and is trivially bypassed by
renaming. It is a *usability* guard against the wrong file, **not a security boundary**. The real
containment is that SheetJS's parser is given a buffer it can only fail on.

### 5.2 Cell coercion (the type system of the data)

Every cell is read through the schema field's declared type
(`src/schema/engine/normalize.ts:88-124`, `coerceFieldValue`):

| Field type | Coercer | Line in `src/schema/engine/cellCoercers.ts` |
| --- | --- | --- |
| `boolean`, `group` | `coerceBoolean` | `:31` |
| `integer` | `coerceSentinelNumber` (sentinel-aware) | `:62` |
| `ordinal` | `coerceOrdinal` | `:49` |
| `number` | `coerceNumber` | `:89` |
| `date` | `coerceDate` (ISO, Excel serial, human text) | `:110` |
| `time` / `datetime` | `coerceTime` / `coerceDateTime` | `:182`, `:238` |
| `text` | `coerceText` / `coerceCodedText` (free-text vs coded) | `:273`, `:283` |
| `choice`, `group_tokens` | `coerceChoiceText` | `:289` |

`keepCell` (`src/schema/engine/normalize.ts:141-144`) then **drops** any value the type cannot read, so
a "no answer" token or an unparseable cell never becomes data, and a declared sentinel never reaches a
sum, mean or fill-rate.

### 5.3 Column mapping

Only columns the schema recognises are mapped onto fields. A title the schema cannot place is retained
**under its own title** and is explicitly not readable by any field, chart or comparison
(`src/app/ingest/page.tsx:330-333`; `src/schema/engine/normalize.ts:546-555`). The user can point such
a title at a field by hand (`:324-379`), and that mapping is stored per file name and replayed on the
next read (`src/lib/storage/idb.ts:217-228`).

### 5.4 The contradiction engine

`validateRows` (`src/schema/engine/validate.ts:41-95`) runs three passes — field coercion, select-multiple
coherence, and 37 cross-field rules — and produces typed `Violation` records
(`src/contracts/violation.ts`) with a severity of `error` / `warning` / `info`. A rule that throws is
degraded to a `RULE_EVALUATION_ERROR` warning rather than crashing the import
(`src/schema/engine/validate.ts:72-82`; see [`16-error-handling-and-logging.md`](16-error-handling-and-logging.md) §2).

### 5.5 User-entered values (row overrides)

The only free-text input a user can commit to the dataset is a row override value and a justification.
Both are validated before they are written:

- The override value is checked with `coercer.reject(fieldId, value)`
  (`src/components/RowDrawer.tsx:63-68`), which returns a human-readable reason when the value cannot
  be read as the field's type (`src/schema/engine/normalize.ts:188-196`).
- A rejected value blocks the save (`src/components/RowDrawer.tsx:109-112`).
- The accepted value is then **re-read through the schema** before it is stored
  (`src/components/RowDrawer.tsx:115`, `src/contracts/resolution.ts:41-52`), so a stored replacement
  can never carry a shape its column cannot hold.
- Drop and override **require a written justification** (`src/components/RowDrawer.tsx:62`).

### 5.6 What input validation does **not** do

| Not done | Consequence |
| --- | --- |
| **No antivirus / content scanning** of the uploaded workbook | A deliberately malformed `.xlsx`/`.xls`/`.ods` is handed straight to SheetJS. The parse happens in a Worker (`src/lib/workers.ts:52-54`), so the UI does not freeze, but a decompression bomb or a pathological file can still exhaust memory or CPU. |
| **No magic-byte / content sniffing** | The extension guard (§5.1) is name-based only. |
| **No file-size cap** | There is no maximum file size enforced anywhere in the source; `sizeBytes` is recorded in the source metadata (`src/workers/parseWorker.ts:66`) but never checked against a limit. |
| **No length limits on free text** | A justification or override of arbitrary length is accepted and stored. |
| **No HTML sanitisation** | Not required, because there is no HTML sink — see §3.3. React escapes text nodes, and `dangerouslySetInnerHTML` appears **0 times** in `src/`. |

---

## 6. Secrets management

**There are no secrets to manage.** This is a fact, not an omission:

| Question | Answer | Evidence |
| --- | --- | --- |
| Does the app read environment variables? | **No.** | `process.env` does not appear anywhere in `src/` (`PROJECT_CONTEXT.md` §11.1). There is no `.env.example`. |
| Does the app read API keys, tokens or credentials? | **No.** | `grep -i 'apikey\|api_key\|bearer\|jwt'` → 0 matches across `src/`, `scripts/`, `tests/` ([`09-authentication-and-authorization.md`](09-authentication-and-authorization.md) §2.2). |
| Is there a login, session or cookie? | **No.** | `grep -i 'cookie'` → 0 matches; there is no server to set one. |
| Does the build need credentials? | **No.** | `next build` with `output: "export"` needs nothing; the only "private" dependency is the vendored SheetJS tarball `vendor/xlsx-0.20.3.tgz` (`package.json:30`), a local file. |
| Are secrets in the repository? | **None found.** | `.gitignore` excludes `.env*` and `*.pem` (`PROJECT_CONTEXT.md` §11.6) as a default. |
| Is there an API key for the encryption key? | **No — the key is generated locally** and never leaves the machine (§2.4). | `src/lib/crypto.ts:74-79`. |

### 6.1 The one credential-like artefact

`vendor/xlsx-0.20.3.tgz` is installed from a **local vendored tarball** rather than the npm registry
(`package.json:30`). This is a deliberate reproducibility/offline-build choice, but it means **the
tarball is the artefact of record and its provenance is not verifiable from `package-lock.json` alone**
(`PROJECT_CONTEXT.md` §10.3). That is a supply-chain consideration worth recording at handover, not a
secret.

---

## 7. Accountability controls: the audit log and the SHA-256 manifest

Because there is no identity system, the audit trail is what substitutes for it.

### 7.1 The audit log

Every adjudication is recorded as a `RowResolution` (`src/contracts/resolution.ts:3-14`):

| Field | Meaning |
| --- | --- |
| `rowId` | Which row |
| `status` | `pending` / `keep` / `drop` / `override` |
| `keptViolations` | The error codes explicitly acknowledged, or `__all` |
| `justification` | **Required** for drop and override (`src/components/RowDrawer.tsx:62`) |
| `decidedAt` | ISO timestamp |
| `decidedBy` | `"user"` — the only value the type allows (`src/contracts/resolution.ts:13`) |

It is displayed on the review screen sorted by `decidedAt` (`src/app/review/page.tsx:304-332`) and
**embedded in every export** via `buildReportContext` (`src/export/reportContext.ts:65-74`, which
filters out `pending` rows and sorts by `decidedAt`).

Note the honest limit: `decidedBy` is a **constant**, not an identity. The log proves *what* was
decided and *when*, not *who* decided it. On a shared machine there is no way to attribute a decision
to a person.

### 7.2 The SHA-256 manifest

`buildReportContext` (`src/export/reportContext.ts:64-119`) produces:

- `audit` — the non-pending resolutions (§7.1).
- `summary` — kept/dropped/pending rows, error/warning/info counts, unresolved error count (`:96-105`).
- `indicators` — a headline value per indicator (`:82-86`).
- `charts` — id, title, kind, blobKey.
- `rowsHash` — SHA-256 over the canonical string of all cleaned row values (`:114`).
- `manifest` — SHA-256 over the canonical JSON of the whole context **plus** `rowsHash` (`:111-117`).

`canonicalString` (`:35-42`) sorts object keys recursively, which is what makes the hash reproducible
across property-insertion order. `sha256Hex` uses `crypto.subtle.digest("SHA-256", …)` (`:44-47`).

**What the manifest is for:** it binds a delivered report to a specific cleaned dataset. A reviewer can
recompute it from the same inputs and compare. It is a **tamper-evidence control over the exported
artefact** — not a signature, and not a proof of origin (there is no key to sign with).

**Known limits of the manifest** (from `PROJECT_CONTEXT.md` §16.3):

- **The manifest path has no test.** `tests/` contains no test for `reportContext.ts`
  (`PROJECT_CONTEXT.md` §15.3, "Manifest determinism"). The audit-critical hash path is unverified.
- **`generatedAt` is inside the hashed input** (`:113`) — the manifest therefore differs between two
  otherwise identical runs. That is correct for tamper-evidence but means the manifest is **not**
  comparable across runs.
- The manifest covers the *report context*, not the workbook the rows came from. The dataset's
  `schemaHash` (`src/stores/datasetStore.ts:41`) covers the *schema*, not the source file.

---

## 8. The erase / wipe path

The privacy control a user can actually pull is **"Erase all local data"** on the Report step.

| Step | Code |
| --- | --- |
| The button | `src/app/report/page.tsx:238-240` |
| Confirmation dialog | `src/app/report/page.tsx:130` — `window.confirm("Erase ALL datasets, corrections, charts and drafts from this device? This cannot be undone.")` |
| The wipe | `src/app/report/page.tsx:131` → `eraseAllLocalData()` (`src/lib/storage/idb.ts:260-273`) |
| Enumeration | `indexedDB.databases()` (`idb.ts:262`) |
| Filter | names starting with `vhsnd-pipeline` **or** `pipeline-crypto` (`idb.ts:265`) — this is what removes the AES key as well as the data |
| Deletion | `indexedDB.deleteDatabase(name)` for each (`idb.ts:267`) |
| Failure handling | `onsuccess`, `onerror` and `onblocked` all resolve the promise (`idb.ts:268-270`) — **a blocked deletion is treated as success** |
| Completion | `setCleared(true)` and `router.push("/")` (`src/app/report/page.tsx:132-133`) |

### 8.1 Honest assessment of the wipe

| Strength | Limitation |
| --- | --- |
| Deletes **every** database the app has written, including the key store (`idb.ts:265`). | **`onblocked` resolves as if it succeeded** (`:270`) — if another tab holds the database open, the deletion is deferred by the browser and the app still reports success. |
| The key is destroyed with the data, so residual ciphertext is unrecoverable. | Only `indexedDB` is wiped. The app writes **nothing** to localStorage/sessionStorage/cookies, so there is nothing else to clear — but equally, the wipe cannot reach a file the user already downloaded. |
| The UI disables the button afterwards (`src/app/report/page.tsx:238`). | There is no confirmation *after* the fact that every database was actually deleted; the promise resolves regardless of `onerror`. |
| | The wipe does not and cannot undo a manual upload of an exported file (§4.2). |

---

## 9. Known gaps

**Every item below is an absence verified against the source, not an oversight discovered late.**
Nothing in this list is a control that exists "in spirit" or "by convention".

| # | Gap | Evidence | Consequence |
| --- | --- | --- | --- |
| G1 | **No key recovery** | `src/lib/crypto.ts:61-82` — the key is generated locally and stored raw; there is no passphrase, export, import or backup | Clearing site data, a browser profile reset, or a machine reinstall **permanently destroys every dataset**. There is no disaster recovery. |
| G2 | **No key rotation** | `app-key-v1` is a fixed key name (`src/lib/crypto.ts:4`); the ciphertext envelope has no key id | The key cannot be rotated without re-encrypting every record; there is no mechanism to do so. |
| G3 | **No multi-device / no sync** | IndexedDB is per-origin; no export/import of a dataset exists | A district official cannot move a dataset from one machine to another — by design, but it means no continuity across machines and no off-machine backup. |
| G4 | **No authentication** | No user model, no login, no session, no role; `decidedBy` is the constant `"user"` (`src/contracts/resolution.ts:13`) | Anyone with access to the browser profile can read, alter and export the data. There is no attribution of decisions to a person. |
| G5 | **No rate limiting** | `grep -i 'rate.?limit'` → 0 matches; there is no server to rate-limit | Not applicable to a local app today; it becomes a real gap the moment any server is introduced. |
| G6 | **No antivirus / content scanning of uploaded files** | The workbook goes straight to SheetJS (`src/workers/parseWorker.ts:31-35`); no scanner, no magic-byte check, no size cap | A malicious or pathological file can consume CPU/memory. It is parsed off the main thread, so the UI survives, but the machine can still suffer. |
| G7 | **`'unsafe-eval'` in `script-src`** | `src/app/layout.tsx:15` | A DOM-based injection is not contained by the CSP. The compensating control is the absence of `dangerouslySetInnerHTML` (§3.3), not the CSP. |
| G8 | **No `frame-ancestors` / clickjacking protection** | A meta-tag CSP cannot express it (`src/app/layout.tsx:31`); no host configuration exists | The app can be framed by another site. Low practical risk for a local tool, but it is a genuine absence. |
| G9 | **No CSP violation reporting** | No `report-uri` / `report-to` (impossible in a meta tag) | CSP blocks are silent. There is no signal that a policy was violated. |
| G10 | **The encryption key is extractable at rest** | `generateKey(…, true, …)` then `exportKey("raw", …)` (`src/lib/crypto.ts:74-78`) | Any script executing in the origin can read the key and decrypt everything. Encryption at rest defends against *disk/copy artefacts*, not against same-origin code execution. |
| G11 | **No TLS or security-header configuration** | No host configuration exists in the repository | Whether the app is served over HTTPS — which `crypto.subtle` requires — is entirely outside the repository's control. See [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) §2.1. |
| G12 | **No audit log of reads** | Only *decisions* are recorded (`src/contracts/resolution.ts:3-14`) | There is no record of who opened, viewed or exported a dataset — only of what was changed. |
| G13 | **No key storage in a hardware store / no OS keychain** | The key is in IndexedDB (`src/lib/crypto.ts:3`) | No protection beyond the browser's own profile security. |
| G14 | **The manifest path is untested** | No test for `src/export/reportContext.ts` (`PROJECT_CONTEXT.md` §15.3) | The audit-critical hash has no regression protection. |

---

## 10. Recommendations — **not implemented**

**Nothing in this section exists in the code.** These are proposals, written as an honest handover would
write them. Each says what it would require, so the reader can judge the cost. The "cost" column marks
the ones that need a change of architecture.

| # | Recommendation | Would require | Cost | Notes |
| --- | --- | --- | --- | --- |
| R1 | **Serve the CSP as an HTTP response header** and add `frame-ancestors 'none'` | A host that can set response headers (any static host can) | low | The meta tag stays as a fallback. This is the only way to close G8. |
| R2 | **Move the key behind a passphrase** (PBKDF2 / Argon2id → AES key) | A passphrase prompt at first use, plus a key-derivation function | low | Closes most of G1's blast radius: a stolen profile would no longer yield the key directly. Costs user friction, which the current design explicitly rejects (`src/lib/crypto.ts:13-14`). |
| R3 | **Add key export / import** (an encrypted "workspace backup" file) | A UI + a file format | medium | Gives the operator a path that survives a machine change — the first half of G1/G3. |
| R4 | **Key rotation** — add a key id to the envelope (`v2.<keyId>.<iv>.<cipher>`) and a re-encryption sweep | A version bump in `src/lib/crypto.ts` and a migration pass | medium | The `v1.` prefix in the format (`src/lib/crypto.ts:26`) was left for exactly this. |
| R5 | **A test for the manifest path** | A Vitest test over `buildReportContext` | low | Closes G14. The suite already covers the DOCX template this way (`tests/docx-template.test.ts`). |
| R6 | **Cap the uploaded file size** and reject beyond it | A check in `src/app/ingest/page.tsx` | low | Cheap mitigation for part of G6. |
| R7 | **Magic-byte check** in addition to the extension guard | A short check in `src/app/ingest/page.tsx:146-151` | low | Cheap mitigation for part of G6. |
| R8 | **Nonced CSP via a server** | Abandoning the static export | **architecture** | Would let `'unsafe-inline'` and `'unsafe-eval'` be dropped, closing G7. Not compatible with the current artefact. |
| R9 | **Remove `'unsafe-eval'`** | Confirming the bundle does not need `eval` | low | A measurable win *if* the build survives it — but with `output: "export"` and no nonces, `'unsafe-inline'` would still be required, so the gain is partial. |
| R10 | **Identity for `decidedBy`** | An account model, a passphrase, or a local operator name | medium | Closes the attribution half of G4. A local "who is using this machine" prompt would be the minimal version. |
| R11 | **Read-access audit** | Logging opens/exports alongside decisions | low | Closes G12. |
| R12 | **Anti-malware scan of the workbook** | A scanner, or an office-file sanitiser | medium | Closes G6 properly. Hard to do entirely in-browser. |

### 10.1 Explicitly *not* recommended without a decision

- **Adding a server-side component to hold the key.** It would **invert the privacy model** — the whole
  point of `src/lib/crypto.ts:9-14` is that the data never leaves the machine. A server-held key would
  make the key the single most valuable target in the system.
- **Adding a service worker for true offline support.** A genuine feature gap
  (`PROJECT_CONTEXT.md` §2.2 F27), but it adds a caching layer that must be reasoned about for a
  data-bearing app.
- **Adding telemetry or crash reporting.** It would break the `connect-src` guarantee (§4.1) and the
  offline gate (`scripts/check-offline.mjs:18`). If it were ever wanted it would need an explicit,
  visible opt-in — not a default.

---

## 11. Quick reference — control inventory

| Control | Status | Primary evidence |
| --- | --- | --- |
| Encryption at rest (AES-256-GCM, 256-bit, fresh 12-byte IV) | **Implemented** | `src/lib/crypto.ts:5`, `:18-27`, `:41-49`, `:74` |
| Key held in a separate IndexedDB database | **Implemented** | `src/lib/crypto.ts:3`; `src/lib/storage/idb.ts:23`, `:265` |
| Every IndexedDB record encrypted | **Implemented** | `src/lib/storage/idb.ts:89-91`, `:127-129`, `:150-152`, `:175-178`, `:196-198`, `:217-222`, `:239-252` |
| CSP — `object-src 'none'`, `base-uri 'none'`, `form-action 'self'`, `connect-src 'self'` | **Implemented** | `src/app/layout.tsx:19`, `:22-24` |
| CSP — `script-src` with `'unsafe-inline' 'unsafe-eval'` | **Implemented but weak** | `src/app/layout.tsx:15`; gap G7 |
| Egress prevention (runtime + build gate) | **Implemented** | `src/app/layout.tsx:19`; `scripts/check-offline.mjs:18-35` |
| No untrusted input rendered as markup | **Implemented** | 0 matches for `dangerouslySetInnerHTML` in `src/` |
| File-extension guard | **Implemented (name-based only)** | `src/app/ingest/page.tsx:146-151` |
| Schema-driven cell coercion + contradiction engine | **Implemented** | `src/schema/engine/normalize.ts:88-144`; `src/schema/engine/validate.ts:41-95` |
| Override value validated and re-coerced | **Implemented** | `src/components/RowDrawer.tsx:63-68`, `:115`; `src/contracts/resolution.ts:41-52` |
| Mandatory justification for drop/override | **Implemented** | `src/components/RowDrawer.tsx:62` |
| Audit log of decisions | **Implemented** (attribution constant only) | `src/contracts/resolution.ts:3-14`; `src/export/reportContext.ts:65-74` |
| SHA-256 manifest binding a report to a dataset | **Implemented (untested path)** | `src/export/reportContext.ts:44-47`, `:111-118` |
| Erase-all-local-data wipe | **Implemented** (`onblocked` treated as success) | `src/app/report/page.tsx:129-134`; `src/lib/storage/idb.ts:260-273` |
| Secrets management | **Not applicable — no secrets exist** | `process.env` absent from `src/`; `PROJECT_CONTEXT.md` §11.1 |
| Authentication / authorisation · key recovery · key rotation · multi-device · rate limiting · antivirus on uploads | **All absent** | G4, G1, G2, G3, G5, G6; [`09-authentication-and-authorization.md`](09-authentication-and-authorization.md) |

**Verified against the working tree at commit `dd9c0bf` (branch `main`).**
