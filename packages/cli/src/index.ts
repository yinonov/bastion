#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { hostname } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { Command } from "commander";
import {
  addMcpServer,
  evaluatePolicy,
  getDefaultConfig,
  loadConfig,
  normalizeClaudeHook,
  redactText,
  renderMarkdownReport,
  resolveConfigPath,
  resolveSqlitePath,
  saveConfig,
  toClaudeHookResponse,
  writeDefaultConfig,
  type BastionConfig,
  type SecurityFinding
} from "@bastion/core";
import { installClaudeHooks } from "./install-hooks.js";

const originalEmitWarning = process.emitWarning.bind(process) as typeof process.emitWarning;
process.emitWarning = ((warning: string | Error, ...args: unknown[]) => {
  const message = typeof warning === "string" ? warning : warning.message;
  if (message.includes("SQLite") && message.includes("experimental")) {
    return;
  }
  return originalEmitWarning(warning as never, ...(args as never[]));
}) as typeof process.emitWarning;

const program = new Command();

program
  .name("bastion")
  .description("Local-first governance for coding agents")
  .version("0.1.0");

program
  .command("init")
  .description("Create bastion.config.json")
  .option("-f, --force", "overwrite an existing config")
  .action(async (options: { force?: boolean }) => {
    const path = resolveConfigPath();
    if (existsSync(path) && !options.force) {
      console.log(`Bastion config already exists: ${path}`);
      return;
    }
    await writeDefaultConfig();
    console.log(`Created ${path}`);
  });

program
  .command("run")
  .description("Start the local Bastion edge service")
  .option("--dashboard", "also start the Next.js dashboard dev server")
  .action(async (options: { dashboard?: boolean }) => {
    const config = await loadConfig();
    const { startEdgeServer } = await import("@bastion/edge");
    const server = await startEdgeServer();
    console.log(`Bastion edge listening at ${server.url}`);

    let dashboardProcess: ReturnType<typeof spawn> | undefined;
    if (options.dashboard) {
      dashboardProcess = spawn("pnpm", [
        "--filter",
        "@bastion/dashboard",
        "dev",
        "--",
        "--hostname",
        config.edge.host,
        "--port",
        String(config.dashboard.port)
      ], {
        cwd: process.cwd(),
        stdio: "inherit"
      });
      console.log(`Bastion dashboard starting at http://${config.edge.host}:${config.dashboard.port}`);
    }

    for (const signal of ["SIGINT", "SIGTERM"] as const) {
      process.on(signal, () => {
        dashboardProcess?.kill(signal);
        void server.close().finally(() => process.exit(0));
      });
    }
  });

program
  .command("install-hooks")
  .description("Install Bastion hooks into Claude Code settings")
  .requiredOption("--target <target>", "hook target, currently claude-code")
  .option("--scope <scope>", "user or project", "project")
  .action(async (options: { target: string; scope: string }) => {
    if (options.target !== "claude-code") {
      throw new Error("Only --target claude-code is supported in the MVP.");
    }
    const config = await loadConfig();
    const edgeUrl = `http://${config.edge.host}:${config.edge.port}/api/hooks/claude`;
    const settingsPath = await installClaudeHooks({
      scope: options.scope === "user" ? "user" : "project",
      hookCommand: buildEdgeHookCommand(edgeUrl)
    });
    console.log(`Installed Bastion Claude Code hooks in ${settingsPath}`);
  });

const mcp = program.command("mcp").description("Manage approved MCP upstreams");

mcp
  .command("add")
  .description("Add an approved MCP upstream")
  .argument("<name>", "server name")
  .option("--url <url>", "HTTP MCP endpoint")
  .allowUnknownOption(true)
  .allowExcessArguments(true)
  .argument("[command...]", "stdio command after --")
  .action(async (name: string, command: string[], options: { url?: string }) => {
    if (options.url) {
      await addMcpServer(name, { transport: "http", url: options.url, headers: {}, enabled: true });
      console.log(`Added HTTP MCP server '${name}' -> ${options.url}`);
      return;
    }

    if (command.length === 0) {
      throw new Error("Provide --url <endpoint> or a stdio command after --.");
    }

    const [binary, ...args] = command;
    if (!binary) {
      throw new Error("Missing MCP command.");
    }

    await addMcpServer(name, { transport: "stdio", command: binary, args, enabled: true });
    console.log(`Added STDIO MCP server '${name}' -> ${[binary, ...args].join(" ")}`);
  });

program
  .command("scan")
  .description("Scan the current workspace for secret-like values and write findings locally")
  .option("--path <path>", "path to scan", ".")
  .action(async (options: { path: string }) => {
    const config = await loadConfig();
    const { LocalSqliteStore } = await import("@bastion/edge");
    const store = new LocalSqliteStore(resolveSqlitePath(config));
    const findings = await scanPath(resolve(options.path), config);
    store.saveFindings(findings);
    store.saveEvent({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      source: "scanner",
      eventType: "ScanFinding",
      status: findings.length > 0 ? "redacted" : "observed",
      severity: findings.some((finding) => finding.severity === "critical") ? "critical" : "info",
      machineId: hostname(),
      action: `scan ${resolve(options.path)}`,
      redactedSnippet: `Bastion scan completed with ${findings.length} finding(s).`,
      metadata: { findingCount: findings.length }
    });
    store.close();
    console.log(`Scan complete. Findings: ${findings.length}`);
  });

program
  .command("export-report")
  .description("Export a local AI workflow audit report")
  .option("--format <format>", "markdown or json", "markdown")
  .action(async (options: { format: string }) => {
    const config = await loadConfig();
    const { LocalSqliteStore } = await import("@bastion/edge");
    const store = new LocalSqliteStore(resolveSqlitePath(config));
    const summary = store.dashboardSummary();
    store.close();

    if (options.format === "json") {
      console.log(JSON.stringify(summary, null, 2));
      return;
    }

    console.log(renderMarkdownReport(summary));
  });

program
  .command("hook")
  .description("Internal hook handlers")
  .argument("<target>", "hook target")
  .argument("[kind]", "hook kind")
  .option("--edge-url <url>", "explicit edge hook endpoint")
  .action(async (target: string, kind: string | undefined, options: { edgeUrl?: string }) => {
    if (target !== "claude" && kind !== "claude") {
      throw new Error("Only the Claude hook handler is supported.");
    }
    await runClaudeHookHandler(options.edgeUrl);
  });

await program.parseAsync(process.argv);

async function runClaudeHookHandler(edgeUrl?: string): Promise<void> {
  const config = await loadConfig();
  const payload = await readStdinJson();
  const resolvedEdgeUrl = edgeUrl ?? `http://${config.edge.host}:${config.edge.port}/api/hooks/claude`;

  try {
    const response = await fetch(resolvedEdgeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    if (text.length === 0) {
      process.stdout.write(`${JSON.stringify({ suppressOutput: true })}\n`);
      return;
    }

    process.stdout.write(`${JSON.stringify(JSON.parse(text))}\n`);
  } catch {
    // Keep hooks non-fatal when edge is temporarily unavailable.
    const event = normalizeClaudeHook(payload, config);
    const evaluation = evaluatePolicy(event, config);
    process.stdout.write(`${JSON.stringify(toClaudeHookResponse(evaluation.event.eventType, evaluation.decision))}\n`);
  }
}

function buildEdgeHookCommand(edgeUrl: string): string {
  return `bastion hook claude --edge-url ${edgeUrl}`;
}

async function scanPath(root: string, config: BastionConfig): Promise<SecurityFinding[]> {
  const findings: SecurityFinding[] = [];
  const files = await collectFiles(root);
  for (const file of files) {
    const content = await readFile(file, "utf8").catch(() => "");
    const result = redactText(content, config.redaction.rules);
    if (result.matches.length === 0) {
      continue;
    }
    findings.push({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "secret",
      severity: "critical",
      title: `Secret-like value found in ${file}`,
      description: `Matched ${result.matches.map((match) => match.rule).join(", ")} during a local scan.`,
      evidenceSnippet: result.text.slice(0, 500),
      recommendation: "Remove the secret from source, rotate it if committed, and add a safer local credential path."
    });
  }
  return findings;
}

async function collectFiles(root: string): Promise<string[]> {
  const info = await stat(root);
  if (info.isFile()) {
    return shouldSkip(root) ? [] : [root];
  }

  const entries = await readdir(root);
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry);
    if (shouldSkip(path)) {
      return [];
    }
    const entryStat = await stat(path);
    if (entryStat.isDirectory()) {
      return collectFiles(path);
    }
    return entryStat.size < 1_000_000 ? [path] : [];
  }));
  return nested.flat();
}

function shouldSkip(path: string): boolean {
  return [".git", "node_modules", "dist", ".next", ".bastion"].some((segment) => path.includes(segment));
}

async function readStdinJson(): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  return raw ? JSON.parse(raw) : {};
}

