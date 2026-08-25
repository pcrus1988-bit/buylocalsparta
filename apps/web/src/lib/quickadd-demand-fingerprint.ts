import { createHash } from "node:crypto";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function digest(namespace: string, value: string): string {
  return createHash("sha256").update(`${namespace}|${value}`).digest("hex");
}

function normalizedLookup(input: { gtin?: string; q?: string }): { value: string; kind: "identifier" | "text" } | undefined {
  const rawGtin = clean(input.gtin);
  const digits = rawGtin.replace(/\D/g, "");
  if (digits.length >= 6) return { value: digits.slice(0, 32), kind: "identifier" };
  const q = (clean(input.q) || rawGtin)
    .normalize("NFKC")
    .toLocaleLowerCase("el")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  if (!q) return undefined;
  return { value: q, kind: /^\d+$/.test(q) ? "identifier" : "text" };
}

export function quickAddLookupFingerprint(input: { gtin?: string; q?: string }): Readonly<{ fingerprint: string; kind: "identifier" | "text" }> | undefined {
  const normalized = normalizedLookup(input);
  if (!normalized) return undefined;
  return {
    fingerprint: digest("bls-quickadd-demand-v1", normalized.value),
    kind: normalized.kind
  };
}

export function quickAddActorHash(shopActor: string): string {
  return digest("bls-quickadd-actor-v1", shopActor.trim());
}
