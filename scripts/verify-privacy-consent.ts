import { readFileSync } from "node:fs";

const files = {
  layout: read("apps/web/src/app/layout.tsx"),
  proxy: read("apps/web/src/proxy.ts"),
  consentApi: read("apps/web/src/app/api/privacy/consent/route.ts"),
  consentUi: read("apps/web/src/components/PrivacyConsentProvider.tsx"),
  analyticsClient: read("apps/web/src/lib/product-analytics-client.ts"),
  analyticsApi: read("apps/web/src/app/api/analytics/product/route.ts"),
  footer: read("apps/web/src/components/SiteFooter.tsx")
};

const failures: string[] = [];
expect(files.layout, "PrivacyConsentProvider", "consent provider mounted globally");
expect(files.layout, "privacy-consent.css", "consent styles mounted globally");
expect(files.proxy, 'const MARKETPLACE_COOKIE = "bls_marketplace"', "essential marketplace identity separated");
expect(files.proxy, "31 * 24 * 60 * 60", "essential marketplace identity limited to 31 days");
expect(files.proxy, 'const LEGACY_VISITOR_COOKIE = "bls_visitor"', "legacy visitor migration retained");
expect(files.proxy, 'pathname === "/api/privacy/consent"', "consent-only requests do not create marketplace identity");
expect(files.proxy, 'pathname.startsWith("/api/analytics/")', "analytics-only requests do not create marketplace identity");
if (files.proxy.includes("90 * 24 * 60 * 60")) failures.push("proxy: legacy 90-day visitor retention is still present");
expect(files.consentApi, "PRIVACY_CONSENT_MAX_AGE_SECONDS", "versioned consent cookie persisted");
expect(files.consentApi, "cross_origin_consent_update_denied", "consent preference write is same-origin protected");
expect(files.consentApi, "if (raw.analytics)", "analytics identity created only after analytics consent");
expect(files.consentApi, "maxAge: 0", "analytics identity removed on withdrawal");
expect(files.analyticsClient, "hasAnalyticsConsent(document.cookie)", "browser analytics blocked before consent");
expect(files.analyticsApi, "hasAnalyticsConsent(cookieHeader)", "server analytics blocked before consent");
expect(files.analyticsApi, "const analyticsHash", "analytics uses separate pseudonymous identity");
expect(files.analyticsApi, "const marketplaceHash", "fairness attribution keeps essential identity separate");
expect(files.consentUi, "Αποδοχή όλων", "accept-all choice available");
expect(files.consentUi, "Απόρριψη προαιρετικών", "reject-optional choice available");
expect(files.consentUi, "Ρυθμίσεις", "granular settings choice available");
expect(files.consentUi, "privacy-consent-manage-floating", "withdrawal/settings control remains available in dashboards");
expect(files.footer, "CookieSettingsButton", "footer consent withdrawal/settings control available");

if (failures.length) {
  console.error("Privacy consent checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Privacy consent foundation checks passed.");

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function expect(content: string, needle: string, label: string): void {
  if (!content.includes(needle)) failures.push(label);
}
