export const PRIVACY_CONSENT_VERSION = "2026-08-21";
export const PRIVACY_POLICY_VERSION = "2026-08-21";
export const PRIVACY_CONSENT_COOKIE = "bls_consent_v1";
export const PRIVACY_CONSENT_RECEIPT_COOKIE = "bls_consent_receipt";
export const ANALYTICS_ID_COOKIE = "bls_analytics";
export const PRIVACY_CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const PRIVACY_CONSENT_EVIDENCE_RETENTION_SECONDS = 730 * 24 * 60 * 60;

export type PrivacyConsentPreferences = Readonly<{
  version: string;
  personalisation: boolean;
  analytics: boolean;
  marketing: boolean;
  decidedAt: string;
}>;

type StoredConsent = Readonly<{
  v: string;
  p: boolean;
  a: boolean;
  m: boolean;
  t: string;
}>;

export function encodePrivacyConsent(preferences: PrivacyConsentPreferences): string {
  const stored: StoredConsent = {
    v: preferences.version,
    p: preferences.personalisation,
    a: preferences.analytics,
    m: preferences.marketing,
    t: preferences.decidedAt
  };
  return encodeURIComponent(JSON.stringify(stored));
}

export function decodePrivacyConsent(value: string | undefined): PrivacyConsentPreferences | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as Partial<StoredConsent>;
    if (
      parsed.v !== PRIVACY_CONSENT_VERSION ||
      typeof parsed.p !== "boolean" ||
      typeof parsed.a !== "boolean" ||
      typeof parsed.m !== "boolean" ||
      typeof parsed.t !== "string" ||
      !Number.isFinite(Date.parse(parsed.t))
    ) return undefined;
    return {
      version: parsed.v,
      personalisation: parsed.p,
      analytics: parsed.a,
      marketing: parsed.m,
      decidedAt: parsed.t
    };
  } catch {
    return undefined;
  }
}

export function cookieValue(cookieString: string, name: string): string | undefined {
  for (const part of cookieString.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim();
  }
  return undefined;
}

export function readPrivacyConsent(cookieString: string): PrivacyConsentPreferences | undefined {
  return decodePrivacyConsent(cookieValue(cookieString, PRIVACY_CONSENT_COOKIE));
}

export function hasPersonalisationConsent(cookieString: string): boolean {
  return readPrivacyConsent(cookieString)?.personalisation === true;
}

export function hasAnalyticsConsent(cookieString: string): boolean {
  return readPrivacyConsent(cookieString)?.analytics === true;
}

export function hasMarketingConsent(cookieString: string): boolean {
  return readPrivacyConsent(cookieString)?.marketing === true;
}
