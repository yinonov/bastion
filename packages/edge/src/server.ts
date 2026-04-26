import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import Fastify, { type FastifyInstance } from "fastify";
import replyFrom from "@fastify/reply-from";
import {
  evaluatePolicy,
  loadConfig,
  normalizeClaudeHook,
  renderMarkdownReport,
  resolveSqlitePath,
  toClaudeHookResponse,
  type AgentEvent,
  type BastionConfig,
  type SecurityFinding
} from "@bastion/core";
import { LocalSqliteStore } from "./store.js";
import { createHookLatencyTracker } from "./telemetry/latency.js";

export type EdgeServerOptions = {
  cwd?: string;
  host?: string;
  port?: number;
};

export type StartedEdgeServer = {
  app: FastifyInstance;
  store: LocalSqliteStore;
  url: string;
  close: () => Promise<void>;
};

export async function createEdgeApp(config: BastionConfig, store: LocalSqliteStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const hookLatency = createHookLatencyTracker();
  const scheduleInsightsRefresh = createInsightsRefreshScheduler(store);

  await app.register(replyFrom);

  app.get("/health", async () => ({
    ok: true,
    product: "Bastion",
    generatedAt: new Date().toISOString()
  }));

  app.get("/api/summary", async (request) => {
    const query = request.query as { limit?: unknown };
    return store.dashboardSummary(parseBoundedLimit(query.limit, 250, 500));
  });
  app.get("/api/events", async (request) => {
    const query = request.query as { limit?: unknown };
    return store.recentEvents(parseBoundedLimit(query.limit, 250, 500));
  });
  app.get("/api/findings", async (request) => {
    const query = request.query as { limit?: unknown };
    return store.recentFindings(parseBoundedLimit(query.limit, 250, 500));
  });
  app.get("/api/latency", async () => ({ hooks: hookLatency.snapshot() }));

  app.get("/api/report", async (request, reply) => {
    const query = request.query as { format?: string };
    const summary = store.dashboardSummary();
    if (query.format === "json") {
      return summary;
    }
    reply.type("text/markdown");
    return renderMarkdownReport(summary);
  });

  app.post("/api/hooks/claude", async (request, reply) => {
    const start = performance.now();

    if (!isRecord(request.body)) {
      reply.code(400);
      return { error: "invalid_hook_payload" };
    }

    try {
      const event = normalizeClaudeHook(request.body, config);
      const evaluation = evaluatePolicy(event, config);
      store.saveEvent(evaluation.event);
      store.saveFindings(evaluation.findings);
      scheduleInsightsRefresh();
      return toClaudeHookResponse(evaluation.event.eventType, evaluation.decision);
    } catch {
      reply.code(400);
      return { error: "invalid_hook_payload" };
    } finally {
      hookLatency.record(performance.now() - start);
    }
  });

  app.post("/mcp/:serverName", async (request, reply) => {
    const { serverName } = request.params as { serverName: string };
    const server = config.mcp.servers[serverName];
    const start = performance.now();
    const body = request.body;
    const toolName = getMcpToolName(body);
    const event = makeMcpEvent({
      serverName,
      body,
      status: "observed",
      latencyMs: 0,
      ...(toolName ? { toolName } : {})
    });

    if (!server || !server.enabled) {
      const finding = makeMcpFinding(event, serverName);
      store.saveEvent({ ...event, status: "denied", severity: "high" });
      store.saveFindings([finding]);
      scheduleInsightsRefresh();
      reply.code(403);
      return jsonRpcError(body, -32003, `MCP server '${serverName}' is not approved by Bastion policy.`);
    }

    const evaluation = evaluatePolicy(event, config);
    if (evaluation.decision.decision !== "allow") {
      store.saveEvent({
        ...evaluation.event,
        status: "denied",
        latencyMs: Math.round(performance.now() - start)
      });
      store.saveFindings(evaluation.findings);
      scheduleInsightsRefresh();
      reply.code(403);
      return jsonRpcError(body, -32004, evaluation.decision.reason);
    }

    if (server.transport !== "http") {
      const failed = {
        ...evaluation.event,
        status: "failed" as const,
        severity: "medium" as const,
        metadata: {
          ...evaluation.event.metadata,
          failure: "stdio MCP upstreams are registered but not proxied in this MVP"
        }
      };
      store.saveEvent(failed);
      scheduleInsightsRefresh();
      reply.code(501);
      return jsonRpcError(body, -32005, "STDIO MCP upstreams are registered for governance, but HTTP proxying is the supported MVP path.");
    }

    store.saveFindings(evaluation.findings);
    return reply.from(server.url, {
      method: "POST",
      body: JSON.stringify(body),
      contentType: "application/json",
      rewriteRequestHeaders: (_request, headers) => ({
        ...headers,
        ...server.headers,
        "content-type": headers["content-type"] ?? "application/json"
      }),
      onResponse: (_request, proxiedReply, response) => {
        const latencyMs = Math.round(performance.now() - start);
        store.saveEvent({
          ...evaluation.event,
          latencyMs,
          status: response.statusCode >= 400 ? "failed" : "allowed"
        });
        scheduleInsightsRefresh();
        proxiedReply.code(response.statusCode);
        proxiedReply.send(response.stream);
      },
      onError: (proxiedReply, { error }) => {
        const latencyMs = Math.round(performance.now() - start);
        store.saveEvent({
          ...evaluation.event,
          latencyMs,
          status: "failed",
          severity: "medium",
          metadata: {
            ...evaluation.event.metadata,
            error: error.message
          }
        });
        scheduleInsightsRefresh();
        proxiedReply.code(502).type("application/json").send(jsonRpcError(body, -32006, "Failed to reach upstream MCP server."));
      }
    });
  });

  return app;
}

export async function startEdgeServer(options: EdgeServerOptions = {}): Promise<StartedEdgeServer> {
  const cwd = options.cwd ?? process.cwd();
  const config = await loadConfig(cwd);
  const host = options.host ?? config.edge.host;
  const port = options.port ?? config.edge.port;
  const store = new LocalSqliteStore(resolveSqlitePath(config, cwd));
  const app = await createEdgeApp(config, store);
  
  let startTime = Date.now();
  
  try {
    await app.listen({ host, port });
    store.logUptime("startup");
    console.log(`✓ Bastion edge listening at http://${host}:${port}`);
  } catch (error) {
    await app.close().catch(() => undefined);
    store.close();

    if (isNodeError(error) && error.code === "EADDRINUSE") {
      throw new Error(`Bastion edge is already running on ${host}:${port}.`);
    }

    throw error;
  }

  // Register shutdown handlers
  const handleShutdown = async () => {
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    store.logUptime("shutdown", uptime);
    await app.close();
    store.close();
    process.exit(0);
  };

  process.on("SIGTERM", handleShutdown);
  process.on("SIGINT", handleShutdown);

  return {
    app,
    store,
    url: `http://${host}:${port}`,
    close: async () => {
      const uptime = Math.floor((Date.now() - startTime) / 1000);
      store.logUptime("shutdown", uptime);
      await app.close();
      store.close();
    }
  };
}

function makeMcpEvent(input: {
  serverName: string;
  toolName?: string;
  body: unknown;
  status: AgentEvent["status"];
  latencyMs: number;
}): AgentEvent {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "mcp",
    eventType: "McpRequest",
    status: input.status,
    severity: "info",
    machineId: hostname(),
    toolName: input.toolName ? `mcp:${input.serverName}:${input.toolName}` : `mcp:${input.serverName}`,
    action: getMcpMethod(input.body),
    rawPayload: input.body,
    latencyMs: input.latencyMs,
    metadata: {
      serverName: input.serverName,
      method: getMcpMethod(input.body)
    }
  };
}

function makeMcpFinding(event: AgentEvent, serverName: string): SecurityFinding {
  return {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    eventId: event.id,
    type: "mcp_server_not_approved",
    severity: "high",
    title: `Unapproved MCP server requested: ${serverName}`,
    description: "An agent attempted to route MCP traffic to a server that is not enabled in bastion.config.json.",
    evidenceSnippet: event.redactedSnippet,
    recommendation: "Add the server with bastion mcp add only after reviewing its permissions and data access."
  };
}

function getMcpMethod(body: unknown): string {
  const record = asRecord(body);
  return typeof record.method === "string" ? record.method : "unknown";
}

function getMcpToolName(body: unknown): string | undefined {
  const record = asRecord(body);
  const params = asRecord(record.params);
  return typeof params.name === "string" ? params.name : undefined;
}

function jsonRpcError(body: unknown, code: number, message: string): Record<string, unknown> {
  const record = asRecord(body);
  return {
    jsonrpc: "2.0",
    id: record.id ?? null,
    error: { code, message }
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function parseBoundedLimit(value: unknown, fallback: number, max: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(1, Math.min(max, Math.floor(value)));
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Math.max(1, Math.min(max, Number(value)));
  }
  return fallback;
}

function createInsightsRefreshScheduler(store: LocalSqliteStore): () => void {
  let pending = false;
  return () => {
    if (pending) {
      return;
    }
    pending = true;
    setImmediate(() => {
      try {
        store.refreshIntelligence();
      } catch {
        // Ignore analytics refresh failures so ingest path responses remain stable.
      } finally {
        pending = false;
      }
    });
  };
}
