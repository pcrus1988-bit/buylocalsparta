import { createHmac } from "node:crypto";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function digest(secret: string, namespace: string, value: string): string {
  if (secret.trim().length < 32) throw new Error("Quick Add demand fingerprint secret must be at least 32 characters");
  return createHmac("sha256", secret).update(`${namespace}|${value}`).digest("hex");
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

export function quickAddLookupFingerprint(secret: string, input: { gtin?: string; q?: string }): Readonly<{ fingerprint: string; kind: "identifier" | "text" }> | undefined {
  const normalized = normalizedLookup(input);
  if (!normalized) return undefined;
  return {
    fingerprint: digest(secret, "bls-quickadd-demand-v1", normalized.value),
    kind: normalized.kind
  };
}

export function quickAddActorHash(secret: string, shopActor: string): string {
  return digest(secret, "bls-quickadd-actor-v1", shopActor.trim());
}
