# Bastion — v1 Requirements

**Version:** 1.0  
**Date:** April 2026  
**Status:** Active

---

## v1 Requirements

### Infrastructure & Installation

- [ ] **INFRA-01**: Developer can install Bastion globally (`npm install -g @bastion/cli`) with zero native compilation (no `better-sqlite3`)
- [ ] **INFRA-02**: `bastion install-hooks` writes a valid Claude Code hooks config pointing to the running edge server
- [ ] **INFRA-03**: Edge server starts reliably and does not crash on malformed hook payloads
- [ ] **INFRA-04**: Hook handler responds in <50ms (SQLite write is async, never on the hot path)
- [ ] **INFRA-05**: Edge server prevents duplicate instances (PID file or port-in-use check with clear error message)
- [ ] **INFRA-06**: `bastion.config.json` is discovered from CWD or `~/.config/bastion/` with sensible defaults on first run

### Security / Policy Engine

- [ ] **SEC-01**: Secret detection scans `PreToolUse` event arguments for: AWS keys, GitHub tokens, private key PEM headers, generic high-entropy API keys (≥32 chars, entropy >3.5), connection strings, `.env` file content patterns
- [ ] **SEC-02**: Dangerous command blocking intercepts `Bash`/`execute` tool calls matching: `rm -rf`, `git push --force/--force-with-lease`, `git reset --hard`, `dd if=`, `mkfs`, `chmod 777 /`, `DROP DATABASE`, credential file overwrites
- [ ] **SEC-03**: MCP server allowlist — requests to unapproved MCP servers are denied with a clear JSON-RPC error; approved servers are listed in `bastion.config.json`
- [ ] **SEC-04**: Protected path detection — tool calls touching `.env`, `~/.ssh/`, `~/.aws/credentials`, `.git/config` trigger an `ask` decision (logged as high severity)
- [ ] **SEC-05**: Redaction engine writes sanitized snippets to SQLite (credential replaced by `[REDACTED:<type>]`); raw payload never stored unless explicitly enabled in config
- [ ] **SEC-06**: Policy decisions (`allow`, `deny`, `ask`, `redact`) are returned to Claude Code in the correct hook response format
- [ ] **SEC-07**: All security findings are persisted to SQLite with UUID, timestamp, eventId, type, severity, title, description, evidenceSnippet, recommendation

### MCP Proxy

- [ ] **MCP-01**: HTTP-transport MCP server requests are streamed (not buffered) through the proxy using `@fastify/reply-from`
- [ ] **MCP-02**: Policy evaluation runs on proxied MCP requests before forwarding (secret scan + MCP allowlist check)
- [ ] **MCP-03**: Denied MCP requests return a valid JSON-RPC error response (`-32003` or `-32004`) without crashing the client

### CMI / Insights

- [ ] **INS-01**: Friction cluster detection runs after each event batch — identifies repeated errors, denied actions, tool failures, and prompt loops
- [ ] **INS-02**: Shadow spend estimator calculates approximate USD cost from captured prompt token counts (using standard Anthropic pricing as reference)
- [ ] **INS-03**: `DeveloperInsight` objects are generated from friction clusters and persisted to SQLite (category, severity, summary, context snippet)
- [ ] **INS-04**: Insights pipeline runs asynchronously and never blocks the hook handler hot path

### Dashboard

- [ ] **DASH-01**: Dashboard reads live data from the running edge server (`/api/summary`, `/api/events`, `/api/findings`) — no mock/hardcoded data
- [ ] **DASH-02**: Risk score, blocked actions count, secrets count, and shadow spend USD are accurate and reflect current SQLite state
- [ ] **DASH-03**: Live agent event stream shows the last 8 events with correct status, severity, event type, and tool name
- [ ] **DASH-04**: Security findings panel shows real findings from SQLite with correct type, severity, and description
- [ ] **DASH-05**: Friction clusters and developer insights panels show real data from the insights engine

### Dogfood Gate (Definition of Done)

- [ ] **DOG-01**: Bastion catches at least one real secret or dangerous command during the founder's daily Claude Code workflow
- [ ] **DOG-02**: Hook handler adds ≤50ms to normal Claude Code tool use (measured, not estimated)
- [ ] **DOG-03**: Edge server runs for ≥7 days without crash or data corruption

---

## v2 Requirements (Deferred)

- Multi-user aggregation / team dashboard — requires cloud sync, out of v1 scope
- "Ask" decision UX — pause tool, show in dashboard, await human approval (v1 logs + blocks only)
- Enterprise cloud exporter (OTel/ClickHouse backend) — after local tier is validated
- ML-based intent/threat detection (WitnessAI pattern) — complexity, latency risk; v3+
- Stdio MCP transport proxying — subprocess management complexity; HTTP-only in v1
- Config editor UI — config file only in v1
- Policy-as-code (OPA/Rego) — custom rule language is v2+
- Slack/webhook alerting on critical findings

---

## Out of Scope

- Field sales, outbound GTM — distribution is open-source launch + dogfood validation only
- Python backend — TypeScript throughout, no exceptions
- Data sent to any third-party cloud in v1 — local-only, zero telemetry out
- Browser/IDE extension approach — Claude Code hooks are the integration path

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 1 — Foundation | Pending |
| INFRA-02 | Phase 1 — Foundation | Pending |
| INFRA-03 | Phase 1 — Foundation | Pending |
| INFRA-04 | Phase 1 — Foundation | Pending |
| INFRA-05 | Phase 1 — Foundation | Pending |
| INFRA-06 | Phase 1 — Foundation | Pending |
| SEC-01 | Phase 2 — Security Core | Pending |
| SEC-02 | Phase 2 — Security Core | Pending |
| SEC-03 | Phase 2 — Security Core | Pending |
| SEC-04 | Phase 2 — Security Core | Pending |
| SEC-05 | Phase 2 — Security Core | Pending |
| SEC-06 | Phase 2 — Security Core | Pending |
| SEC-07 | Phase 2 — Security Core | Pending |
| MCP-01 | Phase 2 — Security Core | Pending |
| MCP-02 | Phase 2 — Security Core | Pending |
| MCP-03 | Phase 2 — Security Core | Pending |
| INS-01 | Phase 3 — Intelligence & Dashboard | Pending |
| INS-02 | Phase 3 — Intelligence & Dashboard | Pending |
| INS-03 | Phase 3 — Intelligence & Dashboard | Pending |
| INS-04 | Phase 3 — Intelligence & Dashboard | Pending |
| DASH-01 | Phase 3 — Intelligence & Dashboard | Pending |
| DASH-02 | Phase 3 — Intelligence & Dashboard | Pending |
| DASH-03 | Phase 3 — Intelligence & Dashboard | Pending |
| DASH-04 | Phase 3 — Intelligence & Dashboard | Pending |
| DASH-05 | Phase 3 — Intelligence & Dashboard | Pending |
| DOG-01 | Phase 4 — Dogfood & Stabilize | Pending |
| DOG-02 | Phase 4 — Dogfood & Stabilize | Pending |
| DOG-03 | Phase 4 — Dogfood & Stabilize | Pending |
