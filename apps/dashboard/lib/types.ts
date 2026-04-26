export type Severity = "info" | "low" | "medium" | "high" | "critical";

export type AgentEvent = {
  id: string;
  timestamp: string;
  source: string;
  eventType: string;
  status: string;
  severity: Severity;
  machineId: string;
  sessionId?: string;
  projectPath?: string;
  toolName?: string;
  action?: string;
  redactedSnippet?: string;
  latencyMs?: number;
};

export type SecurityFinding = {
  id: string;
  timestamp: string;
  type: string;
  severity: Severity;
  title: string;
  description: string;
  evidenceSnippet?: string;
  recommendation: string;
};

export type FrictionCluster = {
  id: string;
  title: string;
  signal: string;
  severity: Severity;
  occurrences: number;
  impactedSessions: number;
  summary: string;
};

export type DeveloperInsight = {
  id: string;
  title: string;
  severity: Severity;
  category: string;
  recommendation: string;
  evidence: string[];
};

export type DashboardSummary = {
  generatedAt: string;
  riskScore: number;
  events: AgentEvent[];
  findings: SecurityFinding[];
  clusters: FrictionCluster[];
  insights: DeveloperInsight[];
  totals: {
    events: number;
    blocked: number;
    secrets: number;
    frictionClusters: number;
    estimatedSpendUsd: number;
  };
};

export type DashboardLiveSnapshot = {
  summary: DashboardSummary;
  events: AgentEvent[];
  findings: SecurityFinding[];
};

export type DashboardAvailable = {
  status: "available";
  snapshot: DashboardLiveSnapshot;
};

export type DashboardUnavailable = {
  status: "unavailable";
  message: string;
};

export type DashboardDataState = DashboardAvailable | DashboardUnavailable;
