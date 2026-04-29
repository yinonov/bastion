# Testing Practice Setup: DOG-03 Uptime Accumulation

## Summary
A structured daily testing practice has been implemented for Phase 6's DOG-03 requirement (7-day uptime validation). This includes:

1. **Automated Test Runner** (`scripts/test-dog-03-uptime.sh`)
   - Runs `bastion status --raw` to collect uptime metrics
   - Checks latency endpoint health if server is running
   - Records results to JSON test log
   - Detects completion when 7-day threshold is met

2. **Test Protocol** (`.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-UPTIME-TEST.md`)
   - Defines test schedule, requirements, procedure
   - Specifies pass/fail criteria
   - Documents test evidence locations

3. **Test Log** (`.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-TEST-LOG.json`)
   - Daily results recorded as JSON entries
   - Tracks uptime progression, latency health, test status
   - Persists across multiple runs for trend analysis

4. **CLI Enhancement**
   - Added `--raw` flag to `bastion status` command
   - Outputs JSON for programmatic parsing
   - Enables CI/cron integration

## Running the Tests

### Manual Execution
```bash
cd /Users/yinon/Repositories/bastion
./scripts/test-dog-03-uptime.sh
```

### Automated Daily Execution (Optional)
Add to crontab for daily runs:
```bash
# Run daily at 10:00 AM
0 10 * * * cd /Users/yinon/Repositories/bastion && ./scripts/test-dog-03-uptime.sh >> /tmp/dog-03-test.log 2>&1
```

Or use systemd timer, GitHub Actions, or your preferred scheduler.

## Test Artifacts

| File | Purpose |
|------|---------|
| `scripts/test-dog-03-uptime.sh` | Automated test runner |
| `DOG-03-UPTIME-TEST.md` | Test protocol and procedure |
| `DOG-03-TEST-LOG.json` | Daily test results |
| `DOG-03-EVIDENCE.md` | Generated when 7-day criterion is met |

## What Gets Tested

### Primary: DOG-03 SLO
- **Requirement:** ≥7 continuous days edge server uptime
- **Measurement:** `bastion status --raw` reports `totalUptimeSeconds ≥ 604800`
- **Test Status:** `pass_early` (still accumulating) → `pass` (ongoing) → `pass_complete` (finished)

### Secondary: DOG-02 Continuity Check
- **Requirement:** Hook latency tracking survives edge restart
- **Measurement:** `/api/latency` endpoint returns persisted samples
- **Test Status:** Passes if `latencyHealthy: true` after restart

## Test Results Interpretation

| Status | Meaning | Action |
|--------|---------|--------|
| `pass_early` | Initial phase, tracking initialized | Keep server running |
| `pass` | Uptime accumulating normally | Continue daily checks |
| `pass_complete` | ✅ DOG-03 criterion met (≥7 days) | Finalize Phase 6 verification |
| `fail` | Tracking detected issue (crash, drift) | Investigate & report |

## Next Steps

1. **Keep Bastion Running**
   - Terminal: `7cbd5b9a-76ef-4a14-8b67-1c0aa6213b1f` (edge server)
   - Leave running through 2026-05-05 (7-day window close)

2. **Run Tests Regularly**
   - Daily: `./scripts/test-dog-03-uptime.sh` (or via cron)
   - Spot-check: Anytime to see current progress

3. **Monitor DOG-03 Completion**
   - When script outputs `pass_complete`, DOG-03 is satisfied
   - Run: `./scripts/test-dog-03-uptime.sh --evidence` (future: generates completion proof)
   - Update Phase 6 verification artifacts

4. **Close Phase 6**
   - Update [ 06-VERIFICATION.md ](../06-VERIFICATION.md)
   - Commit: `git add -A && git commit -m "Phase 6 complete: DOG-03 7-day uptime verified"`
   - Route to Phase 7: `/gsd-discuss-phase 7` or `/gsd-plan-phase 7`

## Implementation Details

### Test Script Features
- **Cross-platform:** Uses sed instead of grep -P for macOS compatibility
- **Fallback support:** Tries global `bastion` CLI, falls back to pnpm monorepo exec
- **JSON logging:** Appends entries to test log array for trend analysis
- **Auto-detection:** Detects when 7-day requirement is met and alerts

### CLI Enhancement
- `status --raw` outputs: `startupCount`, `totalUptimeSeconds`, `currentSession`, `lastShutdown`, `sevenDaysMet`
- Backward compatible: default `status` still outputs human-readable format

## Files Created/Modified

- ✅ `scripts/test-dog-03-uptime.sh` — new automated test runner
- ✅ `.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-UPTIME-TEST.md` — new test protocol
- ✅ `.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-TEST-LOG.json` — new test log
- ✅ `packages/cli/src/index.ts` — enhanced `status` command with `--raw` flag
