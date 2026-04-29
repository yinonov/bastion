import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getDefaultConfig } from "./config.js";
import { evaluatePolicy } from "./policy.js";
import type { AgentEvent } from "./schemas.js";

test("blocks dangerous bash commands", () => {
  const config = getDefaultConfig();
  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "observed",
    severity: "info",
    machineId: "test",
    toolName: "Bash",
    action: "rm -rf /",
    metadata: { command: "rm -rf /" }
  };

  const result = evaluatePolicy(event, config);
  assert.equal(result.decision.decision, "deny");
  assert.equal(result.event.status, "denied");
  assert.ok(result.findings.some((finding) => finding.type === "dangerous_command"));
});

test("redacts secret findings when blockOnDetection is disabled", () => {
  const config = getDefaultConfig();
  config.policies.secrets.blockOnDetection = false;

  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "UserPromptSubmit",
    status: "observed",
    severity: "info",
    machineId: "test",
    action: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456",
    rawPayload: { prompt: "Use token ghp_abcdefghijklmnopqrstuvwxyz123456" },
    metadata: {}
  };

  const result = evaluatePolicy(event, config);
  assert.equal(result.decision.decision, "redact");
  assert.equal(result.event.status, "redacted");
  assert.match(result.event.redactedSnippet ?? "", /\[REDACTED:github-token\]/);
  assert.doesNotMatch(result.event.redactedSnippet ?? "", /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.ok(result.findings.some((finding) => finding.type === "secret"));
});

test("asks before protected path access with a high-severity finding", () => {
  const config = getDefaultConfig();
  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "observed",
    severity: "info",
    machineId: "test",
    toolName: "Write",
    action: "Update SSH config",
    metadata: { file_path: "~/.ssh/config" }
  };

  const result = evaluatePolicy(event, config);
  assert.equal(result.decision.decision, "ask");
  assert.equal(result.event.status, "asked");
  const finding = result.findings.find((candidate) => candidate.type === "disallowed_path");
  assert.ok(finding);
  assert.equal(finding?.severity, "high");
});

test("keeps deny decision when secret detection and ask-listed tool policies both match", () => {
  const config = getDefaultConfig();

  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "observed",
    severity: "info",
    machineId: "test",
    toolName: "Bash",
    action: "echo AKIAIOSFODNN7EXAMPLE",
    metadata: {
      command: "echo AKIAIOSFODNN7EXAMPLE"
    }
  };

  const result = evaluatePolicy(event, config);
  assert.equal(result.decision.decision, "deny");
  assert.equal(result.event.status, "denied");
});

test("keeps deny precedence and finding IDs when secrets, dangerous commands, and protected paths coexist", () => {
  const config = getDefaultConfig();
  config.policies.secrets.blockOnDetection = false;

  const event: AgentEvent = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code",
    eventType: "PreToolUse",
    status: "observed",
    severity: "info",
    machineId: "test",
    toolName: "Bash",
    action: "rm -rf /tmp/test && cat .env",
    rawPayload: { command: "rm -rf /tmp/test && cat .env", token: "ghp_abcdefghijklmnopqrstuvwxyz123456" },
    metadata: {
      command: "rm -rf /tmp/test && cat .env",
      file_path: ".env"
    }
  };

  const result = evaluatePolicy(event, config);
  assert.equal(result.decision.decision, "deny");
  assert.equal(result.decision.severity, "critical");
  assert.equal(result.event.status, "denied");
  const findingTypes = new Set(result.findings.map((finding) => finding.type));
  assert.equal(findingTypes.has("secret"), true);
  assert.equal(findingTypes.has("dangerous_command"), true);
  assert.equal(findingTypes.has("disallowed_path"), true);
  assert.equal(findingTypes.has("raw_payload_disabled"), true);
  assert.deepEqual(new Set(result.decision.findingIds), new Set(result.findings.map((finding) => finding.id)));
});
