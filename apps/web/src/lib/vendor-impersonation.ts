import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";

export const ADMIN_VENDOR_IMPERSONATION_COOKIE = "bls_admin_vendor_impersonation";
export const ADMIN_VENDOR_IMPERSONATION_TTL_MS = 30 * 60 * 1000;

type VendorImpersonationPayload = Readonly<{
  version: 1;
  adminUserId: string;
  adminSessionId: string;
  vendorId: string;
  csrfToken: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}>;

export type VendorImpersonationSession = Readonly<{
  principal: SessionPrincipal;
  admin: SessionPrincipal;
  vendorId: string;
  expiresAt: number;
}>;

function authSecret(): Buffer {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return Buffer.from(`vendor-impersonation:${configured}`, "utf8");
  if (process.env.NODE_ENV === "production") {
    throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for production vendor impersonation");
  }
  return Buffer.from("vendor-impersonation:buy-local-sparta-development-auth-secret-not-production", "utf8");
}

function safeStringEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

function signature(encodedPayload: string): string {
  return createHmac("sha256", authSecret()).update(encodedPayload).digest("base64url");
}

function encodePayload(payload: VendorImpersonationPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

function decodePayload(token: string): VendorImpersonationPayload | undefined {
  if (!token || token.length > 4096) return undefined;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeStringEqual(suppliedSignature, signature(encoded))) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<VendorImpersonationPayload>;
    if (
      parsed.version !== 1
      || typeof parsed.adminUserId !== "string"
      || typeof parsed.adminSessionId !== "string"
      || typeof parsed.vendorId !== "string"
      || typeof parsed.csrfToken !== "string"
      || typeof parsed.nonce !== "string"
      || typeof parsed.issuedAt !== "number"
      || typeof parsed.expiresAt !== "number"
    ) return undefined;
    return parsed as VendorImpersonationPayload;
  } catch {
    return undefined;
  }
}

function assertSuperAdmin(admin: SessionPrincipal): void {
  if (admin.vendorId || !admin.roles.includes("super_admin")) {
    throw new Error("SUPER_ADMIN_REQUIRED");
  }
}

export function createVendorImpersonation(
  admin: SessionPrincipal,
  vendorIdInput: string,
  now = Date.now(),
  ttlMs = ADMIN_VENDOR_IMPERSONATION_TTL_MS
): Readonly<{ token: string; expiresAt: number }> {
  assertSuperAdmin(admin);
  const vendorId = vendorIdInput.trim();
  if (!vendorId || vendorId.length > 160) throw new Error("A valid vendorId is required");
  const effectiveTtl = Math.max(60_000, Math.min(ttlMs, ADMIN_VENDOR_IMPERSONATION_TTL_MS));
  const payload: VendorImpersonationPayload = {
    version: 1,
    adminUserId: admin.userId,
    adminSessionId: admin.sessionId,
    vendorId,
    csrfToken: randomBytes(24).toString("base64url"),
    nonce: randomBytes(18).toString("base64url"),
    issuedAt: now,
    expiresAt: now + effectiveTtl
  };
  return { token: encodePayload(payload), expiresAt: payload.expiresAt };
}

export function vendorImpersonationFromToken(
  token: string | undefined,
  admin: SessionPrincipal | undefined,
  now = Date.now()
): VendorImpersonationSession | undefined {
  if (!token || !admin) return undefined;
  if (admin.vendorId || !admin.roles.includes("super_admin")) return undefined;
  const payload = decodePayload(token);
  if (!payload) return undefined;
  if (payload.expiresAt <= now || payload.issuedAt > now + 60_000) return undefined;
  if (payload.expiresAt - payload.issuedAt > ADMIN_VENDOR_IMPERSONATION_TTL_MS) return undefined;
  if (payload.adminUserId !== admin.userId || payload.adminSessionId !== admin.sessionId) return undefined;

  return {
    admin,
    vendorId: payload.vendorId,
    expiresAt: payload.expiresAt,
    principal: {
      userId: admin.userId,
      email: admin.email,
      roles: ["vendor_owner"],
      vendorId: payload.vendorId,
      csrfToken: payload.csrfToken,
      sessionId: `imp_${payload.nonce}`
    }
  };
}

export function isVendorImpersonationPrincipal(principal: SessionPrincipal): boolean {
  return principal.sessionId.startsWith("imp_") && principal.roles.includes("vendor_owner") && Boolean(principal.vendorId);
}

export function assertVendorImpersonationCsrf(principal: SessionPrincipal, suppliedToken: string | undefined): void {
  if (!isVendorImpersonationPrincipal(principal) || !suppliedToken || !safeStringEqual(principal.csrfToken, suppliedToken)) {
    throw new Error("CSRF validation failed");
  }
}
