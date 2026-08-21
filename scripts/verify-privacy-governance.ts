import { readFileSync } from "node:fs";

const files = {
  memoryPrivacy: read("packages/core/src/privacy/service.ts"),
  postgresPrivacy: read("packages/core/src/persistence/postgres-privacy.ts"),
  migration: read("db/migrations/0098_privacy_defaults_governance.sql"),
  governance: read("apps/web/src/lib/privacy-governance.ts"),
  adminPrivacy: read("apps/web/src/app/admin/privacy/page.tsx")
};

const failures: string[] = [];
expect(files.memoryPrivacy, "recommendationsEnabled: false, recentlyViewedEnabled: false", "in-memory personalization defaults off");
expect(files.postgresPrivacy, "recommendationsEnabled: p ? Boolean(p.recommendations_enabled) : false", "Postgres missing-profile recommendation default off");
expect(files.postgresPrivacy, "recentlyViewedEnabled: p ? Boolean(p.recently_viewed_enabled) : false", "Postgres missing-profile recently-viewed default off");
expect(files.migration, "ALTER COLUMN recommendations_enabled SET DEFAULT false", "database recommendation default off");
expect(files.migration, "ALTER COLUMN recently_viewed_enabled SET DEFAULT false", "database recently-viewed default off");
if (/UPDATE\s+customer_profiles\s+SET\s+recommendations_enabled\s*=\s*false/i.test(files.migration)) {
  failures.push("migration 0098 must not silently rewrite existing customer personalization rows");
}

// Account closure safeguards are unrelated to personalization defaults and must survive privacy work.
expect(files.postgresPrivacy, "Customer account closure must be self-authorized", "self-authorized closure safeguard retained");
expect(files.postgresPrivacy, "Business or staff accounts require administrative offboarding", "business/staff closure safeguard retained");
expect(files.postgresPrivacy, "original_email_hash", "account closure evidence hash retained");

for (const activity of ["account_auth", "orders_checkout", "payments_refunds", "tax_mydata", "pickup_delivery", "communications_support", "personalization", "analytics", "security_audit", "privacy_rights", "vendor_onboarding"]) {
  expect(files.governance, `id: \"${activity}\"`, `ROPA contains ${activity}`);
}
for (const retention of ["identity_sessions", "marketplace_identity", "consent_evidence", "personalization", "analytics", "security_audit", "financial_records", "commerce_records", "communications", "privacy_requests", "vendor_governance"]) {
  expect(files.governance, `key: \"${retention}\"`, `retention registry contains ${retention}`);
}
for (const provider of ["Supabase", "Vercel", "Resend", "Viva.com", "BOX NOW", "AADE / myDATA"]) {
  expect(files.governance, `name: \"${provider}\"`, `provider registry contains ${provider}`);
}
expect(files.adminPrivacy, "PROCESSING_ACTIVITIES", "admin privacy renders ROPA registry");
expect(files.adminPrivacy, "RETENTION_RULES", "admin privacy renders retention registry");
expect(files.adminPrivacy, "PROVIDER_GOVERNANCE", "admin privacy renders provider registry");
expect(files.adminPrivacy, "Legacy personalization review", "admin privacy surfaces legacy personalization review");

if (failures.length) {
  console.error("Privacy governance checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Privacy governance checks passed.");

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function expect(content: string, needle: string, label: string): void {
  if (!content.includes(needle)) failures.push(label);
}
