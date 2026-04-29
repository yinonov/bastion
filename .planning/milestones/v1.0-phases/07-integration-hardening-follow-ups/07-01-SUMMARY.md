---
phase: 07-integration-hardening-follow-ups
plan: 01
status: complete
completed_date: 2026-04-29
duration_minutes: 40
tasks_completed: 3
verification_status: passed
---

# Phase 7 Plan 1: Integration Hardening Follow-ups - Summary

Objective: remove integration sharp edges by aligning dashboard runtime URLs, SSR latency rendering, and MCP transport behavior with explicit v1 scope.

One-liner: Report download now follows configured edge URL, latency metrics are delivered in `/api/summary` for deterministic first render, and MCP transport support is explicit and test-covered.

## Execution

### Tasks Completed

| Task | Name | Status |
|------|------|--------|
| 1 | Unify dashboard edge/report URL resolution | ✓ |
| 2 | Make latency panel deterministic on initial render | ✓ |
| 3 | Make MCP transport scope explicit and verified | ✓ |

### Key Changes

apps/dashboard/lib/api.ts
- Added `getEdgeBaseUrl()` and `getReportUrl()` helpers so fetches and report links share one configuration source.
- Removed standalone latency fetch path; summary shape validation now includes latency payload.

apps/dashboard/components/live-dashboard.tsx
- Replaced hardcoded `http://127.0.0.1:4711/api/report` with `getReportUrl()`.
- Removed nullable client-only latency state and render latency cards from `summary.latency` (SSR data) for deterministic first paint.

apps/dashboard/lib/types.ts
- Extended `DashboardSummary` with `latency: { count, p95Ms, avgMs, maxMs }`.

packages/core/src/schemas.ts
- Extended `DashboardSummarySchema` to require the latency metrics object.

packages/edge/src/store.ts
- Added latency aggregation into `dashboardSummary()` via persisted hook samples.

packages/edge/src/server.ts
- Kept explicit stdio branch: stdio servers are governed but return JSON-RPC not-implemented in v1.

packages/edge/src/server.test.ts
- Added stdio transport behavior test for explicit 501 JSON-RPC response.
- Added `/api/summary` latency inclusion test.

packages/core/src/config.test.ts
- Added config validation test proving unsupported MCP transport values are rejected.

bastion.config.example.json
- Added explicit HTTP and stdio MCP server examples to document supported transport config forms in v1.

## Verification

✓ `pnpm --filter @bastion/core test`
✓ `pnpm --filter @bastion/edge test`
✓ `pnpm --filter @bastion/dashboard typecheck`

Results:
- Core tests: 11 passed, 0 failed
- Edge tests: 20 passed, 0 failed
- Dashboard typecheck: passed

## Requirement Impact

- DASH-01 integration gap closed for report download URL parity with configured edge base.
- Phase 7 success criteria met:
  1. Report download now uses configured edge base URL.
  2. MCP transport behavior is explicit and test-covered (http proxied, stdio not proxied, unsupported config transport rejected).
  3. Latency panel has deterministic initial render via summary payload.

## Files Modified

| File | Changes |
|------|---------|
| apps/dashboard/lib/api.ts | Added URL helpers and summary latency validation |
| apps/dashboard/components/live-dashboard.tsx | Removed hardcoded report URL and SSR latency loading ambiguity |
| apps/dashboard/lib/types.ts | Added summary latency type |
| packages/core/src/schemas.ts | Added summary latency schema |
| packages/edge/src/store.ts | Added summary latency aggregation |
| packages/edge/src/server.ts | Clarified stdio transport runtime behavior |
| packages/edge/src/server.test.ts | Added stdio + summary latency tests |
| packages/core/src/config.test.ts | Added unsupported transport validation test |
| bastion.config.example.json | Added explicit HTTP/stdio MCP examples |
