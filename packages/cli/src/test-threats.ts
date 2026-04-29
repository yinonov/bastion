import { randomUUID } from "node:crypto";

/**
 * Seeded threat detection test vectors
 *
 * These test vectors are synthetic but realistic payloads designed to validate
 * that Bastion's threat detection works before relying on organic catches during
 * the 7-day dogfood window.
 *
 * Each vector posts a payload to the edge server's /api/hooks/claude endpoint
 * and validates that the policy evaluation produces a security finding.
 */

export interface TestResult {
  vector: string;
  passed: boolean;
  error: string | undefined;
}

type ThreatPayload = {
  hook_event_name: "PreToolUse";
  tool_name: "Bash";
  tool_input: {
    command: string;
  };
  session_id: string;
  cwd: string;
};

export async function testThreats(edgeUrl: string, verbose?: boolean): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // Test Vector 1: Secret Detection (Fake AWS Key)
  // Pattern: AKIA... is a known prefix for AWS access key IDs
  // This fake key matches the public test pattern but is not a real credential
  try {
    if (verbose) {
      console.log("[TEST] Vector 1: AWS key detection");
    }
    const result = await testSecretVector(edgeUrl, {
      payload: {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
        },
        session_id: randomUUID(),
        cwd: process.cwd()
      },
      expectedFinding: "aws_key"
    });
    results.push({
      vector: "AWS key detection",
      passed: result.passed,
      error: result.error
    });
    if (verbose && !result.passed) {
      console.log(`  ✗ FAILED: ${result.error}`);
    } else if (verbose) {
      console.log("  ✓ PASSED");
    }
  } catch (error) {
    results.push({
      vector: "AWS key detection",
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }

  // Test Vector 2: Dangerous Command Detection
  // Pattern: rm -rf / is a destructive pattern that should be blocked
  try {
    if (verbose) {
      console.log("[TEST] Vector 2: Dangerous command detection");
    }
    const result = await testCommandVector(edgeUrl, {
      payload: {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "rm -rf /"
        },
        session_id: randomUUID(),
        cwd: process.cwd()
      },
      expectedDecision: "deny"
    });
    results.push({
      vector: "Dangerous command detection",
      passed: result.passed,
      error: result.error
    });
    if (verbose && !result.passed) {
      console.log(`  ✗ FAILED: ${result.error}`);
    } else if (verbose) {
      console.log("  ✓ PASSED");
    }
  } catch (error) {
    results.push({
      vector: "Dangerous command detection",
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }

  // Test Vector 3: Protected Path Detection
  // Pattern: Access to ~/.ssh/config is a protected path that should be detected
  try {
    if (verbose) {
      console.log("[TEST] Vector 3: Protected path detection");
    }
    const result = await testProtectedPathVector(edgeUrl, {
      payload: {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: {
          command: "cat ~/.ssh/config"
        },
        session_id: randomUUID(),
        cwd: process.cwd()
      },
      expectedFinding: "protected_path"
    });
    results.push({
      vector: "Protected path detection",
      passed: result.passed,
      error: result.error
    });
    if (verbose && !result.passed) {
      console.log(`  ✗ FAILED: ${result.error}`);
    } else if (verbose) {
      console.log("  ✓ PASSED");
    }
  } catch (error) {
    results.push({
      vector: "Protected path detection",
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }

  return results;
}

async function testSecretVector(
  edgeUrl: string,
  options: { payload: ThreatPayload; expectedFinding: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = options.payload;

  try {
    const response = await fetch(`${edgeUrl}/api/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        passed: false,
        error: `Hook endpoint returned ${response.status}`
      };
    }

    const result = await response.json();

    const permissionDecision = extractPermissionDecision(result);

    // PreToolUse should request an explicit permission decision for secret findings.
    if (permissionDecision === "deny") {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Expected deny decision, got ${JSON.stringify(result)}`
    };
  } catch (error) {
    return {
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error during fetch"
    };
  }
}

async function testCommandVector(
  edgeUrl: string,
  options: { payload: ThreatPayload; expectedDecision: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = options.payload;

  try {
    const response = await fetch(`${edgeUrl}/api/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        passed: false,
        error: `Hook endpoint returned ${response.status}`
      };
    }

    const result = await response.json();

    const permissionDecision = extractPermissionDecision(result);

    // PreToolUse should deny dangerous commands.
    if (permissionDecision === options.expectedDecision) {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Expected ${options.expectedDecision} decision, got ${JSON.stringify(result)}`
    };
  } catch (error) {
    return {
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error during fetch"
    };
  }
}

async function testProtectedPathVector(
  edgeUrl: string,
  options: { payload: ThreatPayload; expectedFinding: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = options.payload;

  try {
    const response = await fetch(`${edgeUrl}/api/hooks/claude`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      return {
        passed: false,
        error: `Hook endpoint returned ${response.status}`
      };
    }

    const result = await response.json();

    const permissionDecision = extractPermissionDecision(result);

    // PreToolUse should ask or deny for protected paths, depending on policy order.
    if (permissionDecision === "ask" || permissionDecision === "deny") {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Expected ask/deny decision, got ${JSON.stringify(result)}`
    };
  } catch (error) {
    return {
      passed: false,
      error: error instanceof Error ? error.message : "Unknown error during fetch"
    };
  }
}

function extractPermissionDecision(result: unknown): string | undefined {
  if (typeof result !== "object" || result === null) {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  const hookSpecificOutput = record.hookSpecificOutput;
  if (typeof hookSpecificOutput !== "object" || hookSpecificOutput === null) {
    return undefined;
  }

  const decision = (hookSpecificOutput as Record<string, unknown>).permissionDecision;
  return typeof decision === "string" ? decision : undefined;
}
