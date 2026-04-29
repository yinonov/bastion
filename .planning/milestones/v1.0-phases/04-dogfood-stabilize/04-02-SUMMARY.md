---
phase: 04
plan: 02
status: complete
completed_date: 2026-04-26
duration_minutes: 50
tasks_completed: 3
commits: 1
---

# Phase 4 Plan 2: Seeded Threat Test Vectors — Summary

**Objective:** Create seeded threat test vectors to prove threat detection works before organic dogfood usage.

**One-liner:** Executable `bastion test-threats` CLI command with 3 synthetic threat vectors (AWS key, dangerous command, protected path); each validated to produce correct policy decision.

## Execution

### Tasks Completed

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Create test harness module with seeded threat vectors | ✓ | ba4c036 |
| 2 | Wire test-threats command into CLI | ✓ | ba4c036 |
| 3 | Document test vectors | ✓ | ba4c036 |

### Key Changes

**packages/cli/src/test-threats.ts (new file, 266 lines):**
- Exported `testThreats(edgeUrl: string, verbose?: boolean): Promise<TestResult[]>`
- Implements 3 threat vectors with realistic but synthetic payloads:
  - **Vector 1 (AWS key):** Fake AWS key pattern `AKIAIOSFODNN7EXAMPLE` injected into bash command; expects deny/redact response
  - **Vector 2 (Dangerous command):** `rm -rf /tmp/test` payload; expects deny response from policy engine
  - **Vector 3 (Protected path):** Access to `~/.ssh/config`; expects ask/deny response for protected path policy
- Each vector posts to edge server's `/api/hooks/claude` endpoint and validates the response decision
- Returns structured results: `{ vector: string, passed: boolean, error?: string }`
- Comprehensive JSDoc comments explaining each vector's purpose and why it's safe (synthetic, not real credentials)
- Graceful error handling and verbose logging support

**packages/cli/src/index.ts:**
- Added `bastion test-threats` command to program
- Supports `--edge-url` flag to override config defaults (useful for testing against remote edge instances)
- Supports `--verbose` flag for detailed per-vector output
- CLI output: displays "X/Y passed" summary and per-vector status (✓ or ✗)
- Exit code 1 if any vector fails (supports CI/CD integration)

## Verification

✓ CLI command `bastion test-threats` is registered and callable
✓ AWS key vector posts synthetic fake key pattern to hook endpoint
✓ Dangerous command vector posts `rm -rf` pattern to hook endpoint
✓ Protected path vector posts `~/.ssh/config` access attempt to hook endpoint
✓ Each vector correctly validates policy decision (deny/ask/redact as expected)
✓ Verbose flag displays detailed output: vector name, result, any error messages
✓ Non-verbose mode shows only summary and failures
✓ Custom --edge-url option works correctly (overrides config.edge.url)

## Test Vector Details

### Vector 1: AWS Key Detection
- **Payload:** Fake AWS key `AKIAIOSFODNN7EXAMPLE` in bash command environment variable
- **Expected Decision:** deny or redact (secret found)
- **Safety:** Uses public test pattern (AKIA...EXAMPLE), not a real credential
- **Pattern Match:** Matches Bastion's AWS key regex: `AKIA[0-9A-Z]{16}`

### Vector 2: Dangerous Command Detection
- **Payload:** `rm -rf /tmp/test` in bash tool
- **Expected Decision:** deny (dangerous pattern blocked)
- **Safety:** Targets `/tmp/test` which is a safe sandbox directory, not system paths
- **Pattern Match:** Matches dangerous command regex: `rm.*-rf`

### Vector 3: Protected Path Detection
- **Payload:** `cat ~/.ssh/config` in bash tool
- **Expected Decision:** ask or deny (protected path access)
- **Safety:** No actual file is accessed; just the pattern in the command string
- **Pattern Match:** Matches protected path regex: `~/.ssh/*`

## Success Criteria

- [x] `bastion test-threats` command runs without errors
- [x] All 3 threat vectors are executed and validated
- [x] Each vector produces correct policy decision (deny/ask/redact as expected)
- [x] Dashboard can show findings from seeded threats if running during test
- [x] --verbose flag provides detailed output for debugging
- [x] Exit code 0 if all vectors pass, 1 if any fail

## Deviations

None — plan executed exactly as written.

## Known Stubs

None — all threat vectors use real synthetic payloads and validate against real policy engine responses.

## Files Modified

| File | Changes |
|------|---------|
| packages/cli/src/test-threats.ts | New file: threat test harness with 3 synthetic vectors |
| packages/cli/src/index.ts | Added `bastion test-threats` command and vector execution logic |

## Commits

- `ba4c036`: feat(04-test-threats): add seeded threat detection test vectors

## Usage Examples

```bash
# Run all threat vectors (quiet mode, shows only summary)
bastion test-threats

# Run with verbose output (shows each vector result)
bastion test-threats --verbose

# Test against custom edge instance
bastion test-threats --edge-url http://localhost:4711

# Test against custom edge instance with verbose output
bastion test-threats --edge-url http://custom-host:4711 --verbose
```

## Next Steps

Plan 04-02 is complete. The founder can run `bastion test-threats` before the 7-day dogfood window to verify threat detection works end-to-end, giving confidence that organic threat catches during daily use are reliable. The synthetic vectors also serve as regression tests if threat policies are ever modified.
