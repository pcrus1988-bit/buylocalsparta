import type { IcecatLocalizedText, IcecatTextOrigin } from "./types.ts";

export function normalizeGtin(value: string): string {
  return value.replace(/[\s-]+/g, "").trim();
}

export function isValidGtin(value: string): boolean {
  const gtin = normalizeGtin(value);
  if (!/^\d+$/.test(gtin) || ![8, 12, 13, 14].includes(gtin.length)) return false;
  const digits = [...gtin].map(Number);
  const check = digits.pop();
  if (check === undefined) return false;
  let sum = 0;
  for (let index = digits.length - 1, position = 0; index >= 0; index -= 1, position += 1) {
    sum += digits[index] * (position % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function firstArray(...values: unknown[]): unknown[] {
  for (const value of values) if (Array.isArray(value)) return value;
  return [];
}

export function firstText(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "y"].includes(normalized)) return true;
    if (["0", "false", "no", "n"].includes(normalized)) return false;
  }
  return undefined;
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function localizedValue(input: unknown): { value?: string; locale?: string } {
  if (typeof input === "string") return { value: input.trim() || undefined };
  const value = asRecord(input);
  return {
    value: firstText(value.Value, value._, value.Name),
    locale: firstText(value.Language, value.Lang, value.Locale)
  };
}

export function normalizeLocale(value: string | undefined, fallback: string): string {
  const normalized = value?.trim().toUpperCase();
  return normalized || fallback.toUpperCase();
}

export function localizedText(value: string, locale: string, origin: IcecatTextOrigin): IcecatLocalizedText {
  return { value: value.trim(), locale: normalizeLocale(locale, locale), origin };
}

export function normalizeKey(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("el-GR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

export function preservesNumericFacts(source: string, localized: string): boolean {
  const numericTokens = (value: string) =>
    [...value.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", "."));
  const sourceNumbers = numericTokens(source);
  if (!sourceNumbers.length) return true;
  const localizedNumbers = numericTokens(localized);
  return sourceNumbers.length === localizedNumbers.length
    && sourceNumbers.every((value, index) => value === localizedNumbers[index]);
}

export function stripContentToken(value: string): string {
  if (!/^https?:\/\//i.test(value) || !/content[_-]token=/i.test(value)) return value;
  try {
    const url = new URL(value);
    url.searchParams.delete("content_token");
    url.searchParams.delete("content-token");
    return url.toString();
  } catch {
    return value;
  }
}

export function sanitizeIcecatPayload<T>(value: T): T {
  if (typeof value === "string") return stripContentToken(value) as T;
  if (Array.isArray(value)) return value.map((item) => sanitizeIcecatPayload(item)) as T;
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (/^(?:api[-_]?token|content[-_]?token)$/i.test(key)) continue;
      output[key] = sanitizeIcecatPayload(item);
    }
    return output as T;
  }
  return value;
}
