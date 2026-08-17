import { createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { Role, SessionPrincipal } from "@buy-local-sparta/core";

export type PreviewSessionKind = "customer" | "vendor" | "admin";

type PreviewSessionPayload = {
  v: 1;
  kind: PreviewSessionKind;
  userId: string;
  email: string;
  roles: Role[];
  vendorId?: string;
  csrfToken: string;
  sessionId: string;
  issuedAt: number;
  expiresAt: number;
};

const scopeFlags: Record<PreviewSessionKind, string> = {
  customer: "BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME",
  vendor: "BLS_ALLOW_EPHEMERAL_VENDOR_RUNTIME",
  admin: "BLS_ALLOW_EPHEMERAL_ADMIN_RUNTIME"
};

export function databaseLessPreviewSessionEnabled(kind: PreviewSessionKind): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  if (process.env.DATABASE_URL?.trim()) return false;
  if (process.env.BLS_ALLOW_DATABASELESS_PREVIEW !== "true") return false;
  if (process.env.BLS_ENABLE_DEMO_ACCOUNTS !== "true") return false;
  return process.env[scopeFlags[kind]] === "true";
}

export function previewCredentialMatches(actual: string, expected: string): boolean {
  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

export function createDatabaseLessPreviewSession(input: {
  kind: PreviewSessionKind;
  userId: string;
  email: string;
  roles: Role[];
  vendorId?: string;
  now: number;
  ttlMs: number;
}): { token: string; principal: SessionPrincipal; expiresAt: number } {
  if (!databaseLessPreviewSessionEnabled(input.kind)) throw new Error("Database-less preview sessions are not enabled");
  const payload: PreviewSessionPayload = {
    v: 1,
    kind: input.kind,
    userId: input.userId,
    email: input.email.trim().toLowerCase(),
    roles: [...input.roles],
    vendorId: input.vendorId,
    csrfToken: randomBytes(24).toString("base64url"),
    sessionId: `preview_${input.kind}_${randomUUID()}`,
    issuedAt: input.now,
    expiresAt: input.now + input.ttlMs
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = sign(encoded);
  return { token: `${encoded}.${signature}`, principal: toPrincipal(payload), expiresAt: payload.expiresAt };
}

export function databaseLessPreviewSessionFromToken(token: string | undefined, kind: PreviewSessionKind, now: number): SessionPrincipal | undefined {
  if (!databaseLessPreviewSessionEnabled(kind) || !token) return undefined;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeEqual(suppliedSignature, sign(encoded))) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<PreviewSessionPayload>;
    if (parsed.v !== 1 || parsed.kind !== kind) return undefined;
    if (typeof parsed.userId !== "string" || !parsed.userId) return undefined;
    if (typeof parsed.email !== "string" || !parsed.email) return undefined;
    if (!Array.isArray(parsed.roles) || !parsed.roles.every((role) => typeof role === "string")) return undefined;
    if (parsed.vendorId !== undefined && typeof parsed.vendorId !== "string") return undefined;
    if (typeof parsed.csrfToken !== "string" || !parsed.csrfToken) return undefined;
    if (typeof parsed.sessionId !== "string" || !parsed.sessionId) return undefined;
    if (typeof parsed.issuedAt !== "number" || !Number.isFinite(parsed.issuedAt)) return undefined;
    if (typeof parsed.expiresAt !== "number" || !Number.isFinite(parsed.expiresAt) || parsed.expiresAt <= now) return undefined;
    if (parsed.issuedAt > now + 60_000) return undefined;
    return toPrincipal(parsed as PreviewSessionPayload);
  } catch {
    return undefined;
  }
}

export function assertDatabaseLessPreviewCsrf(principal: SessionPrincipal, supplied: string | undefined): void {
  if (!supplied || !safeEqual(principal.csrfToken, supplied)) throw new Error("CSRF validation failed");
}

function previewSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (!configured || configured.length < 32) throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for database-less preview sessions");
  return configured;
}

function sign(encoded: string): string {
  return createHmac("sha256", previewSecret()).update(`bls-preview-session-v1|${encoded}`).digest("base64url");
}

function safeEqual(leftValue: string, rightValue: string): boolean {
  const left = Buffer.from(leftValue, "utf8");
  const right = Buffer.from(rightValue, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

function toPrincipal(payload: PreviewSessionPayload): SessionPrincipal {
  return {
    userId: payload.userId,
    email: payload.email,
    roles: payload.roles,
    vendorId: payload.vendorId,
    csrfToken: payload.csrfToken,
    sessionId: payload.sessionId
  };
}
