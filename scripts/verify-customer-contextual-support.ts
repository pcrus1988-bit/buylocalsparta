import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0115_customer_contextual_support.sql");
const checksums = JSON.parse(read("db/migrations/checksums.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");
const customerRuntime = read("apps/web/src/lib/customer-support-runtime.ts");
const customerRoute = read("apps/web/src/app/api/account/support/route.ts");
const customerMessageRoute = read("apps/web/src/app/api/account/support/[id]/messages/route.ts");
const customerPage = read("apps/web/src/app/account/support/page.tsx");
const customerClient = read("apps/web/src/components/CustomerSupportClient.tsx");
const adminReplyRuntime = read("apps/web/src/lib/admin-customer-support-reply.ts");
const adminReplyRoute = read("apps/web/src/app/api/admin/customers/cases/customer-reply/route.ts");
const adminGenericRuntime = read("apps/web/src/lib/admin-customer-support.ts");
const adminPage = read("apps/web/src/app/admin/customers/support/page.tsx");
const accountNavigation = read("apps/web/src/components/AccountSectionNavigation.tsx");
const siteNavigation = read("apps/web/src/lib/site-navigation.ts");
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
const returnsPanel = read("apps/web/src/components/CustomerReturnsPanel.tsx");
const askLocal = read("apps/web/src/components/AskLocalClient.tsx");
const layout = read("apps/web/src/app/layout.tsx");
const styles = read("apps/web/src/app/customer-support.css");
const failures: string[] = [];

const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

const migrationHash = createHash("sha256").update(migration).digest("hex");
expect(checksums["0115_customer_contextual_support.sql"] === migrationHash, `0115 checksum mismatch: manifest=${checksums["0115_customer_contextual_support.sql"] ?? "missing"} actual=${migrationHash}`);
expect(postgresRuntime.includes("EXPECTED_SCHEMA_VERSION = 122"), "PostgreSQL readiness must expect schema version 122");

for (const contract of [
  "ADD COLUMN IF NOT EXISTS context_type text",
  "ADD COLUMN IF NOT EXISTS context_public_id text",
  "customer_support_cases_context_pair_check",
  "customer_visible boolean NOT NULL DEFAULT false",
  "Only explicit customer messages or Admin replies may set true"
]) expect(migration.includes(contract), `Contextual-support migration is missing ${contract}`);

for (const contract of [
  "customerSupportCases",
  "createCustomerSupportCase",
  "replyCustomerSupportCase",
  "PostgresFixedWindowRateLimiter",
  'route: "customer-support-create"',
  'route: "customer-support-reply"',
  "WHERE customer_user_id=$1::uuid",
  "AND e.customer_visible=true",
  "user_id=$1::uuid AND (public_id=$2 OR order_number=$2)",
  "customer_user_id=$1::uuid AND (public_id=$2 OR reference_number=$2)",
  "customer_user_id=$1::uuid AND (public_id=$2 OR return_number=$2)",
  "user_id=$1::uuid AND (public_id=$2 OR reference_number=$2)",
  "id: referenceNumber",
  "messages: messages.get(internalCaseId) ?? []"
]) expect(customerRuntime.includes(contract), `Customer support runtime is missing ${contract}`);
expect(!customerRuntime.includes("FROM customer_orders WHERE customer_user_id=$1::uuid"), "Order contextual support must use customer_orders.user_id; customer_user_id does not exist on the live order table");

const messageProjection = customerRuntime.match(/export type CustomerSupportMessageView = Readonly<\{([\s\S]*?)\}>;/)?.[1] ?? "";
expect(Boolean(messageProjection), "Customer support message projection could not be inspected");
expect(!/\bid\s*:/.test(messageProjection), "Customer-visible support messages must not expose internal event identifiers");
expect(!customerRuntime.includes("body: message,"), "Support-team notification bodies must not contain the customer's support message verbatim");

for (const route of [customerRoute, customerMessageRoute]) {
  expect(route.includes("requireAccountSession(request, true)"), "Customer support mutation route must require authenticated CSRF-protected account session");
  expect(route.includes('Cache-Control": "no-store"'), "Customer support route must disable response caching");
}
expect(customerRoute.includes("createCustomerSupportCase"), "Customer support collection API must create cases through the governed runtime");
expect(customerMessageRoute.includes("replyCustomerSupportCase"), "Customer support message API must reply through the governed runtime");

for (const contract of [
  "robots: { index: false, follow: false }",
  "customerSupportCases(principal)",
  "customerSupportReadiness()",
  "CustomerSupportClient"
]) expect(customerPage.includes(contract), `Customer support account page is missing ${contract}`);
for (const contract of [
  "CustomerLifecycle",
  "/api/account/support",
  "/api/account/support/${encodeURIComponent(caseId)}/messages",
  "Οι εσωτερικές σημειώσεις της ομάδας παραμένουν εσωτερικές",
  "referenceNumber",
  "Χρειάζεται απάντησή σου"
]) expect(customerClient.includes(contract), `Customer support UI is missing ${contract}`);
expect(!customerClient.includes("case_") && !customerClient.includes("caseevt_"), "Customer support UI must not embed technical support identifiers");

expect(!adminGenericRuntime.includes("customer_visible"), "Generic Admin support notes must remain internal and must not set customer_visible");
for (const contract of [
  "adminReplyToCustomerSupportCase",
  'assertAdminPermission(principal, "customer.manage")',
  "customer_visible,created_at",
  "true,$8",
  'const nextStatus = "waiting_customer"',
  "customer_support.customer_visible_reply",
  "JSON.stringify({ caseReference: referenceNumber })"
]) expect(adminReplyRuntime.includes(contract), `Explicit Admin customer-reply runtime is missing ${contract}`);
expect(!adminReplyRuntime.includes("JSON.stringify({ caseId:"), "Customer notification payload must use the human ticket reference, not the technical case ID");
for (const contract of [
  "requireAdminSession(request, { csrf: true",
  'permission: "customer.manage"',
  "adminReplyToCustomerSupportCase",
  'message: String(body.reason ?? body.message ?? "")'
]) expect(adminReplyRoute.includes(contract), `Admin customer-reply API is missing ${contract}`);
for (const contract of [
  'label="Reply to customer"',
  'endpoint="/api/admin/customers/cases/customer-reply"',
  'extraPrompt={{ field:"message"',
  "Generic case notes remain internal"
]) expect(adminPage.includes(contract), `Admin support workspace is missing ${contract}`);

expect(accountNavigation.includes('{ href: "/account/support", label: "Υποστήριξη" }'), "Account navigation must include customer support");
expect(siteNavigation.includes('"/account/support"'), "Customer support route must be explicitly non-indexable");
expect(orderDetail.includes("/account/support?context=order"), "Order detail must provide contextual order support entry");
expect(returnsPanel.includes("/account/support?context=return"), "Return records must provide contextual return support entry");
expect(askLocal.includes("/account/support?context=ask_local"), "Ask Local requests must provide contextual support entry");
expect(layout.includes('import "./customer-support.css"'), "Global layout must load customer support styles");
for (const style of ["customer-support-layout", "customer-support-case", "customer-support-thread", "customer-support-message"]) expect(styles.includes(style), `Customer support stylesheet is missing ${style}`);

if (failures.length) {
  console.error("Customer contextual-support checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`Customer contextual-support checks passed: checksum ${migrationHash}; customer ownership, human references, internal-note isolation, CSRF, abuse controls, explicit Admin replies and contextual lifecycle entry points verified.`);
