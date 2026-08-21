import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const panel = read("apps/web/src/components/CustomerReturnsPanel.tsx");
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
const route = read("apps/web/src/app/api/account/orders/[id]/returns/route.ts");
const service = read("apps/web/src/lib/customer-returns-service.ts");
const primitives = read("apps/web/src/components/CustomerAccountPrimitives.tsx");
const styles = read("apps/web/src/app/customer-returns-lifecycle.css");
const layout = read("apps/web/src/app/layout.tsx");

const failures: string[] = [];

for (const contract of [
  'remedy: "refund" | "replacement" | "repair"',
  'requestedRemedy: draft.remedy',
  'setDrafts',
  'CustomerLifecycle',
  'CustomerStatusNotice',
  'eligibilityReason',
  'rmaCode',
  'returnByAt',
  'trackingNumber'
]) if (!panel.includes(contract)) failures.push(`Return panel is missing ${contract}`);

for (const remedy of ['value="refund"', 'value="replacement"', 'value="repair"']) {
  if (!panel.includes(remedy)) failures.push(`Return panel is missing remedy option ${remedy}`);
}

if (!panel.includes('initialLines.map((line) => [line.id, initialDraft(line.returnableQuantity)])')) {
  failures.push("Return form state must be independent per order line");
}
if (!panel.includes('Μην αποστείλεις προϊόν πριν')) failures.push("Return panel must warn against unapproved shipment");
if (!panel.includes('Η επιλογή σου είναι αίτημα') || !panel.includes('η τελική επιλεξιμότητα')) {
  failures.push("Return panel must distinguish requested from approved remedy/eligibility");
}

for (const contract of ["CustomerReturnsPanel", "initialLines", "initialReturns={data.returns}"]) {
  if (!orderDetail.includes(contract)) failures.push(`Order detail is missing ${contract}`);
}

for (const contract of [
  "requireAccountSession(request, true)",
  "CUSTOMER_RETURN_REMEDIES",
  "requestedRemedy as CustomerReturnRemedy",
  "sendTransactionalEmailBestEffort"
]) if (!route.includes(contract)) failures.push(`Return route is missing ${contract}`);
if (route.includes('requestedRemedy !== "refund"')) failures.push("Return route must not hard-code refund-only self service");

if (!service.includes('CUSTOMER_RETURN_REMEDIES = ["refund", "replacement", "repair"]')) failures.push("Return service must govern supported remedies");
for (const contract of ["manual_review", "serializable", "reserved_return_quantity", "fulfilled <= 0", "input.quantity > returnable"]) {
  if (!service.includes(contract)) failures.push(`Return service is missing safety contract ${contract}`);
}

if (!primitives.includes('"--customer-stage-count"') || !styles.includes('repeat(var(--customer-stage-count,5)')) {
  failures.push("Customer lifecycle layout must support the eight-stage return timeline responsively");
}
if (!primitives.includes("export function CustomerStatusNotice")) failures.push("Shared customer status notice primitive is missing");
if (!layout.includes('import "./customer-returns-lifecycle.css"')) failures.push("Return lifecycle stylesheet is not loaded");

if (failures.length) {
  console.error("Customer returns UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer returns UX checks passed: per-line forms, governed remedy preferences, ownership/CSRF route, eligibility/RMA lifecycle and responsive status semantics verified.");
