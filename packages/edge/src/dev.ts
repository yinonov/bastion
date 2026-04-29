import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { startEdgeServer } from "./server.js";

const server = await startEdgeServer({ cwd: resolveRuntimeCwd() });
console.log(`Bastion edge listening at ${server.url}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void server.close().finally(() => process.exit(0));
  });
}

function resolveRuntimeCwd(): string {
  let candidate = process.cwd();
  while (true) {
    if (existsSync(join(candidate, "bastion.config.json")) || existsSync(join(candidate, "pnpm-workspace.yaml"))) {
      return candidate;
    }
    const parent = dirname(candidate);
    if (parent === candidate) {
      return process.cwd();
    }
    candidate = parent;
  }
}
