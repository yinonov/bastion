# Research Summary — Bastion MCP Edge Gateway

**Synthesized:** April 26, 2026  
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md  
**Purpose:** Feed requirements definition and roadmap creation

---

## Executive Summary

Bastion occupies a genuinely novel position in the MCP governance space: it is the only tool that intercepts at the **Claude Code hook layer** (PreToolUse / PostToolUse) rather than proxying the LLM API call. Every competitor — Portkey, WitnessAI, Helicone — sees prompt text and response text; Bastion sees the tool execution decision _before the command runs_. This architectural moat is also the product's core value proposition and must be protected at every build decision. The risk is spending effort on things competitors already do (cost tracking, observability dashboards) before nailing the one thing they fundamentally cannot do: stopping `rm -rf` before it executes.

The codebase has a correct architecture with two critical gaps that block dogfooding: (1) the hook handler spawns a new Node.js process per event, which violates the <50ms latency requirement before a single line of security logic runs, and (2) the MCP proxy buffers full upstream responses, which breaks streaming MCP servers. Both gaps are straightforward fixes — not rewrites — and must be closed in Wave 1 before any features are built on top. The stack choices (node:sqlite over better-sqlite3, Fastify 5, pnpm workspaces) are sound; the two meaningful upgrades worth scheduling are Zod v3 → v4 and pnpm 8 → 10.

The feature and pitfalls research converge on the same build discipline: **security enforcement first, insights never**. A false positive from the secret scanner or a 200ms hook round-trip will permanently damage developer trust; the CMI/insights pipeline is genuinely differentiating but has zero value until real security events are flowing. The dogfood gate from PROJECT.md — "Bastion catches at least one real secret or dangerous command in daily use" — is not a milestone checkbox; it is the dependency for every phase beyond Wave 2.

---

## 1. Stack Verdict

### Keep As-Is

| Decision | Verdict | Rationale |
|---|---|---|
| `node:sqlite` | ✅ Keep | Zero native compilation is a hard requirement for a global CLI. better-sqlite3 fails on machines without build tools. The "experimental" warning on Node 22 is acceptable; the API is Release Candidate on Node 25. |
| Fastify 5 | ✅ Keep | 3× Express throughput on JSON workloads. Native TypeScript types. Required for `@fastify/reply-from` streaming. |
| `@modelcontextprotocol/sdk` ^1.29.0 | ✅ Keep | Pin to exact version; subscribe to spec changelog. Use Zod schemas from the SDK to validate proxied traffic. |
| Next.js 15 App Router | ✅ Keep | Correct choice. Do not regress to Pages Router. |
| Tailwind v3 | ✅ Keep | Do not migrate to v4 during active development. Ecosystem support still maturing. |
| pnpm workspaces | ✅ Keep | Upgrade pnpm 8 → 10 to resolve version mismatch warnings in CI. |

### Change / Add

| Item | Action | Priority |
|---|---|---|
| **MCP proxy: buffered `fetch()`** | **Replace with `@fastify/reply-from` or pipe `ReadableStream`** | 🔴 Critical — blocks streaming MCP servers |
| **Hook handler: subprocess per event** | **Change to HTTP POST to running edge server** | 🔴 Critical — 50–200ms cold-start violates latency target before any logic runs |
| **WAL mode** | Add `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;` | 🔴 Critical — prevents WAL corruption with concurrent sessions |
| **Zod v3 → v4** | Upgrade in a dedicated phase | 🟡 Medium — 14× parse speed, better TS inference; wait for a natural break |
| **shadcn/ui** | Add when dashboard component work begins | 🟡 Medium — provides accessible Radix primitives for Dialog, Table, ScrollArea |
| **vitest** | Consider replacing `node:test` for DX | 🟢 Low — optional quality-of-life; current approach works for CI |
| `@modelcontextprotocol/fastify` alpha | **Do NOT adopt** | n/a — wait for v2 GA |
| `better-sqlite3` | **Do NOT use** | n/a — native compilation, ESM complications |

---

## 2. Features Verdict

### Table Stakes (v1 — disqualifying to ship without)

| Feature | Complexity | Status Guess | Notes |
|---|---|---|---|
| Pre-tool-use hook handler (HTTP path) | Medium | Partial | Currently spawns subprocess; must POST to edge instead |
| Secret / credential detection in tool args | Medium | Partial | Regex engine exists; not wired to block decisions yet |
| Dangerous command blocking | Medium | Partial | Patterns exist; enforcement wire-up needed |
| MCP server allowlist / blocklist | Low–Medium | Partial | Config schema exists; enforcement needs proxy work |
| Append-only SQLite audit log + WAL | Low | Partial | Schema exists; WAL pragma missing |
| Per-session risk score | Low | Not started | Summation query from audit log |
| Sub-50ms hook response (fail-open) | Medium | Blocked | Blocked by subprocess cold-start; fire-and-forget writes needed |
| CLI: install-hooks / status / uninstall | Medium | Partial | Hooks install works; daemon management + merge (not overwrite) needed |
| Live dashboard with real data | Medium–High | Partial | Panels exist; wired to mock/stale data; SSE live feed missing |

### Differentiators (v1 — build after table stakes are solid)

| Feature | Priority | Notes |
|---|---|---|
| **Protected path enforcement** | High | Low complexity; high trust signal; build right after dangerous cmd blocking |
| **Developer friction detection (CMI)** | Medium | Genuinely unique; do NOT build until real events are flowing |
| **Shadow spend estimator** | Medium | Unique for hook-only integrations; depends on PromptSubmit capture |
| **One-click markdown report exporter** | Medium | Low complexity; high CISO value |
| **Local-first / zero-telemetry guarantee** | High | Already the architecture; needs `bastion verify-isolation` command + documentation |
| Polished developer UX (dashboard) | Medium | Ongoing; session export, finding detail drawer, human-readable event names |

### Anti-Features (Explicitly Out of Scope for v1)

| Feature | Why Out |
|---|---|
| Cloud sync / team aggregation | Violates local-first promise; no paying customer justification yet |
| Stdio MCP server proxying | Complex transport; stub with clear TODO, not silent error |
| "Ask" flow for dangerous commands (human approval UX) | v2 — v1 just blocks + logs |
| More than 8 secret detection patterns | False positive rate must be validated first |
| Multi-tenant schema fields (tenantId, orgId) | `ITelemetryExporter` abstraction is sufficient insurance |
| OPA/CEL policy engine | v2+ enterprise feature |

---

## 3. Architecture Verdict

### Current Gaps (Ordered by Severity)

#### 🔴 Gap 1: Hook Handler Cold-Start Latency (Critical)

**Problem:** `bastion hook claude` spawns a new Node.js process per event (50–200ms cold-start). The <50ms hook latency target is violated _before any policy logic runs_.

**Fix:** Change `bastion hook claude` to `POST http://127.0.0.1:4711/api/hooks/claude`. The edge server evaluates policy and responds. CLI hook subprocess becomes a thin HTTP caller. Fall back to direct SQLite write only if edge is unreachable.

**Impact:** Unblocks dogfooding. All subsequent feature work depends on this being fast.

#### 🔴 Gap 2: MCP Proxy Full Buffering (Critical)

**Problem:** `await upstream.text()` buffers the entire response before forwarding. Breaks SSE/streaming MCP servers, may OOM on large responses, violates MCP protocol streaming expectations.

**Fix:**
```typescript
// Pipe the ReadableStream instead of buffering
if (upstream.body) {
  reply.code(upstream.status)
       .type(upstream.headers.get("content-type") ?? "application/json");
  return reply.send(upstream.body);
}
```
Or register `@fastify/reply-from` and use `reply.from()` — handles connection pooling, header forwarding, and streaming automatically.

#### 🟠 Gap 3: Insights Are Ephemeral and ID-Unstable (Medium)

**Problem:** `buildFrictionClusters()` calls `randomUUID()` on every `/api/summary` request. Cluster IDs change every poll. Dashboard cannot link to stable insights, and evolution over time is invisible.

**Fix:** Persist clusters to a `friction_clusters` table keyed by a deterministic hash of `clusterKey`. Recompute only on new events.

#### 🟠 Gap 4: Dashboard Has No Live Updates (Medium)

**Problem:** Dashboard fetches `/api/summary` on page load only (`cache: "no-store"`). Hard-refresh required to see new events.

**Fix:** Add `GET /api/stream` SSE endpoint on edge server. Dashboard subscribes with `EventSource`. Push summary diff on each `saveEvent` call.

#### 🟡 Gap 5: `ITelemetryExporter` Interface Unplumbed (Medium)

**Problem:** Config defines `exporters.cloud` but there is no `ITelemetryExporter` interface and no dispatch logic. The enterprise path is planned but has no seam.

**Fix:** Define the interface in `@bastion/core`; implement `LocalSqliteExporter` as the no-op default; wire optional exporter injection in `LocalSqliteStore` constructor.

#### 🟢 Gap 6: Dashboard Types Duplicated from Core (Low)

**Problem:** `apps/dashboard/lib/types.ts` re-declares all types instead of importing from `@bastion/core`. These will drift.

**Fix:** Export types from `@bastion/core`'s `package.json` `exports`. Delete the dashboard re-declarations.

### Critical Seams to Preserve

| Seam | Why It Matters |
|---|---|
| `ITelemetryExporter` interface | SQLite → cloud bridge for enterprise tier. Keep it clean. |
| `machineId` stable UUID | Current `hostname()` is not stable across renames. Write UUID to `~/.bastion/machine-id` on first run. |
| `BastionConfigSchema.policies` | Enterprise policy-as-code / OPA pluggability starts here. Don't collapse this into hardcoded logic. |
| `BASTION_EDGE_URL` env var | Dashboard already reads from this; pointing at a cloud endpoint enables enterprise mode with no dashboard changes. |

### Build Order (Dependency-Respecting)

| Wave | Items | Gate to Next Wave |
|---|---|---|
| **Wave 1 — Foundation** | Fix hook cold-start (HTTP POST to edge); WAL + `busy_timeout` pragma; PID lockfile; `install-hooks` merge (not overwrite) | p99 hook latency < 50ms measured in CI |
| **Wave 2 — Security Core** | Secret detection wired to block decisions; dangerous command blocking; protected path enforcement; per-session risk score; audit log schema finalized | Bastion blocks ≥1 real secret or dangerous command in dogfood use |
| **Wave 3 — Live Experience** | SSE live feed (`/api/stream`); dashboard wired to real data (no mock); MCP proxy streaming fix; dashboard empty state | Dashboard shows real events within 5 minutes of `bastion install-hooks` |
| **Wave 4 — Completeness** | MCP server allowlist enforcement; `bastion status / uninstall`; markdown report exporter; `verify-isolation` command; Zod v4 upgrade | All table stakes features complete |
| **Wave 5 — Differentiators** | Developer friction detection (CMI); shadow spend estimator; `ITelemetryExporter` interface; stable `machineId`; shadcn/ui components | Only after Wave 2 dogfood gate is passed |

---

## 4. Key Pitfalls

### Pitfall 1: Hook Latency Destroys Adoption Before It Starts

**Risk:** If the hook adds >80ms, developers disable Bastion and never re-enable it. First impression is permanent.

**Prevention:**
- Hook response must be p99 < 50ms, measured in CI as a performance regression test
- SQLite writes are fire-and-forget: return decision to Claude Code, write to DB in `setImmediate`
- Secret scanner: compile regexes once at startup; short-circuit on first match; 10ms timeout wrapper (fail-open)
- CMI / insights pipeline: never runs in the hook response path — strictly post-event async

**Phase:** Wave 1. This constraint must be baked in before any other feature is built.

---

### Pitfall 2: Secret Detection False Positives Make the Tool an Enemy

**Risk:** The scanner flags test fixtures, UUIDs, base64 strings, and README examples. Developers whitelist everything or disable the scanner. Trust, once lost, is not recovered.

**Prevention:**
- v1 ships with **5–8 patterns only**: OpenAI key, Anthropic key, AWS access key, AWS secret key, GitHub PAT, Stripe secret key, PEM header, `.env` multiline block. Nothing else.
- Each regex must have a minimum entropy threshold to filter false positives
- `bastion audit --dry-run` mode: shows what *would* be blocked without blocking
- False positive rate tracked during dogfood: if >5% of findings are wrong, don't ship more patterns

**Phase:** Wave 2. Do not expand the ruleset until false positive rate is validated.

---

### Pitfall 3: SQLite WAL Corruption from Duplicate Server Processes

**Risk:** Developer runs `bastion install-hooks` in two terminals. Two server instances write to the same SQLite file. `SQLITE_BUSY` errors, silent corruption, or `rm -rf ~/.bastion/events.db` to recover — all history gone.

**Prevention:**
- Write PID lockfile at `~/.bastion/bastion.lock` at server start; check before spawning
- `install-hooks` health-checks `/health` before spawning; reuses existing process if healthy
- `PRAGMA busy_timeout = 5000` — gives concurrent writers time to retry instead of failing immediately
- Startup integrity check: `PRAGMA integrity_check` on open

**Phase:** Wave 1. One-hour fix with catastrophic consequences if skipped.

---

### (Bonus) Pitfall: Building Insights Before Security Is Validated

**Risk:** CMI pipeline is built while hook integration is still flaky. Impressive dashboard charts run on zero real data. Security layer ships with undetected edge cases.

**Hard gate:** No insights work begins until Bastion catches a real secret or dangerous command in daily dogfood use. The gate is a calendar date — not "when it feels ready."

---

## 5. Confidence Assessment

| Area | Confidence | Basis |
|---|---|---|
| Stack choices | HIGH | Node 22 LTS, Fastify 5, and MCP SDK are all GA and well-documented. Proxy streaming gap is a known Fastify pattern. |
| Feature scope | HIGH | Competitive landscape analysis is clear; table stakes / differentiator split aligns with developer tool adoption patterns. |
| Architecture gaps | HIGH | Gaps are derived from direct codebase read — not assumptions. Fix approaches are concrete. |
| Pitfall severity | HIGH | Latency, false positive, and WAL corruption are all failure modes with prior art in developer tool adoption literature. |
| Timeline estimates | LOW | Deliberately excluded — scope clarity is more valuable than time estimates at this stage. |

**Gaps not resolved by research:**
- Whether Claude Code's hook timeout is configurable (may impose a lower ceiling than 50ms)
- Whether `node:sqlite` `DatabaseSync` supports `setImmediate`-safe async writes without an additional queue (may need a write queue implementation)
- Real-world MCP SDK conformance test results — untested until a live server is proxied

---

## 6. Roadmap Implications

Based on combined research, the following phase structure is recommended:

### Suggested Phase Structure

1. **Foundation & Hook Latency Fix** — Fix cold-start subprocess → HTTP POST; WAL + PID lockfile; install-hooks safety. _Gate: p99 hook < 50ms._

2. **Security Core (Credential + Command Blocking)** — Wire secret detection and dangerous command patterns to actual block decisions; protected path enforcement; risk score. _Gate: dogfood catches real finding._

3. **Live Dashboard & MCP Proxy Streaming** — SSE live feed; real data in all panels; MCP proxy streaming; empty states. _Gate: dashboard updates in real-time with live events._

4. **CLI Completeness & Report Export** — `status`, `uninstall`, `verify-isolation`; MCP allowlist enforcement; markdown report exporter; Zod v4. _Gate: all table stakes complete._

5. **Differentiators (CMI + Spend)** — Developer friction detection; shadow spend estimator; `ITelemetryExporter` seam; stable machineId. _Gate: only reachable after Wave 2 dogfood gate._

### Research Flags

Phases needing deeper research before planning:
- **Phase 3 (SSE live feed):** Validate whether Next.js App Router `EventSource` + Fastify SSE works without edge runtime conflicts
- **Phase 5 (CMI):** Token counting accuracy — `tiktoken` approximation for Claude models needs calibration data

Standard patterns (skip research):
- Phase 1: PID lockfile, WAL pragma — well-documented Node.js / SQLite patterns
- Phase 2: Regex-based secret detection — known pattern, just scope tightly
- Phase 4: CLI `status` / `uninstall` — Commander.js boilerplate

---

## Sources

- `STACK.md` — Technology analysis, April 26, 2026
- `FEATURES.md` — Feature landscape and competitive analysis, April 26, 2026
- `ARCHITECTURE.md` — Codebase read + component boundary analysis, April 2026
- `PITFALLS.md` — Domain pitfall research, April 2026
- External: Portkey docs, WitnessAI blog, Helicone docs, MCP SDK changelog, CVE-2025-6514 advisory
