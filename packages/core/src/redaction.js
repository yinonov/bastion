import { RedactionRuleSchema } from "./schemas.js";
const builtInRules = [
    {
        name: "aws-access-key",
        pattern: "\\bAKIA[0-9A-Z]{16}\\b",
        replacement: "[REDACTED_AWS_KEY]"
    },
    {
        name: "github-token",
        pattern: "\\bgh[pousr]_[A-Za-z0-9_]{20,}\\b",
        replacement: "[REDACTED_GITHUB_TOKEN]"
    },
    {
        name: "private-key",
        pattern: "-----BEGIN [A-Z ]*PRIVATE KEY-----[\\s\\S]*?-----END [A-Z ]*PRIVATE KEY-----",
        replacement: "[REDACTED_PRIVATE_KEY]"
    },
    {
        name: "jwt",
        pattern: "\\beyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+\\b",
        replacement: "[REDACTED_JWT]"
    },
    {
        name: "generic-secret-assignment",
        pattern: "\\b(api[_-]?key|token|secret|password|passwd)\\s*[:=]\\s*['\\\"]?[^'\\\"\\s]{8,}",
        replacement: "$1=[REDACTED_SECRET]"
    }
];
export function getBuiltInRedactionRules() {
    return builtInRules;
}
export function redactText(input, customRules = []) {
    let text = input;
    const matches = [];
    for (const rule of [...builtInRules, ...customRules]) {
        const parsed = RedactionRuleSchema.parse(rule);
        const regex = new RegExp(parsed.pattern, "gi");
        let count = 0;
        text = text.replace(regex, () => {
            count += 1;
            return parsed.replacement;
        });
        if (count > 0) {
            matches.push({ rule: parsed.name, count });
        }
    }
    return { text, matches };
}
export function toInspectableText(value, maxChars = 1200) {
    const seen = new WeakSet();
    const stringified = typeof value === "string"
        ? value
        : JSON.stringify(value, (_key, nestedValue) => {
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
export function redactUnknown(value, customRules = [], maxChars = 1200) {
    return redactText(toInspectableText(value, maxChars), customRules);
}
