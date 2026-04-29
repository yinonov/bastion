import { randomUUID } from "node:crypto";
import { redactUnknown } from "./redaction.js";
export function evaluatePolicy(event, config) {
    const findings = [];
    const customRules = config.redaction.rules;
    const snippet = redactUnknown(event.rawPayload ?? event.redactedSnippet ?? event.metadata, customRules, config.capture.snippetMaxChars);
    let status = event.status;
    let severity = event.severity;
    let decision = "allow";
    let reason = "Allowed by Bastion policy.";
    const redactedFields = snippet.matches.map((match) => match.rule);
    if (snippet.matches.length > 0) {
        findings.push(makeFinding({
            eventId: event.id,
            type: "secret",
            severity: "critical",
            title: "Secret-like value detected in agent context",
            description: `Bastion detected ${snippet.matches.map((match) => match.rule).join(", ")} in this event.`,
            evidenceSnippet: snippet.text,
            recommendation: "Rotate exposed credentials if this left the workstation. Add a narrower rule or block this workflow."
        }));
        severity = "critical";
        if (config.policies.secrets.blockOnDetection) {
            decision = "deny";
            reason = "Blocked because the agent event contains secret-like material.";
            status = "denied";
        }
        else {
            decision = "redact";
            reason = "Allowed after redacting secret-like material.";
            status = "redacted";
        }
    }
    const toolDecision = evaluateToolPolicy(event, config);
    if (toolDecision) {
        findings.push(toolDecision.finding);
        decision = toolDecision.decision;
        reason = toolDecision.reason;
        status = toolDecision.status;
        severity = maxSeverity(severity, toolDecision.finding.severity);
    }
    const dangerousCommand = detectDangerousCommand(event, config);
    if (dangerousCommand) {
        findings.push(dangerousCommand);
        decision = "deny";
        reason = "Blocked because the command matches a dangerous command policy.";
        status = "denied";
        severity = maxSeverity(severity, dangerousCommand.severity);
    }
    const protectedPath = detectProtectedPath(event, config);
    if (protectedPath) {
        findings.push(protectedPath);
        if (decision !== "deny") {
            decision = "ask";
            reason = "Requires confirmation because the tool touches a protected path.";
            status = "asked";
        }
        severity = maxSeverity(severity, protectedPath.severity);
    }
    if (event.rawPayload !== undefined && !config.capture.rawPayload) {
        findings.push(makeFinding({
            eventId: event.id,
            type: "raw_payload_disabled",
            severity: "info",
            title: "Raw payload omitted by privacy policy",
            description: "Bastion stored metadata and redacted snippets only. Raw payload capture is disabled.",
            recommendation: "Enable capture.rawPayload only for local debugging or explicit approved pilots."
        }));
    }
    return {
        event: {
            ...event,
            status,
            severity,
            redactedSnippet: snippet.text,
            rawPayload: config.capture.rawPayload ? event.rawPayload : undefined,
            metadata: {
                ...event.metadata,
                redactionMatches: snippet.matches
            }
        },
        decision: {
            decision,
            reason,
            severity,
            findingIds: findings.map((finding) => finding.id),
            redactedFields
        },
        findings
    };
}
function evaluateToolPolicy(event, config) {
    if (!event.toolName) {
        return null;
    }
    const denied = config.policies.tools.denied;
    const allowed = config.policies.tools.allowed;
    const ask = config.policies.tools.ask;
    if (matchesAny(event.toolName, denied)) {
        return {
            decision: "deny",
            status: "denied",
            reason: `Blocked because ${event.toolName} is denied by policy.`,
            finding: makeFinding({
                eventId: event.id,
                type: "disallowed_tool",
                severity: "high",
                title: `Disallowed tool attempted: ${event.toolName}`,
                description: `The agent attempted to use ${event.toolName}, which is denied in Bastion policy.`,
                evidenceSnippet: event.redactedSnippet,
                recommendation: "Keep the tool denied or create a narrow allow rule for trusted repositories only."
            })
        };
    }
    if (allowed.length > 0 && !matchesAny(event.toolName, allowed)) {
        return {
            decision: "deny",
            status: "denied",
            reason: `Blocked because ${event.toolName} is not in the allowlist.`,
            finding: makeFinding({
                eventId: event.id,
                type: "disallowed_tool",
                severity: "high",
                title: `Tool not allowlisted: ${event.toolName}`,
                description: "The policy is in allowlist mode and this tool is not approved.",
                evidenceSnippet: event.redactedSnippet,
                recommendation: "Add this tool to policies.tools.allowed only if Platform/DevEx approves its risk profile."
            })
        };
    }
    if (matchesAny(event.toolName, ask)) {
        return {
            decision: "ask",
            status: "asked",
            reason: `${event.toolName} requires confirmation by policy.`,
            finding: makeFinding({
                eventId: event.id,
                type: "disallowed_tool",
                severity: "medium",
                title: `Human confirmation required: ${event.toolName}`,
                description: "The tool is configured for explicit confirmation before execution.",
                evidenceSnippet: event.redactedSnippet,
                recommendation: "Keep this as ask-mode until the workflow is proven safe and repeatable."
            })
        };
    }
    return null;
}
function detectDangerousCommand(event, config) {
    if (event.toolName !== "Bash") {
        return null;
    }
    const command = String(event.metadata.command ?? event.action ?? "");
    if (!command) {
        return null;
    }
    const matched = config.policies.dangerousCommands.find((pattern) => wildcardMatch(command, pattern));
    if (!matched) {
        return null;
    }
    return makeFinding({
        eventId: event.id,
        type: "dangerous_command",
        severity: "critical",
        title: "Dangerous shell command blocked",
        description: `The command matched dangerous command policy: ${matched}`,
        evidenceSnippet: command,
        recommendation: "Require human review. If legitimate, replace the command with a narrower, reversible operation."
    });
}
function detectProtectedPath(event, config) {
    const candidate = [
        event.metadata.file_path,
        event.metadata.path,
        event.metadata.command,
        event.action
    ].filter((value) => typeof value === "string").join(" ");
    if (!candidate) {
        return null;
    }
    const matched = config.policies.protectedPaths.find((path) => candidate.includes(path));
    if (!matched) {
        return null;
    }
    return makeFinding({
        eventId: event.id,
        type: "disallowed_path",
        severity: "medium",
        title: `Protected path touched: ${matched}`,
        description: "The agent attempted to read or modify a path that is sensitive by default.",
        evidenceSnippet: candidate,
        recommendation: "Review whether the agent needs this path. Prefer scoped files over broad credential directories."
    });
}
function makeFinding(input) {
    return {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        ...input
    };
}
function matchesAny(value, patterns) {
    return patterns.some((pattern) => wildcardMatch(value, pattern));
}
function wildcardMatch(value, pattern) {
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`, "i").test(value);
}
function maxSeverity(a, b) {
    const order = ["info", "low", "medium", "high", "critical"];
    return order.indexOf(a) >= order.indexOf(b) ? a : b;
}
