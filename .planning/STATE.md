# Project State

**Project:** Bastion  
**Milestone:** v1 — Local Dogfood  
**Current Phase:** 1  
**Status:** Planning complete, ready to execute

---

## Phase Progress

- [ ] Phase 1 — Foundation
- [ ] Phase 2 — Security Core
- [ ] Phase 3 — Intelligence & Dashboard
- [ ] Phase 4 — Dogfood & Stabilize

---

## Current Focus

**Phase 1 — Foundation**  
Fix install story (`node:sqlite`, zero native compilation), wire hook handler as HTTP POST to edge server (eliminates subprocess cold-start), add WAL pragmas, harden `install-hooks` to merge not overwrite, add duplicate-instance guard.

**Key constraint:** Nothing in Phase 2 is buildable until hook latency is confirmed ≤50ms.

---

## Accumulated Context

### Critical Build Order
1. `node:sqlite` migration (INFRA-01) — blocks global install
2. Hook → HTTP POST rewrite (INFRA-04) — blocks all latency-sensitive work  
3. WAL mode (supports INFRA-03/04) — prevents SQLite corruption
4. Security engine wire-up (Phase 2) — only after latency is confirmed
5. CMI/insights pipeline (Phase 3) — only after real security events are flowing

### Key Decisions Carried Forward
- `better-sqlite3` → `node:sqlite` (built-in Node 22, zero native compilation)
- `@fastify/reply-from` for MCP proxy streaming (current buffered fetch is broken)
- Secret detection: start with 5–8 high-precision patterns; false positives destroy trust faster than gaps
- Insights pipeline: do NOT build until dogfood confirms real events are flowing

### Blockers
- None at planning stage

### Todos
- [ ] Verify `node:sqlite` API surface covers all `LocalSqliteStore` usages before migrating
- [ ] Add `--dry-run` flag to `install-hooks` for safe re-runs

---

## Performance Metrics

| Metric | Target | Actual |
|--------|--------|--------|
| Hook p95 latency | ≤50ms | Not yet measured |
| Edge server uptime | ≥7 days | Not yet measured |
| Real findings caught | ≥1 | 0 |

---

## Session Continuity

**Last updated:** April 26, 2026  
**Next action:** `/gsd-plan-phase 1` — plan Phase 1 (Foundation)
