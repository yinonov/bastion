"use client";

import {
  AlertTriangle,
  Blocks,
  CircleDollarSign,
  FileDown,
  KeyRound,
  RadioTower,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import type React from "react";
import { useEffect, useState } from "react";
import {
  fetchEvents,
  fetchFindings,
  fetchSummary,
  getReportUrl,
} from "@/lib/api";
import type {
  AgentEvent,
  DashboardSummary,
  DeveloperInsight,
  FrictionCluster,
  SecurityFinding,
  Severity,
} from "@/lib/types";

type LiveDashboardProps = {
  initialSummary: DashboardSummary;
  initialEvents: AgentEvent[];
  initialFindings: SecurityFinding[];
};

export function LiveDashboard({
  initialSummary,
  initialEvents,
  initialFindings,
}: LiveDashboardProps) {
  const [summary, setSummary] = useState(initialSummary);
  const [events, setEvents] = useState(initialEvents);
  const [findings, setFindings] = useState(initialFindings);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const [nextSummary, nextEvents, nextFindings] = await Promise.all([
          fetchSummary(),
          fetchEvents(),
          fetchFindings(),
        ]);
        if (cancelled) {
          return;
        }
        setSummary(nextSummary);
        setEvents(nextEvents);
        setFindings(nextFindings);
        setRefreshError(null);
      } catch (error) {
        if (!cancelled) {
          setRefreshError(
            error instanceof Error ? error.message : "Live refresh failed.",
          );
        }
      }
    };

    const timer = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  const latestEvents = events.slice(0, 8);
  const latestFindings = findings.slice(0, 6);
  const clusters = summary.clusters.slice(0, 5);
  const insights = summary.insights.slice(0, 5);

  return (
    <main className="min-h-screen bg-ink text-text">
      <div className="mx-auto flex w-full max-w-[1500px] flex-col gap-5 px-5 py-5 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-line pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-medium text-cyan">
              <ShieldCheck className="h-4 w-4" />
              Bastion Control Plane
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-text md:text-5xl">
              Risk Command Center
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="rounded-md border border-line bg-panel px-3 py-2">
              Generated {formatTime(summary.generatedAt)}
            </span>
            <a
              href={getReportUrl()}
              className="inline-flex items-center gap-2 rounded-md border border-line bg-panel2 px-3 py-2 text-text transition hover:border-cyan hover:text-cyan"
            >
              <FileDown className="h-4 w-4" />
              AI Workflow Audit
            </a>
          </div>
        </header>

        {refreshError ? (
          <div className="rounded-md border border-amber/40 bg-amber/10 px-4 py-3 text-sm text-amber">
            Live update warning: {refreshError}
          </div>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Risk Score"
              value={`${summary.riskScore}`}
              tone={riskTone(summary.riskScore)}
              icon={<ShieldCheck className="h-5 w-5" />}
            />
            <Metric
              label="Blocked Actions"
              value={`${summary.totals.blocked}`}
              tone="red"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
            <Metric
              label="Secrets"
              value={`${summary.totals.secrets}`}
              tone="amber"
              icon={<KeyRound className="h-5 w-5" />}
            />
            <Metric
              label="Shadow Spend"
              value={`$${summary.totals.estimatedSpendUsd.toFixed(2)}`}
              tone="cyan"
              icon={<CircleDollarSign className="h-5 w-5" />}
            />
          </div>

          <div className="rounded-lg border border-line bg-panel shadow-control">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <RadioTower className="h-4 w-4 text-cyan" />
                Live Agent Stream
              </div>
              <span className="text-xs text-muted">
                {summary.totals.events} events
              </span>
            </div>
            <div className="divide-y divide-line">
              {latestEvents.length === 0 ? (
                <EmptyRow label="No local agent events yet" />
              ) : (
                latestEvents.map((event) => (
                  <EventRow key={event.id} event={event} />
                ))
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-4">
          <div className="rounded-lg border border-line bg-panel shadow-control">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Zap className="h-4 w-4 text-cyan" />
                Hook Latency Metrics
              </div>
              <span className="text-xs text-muted">p95 target: ≤50ms</span>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-4">
              <>
                <LatencyMetric
                  label="p95 Latency"
                  value={`${summary.latency.p95Ms}ms`}
                  tone={
                    summary.latency.p95Ms <= 50
                      ? "green"
                      : summary.latency.p95Ms <= 75
                        ? "amber"
                        : "red"
                  }
                />
                <LatencyMetric
                  label="Avg Latency"
                  value={`${summary.latency.avgMs}ms`}
                  tone={
                    summary.latency.avgMs <= 30
                      ? "green"
                      : summary.latency.avgMs <= 50
                        ? "amber"
                        : "red"
                  }
                />
                <LatencyMetric
                  label="Max Latency"
                  value={`${summary.latency.maxMs}ms`}
                  tone={
                    summary.latency.maxMs <= 100
                      ? "green"
                      : summary.latency.maxMs <= 150
                        ? "amber"
                        : "red"
                  }
                />
                <LatencyMetric
                  label="Sample Count"
                  value={`${summary.latency.count}`}
                  tone="cyan"
                />
              </>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Panel
            title="Blocked Actions"
            icon={<Blocks className="h-4 w-4 text-red" />}
          >
            {latestFindings.length === 0 ? (
              <EmptyRow label="No security findings recorded" />
            ) : (
              latestFindings.map((finding) => (
                <FindingRow key={finding.id} finding={finding} />
              ))
            )}
          </Panel>

          <Panel
            title="Secret/IP Exposure Map"
            icon={<KeyRound className="h-4 w-4 text-amber" />}
          >
            <div className="grid gap-3 md:grid-cols-3">
              <ExposureCell
                label="Critical Findings"
                value={
                  latestFindings.filter(
                    (finding) => finding.severity === "critical",
                  ).length
                }
                tone="red"
              />
              <ExposureCell
                label="High Findings"
                value={
                  latestFindings.filter(
                    (finding) => finding.severity === "high",
                  ).length
                }
                tone="amber"
              />
              <ExposureCell
                label="Redacted Events"
                value={
                  events.filter((event) => event.status === "redacted").length
                }
                tone="cyan"
              />
            </div>
            <div className="mt-4 divide-y divide-line">
              {latestFindings.slice(0, 3).map((finding) => (
                <div key={finding.id} className="py-3 text-sm text-muted">
                  <span className="text-text">{finding.title}</span>
                  <span className="ml-2">{finding.recommendation}</span>
                </div>
              ))}
              {latestFindings.length === 0 ? (
                <EmptyRow label="No secret exposure detected" />
              ) : null}
            </div>
          </Panel>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
          <Panel
            title="Developer Friction Board"
            icon={<Workflow className="h-4 w-4 text-violet" />}
          >
            {clusters.length === 0 ? (
              <EmptyRow label="No repeated friction clusters yet" />
            ) : (
              clusters.map((cluster) => (
                <ClusterRow key={cluster.id} cluster={cluster} />
              ))
            )}
          </Panel>

          <Panel
            title="Platform Recommendations"
            icon={<Zap className="h-4 w-4 text-green" />}
          >
            {insights.length === 0 ? (
              <EmptyRow label="No recommendations generated yet" />
            ) : (
              insights.map((insight) => (
                <InsightRow key={insight.id} insight={insight} />
              ))
            )}
          </Panel>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone: "cyan" | "amber" | "red" | "green";
  icon: React.ReactNode;
}) {
  const toneClass = {
    cyan: "text-cyan",
    amber: "text-amber",
    red: "text-red",
    green: "text-green",
  }[tone];

  return (
    <div className="rounded-lg border border-line bg-panel p-4 shadow-control">
      <div className={`mb-5 ${toneClass}`}>{icon}</div>
      <div className="text-3xl font-semibold tracking-normal">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-line bg-panel shadow-control">
      <div className="flex items-center gap-2 border-b border-line px-4 py-3 text-sm font-medium">
        {icon}
        {title}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function EventRow({ event }: { event: AgentEvent }) {
  return (
    <div className="grid grid-cols-[7rem_1fr_auto] items-center gap-3 px-4 py-3 text-sm">
      <span className="text-muted">{formatTime(event.timestamp)}</span>
      <div className="min-w-0">
        <div className="truncate text-text">
          {event.toolName ?? event.eventType}
        </div>
        <div className="truncate text-xs text-muted">
          {event.redactedSnippet ?? event.action ?? event.source}
        </div>
      </div>
      <Badge severity={event.severity} label={event.status} />
    </div>
  );
}

function FindingRow({ finding }: { finding: SecurityFinding }) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text">{finding.title}</div>
        <Badge severity={finding.severity} label={finding.severity} />
      </div>
      <p className="text-sm leading-6 text-muted">{finding.recommendation}</p>
    </div>
  );
}

function ClusterRow({ cluster }: { cluster: FrictionCluster }) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text">{cluster.title}</div>
        <span className="rounded-md border border-line bg-panel2 px-2 py-1 text-xs text-muted">
          {cluster.occurrences}x
        </span>
      </div>
      <p className="text-sm leading-6 text-muted">{cluster.summary}</p>
    </div>
  );
}

function InsightRow({ insight }: { insight: DeveloperInsight }) {
  return (
    <div className="border-b border-line py-3 last:border-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-text">{insight.title}</div>
        <Badge severity={insight.severity} label={insight.category} />
      </div>
      <p className="text-sm leading-6 text-muted">{insight.recommendation}</p>
    </div>
  );
}

function ExposureCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "cyan" | "amber" | "red";
}) {
  const toneClass = {
    cyan: "text-cyan",
    amber: "text-amber",
    red: "text-red",
  }[tone];
  return (
    <div className="rounded-md border border-line bg-panel2 p-3">
      <div className={`text-2xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return <div className="px-4 py-8 text-sm text-muted">{label}</div>;
}

function Badge({ severity, label }: { severity: Severity; label: string }) {
  const tone = {
    critical: "border-red/40 bg-red/10 text-red",
    high: "border-red/40 bg-red/10 text-red",
    medium: "border-amber/40 bg-amber/10 text-amber",
    low: "border-cyan/40 bg-cyan/10 text-cyan",
    info: "border-line bg-panel2 text-muted",
  }[severity];

  return (
    <span
      className={`whitespace-nowrap rounded-md border px-2 py-1 text-xs ${tone}`}
    >
      {label}
    </span>
  );
}

function LatencyMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "cyan" | "amber" | "red" | "green";
}) {
  const toneClass = {
    cyan: "text-cyan",
    amber: "text-amber",
    red: "text-red",
    green: "text-green",
  }[tone];

  return (
    <div className="rounded-md border border-line bg-panel2 p-3">
      <div className={`text-xl font-semibold ${toneClass}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

function riskTone(score: number): "cyan" | "amber" | "red" | "green" {
  if (score >= 70) {
    return "red";
  }
  if (score >= 35) {
    return "amber";
  }
  return score > 0 ? "cyan" : "green";
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "2-digit",
  }).format(new Date(value));
}
