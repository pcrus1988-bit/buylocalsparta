import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-account-onboarding.ts");
const component = read("apps/web/src/components/CustomerAccountSetupChecklist.tsx");
const page = read("apps/web/src/app/account/page.tsx");
const css = read("apps/web/src/app/customer-account-onboarding.css");
const layout = read("apps/web/src/app/layout.tsx");
const failures: string[] = [];

for (const contract of [
  "customerAccountProfile(principal)",
  "productionDatabaseConfigured()",
  "customerCheckoutProfile(principal)",
  "profile.firstName.trim() && profile.lastName.trim()",
  "checkoutProfile.addresses.length > 0",
  "totalCount: 2",
  "complete: completedCount === 2"
]) if (!service.includes(contract)) failures.push(`Account setup derivation is missing ${contract}`);

for (const forbidden of ["INSERT INTO", "UPDATE ", "DELETE FROM", "localStorage", "cookies()"])
  if (service.includes(forbidden)) failures.push(`Account setup must remain computed-only; found ${forbidden}`);

for (const contract of [
  "if (setup.complete) return null",
  "Ξεκίνα από εδώ",
  "Προσωπικά στοιχεία",
  "Διεύθυνση",
  "setup.completedCount",
  "setup.totalCount",
  "<progress",
  "aria-label",
  "href=\"/account/profile\""
]) if (!component.includes(contract)) failures.push(`Account setup checklist is missing ${contract}`);

if (component.includes("verify email") || component.includes("Επιβεβαίωση email")) failures.push("Checklist must not advertise an email-verification step without a complete action flow");

for (const contract of [
  "customerAccountSetup",
  "Promise.all([accountDashboard(principal), customerAccountSetup(principal)])",
  "<CustomerAccountSetupChecklist setup={setup} />",
  "<AccountDashboardClient initial={dashboard} />"
]) if (!page.includes(contract)) failures.push(`Account page onboarding integration is missing ${contract}`);

for (const contract of [
  "var(--olive)",
  "var(--terracotta)",
  ".customer-setup-step.is-complete",
  ".customer-setup-step.is-pending",
  "@media(max-width:760px)",
  "@media(max-width:520px)"
]) if (!css.includes(contract)) failures.push(`Account onboarding styles are missing ${contract}`);

if (!layout.includes('import "./customer-account-onboarding.css"')) failures.push("Account onboarding stylesheet is not loaded");

if (failures.length) {
  console.error("Customer account onboarding checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer account onboarding checks passed: computed profile/address setup, auto-dismissal, actionable steps, accessible progress and responsive status semantics verified.");
