# Phase 4 Context - Dogfood & Stabilize

## Goal
Developer has used Bastion as their daily Claude Code companion for at least 7 days, Bastion has caught at least one real secret or dangerous command in the wild, and hook latency is measured (not assumed) to be ≤50ms in sustained use.

## Decisions

- **D-01:** Phase 4 is validation-focused, not feature-adding. All threat-detection, hook integration, and dashboard rendering already exists from Phases 1-3. Phase 4 proves these work under real usage.

- **D-02:** Latency metrics are already tracked via `HookLatencyTracker` and exposed at `/api/latency`. Dashboard must show p95/avg/max latency on the main risk summary or metrics panel to make the "measured" criterion observable.

- **D-03:** Seeded threat test vectors are needed to prove threat detection works before relying on organic "wild" catches. Use synthetic but realistic payloads (fake AWS keys matching the pattern, fake `rm -rf` commands) injected via a test harness to validate each policy rule fires correctly.

- **D-04:** Uptime validation requires tracking edge server lifecycle (restarts, crashes) across the 7-day dogfood window. Add a simple uptime log with timestamps in the edge store or CLI output to make the criterion verifiable.

- **D-05:** Dogfood guide is a text document (not code) listing daily use patterns, test scenarios, and success metrics. Kept in `.planning/` for founder reference during the 7-day window, not deployed to package.json or distributed yet.

- **D-06:** Phase 4 maintains strict latency discipline: no additions to the hook hot path (`/api/hooks/claude`), no blocking writes, no new policy checks during hook ingestion. All validation and monitoring runs off-path.

## Deferred Ideas

- Defer cloud or team-level aggregation; stay single-machine local-first.
- Defer UI for configuring threat detection rules; validated rules stay in bastion.config.json.
- Defer Slack/email alerting on caught threats; stay terminal/dashboard only.
- Defer analytics dashboards beyond risk score and latency metrics; stay focused on success criteria.

## Claude's Discretion

- Choose the exact format and location of the uptime log (SQLite table, file, or combined into edge logs) as long as it is durable and queryable.
- Choose realistic test vector payloads (e.g., fake AWS key format, fake `rm -rf` patterns) that match real-world patterns without creating actual secrets.
- Choose whether to add uptime tracking to the CLI `run` command or to the edge server bootstrap; prioritize clarity for the founder.
- Choose dashboard layout for latency metrics (inline with risk score, separate latency card, or system metrics section) to maintain visual hierarchy.

## Success Criteria Baseline

1. **Real threat caught:** At least one security finding (secret, dangerous command, or protected path access) appears in SQLite from real Claude Code use within the 7-day window.
2. **Latency measured:** Dashboard displays hook p95/avg latency; verified from a 100+ event sample to show p95 ≤ 50ms.
3. **Uptime validated:** Edge server runs continuously for ≥7 days with a logged record of any restarts or crashes (ideally zero restarts).

## Prior Decisions Carried Forward

- Keep local-first persistence; no cloud telemetry.
- Preserve hook response latency discipline from Phase 1; no blocking writes on the hot path.
- Preserve security policy evaluation; no policy rule changes before dogfood.
- Reuse existing module boundaries (`packages/core`, `packages/edge`, `packages/insights`, `apps/dashboard`).
- Maintain config-file driven approach; no runtime policy editing.

## Context from Phase 3

Phase 3 completed:
- Friction cluster persistence in SQLite
- Developer insight generation and storage
- Live dashboard data binding to `/api/summary`, `/api/events`, `/api/findings`
- Token-count based shadow spend estimation

Phase 4 builds on this by:
- Exposing latency metrics already captured by `HookLatencyTracker`
- Adding uptime tracking to the edge lifecycle
- Creating seeded test vectors to validate threat detection before organic usage
- Providing dogfood documentation for the founder to follow during 7-day validation
