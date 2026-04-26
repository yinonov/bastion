# Domain Pitfalls: Bastion — MCP Edge Gateway & AI Security Tooling

**Domain:** Local-first MCP proxy / AI governance developer tool
**Researched:** April 2026
**Confidence:** HIGH (based on MCP SDK behavior, SQLite internals, developer tool adoption patterns, and security tooling failure modes)

---

## Critical Pitfalls

Mistakes that cause rewrites, user abandonment, or product death.

---

### Pitfall 1: Hook Latency > 50ms Destroys Adoption Before It Starts

**What goes wrong:** Developers using Claude Code expect near-instant tool use responses. If Bastion's hook handler adds even 80–100ms of synchronous latency, the first thing every developer does is check if disabling Bastion makes Claude Code faster. It does. They disable it. They don't re-enable it.

**Why it happens:**
- SQLite writes (`better-sqlite3` is synchronous) inside the hot path of a pre-tool-use hook block the event loop
- Secret regex scanning runs on every prompt including large codebases pasted as context
- Policy engine is correct but not optimized — scanning all rules when only 1–2 apply
- Insights/CMI pipeline wired into the same synchronous path as the security hook

**Consequences:**
- Zero trust earned with the developer — they form a permanent mental model of "Bastion is slow"
- Even after fixing the latency, re-adoption requires active work
- Negative word-of-mouth ("it slows down Claude")

**Warning signs:**
- Hook roundtrip p99 > 30ms in dev testing
- `better-sqlite3` write appearing in profiler hot path
- CMI analysis running synchronously before hook response is returned
- Any async operation `await`-ed inside the FastifyReply path

**Prevention:**
- Pre-tool-use hook must return in <20ms — measure this in CI as a performance test
- SQLite writes are fire-and-forget: respond to Claude Code immediately, write to DB in `setImmediate`/`process.nextTick`
- Secret scanning: compile regexes once at startup, not per-request; short-circuit on first match
- CMI / insights pipeline: strictly async, post-event, never in the hook response path
- Add a `bastion bench` command that measures actual hook latency from Claude Code's perspective

**Phase:** Phase 1 (edge server) — bake in the constraint before any pipeline is built. Latency budget must be defined and enforced from day one.

---

### Pitfall 2: Secret Detection False Positives Make the Tool an Enemy

**What goes wrong:** The regex-based secret scanner flags test fixtures, example API keys in READMEs, base64-encoded strings, UUIDs, and template variables as "secrets." Developers see their prompts blocked or redacted when they're working with test data. They lose trust, whitelist everything, or disable the scanner entirely.

**Why it happens:**
- Entropy-based detection without context: `AAAA-BBBB-CCCC-DDDD` matches an API key pattern
- No understanding of file context (test file vs. production config)
- Over-broad regex for tokens: `sk-[a-zA-Z0-9]{20,}` also catches UUIDs with dashes stripped
- No learning from user overrides: same false positive fires every day

**Consequences:**
- Developer overrides everything → scanner has zero value
- Or developer removes scanner policy entirely → complete failure mode
- Loss of trust is irreversible — "remember when it blocked my test file"

**Warning signs:**
- Any test fixture or `fixtures/` directory triggers a finding during dogfood
- Same finding fires on the same known-benign input twice
- Developer finds themselves writing exclusion rules within first week of use

**Prevention:**
- Start with a small, high-precision ruleset (5–8 patterns) rather than comprehensive coverage. OpenAI key, Anthropic key, AWS key, GitHub PAT, Stripe key — nothing else in v1
- Each regex must have a confidence score and a minimum entropy threshold
- Add a `--dry-run` audit mode that shows what *would* be blocked without blocking it
- After each false positive during dogfood, update the ruleset before moving on
- Log the false positive rate during self-dogfooding: if >5% of findings are false positives, the scanner isn't ready

**Phase:** Phase 1 (policy engine). Do not add more patterns until false positive rate is validated to be below threshold during dogfood.

---

### Pitfall 3: SQLite WAL Corruption / Lock Contention with Multiple Claude Code Windows

**What goes wrong:** A developer has 3 Claude Code terminals open simultaneously. Each terminal fires hooks through separate HTTP connections to the same Bastion edge server process. `better-sqlite3` is synchronous and uses WAL mode — this is fine with a single writer, but if the edge server is ever restarted mid-write, or if multiple server instances are accidentally spawned, the WAL file can be left in an inconsistent state requiring manual recovery.

**Deeper risk:** The `install-hooks` CLI currently starts an edge server. If the developer runs `bastion install-hooks` twice in different terminals (easy to do accidentally), two server instances compete for the same SQLite file. The second process will get `SQLITE_BUSY` errors or silently corrupt the WAL.

**Why it happens:**
- No PID lockfile to prevent duplicate server processes
- No server health check before `install-hooks` starts a new instance
- WAL mode helps with concurrent reads but does NOT protect against two write processes

**Consequences:**
- Corrupt events database → data loss → developer can't see their history
- Cryptic `SQLITE_BUSY` or `SQLITE_LOCKED` errors in server logs with no user-visible explanation
- Developer runs `rm -rf ~/.bastion/events.db` to "fix" it — all history gone

**Warning signs:**
- `install-hooks` does not check if a Bastion server is already running on the port
- No `PRAGMA journal_mode=WAL` + `PRAGMA busy_timeout=5000` in SQLite initialization
- No lockfile at startup

**Prevention:**
- Write a PID lockfile at `~/.bastion/bastion.lock` at server start; check it before spawning a new process
- `install-hooks` should detect a running server (health check `/health`), skip spawn if healthy, replace if stale
- Set `PRAGMA busy_timeout = 5000` to give concurrent writers time to retry instead of failing immediately
- Add startup test: open DB, run `PRAGMA integrity_check`, log result
- Never run two instances of the edge server pointing at the same DB path

**Phase:** Phase 1 (CLI + edge server). The lockfile is a one-hour fix with catastrophic consequences if skipped.

---

### Pitfall 4: MCP Protocol Churn Breaks the Proxy at Runtime

**What goes wrong:** The MCP specification has undergone multiple breaking revisions since January 2025. The proxy layer in `@bastion/edge` that handles `/mcp/:serverName` calls makes assumptions about request/response shape, capability negotiation, and transport headers. An MCP SDK update upstream silently changes the wire format. Bastion's proxy starts returning malformed responses. Developers see MCP tool calls fail with no obvious error.

**Specific risk:** The current stub for stdio transport returns an error. HTTP transport is implemented but untested against the real `@modelcontextprotocol/sdk`. If Anthropic changes the initialization handshake (which they did between spec 2024-11-05 and 2025-03-26), Bastion's proxy may silently drop capabilities or return stale negotiation state.

**Why it happens:**
- MCP spec still evolving under Linux Foundation governance — breaking changes in minor versions
- Proxy is "transparent" — it must faithfully forward capabilities it doesn't understand
- Version negotiation (`protocolVersion`) is sensitive: if proxy hardcodes a version, it breaks with newer clients/servers

**Consequences:**
- Entire MCP server becomes unavailable through Bastion → developer bypasses proxy
- Developer doesn't know Bastion is the cause → files bug against the MCP server

**Warning signs:**
- Proxy hardcodes `protocolVersion` string anywhere in the codebase
- Integration tests run against a pinned/mocked MCP server, not a real one
- `@modelcontextprotocol/sdk` version not locked in `package.json` with `~` or `^`
- No test that installs a real public MCP server and proxies a tool call through Bastion

**Prevention:**
- Pin `@modelcontextprotocol/sdk` to an exact version; upgrade intentionally with a test pass
- Write a protocol conformance test: spin up `@modelcontextprotocol/sdk` echo server, proxy a tool call through Bastion, assert round-trip fidelity
- Never hardcode `protocolVersion` — pass through whatever the client sends
- Subscribe to MCP spec changelog (GitHub releases on `modelcontextprotocol/specification`)
- Stub the stdio transport stub with a clear `TODO: Phase X` rather than a silent error

**Phase:** Phase 2 (MCP proxy). Conformance tests are a prerequisite before calling the proxy "working."

---

### Pitfall 5: Insights/CMI Layer Built Before Security Layer Is Dogfooded

**What goes wrong:** The `@bastion/insights` package (FrictionCluster builder, shadow spend estimator) is genuinely interesting to build. It's also not what makes Bastion valuable on day one. If development effort flows into CMI analysis pipelines and dashboard charts while the hook integration is still unreliable, the product ships with impressive analytics on zero real data.

**Why it happens:**
- Insights are fun, creative, differentiated
- Security enforcement is unglamorous, full of edge cases, and hard to test
- The developer opens the dashboard and sees the insights panel empty — it feels like low-hanging fruit

**Consequences:**
- Security layer has edge cases that only appear in real use (the tool you actually test is the one that works)
- Insights that fire on synthetic/mock data look convincing in demos but fail on real events
- Technical debt compounds: insights pipeline is wired wrong to real event schema, requiring a rewrite later

**Warning signs:**
- CMI analysis code is being iterated on before `install-hooks` works end-to-end
- Dashboard shows sample/mock data to make insights look populated
- More time spent on `DeveloperInsight` rendering than on `SecurityFinding` accuracy

**Prevention:**
- Define a strict gate: **no insights work until Bastion catches one real secret or dangerous command in daily use**
- The dogfood criterion from PROJECT.md is correct — treat it as a hard dependency, not a nice-to-have
- Insights pipeline should be guarded by a feature flag that defaults off until the security layer is validated
- When building insights: use only real event data from dogfood sessions, never synthetic data

**Phase:** Phase 3+ (insights). Security layer must be validated through self-use before any insights work begins.

---

## Moderate Pitfalls

---

### Pitfall 6: Claude Code Hook Config Silently Overwritten

**What goes wrong:** `bastion install-hooks` modifies Claude Code's `~/.claude/settings.json` (or equivalent) to register hooks. If the developer has existing custom hooks, Bastion's CLI naively replaces the hooks array rather than merging. The developer loses their existing hooks. They blame Bastion.

**Warning signs:**
- `install-hooks` reads but doesn't merge the existing hooks configuration
- No backup of pre-existing config before writing

**Prevention:**
- Read existing hooks config, merge Bastion's entries, write back
- If a Bastion hook entry already exists, update it in-place rather than duplicate it
- Write a backup to `~/.bastion/hooks-backup-{timestamp}.json` before any modification
- Print a diff of what changed to stdout so the developer can see exactly what was touched

**Phase:** Phase 1 (CLI). This is a one-way door — first install must be safe.

---

### Pitfall 7: Premature Enterprise Feature Contamination

**What goes wrong:** The cloud sync / team aggregation architecture creeps into v1 because "it's easier to build it right the first time." The `ITelemetryExporter` abstraction is already defined — that's correct. But if the implementation starts accommodating multi-tenant schemas, auth tokens, or remote config endpoints "just in case," v1 complexity doubles with no user value.

**Why it happens:**
- The enterprise thesis is compelling and acquisition targets are already identified
- It feels wasteful to build something you'll "throw away" for the cloud tier
- The abstraction boundary (exporter interface) is already there, so it's tempting to build behind it

**Consequences:**
- v1 is delayed by features no local user needs
- Local-first promise is compromised if remote calls are added
- Complexity makes the product harder to debug and dogfood

**Warning signs:**
- Any remote HTTP call in the v1 codebase that isn't the MCP proxy itself
- Schema fields for `tenantId`, `teamId`, `userId` (beyond single-user context)
- Configuration options that require a server-side component to function

**Prevention:**
- Enforce the out-of-scope list from PROJECT.md as a strict veto: any PR/change touching cloud sync is deferred to post-validation
- The exporter abstraction is sufficient insurance — implement only `LocalSqliteExporter` until a paying enterprise customer requests otherwise
- Schedule a post-dogfood "enterprise tier planning" session only after the local free tier is validated

**Phase:** All phases. This is an ongoing discipline, not a one-time fix.

---

### Pitfall 8: Dashboard Shows No Data on First Launch

**What goes wrong:** The developer installs Bastion, opens the dashboard, and sees an empty state with no guidance. They don't know if Bastion is working, if hooks are active, or if they need to do something. They close the dashboard and never open it again.

**Why it happens:**
- Dashboard was built with mock data first; real-data wiring is deferred
- No "onboarding flow" — the product assumes the developer knows what it does
- Empty state UI is never designed, just left as "no items"

**Warning signs:**
- Dashboard shows sample data that doesn't match the running server's actual state
- No visible indicator of whether the hook server is connected and receiving events
- First-launch experience never tested against a fresh install

**Prevention:**
- Design the empty state explicitly: "Waiting for your first Claude Code session — run a tool call to see it here"
- Add a live connection indicator (WebSocket or polling) showing hook server status
- The "within 5 minutes" core value from PROJECT.md is the UX contract — test it on a fresh machine

**Phase:** Phase 1 (dashboard wiring). Empty state is not a v2 problem.

---

### Pitfall 9: Policy Engine Tested Against Happy Path Only

**What goes wrong:** The policy engine has unit tests for clear cases: "this is an AWS key, block it." It doesn't have tests for edge cases: what happens when a secret appears inside a multi-tool parallel invocation? What happens when `PostToolUseFailure` fires and the pre-tool hook already redacted the prompt? What happens with a 50KB context window?

**Why it happens:**
- Edge cases are discovered during real use, not invented during testing
- Parallel tool invocations are a Claude Code behavior not present in synthetic test scenarios
- Large prompt payloads are never tested because unit tests use minimal fixtures

**Warning signs:**
- Test fixtures are all < 1KB
- No test for concurrent hook invocations
- No test for `PostToolUseFailure` following a successful `PreToolUse` redaction
- No fuzz test for the regex engine against large inputs

**Prevention:**
- Add property-based or fuzz tests for the secret detection engine (e.g., with `fast-check`)
- Add a concurrent-invocation test: fire 10 hook requests simultaneously, assert all are handled correctly
- Use real Claude Code session logs (anonymized) as test fixtures, not handwritten ones
- Test against 100KB prompt payloads to verify regex performance doesn't degrade

**Phase:** Phase 1 (policy engine hardening). This is prerequisite to calling the security layer "production-ready."

---

## Minor Pitfalls

---

### Pitfall 10: `pnpm` Workspace Protocol Breaks CLI Packaging

**What goes wrong:** The CLI (`packages/cli`) depends on `@bastion/core` and `@bastion/edge` via `workspace:*`. If the CLI is ever packaged as a standalone binary (e.g., via `pkg` or `esbuild` bundle), the workspace protocol links are not resolved. The CLI works in the monorepo but fails when installed via `npm install -g bastion`.

**Prevention:**
- Test `npm pack` output from the CLI package early (Phase 1)
- Either bundle all dependencies into the CLI, or publish internal packages before publishing the CLI
- Do not defer CLI packaging to "right before launch" — it requires a build pipeline change

**Phase:** Phase 1 (CLI). Verify `npm install -g` works on a clean machine before calling install-hooks "done."

---

### Pitfall 11: Solo Founder Scope Creep via "While I'm In Here" Syndrome

**What goes wrong:** While fixing a bug in the policy engine, the founder notices the dashboard could use a better filter. While building the filter, they refactor the API. Three hours later, the original bug is still open. The ACTIVE requirements list never shrinks.

**Prevention:**
- Maintain a strict "current task" sticky note (or session file) — only one thing in progress at a time
- "While I'm in here" improvements go on a TODO list, not into the current branch
- The weekly measure is: did the number of ACTIVE requirements items decrease?

**Phase:** All phases. This is a process discipline, not a code change.

---

### Pitfall 12: Regex Catastrophic Backtracking in Secret Scanner

**What goes wrong:** A regex like `(sk-[a-zA-Z0-9+/]{20,})+` applied to a 50KB prompt can exhibit catastrophic backtracking, spiking CPU to 100% and blocking the hook response for seconds. This is a Node.js/V8 regex engine vulnerability, not theoretical.

**Prevention:**
- Audit all secret-detection regexes with a backtracking checker (e.g., `vuln-regex-detector` or manual analysis)
- Prefer linear-time regex constructs: anchored patterns, no nested quantifiers, possessive quantifiers where possible
- Add a timeout wrapper around regex execution: if scan exceeds 10ms, log a warning and pass through (fail open, not fail closed)

**Phase:** Phase 1 (secret detection). Verify before dogfood begins.

---

## Phase-Specific Warnings

| Phase Topic | Most Likely Pitfall | Mitigation |
|-------------|-------------------|------------|
| Edge server + hook integration | Hook latency from sync SQLite writes | Fire-and-forget writes; measure p99 in CI |
| Policy engine / secret detection | False positives on test data | Start with 5–8 high-precision patterns; fuzz test |
| CLI `install-hooks` | Overwriting existing hooks config | Merge, not replace; write backup |
| SQLite store | Duplicate server processes corrupting WAL | PID lockfile; `busy_timeout` pragma |
| MCP proxy | Protocol version assumptions breaking with SDK updates | Pin SDK; conformance test against real server |
| Dashboard wiring | Empty state on first launch | Design empty states; live connection indicator |
| Insights pipeline | Built before security layer is validated | Hard gate: no insights work until real finding caught |
| All phases | Enterprise feature contamination | Strict veto against out-of-scope items |

---

## Distribution Pitfalls

### Pitfall D1: Launching Before Dogfood Validates the Value Prop

**What goes wrong:** The founder ships to Product Hunt or posts on HN before catching a single real secret in their own Claude Code workflow. Early visitors try it, nothing catches in their session, they leave. The narrative "Bastion stopped a credential leak" has zero credibility without proof.

**Prevention:**
- The dogfood gate from PROJECT.md is the only launch criterion that matters: Bastion catches at least one real secret or dangerous command in daily use
- Collect the incident timestamp and redacted finding for the launch post — concrete proof

### Pitfall D2: The README Explains Architecture Instead of Value

**What goes wrong:** The first 200 words of the README describe the monorepo structure, Fastify, and SQLite. The developer who found Bastion via a CVE post doesn't know what it does for *them* in 30 seconds.

**Prevention:**
- README opens with: "Bastion blocked a secret from reaching Claude Code. Here's what it looked like." (screenshot)
- Architecture details go in `docs/`, not the README hero section

### Pitfall D3: Distribution Assumes Developers Will Find It

**What goes wrong:** A great tool is built, pushed to npm, and then "goes to market" by existing on npm. Developer tool distribution is earned through: writing about the problem publicly, being in the right Slack/Discord at the right time, and having a story tied to a CVE or incident people already know about.

**Prevention:**
- CVE-2025-6514 (mcp-remote, 437K devs) is the hook — the launch post must reference it explicitly
- Write the "how I secured my Claude Code workflow" post *before* launch, not after
- Target: MCP Discord, Claude Code beta community, platform engineering Slack groups

---

## Sources

- MCP specification changelog: `modelcontextprotocol/specification` GitHub releases (HIGH confidence)
- CVE-2025-6514 advisory for mcp-remote package (HIGH confidence)
- `better-sqlite3` WAL mode documentation and concurrent access behavior (HIGH confidence)
- Node.js regex backtracking analysis and `vuln-regex-detector` patterns (HIGH confidence)
- Developer tool adoption research (Stripe, Tailwind, Linear launch patterns) (MEDIUM confidence)
- Solo founder scope management patterns from Indie Hackers and build-in-public corpus (MEDIUM confidence)
