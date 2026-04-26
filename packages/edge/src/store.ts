import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  AgentEventSchema,
  DeveloperInsightSchema,
  DashboardSummarySchema,
  FrictionClusterSchema,
  SecurityFindingSchema,
  type AgentEvent,
  type DeveloperInsight,
  type DashboardSummary,
  type FrictionCluster,
  type SecurityFinding
} from "@bastion/core";
import { buildFrictionClusters, calculateRiskScore, estimateShadowSpend, generateDeveloperInsights } from "@bastion/insights";
import { randomUUID } from "node:crypto";

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

  refreshIntelligence(limit = 250): void {
    const events = this.recentEvents(limit);
    const findings = this.recentFindings(limit);
    const clusters = buildFrictionClusters(events);
    const insights = generateDeveloperInsights({ events, findings });
    this.saveClustersAndInsights(clusters, insights);
  }

  saveClustersAndInsights(clusters: FrictionCluster[], insights: DeveloperInsight[]): void {
    const parsedClusters = clusters.map((cluster) => FrictionClusterSchema.parse(cluster));
    const parsedInsights = insights.map((insight) => DeveloperInsightSchema.parse(insight));

    this.db.exec("begin;");
    try {
      this.db.exec("delete from friction_clusters;");
      this.db.exec("delete from developer_insights;");

      const insertCluster = this.db.prepare(`
        insert into friction_clusters (
          id, title, signal, severity, event_ids_json, occurrences, impacted_sessions, first_seen, last_seen, summary, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const cluster of parsedClusters) {
        insertCluster.run(
          cluster.id,
          cluster.title,
          cluster.signal,
          cluster.severity,
          JSON.stringify(cluster.eventIds),
          cluster.occurrences,
          cluster.impactedSessions,
          cluster.firstSeen,
          cluster.lastSeen,
          cluster.summary,
          new Date().toISOString()
        );
      }

      const insertInsight = this.db.prepare(`
        insert into developer_insights (
          id, title, severity, category, recommendation, evidence_json, cluster_id, created_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const insight of parsedInsights) {
        insertInsight.run(
          insight.id,
          insight.title,
          insight.severity,
          insight.category,
          insight.recommendation,
          JSON.stringify(insight.evidence),
          insight.clusterId ?? null,
          insight.createdAt
        );
      }

      this.db.exec("commit;");
    } catch (error) {
      this.db.exec("rollback;");
      throw error;
    }
  }

  recentClusters(limit = 50): FrictionCluster[] {
    return this.db.prepare(`
      select * from friction_clusters
      order by occurrences desc, last_seen desc
      limit ?
    `).all(limit).map((row) => rowToCluster(row));
  }

  recentInsights(limit = 50): DeveloperInsight[] {
    return this.db.prepare(`
      select * from developer_insights
      order by created_at desc
      limit ?
    `).all(limit).map((row) => rowToInsight(row));
  }

  dashboardSummary(limit = 250): DashboardSummary {
    const events = this.recentEvents(limit);
    const findings = this.recentFindings(limit);
    const clusters = this.recentClusters();
    const insights = this.recentInsights();
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

  logUptime(eventType: "startup" | "shutdown", uptimeSeconds?: number): void {
    this.db.prepare(`
      insert into uptime_log (
        id, event_type, timestamp, uptime_seconds, crash_detected, metadata_json
      ) values (?, ?, ?, ?, ?, ?)
    `).run(
      randomUUID(),
      eventType,
      new Date().toISOString(),
      uptimeSeconds ?? null,
      0,
      JSON.stringify({})
    );
  }

  getUptimeStats(): { startupCount: number; totalUptimeSeconds: number; lastShutdown: string | null; currentSession: number } {
    const startupRow = this.db.prepare("select count(*) as count from uptime_log where event_type = 'startup'").get();
    const uptimeRow = this.db.prepare("select coalesce(sum(uptime_seconds), 0) as total from uptime_log where event_type = 'shutdown'").get();
    const lastRow = this.db.prepare("select max(timestamp) as ts from uptime_log where event_type = 'shutdown'").get();
    const latestStartupRow = this.db.prepare("select timestamp from uptime_log where event_type = 'startup' order by timestamp desc limit 1").get();

    const startupCount = typeof startupRow === "object" && startupRow !== null ? Number(startupRow.count) : 0;
    const totalUptimeSeconds = typeof uptimeRow === "object" && uptimeRow !== null ? Number(uptimeRow.total) : 0;
    const lastShutdown = typeof lastRow === "object" && lastRow !== null && lastRow.ts ? String(lastRow.ts) : null;
    const latestStartupTime = 
      typeof latestStartupRow === "object" && latestStartupRow !== null && latestStartupRow.timestamp
        ? new Date(String(latestStartupRow.timestamp)).getTime()
        : 0;
    const currentSession = latestStartupTime > 0 ? Math.floor((Date.now() - latestStartupTime) / 1000) : 0;

    return {
      startupCount,
      totalUptimeSeconds,
      lastShutdown,
      currentSession
    };
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

      create table if not exists friction_clusters (
        id text primary key,
        title text not null,
        signal text not null,
        severity text not null,
        event_ids_json text not null,
        occurrences integer not null,
        impacted_sessions integer not null,
        first_seen text not null,
        last_seen text not null,
        summary text not null,
        updated_at text not null
      );

      create index if not exists idx_friction_clusters_occurrences on friction_clusters(occurrences);
      create index if not exists idx_friction_clusters_last_seen on friction_clusters(last_seen);

      create table if not exists developer_insights (
        id text primary key,
        title text not null,
        severity text not null,
        category text not null,
        recommendation text not null,
        evidence_json text not null,
        cluster_id text,
        created_at text not null
      );

      create index if not exists idx_developer_insights_created_at on developer_insights(created_at);
      create index if not exists idx_developer_insights_category on developer_insights(category);

      create table if not exists uptime_log (
        id text primary key,
        event_type text not null,
        timestamp text not null,
        uptime_seconds integer,
        crash_detected boolean default 0,
        metadata_json text
      );

      create index if not exists idx_uptime_log_timestamp on uptime_log(timestamp desc);
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

function rowToCluster(row: unknown): FrictionCluster {
  const record = asRecord(row);
  const cluster = {
    id: String(record.id),
    title: String(record.title),
    signal: record.signal,
    severity: record.severity,
    eventIds: record.event_ids_json ? JSON.parse(String(record.event_ids_json)) : [],
    occurrences: Number(record.occurrences ?? 0),
    impactedSessions: Number(record.impacted_sessions ?? 0),
    firstSeen: String(record.first_seen),
    lastSeen: String(record.last_seen),
    summary: String(record.summary)
  };
  return FrictionClusterSchema.parse(cluster);
}

function rowToInsight(row: unknown): DeveloperInsight {
  const record = asRecord(row);
  const insight = {
    id: String(record.id),
    title: String(record.title),
    severity: record.severity,
    category: record.category,
    recommendation: String(record.recommendation),
    evidence: record.evidence_json ? JSON.parse(String(record.evidence_json)) : [],
    clusterId: nullableString(record.cluster_id),
    createdAt: String(record.created_at)
  };
  return DeveloperInsightSchema.parse(stripUndefined(insight));
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
