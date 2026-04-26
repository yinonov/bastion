import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { installClaudeHooks } from "./install-hooks.js";

test("installClaudeHooks merges into existing config and keeps custom hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "bastion-cli-hooks-"));
  const projectDir = join(root, "project");
  const settingsPath = join(projectDir, ".claude", "settings.json");
  await mkdir(join(projectDir, ".claude"), { recursive: true });

  await writeFile(
    settingsPath,
    JSON.stringify({
      hooks: {
        PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command: "echo preserve-me" }] }],
        SessionStart: [{ hooks: [{ type: "command", command: "echo existing-session" }] }]
      }
    }),
    "utf8"
  );

  await installClaudeHooks({
    scope: "project",
    hookCommand: "bastion hook claude --edge-url http://127.0.0.1:4711/api/hooks/claude",
    cwd: projectDir
  });

  const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
    hooks: {
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ command?: string }> }>;
      SessionStart: Array<{ hooks: Array<{ command?: string }> }>;
    };
  };

  const preToolCommands = settings.hooks.PreToolUse[0]?.hooks.map((hook) => hook.command);
  assert.equal(preToolCommands?.includes("echo preserve-me"), true);
  assert.equal(
    preToolCommands?.includes("bastion hook claude --edge-url http://127.0.0.1:4711/api/hooks/claude"),
    true
  );

  const sessionCommands = settings.hooks.SessionStart[0]?.hooks.map((hook) => hook.command);
  assert.equal(sessionCommands?.includes("echo existing-session"), true);

  await rm(root, { recursive: true, force: true });
});

test("installClaudeHooks is idempotent and does not duplicate command entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "bastion-cli-hooks-"));
  const projectDir = join(root, "project");
  const hookCommand = "bastion hook claude --edge-url http://127.0.0.1:4711/api/hooks/claude";

  await installClaudeHooks({ scope: "project", hookCommand, cwd: projectDir });
  await installClaudeHooks({ scope: "project", hookCommand, cwd: projectDir });

  const settings = JSON.parse(await readFile(join(projectDir, ".claude", "settings.json"), "utf8")) as {
    hooks: {
      UserPromptSubmit: Array<{ hooks: Array<{ command?: string }> }>;
    };
  };

  const commands = settings.hooks.UserPromptSubmit[0]?.hooks.map((hook) => hook.command) ?? [];
  assert.equal(commands.filter((command) => command === hookCommand).length, 1);

  await rm(root, { recursive: true, force: true });
});
