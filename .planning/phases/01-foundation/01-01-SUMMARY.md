---
phase: 01-foundation
plan: 01
subsystem: infra
tags: [node-sqlite, fastify, claude-hooks, latency, cli]
requires: []
provides:
  - CWD-first then ~/.config/bastion config discovery with defaults
  - Edge hook HTTP route hardening with malformed-payload safety
  - Hook latency telemetry endpoint with p95 measurement
  - Duplicate-instance startup rejection and SQLite WAL pragmas
  - Merge-safe, idempotent Claude hooks installer targeting edge URL
affects: [security-core, dashboard, dogfood]
tech-stack:
  added: []
  patterns: [config-fallback-order, edge-hook-forwarding, atomic-json-write]
key-files:
  created:
    - packages/core/src/config.ts
    - packages/core/src/config.test.ts
    - packages/edge/src/telemetry/latency.ts
    - packages/cli/src/install-hooks.ts
  modified:
    - packages/edge/src/server.ts
    - packages/edge/src/store.ts
    - packages/edge/src/server.test.ts
    - packages/cli/src/index.ts
    - packages/cli/src/install-hooks.test.ts
key-decisions:
  - "Keep hook command as bastion subcommand but embed explicit --edge-url for deterministic forwarding."
  - "Handle hook-forwarding outages with local non-fatal fallback so Claude hook flow does not crash."
patterns-established:
  - "Config Discovery Order: read project bastion.config.json first, then user ~/.config/bastion fallback."
  - "Hook Path Telemetry: record per-request latency and expose p95 via /api/latency."
requirements-completed: [INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06]
duration: 7min
completed: 2026-04-26
---

# Phase 1 Plan 01: Foundation Summary

**Node-native SQLite foundation with edge HTTP hook routing, measured sub-50ms p95 latency telemetry, and merge-safe Claude hooks installation.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-04-26T18:55:58+03:00
- **Completed:** 2026-04-26T16:02:28Z
- **Tasks:** 3
- **Files modified:** 9

## Accomplishments
- Implemented deterministic config lookup order (`cwd` then `~/.config/bastion`) with defaults and tests.
- Hardened edge hook runtime with malformed payload handling, duplicate-instance guard, WAL SQLite pragmas, and latency telemetry.
- Reworked CLI hook installation into merge-safe atomic writes with idempotent behavior and explicit edge endpoint targeting.

## Task Commits

1. **Task 1: Replace native SQLite dependency path and finalize config discovery contracts** - `3a1b710` (feat)
2. **Task 2: Wire hook transport over edge HTTP with latency instrumentation and resilience** - `215b98e` (feat)
3. **Task 3: Harden CLI hook installer to produce valid merged Claude hooks config** - `8b9adc6` (feat)

## Files Created/Modified
- `packages/core/src/config.ts` - Added config discovery order and user-level fallback loader.
- `packages/core/src/config.test.ts` - Added discovery precedence/fallback tests.
- `packages/edge/src/server.ts` - Added `/api/latency`, malformed hook payload guard, and duplicate-instance startup error handling.
- `packages/edge/src/store.ts` - Enabled WAL/NORMAL/busy-timeout pragmas.
- `packages/edge/src/telemetry/latency.ts` - Added p95 latency tracker.
- `packages/edge/src/server.test.ts` - Added latency, malformed payload, duplicate instance, and WAL tests.
- `packages/cli/src/install-hooks.ts` - Added atomic merge-safe hooks installer.
- `packages/cli/src/index.ts` - Switched hook execution to edge HTTP forwarding and integrated new installer.
- `packages/cli/src/install-hooks.test.ts` - Added merge-preservation/idempotency tests.

## Decisions Made
- Planned file paths did not exist in the repository layout; execution mapped plan intent to the consolidated module layout in `packages/core/src/config.ts`, `packages/edge/src/server.ts`, `packages/edge/src/store.ts`, and `packages/cli/src/index.ts`.
- Hook installer now embeds explicit `--edge-url` so installed hook commands deterministically route to edge HTTP endpoint.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Planned paths were absent in repo structure**
- **Found during:** Task 1
- **Issue:** Plan referenced `packages/core/src/storage/local-sqlite-store.ts` and `packages/cli/src/commands/*` which do not exist in this repository.
- **Fix:** Implemented equivalent behavior in existing consolidated files and added focused tests in those modules.
- **Files modified:** `packages/core/src/config.ts`, `packages/edge/src/server.ts`, `packages/edge/src/store.ts`, `packages/cli/src/index.ts`, related tests
- **Verification:** package-level tests/typechecks passed across core/edge/cli
- **Committed in:** `3a1b710`, `215b98e`, `8b9adc6`

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** No scope creep; implementation matched plan intent and requirement coverage using actual repository structure.

## Issues Encountered
- CLI runtime command does not support a `--cwd` flag; command-level verification was completed by executing built CLI from a temporary project directory instead.

## Known Stubs
None.

## Threat Flags

| Flag | File | Description |
|------|------|-------------|
| threat_flag: new_endpoint | `packages/edge/src/server.ts` | Added `/api/latency` endpoint exposing performance telemetry; currently local-only but expands API surface. |

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Foundation requirements INFRA-01 through INFRA-06 are implemented and verified.
- Phase 2 security policy expansion can proceed on top of stable hook routing and measured latency.

## Self-Check: PASSED
- Verified summary and key implementation files exist.
- Verified task commits `3a1b710`, `215b98e`, and `8b9adc6` exist in git history.
