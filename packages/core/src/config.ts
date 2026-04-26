import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BastionConfigSchema, type BastionConfig, type McpServerConfig } from "./schemas.js";

const defaultConfig = BastionConfigSchema.parse({});

export function getDefaultConfig(): BastionConfig {
  return structuredClone(defaultConfig);
}

export function resolveConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, "bastion.config.json");
}

export function resolveUserConfigPath(homePath = homedir()): string {
  return resolve(homePath, ".config", "bastion", "bastion.config.json");
}

export async function loadConfig(cwd = process.cwd(), homePath = homedir()): Promise<BastionConfig> {
  const projectPath = resolveConfigPath(cwd);
  const userPath = resolveUserConfigPath(homePath);

  for (const path of [projectPath, userPath]) {
    const config = await readConfigFile(path);
    if (config) {
      return config;
    }
  }

  return getDefaultConfig();
}

async function readConfigFile(path: string): Promise<BastionConfig | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    return BastionConfigSchema.parse(JSON.parse(raw));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function writeDefaultConfig(cwd = process.cwd()): Promise<string> {
  const path = resolveConfigPath(cwd);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(getDefaultConfig(), null, 2)}\n`, "utf8");
  return path;
}

export async function saveConfig(config: BastionConfig, cwd = process.cwd()): Promise<string> {
  const path = resolveConfigPath(cwd);
  const parsed = BastionConfigSchema.parse(config);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  return path;
}

export async function addMcpServer(name: string, server: McpServerConfig, cwd = process.cwd()): Promise<BastionConfig> {
  const config = await loadConfig(cwd);
  config.mcp.servers[name] = server;
  await saveConfig(config, cwd);
  return config;
}

export function resolveSqlitePath(config: BastionConfig, cwd = process.cwd()): string {
  const configured = config.exporters.localSqlite.path;
  return isAbsolute(configured) ? configured : join(cwd, configured);
}

export function getPackageRoot(importMetaUrl: string): string {
  return dirname(fileURLToPath(importMetaUrl));
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
