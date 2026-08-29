import { readFileSync, readdirSync, statSync } from "node:fs";
import {
  PRIVACY_CONSENT_COOKIE,
  PRIVACY_CONSENT_VERSION,
  decodePrivacyConsent,
  encodePrivacyConsent,
  readPrivacyConsent
} from "../apps/web/src/lib/privacy-consent.ts";

const files = {
  layout: read("apps/web/src/app/layout.tsx"),
  proxy: read("apps/web/src/proxy.ts"),
  consentApi: read("apps/web/src/app/api/privacy/consent/route.ts"),
  consentUi: read("apps/web/src/components/PrivacyConsentProvider.tsx"),
  utilityLauncher: read("apps/web/src/components/SiteUtilityLauncher.tsx"),
  consentClient: read("apps/web/src/lib/privacy-consent.ts"),
  consentServer: read("apps/web/src/lib/privacy-consent-server.ts"),
  consentEvidence: read("apps/web/src/lib/privacy-consent-evidence.ts"),
  consentMigration: read("db/migrations/0102_cookie_consent_receipts.sql"),
  analyticsClient: read("apps/web/src/lib/product-analytics-client.ts"),
  analyticsApi: read("apps/web/src/app/api/analytics/product/route.ts"),
  googleAnalyticsClient: read("apps/web/src/lib/google-analytics-client.ts"),
  googleAnalyticsComponent: read("apps/web/src/components/GoogleAnalytics.tsx"),
  legalTransparency: read("apps/web/src/lib/legal-transparency.ts"),
  cookiesPage: read("apps/web/src/app/cookies/page.tsx"),
  footer: read("apps/web/src/components/SiteFooter.tsx")
};

const failures: string[] = [];
expect(files.layout, "PrivacyConsentProvider", "consent provider mounted globally");
expect(files.layout, "privacy-consent.css", "consent styles mounted globally");
expect(files.layout, "SiteUtilityLauncher", "site utility launcher mounted globally");
expect(files.proxy, 'const MARKETPLACE_COOKIE = "bls_marketplace"', "essential marketplace identity separated");
expect(files.proxy, "31 * 24 * 60 * 60", "essential marketplace identity limited to 31 days");
expect(files.proxy, 'const LEGACY_VISITOR_COOKIE = "bls_visitor"', "legacy visitor migration retained");
expect(files.proxy, 'pathname === "/api/privacy/consent"', "consent-only requests do not create marketplace identity");
expect(files.proxy, 'pathname.startsWith("/api/analytics/")', "analytics-only requests do not create marketplace identity");
if (files.proxy.includes("90 * 24 * 60 * 60")) failures.push("proxy: legacy 90-day visitor retention is still present");

expect(files.consentClient, 'PRIVACY_CONSENT_RECEIPT_COOKIE = "bls_consent_receipt"', "signed receipt cookie is explicitly defined");
expect(files.consentClient, "return JSON.stringify(stored)", "browser consent is not pre-percent-encoded before ResponseCookies serialization");
expect(files.consentClient, "depth < 3", "legacy double-encoded consent cookies are recoverable");
expect(files.consentServer, "createHmac", "consent receipt is cryptographically signed");
expect(files.consentServer, "timingSafeEqual", "consent signature comparison is timing safe");
expect(files.consentServer, 'process.env.BLS_AUTH_SECRET', "consent receipt uses the server authentication secret");
expect(files.consentServer, "parsed.e <= now", "expired signed consent receipt is rejected");

const sampleConsent = {
  version: PRIVACY_CONSENT_VERSION,
  personalisation: false,
  analytics: true,
  marketing: false,
  decidedAt: "2026-08-21T10:00:00.000Z"
} as const;
const canonicalConsent = encodePrivacyConsent(sampleConsent);
const onceEncodedConsent = encodeURIComponent(canonicalConsent);
const legacyDoubleEncodedConsent = encodeURIComponent(onceEncodedConsent);
if (canonicalConsent.startsWith("%7B") || canonicalConsent.startsWith("%7b")) {
  failures.push("consent runtime: canonical cookie value is still pre-percent-encoded");
}
for (const [label, value] of [
  ["canonical", canonicalConsent],
  ["once encoded", onceEncodedConsent],
  ["legacy double encoded", legacyDoubleEncodedConsent]
] as const) {
  const decoded = decodePrivacyConsent(value);
  if (!decoded || decoded.analytics !== true || decoded.version !== PRIVACY_CONSENT_VERSION) {
    failures.push(`consent runtime: ${label} value cannot be decoded`);
  }
}
const legacyCookieString = `${PRIVACY_CONSENT_COOKIE}=${legacyDoubleEncodedConsent}; another_cookie=ok`;
if (readPrivacyConsent(legacyCookieString)?.analytics !== true) {
  failures.push("consent runtime: legacy browser cookie is not recovered from document.cookie");
}

expect(files.consentApi, "PRIVACY_CONSENT_MAX_AGE_SECONDS", "versioned consent cookie persisted");
expect(files.consentApi, "cross_origin_consent_update_denied", "consent preference write is same-origin protected");
expect(files.consentApi, "unsupported_unregistered_consent_category", "server refuses broad consent for technologies not currently registered");
expect(files.consentApi, "const decision = { personalisation: false, analytics: raw.analytics, marketing: false }", "server limits optional consent to current first-party analytics");
expect(files.consentApi, "persistPrivacyConsentReceipt", "consent decisions have pseudonymous evidence");
expect(files.consentApi, "signPrivacyConsentReceipt", "server issues a signed consent receipt");
expect(files.consentApi, "PRIVACY_CONSENT_RECEIPT_COOKIE", "signed consent receipt is persisted separately from UI state");
expect(files.consentApi, "httpOnly: true", "signed consent receipt is not browser-script readable");
expect(files.consentApi, "if (raw.analytics)", "analytics identity created only after analytics consent");
expect(files.consentApi, "maxAge: 0", "analytics identity removed on withdrawal");
expect(files.consentApi, 'raw.source === "banner" ? "banner" : "settings"', "consent decision source is recorded");

expect(files.consentEvidence, "privacy_consent_receipts", "consent evidence uses the dedicated receipt store");
expect(files.consentEvidence, "superseded_at", "new choices supersede prior receipt evidence");
expect(files.consentEvidence, "retention_until", "consent evidence has bounded retention");
expect(files.consentMigration, "REVOKE ALL PRIVILEGES ON TABLE privacy_consent_receipts FROM PUBLIC, anon, authenticated, service_role", "consent evidence is outside Supabase Data API roles");
const consentTableDefinition = files.consentMigration.split("COMMENT ON TABLE")[0];
for (const forbidden of ["ip_address", "user_agent", "device_fingerprint", "recipient_email", "phone", "postal_address"]) {
  if (consentTableDefinition.includes(forbidden)) failures.push(`consent evidence must not persist ${forbidden}`);
}

expect(files.analyticsClient, "hasAnalyticsConsent(document.cookie)", "browser analytics blocked before consent");
expect(files.analyticsApi, "hasVerifiedAnalyticsConsent(cookieHeader)", "server analytics requires tamper-resistant consent");
expect(files.analyticsApi, "const analyticsHash", "analytics uses separate pseudonymous identity");
expect(files.analyticsApi, "const marketplaceHash", "fairness attribution keeps essential identity separate");
expect(files.consentUi, 'const OPTIONAL_ON: DraftConsent = { personalisation: false, analytics: true, marketing: false }', "accept-all cannot grant consent to inactive future technologies");
expect(files.consentUi, 'persist(OPTIONAL_ON, "banner")', "accept-all banner choice records banner source");
expect(files.consentUi, 'persist(OPTIONAL_OFF, "banner")', "reject-optional banner choice records banner source");
expect(files.consentUi, 'checked={false} disabled aria-label="Marketing trackers, δεν χρησιμοποιούνται"', "inactive marketing consent cannot be toggled");
expect(files.consentUi, 'checked={false} disabled aria-label="Browser προσωποποίηση, δεν χρησιμοποιείται"', "unregistered browser personalization cannot be toggled");
expect(files.consentUi, "Αποδοχή όλων", "accept-all choice available");
expect(files.consentUi, "Απόρριψη προαιρετικών", "reject-optional choice available");
expect(files.consentUi, "Ρυθμίσεις", "granular settings choice available");
expect(files.consentUi, "consent?.analytics", "third-party analytics components mount only after Analytics consent");
expect(files.consentUi, "<GoogleAnalytics />", "registered Google Analytics component is mounted through consent provider");
expect(files.utilityLauncher, "requestCookieSettings", "withdrawal/settings action remains reachable from the utility launcher");
expect(files.utilityLauncher, "Ρυθμίσεις cookies", "cookie settings remain visibly labelled in the utility launcher");
expect(files.footer, "CookieSettingsButton", "footer consent withdrawal/settings control available");
expect(files.legalTransparency, "TRACKER_REGISTRY", "non-cookie tracking has a published registry");
expect(files.legalTransparency, 'name: "bls_consent_receipt"', "signed consent receipt is disclosed in cookie registry");
expect(files.legalTransparency, 'name: "Google Analytics 4"', "Google Analytics is disclosed in tracker registry");
expect(files.legalTransparency, 'provider: "Google LLC"', "Google Analytics provider is disclosed in tracker registry");
expect(files.legalTransparency, 'technology: "Google tag (gtag.js) · Measurement ID G-NC8QWH2WTD"', "Google Analytics implementation is disclosed in tracker registry");
expect(files.legalTransparency, 'activation: "Δεν φορτώνεται πριν από αποδοχή Analytics.', "Google Analytics activation boundary is disclosed in tracker registry");
expect(files.cookiesPage, "Μητρώο trackers και event capture", "cookie policy exposes tracking technologies, not only cookies");
expect(files.cookiesPage, "Δεν συλλέγουμε γενική συγκατάθεση", "cookie policy explicitly rejects generic future marketing consent");

for (const contract of [
  "hasAnalyticsConsent(document.cookie)",
  "isGoogleAnalyticsPublicPath(window.location.pathname)",
  'target[`ga-disable-${GOOGLE_ANALYTICS_ID}`] = false',
  'analytics_storage: "granted"',
  'ad_storage: "denied"',
  'ad_user_data: "denied"',
  'ad_personalization: "denied"',
  "allow_google_signals: false",
  "allow_ad_personalization_signals: false",
  'script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GOOGLE_ANALYTICS_ID)}`'
]) expect(files.googleAnalyticsClient, contract, `Google Analytics client is missing consent/privacy boundary ${contract}`);
for (const contract of [
  "disableGoogleAnalyticsForCurrentRoute",
  "expireGoogleAnalyticsCookies",
  'analytics_storage: "denied"',
  "ensureGoogleAnalytics()",
  "isGoogleAnalyticsPublicPath(pathname)"
]) expect(files.googleAnalyticsComponent, contract, `Google Analytics lifecycle is missing ${contract}`);

const thirdPartyTrackerRegistrations = [
  {
    name: "Google Analytics 4",
    provider: "Google LLC",
    markers: ["googletagmanager.com", "google-analytics.com"],
    implementationFiles: new Set([
      "apps/web/src/lib/google-analytics-client.ts"
    ])
  }
] as const;
const blockedTrackerMarkers = [
  "googletagmanager.com",
  "google-analytics.com",
  "connect.facebook.net",
  "facebook.com/tr",
  "analytics.tiktok.com",
  "static.hotjar.com",
  "script.hotjar.com",
  "clarity.ms",
  "bat.bing.com",
  "snap.licdn.com"
] as const;
for (const file of sourceFiles("apps/web/src")) {
  const content = read(file).toLowerCase();
  for (const marker of blockedTrackerMarkers) {
    if (!content.includes(marker)) continue;
    const registration = thirdPartyTrackerRegistrations.find((item) => item.markers.includes(marker as never));
    const disclosed = registration
      && files.legalTransparency.includes(`name: "${registration.name}"`)
      && files.legalTransparency.includes(`provider: "${registration.provider}"`);
    if (!registration || !disclosed || !registration.implementationFiles.has(file as never)) {
      failures.push(`${file}: unregistered or unauthorized third-party tracker marker ${marker}`);
    }
  }
}

if (failures.length) {
  console.error("Privacy consent checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Privacy consent, signed receipt, specific scope, withdrawal, registered GA4 consent gating and tracker-registry checks passed.");

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function expect(content: string, needle: string, label: string): void {
  if (!content.includes(needle)) failures.push(label);
}

function sourceFiles(relativeRoot: string): string[] {
  const root = new URL(`../${relativeRoot}/`, import.meta.url);
  const out: string[] = [];
  const visit = (url: URL, prefix: string) => {
    for (const name of readdirSync(url)) {
      const child = new URL(name, url);
      const stat = statSync(child);
      const relative = `${prefix}${name}`;
      if (stat.isDirectory()) visit(new URL(`${name}/`, url), `${relative}/`);
      else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) out.push(`${relativeRoot}/${relative}`);
    }
  };
  visit(root, "");
  return out;
}
