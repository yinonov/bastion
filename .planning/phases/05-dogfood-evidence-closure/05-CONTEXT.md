# Phase 5: Dogfood Evidence Closure - Context

**Gathered:** 2026-04-27
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase closes DOG-01 only: capture one organic security catch from real Bastion dogfood usage, export traceable evidence from the local SQLite store, and record the verification artifacts needed to mark the requirement complete.

</domain>

<decisions>
## Implementation Decisions

### Evidence Capture Workflow
- Add a CLI command to export one persisted finding plus its linked event as a reproducible evidence artifact.
- Store the captured phase evidence in `.planning/phases/05-dogfood-evidence-closure/EVIDENCE.md`.
- Include a readiness check in the plan so hooks, edge server, and findings access are verified before waiting on organic usage.
- Keep instrumentation unchanged; Phase 5 should use the existing `/api/findings` and SQLite persistence rather than add new telemetry.

### Evidence Quality And DOG-01 Criteria
- Treat an organic catch as any finding created during real daily workflow, even if the founder recognizes Bastion is active, as long as the input was not deliberately crafted as a synthetic test vector.
- Minimum DOG-01 evidence is the persisted finding UUID, timestamp, type, severity, decision-linked metadata, and a redacted evidence snippet.
- If no organic catch appears after a short real-usage window, allow a borderline-real fallback scenario only after documenting that the ideal organic path did not occur fast enough.
- A persisted SQLite finding plus exported evidence artifact is sufficient; no extra regression suite is required to declare DOG-01 satisfied.

### Verification And Traceability Artifacts
- Phase verification should explicitly link DOG-01 to the exported evidence artifact and mark the phase as passed when the artifact is present.
- Update `REQUIREMENTS.md` in this phase to mark DOG-01 complete once the evidence is captured.
- Document the expected capture timeline so the founder knows when to escalate to the fallback path.
- Include a lightweight daily check workflow so progress does not depend on memory.

### Claude's Discretion
- Claude may choose the exact CLI output format and evidence file structure as long as it is deterministic, redacted, and traceable to a persisted finding/event pair.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `packages/edge/src/store.ts` already persists `security_findings` and `agent_events` and is the natural place to add finding-to-event evidence lookup.
- `packages/cli/src/index.ts` already exposes local reporting commands (`export-report`, `status`, `test-threats`) and can host a focused evidence export command without changing package boundaries.
- `packages/core/src/report.ts` already formats dashboard summaries, so Phase 5 only needs a narrower finding export rather than a new reporting subsystem.

### Established Patterns
- Bastion keeps local-first data in SQLite and accesses it through `LocalSqliteStore` methods.
- CLI commands open the local store temporarily, print structured terminal output, and then close the database handle.
- Requirements and phase progress are tracked through `.planning` artifacts rather than ad hoc notes.

### Integration Points
- Exported DOG-01 evidence should come from `security_findings.event_id -> agent_events.id`.
- The phase output must update `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, and `.planning/STATE.md` after verification passes.

</code_context>

<specifics>
## Specific Ideas

Expected timing: try for an organic catch within 1-3 days of normal use; if none appears, document that and use the fallback path deliberately rather than leaving the phase open-ended.

</specifics>

<deferred>
## Deferred Ideas

- No desktop notifications, Slack hooks, or extra telemetry in this phase.
- No cloud export or team-level evidence aggregation in this phase.

</deferred>