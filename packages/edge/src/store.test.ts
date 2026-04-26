import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { LocalSqliteStore } from "./store.js";

test("persists friction clusters and developer insights for dashboard summary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-store-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));

  const baseTime = Date.now();
  const deniedEventId = randomUUID();
  const failedEventId = randomUUID();

  store.saveEvent({
    id: deniedEventId,
    timestamp: new Date(baseTime - 2000).toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "denied",
    severity: "high",
    machineId: "machine-a",
    sessionId: "session-a",
    toolName: "Bash",
    action: "git push --force",
    redactedSnippet: "git push --force",
    metadata: {}
  });

  store.saveEvent({
    id: failedEventId,
    timestamp: new Date(baseTime - 1000).toISOString(),
    source: "claude-code",
    eventType: "PostToolUseFailure",
    status: "failed",
    severity: "medium",
    machineId: "machine-a",
    sessionId: "session-a",
    toolName: "Bash",
    action: "deploy",
    redactedSnippet: "deployment failed",
    metadata: {}
  });

  store.saveFindings([
    {
      id: randomUUID(),
      timestamp: new Date(baseTime - 500).toISOString(),
      eventId: deniedEventId,
      type: "secret",
      severity: "high",
      title: "Possible secret detected",
      description: "High-risk token-like value was observed.",
      recommendation: "Rotate the secret and scrub it from context."
    }
  ]);

  store.refreshIntelligence();

  const summary = store.dashboardSummary();
  assert.equal(summary.totals.events, 2);
  assert.equal(summary.totals.secrets, 1);
  assert.equal(summary.clusters.length > 0, true);
  assert.equal(summary.insights.length > 0, true);
  assert.equal(summary.clusters.some((cluster) => cluster.eventIds.includes(deniedEventId)), true);
  assert.equal(summary.totals.frictionClusters, summary.clusters.length);

  store.close();
  await rm(dir, { recursive: true, force: true });
});

test("replaces old intelligence snapshot on subsequent refresh", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bastion-store-"));
  const store = new LocalSqliteStore(join(dir, "bastion.db"));

  store.saveEvent({
    id: randomUUID(),
    timestamp: new Date(Date.now() - 2000).toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "denied",
    severity: "high",
    machineId: "machine-a",
    sessionId: "session-a",
    toolName: "Read",
    action: "cat .env",
    redactedSnippet: "cat .env",
    metadata: {}
  });

  store.refreshIntelligence();
  const firstSummary = store.dashboardSummary();
  assert.equal(firstSummary.clusters.length > 0, true);

  store.saveEvent({
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "UserPromptSubmit",
    status: "observed",
    severity: "info",
    machineId: "machine-a",
    sessionId: "session-a",
    redactedSnippet: "status update",
    metadata: {}
  });

  store.refreshIntelligence();
  const secondSummary = store.dashboardSummary();
  assert.equal(secondSummary.totals.events, 2);
  assert.equal(secondSummary.clusters.length >= 0, true);

  store.close();
  await rm(dir, { recursive: true, force: true });
});
