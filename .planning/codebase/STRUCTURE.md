# Codebase Structure

**Analysis Date:** 2026-04-26

## Directory Layout

```text
bastion/
├── apps/                         # Deployable user-facing applications
│   └── dashboard/                # Next.js control-plane UI
├── packages/                     # Reusable runtime and domain packages
│   ├── cli/                      # `bastion` command binary and command handlers
│   ├── core/                     # Shared schemas, policy, config, redaction, reports
│   ├── edge/                     # Fastify API + local SQLite store
│   └── insights/                 # Friction/risk/spend analytics
├── .github/workflows/            # CI verification pipeline
├── .planning/codebase/           # Generated codebase mapping artifacts
├── .bastion/                     # Local runtime data path (workspace-level)
├── package.json                  # Workspace scripts and toolchain root
├── pnpm-workspace.yaml           # Workspace package boundaries
├── tsconfig.base.json            # Shared TypeScript compiler defaults and path aliases
└── tsconfig.json                 # TS project references root
```

## Directory Purposes

**apps/dashboard:**
- Purpose: User interface for risk metrics, events, findings, clusters, and recommendations.
- Contains: Next.js app-router files, UI rendering code, local API client, UI types, Tailwind config.
- Key files: `apps/dashboard/app/page.tsx`, `apps/dashboard/lib/api.ts`, `apps/dashboard/lib/types.ts`.

**packages/cli:**
- Purpose: Operator-facing CLI surface and hook/scanner/report orchestration.
- Contains: Commander command tree and all command-side workflows.
- Key files: `packages/cli/src/index.ts`, `packages/cli/package.json`.

**packages/core:**
- Purpose: Canonical domain model and governance engine shared by all runtime packages.
- Contains: Zod schemas, config I/O, policy evaluation, hook normalization, redaction, report rendering.
- Key files: `packages/core/src/schemas.ts`, `packages/core/src/policy.ts`, `packages/core/src/hooks.ts`, `packages/core/src/config.ts`.

**packages/edge:**
- Purpose: Local API process and persistence adapter.
- Contains: Fastify server routes, startup entrypoint, SQLite-backed store.
- Key files: `packages/edge/src/server.ts`, `packages/edge/src/store.ts`, `packages/edge/src/dev.ts`.

**packages/insights:**
- Purpose: Heuristic analytics derived from stored event/finding history.
- Contains: Clustering, risk scoring, spend estimation, recommendation logic.
- Key files: `packages/insights/src/index.ts`.

**.planning/codebase:**
- Purpose: Generated architecture/stack/convention/testing/concerns reference docs for GSD workflow.
- Contains: Markdown analysis artifacts.
- Key files: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md`.

## Key File Locations

**Entry Points:**
- `packages/cli/src/index.ts`: Main process entry for `bastion` binary and all CLI commands.
- `packages/edge/src/dev.ts`: Development runtime bootstrap for edge service.
- `packages/edge/src/server.ts`: Fastify app assembly and HTTP ingress routing.
- `apps/dashboard/app/page.tsx`: Next.js route entry rendering dashboard root page.
- `packages/core/src/index.ts`: Core package public API surface via re-exports.
- `packages/edge/src/index.ts`: Edge package public API surface via re-exports.
- `packages/insights/src/index.ts`: Insights package public API surface.

**Configuration:**
- `package.json`: Root scripts for build/dev/typecheck/lint/test fan-out.
- `pnpm-workspace.yaml`: Workspace package globs (`apps/*`, `packages/*`).
- `tsconfig.base.json`: Global compiler behavior and `@bastion/*` path aliases.
- `apps/dashboard/tsconfig.json`: Next.js-specific TS options and `@/*` alias.
- `packages/*/tsconfig.json`: Package build outputs and project references.
- `.github/workflows/ci.yml`: CI sequence (`typecheck`, `lint`, `test`, `build`).

**Core Logic:**
- `packages/core/src/schemas.ts`: Shared data contracts and config schema.
- `packages/core/src/policy.ts`: Governance decisions and finding generation.
- `packages/edge/src/server.ts`: Hook ingest, MCP proxy, read APIs.
- `packages/edge/src/store.ts`: SQLite persistence and summary composition.
- `packages/insights/src/index.ts`: Analytics and scoring engine.

**Testing:**
- `packages/core/src/*.test.ts`: Core policy/config/redaction tests.
- `packages/edge/src/server.test.ts`: Edge route behavior tests.
- `packages/insights/src/insights.test.ts`: Insights calculation tests.
- `packages/cli/src/install-hooks.test.ts`: Hook-install behavior tests.

## Naming Conventions

**Files:**
- Lowercase module names for domain units: `policy.ts`, `hooks.ts`, `report.ts`, `store.ts`.
- Package entry modules named `index.ts` for public exports and CLI bootstrap.
- Test files co-located using `.test.ts` suffix.

**Directories:**
- Top-level runtime boundaries use plural domains: `apps/` and `packages/`.
- Package names are lowercase single-purpose folders: `core`, `edge`, `insights`, `cli`.
- Next.js route hierarchy under `apps/dashboard/app/` follows app-router conventions.

## Where to Add New Code

**New Feature:**
- Primary code: place domain rules/contracts in `packages/core/src/`; place runtime API handlers in `packages/edge/src/`; place UI rendering in `apps/dashboard/app/` and fetch utilities in `apps/dashboard/lib/`.
- Tests: add co-located `.test.ts` files in the same package `src/` directory as feature logic.

**New Component/Module:**
- Implementation: create a focused module in the owning package `src/` directory and export it through that package's `src/index.ts` only if it is part of the package public surface.

**Utilities:**
- Shared helpers: `packages/core/src/` for cross-package domain/governance utilities.
- Edge-only helpers: `packages/edge/src/`.
- UI-only helpers/types: `apps/dashboard/lib/`.

## Module Boundaries and Dependency Direction

- `apps/dashboard` depends on local app code and edge HTTP APIs; it does not import workspace runtime packages directly.
- `packages/cli` depends on `@bastion/core` and dynamically imports `@bastion/edge` for runtime operations.
- `packages/edge` depends on `@bastion/core` and `@bastion/insights`.
- `packages/insights` depends on `@bastion/core` types.
- `packages/core` has no internal workspace package dependencies and acts as the foundational contract layer.
- Enforce one-way dependency flow: `core` -> (`insights`, `edge`, `cli`) -> `apps/dashboard` via HTTP, not direct package imports.

## Special Directories

**.bastion:**
- Purpose: Local SQLite and runtime artifact storage.
- Generated: Yes.
- Committed: No.

**apps/dashboard/.next:**
- Purpose: Next.js build/dev cache output.
- Generated: Yes.
- Committed: No.

**packages/*/dist:**
- Purpose: TypeScript build outputs consumed by package exports and tests.
- Generated: Yes.
- Committed: No.

**packages/cli/.bastion:**
- Purpose: Package-scoped local runtime database artifact during CLI usage/tests.
- Generated: Yes.
- Committed: No.

---

*Structure analysis: 2026-04-26*
