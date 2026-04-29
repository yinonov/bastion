---
phase: 07-integration-hardening-follow-ups
version: v1
created_date: 2026-04-29
context_status: ready_for_research
---

# Phase 7: Integration Hardening Follow-ups — Context

## Phase Goal
Remove integration sharp edges discovered in audit and align runtime behavior with configuration and documented transport scope.

## Scope & Success Criteria
1. Dashboard report download uses configured edge base URL instead of hardcoded localhost endpoint
2. MCP transport behavior is explicit and test-covered for supported/unsupported transports
3. Latency panel has deterministic initial render state without SSR blank/loading ambiguity

---

## Gray Area 1: Dashboard Configuration Pass-Through

### Current State
- **API fetches:** Dashboard correctly uses `NEXT_PUBLIC_BASTION_EDGE_URL` env var (fallback: `http://127.0.0.1:4711`)
  - `apps/dashboard/lib/api.ts` line 9
  - Works for `/api/summary`, `/api/events`, `/api/findings`
- **Report download link:** Hardcoded to `http://127.0.0.1:4711/api/report`
  - `apps/dashboard/components/live-dashboard.tsx` line 84
  - Does NOT respect env var configuration
  - User finds button on dashboard → downloads report from hardcoded localhost, fails if edge is elsewhere

### Decision to Lock
**How should the report download URL be configured?**

**Recommended Option:** Reuse the same edge URL already configured for API fetches
- The dashboard already computes `edgeUrl` from env vars in `lib/api.ts`
- Export `edgeUrl` or create a `getReportUrl()` helper
- Pass to component via props or import directly
- Minimal change, consistent with API pattern

**Alternative Options:**
- **Option B:** Detect edge URL from page's own request context (more complex, less portable)
- **Option C:** Accept report URL as separate env var (harder to maintain parity)

**Decision:** Use exported helper from `lib/api.ts` to build report URL consistently

### Test Coverage
- Unit test: Verify report URL uses configured edge base
- Integration test: Report download from non-localhost edge URL succeeds (if running on custom host)

---

## Gray Area 2: MCP Transport Scope & Validation

### Current State
- **Supported transports:** Two discriminated union variants in `packages/core/src/schemas.ts`:
  - `http`: with `url` and `headers`
  - `stdio`: with `command` and `args`
- **Edge server behavior:** `packages/edge/src/server.ts` proxies MCP via `@fastify/reply-from`
  - Currently uses `createMcpProxy()` from core
  - No explicit transport validation or rejection logic
- **No explicit documentation:** Phase goal mentions "behavior is explicit" — implying we need to clarify what's supported vs not

### Decision to Lock
**Which MCP transports are officially supported vs unsupported?**

**Supported (locked for v1):**
- `http`: HTTP MCP transport via `@fastify/reply-from` proxy
  - Streaming-aware, header-transparent
  - Test coverage: existing `/api/hooks/claude` MCP proxy tests (server.test.ts)
- `stdio`: Node.js child_process MCP transport
  - Used internally by Claude
  - Test coverage: recommend adding synthetic test

**Unsupported (document & reject):**
- `sse`: Server-Sent Events transport
  - Not in current schema
  - If user tries to configure: reject with clear error message
  - Document: "SSE transport not supported in v1; http or stdio only"
- Future transports (websocket, etc.): Same pattern

### Test Coverage
- Unit test: Verify MCP server config only accepts http or stdio
- Integration test: Edge server rejects unknown transport type with readable error
- Documentation: Update `bastion.config.example.json` with comments explaining supported transports

---

## Gray Area 3: Latency Panel SSR Initial State

### Current State
- **Latency panel:** Fetches `/api/latency` from edge server in component
  - Located in dashboard page or component
  - Client-side fetch (no SSR hydration)
  - Can show blank/loading ambiguity during SSR → client hydration
- **Current behavior:** Likely shows loading skeleton until first fetch completes
- **Problem:** SSR renders one state (skeleton), then client hydrates with different state (data or error) — layout shift or flash

### Decision to Lock
**How should latency panel render deterministically on initial page load?**

**Recommended Option:** Include latency in server-side summary fetch
- Dashboard already fetches `/api/summary` from edge server on page load
- Extend summary to include `latency: { count, maxMs, p95Ms, avgMs }`
- Component receives data during SSR — no loading flash on hydration
- Maintains hot-path server responsiveness (latency fetch is fast)

**Alternative Options:**
- **Option B:** React Suspense boundary — shows fallback, then streams data (more complex, good for large payloads)
- **Option C:** Store latency default in config (less real-time, outdated on restart)
- **Option D:** SSR-time query with `getDashboardSnapshot()` — already in pattern

**Decision:** Extend `DashboardSummary` type to include latency metrics; edge server includes them in `/api/summary`

### Implementation Points
- Update type: `DashboardSummary` → add `latency` field
- Update endpoint: `/api/summary` → call `store.getLatencyStats()` and include
- Update component: Use `summary.latency` directly (no separate fetch)
- Update test: Verify `/api/summary` includes latency metrics

### Test Coverage
- Unit test: Verify latency included in summary JSON schema
- Integration test: `/api/summary` returns consistent latency metrics across calls
- E2E test: Dashboard latency panel renders without flash on initial page load

---

## Code Context & Patterns

### Dashboard API Layer
**File:** `apps/dashboard/lib/api.ts`
```typescript
const edgeUrl = process.env.NEXT_PUBLIC_BASTION_EDGE_URL ?? process.env.BASTION_EDGE_URL ?? "http://127.0.0.1:4711";
```
- Env var resolution pattern: public first (browser-accessible), then server-only, then hardcoded default
- Reuse this pattern for report URL

### Edge Summary Endpoint
**File:** `packages/edge/src/server.ts`
```typescript
app.get("/api/summary", async (req: FastifyRequest, reply: FastifyReply) => {
  const snapshot = store.dashboardSummary();
  reply.send(snapshot);
});
```
- Already calls `store.dashboardSummary()`
- Need to extend store method to include latency

### Dashboard Type Definition
**File:** `apps/dashboard/lib/types.ts`
```typescript
export interface DashboardSummary {
  generatedAt: string;
  riskScore: number;
  blocked: number;
  secrets: number;
  // Add: latency metrics
}
```

### MCP Schema
**File:** `packages/core/src/schemas.ts`
```typescript
export const McpServerConfigSchema = z.discriminatedUnion("transport", [
  z.object({ transport: z.literal("http"), url: z.string().url(), ... }),
  z.object({ transport: z.literal("stdio"), command: z.string(), ... })
]);
```

---

## Dependencies & Integration Points

### Phase 6 → Phase 7
- Phase 6 implemented `/api/latency` endpoint (hook latency tracker)
- Phase 7 integrates latency into summary for SSR determinism
- No conflicts; additive change to existing endpoints

### Dashboard + Edge Server
- Dashboard fetches multiple endpoints; report link must respect edge URL config
- Type contract: DashboardSummary extends to include latency

### Config + Runtime
- MCP server validation happens on config load and hook evaluation
- Transport support documented in schema and example config

---

## Deferred / Out-of-Scope
- SSE transport support (may add in v2; document as unsupported for now)
- Custom transport handler plugins (outside v1 scope)
- Dashboard offline mode (separate phase)

---

## Next Steps for Researchers & Planners

1. **Researcher:** Investigate latency metrics aggregation; review `store.getLatencyStats()` signature; check if any new dependencies needed
2. **Planner:** 
   - Task 1: Update `DashboardSummary` type and extend `/api/summary` to include latency
   - Task 2: Refactor report URL in live-dashboard to use configured `edgeUrl` helper
   - Task 3: Document MCP transport support and add validation/error messaging for unsupported transports
   - Task 4: Add test coverage for all three decisions
