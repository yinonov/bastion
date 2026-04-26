# Codebase Concerns

**Analysis Date:** 2026-04-26

## Tech Debt

**Build artifacts mixed into source trees (High-risk):**
- Issue: TypeScript source directories contain generated `.js` and `.d.ts` files alongside `.ts`, while `dist/` artifacts are also committed, creating dual sources of truth and merge/churn risk.
- Files: `packages/core/src/index.ts`, `packages/core/src/index.js`, `packages/core/src/schemas.ts`, `packages/core/src/schemas.d.ts`, `packages/core/dist/index.js`, `packages/edge/dist/server.js`
- Impact: Review noise, accidental edits to generated files, stale artifact publication, and harder debugging when runtime code differs from edited TS sources.
- Fix approach: Keep authored code in `src/**/*.ts` only; generate artifacts exclusively into `dist/`; remove generated files from `src/`; enforce with clean/build checks in CI.

**No dedicated linting layer (Minor debt):**
- Issue: `lint` scripts run TypeScript compilation (`tsc -b`) instead of rule-based linting.
- Files: `package.json`, `packages/core/package.json`, `packages/edge/package.json`, `packages/cli/package.json`, `packages/insights/package.json`, `apps/dashboard/package.json`
- Impact: Style, maintainability, and suspicious-pattern checks (for example, error swallowing patterns) are not enforced.
- Fix approach: Add ESLint/Biome config and enforce in CI as a separate gate from type-check.

## Known Bugs

**Dashboard report link ignores configured edge URL:**
- Symptoms: Dashboard link always points to `http://127.0.0.1:4711/api/report` even when edge URL is configured differently.
- Files: `apps/dashboard/app/page.tsx`, `apps/dashboard/lib/api.ts`
- Trigger: Set `BASTION_EDGE_URL` to a non-default host/port, then click "AI Workflow Audit".
- Workaround: Manually navigate to `${BASTION_EDGE_URL}/api/report`.

**`bastion hook` target validation is bypassable with second argument:**
- Symptoms: Invalid first argument can pass validation when optional second argument is `claude`.
- Files: `packages/cli/src/index.ts`
- Trigger: Run `bastion hook anything claude`.
- Workaround: Use only the supported invocation path (`bastion hook claude`) and avoid extra arguments.

## Security Considerations

**Unauthenticated edge API and MCP proxy surface (High-risk):**
- Risk: `GET /api/*`, `POST /api/hooks/claude`, and `POST /mcp/:serverName` have no authentication/authorization checks.
- Files: `packages/edge/src/server.ts`, `packages/core/src/schemas.ts`
- Current mitigation: Default edge host is loopback (`127.0.0.1`) in config defaults.
- Recommendations: Add API authentication, optional local token/mTLS, explicit bind restrictions, and reject non-local traffic by default.

**Potential sensitive metadata persistence in local database (Medium):**
- Risk: Event metadata and snippets are persisted locally and may include file paths, commands, and contextual text.
- Files: `packages/core/src/hooks.ts`, `packages/edge/src/store.ts`
- Current mitigation: Raw payload capture defaults to disabled; redaction is applied before persistence.
- Recommendations: Add explicit retention policies, redaction tests for metadata fields, and optional encryption-at-rest for local DB.

## Performance Bottlenecks

**Synchronous SQLite operations on request path (High-risk under load):**
- Problem: HTTP handlers execute synchronous DB writes/reads (`DatabaseSync`) per request.
- Files: `packages/edge/src/server.ts`, `packages/edge/src/store.ts`, `packages/edge/src/node-sqlite.d.ts`
- Cause: Request thread blocks while SQL executes and while summary aggregation runs.
- Improvement path: Move to async DB access or worker-thread queue; batch writes; add metrics and backpressure handling.

**Full recursive file scanning can become expensive (Medium):**
- Problem: `scan` reads almost all files under target path and processes content with regex redaction.
- Files: `packages/cli/src/index.ts`
- Cause: Recursive traversal + per-file read + regex pass, with minimal filtering and no concurrency/timeout controls.
- Improvement path: Add extension allowlist, symlink handling, concurrency caps, and size/time budgets.

## Fragile Areas

**SQLite dependency relies on experimental Node API:**
- Files: `packages/edge/src/store.ts`, `packages/edge/src/node-sqlite.d.ts`, `packages/cli/src/index.ts`
- Why fragile: Uses `node:sqlite` plus custom type declarations, and suppresses experimental warnings at runtime.
- Safe modification: Treat persistence layer as an isolated adapter; add compatibility checks per Node version in CI.
- Test coverage: No compatibility matrix tests across Node versions.

**Policy matching uses broad wildcard/path substring logic:**
- Files: `packages/core/src/policy.ts`
- Why fragile: Wildcard regex conversion and substring path checks can overmatch or undermatch policy intent.
- Safe modification: Add explicit parser/matcher tests for edge cases before changing rule semantics.
- Test coverage: Existing tests are narrow (`packages/core/src/policy.test.ts`) and do not cover complex wildcard/path edge cases.

## Scaling Limits

**Edge summary API scales linearly with retained events:**
- Current capacity: `dashboardSummary(limit = 250)` bounds per-call data but recalculates clusters/insights every request.
- Limit: Dashboard refresh cost rises with higher limits and frequent polling.
- Scaling path: Precompute aggregates, cache summary snapshots, and add indexed/time-windowed queries.

## Dependencies at Risk

**`node:sqlite` runtime coupling:**
- Risk: Experimental/implementation-specific behavior can shift across Node releases.
- Impact: Startup/runtime failures in `@bastion/edge` and CLI scan/report flows.
- Migration plan: Abstract persistence behind a storage interface; prepare fallback adapter (for example `better-sqlite3` or async sqlite client).

## Missing Critical Features

**No edge authentication or multitenant access control:**
- Problem: Local governance data and proxy operations are exposed without caller identity checks.
- Blocks: Safe deployment beyond strictly local, trusted single-user environments.

**STDIO MCP upstreams are registered but not proxied:**
- Problem: Policy/config accepts stdio upstream registration but runtime returns 501 for non-HTTP transport.
- Blocks: End-to-end governance for MCP servers that only support stdio.

## Test Coverage Gaps

**Dashboard behavior is effectively untested (High priority):**
- What's not tested: Data fetching fallback behavior, rendering states, and report-link correctness.
- Files: `apps/dashboard/package.json`, `apps/dashboard/app/page.tsx`, `apps/dashboard/lib/api.ts`
- Risk: Regressions in primary operator UI go undetected.
- Priority: High

**CLI hook installation path lacks meaningful assertions (High priority):**
- What's not tested: JSON settings merge/upsert behavior, scope switching, idempotency, and malformed settings handling.
- Files: `packages/cli/src/index.ts`, `packages/cli/src/install-hooks.test.ts`
- Risk: Hook installation can silently misconfigure user/project settings.
- Priority: High

**MCP proxy happy-path/failure-path coverage is minimal (Medium priority):**
- What's not tested: HTTP upstream success/failure mapping, latency recording, stdio-not-supported path, and response content-type handling.
- Files: `packages/edge/src/server.ts`, `packages/edge/src/server.test.ts`
- Risk: Routing and observability regressions in core edge behavior.
- Priority: Medium

---

*Concerns audit: 2026-04-26*
