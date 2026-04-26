import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AgentEventSchema,
  DashboardSummarySchema,
  SecurityFindingSchema,
  type AgentEvent,
  type DashboardSummary,
  type SecurityFinding
} from "@bastion/core";
import { buildFrictionClusters, calculateRiskScore, estimateShadowSpend, generateDeveloperInsights } from "@bastion/insights";

export class LocalSqliteStore {
  private readonly db: DatabaseSync;

  constructor(private readonly dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.migrate();
  }

  saveEvent(event: AgentEvent): void {
    const parsed = AgentEventSchema.parse(event);
    this.db.prepare(`
      insert into agent_events (
        id, timestamp, source, event_type, status, severity, session_id, machine_id,
        project_path, tool_name, action, redacted_snippet, latency_ms, raw_payload_json, metadata_json
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        status = excluded.status,
        severity = excluded.severity,
        redacted_snippet = excluded.redacted_snippet,
        metadata_json = excluded.metadata_json
    `).run(
      parsed.id,
      parsed.timestamp,
      parsed.source,
      parsed.eventType,
      parsed.status,
      parsed.severity,
      parsed.sessionId ?? null,
      parsed.machineId,
      parsed.projectPath ?? null,
      parsed.toolName ?? null,
      parsed.action ?? null,
      parsed.redactedSnippet ?? null,
      parsed.latencyMs ?? null,
      parsed.rawPayload === undefined ? null : JSON.stringify(parsed.rawPayload),
      JSON.stringify(parsed.metadata)
    );
  }

  saveFindings(findings: SecurityFinding[]): void {
    const statement = this.db.prepare(`
      insert into security_findings (
        id, timestamp, event_id, type, severity, title, description, evidence_snippet, recommendation
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do nothing
    `);

    for (const finding of findings) {
      const parsed = SecurityFindingSchema.parse(finding);
      statement.run(
        parsed.id,
        parsed.timestamp,
        parsed.eventId ?? null,
        parsed.type,
        parsed.severity,
        parsed.title,
        parsed.description,
        parsed.evidenceSnippet ?? null,
        parsed.recommendation
      );
    }
  }

  recentEvents(limit = 250): AgentEvent[] {
    return this.db.prepare(`
      select * from agent_events
      order by timestamp desc
      limit ?
    `).all(limit).map((row) => rowToEvent(row));
  }

  recentFindings(limit = 250): SecurityFinding[] {
    return this.db.prepare(`
      select * from security_findings
      order by timestamp desc
      limit ?
    `).all(limit).map((row) => rowToFinding(row));
  }

  dashboardSummary(limit = 250): DashboardSummary {
    const events = this.recentEvents(limit);
    const findings = this.recentFindings(limit);
    const clusters = buildFrictionClusters(events);
    const insights = generateDeveloperInsights({ events, findings });
    const blocked = events.filter((event) => event.status === "denied").length;
    const secrets = findings.filter((finding) => finding.type === "secret").length;

    return DashboardSummarySchema.parse({
      generatedAt: new Date().toISOString(),
      riskScore: calculateRiskScore(findings, clusters),
      events,
      findings,
      clusters,
      insights,
      totals: {
        events: events.length,
        blocked,
        secrets,
        frictionClusters: clusters.length,
        estimatedSpendUsd: estimateShadowSpend(events)
      }
    });
  }

  close(): void {
    this.db.close();
  }

  private migrate(): void {
    this.db.exec("pragma journal_mode = WAL;");
    this.db.exec("pragma synchronous = NORMAL;");
    this.db.exec("pragma busy_timeout = 5000;");

    this.db.exec(`
      create table if not exists agent_events (
        id text primary key,
        timestamp text not null,
        source text not null,
        event_type text not null,
        status text not null,
        severity text not null,
        session_id text,
        machine_id text not null,
        project_path text,
        tool_name text,
        action text,
        redacted_snippet text,
        latency_ms integer,
        raw_payload_json text,
        metadata_json text not null
      );

      create index if not exists idx_agent_events_timestamp on agent_events(timestamp);
      create index if not exists idx_agent_events_status on agent_events(status);

      create table if not exists security_findings (
        id text primary key,
        timestamp text not null,
        event_id text,
        type text not null,
        severity text not null,
        title text not null,
        description text not null,
        evidence_snippet text,
        recommendation text not null
      );

      create index if not exists idx_security_findings_timestamp on security_findings(timestamp);
      create index if not exists idx_security_findings_type on security_findings(type);
    `);
  }
}

function rowToEvent(row: unknown): AgentEvent {
  const record = asRecord(row);
  const event = {
    id: String(record.id),
    timestamp: String(record.timestamp),
    source: record.source,
    eventType: record.event_type,
    status: record.status,
    severity: record.severity,
    sessionId: nullableString(record.session_id),
    machineId: String(record.machine_id),
    projectPath: nullableString(record.project_path),
    toolName: nullableString(record.tool_name),
    action: nullableString(record.action),
    redactedSnippet: nullableString(record.redacted_snippet),
    latencyMs: nullableNumber(record.latency_ms),
    rawPayload: record.raw_payload_json ? JSON.parse(String(record.raw_payload_json)) : undefined,
    metadata: record.metadata_json ? JSON.parse(String(record.metadata_json)) : {}
  };
  return AgentEventSchema.parse(stripUndefined(event));
}

function rowToFinding(row: unknown): SecurityFinding {
  const record = asRecord(row);
  return SecurityFindingSchema.parse(stripUndefined({
    id: String(record.id),
    timestamp: String(record.timestamp),
    eventId: nullableString(record.event_id),
    type: record.type,
    severity: record.severity,
    title: String(record.title),
    description: String(record.description),
    evidenceSnippet: nullableString(record.evidence_snippet),
    recommendation: String(record.recommendation)
  }));
}

function nullableString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function nullableNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function stripUndefined<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, nestedValue]) => nestedValue !== undefined));
}
