import { type RedactionRule } from "./schemas.js";
export type RedactionMatch = {
    rule: string;
    count: number;
};
export type RedactionResult = {
    text: string;
    matches: RedactionMatch[];
};
export declare function getBuiltInRedactionRules(): RedactionRule[];
export declare function redactText(input: string, customRules?: RedactionRule[]): RedactionResult;
export declare function toInspectableText(value: unknown, maxChars?: number): string;
export declare function redactUnknown(value: unknown, customRules?: RedactionRule[], maxChars?: number): RedactionResult;
