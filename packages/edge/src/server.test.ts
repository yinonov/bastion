import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import Fastify from "fastify";
import { getDefaultConfig } from "@bastion/core";
import { createEdgeApp, startEdgeServer } from "./server.js";
import { LocalSqliteStore } from "./store.js";

async function postJson(url: string, payload: unknown): Promise<{
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}> {
  return await new Promise((resolve, reject) => {
    const request = httpRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
      response.on("end", () => {
        resolve({
          statusCode: response.statusCode ?? 0,
          headers: response.headers,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });

    request.on("error", reject);
    request.write(JSON.stringify(payload));
    request.end();
  });
}

test("denies unapproved MCP upstreams", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const response = await app.inject({
    method: "POST",
    url: "/mcp/unapproved",
    payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "deploy" } }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(response.json(), {
    jsonrpc: "2.0",
    id: 1,
    error: {
      code: -32003,
      message: "MCP server 'unapproved' is not approved by Bastion policy."
    }
  });
  assert.equal(store.recentFindings()[0]?.type, "mcp_server_not_approved");

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("proxies approved HTTP MCP upstreams without relying on global fetch", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const upstream = Fastify({ logger: false });
  upstream.post("/", async (_request, reply) => {
    reply.code(202).type("application/json");
    return {
      jsonrpc: "2.0",
      id: 1,
      result: { proxied: true }
    };
  });
  await upstream.listen({ host: "127.0.0.1", port: 0 });
  const address = upstream.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const config = getDefaultConfig();
  config.mcp.servers.approved = {
    transport: "http",
    url: `http://127.0.0.1:${port}/`,
    headers: {},
    enabled: true
  };

  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("global fetch should not be used for approved MCP proxying");
  }) as typeof fetch;
  await app.listen({ host: "127.0.0.1", port: 0 });
  const appAddress = app.server.address();
  const appPort = typeof appAddress === "object" && appAddress ? appAddress.port : 0;

  try {
    const response = await postJson(`http://127.0.0.1:${appPort}/mcp/approved`, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "list-tools" }
    });
    const contentType = Array.isArray(response.headers["content-type"])
      ? response.headers["content-type"][0] ?? ""
      : response.headers["content-type"] ?? "";

    assert.equal(response.statusCode, 202);
    assert.match(contentType, /application\/json/i);
    assert.deepEqual(JSON.parse(response.body), {
      jsonrpc: "2.0",
      id: 1,
      result: { proxied: true }
    });
  } finally {
    globalThis.fetch = originalFetch;
    await app.close();
    store.close();
    await upstream.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("returns policy denial JSON-RPC errors for approved MCP servers without proxying upstream", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const upstream = Fastify({ logger: false });
  let upstreamCalls = 0;
  upstream.post("/", async () => {
    upstreamCalls += 1;
    return { jsonrpc: "2.0", id: 1, result: { proxied: true } };
  });
  await upstream.listen({ host: "127.0.0.1", port: 0 });
  const address = upstream.server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  const config = getDefaultConfig();
  config.mcp.servers.approved = {
    transport: "http",
    url: `http://127.0.0.1:${port}/`,
    headers: {},
    enabled: true
  };
  config.policies.tools.denied = ["mcp:approved:deploy"];

  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const appAddress = app.server.address();
  const appPort = typeof appAddress === "object" && appAddress ? appAddress.port : 0;

  const response = await postJson(`http://127.0.0.1:${appPort}/mcp/approved`, {
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "deploy" }
  });

  assert.equal(response.statusCode, 403);
  assert.deepEqual(JSON.parse(response.body), {
    jsonrpc: "2.0",
    id: 7,
    error: {
      code: -32004,
      message: "Blocked because mcp:approved:deploy is denied by policy."
    }
  });
  assert.equal(upstreamCalls, 0);
  assert.equal(store.recentFindings().some((finding) => finding.type === "disallowed_tool"), true);

  await app.close();
  store.close();
  await upstream.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns explicit not-implemented JSON-RPC errors for approved stdio MCP servers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.mcp.servers.approved = {
    transport: "stdio",
    command: "node",
    args: ["mock-mcp.js"],
    enabled: true
  };

  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const appAddress = app.server.address();
  const appPort = typeof appAddress === "object" && appAddress ? appAddress.port : 0;

  const response = await postJson(`http://127.0.0.1:${appPort}/mcp/approved`, {
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "list-tools" }
  });

  assert.equal(response.statusCode, 501);
  assert.deepEqual(JSON.parse(response.body), {
    jsonrpc: "2.0",
    id: 12,
    error: {
      code: -32005,
      message: "STDIO MCP upstreams are registered for governance, but only HTTP transport is proxied in v1."
    }
  });

  const recentEvent = store.recentEvents()[0];
  assert.ok(recentEvent);
  assert.equal(recentEvent?.status, "failed");
  assert.match(String(recentEvent?.metadata.failure ?? ""), /stdio MCP upstreams are registered but not proxied in v1/i);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns valid JSON-RPC upstream failure errors for approved MCP servers", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.mcp.servers.approved = {
    transport: "http",
    url: "http://127.0.0.1:1/",
    headers: {},
    enabled: true
  };

  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);
  await app.listen({ host: "127.0.0.1", port: 0 });
  const appAddress = app.server.address();
  const appPort = typeof appAddress === "object" && appAddress ? appAddress.port : 0;

  const response = await postJson(`http://127.0.0.1:${appPort}/mcp/approved`, {
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "list-tools" }
  });

  assert.equal(response.statusCode, 502);
  assert.deepEqual(JSON.parse(response.body), {
    jsonrpc: "2.0",
    id: 9,
    error: {
      code: -32006,
      message: "Failed to reach upstream MCP server."
    }
  });

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("exposes hook latency metrics including p95", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const hookResponse = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: { hook_event_name: "UserPromptSubmit", prompt: "hello" }
  });

  assert.equal(hookResponse.statusCode, 200);

  const latencyResponse = await app.inject({ method: "GET", url: "/api/latency" });
  assert.equal(latencyResponse.statusCode, 200);
  const body = latencyResponse.json() as { hooks: { count: number; p95Ms: number } };
  assert.equal(body.hooks.count > 0, true);
  assert.equal(Number.isFinite(body.hooks.p95Ms), true);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("backfills hook latency metrics from persisted events on startup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const timestamp = new Date().toISOString();

  store.saveEvent({
    id: "9ee4da8a-2fcf-46ad-bf93-bfc4d65b3fd1",
    timestamp,
    source: "claude-code",
    eventType: "UserPromptSubmit",
    status: "allowed",
    severity: "info",
    machineId: "machine-a",
    latencyMs: 11,
    metadata: {}
  });

  store.saveEvent({
    id: "0567a445-839d-4532-8417-f89b602e3f88",
    timestamp,
    source: "claude-code",
    eventType: "PreToolUse",
    status: "allowed",
    severity: "info",
    machineId: "machine-a",
    latencyMs: 47,
    metadata: {}
  });

  const app = await createEdgeApp(getDefaultConfig(), store);
  const latencyResponse = await app.inject({ method: "GET", url: "/api/latency" });
  assert.equal(latencyResponse.statusCode, 200);

  const body = latencyResponse.json() as {
    hooks: { count: number; p95Ms: number; avgMs: number; maxMs: number };
  };

  assert.equal(body.hooks.count, 2);
  assert.equal(body.hooks.maxMs, 47);
  assert.equal(body.hooks.p95Ms, 47);
  assert.equal(body.hooks.avgMs, 29);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("includes latency metrics in /api/summary payload", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const timestamp = new Date().toISOString();

  store.saveEvent({
    id: "9ee4da8a-2fcf-46ad-bf93-bfc4d65b3fd1",
    timestamp,
    source: "claude-code",
    eventType: "UserPromptSubmit",
    status: "allowed",
    severity: "info",
    machineId: "machine-a",
    latencyMs: 10,
    metadata: {}
  });

  store.saveEvent({
    id: "0567a445-839d-4532-8417-f89b602e3f88",
    timestamp,
    source: "claude-code",
    eventType: "PreToolUse",
    status: "allowed",
    severity: "info",
    machineId: "machine-a",
    latencyMs: 40,
    metadata: {}
  });

  const app = await createEdgeApp(getDefaultConfig(), store);
  const summaryResponse = await app.inject({ method: "GET", url: "/api/summary" });
  assert.equal(summaryResponse.statusCode, 200);

  const summary = summaryResponse.json() as {
    latency: { count: number; p95Ms: number; avgMs: number; maxMs: number };
  };

  assert.equal(summary.latency.count, 2);
  assert.equal(summary.latency.p95Ms, 40);
  assert.equal(summary.latency.avgMs, 25);
  assert.equal(summary.latency.maxMs, 40);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("ingest responses remain fast while async refresh updates summary metrics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const start = performance.now();
  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "UserPromptSubmit",
      prompt: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456",
      prompt_tokens: 1000
    }
  });
  const durationMs = performance.now() - start;

  assert.equal(response.statusCode, 200);
  assert.equal(durationMs < 500, true);

  await waitFor(async () => {
    const summary = store.dashboardSummary();
    return summary.totals.events >= 1 && summary.totals.secrets >= 1 && summary.totals.estimatedSpendUsd > 0;
  });

  const summary = store.dashboardSummary();
  const expectedBlocked = store.recentEvents().filter((event) => event.status === "denied").length;
  const expectedSecrets = store.recentFindings().filter((finding) => finding.type === "secret").length;

  assert.equal(summary.totals.events, store.recentEvents().length);
  assert.equal(summary.totals.blocked, expectedBlocked);
  assert.equal(summary.totals.secrets, expectedSecrets);
  assert.equal(summary.totals.estimatedSpendUsd > 0, true);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns controlled 400 for malformed hook payloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: "123",
    headers: { "content-type": "application/json" }
  });

  assert.equal(response.statusCode, 400);
  assert.equal((response.json() as { error: string }).error, "invalid_hook_payload");

  const health = await app.inject({ method: "GET", url: "/health" });
  assert.equal(health.statusCode, 200);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns Claude permission ask envelope for protected PreToolUse events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "PreToolUse",
      tool_name: "Write",
      tool_input: { file_path: ".env" }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    suppressOutput?: boolean;
    hookSpecificOutput?: {
      permissionDecision?: string;
      permissionDecisionReason?: string;
    };
  };
  assert.equal(body.suppressOutput, true);
  assert.equal(body.hookSpecificOutput?.permissionDecision, "ask");
  assert.match(body.hookSpecificOutput?.permissionDecisionReason ?? "", /protected path|confirmation/i);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns Claude stop envelope for denied prompt-submit events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(getDefaultConfig(), store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "UserPromptSubmit",
      prompt: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    continue?: boolean;
    stopReason?: string;
    suppressOutput?: boolean;
  };
  assert.equal(body.continue, false);
  assert.match(body.stopReason ?? "", /secret-like material/i);
  assert.equal(body.suppressOutput, true);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns Claude redact envelope without leaking raw secret text", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.policies.secrets.blockOnDetection = false;
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "UserPromptSubmit",
      prompt: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456"
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    suppressOutput?: boolean;
    systemMessage?: string;
  };
  assert.equal(body.suppressOutput, true);
  assert.match(body.systemMessage ?? "", /redacted sensitive context/i);
  assert.doesNotMatch(JSON.stringify(store.recentFindings()), /ghp_abcdefghijklmnopqrstuvwxyz123456/);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("returns Claude block envelope for denied post-tool events", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.policies.tools.denied = ["Read"];
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: { file_path: "README.md" }
    }
  });

  assert.equal(response.statusCode, 200);
  const body = response.json() as {
    decision?: string;
    reason?: string;
    hookSpecificOutput?: {
      hookEventName?: string;
      additionalContext?: string;
    };
  };
  assert.equal(body.decision, "block");
  assert.match(body.reason ?? "", /denied by policy|not in the allowlist/i);
  assert.equal(body.hookSpecificOutput?.hookEventName, "PostToolUse");

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("persists sanitized hook findings with required fields", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.policies.secrets.blockOnDetection = false;
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "UserPromptSubmit",
      prompt: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456"
    }
  });

  assert.equal(response.statusCode, 200);
  const findings = store.recentFindings();
  assert.equal(findings.length > 0, true);
  const finding = findings[0];
  assert.ok(finding);
  if (!finding) {
    throw new Error("Expected at least one persisted finding.");
  }
  assert.match(finding.id, /^[0-9a-f-]{36}$/i);
  assert.match(finding.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(finding.type, "secret");
  assert.equal(typeof finding.eventId, "string");
  assert.equal(typeof finding.title, "string");
  assert.equal(typeof finding.description, "string");
  assert.equal(typeof finding.recommendation, "string");
  assert.match(finding.evidenceSnippet ?? "", /\[REDACTED:github-token\]/);
  assert.doesNotMatch(finding.evidenceSnippet ?? "", /ghp_abcdefghijklmnopqrstuvwxyz123456/);

  const events = store.recentEvents();
  assert.equal(events[0]?.rawPayload, undefined);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("persists linked findings for mixed hook threats without raw-secret leakage", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const config = getDefaultConfig();
  config.policies.secrets.blockOnDetection = false;
  const store = new LocalSqliteStore(join(dir, "bastion.db"));
  const app = await createEdgeApp(config, store);

  const response = await app.inject({
    method: "POST",
    url: "/api/hooks/claude",
    payload: {
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: {
        command: "rm -rf /tmp/test && export OPENAI_API_KEY=sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD",
        file_path: ".env"
      }
    }
  });

  assert.equal(response.statusCode, 200);
  const findings = store.recentFindings();
  const findingTypes = new Set(findings.map((finding) => finding.type));
  assert.equal(findingTypes.has("secret"), true);
  assert.equal(findingTypes.has("dangerous_command"), true);
  assert.equal(findingTypes.has("disallowed_path"), true);
  const eventIds = new Set(findings.map((finding) => finding.eventId));
  assert.equal(eventIds.size, 1);
  assert.doesNotMatch(JSON.stringify(findings), /sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD/);

  await app.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("rejects duplicate edge instance startup with a clear message", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const first = await startEdgeServer({ cwd: dir, host: "127.0.0.1", port: 0 });
  const address = first.app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  assert.equal(typeof port, "number");

  await assert.rejects(
    () => startEdgeServer({ cwd: dir, host: "127.0.0.1", port }),
    /already running/i
  );

  await first.close();
  await rm(dir, { recursive: true, force: true });
});

test("initializes sqlite in WAL mode", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-edge-"));
  const dbPath = join(dir, "bastion.db");
  const store = new LocalSqliteStore(dbPath);
  store.close();

  const db = new DatabaseSync(dbPath);
  const row = db.prepare("pragma journal_mode;").get() as { journal_mode?: string };
  db.close();
  assert.equal(row.journal_mode?.toLowerCase(), "wal");

  await rm(dir, { recursive: true, force: true });
});

async function waitFor(check: () => Promise<boolean>, timeoutMs = 1000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("Timed out waiting for async condition.");
}
