# Bastion

Security-first, local-first governance for coding agents.

Bastion starts with Claude Code hooks and MCP tool governance, then turns captured
security and friction events into a local audit trail for Platform/DevEx teams.

## Quick Start

```bash
pnpm install
pnpm build
pnpm --filter @bastion/cli bastion init
pnpm --filter @bastion/cli bastion install-hooks --target claude-code --scope project
pnpm --filter @bastion/cli bastion run --dashboard
```

The CLI writes to a local SQLite edge buffer by default. Raw payload capture is
disabled unless explicitly enabled in `bastion.config.json`.

## Workspace

- `packages/core` - Zod schemas, config, redaction, and policy decisions.
- `packages/cli` - `bastion` command line interface.
- `packages/edge` - local Fastify API, SQLite store, hook receiver, MCP router.
- `packages/insights` - heuristic friction clustering and insight generation.
- `apps/dashboard` - Next.js control plane UI.
