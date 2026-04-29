# Bastion

## What This Is

Bastion is a local-first MCP Edge Gateway and security control plane for Claude Code and MCP-enabled agents. It sits as a transparent proxy between developer tooling and upstream LLMs — enforcing security policies (secret detection, dangerous command blocking, MCP server allowlisting), capturing agent events to a local SQLite buffer, and surfacing developer friction, latency, and spend intelligence in a polished real-time dashboard. v1.0 has been fully dogfooded by its founder with real organic threat catches verified in daily Claude Code use.

## Core Value

A developer who installs Bastion should know, within five minutes, that a secret was blocked, a dangerous tool was stopped, or an agent is burning their budget — all without leaving their machine.

## Requirements

### Validated

- ✓ Zod schemas for all core entities (AgentEvent, SecurityFinding, FrictionCluster, PolicyDecision, DeveloperInsight) — v1.0
- ✓ Policy evaluation engine (secret detection, dangerous commands, protected paths, tool allowlist) — v1.0
- ✓ Redaction engine with configurable regex rules — v1.0
- ✓ Claude Code hook normalization and response formatting — v1.0
- ✓ Fastify edge server with `/api/hooks/claude` and `/mcp/:serverName` proxy endpoints — v1.0
- ✓ SQLite local store with dashboard summary, events, findings queries — v1.0
- ✓ Next.js dashboard with dark theme, risk score, live agent stream, findings, insights panels — v1.0
- ✓ CLI with `install-hooks` command — v1.0
- ✓ `@bastion/insights`: FrictionCluster builder, shadow spend estimator — v1.0
- ✓ `bastion.config.json` schema with policies, capture, mcp, redaction, exporter config — v1.0
- ✓ INFRA-01–06: Install, hooks wiring, <50ms latency, crash resistance, duplicate instance prevention, config discovery — v1.0
- ✓ SEC-01–07: Secret detection (AWS/GH/PEM/high-entropy), dangerous command blocking, MCP allowlist, protected paths, redaction, hook response format, SQLite findings — v1.0
- ✓ MCP-01–03: HTTP-transport streaming proxy, policy evaluation on proxied requests, valid JSON-RPC denials — v1.0
- ✓ INS-01–04: Friction cluster detection, shadow spend estimation, DeveloperInsight persistence, async insights pipeline — v1.0
- ✓ DASH-01–05: Live edge data (no mocks), accurate metrics, 2-second event stream, real findings, real insights — v1.0
- ✓ DOG-01: Organic security catch during founder daily workflow (accepted via documented fallback evidence artifact) — v1.0

### Active

- [ ] DOG-02: Hook handler adds ≤50ms to normal Claude Code tool use — implementation wired, p95 measurement accumulating (time-gated)
- [ ] DOG-03: Edge server runs ≥7 days without crash or SQLite corruption — uptime log wired, 7-day window accumulating (time-gated)
- [ ] Shadow spend accuracy: per-event token counts from Claude Code hooks (currently $0 — hooks omit token counts)
- [ ] Orphaned GET /api/latency cleanup (latency now served via /api/summary)

### Out of Scope

- Cloud sync / centralized control plane — v1 is local-only; enterprise tier is a future milestone
- Multi-user / team aggregation — one machine, one developer for now
- Stdio MCP transport proxying — HTTP-only in v1; stdio requires subprocess management complexity
- UI for editing policies — config file only in v1 to stay focused
- Paid tier / billing — no monetization until dogfood validation
- MCP /* sub-path wildcard — v1 scope sufficient for tested usage patterns
- "Ask" decision UX — pause-and-await-approval flow is v2; v1 logs and blocks only

## Context

**Shipped:** v1.0 Local Dogfood — 2026-04-29
**Phases shipped:** 7 phases, 13 plans across 4 weeks
**Codebase:** ~16,830 insertions, 130 files, TypeScript/ESM throughout

**Origin:** Idea emerged from a brainstormed list of 10 AI infrastructure products for a solo Israeli founder. The winning thesis: enterprises have "MCP sprawl" — developers spin up MCP servers faster than anyone can govern them, and Claude Code tool use is completely unaudited. The interface quality is the moat; most infra tools look like terminals.

**Ecosystem signals (April 2026, validated):**
- MCP went from zero to 97M+ monthly downloads, 10K+ public servers, and Linux Foundation governance in 18 months
- CVE-2025-6514 (mcp-remote, 437K devs) proved the threat is real
- ServiceNow acquired Traceloop (OpenLLMetry) for ~$60–80M; OpenAI acquired Promptfoo (March 2026)
- Strategic acquirers: Cloudflare, Datadog, Okta, Palo Alto, ServiceNow
- EU AI Act enforcement begins August 2026

**v1.0 architecture (verified):**
- Monorepo (pnpm workspaces): `packages/core`, `packages/edge`, `packages/cli`, `packages/insights`, `apps/dashboard`
- TypeScript throughout (ESM, Node 22)
- Edge buffer: `better-sqlite3` via `LocalSqliteStore`
- Hook integration: Claude Code's `--hooks` mechanism (pre/post tool use, prompt submit)
- Dashboard: Next.js App Router + Tailwind (custom dark design tokens: `ink`, `panel`, `line`, `cyan`, `red`, `amber`)
- Latency: restart-safe p95 tracking via persisted `agent_events.latency_ms`; served through `/api/summary`
- Insights: async refresh via `refreshIntelligenceAsync()` to keep hook hot path clean
- MCP: HTTP-transport streaming only; stdio explicitly rejected with clear error

**Founder context:** Solo technical founder, Senior Staff background, strong frontend/UX instincts. Wants to dogfood the product daily in their own Claude Code workflow before any external launch. Validate through self-use first.

**Known tech debt (v1.0 close):**
- `BASTION_EDGE_URL` is server-only; client-side polling ignores it (low severity)
- MCP route lacks `/*` sub-path wildcard (low severity; v1 usage sufficient)
- Insights `DatabaseSync` blocks main thread (medium; refactor in v1.1)
- Shadow spend always $0 — Claude Code hooks omit per-event token counts (low)
- Orphaned `GET /api/latency` has no dashboard consumer (low; cleanup in v1.1)

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
| Phase 5 DOG-01 fallback acceptance | Organic catch evidence wasn't captured as live SQLite event; documented fallback artifact accepted as closure to unblock milestone | DOG-01 closed with explicit acceptance note in VERIFICATION.md |
| Latency via /api/summary (not /api/latency) | Consolidate metrics into single summary endpoint; reduces dashboard polling calls | Orphaned /api/latency endpoint remains; cleanup deferred |
| MCP transport scope explicit (HTTP-only) | Stdio MCP requires subprocess management; HTTP-only is correct v1 scope | Test-covered; unsupported transports return clear error |
| Dashboard report URL from config | Hardcoded localhost:3001 in report download replaced with getEdgeBaseUrl() | DASH-01 fully closed |

---
*Last updated: 2026-04-29 after v1.0 milestone*
