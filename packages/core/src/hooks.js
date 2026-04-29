import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { AgentEventSchema } from "./schemas.js";
import { redactUnknown } from "./redaction.js";
export function normalizeClaudeHook(input, config) {
    const payload = asRecord(input);
    const eventName = String(payload.hook_event_name ?? "UserPromptSubmit");
    const toolName = typeof payload.tool_name === "string" ? payload.tool_name : undefined;
    const toolInput = asRecord(payload.tool_input);
    const prompt = typeof payload.prompt === "string" ? payload.prompt : undefined;
    const sessionId = typeof payload.session_id === "string" ? payload.session_id : undefined;
    const cwd = typeof payload.cwd === "string" ? payload.cwd : undefined;
    const command = typeof toolInput.command === "string" ? toolInput.command : undefined;
    const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : undefined;
    const snippetSource = prompt ?? command ?? filePath ?? input;
    const redacted = redactUnknown(snippetSource, config.redaction.rules, config.capture.snippetMaxChars);
    const base = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        source: "claude-code",
        eventType: coerceClaudeEventType(eventName),
        status: "observed",
        severity: "info",
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
            promptLength: prompt?.length ?? 0
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
export function toClaudeHookResponse(eventType, decision) {
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
function toPermissionDecision(decision) {
    if (decision === "deny") {
        return "deny";
    }
    if (decision === "ask") {
        return "ask";
    }
    return "allow";
}
function coerceClaudeEventType(value) {
    const allowed = [
        "UserPromptSubmit",
        "PreToolUse",
        "PostToolUse",
        "PostToolUseFailure",
        "SessionStart",
        "SessionEnd"
    ];
    return allowed.includes(value) ? value : "UserPromptSubmit";
}
function asRecord(value) {
    return typeof value === "object" && value !== null ? value : {};
}
