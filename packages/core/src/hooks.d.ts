import type { AgentEvent } from "./schemas.js";
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
export declare function normalizeClaudeHook(input: unknown, config: BastionConfig): AgentEvent;
export declare function toClaudeHookResponse(eventType: AgentEvent["eventType"], decision: PolicyDecision): ClaudeHookResponse;
