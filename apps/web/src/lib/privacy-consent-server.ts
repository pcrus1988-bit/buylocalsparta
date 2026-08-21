import { createHmac, timingSafeEqual } from "node:crypto";
import {
  PRIVACY_CONSENT_RECEIPT_COOKIE,
  PRIVACY_CONSENT_VERSION,
  PRIVACY_POLICY_VERSION,
  cookieValue,
  type PrivacyConsentPreferences
} from "./privacy-consent";

const RECEIPT_ID = /^consent_[a-f0-9]{32}$/;

type ConsentReceiptPayload = Readonly<{
  r: string;
  v: string;
  q: string;
  p: boolean;
  a: boolean;
  m: boolean;
  t: number;
  e: number;
}>;

export type VerifiedConsentReceipt = Readonly<{
  receiptId: string;
  policyVersion: string;
  expiresAt: number;
  preferences: PrivacyConsentPreferences;
}>;

function consentSecret(): string {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for consent receipts");
  return "buy-local-sparta-development-consent-receipt-secret-not-production";
}

function signature(payload: string): string {
  return createHmac("sha256", consentSecret()).update(`privacy-consent:${payload}`).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signPrivacyConsentReceipt(input: {
  receiptId: string;
  personalisation: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: number;
  expiresAt: number;
}): string {
  const payload: ConsentReceiptPayload = {
    r: input.receiptId,
    v: PRIVACY_CONSENT_VERSION,
    q: PRIVACY_POLICY_VERSION,
    p: input.personalisation,
    a: input.analytics,
    m: input.marketing,
    t: input.decidedAt,
    e: input.expiresAt
  };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${signature(encoded)}`;
}

export function verifyPrivacyConsentReceipt(token: string | undefined, now = Date.now()): VerifiedConsentReceipt | undefined {
  if (!token || token.length > 2048) return undefined;
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return undefined;
  const encoded = token.slice(0, separator);
  const suppliedSignature = token.slice(separator + 1);
  if (!safeEqual(suppliedSignature, signature(encoded))) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Partial<ConsentReceiptPayload>;
    if (
      typeof parsed.r !== "string" || !RECEIPT_ID.test(parsed.r) ||
      parsed.v !== PRIVACY_CONSENT_VERSION ||
      parsed.q !== PRIVACY_POLICY_VERSION ||
      typeof parsed.p !== "boolean" ||
      typeof parsed.a !== "boolean" ||
      typeof parsed.m !== "boolean" ||
      typeof parsed.t !== "number" || !Number.isFinite(parsed.t) ||
      typeof parsed.e !== "number" || !Number.isFinite(parsed.e) ||
      parsed.t > now + 5 * 60 * 1000 || parsed.e <= now || parsed.e <= parsed.t
    ) return undefined;
    return {
      receiptId: parsed.r,
      policyVersion: parsed.q,
      expiresAt: parsed.e,
      preferences: {
        version: parsed.v,
        personalisation: parsed.p,
        analytics: parsed.a,
        marketing: parsed.m,
        decidedAt: new Date(parsed.t).toISOString()
      }
    };
  } catch {
    return undefined;
  }
}

export function readVerifiedPrivacyConsentReceipt(cookieHeader: string, now = Date.now()): VerifiedConsentReceipt | undefined {
  return verifyPrivacyConsentReceipt(cookieValue(cookieHeader, PRIVACY_CONSENT_RECEIPT_COOKIE), now);
}

export function hasVerifiedAnalyticsConsent(cookieHeader: string, now = Date.now()): boolean {
  return readVerifiedPrivacyConsentReceipt(cookieHeader, now)?.preferences.analytics === true;
}
