import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type InstallHooksOptions = {
  scope: "user" | "project";
  hookCommand: string;
  cwd?: string;
  homeDir?: string;
};

export async function installClaudeHooks(options: InstallHooksOptions): Promise<string> {
  const settingsPath = resolveSettingsPath(options);
  const settings = await readJsonObject(settingsPath);
  const hooks = asRecord(settings.hooks);

  hooks.UserPromptSubmit = upsertHookGroup(hooks.UserPromptSubmit, undefined, options.hookCommand);
  hooks.SessionStart = upsertHookGroup(hooks.SessionStart, undefined, options.hookCommand);
  hooks.SessionEnd = upsertHookGroup(hooks.SessionEnd, undefined, options.hookCommand);
  hooks.PreToolUse = upsertHookGroup(hooks.PreToolUse, "*", options.hookCommand);
  hooks.PostToolUse = upsertHookGroup(hooks.PostToolUse, "*", options.hookCommand);
  hooks.PostToolUseFailure = upsertHookGroup(hooks.PostToolUseFailure, "*", options.hookCommand);

  settings.hooks = hooks;
  await writeJsonAtomic(settingsPath, settings);
  return settingsPath;
}

function resolveSettingsPath(options: InstallHooksOptions): string {
  const cwd = options.cwd ?? process.cwd();
  const homeDir = options.homeDir ?? homedir();
  return options.scope === "user"
    ? join(homeDir, ".claude", "settings.json")
    : join(cwd, ".claude", "settings.json");
}

async function writeJsonAtomic(path: string, value: Record<string, unknown>): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  JSON.parse(serialized);

  const tempPath = `${path}.tmp`;
  await writeFile(tempPath, serialized, "utf8");
  await rename(tempPath, path);
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  try {
    const raw = await readFile(path, "utf8");
    return asRecord(JSON.parse(raw));
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function upsertHookGroup(existing: unknown, matcher: string | undefined, command: string): unknown[] {
  const groups = Array.isArray(existing) ? existing.filter((group) => typeof group === "object" && group !== null) as Record<string, unknown>[] : [];
  const target = groups.find((group) => matcher === undefined ? group.matcher === undefined : group.matcher === matcher);
  const handler = { type: "command", command };

  if (target) {
    const currentHooks = Array.isArray(target.hooks) ? target.hooks as Record<string, unknown>[] : [];
    const hasCommand = currentHooks.some((hook) => hook.command === command);
    target.hooks = hasCommand ? currentHooks : [...currentHooks, handler];
    return groups;
  }

  const group: Record<string, unknown> = { hooks: [handler] };
  if (matcher !== undefined) {
    group.matcher = matcher;
  }
  return [...groups, group];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : {};
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
