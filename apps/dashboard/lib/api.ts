import type {
  AgentEvent,
  DashboardDataState,
  DashboardLiveSnapshot,
  DashboardSummary,
  SecurityFinding
} from "./types";

const edgeUrl = process.env.NEXT_PUBLIC_BASTION_EDGE_URL ?? process.env.BASTION_EDGE_URL ?? "http://127.0.0.1:4711";

export async function getDashboardData(): Promise<DashboardDataState> {
  try {
    const snapshot = await getDashboardSnapshot();
    return {
      status: "available",
      snapshot
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bastion edge is currently unavailable.";
    return {
      status: "unavailable",
      message
    };
  }
}

export async function getDashboardSnapshot(): Promise<DashboardLiveSnapshot> {
  const [summary, events, findings] = await Promise.all([
    fetchSummary(),
    fetchEvents(),
    fetchFindings()
  ]);

  return {
    summary,
    events,
    findings
  };
}

export async function fetchSummary(): Promise<DashboardSummary> {
  const payload = await fetchJson("/api/summary");
  if (!isSummary(payload)) {
    throw new Error("Edge summary response has an invalid shape.");
  }
  return payload;
}

export async function fetchEvents(): Promise<AgentEvent[]> {
  const payload = await fetchJson("/api/events");
  if (!Array.isArray(payload)) {
    throw new Error("Edge events response has an invalid shape.");
  }
  return payload.filter(isEvent);
}

export async function fetchFindings(): Promise<SecurityFinding[]> {
  const payload = await fetchJson("/api/findings");
  if (!Array.isArray(payload)) {
    throw new Error("Edge findings response has an invalid shape.");
  }
  return payload.filter(isFinding);
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(`${edgeUrl}${path}`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Bastion edge returned ${response.status} for ${path}.`);
  }
  return await response.json();
}

function isSummary(value: unknown): value is DashboardSummary {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.generatedAt === "string" &&
    typeof value.riskScore === "number" &&
    Array.isArray(value.events) &&
    Array.isArray(value.findings) &&
    Array.isArray(value.clusters) &&
    Array.isArray(value.insights) &&
    isRecord(value.totals)
  );
}

function isEvent(value: unknown): value is AgentEvent {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && typeof value.timestamp === "string" && typeof value.status === "string";
}

function isFinding(value: unknown): value is SecurityFinding {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.id === "string" && typeof value.title === "string" && typeof value.severity === "string";
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null;
}
