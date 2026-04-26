<!-- refreshed: 2026-04-26 -->
# Architecture

**Analysis Date:** 2026-04-26

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────────┐
│                     User Interfaces and Integrations                          │
├────────────────────────┬─────────────────────────┬────────────────────────────┤
│   CLI Commands         │   Dashboard UI          │   Hook + MCP Inputs        │
│  `packages/cli/src`    │ `apps/dashboard/app`    │ `packages/edge/src/server` │
└───────────────┬────────┴───────────────┬─────────┴───────────────┬────────────┘
                │                        │                         │
                ▼                        ▼                         ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                      Service and Governance Layer                             │
│ `packages/edge/src/server.ts`, `packages/core/src/{hooks,policy,config}.ts` │
└───────────────────────────────────────────────────────────────────────────────┘
                │
                ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│           Storage + Analytics + Report Output                                │
│ `packages/edge/src/store.ts`, `packages/insights/src/index.ts`,              │
│ `packages/core/src/report.ts`, `.bastion/bastion.db`                         │
└───────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| CLI runtime | Command parsing, lifecycle orchestration, hook setup, scanning, report export | `packages/cli/src/index.ts` |
| Edge API | Fastify routes for summary/events/findings/report/hook ingest/MCP proxy | `packages/edge/src/server.ts` |
| SQLite store | Event/finding persistence, schema migration, dashboard aggregation | `packages/edge/src/store.ts` |
| Core domain | Schema validation, policy engine, redaction, config load/save, hook normalization, report rendering | `packages/core/src/index.ts` |
| Insights engine | Friction clustering, risk scoring, developer insight generation, spend estimation | `packages/insights/src/index.ts` |
| Dashboard app | SSR page that fetches summary and renders control-plane views | `apps/dashboard/app/page.tsx` |

## Pattern Overview

**Overall:** Modular monorepo with layered service boundaries and package-level domain separation.

**Key Characteristics:**
- Domain contracts are centralized in `@bastion/core` and imported by edge, insights, and cli packages.
- Runtime ingress points are split by channel: CLI command entry, HTTP routes, and hook payload ingestion.
- Persistence and analytics are composed in `LocalSqliteStore` to produce a single dashboard summary object.

## Layers

**Presentation Layer:**
- Purpose: Render operational state for humans and expose command-line UX.
- Location: `apps/dashboard/app/page.tsx`, `packages/cli/src/index.ts`
- Contains: Next.js page component and Commander command definitions.
- Depends on: `apps/dashboard/lib/api.ts`, dynamic imports from `@bastion/edge`, utilities from `@bastion/core`.
- Used by: End users and local operators.

**Service/API Layer:**
- Purpose: Process incoming hook/MCP traffic and expose read endpoints.
- Location: `packages/edge/src/server.ts`
- Contains: Fastify route handlers and MCP proxy policy gate.
- Depends on: `@bastion/core` policy/config/hook functions and `LocalSqliteStore`.
- Used by: Dashboard (`/api/summary`), Claude hooks (`/api/hooks/claude`), MCP clients (`/mcp/:serverName`).

**Domain/Governance Layer:**
- Purpose: Validate data, enforce policy, redact sensitive material, format reports.
- Location: `packages/core/src/schemas.ts`, `packages/core/src/policy.ts`, `packages/core/src/hooks.ts`, `packages/core/src/report.ts`, `packages/core/src/config.ts`
- Contains: Zod schemas, policy decision logic, hook adapters, config persistence, markdown report generator.
- Depends on: Node stdlib and `zod`.
- Used by: `packages/edge/src/server.ts`, `packages/cli/src/index.ts`, `packages/edge/src/store.ts`.

**Persistence + Analytics Layer:**
- Purpose: Store canonical records and derive scored operational summaries.
- Location: `packages/edge/src/store.ts`, `packages/insights/src/index.ts`
- Contains: SQLite schema/migrations, read/write methods, clustering and scoring heuristics.
- Depends on: `node:sqlite`, `@bastion/core`, `@bastion/insights`.
- Used by: Edge routes and CLI scan/export/report workflows.

## Data Flow

### Primary Request Path

1. Dashboard SSR calls `getDashboardSummary()` (`apps/dashboard/app/page.tsx:17`).
2. Data client fetches edge summary endpoint at `/api/summary` (`apps/dashboard/lib/api.ts:7`).
3. Fastify route resolves to `store.dashboardSummary()` (`packages/edge/src/server.ts:39`).
4. Store loads events/findings and computes clusters/insights/risk totals (`packages/edge/src/store.ts:94`).
5. Summary JSON is returned and rendered into cards, stream rows, findings, and insights (`apps/dashboard/app/page.tsx:20`).

### Hook Governance Flow

1. CLI-installed hook invokes `bastion hook claude` and enters handler (`packages/cli/src/index.ts:194`).
2. Hook payload normalizes into `AgentEvent` (`packages/core/src/hooks.ts:23`).
3. Policy engine evaluates secrets/tool/path/command rules (`packages/core/src/policy.ts:11`).
4. Resulting event and findings persist via store (`packages/cli/src/index.ts:201`).
5. Claude-compatible decision response is emitted to stdout (`packages/cli/src/index.ts:204`).

### MCP Proxy Enforcement Flow

1. Request enters `/mcp/:serverName` route (`packages/edge/src/server.ts:61`).
2. Server approval and policy checks run (`packages/edge/src/server.ts:83`).
3. Allowed HTTP upstream requests are forwarded with JSON-RPC body (`packages/edge/src/server.ts:107`).
4. Latency/status and findings are written to local store (`packages/edge/src/server.ts:117`).
5. Upstream response payload is returned to caller (`packages/edge/src/server.ts:120`).

**State Management:**
- Persistent state lives in SQLite (`.bastion/bastion.db`) managed by `LocalSqliteStore`.
- Request-level transient state is function-local within route handlers and command actions.
- Config state is materialized from `bastion.config.json` via `loadConfig()`.

## Key Abstractions

**Schema Contracts (`AgentEvent`, `SecurityFinding`, `DashboardSummary`):**
- Purpose: Enforce canonical types and runtime validation at package boundaries.
- Examples: `packages/core/src/schemas.ts`, `packages/edge/src/store.ts`
- Pattern: Zod-first schema definitions exported from core and parsed at ingestion/persistence edges.

**Policy Evaluation (`evaluatePolicy`):**
- Purpose: Convert event context into decision + findings + redacted payload output.
- Examples: `packages/core/src/policy.ts`, `packages/edge/src/server.ts`
- Pattern: Pure domain function returning structured evaluation object.

**Storage Facade (`LocalSqliteStore`):**
- Purpose: Provide a single persistence and summary API to edge and cli flows.
- Examples: `packages/edge/src/store.ts`, `packages/cli/src/index.ts`
- Pattern: Class encapsulating migration, CRUD-like methods, and summary composition.

## Entry Points

**CLI Binary:**
- Location: `packages/cli/src/index.ts`
- Triggers: `bastion` executable from package bin mapping (`packages/cli/package.json`).
- Responsibilities: Initialize config, start edge/dashboard, install hooks, manage MCP servers, scan files, export reports, run hook handler.

**Edge Dev Bootstrap:**
- Location: `packages/edge/src/dev.ts`
- Triggers: `pnpm --filter @bastion/edge dev`.
- Responsibilities: Start Fastify service and wire SIGINT/SIGTERM shutdown handling.

**Dashboard Route Entry:**
- Location: `apps/dashboard/app/page.tsx`
- Triggers: Next.js root route request in app router.
- Responsibilities: Server-fetch summary and render operational UI sections.

## Architectural Constraints

- **Threading:** Single-threaded Node.js event loop for CLI and edge runtime; no worker-thread usage detected.
- **Global state:** Process-level warning filter override in `packages/cli/src/index.ts`; Commander `program` singleton in same file.
- **Circular imports:** Not detected in package source imports.
- **Transport constraint:** MCP proxy supports HTTP upstream forwarding; stdio upstreams are registered but return 501 in edge route (`packages/edge/src/server.ts:93`).
- **Persistence coupling:** Edge and CLI both depend on local SQLite path derived from shared config (`packages/core/src/config.ts:51`).

## Anti-Patterns

### Mixed Source and Compiled Artifacts in `src`

**What happens:** TypeScript source and generated JavaScript/definition files coexist under source directories (for example `packages/core/src/*.ts`, `packages/core/src/*.js`, `packages/core/src/*.d.ts`).
**Why it's wrong:** Import graph and review noise increase, and source-of-truth ambiguity appears during edits and static analysis.
**Do this instead:** Keep authored source in `src/` and generated outputs in `dist/` only, using `packages/*/tsconfig.json` `outDir` as the sole compiled target.

### Broad Aggregator in CLI Root Module

**What happens:** Command registration, hook plumbing, scanner traversal, config I/O, and process patching are all implemented in a single file (`packages/cli/src/index.ts`).
**Why it's wrong:** Single-file orchestration increases cognitive load and raises change risk across unrelated command paths.
**Do this instead:** Keep `packages/cli/src/index.ts` as command wiring only and split command handlers/scanner/hooks into separate modules imported by the root command builder.

## Error Handling

**Strategy:** Fail-open for dashboard read path and explicit JSON-RPC/HTTP failures for policy and upstream proxy failures.

**Patterns:**
- Dashboard client catches API errors and returns an empty summary fallback (`apps/dashboard/lib/api.ts`).
- Policy and MCP route errors return structured denial or JSON-RPC error envelopes (`packages/edge/src/server.ts`).

## Cross-Cutting Concerns

**Logging:** Lightweight `console.log` in CLI/edge startup; Fastify logger disabled (`packages/edge/src/server.ts`).
**Validation:** Zod parsing at event/finding/config/persistence boundaries (`packages/core/src/schemas.ts`, `packages/edge/src/store.ts`).
**Authentication:** No auth layer for local edge endpoints; governance relies on local execution context and policy checks.

---

*Architecture analysis: 2026-04-26*
