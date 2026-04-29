---
phase: 02-security-core
plan: 03
subsystem: mcp
tags: [mcp, json-rpc, fastify-reply-from, streaming, allowlist]
requires:
  - phase: 02-01
    provides: Policy evaluation and security findings contract
  - phase: 02-02
    provides: SQLite persistence and edge ingress enforcement patterns
provides:
  - MCP allowlist enforcement with JSON-RPC -32003 for unapproved servers
  - Policy-denial JSON-RPC -32004 responses for approved servers blocked by policy
  - Streaming HTTP proxy forwarding through @fastify/reply-from with preserved upstream response behavior
affects: [security-core-completion, phase-3-dashboard-data]
tech-stack:
  added: [@fastify/reply-from]
  patterns: [pre-proxy-policy-gate, streamed-upstream-forwarding]
key-files:
  created: []
  modified:
    - packages/edge/package.json
    - pnpm-lock.yaml
    - packages/edge/src/server.ts
    - packages/edge/src/server.test.ts
key-decisions:
  - "Use `reply.from(...)` to preserve upstream status/body stream semantics for approved HTTP MCP servers."
  - "Return JSON-RPC -32003/-32004 for governance denials before any upstream forwarding."
patterns-established:
  - "Allowlist First: reject unapproved server names before policy evaluation for upstream access."
  - "Streaming Proxy Path: route approved HTTP traffic through reply-from, not buffered fetch text handling."
requirements-completed: [SEC-03, MCP-01, MCP-02, MCP-03]
duration: 20min
completed: 2026-04-26
---

# Phase 2 Plan 03: Security Core Summary

**MCP ingress is now guarded by allowlist and policy denial gates, with valid JSON-RPC errors and streaming proxy behavior for approved HTTP upstreams.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-04-26T16:50:00Z
- **Completed:** 2026-04-26T17:10:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Enforced MCP allowlist denials with JSON-RPC `-32003` and persisted high-severity `mcp_server_not_approved` findings.
- Enforced policy-denied approved-server requests with JSON-RPC `-32004` and persisted policy findings.
- Replaced buffered forwarding with `@fastify/reply-from` streaming while preserving upstream status/failure semantics.

## Task Commits

1. **Task 1: Replace buffered MCP forwarding with streaming reply-from proxying** - `worktree` (implemented, not yet committed in this session)
2. **Task 2: Enforce MCP allowlist and denial envelopes with persisted findings** - `worktree` (implemented, not yet committed in this session)

## Files Created/Modified
- `packages/edge/package.json` - Adds streaming proxy dependency support.
- `pnpm-lock.yaml` - Captures lockfile updates for MCP proxy dependency changes.
- `packages/edge/src/server.ts` - Implements allowlist, policy gating, JSON-RPC errors, and streaming proxy forwarding.
- `packages/edge/src/server.test.ts` - Verifies unapproved denial, policy denial, upstream failure handling, and streaming-forward path.

## Decisions Made
- Kept stdio MCP explicitly unsupported in v1 and surfaced a controlled JSON-RPC error path.
- Preserved upstream response semantics by returning proxy-streamed replies rather than re-wrapping successful upstream payloads.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Preserve upstream MCP proxy status and failure behavior in streaming path**
- **Found during:** Task 1
- **Issue:** A direct helper call did not preserve full upstream response semantics in all paths.
- **Fix:** Route now returns `reply.from(...)` and keeps `onResponse`/`onError` behavior intact.
- **Files modified:** `packages/edge/src/server.ts`
- **Verification:** `pnpm --filter @bastion/edge test` passes all MCP denial/proxy/failure tests.
- **Committed in:** worktree

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Deviation tightened correctness and preserved intended proxy semantics without scope expansion.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Security Core phase now has complete hook and MCP enforcement coverage with persisted findings.
- Phase 3 can focus on consuming real persisted events/findings for dashboard and insights.

## Self-Check: PASSED
- Verified required implementation files and tests exist.
- Verified `pnpm --filter @bastion/edge typecheck` and `pnpm --filter @bastion/edge test` pass.
