import { RedactionRuleSchema, type RedactionRule } from "./schemas.js";

export type RedactionMatch = {
  rule: string;
  count: number;
};

export type RedactionResult = {
  text: string;
  matches: RedactionMatch[];
};

function normalizedReplacement(ruleName: string): string {
  return `[REDACTED:${ruleName}]`;
}

const builtInRules: RedactionRule[] = [
  {
    name: "aws-access-key",
    pattern: "\\bAKIA[0-9A-Z]{16}\\b",
    replacement: normalizedReplacement("aws-access-key")
  },
  {
    name: "github-token",
    pattern: "\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b",
    replacement: normalizedReplacement("github-token")
  },
  {
    name: "private-key",
    pattern: "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
    replacement: normalizedReplacement("private-key")
  },
  {
    name: "jwt",
    pattern: "\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b",
    replacement: normalizedReplacement("jwt")
  },
  {
    name: "api-key",
    pattern: "\\bsk_(?:live|test)_[A-Za-z0-9]{24,}\\b",
    replacement: normalizedReplacement("api-key")
  },
  {
    name: "env-assignment",
    pattern: "\\b([A-Z][A-Z0-9_]*(?:TOKEN|SECRET|PASSWORD|PASSWD|API[_-]?KEY|ACCESS[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_]*)\\s*=\\s*(?:\"(?!\\[REDACTED:)[^\"]+\"|'(?!\\[REDACTED:)[^']+'|(?!\\[REDACTED:)[^\\s;]+)",
    replacement: `$1=${normalizedReplacement("env-assignment")}`
  },
  {
    name: "connection-string",
    pattern: "\\b(?:postgres(?:ql)?|mysql|mongodb(?:\\+srv)?|redis|amqp|mssql):\\/\\/[^\\s:@/]+:[^\\s@/]+@[^\\s]+",
    replacement: normalizedReplacement("connection-string")
  }
];

export function getBuiltInRedactionRules(): RedactionRule[] {
  return builtInRules;
}

export function redactText(input: string, customRules: RedactionRule[] = []): RedactionResult {
  let text = input;
  const matches: RedactionMatch[] = [];

  for (const rule of [...builtInRules, ...customRules]) {
    const parsed = RedactionRuleSchema.parse(rule);
    const regex = new RegExp(parsed.pattern, "gi");
    const count = text.match(regex)?.length ?? 0;
    if (count > 0) {
      text = text.replace(regex, parsed.replacement);
    }
    if (count > 0) {
      matches.push({ rule: parsed.name, count });
    }
  }

  return { text, matches };
}

export function toInspectableText(value: unknown, maxChars = 1200): string {
  const seen = new WeakSet<object>();
  const stringified = typeof value === "string"
    ? value
    : JSON.stringify(value, (_key, nestedValue: unknown) => {
      if (typeof nestedValue === "object" && nestedValue !== null) {
        if (seen.has(nestedValue)) {
          return "[Circular]";
        }
        seen.add(nestedValue);
      }
      return nestedValue;
    }, 2) ?? "";

  return stringified.length > maxChars ? `${stringified.slice(0, maxChars)}...` : stringified;
}

export function redactUnknown(value: unknown, customRules: RedactionRule[] = [], maxChars = 1200): RedactionResult {
  return redactText(toInspectableText(value, maxChars), customRules);
}
