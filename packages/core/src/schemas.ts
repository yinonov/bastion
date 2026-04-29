import { z } from "zod";

export const SeveritySchema = z.enum(["info", "low", "medium", "high", "critical"]);

export const AgentSourceSchema = z.enum(["claude-code", "mcp", "scanner"]);

export const AgentEventTypeSchema = z.enum([
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SessionStart",
  "SessionEnd",
  "McpRequest",
  "McpResponse",
  "ScanFinding"
]);

export const AgentEventStatusSchema = z.enum(["allowed", "denied", "asked", "redacted", "failed", "observed"]);

export const AgentEventSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  source: AgentSourceSchema,
  eventType: AgentEventTypeSchema,
  status: AgentEventStatusSchema.default("observed"),
  severity: SeveritySchema.default("info"),
  sessionId: z.string().optional(),
  machineId: z.string(),
  projectPath: z.string().optional(),
  toolName: z.string().optional(),
  action: z.string().optional(),
  redactedSnippet: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  rawPayload: z.unknown().optional(),
  metadata: z.record(z.unknown()).default({})
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const PolicyDecisionSchema = z.object({
  decision: z.enum(["allow", "deny", "ask", "redact"]),
  reason: z.string(),
  severity: SeveritySchema.default("info"),
  findingIds: z.array(z.string().uuid()).default([]),
  redactedFields: z.array(z.string()).default([])
});

export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;

export const SecurityFindingSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  eventId: z.string().uuid().optional(),
  type: z.enum([
    "secret",
    "dangerous_command",
    "disallowed_tool",
    "disallowed_path",
    "raw_payload_disabled",
    "mcp_server_not_approved",
    "ip_exposure"
  ]),
  severity: SeveritySchema,
  title: z.string(),
  description: z.string(),
  evidenceSnippet: z.string().optional(),
  recommendation: z.string()
});

export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;

export const FrictionClusterSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  signal: z.enum(["repeated_error", "denied_action", "tool_failure", "high_latency", "prompt_loop"]),
  severity: SeveritySchema,
  eventIds: z.array(z.string().uuid()),
  occurrences: z.number().int().nonnegative(),
  impactedSessions: z.number().int().nonnegative(),
  firstSeen: z.string().datetime(),
  lastSeen: z.string().datetime(),
  summary: z.string()
});

export type FrictionCluster = z.infer<typeof FrictionClusterSchema>;

export const DeveloperInsightSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  severity: SeveritySchema,
  category: z.enum(["security", "friction", "spend", "governance"]),
  recommendation: z.string(),
  evidence: z.array(z.string()).default([]),
  clusterId: z.string().uuid().optional(),
  createdAt: z.string().datetime()
});

export type DeveloperInsight = z.infer<typeof DeveloperInsightSchema>;

export const RedactionRuleSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  replacement: z.string().default("[REDACTED]")
});

export type RedactionRule = z.infer<typeof RedactionRuleSchema>;

export const McpServerConfigSchema = z.discriminatedUnion("transport", [
  z.object({
    transport: z.literal("http"),
    url: z.string().url(),
    headers: z.record(z.string()).default({}),
    enabled: z.boolean().default(true)
  }),
  z.object({
    transport: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()).default([]),
    enabled: z.boolean().default(true)
  })
]);

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

export const BastionConfigSchema = z.object({
  capture: z.object({
    rawPayload: z.boolean().default(false),
    snippetMaxChars: z.number().int().positive().default(1200)
  }).default({}),
  redaction: z.object({
    rules: z.array(RedactionRuleSchema).default([])
  }).default({}),
  policies: z.object({
    tools: z.object({
      allowed: z.array(z.string()).default([]),
      denied: z.array(z.string()).default([]),
      ask: z.array(z.string()).default(["Bash", "Write", "Edit", "MultiEdit"])
    }).default({}),
    secrets: z.object({
      blockOnDetection: z.boolean().default(true),
      customPatterns: z.array(z.string()).default([])
    }).default({}),
    dangerousCommands: z.array(z.string()).default([
      "rm -rf *",
      "git push --force*",
      "git reset --hard*",
      "mkfs*",
      "dd if=* of=/dev/*",
      "*:(){ :|:& };:*",
      "*drop table*",
      "*truncate table*",
      "*> ~/.aws/credentials*",
      "*> ~/.ssh/*",
      "curl * | sh",
      "wget * | sh",
      "chmod -R 777"
    ]),
    protectedPaths: z.array(z.string()).default([".env", "~/.ssh/", "~/.aws/credentials", ".git/config"])
  }).default({}),
  mcp: z.object({
    servers: z.record(McpServerConfigSchema).default({})
  }).default({}),
  exporters: z.object({
    localSqlite: z.object({
      path: z.string().default(".bastion/bastion.db")
    }).default({}),
    cloud: z.object({
      enabled: z.boolean().default(false),
      endpoint: z.string().url().optional(),
      apiKeyEnv: z.string().optional()
    }).default({})
  }).default({}),
  edge: z.object({
    host: z.string().default("127.0.0.1"),
    port: z.number().int().positive().default(4711)
  }).default({}),
  dashboard: z.object({
    port: z.number().int().positive().default(3000)
  }).default({})
});

export type BastionConfig = z.infer<typeof BastionConfigSchema>;

export const DashboardSummarySchema = z.object({
  generatedAt: z.string().datetime(),
  riskScore: z.number().int().min(0).max(100),
  events: z.array(AgentEventSchema),
  findings: z.array(SecurityFindingSchema),
  clusters: z.array(FrictionClusterSchema),
  insights: z.array(DeveloperInsightSchema),
  latency: z.object({
    count: z.number().int().nonnegative(),
    p95Ms: z.number().nonnegative(),
    avgMs: z.number().nonnegative(),
    maxMs: z.number().nonnegative()
  }),
  totals: z.object({
    events: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    secrets: z.number().int().nonnegative(),
    frictionClusters: z.number().int().nonnegative(),
    estimatedSpendUsd: z.number().nonnegative()
  })
});

export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
