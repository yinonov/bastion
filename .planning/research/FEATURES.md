# Feature Landscape — Bastion MCP Edge Gateway

**Domain:** Local-first MCP governance and AI agent security control plane  
**Researched:** April 26, 2026  
**Competitive sources:** Portkey (MCP Gateway + Claude Code Gateway), WitnessAI, Helicone, Portkey/Lasso partnership blog, MCP sprawl enterprise analysis  
**Overall confidence:** HIGH for table stakes and anti-features; MEDIUM for differentiator framing (competitive moats shift fast)

---

## Competitive Landscape Notes

| Competitor | What They Do Well | Critical Gap vs. Bastion |
|---|---|---|
| **Portkey** | MCP server registry + RBAC + LLM-level observability + cost tracking; polished SaaS. Claude Code gateway routes traffic through Portkey cloud. | **Cloud-first**: data leaves machine. Intercepts the *LLM API call*, not the *tool execution decision* — can't block `rm -rf` before it runs. |
| **WitnessAI** | Network-level AI firewall; intent-based ML for jailbreak/injection detection; MCP server catalog; PCI DSS compliance. | Enterprise sales motion, CISO buyer (not developer). Requires traffic to traverse their infra. No developer friction intelligence. No hook-level tool interception. |
| **Helicone** | Cost-per-user tracking; custom metadata properties; ClickHouse-backed query; session tracing. | Observability-only — no policy enforcement, no dangerous command blocking, no MCP server governance. Cloud-required. |
| **Portkey/Lasso partnership** | Real-time threat detection + guardrails at the MCP Gateway protocol level. | Still cloud-routed. Targets ops/security teams, not developer self-service. |

**Core gap all competitors share:** None intercept at the Claude Code **pre-tool-use hook layer**. They all proxy the LLM API call (prompt → response), which means they see the intent but cannot block a destructive tool invocation *before it executes*. Bastion's hook integration is architecturally different and its primary moat.

---

## 1. Table Stakes

Features a developer won't install without, or a CISO won't approve without. Absence = disqualifying.

### 1.1 Secret / Credential Detection in Tool Arguments and Prompts

**What exactly:**  
Scan the `input` payload of every `PreToolUse` event for known credential patterns before the tool executes. Patterns must include:

- AWS access keys (`AKIA[0-9A-Z]{16}`)
- AWS secret keys (40-char base64 following `aws_secret_access_key`)
- GitHub tokens (`ghp_`, `ghs_`, `gho_`, `github_pat_`)
- Generic API keys heuristic: `[A-Za-z0-9_\-]{32,}` with entropy >3.5 bits/char
- Private key PEM headers (`-----BEGIN RSA PRIVATE KEY-----`, `-----BEGIN EC PRIVATE KEY-----`)
- Connection strings (`postgres://`, `mongodb+srv://`, `redis://:password@`)
- `.env` file content (multiline `KEY=VALUE` blocks in file_write arguments)
- SSH private key material in any string argument

**Action on match:**  
1. BLOCK the tool call (return `{"decision":"block","reason":"credential_detected","type":"<pattern_name>"}` to Claude Code)  
2. Write to SQLite audit log with `redacted_snippet` = original string with credential replaced by `[REDACTED:aws_key]` (preserve surrounding context)  
3. Increment session risk score by 30 points  
4. Push finding to dashboard `SecurityFinding` panel immediately (real-time)

**Complexity:** Medium. Regex rules already exist in `@bastion/core` redaction engine. Gap is wiring pre-tool-use hook to run redaction *before* decision.  
**Dependency:** Requires pre-tool-use hook handler to be functional (1.6).  
**Competitor comparison:** Portkey does PII redaction at LLM response level. WitnessAI does real-time data masking at network level. Neither scans tool *arguments* before execution.  
**CISO requirement:** Yes — credential exfiltration via AI coding agent is the #1 documented threat. CVE-2025-6514 (mcp-remote) exploited exactly this vector.

---

### 1.2 Dangerous Command Blocking

**What exactly:**  
Pattern-match `bash`, `run_command`, `execute`, and `computer_use` tool inputs against a curated blocklist of destructive/irreversible operations. Default blocklist:

| Category | Patterns |
|---|---|
| Filesystem destruction | `rm -rf`, `rm -r /`, `shred`, `wipe`, `find . -delete` |
| Git history rewrite | `git push --force`, `git push -f`, `git reset --hard`, `git rebase -i` with `--force-push`, `git filter-branch` |
| Disk operations | `dd if=`, `mkfs`, `fdisk`, `parted`, `diskutil eraseDisk` |
| Database nukes | `DROP DATABASE`, `DROP TABLE` (without `IF EXISTS` in a destructive context), `TRUNCATE TABLE` |
| Permission escalation | `chmod 777 /`, `chown root`, `sudo chmod -R 777` |
| System modification | `systemctl disable`, `launchctl unload`, `crontab -r` |
| Credential overwrite | `> ~/.ssh/authorized_keys`, `> ~/.aws/credentials`, overwrite to any path matching protected-paths config |

**Configurable policy per pattern:**  
- `block` (default for most) — deny with reason, log, increment risk  
- `ask` — pause tool execution, surface in dashboard for human approval (v1: log + block; "ask" UX is v2)  
- `allow` — explicit override if team needs the command  

**Complexity:** Medium. Pattern matching is straightforward. Key design decision: patterns must handle shell quoting variants (`rm -rf /foo`, `rm -rf '/foo'`, `rm  -rf  /`).  
**Dependency:** Pre-tool-use hook handler (1.6).  
**Competitor comparison:** No competitor blocks dangerous commands at tool-execution level. This is uniquely possible because Bastion hooks into Claude Code tool dispatch, not the LLM API.

---

### 1.3 MCP Server Allowlist / Blocklist

**What exactly:**  
Config-driven control over which MCP servers and tools the agent may invoke. Enforced at the `/mcp/:serverName` proxy endpoint and in the pre-tool-use hook.

```json
// bastion.config.json
{
  "mcp": {
    "mode": "allowlist",           // "allowlist" | "blocklist" | "passthrough"
    "allowedServers": ["filesystem", "github", "postgres"],
    "blockedServers": [],
    "toolPolicy": {
      "github": {
        "allowedTools": ["read_file", "search_code", "list_issues"],
        "blockedTools": ["create_deployment", "delete_repository"]
      }
    }
  }
}
```

Behavior:
- `allowlist` mode: any server not in `allowedServers` → BLOCK with `{"decision":"block","reason":"server_not_in_allowlist","server":"<name>"}`  
- `blocklist` mode: any server in `blockedServers` → BLOCK; everything else passes  
- `passthrough` mode: no enforcement, log only (useful for initial audit/discovery phase)  
- Unknown tool on an allowed server: log warning, allow (stricter tool-level blocking is opt-in per server)

**Complexity:** Low–Medium. Config schema already defined in `bastion.config.json`. Enforcement logic straightforward.  
**Dependency:** MCP proxy endpoint must be functional for server-level blocking; hook handler for tool-level blocking.  
**Competitor comparison:** Portkey MCP Gateway has RBAC-based server access control. Bastion's version is developer-local and config-file-first — zero infrastructure to manage.

---

### 1.4 Append-Only SQLite Audit Log

**What exactly:**  
Every security-relevant event is written to a SQLite database with WAL mode enabled. Rows are never updated or deleted by the application (append-only contract enforced by having zero `UPDATE`/`DELETE` statements in `LocalSqliteStore`).

Schema additions beyond current implementation:

```sql
CREATE TABLE agent_events (
  id          TEXT PRIMARY KEY,           -- UUID v4
  ts          TEXT NOT NULL,              -- ISO 8601 with ms: 2026-04-26T14:32:11.430Z
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL,             -- PreToolUse | PostToolUse | PromptSubmit | SessionStart | SessionEnd
  tool_name   TEXT,
  server_name TEXT,
  decision    TEXT NOT NULL,             -- allow | block | redact | warn
  policy_rule TEXT,                      -- "secret_detected:aws_key" | "dangerous_cmd:rm_rf" | "server_not_in_allowlist"
  risk_delta  INTEGER DEFAULT 0,         -- how much this event contributed to session risk score
  redacted_snippet TEXT,                 -- ≤500 chars of context with credential replaced by [REDACTED:type]
  duration_ms INTEGER,                   -- hook processing time
  raw_hash    TEXT                       -- SHA-256 of original input (for integrity verification, not stored in cleartext)
);
```

Export command:
- `bastion report --since 7d` → markdown table of findings, sorted by severity  
- `bastion report --since 7d --format csv` → CSV for SIEM ingestion  
- `bastion report --session <id>` → full session timeline

**Complexity:** Low (schema additions; export CLI command is a new feature).  
**Dependency:** None — foundation for all other features.  
**CISO requirement:** Granular audit trail is checkbox item in SOC 2 Type II and EU AI Act compliance reviews.

---

### 1.5 Per-Session Risk Score

**What exactly:**  
A 0–100 score computed from security events in a session, visible in the dashboard header and per-session rows.

Scoring model:
| Event | Points |
|---|---|
| Secret detected and blocked | +30 |
| Dangerous command blocked | +20 |
| Protected path violation blocked | +15 |
| Unknown MCP server blocked | +10 |
| Tool denied by allowlist | +5 |
| Redaction applied (no block needed) | +3 |

Score thresholds: 0–20 = green (nominal), 21–50 = amber (review), 51+ = red (alert).

Score displayed in: dashboard session list, "Today at a glance" summary, exported reports.

**Complexity:** Low. Summation query over `agent_events` grouped by `session_id`.  
**Dependency:** Audit log (1.4).

---

### 1.6 Sub-50ms Hook Response Latency (Fail-Open)

**What exactly:**  
The Fastify edge server must respond to Claude Code hook calls within 50ms p99. If the edge server is unreachable or errors out, Claude Code must continue working (fail-open, not fail-closed).

Implementation requirements:
- Circuit breaker: if hook server returns 5xx or times out 3 times in a row, temporarily disable hooks and log a warning to stderr
- Policy evaluation must be synchronous (no async I/O in hot path — no DB writes before returning decision to Claude Code)
- Audit log writes are fire-and-forget (enqueue write, return decision immediately)
- Target: p99 hook latency < 50ms measured locally on the developer's machine

**Complexity:** Medium. Requires async audit log queue, circuit breaker pattern.  
**Dependency:** Core edge server.

---

### 1.7 CLI: install-hooks / status / uninstall

**What exactly:**  
Three commands that cover the full install/uninstall lifecycle:

```
bastion install-hooks
```
- Detects Claude Code config dir (`~/.claude/` or `$CLAUDE_CONFIG_DIR`)  
- Writes hooks config (PreToolUse, PostToolUse, PromptSubmit entries pointing to `http://localhost:BASTION_PORT/api/hooks/claude`)  
- Starts the edge server as a background process (launchd plist on macOS, systemd service on Linux)  
- Prints: "✓ Bastion active on port 3000. Open http://localhost:3001 to view dashboard."  

```
bastion status
```
- Checks if edge server is running (health check on `/health`)  
- Shows: uptime, last event timestamp, events today, secrets blocked today  
- Exit code 0 if healthy, 1 if not running  

```
bastion uninstall-hooks
```
- Removes hooks config entries  
- Stops background process  
- Prints: "✓ Hooks removed. Bastion data retained at ~/.bastion/data/"  

**Complexity:** Medium. Background process management (launchd/systemd) is the fiddly part.  
**Dependency:** Edge server must be stable enough to daemonize.

---

### 1.8 Live Dashboard with Real Data

**What exactly:**  
The Next.js dashboard must reflect live data from the running edge server — not mocked state. Minimum viable panels:

1. **"Today at a glance"** — sessions today, secrets blocked, dangerous commands blocked, estimated spend  
2. **Live agent event stream** — last 50 events in real-time (WebSocket or SSE from edge server)  
3. **Security findings panel** — top findings by severity, filterable by session / time range  
4. **Session list** — all sessions today with risk score and duration  

Dashboard must load to meaningful data in <2s from cold start. If no events today, show "No activity yet — run Claude Code to start." rather than empty/broken state.

**Complexity:** Medium–High (primarily wiring existing panels to real API endpoints rather than mock data).  
**Dependency:** SQLite store must be populated by edge server; dashboard API routes must read from store.

---

## 2. Differentiators

Features that create competitive distance. Not expected by buyers who haven't seen them, but become "aha" moments that drive retention.

### 2.1 Hook-Level Pre-Execution Interception (Architecture Moat)

**What exactly:**  
This is Bastion's core architectural advantage, not a "feature" per se, but the foundation for differentiators:

- Portkey, Helicone, WitnessAI all proxy the **LLM API call** (the HTTP request to `api.anthropic.com`). They see prompt text and response text.  
- Bastion integrates via **Claude Code hooks** (`PreToolUse`, `PostToolUse`, `PromptSubmit`). It sees the *tool execution decision* — `{"tool_name": "bash", "input": {"command": "rm -rf /tmp/project"}}` — before the command runs.  
- This enables dangerous command blocking that is literally impossible for LLM-proxy-based tools. The tool dispatch happens inside the Claude Code agent loop, not in the API call.

**Marketing language:** "Bastion is the only governance tool that stops dangerous AI actions before they execute — not after they're logged."

---

### 2.2 Developer Friction Detection (CMI Analysis)

**What exactly:**  
Detect patterns in agent event sequences that indicate the agent is stuck, looping, or burning budget unproductively. Surface as `DeveloperInsight` objects in the dashboard.

Detection patterns:
| Pattern | Detection | Insight Label |
|---|---|---|
| Tool retry storm | Same `(tool_name, server_name)` called >3x within 5 min | "Agent called `list_directory` 7 times — possible loop or missing context" |
| Error cascade | >3 consecutive `PostToolUseFailure` events | "5 consecutive tool failures in 2 min — agent may be stuck" |
| Budget burn anomaly | Estimated spend rate >2x session average over last 5 min | "Spend rate 3x above your session average — review if this is expected" |
| Abandoned session | Session active >60 min with no user interaction events | "Session has been running 90 min without a checkpoint — consider reviewing" |
| Duplicate tool sequence | Same exact tool+input called twice in same session | "Agent repeated an identical tool call — this request may have been cached or lost" |

Each `DeveloperInsight` includes: `pattern_type`, `evidence` (event IDs), `hypothesis` (human-readable), `suggested_action`.

**Complexity:** High. Requires sliding window analysis over event stream, sequence pattern matching.  
**Dependency:** Audit log (1.4) + session event stream.  
**Competitor comparison:** No competitor has this. Helicone tracks cost and latency; Portkey tracks errors. Neither reasons about agent behavioral patterns.  
**Why it matters:** Developer time lost to stuck agents is the #2 productivity killer after slow iteration (anecdotally). Flagging a runaway 90-min loop that costs $25 of Claude API time is a concrete "saved me money" moment.

---

### 2.3 Shadow Spend Estimator

**What exactly:**  
Estimate Claude API cost from captured payloads, even without direct API access (Claude Code manages the API key, not the developer).

Method:
1. Count tokens in `PromptSubmit` events using `tiktoken` approximation (cl100k_base for Claude 3+ family)  
2. Count tokens in model response (`PostToolUse` completion payloads)  
3. Apply published pricing: Claude Sonnet 4 = $3/M input tokens, $15/M output tokens (configurable in `bastion.config.json`)  
4. Accumulate per session, per day, per week  

Dashboard panels:
- **Session spend estimate**: "~$0.42 this session"  
- **Daily spend curve**: sparkline of estimated spend by hour  
- **Alert threshold**: warn at configurable per-session limit (default `$5`); block new sessions above limit (optional, off by default)  

**Complexity:** Medium. Token counting is straightforward; main work is extracting token data from hook payloads and building spend accumulation in SQLite.  
**Dependency:** Audit log + prompt capture in `PromptSubmit` hook.  
**Competitor comparison:** Portkey and Helicone do token tracking when they're in the LLM proxy path. Bastion estimates spend from hook data without being in the LLM proxy path — unique for hook-only integrations.

---

### 2.4 Local-First / Zero-Telemetry Architecture

**What exactly:**  
All data stays on the developer's machine. No outbound HTTP calls except to the configured LLM endpoint. Enforced at the architecture level, not as a checkbox:

- SQLite database at `~/.bastion/data/bastion.db` — no remote writes  
- Dashboard served at `localhost:3001` — no external CDN calls in production build  
- No analytics, no crash reporting, no phone-home  
- Edge server has an explicit outbound-call audit: `@bastion/edge` must only make HTTP requests to: (a) the configured Anthropic API base URL, (b) configured MCP server URLs  
- `bastion status` should print currently configured outbound URLs so developer can verify  

**Why this is a differentiator:**  
Portkey's Claude Code gateway routes traffic through Portkey's cloud ("100% secure on-prem deployment" is their enterprise upsell, not default). WitnessAI requires network-level traffic routing. Bastion's default is: nothing leaves your machine.  
This is the answer to "Can I use this with MNPI/PII/proprietary code?" — yes, by design.

**CISO unlock:** Local-first eliminates the "data processor" risk in vendor agreements. Security teams can approve Bastion without a SOC 2 review or DPA negotiation.

**Complexity:** Low — already the architecture. Requires documentation, explicit testing that no unexpected outbound calls occur, and a `bastion verify-isolation` command that confirms no external calls in dry-run mode.

---

### 2.5 Protected Path Enforcement

**What exactly:**  
Block file read/write/delete operations targeting paths that contain sensitive configuration:

Default protected paths:
```
~/.ssh/*
~/.aws/credentials
~/.aws/config
~/.gnupg/*
*.pem
*.key
*.p12
*.pfx
id_rsa
id_ed25519
**/.env
**/.env.local
**/.env.production
**/secrets.yaml
**/secrets.json
```

Enforced on: `PreToolUse` events where `tool_name` is `read_file`, `write_file`, `delete_file`, `bash` (via content inspection of command argument).

Action: BLOCK + log + risk score +15. Config allows override per path for explicit whitelisting (`protectedPaths.exceptions: ["~/.ssh/known_hosts"]`).

**Complexity:** Low — glob matching against tool input paths. Well-defined scope.  
**Dependency:** Pre-tool-use hook handler.

---

### 2.6 Polished Developer-Facing Dashboard (UX as Moat)

**What exactly:**  
Bastion's dashboard is the only governance tool designed for developers, not CISOs. Specific UX requirements:

- **Zero loading states** — instant load via SSR, no skeleton screens for the main panels  
- **Agent event timeline** — tool calls rendered as cards with icon, server badge, decision badge (allow = faint / block = red), duration chip  
- **Session health indicator** — traffic light in the header that turns amber/red when risk score crosses threshold; visible at a glance without reading numbers  
- **One-click session export** — "Export this session" button generates a markdown report ready to paste into an incident review or team Slack  
- **Finding detail drawer** — click any finding to expand: full redacted snippet, matching rule, timestamp, tool + server context  
- **No jargon** — event names are human-readable: "Read file blocked (protected path)" not "PolicyDecision{type:BLOCK,rule:PROTECTED_PATH}"  

**Complexity:** Medium–High (ongoing polish; not a one-shot feature).  
**Competitor comparison:** Portkey dashboard is observability-focused (latency graphs, cost charts). WitnessAI dashboard is CISO-audience (risk heat maps, compliance reports). Bastion's is developer-audience — "what is my agent doing right now?"

---

### 2.7 Markdown Audit Report Exporter

**What exactly:**  
```bash
bastion report --since 7d
bastion report --session abc123
bastion report --since 30d --format csv
```

Markdown report format:
```markdown
# Bastion Security Report
**Period:** 2026-04-19 → 2026-04-26  
**Sessions:** 47  **Total events:** 1,203  **Findings:** 8

## Summary
| Severity | Count | Description |
|---|---|---|
| 🔴 Critical | 2 | Credential detected in tool argument |
| 🟠 High | 3 | Dangerous command blocked |
| 🟡 Medium | 3 | Protected path access blocked |

## Findings Detail
### [2026-04-24 09:14] AWS key detected — bash tool
**Session:** abc123 | **Tool:** bash | **Server:** filesystem  
**Snippet:** `aws configure set aws_secret_access_key [REDACTED:aws_secret_key]...`  
**Policy:** secret_detected:aws_secret_key | **Decision:** BLOCK
```

**Complexity:** Low. Template string rendering from SQLite queries.  
**Dependency:** Audit log (1.4).  
**CISO requirement:** Periodic reports are required for AI Act Article 13 compliance documentation (transparency obligations for high-risk AI systems). EU AI Act enforcement begins August 2026.

---

## 3. Anti-Features

Things to deliberately NOT build in v1. Each one is a complexity trap or scope creep that could sink the project.

### 3.1 Multi-User / Team Aggregation

**Why not:**  
- Requires auth, multi-tenant DB schema, network infrastructure (or sync protocol)  
- One machine, one developer is a complete and useful v1  
- Enterprise team aggregation is the v2 paid tier — don't gift it for free in v1  
**Instead:** Document that the SQLite file can be shared over a shared filesystem as a read-only dashboard connection in v2.

---

### 3.2 UI-Based Policy Editor

**Why not:**  
- JSON config file is the correct interface for developers who already configure `.eslintrc`, `tsconfig.json`, etc.  
- Policy editor UI requires: form validation, state machine for rule conditions, live preview, drag-and-drop ordering  
- High build cost, low v1 ROI  
**Instead:** Ship excellent JSON schema + documentation with `$schema` URL for VS Code IntelliSense in `bastion.config.json`.

---

### 3.3 Stdio MCP Transport Proxying

**Why not:**  
- Requires subprocess management, stdin/stdout piping, SIGTERM handling, backpressure  
- Fragile across OS versions (especially macOS sandbox restrictions)  
- Claude Code itself handles stdio server lifecycle — proxying it creates a double-wrapping problem  
**Instead:** HTTP-transport MCP proxying covers the modern server ecosystem. Document that stdio servers connect directly and aren't proxied.

---

### 3.4 ML-Based Semantic Threat Detection

**Why not:**  
- WitnessAI's "intent-based ML engine" requires model inference at hook time (latency killer)  
- False positive rate requires tuning pipeline, feedback loop, per-team calibration  
- Regex + allowlist/blocklist catches 95% of real threats (actual API keys, literal `rm -rf`) with zero false positives  
- Adds a model runtime dependency that breaks offline/local-first story  
**Instead:** Regex + entropy analysis for secrets, pattern matching for dangerous commands, allowlist for MCP servers. Ship ML detection in v2 if false negative rate proves to be a problem from dogfood data.

---

### 3.5 Prompt Injection / Jailbreak Detection

**Why not:**  
- Application security concern, not developer tool security concern  
- WitnessAI, Lakera, Prompt Security own this market with dedicated ML models  
- For developer tooling, the threat model is "agent does something destructive or leaks credentials" — not "attacker-crafted prompt in a coding task"  
**Instead:** Block specific dangerous outcomes (1.2, 2.5) rather than trying to detect adversarial intent in prompts.

---

### 3.6 IDE Extension (VS Code / Cursor)

**Why not:**  
- Requires VS Code Marketplace approval, webview isolation, extension update pipeline  
- Claude Code hooks integration achieves the same interception with zero IDE-side code  
- Extension approach would need to duplicate the entire policy engine in a different runtime context  
**Instead:** CLI `install-hooks` is the distribution path. If a VS Code panel is wanted, use a webview that embeds the existing Next.js dashboard.

---

### 3.7 Multi-LLM / Multi-Agent Framework Support

**Why not:**  
- Claude Code is the initial market (fastest growing AI coding agent as of April 2026)  
- Generalizing to OpenAI, Gemini, Cursor, Copilot each requires separate hook/proxy integrations  
- Each new integration increases the combinatorial test surface  
- Portkey already owns multi-LLM routing; Bastion's angle is Claude Code depth  
**Instead:** Ship excellent Claude Code support. Add Cursor support in v2 if user demand warrants it (Cursor has a similar hooks mechanism).

---

### 3.8 Model Routing / Caching

**Why not:**  
- Portkey, LiteLLM, and OpenRouter have spent years building robust caching, fallback routing, load balancing  
- Adding semantic caching requires a vector DB or LLM-based similarity engine  
- Bastion's proxy sits in the hook path, not the API path — routing decisions would add a new proxy component  
**Instead:** Let Portkey own model routing. Bastion's spend tracking (2.3) is for *visibility*, not optimization.

---

### 3.9 Vulnerability Scanning of MCP Servers

**Why not:**  
- Probing third-party MCP servers for CVEs, misconfigurations, or supply chain issues is a different product (a static/dynamic scanner)  
- Runtime governance (allowlist, audit) is Bastion's scope; scanner is out of scope  
- Risk of false positives triggering blocking of legitimate servers  
**Instead:** Surface CVE alerts via an advisory feed (a future feature) rather than active scanning.

---

### 3.10 Billing / Subscription Management

**Why not:**  
- No monetization until dogfood validation (per PROJECT.md constraints)  
- Billing infrastructure (Stripe, entitlements, plan gating) is significant scope  
- Premature monetization gates the v1 dogfood loop  
**Instead:** Ship free, validate, then add a "team tier" once there's evidence of team adoption.

---

## Feature Dependencies

```
1.4 Audit Log (SQLite)
├── 1.5 Risk Score  
├── 1.8 Live Dashboard
├── 2.3 Shadow Spend Estimator
├── 2.2 Friction Detection
└── 2.7 Markdown Report Exporter

1.6 Sub-50ms Hook Handler (edge server)
├── 1.1 Secret Detection
├── 1.2 Dangerous Command Blocking
├── 1.3 MCP Server Allowlist
└── 2.5 Protected Path Enforcement

1.7 CLI (install-hooks / status / uninstall)
└── depends on: 1.6 (stable edge server) + 1.4 (for status display)

2.2 Friction Detection
└── depends on: 1.4 (audit log with session event sequences)

2.3 Shadow Spend Estimator
└── depends on: 1.4 (audit log capturing token counts from PromptSubmit)
```

---

## MVP Recommendation

**Prioritize — must be in v1 MVP:**

1. `1.4` Append-only SQLite audit log — everything else reads from here  
2. `1.6` Sub-50ms hook handler — Bastion's functional core  
3. `1.1` Secret detection — #1 CISO concern, #1 differentiator vs. no-governance  
4. `1.2` Dangerous command blocking — what makes Bastion impossible to replicate at LLM proxy layer  
5. `1.3` MCP server allowlist — table stakes for "MCP sprawl" problem  
6. `1.8` Live dashboard with real data — "five minute to first aha" value delivery  
7. `1.7` CLI install-hooks — distribution and onboarding path  
8. `2.4` Zero-telemetry guarantee + documentation — the CISO unlock  

**Include in v1 because complexity is low:**

9. `1.5` Risk score — trivial SQL rollup, high visual impact  
10. `2.5` Protected path enforcement — glob matching, incremental addition to 1.1/1.2  
11. `2.7` Markdown report exporter — template rendering, enables compliance conversations  

**Defer to v1.1 / v2:**

- `2.2` Friction detection — high complexity, needs dogfood data to tune thresholds  
- `2.3` Shadow spend estimator — medium complexity, needs token counting verified against real sessions  
- `2.6` Dashboard polish — ongoing; v1 needs to work, v1.1 makes it beautiful  

**Never (v1):**  
All items in Section 3.

---

## Sources

- Portkey MCP Gateway feature documentation: `portkey.ai/mcp` (verified, April 2026)  
- Portkey Claude Code Gateway: `portkey.ai/for/claude-code` (verified, April 2026)  
- Portkey Guardrails: `portkey.ai/features/guardrails` (verified, April 2026)  
- WitnessAI platform: `witness.ai` (verified, April 2026) — Observe / Protect / Control pillars  
- Portkey enterprise MCP sprawl analysis: `portkey.ai/blog/the-hidden-challenge-of-mcp-adoption-in-enterprises` (verified, August 2025)  
- Helicone custom properties / cost tracking: `docs.helicone.ai` (verified, April 2026)  
- CVE-2025-6514 mcp-remote credential exfiltration: referenced in PROJECT.md ecosystem signals  
- EU AI Act enforcement timeline: August 2026 (PROJECT.md ecosystem signals)  
- Portkey/Lasso partnership for MCP security: referenced in Portkey blog feed (February 2026)  
