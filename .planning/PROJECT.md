# Bastion

## What This Is

Bastion is a local-first MCP Edge Gateway and security control plane for engineering teams using Claude Code and MCP-enabled agents. It sits as a transparent proxy between developer tooling and upstream LLMs, enforcing security policies (secret detection, dangerous command blocking, MCP server allowlisting), capturing agent events to a local SQLite buffer, and surfacing developer friction and spend intelligence in a polished dashboard. The target buyer is a platform engineer or engineering manager who wants real-time governance over what AI agents do on their team's machines — without routing data to a third-party cloud.

## Core Value

A developer who installs Bastion should know, within five minutes, that a secret was blocked, a dangerous tool was stopped, or an agent is burning their budget — all without leaving their machine.

## Requirements

### Validated

- ✓ Zod schemas for all core entities (AgentEvent, SecurityFinding, FrictionCluster, PolicyDecision, DeveloperInsight) — existing
- ✓ Policy evaluation engine (secret detection, dangerous commands, protected paths, tool allowlist) — existing
- ✓ Redaction engine with configurable regex rules — existing
- ✓ Claude Code hook normalization and response formatting — existing
- ✓ Fastify edge server with `/api/hooks/claude` and `/mcp/:serverName` proxy endpoints — existing
- ✓ SQLite local store with dashboard summary, events, findings queries — existing
- ✓ Next.js dashboard with dark theme, risk score, live agent stream, findings, insights panels — existing
- ✓ CLI with `install-hooks` command — existing
- ✓ `@bastion/insights`: FrictionCluster builder, shadow spend estimator — existing
- ✓ `bastion.config.json` schema with policies, capture, mcp, redaction, exporter config — existing

### Active

- [ ] Policy engine covers all Claude Code hook event types end-to-end (SessionStart, SessionEnd, PostToolUseFailure)
- [ ] MCP proxy works for HTTP-transport servers (current stub returns error for stdio)
- [ ] `bastion install-hooks` reliably writes claude hooks config and starts the edge server
- [ ] Dashboard reflects real data from the running edge server (not mock)
- [ ] Self-dogfood: Bastion catches at least one real secret or dangerous command during daily Claude Code use
- [ ] DeveloperInsight generation pipeline (from raw events → CMI analysis → insight objects) is wired end-to-end
- [ ] Test coverage for policy evaluation edge cases (secret + tool deny, protected path + ask, etc.)

### Out of Scope

- Cloud sync / centralized control plane — v1 is local-only; enterprise tier is a future milestone
- Multi-user / team aggregation — one machine, one developer for now
- Stdio MCP transport proxying — HTTP-only in v1; stdio requires subprocess management complexity
- UI for editing policies — config file only in v1 to stay focused
- Paid tier / billing — no monetization until dogfood validation

## Context

**Origin:** Idea emerged from a brainstormed list of 10 AI infrastructure products for a solo Israeli founder. The winning thesis: enterprises have "MCP sprawl" — developers spin up MCP servers faster than anyone can govern them, and Claude Code tool use is completely unaudited. The interface quality is the moat; most infra tools look like terminals.

**Ecosystem signals (April 2026):**
- MCP went from zero to 97M+ monthly downloads, 10K+ public servers, and Linux Foundation governance in 18 months
- CVE-2025-6514 (mcp-remote, 437K devs) proved the threat is real
- ServiceNow acquired Traceloop (OpenLLMetry) for ~$60–80M; OpenAI acquired Promptfoo (March 2026)
- Strategic acquirers: Cloudflare, Datadog, Okta, Palo Alto, ServiceNow
- EU AI Act enforcement begins August 2026

**Current architecture:**
- Monorepo (pnpm workspaces): `packages/core`, `packages/edge`, `packages/cli`, `packages/insights`, `apps/dashboard`
- TypeScript throughout (ESM, Node 22)
- Edge buffer: `better-sqlite3` via `LocalSqliteStore`
- Hook integration: Claude Code's `--hooks` mechanism (pre/post tool use, prompt submit)
- Dashboard: Next.js App Router + Tailwind (custom dark design tokens: `ink`, `panel`, `line`, `cyan`, `red`, `amber`)

**Founder context:** Solo technical founder, Senior Staff background, strong frontend/UX instincts. Wants to dogfood the product daily in their own Claude Code workflow before any external launch. Validate through self-use first.

## Constraints

- **Solo:** No collaborators — every feature must be completable by one person without coordination overhead
- **Local-first:** No cloud dependencies in v1; must work fully offline (SQLite, no telemetry out)
- **Claude Code compatibility:** Must not break normal Claude Code usage — <50ms hook latency target, transparent proxy behavior
- **TypeScript-only:** All packages in TS/ESM; no Python; no new languages
- **No UI config editors in v1:** Config is JSON file only; reduces UI surface area to focus on data display

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript over Python for proxy | I/O-bound gateway; shares Zod schemas with Next.js frontend; strong MCP SDK support | All packages in TS |
| Fastify over Express | Lower overhead for high-frequency hook calls; strong typing via TypeScript plugins | `@bastion/edge` uses Fastify |
| SQLite as edge buffer | Zero setup, runs locally, fast reads for dashboard, no infra to manage for v1 | `better-sqlite3` in `LocalSqliteStore` |
| `ITelemetryExporter` abstraction | SQLite is an edge buffer only; future enterprise tier will swap in OTel/ClickHouse exporter | Interface defined in core |
| Claude Code hooks as primary integration | Hooks give pre/post tool use visibility; lower friction than IDE extension; CLI `install-hooks` is the onboarding path | `normalizeClaudeHook` in core |
| Dogfood before launch | Validate real-world usefulness on own machine before any GTM activity | v1 goal: self-use in daily workflow |

---
*Last updated: April 2026 after initialization*
