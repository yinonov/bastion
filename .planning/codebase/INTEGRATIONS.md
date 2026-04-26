# External Integrations

**Analysis Date:** 2026-04-26

## APIs & External Services

**Agent Platform Integrations:**
- Claude Code Hooks - Captures lifecycle and tool events for governance.
  - SDK/Client: Custom JSON hook payload handling in `packages/core/src/hooks.ts` and CLI handler in `packages/cli/src/index.ts` (`bastion hook claude`).
  - Auth: Not detected (local hook invocation model).

- MCP Upstream Servers (user-approved) - Proxies MCP JSON-RPC requests to configured upstream endpoints.
  - SDK/Client: Native `fetch` in `packages/edge/src/server.ts` (`app.post('/mcp/:serverName')`).
  - Auth: Per-server static headers from `bastion.config.json` (`mcp.servers.*.headers` schema in `packages/core/src/schemas.ts`).

**Internal Service-to-Service:**
- Dashboard to Edge API - Dashboard queries local edge summary endpoint.
  - SDK/Client: `fetch` in `apps/dashboard/lib/api.ts` to `${BASTION_EDGE_URL}/api/summary`.
  - Auth: Not detected (loopback/local trust model).

## Data Storage

**Databases:**
- SQLite (local file) via Node built-in sqlite driver.
  - Connection: Configured path in `exporters.localSqlite.path` (`packages/core/src/schemas.ts`), resolved by `resolveSqlitePath` in `packages/core/src/config.ts`.
  - Client: `DatabaseSync` from `node:sqlite` in `packages/edge/src/store.ts`.

**File Storage:**
- Local filesystem only.
  - Config and state files written/read via Node fs APIs in `packages/core/src/config.ts` and `packages/cli/src/index.ts`.

**Caching:**
- None detected as a dedicated cache service.
  - Dashboard explicitly fetches summary with `cache: 'no-store'` in `apps/dashboard/lib/api.ts`.

## Authentication & Identity

**Auth Provider:**
- Custom/local trust model.
  - Implementation: MCP access is policy-gated against approved servers in `packages/edge/src/server.ts` and `packages/core/src/policy.ts`; no OAuth/JWT/third-party IdP detected.

## Monitoring & Observability

**Error Tracking:**
- None detected for third-party SaaS (no Sentry/Datadog SDK imports detected in `apps/*` or `packages/*`).

**Logs:**
- Local event and finding persistence to SQLite through `LocalSqliteStore` in `packages/edge/src/store.ts`.
- CLI/status logs via `console.log` in `packages/cli/src/index.ts` and `packages/edge/src/dev.ts`.

## CI/CD & Deployment

**Hosting:**
- Not tied to a managed hosting provider. Runtime is self-hosted Node processes for edge and dashboard (`packages/edge/src/dev.ts`, `packages/cli/src/index.ts`).

**CI Pipeline:**
- GitHub Actions in `.github/workflows/ci.yml`.
  - Steps: checkout, pnpm setup (`8.5.0`), Node setup (`22`), install, typecheck, lint, test, build.

## Environment Configuration

**Required env vars:**
- No strictly required environment variable detected for core functionality.
- Optional: `BASTION_EDGE_URL` for dashboard API target override in `apps/dashboard/lib/api.ts`.

**Secrets location:**
- Secrets are intended to stay local and policy-controlled; sensitive scanning and redaction are handled by rules in `bastion.config.json` (`packages/core/src/schemas.ts`, `packages/core/src/redaction.ts`).
- MCP upstream header credentials, if used, are stored in `bastion.config.json` under `mcp.servers.*.headers` (`packages/core/src/schemas.ts`).

## Webhooks & Callbacks

**Incoming:**
- `POST /api/hooks/claude` in `packages/edge/src/server.ts` for Claude hook payload ingestion.
- `POST /mcp/:serverName` in `packages/edge/src/server.ts` for MCP proxy ingress.

**Outgoing:**
- Edge proxy calls configured MCP upstream URLs with `fetch(server.url, ...)` in `packages/edge/src/server.ts`.
- Dashboard SSR calls edge summary endpoint with `fetch` in `apps/dashboard/lib/api.ts`.

---

*Integration audit: 2026-04-26*
