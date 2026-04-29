# DOG-03 Uptime Accumulation Test Protocol

## Objective
Validate that Bastion edge server maintains continuous uptime and that hook latency remains stable across restart cycles during the 7-day dogfood window.

## Test Schedule
- **Frequency:** Daily (recommended)
- **Timing:** Any time; daily cadence is flexible
- **Duration:** ~30 seconds per run
- **Start Date:** 2026-04-28 (Phase 6 execution start)
- **Target Completion:** 2026-05-05 (7-day window close)

## Test Requirements

### DOG-03 SLO
- **Requirement:** Edge server uptime ≥ 7 continuous days
- **Measurement:** `bastion status` cumulative uptime reporting
- **Pass Criteria:** `totalUptimeSeconds ≥ 604800` (604800s = 7 days)

### DOG-02 Restart Continuity
- **Requirement:** Hook latency tracking survives edge server restart
- **Measurement:** `/api/latency` endpoint latency statistics
- **Pass Criteria:** `count ≥ 2` after server restart with persisted samples

## Test Procedure

### Daily Check (runs automatically via script)

1. **Collect Status**
   ```bash
   bastion status
   ```
   Expected output includes:
   - `totalUptimeSeconds`: cumulative seconds across all sessions
   - `currentSession`: seconds since last startup
   - `startupCount`: number of startups

2. **Validate Uptime Progress**
   - Check `totalUptimeSeconds` is increasing
   - Confirm `currentSession` is recent (< 24h since last check)
   - Record timestamp and values to test log

3. **Check Latency Continuity** (optional, runs on restart detection)
   ```bash
   curl http://localhost:3001/api/latency
   ```
   Expected: `count > 0` and `maxMs ≤ 50`

4. **Log Result**
   - Append to `DOG-03-TEST-LOG.json`
   - Record pass/fail status
   - Note any anomalies

### Manual Verification (periodic)
- Run the automated script: `scripts/test-dog-03-uptime.sh`
- Review `DOG-03-TEST-LOG.json` for trend over 7 days
- If any failures: investigate server logs, restart status

## Test Evidence

### Test Log Location
```
.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-TEST-LOG.json
```

### Log Entry Format
```json
{
  "timestamp": "2026-04-28T12:30:00Z",
  "totalUptimeSeconds": 86400,
  "currentSession": 3600,
  "startupCount": 1,
  "latencyHealthy": true,
  "latencyCount": 2,
  "latencyMaxMs": 47,
  "status": "pass",
  "notes": "Uptime accumulating normally"
}
```

### Pass / Fail Logic
- **PASS:** 
  - `totalUptimeSeconds` is incrementing
  - `status` can continue gathering evidence
- **FAIL:**
  - Server crash or unexpected shutdown detected
  - `totalUptimeSeconds` not incrementing for >24h
  - Latency stats lost after restart (continuity broken)

### Completion Criteria (DOG-03 Close)
When `totalUptimeSeconds ≥ 604800`:
1. Run final `bastion status` and record
2. Export latency stats via `/api/latency`
3. Create `DOG-03-EVIDENCE.md` with:
   - Final uptime snapshot
   - Test log summary (min/max/avg uptime per day)
   - Latency continuity proof
4. Update [ 06-VERIFICATION.md ](./06-VERIFICATION.md) with DOG-03 completion
5. Update [ ../ROADMAP.md ](../../ROADMAP.md) to close Phase 6

## Files
- [DOG-03-TEST-LOG.json](./DOG-03-TEST-LOG.json) — daily test results
- [DOG-03-EVIDENCE.md](./DOG-03-EVIDENCE.md) — final completion proof (generated at end)
- [../../../scripts/test-dog-03-uptime.sh](../../../scripts/test-dog-03-uptime.sh) — automated test runner
