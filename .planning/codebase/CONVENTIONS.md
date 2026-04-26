# Coding Conventions

**Analysis Date:** 2026-04-26

## Naming Patterns

**Files:**
- Lowercase, domain-oriented names for implementation files: `packages/core/src/config.ts`, `packages/edge/src/server.ts`, `packages/insights/src/index.ts`.
- Co-located tests use `*.test.ts` suffix next to implementation: `packages/core/src/policy.test.ts`, `packages/edge/src/server.test.ts`.
- NodeNext runtime import targets use explicit `.js` extension in TypeScript source: `packages/core/src/policy.ts`, `packages/cli/src/index.ts`.

**Functions:**
- `camelCase` for functions and helpers: `evaluatePolicy` in `packages/core/src/policy.ts`, `resolveSqlitePath` in `packages/core/src/config.ts`, `buildFrictionClusters` in `packages/insights/src/index.ts`.
- React component functions use `PascalCase`: `Home`, `Metric`, `Panel` in `apps/dashboard/app/page.tsx`.

**Variables:**
- `camelCase` for local variables and constants: `defaultConfig` in `packages/core/src/config.ts`, `edgeUrl` in `apps/dashboard/lib/api.ts`, `dashboardProcess` in `packages/cli/src/index.ts`.

**Types:**
- `PascalCase` for type aliases and schemas: `PolicyEvaluation` in `packages/core/src/policy.ts`, `BastionConfigSchema` in `packages/core/src/schemas.ts`, `DashboardSummary` in `apps/dashboard/lib/types.ts`.
- Type-only imports are explicitly marked with `import type`: `packages/core/src/hooks.ts`, `apps/dashboard/app/layout.tsx`.

## Code Style

**Formatting:**
- Tool used: Not detected (`.prettierrc*`, `prettier.config.*`, `biome.json` not present).
- Effective style is enforced by consistency in source:
  - Double quotes
  - Semicolons
  - Trailing commas in multiline objects/arrays
  - Multi-line object literals and destructuring for readability
- Representative files: `packages/core/src/schemas.ts`, `packages/edge/src/server.ts`, `apps/dashboard/app/page.tsx`.

**Linting:**
- Tool used: No dedicated linter config detected (`.eslintrc*` and `eslint.config.*` not present).
- `lint` scripts run TypeScript compile checks (`tsc -b` / `tsc --noEmit`) rather than rule-based linting:
  - `packages/core/package.json`
  - `packages/edge/package.json`
  - `packages/cli/package.json`
  - `packages/insights/package.json`
  - `apps/dashboard/package.json`

## Import Organization

**Order:**
1. Node built-ins (`node:*`) first: `packages/edge/src/server.ts`, `packages/cli/src/index.ts`.
2. Third-party packages next (`fastify`, `commander`, `zod`, UI libs): `packages/core/src/schemas.ts`, `apps/dashboard/app/page.tsx`.
3. Workspace aliases (`@bastion/*`) next: `packages/edge/src/store.ts`, `packages/edge/src/server.ts`.
4. Relative imports last (`./*.js`, `./types`): `packages/core/src/config.ts`, `apps/dashboard/lib/api.ts`.

**Path Aliases:**
- Workspace TS aliases from `tsconfig.base.json`:
  - `@bastion/core`
  - `@bastion/edge`
  - `@bastion/insights`
- Dashboard-local alias from `apps/dashboard/tsconfig.json`:
  - `@/*` mapped to app root.

## Error Handling

**Patterns:**
- Recoverable filesystem errors use typed guards for `ENOENT`: `loadConfig` and `readJsonObject` with `isNodeError` in `packages/core/src/config.ts` and `packages/cli/src/index.ts`.
- Unknown errors are rethrown after specific handling: `packages/core/src/config.ts`.
- Network/proxy failures return structured JSON-RPC errors instead of throwing: `packages/edge/src/server.ts`.
- Defensive parsing is done with Zod at boundaries: `AgentEventSchema.parse` in `packages/core/src/hooks.ts`, `SecurityFindingSchema.parse` in `packages/edge/src/store.ts`.

## Logging

**Framework:** `console` and Fastify with logger disabled.

**Patterns:**
- CLI lifecycle/status logs through `console.log`: `packages/cli/src/index.ts`.
- Service runtime logging minimized (`Fastify({ logger: false })`): `packages/edge/src/server.ts`.
- No shared structured logging abstraction detected.

## Comments

**When to Comment:**
- Minimal inline comments; code favors descriptive names and explicit types over prose comments.
- Behavior is expressed through function decomposition (`makeMcpEvent`, `jsonRpcError`, `clusterKey`) in `packages/edge/src/server.ts` and `packages/insights/src/index.ts`.

**JSDoc/TSDoc:**
- Not detected in primary source files under `packages/*/src` and `apps/dashboard`.

## Function Design

**Size:**
- Most functions are short and single-purpose (`resolveConfigPath`, `toPermissionDecision`, `riskTone`).
- A few orchestrators are large and command/router-centric (`packages/cli/src/index.ts`, `packages/edge/src/server.ts`).

**Parameters:**
- Options objects for extensibility in entry points (`EdgeServerOptions` in `packages/edge/src/server.ts`).
- Explicit default parameters for runtime context (`cwd = process.cwd()` in `packages/core/src/config.ts`).

**Return Values:**
- Explicit return types are common for exported functions and class methods (`Promise<FastifyInstance>`, `PolicyEvaluation`, `DashboardSummary`).
- Parsing/validation returns typed domain objects (`z.infer` types in `packages/core/src/schemas.ts`).

## Module Design

**Exports:**
- Barrel export pattern in `packages/core/src/index.ts`.
- Package boundaries exposed via `exports` in each package manifest:
  - `packages/core/package.json`
  - `packages/edge/package.json`
  - `packages/insights/package.json`

**Barrel Files:**
- Used in core package (`packages/core/src/index.ts`).
- Other packages export through package-level `main`/`types` entrypoints rather than internal barrel hierarchies.

## Current Convention Gaps

- No dedicated linting/formatting config; style relies on manual consistency and TypeScript checks only (`package.json`, package-level manifests).
- Generated/runtime-adjacent files are tracked inside source directories (`packages/core/src/*.js`, `packages/core/src/*.d.ts`), increasing noise and potential drift from TypeScript sources.
- Import ordering is consistent in many files but not formally enforced by tooling.
- Logging format is not standardized across CLI and server paths (`packages/cli/src/index.ts`, `packages/edge/src/server.ts`).

---

*Convention analysis: 2026-04-26*
