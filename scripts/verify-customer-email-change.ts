import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-email-change-runtime.ts");
const requestRoute = read("apps/web/src/app/api/account/security/email-change/route.ts");
const confirmRoute = read("apps/web/src/app/api/account/security/email-change/confirm/route.ts");
const securityPage = read("apps/web/src/app/account/security/page.tsx");
const securityClient = read("apps/web/src/components/AccountSecurityClient.tsx");
const confirmPage = read("apps/web/src/app/confirm-email-change/page.tsx");
const confirmClient = read("apps/web/src/components/ConfirmEmailChangeForm.tsx");
const login = read("apps/web/src/components/LoginForm.tsx");
const navigation = read("apps/web/src/lib/site-navigation.ts");
const migration = read("db/migrations/0114_customer_verified_email_change.sql");
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");
const failures: string[] = [];

for (const contract of [
  "customerEmailChangeReadiness",
  "customerPendingEmailChange",
  "requestCustomerEmailChange",
  "cancelCustomerEmailChange",
  "confirmCustomerEmailChange",
  "productionDatabaseConfigured()",
  "verifyPassword(input.currentPassword",
  'route: "customer-email-change"',
  "limit: 3",
  "30 * 60 * 1000",
  "email-change:${raw}",
  "tokenHash(token)",
  "expires_at>$2",
  "consumed_at IS NULL",
  "cancelled_at IS NULL",
  "DELETE FROM user_sessions",
  "password_reset_tokens",
  "account.email_changed",
  "await sendPreviousEmailSecurityNotice"
]) {
  if (!service.includes(contract)) failures.push(`Verified email-change runtime is missing ${contract}`);
}
if (service.includes("void sendPreviousEmailSecurityNotice")) failures.push("Old-address security notice must not be fire-and-forget in serverless runtime");
if (!service.includes("SET email=$2,email_verified_at=$3")) failures.push("Confirmed email change must atomically update and verify the new login email");
if (!service.includes("SELECT 1 AS present FROM users WHERE email=$1")) failures.push("Email change must reject an address already claimed by another account");
if (!service.includes("customer_email_change_tokens") || !service.includes("target_email")) failures.push("Email change must persist the pending target separately from the active users.email value");

for (const contract of ["requireAccountSession(request, true)", "requestCustomerEmailChange", "currentPassword", "newEmail"]) {
  if (!requestRoute.includes(contract)) failures.push(`Email-change request API is missing ${contract}`);
}
if (!requestRoute.includes("DELETE") || !requestRoute.includes("cancelCustomerEmailChange")) failures.push("Email-change request API must expose authenticated cancellation");
if (confirmRoute.includes("requireAccountSession")) failures.push("Possession-based email confirmation must not require the old authenticated session");
for (const contract of ["confirmCustomerEmailChange", "token.length > 512", 'Cache-Control": "no-store"']) {
  if (!confirmRoute.includes(contract)) failures.push(`Email-change confirmation API is missing ${contract}`);
}

for (const contract of ["customerPendingEmailChange(principal)", "customerEmailChangeReadiness()", "initialPendingEmailChange", "emailChangeReady"]) {
  if (!securityPage.includes(contract)) failures.push(`Account security page is missing ${contract}`);
}
for (const contract of [
  "/api/account/security/email-change",
  '"x-csrf-token": csrfToken',
  'autoComplete="email"',
  'autoComplete="current-password"',
  "Αναμονή επιβεβαίωσης",
  "CustomerLifecycle",
  "Ακύρωση αιτήματος"
]) {
  if (!securityClient.includes(contract)) failures.push(`Account security email-change UX is missing ${contract}`);
}

for (const contract of ["robots: { index: false", "ConfirmEmailChangeForm", "tokenValue"]) {
  if (!confirmPage.includes(contract)) failures.push(`Email-change confirmation page is missing ${contract}`);
}
for (const contract of [
  "/api/account/security/email-change/confirm",
  "type=\"button\"",
  "emailChanged=1",
  "Επιβεβαίωση νέου email"
]) {
  if (!confirmClient.includes(contract)) failures.push(`Email-change confirmation UI is missing ${contract}`);
}
if (!login.includes('searchParams.get("emailChanged") === "1"')) failures.push("Login must explain the post-email-change sign-in handoff");

for (const contract of [
  "CREATE TABLE public.customer_email_change_tokens",
  "target_email citext NOT NULL",
  "token_hash text NOT NULL UNIQUE",
  "customer_email_change_tokens_active_user_uidx",
  "customer_email_change_tokens_active_target_uidx",
  "ENABLE ROW LEVEL SECURITY",
  "bls_customer_email_change_runtime_all",
  "FROM PUBLIC, anon, authenticated, service_role",
  "GRANT SELECT, INSERT, UPDATE, DELETE"
]) {
  if (!migration.includes(contract)) failures.push(`Email-change migration is missing ${contract}`);
}
if (migration.includes("token text") || migration.includes("verification_token text")) failures.push("Email-change migration must never persist the raw verification token");
if (!postgresRuntime.includes("EXPECTED_SCHEMA_VERSION = 127")) failures.push("PostgreSQL readiness must expect schema version 127");
if (!navigation.includes('"/confirm-email-change"')) failures.push("Email-change confirmation route must be explicitly classified as non-indexable/private utility");
const confirmOccurrences = navigation.split('"/confirm-email-change"').length - 1;
if (confirmOccurrences < 2) failures.push("Email-change confirmation route must also be disallowed from robots crawling");

if (failures.length) {
  console.error("Customer verified email-change checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Customer verified email-change checks passed: current-password proof, abuse control, pending-address reservation, signed one-time confirmation, session/reset invalidation, old-address security notice, private migration ACLs and UX lifecycle verified.");
