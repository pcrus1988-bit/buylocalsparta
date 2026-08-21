import { readFileSync } from "node:fs";

const files = {
  privacy: read("apps/web/src/app/privacy/page.tsx"),
  cookies: read("apps/web/src/app/cookies/page.tsx"),
  accessibility: read("apps/web/src/app/accessibility/page.tsx"),
  privacyControls: read("apps/web/src/app/privacy-controls/page.tsx"),
  legalRegistry: read("apps/web/src/lib/legal-transparency.ts"),
  navigation: read("apps/web/src/lib/site-navigation.ts"),
  consent: read("apps/web/src/lib/privacy-consent.ts"),
  proxy: read("apps/web/src/proxy.ts"),
  accountRuntime: read("apps/web/src/lib/account-runtime.ts"),
  vendorRuntime: read("apps/web/src/lib/vendor-runtime.ts"),
  adminRuntime: read("apps/web/src/lib/admin-runtime.ts"),
  dailyRuntime: read("apps/web/src/lib/daily-runtime.ts")
};

const failures: string[] = [];
for (const route of ["/privacy", "/cookies", "/accessibility", "/privacy-controls"]) {
  expect(files.navigation, `href: \"${route}\"`, `navigation exposes ${route}`);
}
expect(files.privacy, "KONTA_MOY", "privacy page uses shared controller identity");
expect(files.privacy, "DATA_RECIPIENTS", "privacy page lists concrete recipients");
expect(files.cookies, "COOKIE_REGISTRY", "cookie policy renders canonical cookie registry");
expect(files.cookies, "CookieSettingsButton", "cookie policy provides withdrawal/settings control");
expect(files.accessibility, "WCAG 2.2", "accessibility statement names WCAG 2.2 baseline");
expect(files.accessibility, "screen reader", "accessibility statement describes manual testing");
expect(files.privacyControls, "DATA_ACCESS_EXAMPLES", "privacy centre explains purpose-based access");

const cookieNames = [
  ["bls_consent_v1", files.consent],
  ["bls_analytics", files.consent],
  ["bls_marketplace", files.proxy],
  ["bls_session", files.accountRuntime],
  ["bls_vendor_session", files.vendorRuntime],
  ["bls_admin_session", files.adminRuntime],
  ["bls_daily_session", files.dailyRuntime]
] as const;
for (const [cookie, source] of cookieNames) {
  expect(source, cookie, `runtime contains ${cookie}`);
  expect(files.legalRegistry, `name: \"${cookie}\"`, `cookie registry documents ${cookie}`);
}

if (failures.length) {
  console.error("Legal transparency checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Legal transparency checks passed.");

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function expect(content: string, needle: string, label: string): void {
  if (!content.includes(needle)) failures.push(label);
}
