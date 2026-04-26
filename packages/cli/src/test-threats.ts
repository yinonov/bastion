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
  error?: string;
}

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
        type: "PreToolUse",
        toolName: "bash",
        input: {
          command: "export AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE"
        }
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
        type: "PreToolUse",
        toolName: "bash",
        input: {
          command: "rm -rf /tmp/test"
        }
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
        type: "PreToolUse",
        toolName: "bash",
        input: {
          command: "cat ~/.ssh/config"
        }
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
  options: { payload: Record<string, unknown>; expectedFinding: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = {
    ...options.payload,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "test"
  };

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

    // The hook response should indicate a deny or redact decision for the secret vector
    if (
      result &&
      typeof result === "object" &&
      (result.decision === "deny" || result.decision === "redact")
    ) {
      return { passed: true };
    }

    return {
      passed: false,
      error: `Expected deny/redact decision, got ${JSON.stringify(result)}`
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
  options: { payload: Record<string, unknown>; expectedDecision: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = {
    ...options.payload,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "test"
  };

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

    // The hook response should indicate a deny decision for dangerous commands
    if (result && typeof result === "object" && result.decision === options.expectedDecision) {
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
  options: { payload: Record<string, unknown>; expectedFinding: string }
): Promise<{ passed: boolean; error?: string }> {
  const payload = {
    ...options.payload,
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    source: "test"
  };

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

    // The hook response should indicate an ask or deny decision for protected paths
    if (
      result &&
      typeof result === "object" &&
      (result.decision === "ask" || result.decision === "deny")
    ) {
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
