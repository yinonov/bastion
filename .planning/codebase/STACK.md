# Technology Stack

**Analysis Date:** 2026-04-26

## Languages

**Primary:**
- TypeScript 5.8.3 - Monorepo application and package code in `apps/dashboard` and `packages/*` (`package.json`, `pnpm-lock.yaml`).
- JavaScript (ES modules) - Runtime outputs and dual source files in core package (`packages/core/src/*.js`, built outputs in `packages/*/dist`).

**Secondary:**
- YAML - Workspace and CI configuration in `pnpm-workspace.yaml` and `.github/workflows/ci.yml`.
- SQL (embedded strings) - SQLite schema and queries in `packages/edge/src/store.ts`.

## Runtime

**Environment:**
- Node.js 22.x (explicit in CI via `.github/workflows/ci.yml`, and usage of `node:sqlite` in `packages/edge/src/store.ts` requires modern Node runtime).

**Package Manager:**
- pnpm 8.5.0 (root `package.json` `packageManager`, CI setup in `.github/workflows/ci.yml`).
- Lockfile: present (`pnpm-lock.yaml`, lockfileVersion `6.0`).

## Frameworks

**Core:**
- Next.js 15.2.4 - Dashboard web app in `apps/dashboard/package.json` with app router files in `apps/dashboard/app/layout.tsx` and `apps/dashboard/app/page.tsx`.
- React 19.0.0 / React DOM 19.0.0 - Dashboard UI rendering (`apps/dashboard/package.json`).
- Fastify 5.2.1 - Local edge API service in `packages/edge/src/server.ts`.
- Commander 13.1.0 - CLI command system in `packages/cli/src/index.ts`.
- Zod 3.24.2 - Shared schema validation and config parsing in `packages/core/src/schemas.ts`.

**Testing:**
- Node test runner (`node --test`) - Package tests executed via scripts in `packages/core/package.json`, `packages/edge/package.json`, `packages/cli/package.json`, and `packages/insights/package.json`.

**Build/Dev:**
- TypeScript compiler (`tsc`) 5.8.3 - Build/typecheck for packages via `tsconfig.json` files in `packages/*`.
- tsx 4.19.3 - Development execution for TypeScript entry points (`packages/edge/package.json`, `packages/cli/package.json`).
- Tailwind CSS 3.4.17 + PostCSS 8.5.3 + Autoprefixer 10.4.21 - Dashboard styling pipeline in `apps/dashboard/package.json`, `apps/dashboard/tailwind.config.ts`, and `apps/dashboard/postcss.config.mjs`.

## Key Dependencies

**Critical:**
- `fastify@5.2.1` - Hosts governance/event APIs and MCP proxy endpoints in `packages/edge/src/server.ts`.
- `zod@3.24.2` - Enforces runtime integrity for events/findings/config in `packages/core/src/schemas.ts` and usage in `packages/core/src/config.ts`.
- `next@15.2.4` + `react@19.0.0` - Serves operator dashboard in `apps/dashboard/app/page.tsx`.
- `commander@13.1.0` - Exposes Bastion CLI workflows (`init`, `run`, `scan`, `mcp add`) in `packages/cli/src/index.ts`.

**Infrastructure:**
- `node:sqlite` (`DatabaseSync`) - Local event/finding persistence in `packages/edge/src/store.ts`.
- Workspace internal packages (`@bastion/core`, `@bastion/edge`, `@bastion/insights`) - Shared domain logic and package linking configured in `tsconfig.base.json` paths and workspace deps in `pnpm-lock.yaml`.

## Configuration

**Environment:**
- Runtime config file is `bastion.config.json`, resolved by `resolveConfigPath` in `packages/core/src/config.ts`.
- Dashboard edge endpoint can be overridden with `BASTION_EDGE_URL` in `apps/dashboard/lib/api.ts`; default is `http://127.0.0.1:4711`.
- Claude Code hooks are installed into `.claude/settings.json` (project) or `~/.claude/settings.json` (user) by `installClaudeHooks` in `packages/cli/src/index.ts`.

**Build:**
- Root TS project references in `tsconfig.json` and shared compiler options/path aliases in `tsconfig.base.json`.
- Package-level builds output to `dist` (`packages/*/tsconfig.json`).
- Dashboard build via `next build` in `apps/dashboard/package.json` and minimal config in `apps/dashboard/next.config.mjs`.

## Platform Requirements

**Development:**
- Node.js 22 and pnpm 8.5.0 to match CI (`.github/workflows/ci.yml`).
- TypeScript 5.8.3 toolchain and project references (`package.json`, `tsconfig.json`).
- Local filesystem write access for SQLite at configured path (default `.bastion/bastion.db` from `packages/core/src/schemas.ts`).

**Production:**
- Deployment target: Node-hosted self-managed services (not a managed cloud platform). Edge API and dashboard run as separate Node processes (`packages/edge/src/dev.ts`, CLI `run --dashboard` in `packages/cli/src/index.ts`).
- CI/CD: GitHub Actions verify pipeline (`.github/workflows/ci.yml`) with `typecheck`, `lint`, `test`, and `build` before merge.

---

*Stack analysis: 2026-04-26*
