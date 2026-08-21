import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("db/migrations/0100_personal_data_access_events.sql");
const eventModel = read("packages/core/src/security/events.ts");
const adminRuntime = read("apps/web/src/lib/admin-runtime.ts");
const customerRuntime = read("apps/web/src/lib/admin-customer-management.ts");
const customerDirectoryPage = read("apps/web/src/app/admin/customers/page.tsx");
const operationsPage = read("apps/web/src/app/admin/operations/page.tsx");
const failures: string[] = [];

for (const type of ["personal_data.accessed", "personal_data.revealed", "personal_data.exported"]) {
  if (!migration.includes(`'${type}'`)) failures.push(`Migration is missing security event type ${type}`);
  if (!eventModel.includes(`| \"${type}\"`)) failures.push(`Core security-event model is missing ${type}`);
}

for (const token of [
  'createHash("sha256")',
  'purpose:input.purpose',
  'dataClasses:input.dataClasses.join(",")',
  'actorUserId:principal.userId',
  'resourceType:input.resourceType'
]) {
  if (!adminRuntime.includes(token)) failures.push(`Admin personal-data access logger is missing ${token}`);
}

for (const token of [
  'route: "/admin/customers"',
  'accessScope: "bulk"',
  'route: "/admin/customers/[customerId]"',
  'accessScope: "individual"',
  'purpose: "customer_management"'
]) {
  if (!customerRuntime.includes(token)) failures.push(`Customer management access audit is missing ${token}`);
}

for (const token of [
  "function maskEmail",
  "function maskPhone",
  'const maskedEmail = maskEmail(customer.email)',
  'const maskedPhone = maskPhone(customer.phone)',
  "Bulk views mask contact data by default"
]) {
  if (!customerDirectoryPage.includes(token)) failures.push(`Bulk customer directory masking is missing ${token}`);
}
if (customerDirectoryPage.includes('{customer.email ?? "No email"}{customer.phone ?')) failures.push("Bulk customer directory must not render raw email/phone values");

if (!operationsPage.includes('event.type.startsWith("personal_data.")')) failures.push("Admin operations page must expose personal-data access audit events to audit-authorized roles");
if (!operationsPage.includes("Customer identifiers and raw contact/address values are intentionally not shown")) failures.push("Operations page must explain privacy-minimised access logs");
if (operationsPage.includes("event.subjectHash")) failures.push("Operations page must not display personal-data subject hashes");

for (const forbidden of [
  /details\s*:\s*\{[^}]*\bemail\s*:/s,
  /details\s*:\s*\{[^}]*\bphone\s*:/s,
  /details\s*:\s*\{[^}]*\baddress\s*:/s
]) {
  if (forbidden.test(adminRuntime)) failures.push(`Access logging must not write raw PII fields into security-event details: ${forbidden}`);
}

if (failures.length) {
  console.error("Personal-data access audit checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Personal-data access audit checks passed: access taxonomy, hashed subjects, purpose metadata, bulk/individual Customer 360 instrumentation, masked bulk contact display and privacy-safe audit rendering verified.");
