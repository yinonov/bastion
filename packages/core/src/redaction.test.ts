import test from "node:test";
import assert from "node:assert/strict";
import { redactText, redactUnknown } from "./redaction.js";

test("redacts required Phase 2 secret classes with normalized placeholders", () => {
  const samples = [
    {
      label: "AWS access key",
      input: "aws_access_key_id=AKIA1234567890ABCDEF",
      leaked: "AKIA1234567890ABCDEF",
      placeholder: "[REDACTED:aws-access-key]"
    },
    {
      label: "GitHub token",
      input: "token=ghp_abcdefghijklmnopqrstuvwxyz123456",
      leaked: "ghp_abcdefghijklmnopqrstuvwxyz123456",
      placeholder: "[REDACTED:github-token]"
    },
    {
      label: "private key PEM block",
      input: "-----BEGIN PRIVATE KEY-----\nvery-secret\n-----END PRIVATE KEY-----",
      leaked: "very-secret",
      placeholder: "[REDACTED:private-key]"
    },
    {
      label: ".env assignment",
      input: "DATABASE_PASSWORD=super-secret-password",
      leaked: "super-secret-password",
      placeholder: "[REDACTED:env-assignment]"
    },
    {
      label: "connection string secret",
      input: "postgres://admin:hunter2@example.internal:5432/bastion",
      leaked: "hunter2",
      placeholder: "[REDACTED:connection-string]"
    },
    {
      label: "generic API key",
      input: "api_key=sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD",
      leaked: "sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD",
      placeholder: "[REDACTED:api-key]"
    }
  ];

  for (const sample of samples) {
    const result = redactText(sample.input);
    assert.match(result.text, new RegExp(sample.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(result.text, new RegExp(sample.leaked.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.ok(result.matches.some((match) => match.rule.length > 0), `${sample.label} should record a rule match`);
  }
});

test("redactUnknown sanitizes nested payloads without persisting raw secrets", () => {
  const payload = {
    env: {
      GITHUB_TOKEN: "ghp_abcdefghijklmnopqrstuvwxyz123456"
    },
    command: "export OPENAI_API_KEY=sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD"
  };

  const result = redactUnknown(payload);
  assert.match(result.text, /\[REDACTED:github-token\]/);
  assert.match(result.text, /\[REDACTED:api-key\]/);
  assert.doesNotMatch(result.text, /ghp_abcdefghijklmnopqrstuvwxyz123456/);
  assert.doesNotMatch(result.text, /sk_live_1234567890abcdefghijklmnopqrstuvwxyzABCD/);
});
