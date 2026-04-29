---
phase: 02-security-core
plan: 02
subsystem: edge
tags: [claude-hooks, sqlite, fastify, policy-enforcement]
requires:
  - phase: 02-01
    provides: Core policy decisions and redacted finding contracts
provides:
  - Claude hook response envelopes for allow/deny/ask/redact decisions
  - Hook ingress persistence of canonical sanitized findings into SQLite
  - End-to-end hook tests for envelope correctness and persistence guarantees
affects: [mcp-proxy, dashboard-api, audit-trail]
tech-stack:
  added: []
  patterns: [centralized-hook-response-adapter, sqlite-finding-persistence]
key-files:
  created: []
  modified:
    - packages/core/src/hooks.ts
    - packages/edge/src/store.ts
    - packages/edge/src/server.ts
    - packages/edge/src/server.test.ts
key-decisions:
  - "Keep `toClaudeHookResponse` in core as the single source of hook envelope formatting."
  - "Persist findings through `LocalSqliteStore` only, with redacted evidence by default."
patterns-established:
  - "Hook Adapter Boundary: edge route delegates response shaping to core adapter helpers."
  - "Audit Persistence: save normalized event and findings on each hook evaluation pass."
requirements-completed: [SEC-05, SEC-06, SEC-07]
duration: 22min
completed: 2026-04-26
---

# Phase 2 Plan 02: Security Core Summary

**Claude hook ingress now returns decision-correct response envelopes and persists sanitized security findings with stable schema fields in SQLite.**

## Performance

- **Duration:** 22 min
- **Started:** 2026-04-26T16:28:00Z
- **Completed:** 2026-04-26T16:50:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented complete hook decision mapping for PreToolUse/UserPromptSubmit/PostToolUse paths, including ask, deny, redact, and allow behavior.
- Persisted hook-derived findings with UUID/timestamp/event linkage and sanitized evidence snippets.
- Added edge integration tests proving correct envelopes and no raw-secret leakage in persisted findings.

## Task Commits

1. **Task 1: Finalize hook response envelopes for all policy decisions** - `worktree` (implemented, not yet committed in this session)
2. **Task 2: Persist canonical sanitized findings for hook events** - `worktree` (implemented, not yet committed in this session)

## Files Created/Modified
- `packages/core/src/hooks.ts` - Maps policy decisions into Claude-compatible response envelopes.
- `packages/edge/src/store.ts` - Persists normalized events and findings to SQLite.
- `packages/edge/src/server.ts` - Wires hook normalization, policy evaluation, persistence, and adapter response output.
- `packages/edge/src/server.test.ts` - Validates envelope shape and persistence semantics end-to-end.

## Decisions Made
- Retained strict separation between policy evaluation and hook envelope formatting to prevent response-shape drift.
- Kept raw payload capture disabled by default and validated storage behavior via tests.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP enforcement can reuse the same policy and persistence boundary.
- Hook path now produces durable audit artifacts required for downstream reporting.

## Self-Check: PASSED
- Verified required implementation files and tests exist.
- Verified `pnpm --filter @bastion/edge typecheck` and `pnpm --filter @bastion/edge test` pass.
