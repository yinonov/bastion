# Phase 1 Context - Foundation

## Goal
Developer can install Bastion globally, run `bastion install-hooks`, and have a running edge server that responds to Claude Code hook events in under 50ms, reliably, without native compilation friction.

## Decisions
- D-01: Use `node:sqlite` (Node 22 built-in) for local persistence; do not use `better-sqlite3` or any native-compile dependency in Phase 1. (INFRA-01)
- D-02: Hook integration path is Claude Code hook process -> HTTP POST -> running edge server. Keep heavy work off the request hot path. (INFRA-02, INFRA-04)
- D-03: `bastion install-hooks` must merge/update hook configuration safely instead of destructive overwrite. (INFRA-02)
- D-04: Edge server startup must reject duplicate instances with a clear error and must handle malformed payloads without crashing. (INFRA-03, INFRA-05)
- D-05: Runtime configuration lookup order is current working directory first, then `~/.config/bastion/`, with sensible defaults on first run. (INFRA-06)

## Deferred Ideas
- Defer security policy enforcement and finding persistence details to Phase 2.
- Defer dashboard and insights work to later phases.

## Claude's Discretion
- Choose exact file layout and helper modules as long as requirements stay mapped and verification remains automated.
- Choose latency instrumentation implementation details that can produce repeatable p95 measurements.

## Success Criteria Baseline
1. Global install path avoids native build tooling requirements.
2. `install-hooks` writes a valid hooks config consumed by Claude Code on next launch.
3. Hook round-trip latency is measured and reported at <=50ms under normal load.
4. Edge process survives malformed input and prevents duplicate instances.
