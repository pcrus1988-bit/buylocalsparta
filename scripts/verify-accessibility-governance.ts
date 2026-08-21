import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFile(join(root, path), "utf8");

const [
  migration,
  checksumsRaw,
  runtime,
  rbac,
  navigation,
  governance,
  adminPage,
  adminRoute,
  publicRoute,
  preferences,
  reportForm,
  accessibilityPage,
  layout,
  styles
] = await Promise.all([
  read("db/migrations/0103_accessibility_governance.sql"),
  read("db/migrations/checksums.json"),
  read("packages/postgres-runtime/src/index.ts"),
  read("packages/core/src/auth/rbac.ts"),
  read("apps/web/src/lib/workspace-navigation.ts"),
  read("apps/web/src/lib/accessibility-governance.ts"),
  read("apps/web/src/app/admin/accessibility/page.tsx"),
  read("apps/web/src/app/api/admin/accessibility/action/route.ts"),
  read("apps/web/src/app/api/accessibility/report/route.ts"),
  read("apps/web/src/components/AccessibilityPreferences.tsx"),
  read("apps/web/src/components/AccessibilityReportForm.tsx"),
  read("apps/web/src/app/accessibility/page.tsx"),
  read("apps/web/src/app/layout.tsx"),
  read("apps/web/src/app/accessibility-controls.css")
]);

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const criterionIds = [...migration.matchAll(/\('([1-4]\.[1-9]\.[0-9]{1,2})','(?:A|AA)'/g)].map((match) => match[1]);
expect(criterionIds.length === 55, `expected 55 WCAG A/AA criteria, found ${criterionIds.length}`);
expect(new Set(criterionIds).size === 55, "WCAG criterion seed contains duplicates");
for (const required of ["2.4.11", "2.5.7", "2.5.8", "3.2.6", "3.3.7", "3.3.8"]) expect(criterionIds.includes(required), `missing WCAG 2.2 criterion ${required}`);
expect(!criterionIds.includes("4.1.1"), "removed WCAG 4.1.1 Parsing must not be treated as a WCAG 2.2 criterion");

for (const scope of ["public", "customer", "checkout", "vendor", "daily", "admin"]) {
  expect(migration.includes(`'${scope}'`), `migration missing ${scope} accessibility scope`);
  expect(governance.includes(`"${scope}"`), `runtime missing ${scope} accessibility scope`);
}
expect(migration.includes("CROSS JOIN unnest"), "migration must seed each criterion across every product scope");
expect(migration.includes("status IN ('not_tested','pass','fail','not_applicable')"), "assessment lifecycle constraint is missing");
expect(migration.includes("status = 'not_tested' OR length(COALESCE(evidence,'')) >= 3"), "tested states must require evidence");
expect(migration.includes("does not store IP addresses, device fingerprints or hidden tracking identifiers"), "accessibility report privacy boundary comment is missing");
expect(!/\b(ip_address|fingerprint_hash|device_fingerprint)\b/i.test(migration), "accessibility tables must not add IP/fingerprint columns");
expect(migration.includes("FROM PUBLIC, anon, authenticated, service_role"), "accessibility tables must revoke external/default roles");

const checksums = JSON.parse(checksumsRaw) as Record<string, string>;
const actualHash = createHash("sha256").update(migration).digest("hex");
expect(checksums["0103_accessibility_governance.sql"] === actualHash, `0103 checksum mismatch: manifest=${checksums["0103_accessibility_governance.sql"] ?? "missing"} actual=${actualHash}`);
expect(runtime.includes("EXPECTED_SCHEMA_VERSION = 103"), "PostgreSQL runtime schema target must be 103");

expect(rbac.includes('"accessibility.read"'), "accessibility.read RBAC permission is missing");
expect(rbac.includes('"accessibility.manage"'), "accessibility.manage RBAC permission is missing");
expect(navigation.includes('href: "/admin/accessibility"'), "Admin Trust & Safety navigation must link to accessibility control center");
expect(navigation.includes('permission: "accessibility.read"'), "Accessibility navigation entry must be permission-gated");
expect(adminRoute.includes('permission: "accessibility.manage"'), "Accessibility Admin API must require accessibility.manage");
expect(adminPage.includes("55 success criteria"), "Accessibility Admin page must expose the complete per-scope checklist");
expect(adminPage.includes("Evidence & actions"), "Accessibility Admin page must expose criterion evidence controls");
expect(adminPage.includes("Barrier reports"), "Accessibility Admin page must expose user barrier reports");
expect(governance.includes("status === \"fail\""), "Fail state must drive remediation logic");
expect(governance.includes("status='resolved'"), "Verified remediation must close linked findings");
expect(governance.includes("accessibility.audit.snapshot"), "Audit snapshots must be written to Admin audit evidence");

expect(publicRoute.includes("submitAccessibilityReport"), "Public accessibility report endpoint is missing");
expect(!/x-forwarded-for|cf-connecting-ip|request\.headers\.get\([^)]*ip/i.test(publicRoute), "Public accessibility report endpoint must not capture request IP headers");
expect(reportForm.includes("consentToContact"), "Accessibility report form must explicitly gate contact data");
expect(reportForm.includes("contactEmail: consentToContact"), "Contact email must only be submitted after contact consent");
expect(accessibilityPage.includes("AccessibilityReportForm"), "Public accessibility statement must contain the structured report form");

expect(preferences.includes("bls_accessibility_preferences_v1"), "Accessibility preferences must have a stable local persistence key");
expect(preferences.includes("localStorage"), "Accessibility preferences must persist locally without requiring a tracking cookie");
expect(preferences.includes("accessibility overlay/certificate"), "Preference UI must state that it is not a compliance overlay/certificate");
for (const control of ["a11yContrast", "a11yLinks", "a11ySpacing", "a11yMotion", "a11yFocus"]) expect(preferences.includes(control), `missing accessibility preference ${control}`);
expect(layout.includes("<AccessibilityPreferences />"), "Global layout must render accessibility preferences");
expect(layout.includes('import "./accessibility-controls.css"'), "Global layout must load accessibility control styles");
expect(styles.includes('prefers-reduced-motion: reduce'), "Accessibility controls must respect OS reduced-motion preferences");
expect(styles.includes('data-a11y-focus="true"'), "Enhanced keyboard focus style is missing");

if (failures.length) {
  console.error("Accessibility governance checks failed:\n" + failures.map((item) => `- ${item}`).join("\n"));
  process.exit(1);
}

console.log(`Accessibility governance checks passed: ${criterionIds.length} WCAG 2.2 A/AA criteria × 6 scopes = ${criterionIds.length * 6} evidence slots; migration checksum ${actualHash}.`);
