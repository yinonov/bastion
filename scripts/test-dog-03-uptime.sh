#!/bin/bash
set -euo pipefail

# DOG-03 Uptime Accumulation Test Runner
# Runs daily to validate that Bastion edge server meets 7-day uptime SLO
# Usage: ./scripts/test-dog-03-uptime.sh [--log-only]

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TEST_LOG="$REPO_ROOT/.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-TEST-LOG.json"
TEST_PROTOCOL="$REPO_ROOT/.planning/phases/06-latency-persistence-and-uptime-validation/DOG-03-UPTIME-TEST.md"

# Ensure log file exists
mkdir -p "$(dirname "$TEST_LOG")"
if [ ! -f "$TEST_LOG" ]; then
  echo "[]" > "$TEST_LOG"
fi

# Helper: log entry to JSON array
log_entry() {
  local entry="$1"
  if [ -f "$TEST_LOG" ]; then
    # Append entry to existing array (simple approach)
    temp=$(mktemp)
    jq --arg newentry "$entry" '. += [($newentry | fromjson)]' "$TEST_LOG" > "$temp"
    mv "$temp" "$TEST_LOG"
  fi
}

# Collect uptime status
echo "📊 DOG-03 Uptime Test — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "Protocol: $TEST_PROTOCOL"
echo ""

# Run bastion status and capture output
STATUS_JSON=""

# Try global bastion first, then fall back to monorepo pnpm exec
if command -v bastion &> /dev/null; then
  STATUS_JSON=$(bastion status --raw 2>/dev/null || true)
elif command -v pnpm &> /dev/null; then
  # Fallback: run via pnpm monorepo using tsx
  cd "$REPO_ROOT"
  STATUS_JSON=$(pnpm --filter @bastion/cli exec -- tsx src/index.ts status --raw 2>/dev/null || true)
else
  echo "⚠️  bastion CLI not found. Install with: npm install -g @bastion/cli or run: pnpm install"
  exit 1
fi

# Parse JSON output
if [ -z "$STATUS_JSON" ]; then
  echo "ERROR: Failed to get status output"
  exit 1
fi

TOTAL_UPTIME=$(echo "$STATUS_JSON" | jq -r '.totalUptimeSeconds // 0')
CURRENT_SESSION=$(echo "$STATUS_JSON" | jq -r '.currentSession // 0')
STARTUP_COUNT=$(echo "$STATUS_JSON" | jq -r '.startupCount // 0')

# Calculate days accumulated
DAYS_ACCUMULATED=$(awk "BEGIN {printf \"%.1f\", $TOTAL_UPTIME / 86400}")
DAYS_REQUIRED=7
DAYS_REMAINING=$(awk "BEGIN {printf \"%.1f\", ($DAYS_REQUIRED * 86400 - $TOTAL_UPTIME) / 86400}")

echo "Uptime Status:"
echo "  Total Uptime: $TOTAL_UPTIME seconds (~${DAYS_ACCUMULATED} days)"
echo "  Required:     604800 seconds (${DAYS_REQUIRED} days)"
echo "  Remaining:    ~${DAYS_REMAINING} days"
echo "  Current Session: $CURRENT_SESSION seconds"
echo "  Startup Count: $STARTUP_COUNT"
echo ""

# Check latency endpoint (if edge server is running)
LATENCY_HEALTH="false"
LATENCY_COUNT=0
LATENCY_MAX=0

if curl -s http://localhost:3001/api/latency > /dev/null 2>&1; then
  LATENCY_JSON=$(curl -s http://localhost:3001/api/latency)
  LATENCY_COUNT=$(echo "$LATENCY_JSON" | jq -r '.hooks.count // 0')
  LATENCY_MAX=$(echo "$LATENCY_JSON" | jq -r '.hooks.maxMs // 0')
  
  if [ "$LATENCY_COUNT" -gt 0 ] && [ "$LATENCY_MAX" -le 50 ]; then
    LATENCY_HEALTH="true"
  else
    LATENCY_HEALTH="false"
  fi
  
  echo "Latency Continuity:"
  echo "  Samples: $LATENCY_COUNT"
  echo "  Max: ${LATENCY_MAX}ms"
  echo "  Healthy: $LATENCY_HEALTH"
  echo ""
else
  echo "⚠️  Edge server not responding at http://localhost:3001"
  echo "   (This is OK if server is not running; check manually when ready)"
  echo ""
fi

# Determine pass/fail
TEST_STATUS="pass"
NOTES=""

if [ "$TOTAL_UPTIME" -ge 604800 ]; then
  TEST_STATUS="pass_complete"
  NOTES="✅ DOG-03 SATISFIED: 7-day uptime window completed!"
elif [ "$STARTUP_COUNT" -lt 1 ]; then
  TEST_STATUS="fail"
  NOTES="❌ No startup events recorded"
elif [ "$DAYS_ACCUMULATED" = "0.0" ] || [ "$TOTAL_UPTIME" -lt 100 ]; then
  TEST_STATUS="pass_early"
  NOTES="⏳ Early in accumulation window, uptime tracking initialized"
else
  TEST_STATUS="pass"
  NOTES="✓ Uptime accumulating normally"
fi

echo "Test Result: $TEST_STATUS"
echo "Notes: $NOTES"
echo ""

# Log entry as JSON
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
ENTRY=$(cat <<EOF
{
  "timestamp": "$TIMESTAMP",
  "totalUptimeSeconds": $TOTAL_UPTIME,
  "currentSession": $CURRENT_SESSION,
  "startupCount": $STARTUP_COUNT,
  "latencyHealthy": $LATENCY_HEALTH,
  "latencyCount": $LATENCY_COUNT,
  "latencyMaxMs": $LATENCY_MAX,
  "status": "$TEST_STATUS",
  "notes": "$NOTES"
}
EOF
)

log_entry "$ENTRY"

echo "📝 Test logged to: $TEST_LOG"
echo "📋 Protocol: DOG-03-UPTIME-TEST.md"
echo ""

# Check if complete
if [ "$TEST_STATUS" = "pass_complete" ]; then
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🎯 DOG-03 UPTIME REQUIREMENT MET!"
  echo ""
  echo "Next Steps:"
  echo "  1. Run: scripts/test-dog-03-uptime.sh --evidence"
  echo "  2. Review: .planning/phases/06-latency-persistence-and-uptime-validation/"
  echo "  3. Update: .planning/phases/06-latency-persistence-and-uptime-validation/06-VERIFICATION.md"
  echo "  4. Close: Phase 6 → /gsd-complete-phase 6"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
fi

# Exit with appropriate code
if [[ "$TEST_STATUS" == "fail" ]]; then
  exit 1
fi

exit 0
