import type { AgentEvent, BastionConfig, PolicyDecision, SecurityFinding } from "./schemas.js";
export type PolicyEvaluation = {
    event: AgentEvent;
    decision: PolicyDecision;
    findings: SecurityFinding[];
};
export declare function evaluatePolicy(event: AgentEvent, config: BastionConfig): PolicyEvaluation;
