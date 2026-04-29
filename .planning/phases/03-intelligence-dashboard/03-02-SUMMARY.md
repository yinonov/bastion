---
phase: 03-intelligence-dashboard
plan: 02
subsystem: api
tags: [hooks, insights, spend, async]
requires:
  - phase: 03-01
    provides: persisted intelligence tables and dashboard summary reads
provides:
  - Token-count based shadow spend estimation
  - Async post-ingest intelligence recomputation
  - Summary metric parity tests against SQLite-backed store data
affects: [03-03, dashboard, telemetry]
tech-stack:
  added: []
  patterns: [guarded async refresh scheduler, numeric token coercion from hook payloads]
key-files:
  created: []
  modified: [packages/core/src/hooks.ts, packages/insights/src/index.ts, packages/insights/src/insights.test.ts, packages/edge/src/server.ts, packages/edge/src/server.test.ts]
key-decisions:
  - "Spend estimator reads prompt token metadata first and falls back to prompt length if absent."
  - "Insights refresh runs in guarded setImmediate scheduling to avoid blocking ingest responses."
patterns-established:
  - "Ingest routes trigger non-blocking intelligence refresh without changing response contracts."
  - "Summary totals are integration-tested against direct store-backed calculations."
requirements-completed: [INS-02, INS-04, DASH-02]
duration: 48min
completed: 2026-04-26
---

# Phase 3 Plan 02: Token Spend And Async Refresh Summary

**Prompt token metadata now drives shadow spend while edge ingest routes recompute intelligence asynchronously and preserve hot-path response behavior.**

## Performance

- **Duration:** 48 min
- **Started:** 2026-04-26T17:50:00Z
- **Completed:** 2026-04-26T18:38:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Added token-count normalization in Claude hook metadata extraction with strict numeric coercion.
- Switched shadow spend estimation to token-based pricing constants and covered fallback semantics.
- Scheduled store intelligence refresh asynchronously after ingest and validated metric parity in edge tests.

## Task Commits

1. **Task 1: Normalize prompt token metadata and switch spend estimator to token-count inputs** - `93bc1cd` (feat)
2. **Task 2: Run insights refresh asynchronously after ingest without blocking hook replies** - `4dba45b` (feat)

**Plan metadata:** pending final docs commit

## Files Created/Modified
- `packages/core/src/hooks.ts` - Captures prompt token candidates into normalized event metadata.
- `packages/insights/src/index.ts` - Uses token-based spend estimator constants and explicit fallback.
- `packages/insights/src/insights.test.ts` - Verifies token-count spend and prompt-length fallback behavior.
- `packages/edge/src/server.ts` - Adds guarded async intelligence refresh scheduling post-ingest.
- `packages/edge/src/server.test.ts` - Adds integration check for ingest latency and summary parity.

## Decisions Made
- Accepted prompt length as explicit backward-compatible fallback when historical events lack token metadata.
- Kept async refresh failures isolated from ingest response semantics to protect hook-path reliability.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Dashboard can now consume token-accurate spend and asynchronously refreshed metrics.
- Ready for final UI live data wiring and no-mock fallback removal in Plan 03-03.

## Known Stubs
None.

## Self-Check: PASSED
- Verified summary file exists.
- Verified commits `93bc1cd` and `4dba45b` exist in git log.

---
*Phase: 03-intelligence-dashboard*
*Completed: 2026-04-26*
