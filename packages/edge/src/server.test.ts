import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getDefaultConfig } from "@bastion/core";
import { createEdgeApp, startEdgeServer } from "./server.js";
import { LocalSqliteStore } from "./store.js";

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
  assert.equal(store.recentFindings()[0]?.type, "mcp_server_not_approved");

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
