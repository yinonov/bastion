import { z } from "zod";
export declare const SeveritySchema: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
export declare const AgentSourceSchema: z.ZodEnum<["claude-code", "mcp", "scanner"]>;
export declare const AgentEventTypeSchema: z.ZodEnum<["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionStart", "SessionEnd", "McpRequest", "McpResponse", "ScanFinding"]>;
export declare const AgentEventStatusSchema: z.ZodEnum<["allowed", "denied", "asked", "redacted", "failed", "observed"]>;
export declare const AgentEventSchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    source: z.ZodEnum<["claude-code", "mcp", "scanner"]>;
    eventType: z.ZodEnum<["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionStart", "SessionEnd", "McpRequest", "McpResponse", "ScanFinding"]>;
    status: z.ZodDefault<z.ZodEnum<["allowed", "denied", "asked", "redacted", "failed", "observed"]>>;
    severity: z.ZodDefault<z.ZodEnum<["info", "low", "medium", "high", "critical"]>>;
    sessionId: z.ZodOptional<z.ZodString>;
    machineId: z.ZodString;
    projectPath: z.ZodOptional<z.ZodString>;
    toolName: z.ZodOptional<z.ZodString>;
    action: z.ZodOptional<z.ZodString>;
    redactedSnippet: z.ZodOptional<z.ZodString>;
    latencyMs: z.ZodOptional<z.ZodNumber>;
    rawPayload: z.ZodOptional<z.ZodUnknown>;
    metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: string;
    source: "claude-code" | "mcp" | "scanner";
    eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
    status: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed";
    severity: "info" | "low" | "medium" | "high" | "critical";
    machineId: string;
    metadata: Record<string, unknown>;
    sessionId?: string | undefined;
    projectPath?: string | undefined;
    toolName?: string | undefined;
    action?: string | undefined;
    redactedSnippet?: string | undefined;
    latencyMs?: number | undefined;
    rawPayload?: unknown;
}, {
    id: string;
    timestamp: string;
    source: "claude-code" | "mcp" | "scanner";
    eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
    machineId: string;
    status?: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed" | undefined;
    severity?: "info" | "low" | "medium" | "high" | "critical" | undefined;
    sessionId?: string | undefined;
    projectPath?: string | undefined;
    toolName?: string | undefined;
    action?: string | undefined;
    redactedSnippet?: string | undefined;
    latencyMs?: number | undefined;
    rawPayload?: unknown;
    metadata?: Record<string, unknown> | undefined;
}>;
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export declare const PolicyDecisionSchema: z.ZodObject<{
    decision: z.ZodEnum<["allow", "deny", "ask", "redact"]>;
    reason: z.ZodString;
    severity: z.ZodDefault<z.ZodEnum<["info", "low", "medium", "high", "critical"]>>;
    findingIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    redactedFields: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    severity: "info" | "low" | "medium" | "high" | "critical";
    decision: "allow" | "deny" | "ask" | "redact";
    reason: string;
    findingIds: string[];
    redactedFields: string[];
}, {
    decision: "allow" | "deny" | "ask" | "redact";
    reason: string;
    severity?: "info" | "low" | "medium" | "high" | "critical" | undefined;
    findingIds?: string[] | undefined;
    redactedFields?: string[] | undefined;
}>;
export type PolicyDecision = z.infer<typeof PolicyDecisionSchema>;
export declare const SecurityFindingSchema: z.ZodObject<{
    id: z.ZodString;
    timestamp: z.ZodString;
    eventId: z.ZodOptional<z.ZodString>;
    type: z.ZodEnum<["secret", "dangerous_command", "disallowed_tool", "disallowed_path", "raw_payload_disabled", "mcp_server_not_approved", "ip_exposure"]>;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    title: z.ZodString;
    description: z.ZodString;
    evidenceSnippet: z.ZodOptional<z.ZodString>;
    recommendation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    timestamp: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
    title: string;
    description: string;
    recommendation: string;
    eventId?: string | undefined;
    evidenceSnippet?: string | undefined;
}, {
    id: string;
    timestamp: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
    title: string;
    description: string;
    recommendation: string;
    eventId?: string | undefined;
    evidenceSnippet?: string | undefined;
}>;
export type SecurityFinding = z.infer<typeof SecurityFindingSchema>;
export declare const FrictionClusterSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    signal: z.ZodEnum<["repeated_error", "denied_action", "tool_failure", "high_latency", "prompt_loop"]>;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    eventIds: z.ZodArray<z.ZodString, "many">;
    occurrences: z.ZodNumber;
    impactedSessions: z.ZodNumber;
    firstSeen: z.ZodString;
    lastSeen: z.ZodString;
    summary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
    eventIds: string[];
    occurrences: number;
    impactedSessions: number;
    firstSeen: string;
    lastSeen: string;
    summary: string;
}, {
    id: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
    eventIds: string[];
    occurrences: number;
    impactedSessions: number;
    firstSeen: string;
    lastSeen: string;
    summary: string;
}>;
export type FrictionCluster = z.infer<typeof FrictionClusterSchema>;
export declare const DeveloperInsightSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
    category: z.ZodEnum<["security", "friction", "spend", "governance"]>;
    recommendation: z.ZodString;
    evidence: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    clusterId: z.ZodOptional<z.ZodString>;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    id: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    recommendation: string;
    category: "security" | "friction" | "spend" | "governance";
    evidence: string[];
    createdAt: string;
    clusterId?: string | undefined;
}, {
    id: string;
    severity: "info" | "low" | "medium" | "high" | "critical";
    title: string;
    recommendation: string;
    category: "security" | "friction" | "spend" | "governance";
    createdAt: string;
    evidence?: string[] | undefined;
    clusterId?: string | undefined;
}>;
export type DeveloperInsight = z.infer<typeof DeveloperInsightSchema>;
export declare const RedactionRuleSchema: z.ZodObject<{
    name: z.ZodString;
    pattern: z.ZodString;
    replacement: z.ZodDefault<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    name: string;
    pattern: string;
    replacement: string;
}, {
    name: string;
    pattern: string;
    replacement?: string | undefined;
}>;
export type RedactionRule = z.infer<typeof RedactionRuleSchema>;
export declare const McpServerConfigSchema: z.ZodDiscriminatedUnion<"transport", [z.ZodObject<{
    transport: z.ZodLiteral<"http">;
    url: z.ZodString;
    headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    transport: "http";
    url: string;
    headers: Record<string, string>;
    enabled: boolean;
}, {
    transport: "http";
    url: string;
    headers?: Record<string, string> | undefined;
    enabled?: boolean | undefined;
}>, z.ZodObject<{
    transport: z.ZodLiteral<"stdio">;
    command: z.ZodString;
    args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    enabled: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    transport: "stdio";
    enabled: boolean;
    command: string;
    args: string[];
}, {
    transport: "stdio";
    command: string;
    enabled?: boolean | undefined;
    args?: string[] | undefined;
}>]>;
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export declare const BastionConfigSchema: z.ZodObject<{
    capture: z.ZodDefault<z.ZodObject<{
        rawPayload: z.ZodDefault<z.ZodBoolean>;
        snippetMaxChars: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        rawPayload: boolean;
        snippetMaxChars: number;
    }, {
        rawPayload?: boolean | undefined;
        snippetMaxChars?: number | undefined;
    }>>;
    redaction: z.ZodDefault<z.ZodObject<{
        rules: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            pattern: z.ZodString;
            replacement: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            pattern: string;
            replacement: string;
        }, {
            name: string;
            pattern: string;
            replacement?: string | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        rules: {
            name: string;
            pattern: string;
            replacement: string;
        }[];
    }, {
        rules?: {
            name: string;
            pattern: string;
            replacement?: string | undefined;
        }[] | undefined;
    }>>;
    policies: z.ZodDefault<z.ZodObject<{
        tools: z.ZodDefault<z.ZodObject<{
            allowed: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            denied: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            ask: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            allowed: string[];
            denied: string[];
            ask: string[];
        }, {
            allowed?: string[] | undefined;
            denied?: string[] | undefined;
            ask?: string[] | undefined;
        }>>;
        secrets: z.ZodDefault<z.ZodObject<{
            blockOnDetection: z.ZodDefault<z.ZodBoolean>;
            customPatterns: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            blockOnDetection: boolean;
            customPatterns: string[];
        }, {
            blockOnDetection?: boolean | undefined;
            customPatterns?: string[] | undefined;
        }>>;
        dangerousCommands: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        protectedPaths: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        tools: {
            allowed: string[];
            denied: string[];
            ask: string[];
        };
        secrets: {
            blockOnDetection: boolean;
            customPatterns: string[];
        };
        dangerousCommands: string[];
        protectedPaths: string[];
    }, {
        tools?: {
            allowed?: string[] | undefined;
            denied?: string[] | undefined;
            ask?: string[] | undefined;
        } | undefined;
        secrets?: {
            blockOnDetection?: boolean | undefined;
            customPatterns?: string[] | undefined;
        } | undefined;
        dangerousCommands?: string[] | undefined;
        protectedPaths?: string[] | undefined;
    }>>;
    mcp: z.ZodDefault<z.ZodObject<{
        servers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodDiscriminatedUnion<"transport", [z.ZodObject<{
            transport: z.ZodLiteral<"http">;
            url: z.ZodString;
            headers: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodString>>;
            enabled: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            transport: "http";
            url: string;
            headers: Record<string, string>;
            enabled: boolean;
        }, {
            transport: "http";
            url: string;
            headers?: Record<string, string> | undefined;
            enabled?: boolean | undefined;
        }>, z.ZodObject<{
            transport: z.ZodLiteral<"stdio">;
            command: z.ZodString;
            args: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            enabled: z.ZodDefault<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            transport: "stdio";
            enabled: boolean;
            command: string;
            args: string[];
        }, {
            transport: "stdio";
            command: string;
            enabled?: boolean | undefined;
            args?: string[] | undefined;
        }>]>>>;
    }, "strip", z.ZodTypeAny, {
        servers: Record<string, {
            transport: "http";
            url: string;
            headers: Record<string, string>;
            enabled: boolean;
        } | {
            transport: "stdio";
            enabled: boolean;
            command: string;
            args: string[];
        }>;
    }, {
        servers?: Record<string, {
            transport: "http";
            url: string;
            headers?: Record<string, string> | undefined;
            enabled?: boolean | undefined;
        } | {
            transport: "stdio";
            command: string;
            enabled?: boolean | undefined;
            args?: string[] | undefined;
        }> | undefined;
    }>>;
    exporters: z.ZodDefault<z.ZodObject<{
        localSqlite: z.ZodDefault<z.ZodObject<{
            path: z.ZodDefault<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            path: string;
        }, {
            path?: string | undefined;
        }>>;
        cloud: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            endpoint: z.ZodOptional<z.ZodString>;
            apiKeyEnv: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            enabled: boolean;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        }, {
            enabled?: boolean | undefined;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        localSqlite: {
            path: string;
        };
        cloud: {
            enabled: boolean;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        };
    }, {
        localSqlite?: {
            path?: string | undefined;
        } | undefined;
        cloud?: {
            enabled?: boolean | undefined;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        } | undefined;
    }>>;
    edge: z.ZodDefault<z.ZodObject<{
        host: z.ZodDefault<z.ZodString>;
        port: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        host: string;
        port: number;
    }, {
        host?: string | undefined;
        port?: number | undefined;
    }>>;
    dashboard: z.ZodDefault<z.ZodObject<{
        port: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        port: number;
    }, {
        port?: number | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    mcp: {
        servers: Record<string, {
            transport: "http";
            url: string;
            headers: Record<string, string>;
            enabled: boolean;
        } | {
            transport: "stdio";
            enabled: boolean;
            command: string;
            args: string[];
        }>;
    };
    capture: {
        rawPayload: boolean;
        snippetMaxChars: number;
    };
    redaction: {
        rules: {
            name: string;
            pattern: string;
            replacement: string;
        }[];
    };
    policies: {
        tools: {
            allowed: string[];
            denied: string[];
            ask: string[];
        };
        secrets: {
            blockOnDetection: boolean;
            customPatterns: string[];
        };
        dangerousCommands: string[];
        protectedPaths: string[];
    };
    exporters: {
        localSqlite: {
            path: string;
        };
        cloud: {
            enabled: boolean;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        };
    };
    edge: {
        host: string;
        port: number;
    };
    dashboard: {
        port: number;
    };
}, {
    mcp?: {
        servers?: Record<string, {
            transport: "http";
            url: string;
            headers?: Record<string, string> | undefined;
            enabled?: boolean | undefined;
        } | {
            transport: "stdio";
            command: string;
            enabled?: boolean | undefined;
            args?: string[] | undefined;
        }> | undefined;
    } | undefined;
    capture?: {
        rawPayload?: boolean | undefined;
        snippetMaxChars?: number | undefined;
    } | undefined;
    redaction?: {
        rules?: {
            name: string;
            pattern: string;
            replacement?: string | undefined;
        }[] | undefined;
    } | undefined;
    policies?: {
        tools?: {
            allowed?: string[] | undefined;
            denied?: string[] | undefined;
            ask?: string[] | undefined;
        } | undefined;
        secrets?: {
            blockOnDetection?: boolean | undefined;
            customPatterns?: string[] | undefined;
        } | undefined;
        dangerousCommands?: string[] | undefined;
        protectedPaths?: string[] | undefined;
    } | undefined;
    exporters?: {
        localSqlite?: {
            path?: string | undefined;
        } | undefined;
        cloud?: {
            enabled?: boolean | undefined;
            endpoint?: string | undefined;
            apiKeyEnv?: string | undefined;
        } | undefined;
    } | undefined;
    edge?: {
        host?: string | undefined;
        port?: number | undefined;
    } | undefined;
    dashboard?: {
        port?: number | undefined;
    } | undefined;
}>;
export type BastionConfig = z.infer<typeof BastionConfigSchema>;
export declare const DashboardSummarySchema: z.ZodObject<{
    generatedAt: z.ZodString;
    riskScore: z.ZodNumber;
    events: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodString;
        source: z.ZodEnum<["claude-code", "mcp", "scanner"]>;
        eventType: z.ZodEnum<["UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "SessionStart", "SessionEnd", "McpRequest", "McpResponse", "ScanFinding"]>;
        status: z.ZodDefault<z.ZodEnum<["allowed", "denied", "asked", "redacted", "failed", "observed"]>>;
        severity: z.ZodDefault<z.ZodEnum<["info", "low", "medium", "high", "critical"]>>;
        sessionId: z.ZodOptional<z.ZodString>;
        machineId: z.ZodString;
        projectPath: z.ZodOptional<z.ZodString>;
        toolName: z.ZodOptional<z.ZodString>;
        action: z.ZodOptional<z.ZodString>;
        redactedSnippet: z.ZodOptional<z.ZodString>;
        latencyMs: z.ZodOptional<z.ZodNumber>;
        rawPayload: z.ZodOptional<z.ZodUnknown>;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        timestamp: string;
        source: "claude-code" | "mcp" | "scanner";
        eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
        status: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed";
        severity: "info" | "low" | "medium" | "high" | "critical";
        machineId: string;
        metadata: Record<string, unknown>;
        sessionId?: string | undefined;
        projectPath?: string | undefined;
        toolName?: string | undefined;
        action?: string | undefined;
        redactedSnippet?: string | undefined;
        latencyMs?: number | undefined;
        rawPayload?: unknown;
    }, {
        id: string;
        timestamp: string;
        source: "claude-code" | "mcp" | "scanner";
        eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
        machineId: string;
        status?: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed" | undefined;
        severity?: "info" | "low" | "medium" | "high" | "critical" | undefined;
        sessionId?: string | undefined;
        projectPath?: string | undefined;
        toolName?: string | undefined;
        action?: string | undefined;
        redactedSnippet?: string | undefined;
        latencyMs?: number | undefined;
        rawPayload?: unknown;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        timestamp: z.ZodString;
        eventId: z.ZodOptional<z.ZodString>;
        type: z.ZodEnum<["secret", "dangerous_command", "disallowed_tool", "disallowed_path", "raw_payload_disabled", "mcp_server_not_approved", "ip_exposure"]>;
        severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
        title: z.ZodString;
        description: z.ZodString;
        evidenceSnippet: z.ZodOptional<z.ZodString>;
        recommendation: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        timestamp: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
        title: string;
        description: string;
        recommendation: string;
        eventId?: string | undefined;
        evidenceSnippet?: string | undefined;
    }, {
        id: string;
        timestamp: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
        title: string;
        description: string;
        recommendation: string;
        eventId?: string | undefined;
        evidenceSnippet?: string | undefined;
    }>, "many">;
    clusters: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        signal: z.ZodEnum<["repeated_error", "denied_action", "tool_failure", "high_latency", "prompt_loop"]>;
        severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
        eventIds: z.ZodArray<z.ZodString, "many">;
        occurrences: z.ZodNumber;
        impactedSessions: z.ZodNumber;
        firstSeen: z.ZodString;
        lastSeen: z.ZodString;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
        eventIds: string[];
        occurrences: number;
        impactedSessions: number;
        firstSeen: string;
        lastSeen: string;
        summary: string;
    }, {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
        eventIds: string[];
        occurrences: number;
        impactedSessions: number;
        firstSeen: string;
        lastSeen: string;
        summary: string;
    }>, "many">;
    insights: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        severity: z.ZodEnum<["info", "low", "medium", "high", "critical"]>;
        category: z.ZodEnum<["security", "friction", "spend", "governance"]>;
        recommendation: z.ZodString;
        evidence: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        clusterId: z.ZodOptional<z.ZodString>;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        recommendation: string;
        category: "security" | "friction" | "spend" | "governance";
        evidence: string[];
        createdAt: string;
        clusterId?: string | undefined;
    }, {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        recommendation: string;
        category: "security" | "friction" | "spend" | "governance";
        createdAt: string;
        evidence?: string[] | undefined;
        clusterId?: string | undefined;
    }>, "many">;
    totals: z.ZodObject<{
        events: z.ZodNumber;
        blocked: z.ZodNumber;
        secrets: z.ZodNumber;
        frictionClusters: z.ZodNumber;
        estimatedSpendUsd: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        secrets: number;
        events: number;
        blocked: number;
        frictionClusters: number;
        estimatedSpendUsd: number;
    }, {
        secrets: number;
        events: number;
        blocked: number;
        frictionClusters: number;
        estimatedSpendUsd: number;
    }>;
}, "strip", z.ZodTypeAny, {
    generatedAt: string;
    riskScore: number;
    events: {
        id: string;
        timestamp: string;
        source: "claude-code" | "mcp" | "scanner";
        eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
        status: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed";
        severity: "info" | "low" | "medium" | "high" | "critical";
        machineId: string;
        metadata: Record<string, unknown>;
        sessionId?: string | undefined;
        projectPath?: string | undefined;
        toolName?: string | undefined;
        action?: string | undefined;
        redactedSnippet?: string | undefined;
        latencyMs?: number | undefined;
        rawPayload?: unknown;
    }[];
    findings: {
        id: string;
        timestamp: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
        title: string;
        description: string;
        recommendation: string;
        eventId?: string | undefined;
        evidenceSnippet?: string | undefined;
    }[];
    clusters: {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
        eventIds: string[];
        occurrences: number;
        impactedSessions: number;
        firstSeen: string;
        lastSeen: string;
        summary: string;
    }[];
    insights: {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        recommendation: string;
        category: "security" | "friction" | "spend" | "governance";
        evidence: string[];
        createdAt: string;
        clusterId?: string | undefined;
    }[];
    totals: {
        secrets: number;
        events: number;
        blocked: number;
        frictionClusters: number;
        estimatedSpendUsd: number;
    };
}, {
    generatedAt: string;
    riskScore: number;
    events: {
        id: string;
        timestamp: string;
        source: "claude-code" | "mcp" | "scanner";
        eventType: "UserPromptSubmit" | "PreToolUse" | "PostToolUse" | "PostToolUseFailure" | "SessionStart" | "SessionEnd" | "McpRequest" | "McpResponse" | "ScanFinding";
        machineId: string;
        status?: "allowed" | "denied" | "asked" | "redacted" | "failed" | "observed" | undefined;
        severity?: "info" | "low" | "medium" | "high" | "critical" | undefined;
        sessionId?: string | undefined;
        projectPath?: string | undefined;
        toolName?: string | undefined;
        action?: string | undefined;
        redactedSnippet?: string | undefined;
        latencyMs?: number | undefined;
        rawPayload?: unknown;
        metadata?: Record<string, unknown> | undefined;
    }[];
    findings: {
        id: string;
        timestamp: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        type: "secret" | "dangerous_command" | "disallowed_tool" | "disallowed_path" | "raw_payload_disabled" | "mcp_server_not_approved" | "ip_exposure";
        title: string;
        description: string;
        recommendation: string;
        eventId?: string | undefined;
        evidenceSnippet?: string | undefined;
    }[];
    clusters: {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        signal: "repeated_error" | "denied_action" | "tool_failure" | "high_latency" | "prompt_loop";
        eventIds: string[];
        occurrences: number;
        impactedSessions: number;
        firstSeen: string;
        lastSeen: string;
        summary: string;
    }[];
    insights: {
        id: string;
        severity: "info" | "low" | "medium" | "high" | "critical";
        title: string;
        recommendation: string;
        category: "security" | "friction" | "spend" | "governance";
        createdAt: string;
        evidence?: string[] | undefined;
        clusterId?: string | undefined;
    }[];
    totals: {
        secrets: number;
        events: number;
        blocked: number;
        frictionClusters: number;
        estimatedSpendUsd: number;
    };
}>;
export type DashboardSummary = z.infer<typeof DashboardSummarySchema>;
