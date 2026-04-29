# Phase 2 Context - Security Core

## Goal
Developer trusts Bastion to intercept real threats - secrets, dangerous commands, unapproved MCP servers, and protected paths are blocked or flagged before they execute, with findings persisted to SQLite and returned in the correct hook response format.

## Decisions
- D-01: Keep Phase 2 scoped to security-core enforcement only: secrets, dangerous commands, MCP allowlist, protected paths, valid Claude hook responses, valid MCP JSON-RPC errors, and SQLite findings persistence. Defer dashboard, insights, and broader dogfood workflows to later phases. (SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, MCP-01, MCP-02, MCP-03)
- D-02: Carry forward Phase 1's `node:sqlite` local persistence path and existing `LocalSqliteStore`; findings must persist there with redacted evidence only. Raw secrets must never be written to SQLite unless `capture.rawPayload` is explicitly enabled. (SEC-05, SEC-07)
- D-03: Start with high-precision secret detection and redaction patterns only: AWS access keys, GitHub tokens, private key PEM blocks, generic high-entropy API keys, connection-string style secrets, and `.env`-style assignments. Favor trust-preserving precision over broad noisy matching. (SEC-01, SEC-05)
- D-04: Dangerous command policy is default deny for destructive shell patterns in the requirements set, including `rm -rf`, force-push, hard reset, destructive disk commands, credential-file overwrite patterns, and destructive SQL phrases when they appear in Claude Code tool input. (SEC-02, SEC-06)
- D-05: Protected paths trigger `ask`, not silent allow. The minimum protected set is `.env`, `~/.ssh/`, `~/.aws/credentials`, and `.git/config`, and those decisions must be recorded as high-severity findings in SQLite. (SEC-04, SEC-07)
- D-06: MCP governance is allowlist-only from `bastion.config.json`; requests to unapproved servers return JSON-RPC `-32003`, policy-denied approved-server requests return JSON-RPC `-32004`, and approved HTTP servers stream through the proxy using `@fastify/reply-from` rather than buffered fetch. Stdio proxying remains out of scope in v1. (SEC-03, MCP-01, MCP-02, MCP-03)
- D-07: Phase 1 response adapters remain authoritative: Claude Code responses must use the existing hook response contract in core hooks, and MCP responses must stay valid JSON-RPC 2.0 envelopes. No ad-hoc response shapes. (SEC-06, MCP-03)
- D-08: Carry forward Phase 1's hot-path constraint: security enforcement may add synchronous policy checks and required SQLite persistence, but it must not introduce heavy asynchronous analysis or buffering artifacts that would undermine the measured sub-50ms hook path. (SEC-06, SEC-07, MCP-01)

## Deferred Ideas
- Defer dashboard-facing summaries, risk scoring refinements, and live findings UI work to Phase 3.
- Defer stdio MCP transport proxying; Phase 2 covers HTTP transport only.
- Defer ML or low-precision heuristic secret detection expansions until dogfood evidence justifies them.
- Defer human approval workflow UX for `ask`; Phase 2 only needs the correct policy decision and persisted finding.

## Claude's Discretion
- Choose the exact split between schema changes, core policy logic, and edge-route wiring as long as the plan stays within the Security Core scope and all requirement IDs remain covered.
- Choose the exact synthetic verification fixtures and SQLite assertions that prove redaction, decision formatting, and MCP error handling end-to-end.
- Extend tests or create new co-located test files where needed, but keep plan ownership aligned with the repository's consolidated module layout.

## Success Criteria Baseline
1. Pasting an AWS key, GitHub token, or private key PEM into a Claude Code tool call triggers a `deny` decision with a `[REDACTED]` finding written to SQLite and no raw credential stored.
2. Running `rm -rf /tmp/test` or `git push --force` via Claude Code returns a deny response with a visible block reason.
3. MCP requests to a server not approved in `bastion.config.json` return JSON-RPC `-32003`; approved HTTP servers stream through the proxy without buffered artifacts.
4. Synthetic coverage across allow, deny, ask, and redact paths leaves the expected findings persisted in SQLite with valid schema fields.

## Phase 1 Decisions Carried Forward
- Continue using `node:sqlite` rather than native SQLite addons.
- Continue using config discovery order of CWD first, then `~/.config/bastion`.
- Preserve the requirement that Claude hooks forward to the running edge server over HTTP.
- Preserve the latency discipline established in Phase 1; avoid security work that reintroduces hot-path buffering or crash-prone parsing.
