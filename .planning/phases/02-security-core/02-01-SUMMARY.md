---
phase: 02-security-core
plan: 01
subsystem: security
tags: [redaction, policy, zod, claude-hooks, sqlite]
requires: []
provides:
  - High-precision secret detection and redaction placeholders for required secret classes
  - Deterministic policy decisions for allow/deny/ask/redact across mixed threat inputs
  - Security finding contracts aligned with persisted evidence and recommendation fields
affects: [edge-hook-ingress, mcp-proxy, security-findings]
tech-stack:
  added: []
  patterns: [redacted-evidence-only, deterministic-policy-precedence]
key-files:
  created: []
  modified:
    - packages/core/src/schemas.ts
    - packages/core/src/redaction.ts
    - packages/core/src/redaction.test.ts
    - packages/core/src/policy.ts
    - packages/core/src/policy.test.ts
key-decisions:
  - "Use normalized [REDACTED:<type>] placeholders for all built-in secret classes."
  - "Keep deny precedence over ask/redact when multiple policy findings coexist."
patterns-established:
  - "Sanitized Snippet Flow: redact unknown payload material before producing evidenceSnippet values."
  - "Policy Precedence: dangerous-command deny overrides lower-severity ask/redact branches."
requirements-completed: [SEC-01, SEC-02, SEC-04, SEC-05, SEC-06]
duration: 18min
completed: 2026-04-26
---

# Phase 2 Plan 01: Security Core Summary

**Core security contracts now redact sensitive payloads and emit deterministic deny/ask/redact decisions for secret, command, and protected-path threats.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-04-26T16:10:00Z
- **Completed:** 2026-04-26T16:28:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Expanded built-in redaction coverage for AWS keys, GitHub tokens, private keys, API keys, connection strings, and env-style assignments.
- Hardened `evaluatePolicy` to merge secret, dangerous-command, and protected-path findings with stable severity and decision precedence.
- Added focused tests proving no raw-secret leakage in redacted snippets and mixed-condition policy behavior.

## Task Commits

1. **Task 1: Expand redaction and schema contracts for Security Core findings** - `worktree` (implemented, not yet committed in this session)
2. **Task 2: Enforce deny and ask policy branches for command and path threats** - `worktree` (implemented, not yet committed in this session)

## Files Created/Modified
- `packages/core/src/schemas.ts` - Maintains policy/finding contracts used by edge persistence and hook adapters.
- `packages/core/src/redaction.ts` - Implements normalized redaction rules and inspectable-string sanitation.
- `packages/core/src/redaction.test.ts` - Verifies required secret classes redact correctly.
- `packages/core/src/policy.ts` - Implements deterministic enforcement for secrets, dangerous commands, and protected paths.
- `packages/core/src/policy.test.ts` - Covers deny/ask/redact behavior and mixed-threat precedence.

## Decisions Made
- Prioritized trust-preserving precision in built-in secret rules instead of broad fuzzy matching.
- Kept raw payload capture opt-in and defaulted to sanitized evidence only.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Core policy and redaction contracts are stable for edge hook and MCP route integration.
- Plan 02-02 and 02-03 can consume decision outputs without schema translation.

## Self-Check: PASSED
- Verified required implementation files and tests exist.
- Verified `pnpm --filter @bastion/core typecheck` and `pnpm --filter @bastion/core test` pass.
