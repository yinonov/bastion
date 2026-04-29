# Phase 3 Context - Intelligence & Dashboard

## Goal
Developer opens the dashboard and sees real, current data - security findings, live event stream, risk score, shadow spend, and friction insights - all drawn from the running edge server's SQLite store, with no mocks or hardcoded values remaining.

## Decisions
- D-01: Keep Phase 3 strictly scoped to intelligence and dashboard outcomes only: INS-01, INS-02, INS-03, INS-04, DASH-01, DASH-02, DASH-03, DASH-04, and DASH-05. Do not include Phase 4 dogfood/uptime work in this phase.
- D-02: Dashboard metrics and panels must come from live edge APIs backed by the running SQLite store. Remove mock/fallback behavior that can silently present fabricated zero-state totals as if they were live data.
- D-03: The dashboard must consume real data from `/api/summary`, `/api/events`, and `/api/findings` and render live event/finding updates on a 2-second cadence.
- D-04: Friction clusters and developer insights must be generated from persisted events/findings and stored back into SQLite so dashboard views are derived from durable data, not UI placeholders.
- D-05: Shadow spend must be estimated from captured `UserPromptSubmit` token counts (Anthropic pricing reference), not from redacted snippet length heuristics.
- D-06: Insights processing must run asynchronously and must not block the hook hot path established in Phase 1/2.
- D-07: Reuse existing module boundaries (`packages/core`, `packages/edge`, `packages/insights`, `apps/dashboard`) and existing schema/report contracts; avoid introducing new external services or off-machine dependencies.

## Deferred Ideas
- Defer websockets/SSE transport for live dashboards; Phase 3 uses polling with deterministic cadence.
- Defer dashboard policy/config editing UX; config-file driven workflow remains unchanged.
- Defer team-level aggregation and cloud synchronization; Phase 3 remains local-first on a single machine.

## Claude's Discretion
- Choose the exact SQLite table layout for persisted friction clusters/developer insights as long as it remains queryable and deterministic for dashboard rendering.
- Choose the exact async trigger strategy (`queueMicrotask`, `setImmediate`, or equivalent non-blocking scheduling) so hook response correctness and latency discipline are preserved.
- Choose robust token-count extraction fallbacks from Claude hook payload metadata while keeping pricing constants centralized and testable.

## Success Criteria Baseline
1. Dashboard risk score, blocked actions count, and secrets count match direct SQLite queries against the live store.
2. Live event stream refreshes within 2 seconds and shows correct event type, tool name, and status.
3. Shadow spend USD reflects estimator output from captured `UserPromptSubmit` token counts within accepted tolerance.
4. Friction clusters and developer insights panels render real computed data from persisted events/findings with no placeholder-only content.

## Prior Decisions Carried Forward
- Keep local-first persistence using `node:sqlite` and existing config discovery behavior.
- Preserve the Phase 1/2 hot-path discipline: policy/hook responses remain fast and resilient; heavy analysis runs off-path.
- Preserve core hook response schema and edge API contract shape unless explicitly extended in backward-compatible form.
