# Architecture: Bastion

**Project:** Bastion — Local-first MCP Edge Gateway & Security Control Plane  
**Researched:** April 2026  
**Basis:** Full codebase read + PROJECT.md

---

## Current Component Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Developer Machine                         │
│                                                                  │
│  ┌──────────────────────────────┐                               │
│  │        Claude Code           │                               │
│  │  ~/.claude/settings.json     │                               │
│  │  hooks: { PreToolUse, ...}   │                               │
│  │  command: "bastion hook claude"                              │
│  └──────────┬───────────────────┘                               │
│             │ stdin: hook JSON payload                          │
│             ▼ (subprocess fork per event)                       │
│  ┌──────────────────────────────┐                               │
│  │       @bastion/cli           │                               │
│  │  `bastion hook claude`       │                               │
│  │  - readStdinJson()           │                               │
│  │  - normalizeClaudeHook()     │   ┌─────────────────────┐    │
│  │  - evaluatePolicy()          │──▶│   @bastion/core      │    │
│  │  - toClaudeHookResponse()    │◀──│  schemas, policy,   │    │
│  │  - store.saveEvent()         │   │  redaction, hooks,  │    │
│  │  - store.saveFindings()      │   │  config, report     │    │
│  │  stdout: JSON response       │   └─────────────────────┘    │
│  └──────────┬───────────────────┘            ▲                  │
│             │ stdout JSON → Claude Code       │ imports          │
│             │                                │                  │
│             ▼                                │                  │
│  ┌──────────────────────────────┐            │                  │
│  │     LocalSqliteStore         │            │                  │
│  │    (.bastion/bastion.db)     │◀───────────┘                  │
│  │  agent_events table          │                               │
│  │  security_findings table     │                               │
│  └──────────┬───────────────────┘                               │
│             │ (also written by edge server)                     │
│             │                                                   │
│  ┌──────────▼───────────────────┐                               │
│  │      @bastion/edge           │                               │
│  │  Fastify on 127.0.0.1:4711   │                               │
│  │  GET  /health                │                               │
│  │  GET  /api/summary           │                               │
│  │  GET  /api/events            │                               │
│  │  GET  /api/findings          │                               │
│  │  GET  /api/report            │                               │
│  │  POST /api/hooks/claude      │ ← alternate HTTP hook path    │
│  │  POST /mcp/:serverName       │ ← MCP reverse proxy           │
│  └──────────┬───────────────────┘                               │
│             │ HTTP fetch (cache: no-store)                      │
│             ▼                                                   │
│  ┌──────────────────────────────┐                               │
│  │   apps/dashboard (Next.js)   │                               │
│  │  App Router, dark theme      │                               │
│  │  - Risk score panel          │                               │
│  │  - Live agent stream         │                               │
│  │  - Findings panel            │                               │
│  │  - Insights panel            │                               │
│  └──────────────────────────────┘                               │
│                                                                  │
│  ┌──────────────────────────────┐                               │
│  │     @bastion/insights        │                               │
│  │  (pure functions, no I/O)    │                               │
│  │  buildFrictionClusters()     │                               │
│  │  generateDeveloperInsights() │                               │
│  │  estimateShadowSpend()       │                               │
│  │  calculateRiskScore()        │                               │
│  └──────────────────────────────┘                               │
│        ▲ called from LocalSqliteStore.dashboardSummary()        │
└─────────────────────────────────────────────────────────────────┘

   MCP upstream (HTTP-transport only, v1)
   POST /mcp/:serverName → edge → upstream.url (buffered fetch)
```

---

## Data Flow: Hook → Store → Dashboard

### Path A: Claude Code subprocess hook (primary)

```
Claude Code fires hook event
        │
        │ fork subprocess: "bastion hook claude"
        │ stdin: { hook_event_name, tool_name, tool_input, session_id, cwd, ... }
        ▼
@bastion/cli runClaudeHookHandler()
        │
        ├─ loadConfig()                    ← reads bastion.config.json
        ├─ normalizeClaudeHook(stdin, cfg) ← → AgentEvent (Zod-validated)
        │    - coerce hook_event_name → AgentEventType
        │    - redactUnknown(prompt|command|filePath)
        │    - machineId = hostname()
        ├─ evaluatePolicy(event, cfg)      ← → { event, decision, findings }
        │    - secret detection (regex redaction)
        │    - tool allowlist/denylist
        │    - dangerous command patterns
        │    - protected path patterns
        ├─ store.saveEvent(evaluation.event)
        ├─ store.saveFindings(evaluation.findings)
        │
        └─ stdout: JSON ClaudeHookResponse
               Claude Code reads this and applies:
               - permissionDecision: allow | deny | ask (PreToolUse)
               - continue: false + stopReason (UserPromptSubmit deny)
               - decision: "block" (PostToolUse deny)
               - suppressOutput flag

SQLite rows written:
  agent_events:      id, timestamp, source, event_type, status, severity,
                     session_id, machine_id, project_path, tool_name, action,
                     redacted_snippet, latency_ms, raw_payload_json, metadata_json
  security_findings: id, timestamp, event_id, type, severity, title,
                     description, evidence_snippet, recommendation
```

### Path B: Direct HTTP hook (edge server, secondary)

```
POST /api/hooks/claude  ← same normalizeClaudeHook → evaluatePolicy flow
                          but via HTTP; edge server must already be running
```

### Path C: MCP proxy

```
Claude Code MCP client → POST /mcp/:serverName
        │
        ├─ allowlist check: config.mcp.servers[serverName].enabled?
        │    NO  → 403 + save denied event + mcp_server_not_approved finding
        │    YES → evaluatePolicy(mcpEvent, config)
        │
        ├─ transport check: server.transport === "http"?
        │    NO  → 501 (stdio not proxied in MVP)
        │    YES → fetch(server.url, { method: POST, body: JSON.stringify(body) })
        │           ⚠ BUFFERED: await upstream.text() — no streaming
        │
        └─ relay response back, save event with latencyMs
```

### Dashboard read path

```
Next.js SSR page load (cache: no-store)
        │
        └─ fetch("http://127.0.0.1:4711/api/summary")
                │
                └─ LocalSqliteStore.dashboardSummary()
                        ├─ recentEvents(250)   ← SELECT from agent_events
                        ├─ recentFindings(250) ← SELECT from security_findings
                        ├─ buildFrictionClusters(events)    ← computed in-memory
                        ├─ generateDeveloperInsights(...)   ← computed in-memory
                        ├─ calculateRiskScore(findings, clusters)
                        └─ estimateShadowSpend(events)
                        → DashboardSummary (Zod-validated)
```

---

## SQLite Schema (as implemented)

```sql
-- agent_events: canonical event log
CREATE TABLE agent_events (
  id               TEXT PRIMARY KEY,         -- UUID
  timestamp        TEXT NOT NULL,            -- ISO 8601
  source           TEXT NOT NULL,            -- "claude-code" | "mcp" | "scanner"
  event_type       TEXT NOT NULL,            -- AgentEventType enum
  status           TEXT NOT NULL,            -- "allowed" | "denied" | "asked" | ...
  severity         TEXT NOT NULL,            -- "info" | "low" | "medium" | "high" | "critical"
  session_id       TEXT,                     -- Claude Code session UUID
  machine_id       TEXT NOT NULL,            -- hostname()
  project_path     TEXT,                     -- cwd at time of event
  tool_name        TEXT,                     -- e.g. "Bash", "mcp:github:list_repos"
  action           TEXT,                     -- command | file_path | prompt excerpt
  redacted_snippet TEXT,                     -- post-redaction excerpt (max snippetMaxChars)
  latency_ms       INTEGER,                  -- round-trip ms (MCP proxy only currently)
  raw_payload_json TEXT,                     -- full hook payload if capture.rawPayload = true
  metadata_json    TEXT NOT NULL             -- { permissionMode, toolUseId, ... }
);

CREATE INDEX idx_agent_events_timestamp ON agent_events(timestamp);
CREATE INDEX idx_agent_events_status    ON agent_events(status);

-- security_findings: policy violations and detections
CREATE TABLE security_findings (
  id               TEXT PRIMARY KEY,         -- UUID
  timestamp        TEXT NOT NULL,
  event_id         TEXT,                     -- FK → agent_events.id (not enforced)
  type             TEXT NOT NULL,            -- "secret" | "dangerous_command" | ...
  severity         TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  evidence_snippet TEXT,
  recommendation   TEXT NOT NULL
);

-- NOTE: FrictionClusters, DeveloperInsights, DashboardSummary are NOT persisted.
-- They are recomputed on every /api/summary call from the 250-event window.
```

**Key schema observations:**
- `metadata_json` is a catch-all blob — good for flexibility, bad for querying specific fields
- No foreign key enforcement (event_id is nullable TEXT)
- No `projects` or `sessions` dimension tables — multi-project queries require `GROUP BY project_path`
- Clusters/insights are ephemeral: recomputed every poll, IDs change on every call (randomUUID() in buildFrictionClusters)

---

## Identified Gaps

### 1. Hook integration: subprocess vs HTTP (critical)

**Current state:** `bastion hook claude` is a subprocess invoked per event. This means:
- A new Node.js process starts for every hook event (cold-start ~50–200ms)
- The latency target (<50ms) is likely violated in practice
- No persistent connection to the edge server from within the hook handler

**Gap:** The edge server at `:4711` exists but the hook handler does NOT use it. It writes directly to SQLite via its own `LocalSqliteStore` instance. The `/api/hooks/claude` endpoint is dead code relative to the primary hook path.

**Recommended fix:** `bastion hook claude` should POST to `http://127.0.0.1:4711/api/hooks/claude` (edge must be running). This eliminates per-event Node.js cold starts, enables latency measurement, and consolidates all writes through one store instance. If edge is down, fall back to direct SQLite write.

### 2. MCP proxy: buffered fetch (blocking for streaming MCP servers)

**Current state:** MCP proxy does `await fetch(...)` then `await upstream.text()` — full buffering before response.

**Gap:** MCP over HTTP/SSE servers use `text/event-stream` for streaming tool results. Buffering:
- Defeats streaming (user sees no incremental output)
- May OOM on large responses
- Breaks MCP protocol expectations for servers that rely on streaming

**Recommended fix:**
```typescript
// Instead of:
const text = await upstream.text();
reply.code(upstream.status).type(...);
return text;

// Do:
if (upstream.body) {
  reply.code(upstream.status)
       .type(upstream.headers.get("content-type") ?? "application/json");
  return reply.send(upstream.body); // pipe the ReadableStream
}
```
Fastify can accept a `ReadableStream` as a reply body and will pipe it natively.

### 3. Insights: ephemeral and ID-unstable (medium)

**Current state:** `buildFrictionClusters` and `generateDeveloperInsights` are called inside `dashboardSummary()` on every read. Cluster IDs are generated with `randomUUID()` each time — they change every poll.

**Gaps:**
- Dashboard cannot link to a stable cluster or insight URL
- Can't track cluster evolution over time ("this cluster grew from 3 to 12 events")
- `DeveloperInsight.clusterId` links to an ephemeral cluster ID that won't survive next poll
- Spend estimate is a rough `chars/4 * $3/1M tokens` heuristic with no model-specific calibration

**Recommended fix:** Persist clusters and insights to SQLite tables, keyed by a deterministic ID (hash of `clusterKey`). Recompute only on new events, not on every read.

### 4. Dashboard: no live updates (medium)

**Current state:** Dashboard fetches `/api/summary` on each page load (`cache: "no-store"`). No WebSocket, no SSE, no polling interval in the browser.

**Gap:** Dashboard doesn't update while the user is looking at it. Must hard-refresh to see new events.

**Recommended fix:** Add SSE endpoint `GET /api/stream` on the edge server. Dashboard subscribes with `EventSource`. Edge pushes a summary diff on each new saveEvent call. Alternatively, client-side `setInterval` polling every 5s is simpler but wasteful.

### 5. ITelemetryExporter: config exists, interface does not (medium)

**Current state:** `BastionConfigSchema.exporters.cloud` defines `{ enabled, endpoint, apiKeyEnv }` but there is no `ITelemetryExporter` interface in `@bastion/core` and no dispatch logic in `LocalSqliteStore` or anywhere else.

**Gap:** The enterprise exporter path is architecturally planned but not plumbed. Any code that calls `store.saveEvent()` would need to also call `exporter.export(event)` — but this is not wired.

### 6. Dashboard types: duplicated from core (low)

**Current state:** `apps/dashboard/lib/types.ts` manually re-declares all types (AgentEvent, SecurityFinding, etc.) instead of importing from `@bastion/core`. These will drift.

**Recommended fix:** Export types from `@bastion/core`'s package.json `exports` and import them directly in the dashboard's `lib/types.ts`, or re-export from a thin wrapper.

### 7. Policy engine: missing event types (low)

**Current state:** `evaluatePolicy` handles all events but `normalizeClaudeHook` only meaningfully populates fields for `PreToolUse`, `UserPromptSubmit`, and `PostToolUse*`. `SessionStart` and `SessionEnd` events pass through with minimal metadata.

**Gap:** No session-level context accumulation (e.g., total tokens in session, session duration). The policy engine can't make session-aware decisions.

---

## Component Boundaries

| Package | Owns | Communicates With |
|---------|------|-------------------|
| `@bastion/core` | Zod schemas, policy evaluation, redaction engine, hook normalizer, config loader, markdown report renderer | Used by all other packages (no deps of its own) |
| `@bastion/edge` | Fastify HTTP server, LocalSqliteStore (DDL + queries), dashboardSummary aggregation | Imports `@bastion/core`, `@bastion/insights` |
| `@bastion/insights` | Pure functions: friction clustering, insight generation, risk scoring, spend estimation | Imports `@bastion/core` types only |
| `@bastion/cli` | Commander CLI, `install-hooks` (writes `.claude/settings.json`), `hook claude` subprocess handler, `scan`, `export-report` | Imports `@bastion/core`, `@bastion/edge` (dynamic import) |
| `apps/dashboard` | Next.js App Router UI, dark theme design system | Fetches from `@bastion/edge` HTTP API |

**Dependency graph (→ = imports):**
```
apps/dashboard → @bastion/edge (HTTP only, no package import)
@bastion/cli   → @bastion/core, @bastion/edge (dynamic)
@bastion/edge  → @bastion/core, @bastion/insights
@bastion/insights → @bastion/core
@bastion/core  → (none — leaf package)
```

---

## Critical Seams for Enterprise Extension

### Seam 1: `ITelemetryExporter` — the buffer→cloud bridge

The intended pattern (from PROJECT.md decisions) is SQLite as an **edge buffer** that forwards to an enterprise exporter. The seam should be:

```typescript
// In @bastion/core — define the interface
export interface ITelemetryExporter {
  exportEvent(event: AgentEvent): Promise<void>;
  exportFindings(findings: SecurityFinding[]): Promise<void>;
  flush(): Promise<void>;
}

// In @bastion/edge — wire it into LocalSqliteStore or alongside it
export class LocalSqliteStore {
  constructor(
    private readonly dbPath: string,
    private readonly exporter?: ITelemetryExporter  // optional cloud exporter
  ) { ... }

  saveEvent(event: AgentEvent): void {
    // ... existing SQLite write ...
    void this.exporter?.exportEvent(event);  // fire-and-forget or queue
  }
}
```

Config already supports `exporters.cloud.enabled / endpoint / apiKeyEnv`. The interface just needs to be defined and wired.

### Seam 2: Multi-user / team aggregation

The `machineId` field (currently `hostname()`) is the only machine identity. For enterprise:
- `machineId` should become a stable UUID written to `~/.bastion/machine-id` on first run
- A `teamId` / `orgId` field would be needed at the event level
- The cloud exporter would aggregate by `teamId` on the server side

This is a **non-breaking additive change** to the schema (add optional `teamId` to AgentEventSchema).

### Seam 3: Dashboard → cloud mode

Currently dashboard always fetches from local edge (`BASTION_EDGE_URL` env var). For enterprise:
- `BASTION_EDGE_URL` could point to a cloud endpoint
- Authentication header injection would be needed
- The `DashboardSummary` shape is already the right abstraction — no schema change needed

### Seam 4: Policy as code vs. config

Currently policies are static JSON in `bastion.config.json`. Enterprise would want:
- Policy-as-code: TypeScript rules with `import` and composability
- OPA/CEL integration for team-wide policy distribution
- Per-project overrides (already partially supported — `loadConfig(cwd)`)

The seam is the `BastionConfigSchema.policies` object. An enterprise tier would swap the config-driven `evaluatePolicy` with a pluggable evaluator interface.

---

## Recommended Build Order

Based on dependencies and what must be solid before the next layer can be built:

### Wave 1: Foundation (must be solid first)
1. **Fix hook handler latency** — change `bastion hook claude` to POST to the running edge server rather than spawning a cold-start process per event. This is the critical path for dogfooding (a 200ms cold-start violates the <50ms requirement).
2. **Wire edge server as single source of truth** — all saves go through edge HTTP; remove the direct SQLite write from CLI hook handler.
3. **`install-hooks` reliability** — ensure `bastion run` starts before hooks fire; add a health check ping in `install-hooks`.

### Wave 2: Data integrity
4. **Persist FrictionClusters** — add `friction_clusters` table with deterministic ID (hash of cluster key). Update `LocalSqliteStore.saveEvent` to upsert cluster row.
5. **Dashboard type import** — delete `apps/dashboard/lib/types.ts`, import types from `@bastion/core` directly.

### Wave 3: Live experience
6. **SSE live feed** — `GET /api/stream` on edge, `EventSource` in dashboard. Enables real-time agent stream without hard-refresh.
7. **MCP proxy streaming** — pipe `ReadableStream` instead of buffering. Required for real HTTP-transport MCP servers.

### Wave 4: Enterprise seam
8. **`ITelemetryExporter` interface** — define in `@bastion/core`, implement `LocalSqliteExporter` as the default, wire optional cloud exporter in `LocalSqliteStore` constructor.
9. **Stable `machineId`** — write UUID to `~/.bastion/machine-id` on first run; use that instead of `hostname()`.

### Wave 5: Validation
10. **End-to-end dogfood** — run `bastion install-hooks --target claude-code --scope user` and use Claude Code for a real task. Verify at least one real secret block or dangerous command catch shows in dashboard.

---

## Enterprise Extension Path

```
v1 (current)                      v2 (enterprise)
─────────────────────             ─────────────────────────────────
Single developer machine          Multiple developer machines
bastion.config.json (local)  →   Team policy server (pull or push)
LocalSqliteStore (buffer)    →   ITelemetryExporter → OTel/ClickHouse
hostname() as machineId      →   stable UUID + teamId + orgId
Dashboard fetches local edge →   Dashboard fetches cloud endpoint
                                  (same DashboardSummary shape)
No auth                      →   BASTION_API_KEY / mTLS
```

The v1 architecture deliberately isolates the enterprise seams to:
- `ITelemetryExporter` interface (not yet defined)
- `machineId` field (today: `hostname()`)
- `BASTION_EDGE_URL` env var (already parameterized)
- `BastionConfigSchema.exporters.cloud` (already in schema)

No rewrites are needed to add the enterprise tier — only additive changes at these seams.

---

## Sources

- Codebase: full read of `packages/core/src/`, `packages/edge/src/`, `packages/insights/src/`, `packages/cli/src/`, `apps/dashboard/lib/`
- `.planning/PROJECT.md` (project decisions and constraints)
- MCP spec: HTTP-transport uses JSON-RPC 2.0 with optional SSE for streaming (April 2026)
- Fastify docs: `reply.send(ReadableStream)` is supported natively in Fastify 5.x
