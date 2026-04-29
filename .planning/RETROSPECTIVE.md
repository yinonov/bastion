# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — Local Dogfood

**Shipped:** 2026-04-29
**Phases:** 7 | **Plans:** 13 | **Timeline:** 4 days (2026-04-26 → 2026-04-29)
**Codebase delta:** 130 files, ~16,830 lines added

### What Was Built

- Full Claude Code hook interception pipeline: install-hooks CLI → Fastify edge server → policy engine → SQLite findings persistence, all <50ms hot path
- Policy engine covering secrets (AWS/GH/PEM/entropy), dangerous commands (`rm -rf`, `git push --force`, etc.), protected paths, and MCP allowlist enforcement
- HTTP-transport MCP streaming proxy with JSON-RPC denial on blocked servers
- Intelligence pipeline: friction cluster detection, shadow spend estimation, async DeveloperInsight generation from event batches
- Real-time Next.js dashboard with 2-second polling loop: risk score, live event stream, findings, insights, color-coded hook latency metrics
- `bastion test-threats` CLI command with seeded synthetic threat vectors for regression testing
- Uptime + latency persistence across edge restarts (restart-safe p95 via `agent_events.latency_ms`)
- Phase 5 DOG-01 closure: organic evidence artifact from real daily Claude Code usage
- Phase 7 hardening: dashboard report URL from config, MCP transport scope parity, latency SSR determinism

### What Worked

- **Yolo mode + GSD workflow:** Skipping confirmation gates and letting the planner/executor cycle run continuously was highly efficient for a solo founder. Zero time lost to gate prompts.
- **Coarse granularity phases:** Starting with 4 phases (later expanded to 7) kept planning overhead low while allowing organic scope expansion when audit gaps were found.
- **Milestone audit before close:** Running `gsd-audit-milestone` surfaced 3 real gaps (DOG-01 evidence, DOG-02/03 time-gating, DASH-01 URL hardcode) that were all closed before archiving. This prevented shipping with silent known gaps.
- **SQLite as the integration spine:** Every subsystem writing to the same local SQLite store made the dashboard wiring trivial — no API contract coordination needed.
- **Zod schemas from day one:** Having `AgentEvent`, `SecurityFinding`, `FrictionCluster` etc. as Zod schemas meant all layers were type-safe end-to-end without extra glue.

### What Was Inefficient

- **Shadow spend always $0:** Claude Code hooks omit per-event token counts. The spend estimator is wired but has no real data source. This wasn't discovered until late Phase 3 — earlier discovery would have prompted a different design (e.g., intercept PromptSubmit differently).
- **DOG-01 fallback evidence:** The organic catch evidence wasn't naturally captured in live SQLite — required explicit Phase 5 to close the gap. Ideally the dogfood phase would have included an evidence export artifact from the start.
- **Orphaned /api/latency endpoint:** Latency was consolidated into `/api/summary` in Phase 7, leaving `/api/latency` dangling. A phase-level refactoring decision would have been cleaner.
- **BASTION_EDGE_URL server-only gap:** Dashboard client-side polling silently ignores `BASTION_EDGE_URL` env var — not discovered until the audit. A single "full request trace" test in Phase 3 would have caught it earlier.

### Patterns Established

- **Audit → gap phases pattern:** Running `gsd-audit-milestone`, finding gaps, then creating gap-closure phases (5, 6, 7) rather than forcing a clean close is the right model for dogfood milestones.
- **Time-gated requirements accepted at close:** DOG-02/DOG-03 are by definition time-gated (7-day window). These are accepted as "clock running" at v1.0 close rather than blocking the milestone indefinitely.
- **Phase SUMMARY.md as living artifact:** Summaries with `provides:`, `affects:`, and `decisions-made:` front-matter enable dependency tracing and retrospective extraction automatically.
- **Synthetic test vectors alongside real dogfood:** `bastion test-threats` gives instant regression coverage even before real organic catches accumulate. Both tracks needed.

### Key Lessons

1. **Wire evidence capture early in dogfood phases** — don't assume real events will naturally produce the right artifact format. Add an evidence export step to Phase 1 or 2 so DOG-01-style closes are automatic.
2. **Test the full client → server request chain in integration tests** — the `BASTION_EDGE_URL` server-only bug would have been caught immediately with one browser-side fetch test.
3. **Audit before close, not after** — the 3 gap-closure phases added 3 extra days but produced a much cleaner v1.0. The pattern works; build it into the milestone plan upfront.
4. **SQLite synchronous reads are fine for v1 dashboard** — `DatabaseSync` blocking on the main thread hasn't caused perceptible latency issues in practice. Flag for async refactor in v1.1 but don't prematurely optimize.
5. **MCP transport scope should be explicit and test-covered from day one** — unsupported transports silently failing is worse than a clear "HTTP-only" error. Add transport scope tests to the security core phase next time.

### Cost Observations

- Model mix: primary execution via balanced profile (Sonnet-class)
- Sessions: ~8–10 GSD sessions over 4 days
- Notable: Yolo mode + wave-based parallelization in execute-phase kept each phase under 1 hour wall clock time despite significant LOC changes

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Key Change |
|-----------|----------|--------|------------|
| v1.0 | ~10 | 7 | Established baseline: coarse phases, yolo mode, audit-before-close |

### Cumulative Quality

| Milestone | Tests | Coverage | Notes |
|-----------|-------|----------|-------|
| v1.0 | Unit + integration per package | Partial (policy, config, insights covered) | `bastion test-threats` adds synthetic E2E regression coverage |
