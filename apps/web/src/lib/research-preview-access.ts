import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Restricted, read-only prepublication aggregate-preview grant.
 * This is deliberately NOT a platform admin, Supabase Auth or research raw-answer role.
 * Keep the password in Vercel's sensitive environment configuration, never in Git.
 */
export const RESEARCH_PREVIEW_EMAIL = "preview@kontamou.site";
export const RESEARCH_PREVIEW_COOKIE = "bls_research_2026_preview";
export const RESEARCH_PREVIEW_PATH = "/research/greek-retail-2026/results/Preview";
export const RESEARCH_PREVIEW_LOGIN_PATH = RESEARCH_PREVIEW_PATH + "/login";
export const RESEARCH_PREVIEW_TTL_MS = 6 * 60 * 60 * 1000;

type PreviewTicket = {
  v: 1;
  scope: "greek-retail-2026-aggregates";
  iat: number;
  exp: number;
  nonce: string;
};

function key(): Buffer | undefined {
  const adminSecret = process.env.BLS_AUTH_SECRET?.trim();
  const previewPassword = process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD;
  if (!adminSecret || adminSecret.length < 32 || !previewPassword || previewPassword.length < 12) return undefined;
  // Sessions cease to validate automatically after a password rotation.
  return createHmac("sha256", adminSecret)
    .update("research-2026-preview-v1|")
    .update(previewPassword)
    .digest();
}

function fingerprint(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function safeEquals(left: string, right: string): boolean {
  return timingSafeEqual(fingerprint(left), fingerprint(right));
}

export function researchPreviewConfigured(): boolean {
  return Boolean(key());
}

export function validResearchPreviewCredentials(email: string, password: string): boolean {
  if (!key()) return false;
  const normalizedEmail = email.trim().toLowerCase();
  // Compare both without branching on the email match.
  const emailMatches = safeEquals(normalizedEmail, RESEARCH_PREVIEW_EMAIL);
  const passwordMatches = safeEquals(password, process.env.BLS_RESEARCH_RESULTS_PREVIEW_PASSWORD ?? "");
  return emailMatches && passwordMatches;
}

function signature(encoded: string, secret: Buffer): string {
  return createHmac("sha256", secret).update("research-results-preview-ticket|").update(encoded).digest("base64url");
}

export function createResearchPreviewTicket(now = Date.now()): { token: string; expiresAt: number } {
  const secret = key();
  if (!secret) throw new Error("RESEARCH_PREVIEW_NOT_CONFIGURED");
  const payload: PreviewTicket = {
    v: 1,
    scope: "greek-retail-2026-aggregates",
    iat: now,
    exp: now + RESEARCH_PREVIEW_TTL_MS,
    nonce: randomBytes(16).toString("base64url")
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return { token: encoded + "." + signature(encoded, secret), expiresAt: payload.exp };
}

export function validResearchPreviewTicket(token: string | undefined, now = Date.now()): boolean {
  const secret = key();
  if (!secret || !token || token.length > 2048) return false;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  const [encoded, received] = parts;
  if (!safeEquals(received, signature(encoded, secret))) return false;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<PreviewTicket>;
    return parsed.v === 1 && parsed.scope === "greek-retail-2026-aggregates"
      && typeof parsed.nonce === "string" && parsed.nonce.length >= 16
      && typeof parsed.iat === "number" && Number.isSafeInteger(parsed.iat)
      && typeof parsed.exp === "number" && Number.isSafeInteger(parsed.exp)
      && parsed.iat <= now + 30_000 && parsed.exp > now
      && parsed.exp - parsed.iat === RESEARCH_PREVIEW_TTL_MS;
  } catch {
    return false;
  }
}
