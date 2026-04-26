# Technology Stack — Bastion

**Project:** Bastion MCP Edge Gateway  
**Researched:** April 26, 2026  
**Node version in use:** v22.14.0 (LTS)

---

## Recommended Stack

### Core Runtime & Toolchain

| Technology | Version | Purpose | Confidence |
|---|---|---|---|
| Node.js | 22.14.0 (LTS) | Runtime | HIGH |
| TypeScript | ^5.8.3 | Type safety throughout | HIGH |
| pnpm workspaces | ≥9.x or 10.x | Monorepo package management | HIGH |
| tsx | ^4.19.3 | Dev-time TS execution without compile | HIGH |

**Upgrade note:** `package.json` pins `"packageManager": "pnpm@8.5.0"` but pnpm 10.x is current (10.33.2 at time of writing). pnpm 8.x vs 9.x/10.x is not blocking, but the field should be bumped to avoid version mismatch warnings in CI. pnpm 9+ improves workspace protocol resolution and lockfile v9 format.

---

### MCP Layer

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `@modelcontextprotocol/sdk` | ^1.29.0 | Official TypeScript MCP SDK | HIGH |

**How Bastion should use the SDK — and what it should NOT do:**

Bastion is an **HTTP proxy and policy interceptor**, not an MCP server in the traditional sense. The architecturally correct approach is:

1. **For the `/mcp/:serverName` proxy endpoint**: Forward raw HTTP (JSON-RPC bodies) using `fetch()` or `@fastify/reply-from`. Do NOT instantiate an MCP `Server` class and rebuild protocol messages — that adds overhead, changes message framing, and breaks streaming. The project's current raw-proxy approach is correct.

2. **For `@modelcontextprotocol/sdk` use cases in Bastion**: The SDK is appropriate if Bastion itself needs to expose MCP tools (e.g., a `bastion://policy` tool endpoint for Claude Code to query current policy state). For this, use `StreamableHTTPServerTransport` from the SDK — it implements the 2025-03-26 spec transport that replaced SSE.

3. **For parsing incoming MCP JSON-RPC**: Import the Zod schemas from the SDK (`CallToolRequestSchema`, `ListToolsRequestSchema`, etc.) to validate that proxied traffic is well-formed before forwarding.

**Key 2025–2026 MCP spec features in v1.29.0:**
- **Streamable HTTP transport** (replaced SSE, spec 2025-03-26): Single `/mcp` POST endpoint with optional server-sent events streaming. This is what Claude Code uses in HTTP mode.
- **OAuth 2.1 authorization**: Built into the SDK via `jose ^6.1.3`. The `OAuthClientProvider` handles PKCE + token refresh. Relevant when proxying authenticated MCP servers.
- **Experimental tasks**: Long-running async tool calls that return progress updates. SDK exports `@modelcontextprotocol/sdk/experimental/tasks`.

**Watch:** `@modelcontextprotocol/fastify@2.0.0-alpha.2` — an official Fastify middleware adapter for MCP is in alpha. When it stabilizes (v2 GA), use it to expose Bastion's own policy tools endpoint cleanly. Do not adopt for v1 MVP.

**Do NOT use:**
- `@modelcontextprotocol/server` / `@modelcontextprotocol/node` (v2 alpha packages) — unstable API, will have breaking changes before GA.
- Building a full MCP server to front the proxy — adds message parsing overhead and breaks streaming.

---

### Edge Server (Proxy + Hook Receiver)

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `fastify` | ^5.2.1 | HTTP server for hook receiver + MCP proxy | HIGH |
| `@fastify/reply-from` | ^10.x | HTTP reverse proxy plugin (`reply.from()`) | HIGH |
| `@fastify/cors` | ^10.x | CORS for dashboard API requests | MEDIUM |

**Why Fastify 5:**  
Fastify 5 dropped legacy Node 16 support, has excellent TypeScript types, native JSON schema validation via ajv, and the lowest overhead of any Node HTTP framework. For the <50ms hook latency target, it outperforms Express (~3x throughput on JSON workloads).

**Critical gap:** The current edge server uses manual `fetch()` for upstream proxying (see `server.ts` lines 90–134). This works but doesn't handle streaming responses, connection pooling, or large body forwarding correctly. `@fastify/reply-from` provides:
- Automatic header forwarding
- Connection pooling via undici
- Streaming response passthrough (critical for SSE/streamable HTTP MCP servers)
- Timeout configuration per upstream

```ts
import replyFrom from '@fastify/reply-from'

await app.register(replyFrom, {
  base: undefined, // per-request base URL
  undici: { connections: 4, pipelining: 1 }
})

// In route handler:
return reply.from(`${server.url}${request.url}`, {
  rewriteRequestHeaders: (req, headers) => ({
    ...headers,
    'x-bastion-policy': 'allowed'
  })
})
```

**Do NOT use:**
- `http-proxy-middleware` (Express-specific)
- `node-http-proxy` (unmaintained since 2020)
- Raw `fetch()` for proxying streaming MCP responses — it buffers the full response body before forwarding.

---

### Local Storage

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `node:sqlite` (built-in) | Node 22.5+ | SQLite edge buffer | HIGH |

**The project already made the right call here.** `node:sqlite` (`DatabaseSync`) is the correct choice for Bastion over `better-sqlite3`.

**`node:sqlite` vs `better-sqlite3` decision:**

| Criterion | `node:sqlite` | `better-sqlite3` |
|---|---|---|
| Native compilation | None — bundled with Node | node-gyp required, CI matrix hell |
| ESM compatibility | Native — no CJS wrapper needed | CJS-first, requires workarounds with ESM |
| API parity | ~80% of `better-sqlite3` API | Full-featured, transactions, WAL |
| Stability (Node 22) | Stability: 1 (Experimental) | Stable (15+ years, 2M+ weekly downloads) |
| Stability (Node 25) | **Stability: 1.2 (Release candidate)** | n/a |
| Zero-dep install | Yes | No (native binary per platform) |
| WAL mode | Yes (`PRAGMA journal_mode=WAL`) | Yes |

**Verdict:** For a local-first developer tool installed via `npm install -g`, zero native compilation dependency is a hard requirement. `better-sqlite3` fails on machines without build tools (common on macOS without Xcode CLI tools, Windows without VS Build Tools). `node:sqlite` installs everywhere Node is installed.

The "experimental" warning on Node 22 is acceptable — the project already suppresses it in the CLI. The API is stable enough (added July 2024, Release Candidate by April 2026 on Node 25). The only missing feature vs `better-sqlite3` is transactions (`db.transaction()` helper) — use `BEGIN/COMMIT` SQL directly.

**One gap to address:** Enable WAL mode for concurrent dashboard reads while the edge server writes:
```ts
this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;');
```

**Do NOT use:**
- `better-sqlite3` — native compilation, ESM complications
- `@databases/sqlite` — wraps better-sqlite3
- `sql.js` — in-memory only, not persistent
- `drizzle-orm` with SQLite — unnecessary ORM abstraction for simple event log queries

---

### Schema Validation

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `zod` | ^3.24.2 (current) or ^4.3.6 | Runtime type validation, shared schemas | HIGH |

**Zod v3 vs v4:**  
Zod v4.3.6 is current. The MCP SDK v1.29.0 accepts `"zod": "^3.25 || ^4.0"` as peer dependencies. Zod v4 is ~14× faster on parsing, significantly smaller bundle, and has better TypeScript inference. Breaking changes are minimal for `z.object`, `z.string`, `z.array` usage patterns — which is all Bastion uses.

**Recommendation:** Upgrade to Zod v4 when doing the next feature phase. Do not mix v3 and v4 in the same monorepo. Verify `@bastion/core` schema exports (AgentEventSchema, etc.) work after upgrade with a simple `pnpm add zod@4` + type-check pass.

---

### Dashboard

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `next` | ^15.2.4 | App Router, React Server Components | HIGH |
| `react` + `react-dom` | ^19.0.0 | UI runtime | HIGH |
| `tailwindcss` | ^3.4.17 | Utility CSS | HIGH |
| `shadcn/ui` (via `shadcn` CLI) | ^4.5.0 CLI | Component primitives (Radix UI + Tailwind) | HIGH |
| `lucide-react` | ^0.468.0 | Icons (already installed, shadcn default) | HIGH |
| `clsx` + `tailwind-merge` | current | Class merging (already installed) | HIGH |
| `recharts` | ^2.13.x | Charts (sparklines, spend trends) | MEDIUM |

**Tailwind v3 vs v4:**  
Tailwind v4 is a major rewrite (CSS-first config, no `tailwind.config.js`, different plugin system). Do not migrate to v4 during active development — the breaking changes are significant and Next.js ecosystem support for v4 is still maturing. Stay on v3.4.x.

**shadcn/ui:**  
Not yet installed in the project. The dashboard uses custom Tailwind classes. Adding shadcn/ui would provide:
- Accessible Radix UI primitives (Dialog, Tooltip, DropdownMenu, Sheet)
- Consistent component API that works with existing Tailwind tokens
- Table, Badge, Card, ScrollArea components for the events/findings panels

Install path:
```bash
cd apps/dashboard
pnpm dlx shadcn@latest init  # Use "custom" theme, match existing ink/panel tokens
pnpm dlx shadcn@latest add table badge card tooltip scroll-area tabs dialog
```

**Do NOT use `shadcn/ui` if the dashboard's custom design tokens (ink, panel, cyan, amber) are non-negotiable** — shadcn themes are HSL-variable-based and require mapping. The mapping is straightforward but requires one setup pass.

**Do NOT use:**
- `@tremor/react` — opinionated dashboard kit, conflicts with custom design system
- `@mui/material` — too heavy, wrong aesthetic for developer tools
- Pages Router — App Router is correct, don't regress

---

### Testing

| Library | Version | Purpose | Confidence |
|---|---|---|---|
| `node:test` (built-in) | Node 22+ | Unit tests (current approach) | HIGH |
| `vitest` | ^4.1.5 | Alternative — better DX for TS ESM monorepos | HIGH |

**node:test vs vitest — the honest comparison:**

The project currently uses `tsc && node --test "dist/**/*.test.js"`. This works for CI correctness but has DX friction:

| Criterion | `node:test` | `vitest` |
|---|---|---|
| Run `.ts` directly | No — must compile first | Yes — via esbuild |
| Watch mode | Basic | Excellent |
| ESM support | Native | Native (via Vite) |
| Snapshot testing | No | Yes |
| Coverage | `--experimental-test-coverage` | `--coverage` via v8 |
| Parallel worker threads | Limited | Built-in |
| monorepo filter | Manual | `--project` flag |
| Install weight | None | ~40MB |

**Recommendation:** For the current MVP phase (small test count, compile-check approach), **stay on `node:test`**. It has zero install weight and enforces that tests are compiled TypeScript (which validates the build pipeline). Switch to vitest when:
- Test count exceeds ~50 tests and watch mode becomes important
- You want to test `.ts` source directly without a compile step
- You need snapshot tests for policy evaluation output

If switching to vitest, use this configuration for ESM TypeScript:
```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: { globals: false, include: ['src/**/*.test.ts'], environment: 'node' }
})
```

Add `"test": "vitest run"` to each package's `package.json`. The `node:test` → vitest migration is mechanical — `test('...', () => {})` is compatible, `assert.*` replaces with `expect()`.

**Do NOT use:**
- Jest — ESM support remains second-class, requires `--experimental-vm-modules`, transform config overhead
- Mocha/Chai — legacy, no built-in TypeScript, extra config surface

---

## What NOT to Use

| Technology | Reason |
|---|---|
| `better-sqlite3` | Native binary, ESM complications, node-gyp on install. `node:sqlite` is the correct choice for a global CLI tool. |
| `drizzle-orm` / `prisma` | ORM overhead for simple append-only event log queries is unnecessary. Raw prepared statements are faster and simpler. |
| `express` | Lower throughput than Fastify for high-frequency hook calls. No TypeScript-native types. |
| `hono` | Correct for Cloudflare Workers/edge; adds complexity for a local Node 22 server with no cloud deployment. |
| Jest | ESM support requires `--experimental-vm-modules`. Configuration overhead not justified for this codebase. |
| Tailwind v4 | Major breaking changes, Next.js ecosystem support not mature. Migrate in v2 milestone. |
| `@modelcontextprotocol/server` v2 alpha | Pre-release, breaking API changes expected. Pin to `@modelcontextprotocol/sdk@^1.29.0`. |
| `mcp-proxy` npm package | Third-party, less maintained than building directly on the SDK's transport layer. |
| `socket.io` | WebSockets are not needed; SSE via Next.js API route or Fastify plugin is sufficient for live event streaming to dashboard. |

---

## Versions Pinned / Validated

```json
{
  "node": "22.14.0",
  "@modelcontextprotocol/sdk": "^1.29.0",
  "fastify": "^5.2.1",
  "@fastify/reply-from": "^10.0.0",
  "zod": "^3.24.2",
  "next": "^15.2.4",
  "react": "^19.0.0",
  "tailwindcss": "^3.4.17",
  "typescript": "^5.8.3",
  "tsx": "^4.19.3",
  "lucide-react": "^0.468.0"
}
```

---

## Gaps / Risks

| Risk | Severity | Notes |
|---|---|---|
| `node:sqlite` experimental flag in Node 22 | LOW | Acceptable for local tool; warning suppressed in CLI; API is stable. Upgrades to Node 24+ remove the concern entirely (Stability 1.2). |
| MCP SDK v2 alpha split packages | LOW | v1.x is stable. v2 will require adapter updates when it GAs. No action needed for v1 MVP. |
| Tailwind v4 migration debt | MEDIUM | Every major Tailwind release is a rewrite. Budget a full day for migration in a future milestone before it becomes mandatory. |
| Missing `@fastify/reply-from` for streaming MCP proxy | HIGH | Current `fetch()`-based proxy buffers response bodies, breaking streaming MCP servers. Add `@fastify/reply-from` before activating the MCP proxy for production use. |
| pnpm version mismatch | LOW | System pnpm v8.1.0, package.json pins `pnpm@8.5.0`, latest is v10.x. Update `packageManager` field to `pnpm@10.33.2` to avoid drift. |

---

## Sources

- `@modelcontextprotocol/sdk` npm registry: v1.29.0 (verified April 2026)
- `@modelcontextprotocol/fastify` pre-release: [github.com/modelcontextprotocol/typescript-sdk/releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)
- Node.js `node:sqlite` docs: [nodejs.org/api/sqlite.html](https://nodejs.org/api/sqlite.html) — Stability 1.2 Release Candidate
- Node.js 22.5.0 release notes: introduced `node:sqlite` module
- Fastify v5 changelog: drops Node 16, full Node 22 support
- Vitest v4.1.5 / v5.0.0-beta.1 npm registry (verified April 2026)
- Next.js v15.2.4, React 19, Tailwind v3.4.17 (verified from project package.json)
- shadcn CLI v4.5.0 npm registry (verified April 2026)
