import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ADMIN_SESSION_COOKIE } from "./admin-runtime";
import { gemiAdminCredential } from "./gemi-admin-export";

const GEMI_ADMIN_CAPABILITY_COOKIE = "km_gemi_admin_cap";
// Keep read-only ΓΕΜΗ preview/export independent of the PostgreSQL pool for the normal\n// six-hour admin-session window. The capability is encrypted, HttpOnly and bound to the\n// exact admin-session cookie hash, so removing/rotating that cookie invalidates it.\nconst CAPABILITY_TTL_MS = 6 * 60 * 60 * 1000;

type CapabilityPayload = Readonly<{
  version: 1;
  userId: string;
  sessionHash: string;
  apiKey: string;
  expiresAt: number;
}>;

export type GemiAdminCapability = Readonly<{
  userId: string;
  apiKey: string;
  expiresAt: number;
}>;

function cookieValue(request: Request, name: string): string | undefined {
  const raw = request.headers.get("cookie");
  if (!raw) return undefined;
  for (const part of raw.split(";")) {
    const separator = part.indexOf("=");
    if (separator <= 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || undefined;
  }
  return undefined;
}

function capabilityKey(): Buffer {
  const secret = process.env.BLS_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("BLS_AUTH_SECRET is required for ΓΕΜΗ admin capability");
  return createHash("sha256").update(`gemi-admin-capability:v1:${secret}`).digest();
}

function sessionHash(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function encryptCapability(payload: CapabilityPayload): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", capabilityKey(), iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), ciphertext.toString("base64url"), tag.toString("base64url")].join(".");
}

function decryptCapability(token: string): CapabilityPayload | undefined {
  const [version, ivRaw, ciphertextRaw, tagRaw, ...extra] = token.split(".");
  if (version !== "v1" || !ivRaw || !ciphertextRaw || !tagRaw || extra.length) return undefined;
  try {
    const decipher = createDecipheriv("aes-256-gcm", capabilityKey(), Buffer.from(ivRaw, "base64url"));
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextRaw, "base64url")),
      decipher.final()
    ]).toString("utf8");
    const parsed = JSON.parse(plaintext) as Partial<CapabilityPayload>;
    if (
      parsed.version !== 1 ||
      typeof parsed.userId !== "string" ||
      typeof parsed.sessionHash !== "string" ||
      typeof parsed.apiKey !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) return undefined;
    return parsed as CapabilityPayload;
  } catch {
    return undefined;
  }
}

export async function issueGemiAdminCapability(request: Request, userId: string): Promise<{ token: string; capability: GemiAdminCapability }> {
  const adminToken = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!adminToken) throw new Error("ADMIN_AUTH_REQUIRED");

  const apiKey = await gemiAdminCredential();
  if (!apiKey) throw new Error("ΓΕΜΗ API credential is not configured.");

  const expiresAt = Date.now() + CAPABILITY_TTL_MS;
  const payload: CapabilityPayload = {
    version: 1,
    userId,
    sessionHash: sessionHash(adminToken),
    apiKey,
    expiresAt
  };
  return {
    token: encryptCapability(payload),
    capability: { userId, apiKey, expiresAt }
  };
}

export function readGemiAdminCapability(request: Request, now = Date.now()): GemiAdminCapability | undefined {
  const token = cookieValue(request, GEMI_ADMIN_CAPABILITY_COOKIE);
  const adminToken = cookieValue(request, ADMIN_SESSION_COOKIE);
  if (!token || !adminToken) return undefined;
  const payload = decryptCapability(token);
  if (!payload || payload.expiresAt <= now) return undefined;
  if (!safeEqual(payload.sessionHash, sessionHash(adminToken))) return undefined;
  return { userId: payload.userId, apiKey: payload.apiKey, expiresAt: payload.expiresAt };
}

export function gemiAdminCapabilityCookie(token: string, expiresAt: number): string {
  const maxAge = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
  return [
    `${GEMI_ADMIN_CAPABILITY_COOKIE}=${token}`,
    "Path=/api/admin/gemi",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ].join("; ");
}
