import { type BastionConfig, type McpServerConfig } from "./schemas.js";
export declare function getDefaultConfig(): BastionConfig;
export declare function resolveConfigPath(cwd?: string): string;
export declare function loadConfig(cwd?: string): Promise<BastionConfig>;
export declare function writeDefaultConfig(cwd?: string): Promise<string>;
export declare function saveConfig(config: BastionConfig, cwd?: string): Promise<string>;
export declare function addMcpServer(name: string, server: McpServerConfig, cwd?: string): Promise<BastionConfig>;
export declare function resolveSqlitePath(config: BastionConfig, cwd?: string): string;
export declare function getPackageRoot(importMetaUrl: string): string;
