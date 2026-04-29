import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDefaultConfig, loadConfig } from "./config.js";

test("default config keeps raw payload capture disabled", () => {
  const config = getDefaultConfig();
  assert.equal(config.capture.rawPayload, false);
  assert.equal(config.exporters.cloud.enabled, false);
});

test("loadConfig reads project config before user-level fallback", async () => {
  const root = await mkdtemp(join(tmpdir(), "bastion-core-config-"));
  const projectDir = join(root, "project");
  const homeDir = join(root, "home");
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(homeDir, ".config", "bastion"), { recursive: true });

  await writeFile(
    join(projectDir, "bastion.config.json"),
    JSON.stringify({ edge: { port: 4010 } }),
    "utf8"
  );
  await writeFile(
    join(homeDir, ".config", "bastion", "bastion.config.json"),
    JSON.stringify({ edge: { port: 4999 } }),
    "utf8"
  );

  const config = await loadConfig(projectDir, homeDir);
  assert.equal(config.edge.port, 4010);

  await rm(root, { recursive: true, force: true });
});

test("loadConfig falls back to ~/.config/bastion when project config is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "bastion-core-config-"));
  const projectDir = join(root, "project");
  const homeDir = join(root, "home");
  await mkdir(projectDir, { recursive: true });
  await mkdir(join(homeDir, ".config", "bastion"), { recursive: true });

  await writeFile(
    join(homeDir, ".config", "bastion", "bastion.config.json"),
    JSON.stringify({ exporters: { localSqlite: { path: ".bastion/fallback.db" } } }),
    "utf8"
  );

  const config = await loadConfig(projectDir, homeDir);
  assert.equal(config.exporters.localSqlite.path, ".bastion/fallback.db");

  await rm(root, { recursive: true, force: true });
});

test("loadConfig rejects unsupported MCP transport values", async () => {
  const root = await mkdtemp(join(tmpdir(), "bastion-core-config-"));
  const projectDir = join(root, "project");
  await mkdir(projectDir, { recursive: true });

  await writeFile(
    join(projectDir, "bastion.config.json"),
    JSON.stringify({
      mcp: {
        servers: {
          bad: {
            transport: "sse",
            url: "https://example.com/mcp",
            enabled: true
          }
        }
      }
    }),
    "utf8"
  );

  await assert.rejects(() => loadConfig(projectDir), /invalid discriminator value|transport/i);

  await rm(root, { recursive: true, force: true });
});
