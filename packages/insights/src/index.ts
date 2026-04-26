import { randomUUID } from "node:crypto";
import type { AgentEvent, DeveloperInsight, FrictionCluster, SecurityFinding } from "@bastion/core";

export type InsightInput = {
  events: AgentEvent[];
  findings: SecurityFinding[];
};

const ANTHROPIC_INPUT_USD_PER_MILLION = 3;
const APPROX_CHARS_PER_TOKEN = 4;

export function buildFrictionClusters(events: AgentEvent[]): FrictionCluster[] {
  const candidates = events.filter((event) =>
    event.status === "denied" ||
    event.status === "failed" ||
    event.eventType === "PostToolUseFailure" ||
    Number(event.latencyMs ?? 0) > 10_000
  );

  const grouped = new Map<string, AgentEvent[]>();
  for (const event of candidates) {
    const key = clusterKey(event);
    const existing = grouped.get(key) ?? [];
    existing.push(event);
    grouped.set(key, existing);
  }

  return [...grouped.entries()]
    .filter(([, group]) => group.length > 0)
    .map(([key, group]) => {
      const sorted = [...group].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const sessions = new Set(group.map((event) => event.sessionId ?? event.machineId));
      const signal = chooseSignal(group);
      const severity = group.some((event) => event.severity === "critical")
        ? "critical"
        : group.some((event) => event.severity === "high")
          ? "high"
          : "medium";

      return {
        id: randomUUID(),
        title: humanizeClusterTitle(key, group),
        signal,
        severity,
        eventIds: group.map((event) => event.id),
        occurrences: group.length,
        impactedSessions: sessions.size,
        firstSeen: first?.timestamp ?? new Date().toISOString(),
        lastSeen: last?.timestamp ?? new Date().toISOString(),
        summary: summarizeCluster(key, group)
      } satisfies FrictionCluster;
    })
    .sort((a, b) => b.occurrences - a.occurrences);
}

export function generateDeveloperInsights(input: InsightInput): DeveloperInsight[] {
  const clusters = buildFrictionClusters(input.events);
  const securityInsights = input.findings
    .filter((finding) => finding.severity === "critical" || finding.severity === "high")
    .slice(0, 5)
    .map((finding) => ({
      id: randomUUID(),
      title: finding.title,
      severity: finding.severity,
      category: "security" as const,
      recommendation: finding.recommendation,
      evidence: [finding.description],
      createdAt: new Date().toISOString()
    } satisfies DeveloperInsight));

  const frictionInsights = clusters.slice(0, 8).map((cluster) => ({
    id: randomUUID(),
    title: cluster.title,
    severity: cluster.severity,
    category: "friction" as const,
    recommendation: recommendationForCluster(cluster),
    evidence: [cluster.summary],
    clusterId: cluster.id,
    createdAt: new Date().toISOString()
  } satisfies DeveloperInsight));

  return [...securityInsights, ...frictionInsights];
}

export function estimateShadowSpend(events: AgentEvent[]): number {
  const totalPromptTokens = events.reduce((total, event) => {
    const metadata = asRecord(event.metadata);
    const tokenCandidates: unknown[] = [
      metadata.promptTokens,
      metadata.prompt_tokens,
      metadata.inputTokens,
      metadata.input_tokens
    ];

    for (const candidate of tokenCandidates) {
      const tokens = coerceNonNegativeNumber(candidate);
      if (tokens !== undefined) {
        return total + tokens;
      }
    }

    const promptLength = coerceNonNegativeNumber(metadata.promptLength);
    if (promptLength !== undefined) {
      return total + (promptLength / APPROX_CHARS_PER_TOKEN);
    }

    return total;
  }, 0);

  return Number(((totalPromptTokens / 1_000_000) * ANTHROPIC_INPUT_USD_PER_MILLION).toFixed(4));
}

export function calculateRiskScore(findings: SecurityFinding[], clusters: FrictionCluster[]): number {
  const findingScore = findings.reduce((total, finding) => total + severityWeight(finding.severity), 0);
  const clusterScore = clusters.reduce((total, cluster) => total + Math.min(15, severityWeight(cluster.severity) * cluster.occurrences), 0);
  return Math.min(100, Math.round(findingScore + clusterScore));
}

function clusterKey(event: AgentEvent): string {
  if (event.toolName) {
    return `${event.toolName}:${event.status}:${normalizeSnippet(event.redactedSnippet ?? event.action ?? "")}`;
  }
  return `${event.eventType}:${event.status}:${normalizeSnippet(event.redactedSnippet ?? "")}`;
}

function chooseSignal(events: AgentEvent[]): FrictionCluster["signal"] {
  if (events.some((event) => event.eventType === "PostToolUseFailure")) {
    return "tool_failure";
  }
  if (events.some((event) => event.status === "denied")) {
    return "denied_action";
  }
  if (events.some((event) => Number(event.latencyMs ?? 0) > 10_000)) {
    return "high_latency";
  }
  return events.length > 2 ? "repeated_error" : "prompt_loop";
}

function humanizeClusterTitle(key: string, events: AgentEvent[]): string {
  const [tool, status] = key.split(":");
  const count = events.length;
  if (tool && status) {
    return `${count} ${status} ${tool} agent events`;
  }
  return `${count} repeated agent workflow events`;
}

function summarizeCluster(key: string, events: AgentEvent[]): string {
  const sample = events.find((event) => event.redactedSnippet)?.redactedSnippet ?? key;
  return `${events.length} related events were observed. Sample: ${sample.slice(0, 240)}`;
}

function recommendationForCluster(cluster: FrictionCluster): string {
  if (cluster.signal === "denied_action") {
    return "Review whether this workflow needs a safer allowlisted path, a repo-scoped exception, or better agent instructions.";
  }
  if (cluster.signal === "tool_failure") {
    return "Turn this repeated failure into a platform task: document the integration, add a paved-road script, or fix the tool auth path.";
  }
  if (cluster.signal === "high_latency") {
    return "Investigate tool latency and cache or pre-authorize the slow path before it becomes a team-wide productivity tax.";
  }
  return "Inspect the repeated pattern and decide whether Platform/DevEx should ship a reusable internal tool or template.";
}

function normalizeSnippet(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").slice(0, 80);
}

function severityWeight(severity: SecurityFinding["severity"]): number {
  switch (severity) {
    case "critical":
      return 25;
    case "high":
      return 15;
    case "medium":
      return 8;
    case "low":
      return 3;
    case "info":
      return 1;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function coerceNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return undefined;
}
