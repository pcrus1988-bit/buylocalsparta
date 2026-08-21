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

function preferencesFromStored(parsed: Partial<StoredConsent>): PrivacyConsentPreferences | undefined {
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
}

export function encodePrivacyConsent(preferences: PrivacyConsentPreferences): string {
  const stored: StoredConsent = {
    v: preferences.version,
    p: preferences.personalisation,
    a: preferences.analytics,
    m: preferences.marketing,
    t: preferences.decidedAt
  };
  // ResponseCookies performs the cookie-safe encoding. Pre-encoding here causes
  // the browser-visible value to be double encoded and unreadable after reload.
  return JSON.stringify(stored);
}

export function decodePrivacyConsent(value: string | undefined): PrivacyConsentPreferences | undefined {
  if (!value) return undefined;

  // Accept the canonical value plus once- and twice-percent-encoded legacy
  // values so visitors who already made a choice do not need to consent again.
  let candidate = value;
  for (let depth = 0; depth < 3; depth += 1) {
    try {
      const parsed = JSON.parse(candidate) as Partial<StoredConsent>;
      return preferencesFromStored(parsed);
    } catch {
      // The browser cookie may still be percent encoded by the cookie serializer.
    }

    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return undefined;
      candidate = decoded;
    } catch {
      return undefined;
    }
  }
  return undefined;
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
