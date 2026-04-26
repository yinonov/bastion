import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import type { AgentEvent } from "./schemas.js";
import { AgentEventSchema } from "./schemas.js";
import { redactUnknown } from "./redaction.js";
import type { BastionConfig, PolicyDecision } from "./schemas.js";

export type ClaudeHookResponse = {
  continue?: boolean;
  stopReason?: string;
  suppressOutput?: boolean;
  systemMessage?: string;
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: "allow" | "deny" | "ask";
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
  decision?: "block";
  reason?: string;
};

export function normalizeClaudeHook(input: unknown, config: BastionConfig): AgentEvent {
  const payload = asRecord(input);
  const eventName = String(payload.hook_event_name ?? "UserPromptSubmit");
  const toolName = typeof payload.tool_name === "string" ? payload.tool_name : undefined;
  const toolInput = asRecord(payload.tool_input);
  const prompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
  const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
  const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
  const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
  const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : undefined;
  const promptTokens = extractPromptTokenCount(payload);
  const snippetSource = prompt ?? command ?? filePath ?? input;
  const redacted = redactUnknown(snippetSource, config.redaction.rules, config.capture.snippetMaxChars);

  const base = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "claude-code" as const,
    eventType: coerceClaudeEventType(eventName),
    status: "observed" as const,
    severity: "info" as const,
    machineId: hostname(),
    redactedSnippet: redacted.text,
    rawPayload: config.capture.rawPayload ? input : undefined,
    metadata: {
      permissionMode: payload.permission_mode,
      transcriptPath: payload.transcript_path,
      toolUseId: payload.tool_use_id,
      command,
      file_path: filePath,
      path: toolInput.path,
      promptLength: prompt?.length ?? 0,
      promptTokens
    }
  };

  return AgentEventSchema.parse({
    ...base,
    sessionId,
    projectPath: cwd,
    toolName,
    action: command ?? filePath ?? prompt
  });
}

export function toClaudeHookResponse(eventType: AgentEvent["eventType"], decision: PolicyDecision): ClaudeHookResponse {
  if (eventType === "PreToolUse") {
    return {
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: toPermissionDecision(decision.decision),
        permissionDecisionReason: decision.reason
      }
    };
  }

  if (eventType === "UserPromptSubmit" && decision.decision === "deny") {
    return {
      continue: false,
      stopReason: decision.reason,
      suppressOutput: true
    };
  }

  if ((eventType === "PostToolUse" || eventType === "PostToolUseFailure") && decision.decision === "deny") {
    return {
      decision: "block",
      reason: decision.reason,
      suppressOutput: true,
      hookSpecificOutput: {
        hookEventName: eventType,
        additionalContext: "Bastion blocked or flagged this tool result. Re-plan with a safer action."
      }
    };
  }

  if (decision.decision === "redact") {
    return {
      suppressOutput: true,
      systemMessage: "Bastion redacted sensitive context before logging."
    };
  }

  return {
    suppressOutput: true
  };
}

function toPermissionDecision(decision: PolicyDecision["decision"]): "allow" | "deny" | "ask" {
  if (decision === "deny") {
    return "deny";
  }
  if (decision === "ask") {
    return "ask";
  }
  return "allow";
}

function coerceClaudeEventType(value: string): AgentEvent["eventType"] {
  const allowed: AgentEvent["eventType"][] = [
    "UserPromptSubmit",
    "PreToolUse",
    "PostToolUse",
    "PostToolUseFailure",
    "SessionStart",
    "SessionEnd"
  ];
  return allowed.includes(value as AgentEvent["eventType"]) ? value as AgentEvent["eventType"] : "UserPromptSubmit";
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function extractPromptTokenCount(payload: Record<string, unknown>): number | undefined {
  const metadata = asRecord(payload.metadata);
  const usage = asRecord(payload.usage);

  const candidates: unknown[] = [
    payload.prompt_tokens,
    payload.input_tokens,
    payload.promptTokenCount,
    usage.prompt_tokens,
    usage.input_tokens,
    metadata.prompt_tokens,
    metadata.input_tokens,
    metadata.promptTokenCount
  ];

  for (const candidate of candidates) {
    const coerced = coerceTokenCount(candidate);
    if (coerced !== undefined) {
      return coerced;
    }
  }

  return undefined;
}

function coerceTokenCount(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return Number(value);
  }
  return undefined;
}
