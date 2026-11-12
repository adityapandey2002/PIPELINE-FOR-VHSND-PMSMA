# Documentation index — VHSND & PMSMA Pipeline

Single entry point to every document in this repository. Nothing here is duplicated from the
sources it links to — follow the links.

## How to use these docs

| If you want to… | Read |
|---|---|
| Understand the product in plain language | [`../README.md`](../README.md) (Part A) |
| Understand the architecture and pipeline | [`PIPELINE.md`](PIPELINE.md) |
| Understand the 253-column schema, rules, indicators, comparisons | [`DATA-MODEL.md`](DATA-MODEL.md) |
| Set up, run gates, contribute, troubleshoot | [`DEVELOPMENT.md`](DEVELOPMENT.md) |
| Read the single-file source of truth (every claim cited) | [`../PROJECT_CONTEXT.md`](../PROJECT_CONTEXT.md) |
| Onboard an AI coding agent to this repo | [`AI_AGENT_CONTEXT.md`](AI_AGENT_CONTEXT.md) |

Every claim in `PROJECT_CONTEXT.md` and `PIPELINE.md` is cited as `file:line` and was
verified against the working tree at commit `7ba9745`. Anything unverified is marked
**TBD / Not found in codebase** rather than guessed. Status legend used throughout:
**Implemented** · **Partially implemented** · **Planned / Not found in codebase**.

Docs are updated in the same commit as the code they describe; `docs/PIPELINE.md` records
`HEAD` as its parent commit by convention. Generated files (`src/schema/columns-vhsnd.ts`,
`src/export/templates.generated.ts`, `AGENTS.md`, `next-env.d.ts`) are never edited by hand.

## Repository at a glance

| Quantity | Value |
|---|---|
| Column registry | 253 columns |
| Schema fields | 129 (14 select-multiple groups) |
| Cross-field rules | 37 (11 error / 23 warning / 3 info) |
| Indicators / comparisons | 21 / 21 |
| Chart kinds rendered | 18 |
| Source files | 50 in `src/` |
| Tests | 19 files / 212 tests, all passing |
| Static routes | 6 |
| IndexedDB databases | 2 (6 object stores + 1 key store) |
| Backend services | 0 |

Rule of thumb: **README.md** for humans new to the product, **PIPELINE.md** for the codemap,
**DATA-MODEL.md** for the schema, **DEVELOPMENT.md** for how to change it, and
**PROJECT_CONTEXT.md** when you need a citation (`file:line`) for any claim.

## Document inventory

### Core documents

| Document | Location | One-line description |
|---|---|---|
| `README.md` | repo root | Product overview in plain language + technical deep dive, commands, structure |
| `PROJECT_CONTEXT.md` | repo root | Single-file source of truth: 20 sections, every claim cited to `file:line` |
| `docs/PIPELINE.md` | `docs/` | Line-cited codemap: 8-stage pipeline, UI map, gates, file inventory |
| `docs/DATA-MODEL.md` | `docs/` | 253-column registry, field DSL, 37 validation rules, 21 indicators, 21 comparisons, extension recipes |
| `docs/DEVELOPMENT.md` | `docs/` | Environment, five gates, scripts, test conventions, generated-file rules, traps |
| `docs/AI_AGENT_CONTEXT.md` | `docs/` | Practical context for a future AI coding agent (architecture, standards, pitfalls) |
| `docs/README.md` | `docs/` | This index |
| `AGENTS.md` | repo root | Next.js agent-rules block, auto-rewritten by `next dev` / `next build` |
| `CLAUDE.md` | repo root | One line: `@AGENTS.md` |

### Numbered reference series

| # | Document | Covers |
|---|---|---|
| 01 | [`01-project-overview.md`](01-project-overview.md) | What the app does, the problem it solves, who it is for, design principles, scope reality |
| 02 | [`02-technology-stack.md`](02-technology-stack.md) | Every technology with version, usage site, why it matters, relationships, dependency graph |
| 03 | [`03-project-structure.md`](03-project-structure.md) | Annotated directory tree, per-directory roles, generated files and how to regenerate them |
| 04 | [`04-system-architecture.md`](04-system-architecture.md) | Layering, import direction, container diagram, worker strategy, cross-cutting concerns |
| 05 | [`05-application-workflows.md`](05-application-workflows.md) | Sequence diagrams for the four user journeys, ingest state machine, export gating, wipe |
| 06 | [`06-modules-and-features.md`](06-modules-and-features.md) | Catalogue of all 50 `src/` modules + 34-row feature inventory with status |
| 07 | [`07-database-documentation.md`](07-database-documentation.md) | Both IndexedDB databases, per-store key strategy, encryption scheme, ER diagram, migrations |
| 08 | [`08-api-documentation.md`](08-api-documentation.md) | The TypeScript module-boundary API (there is no HTTP API), conventions, error contract |
| 09 | [`09-authentication-and-authorization.md`](09-authentication-and-authorization.md) | Proof that auth/authz are absent, the real trust model, recommendations |
| 10 | [`10-configuration-and-environment.md`](10-configuration-and-environment.md) | No environment variables (proved), every config file, all 12 npm scripts |
| 11 | [`11-installation-and-setup.md`](11-installation-and-setup.md) | Prerequisites, install, run, the Windows `&`-in-path workaround, fixtures |
| 12 | [`12-development-guide.md`](12-development-guide.md) | Conventions, DSL extension map, coding standards, git workflow, pitfalls |
| 13 | [`13-testing-and-quality.md`](13-testing-and-quality.md) | Vitest setup, 19-file/212-test inventory, the five gates, what is untested |
| 14 | [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) | Build artefact, serving requirements, `file://` prohibition, deployment diagram |
| 15 | [`15-security-documentation.md`](15-security-documentation.md) | Threat model, CSP directive by directive, encryption at rest, gaps, recommendations |
| 16 | [`16-error-handling-and-logging.md`](16-error-handling-and-logging.md) | Actual error patterns, the logging reality (there is none), recommendations |
| 17 | [`17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) | The 8 bundled libraries, proof that nothing integrates over the network |
| 18 | [`18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) | The 9 scripts, recurring tasks, symptom → cause → fix tables, known-broken scripts |
| 19 | [`19-performance-and-scalability.md`](19-performance-and-scalability.md) | Static analysis vs measurement, scaling risks, measured fixture sizes, mitigations |
| 20 | [`20-future-improvements.md`](20-future-improvements.md) | Prioritised proposals — explicitly **not** commitments — and open questions |

### Diagrams

| Document | Diagram |
|---|---|
| [`diagrams/system-architecture.md`](diagrams/system-architecture.md) | Container/component view of the browser bundle |
| [`diagrams/application-flow.md`](diagrams/application-flow.md) | End-to-end flow with worker handoff and the partial-comparison gate |
| [`diagrams/database-er-diagram.md`](diagrams/database-er-diagram.md) | Conceptual ER diagram of the IndexedDB object stores |
| [`diagrams/deployment-architecture.md`](diagrams/deployment-architecture.md) | Build → `out/` → static host, with the CSP boundary |

## Quick links by audience

- **New developers** — [`DEVELOPMENT.md`](DEVELOPMENT.md) (setup + gates) →
  [`PIPELINE.md` §2](PIPELINE.md) (architecture) → [`README.md`](../README.md) quick start.
- **Architects** — [`PROJECT_CONTEXT.md` §4](../PROJECT_CONTEXT.md#4-architecture) (layering + diagrams) →
  [`PROJECT_CONTEXT.md` §6](../PROJECT_CONTEXT.md#6-database-design) (IndexedDB) →
  [`PROJECT_CONTEXT.md` §7](../PROJECT_CONTEXT.md#7-api--backend) (TS module boundary).
- **Contributors** — [`DEVELOPMENT.md`](DEVELOPMENT.md) ("Adding things") →
  [`DATA-MODEL.md`](DATA-MODEL.md) (Part C recipes) → generated-file rules
  (`src/schema/columns-vhsnd.ts`, `src/export/templates.generated.ts`).
- **Operators** — [`README.md`](../README.md) (offline/privacy) →
  [`PROJECT_CONTEXT.md` §13](../PROJECT_CONTEXT.md#13-deployment) (serving requirements, `file://` not supported) →
  [`PROJECT_CONTEXT.md` §14](../PROJECT_CONTEXT.md#14-security--performance) (CSP, key management).

## Master-prompt topic map (20 numbered topics)

Each topic now has a dedicated reference document. `PROJECT_CONTEXT.md` §§1–20 remains the
single-file audit trail; the numbered series goes deeper and links back to it.

| # | Topic | Dedicated document | Also in |
|---|---|---|---|
| 1 | Project Overview | [`01-project-overview.md`](01-project-overview.md) | `PROJECT_CONTEXT.md` §1 |
| 2 | Features and User Flows | [`06-modules-and-features.md`](06-modules-and-features.md) | `PROJECT_CONTEXT.md` §2 |
| 3 | Tech Stack | [`02-technology-stack.md`](02-technology-stack.md) | `PROJECT_CONTEXT.md` §3 |
| 4 | Architecture | [`04-system-architecture.md`](04-system-architecture.md) · [`diagrams/system-architecture.md`](diagrams/system-architecture.md) | `PROJECT_CONTEXT.md` §4 |
| 5 | Folder & File Structure | [`03-project-structure.md`](03-project-structure.md) | `PROJECT_CONTEXT.md` §5 |
| 6 | Database Design | [`07-database-documentation.md`](07-database-documentation.md) · [`diagrams/database-er-diagram.md`](diagrams/database-er-diagram.md) | `PROJECT_CONTEXT.md` §6 |
| 7 | API / Backend | [`08-api-documentation.md`](08-api-documentation.md) | `PROJECT_CONTEXT.md` §7 |
| 8 | Frontend | [`04-system-architecture.md`](04-system-architecture.md) | `PROJECT_CONTEXT.md` §8 |
| 9 | Business Logic | [`PIPELINE.md`](PIPELINE.md) · [`DATA-MODEL.md`](DATA-MODEL.md) | `PROJECT_CONTEXT.md` §9 |
| 10 | Third-Party Integrations | [`17-integrations-and-third-party-services.md`](17-integrations-and-third-party-services.md) | `PROJECT_CONTEXT.md` §10 |
| 11 | Configuration & Environment | [`10-configuration-and-environment.md`](10-configuration-and-environment.md) | `PROJECT_CONTEXT.md` §11 |
| 12 | Setup & Installation | [`11-installation-and-setup.md`](11-installation-and-setup.md) | `PROJECT_CONTEXT.md` §12 |
| 13 | Deployment | [`14-deployment-and-infrastructure.md`](14-deployment-and-infrastructure.md) · [`diagrams/deployment-architecture.md`](diagrams/deployment-architecture.md) | `PROJECT_CONTEXT.md` §13 (mostly TBD) |
| 14 | Security & Performance | [`15-security-documentation.md`](15-security-documentation.md) · [`19-performance-and-scalability.md`](19-performance-and-scalability.md) | `PROJECT_CONTEXT.md` §14 |
| 15 | Testing | [`13-testing-and-quality.md`](13-testing-and-quality.md) | `PROJECT_CONTEXT.md` §15 |
| 16 | Known Issues & Technical Debt | [`20-future-improvements.md`](20-future-improvements.md) (fix-first section) | `PROJECT_CONTEXT.md` §16 |
| 17 | Future Enhancements | [`20-future-improvements.md`](20-future-improvements.md) | `PROJECT_CONTEXT.md` §17 (inferred, not commitments) |
| 18 | Development History | [`12-development-guide.md`](12-development-guide.md) (git workflow) | `PROJECT_CONTEXT.md` §18 (6 commits + reconstructed narrative) |
| 19 | Screenshots & Diagrams Needed | [`diagrams/`](diagrams/) | `PROJECT_CONTEXT.md` §19 (9 screenshots still absent) |
| 20 | Glossary & Quick Facts | [`01-project-overview.md`](01-project-overview.md) | `PROJECT_CONTEXT.md` §20; `README.md` (glossary) |
| — | Application workflows | [`05-application-workflows.md`](05-application-workflows.md) · [`diagrams/application-flow.md`](diagrams/application-flow.md) | `PROJECT_CONTEXT.md` §2, §4 |
| — | Auth & authorization | [`09-authentication-and-authorization.md`](09-authentication-and-authorization.md) | `PROJECT_CONTEXT.md` §7, §14 |
| — | Error handling & logging | [`16-error-handling-and-logging.md`](16-error-handling-and-logging.md) | `PROJECT_CONTEXT.md` §9, §16 |
| — | Maintenance & troubleshooting | [`18-maintenance-and-troubleshooting.md`](18-maintenance-and-troubleshooting.md) | `PIPELINE.md` §6 |


## Suggested reading order

1. `README.md` (root) — product + quick start.
2. `docs/PIPELINE.md` — architecture and the 8-stage pipeline.
3. `docs/DATA-MODEL.md` — schema, rules, indicators, comparisons, extension recipes.
4. `docs/DEVELOPMENT.md` — setup, gates, scripts, traps.
5. `PROJECT_CONTEXT.md` — citations and the full audit of what is and is not implemented.

## What is NOT documented

The following are explicitly **TBD / Not found in codebase** in `PROJECT_CONTEXT.md` and are
not documented anywhere else either. Do not invent answers; ask the project owner.

- **Deployment host, URL, operator and rollout procedure** —
  `PROJECT_CONTEXT.md` §13.2, §17.5, and the "Unavailable" table in the Coverage Report.
- **Performance benchmarks or measurements** — `PROJECT_CONTEXT.md` §14.5 is static analysis only;
  no benchmark, profiling harness or performance budget exists (`PROJECT_CONTEXT.md` §16.6).
- **Roadmap, backlog or issue tracker** — `PROJECT_CONTEXT.md` §17 items are logical extensions
  labelled as *not* commitments; no roadmap file exists.
- **Licence and contributor identity** — `package.json` has no `license` field, there is no
  `LICENSE`/`CODEOWNERS`/`CONTRIBUTING.md`; `PROJECT_CONTEXT.md` Coverage Report "Unavailable".

Also absent (for completeness): screenshots/visual docs (`PROJECT_CONTEXT.md` §19.2), CI/CD
config, code-coverage reporting, formatter/editor config, and e2e/browser tests
(`PROJECT_CONTEXT.md` §16.6). All are listed as gaps, not documented procedures.