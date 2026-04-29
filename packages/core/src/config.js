import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BastionConfigSchema } from "./schemas.js";
const defaultConfig = BastionConfigSchema.parse({});
export function getDefaultConfig() {
    return structuredClone(defaultConfig);
}
export function resolveConfigPath(cwd = process.cwd()) {
    return resolve(cwd, "bastion.config.json");
}
export async function loadConfig(cwd = process.cwd()) {
    const path = resolveConfigPath(cwd);
    try {
        const raw = await readFile(path, "utf8");
        return BastionConfigSchema.parse(JSON.parse(raw));
    }
    catch (error) {
        if (isNodeError(error) && error.code === "ENOENT") {
            return getDefaultConfig();
        }
        throw error;
    }
}
export async function writeDefaultConfig(cwd = process.cwd()) {
    const path = resolveConfigPath(cwd);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(getDefaultConfig(), null, 2)}\n`, "utf8");
    return path;
}
export async function saveConfig(config, cwd = process.cwd()) {
    const path = resolveConfigPath(cwd);
    const parsed = BastionConfigSchema.parse(config);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
    return path;
}
export async function addMcpServer(name, server, cwd = process.cwd()) {
    const config = await loadConfig(cwd);
    config.mcp.servers[name] = server;
    await saveConfig(config, cwd);
    return config;
}
export function resolveSqlitePath(config, cwd = process.cwd()) {
    const configured = config.exporters.localSqlite.path;
    return isAbsolute(configured) ? configured : join(cwd, configured);
}
export function getPackageRoot(importMetaUrl) {
    return dirname(fileURLToPath(importMetaUrl));
}
function isNodeError(error) {
    return error instanceof Error && "code" in error;
}
