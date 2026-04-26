import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { buildFrictionClusters, estimateShadowSpend } from "./index.js";
import type { AgentEvent } from "@bastion/core";

test("clusters denied tool events", () => {
  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "denied",
    severity: "high",
    machineId: "test",
    toolName: "Bash",
    redactedSnippet: "git push --force",
    metadata: {}
  };

  const clusters = buildFrictionClusters([event]);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0]?.signal, "denied_action");
});

test("estimates spend from captured prompt token counts", () => {
  const spend = estimateShadowSpend([
    {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: "claude-code",
      eventType: "UserPromptSubmit",
      status: "observed",
      severity: "info",
      machineId: "test",
      metadata: { promptTokens: 1000 }
    }
  ]);

  assert.equal(spend, 0.003);
});

test("falls back to prompt length when token counts are absent", () => {
  const spend = estimateShadowSpend([
    {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: "claude-code",
      eventType: "UserPromptSubmit",
      status: "observed",
      severity: "info",
      machineId: "test",
      metadata: { promptLength: 4000 }
    }
  ]);

  assert.equal(spend, 0.003);
});
