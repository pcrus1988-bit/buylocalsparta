import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const panel = read("apps/web/src/components/CustomerReturnsPanel.tsx");
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
const route = read("apps/web/src/app/api/account/orders/[id]/returns/route.ts");
const service = read("apps/web/src/lib/customer-returns-service.ts");
const primitives = read("apps/web/src/components/CustomerAccountPrimitives.tsx");
const supportVerifier = read("scripts/verify-customer-contextual-support.ts");
const styles = read("apps/web/src/app/customer-returns-lifecycle.css");
const layout = read("apps/web/src/app/layout.tsx");

const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  'type Remedy = "refund" | "replacement" | "repair"',
  "requestedRemedy: draft.remedy",
  "setDrafts",
  "CustomerLifecycle",
  "CustomerStatusNotice",
  "eligibilityReason",
  "rmaCode",
  "returnByAt",
  "trackingNumber",
  "/account/support?context=return"
]) expect(panel.includes(contract), `Return panel is missing ${contract}`);

for (const remedy of ['value="refund"', 'value="replacement"', 'value="repair"']) {
  expect(panel.includes(remedy), `Return panel is missing remedy option ${remedy}`);
}
expect(panel.includes("initialLines.map((line) => [line.id, initialDraft(line.returnableQuantity)])"), "Return form state must be independent per order line");
expect(panel.includes("Μην αποστείλεις προϊόν πριν"), "Return panel must warn against unapproved shipment");
expect(panel.includes("Η επιλογή σου είναι αίτημα") && panel.includes("η τελική επιλεξιμότητα"), "Return panel must distinguish requested from approved remedy/eligibility");
expect(panel.includes('const labels = ["Αίτημα", "Επιλεξιμότητα", "Οδηγίες / RMA", "Αποστολή", "Παραλαβή", "Έλεγχος", "Λύση", "Ολοκλήρωση"]'), "Return panel must expose the eight-stage lifecycle");
expect(panel.includes('progressOnly = ["requested", "in_transit", "received", "inspected", "remedy_approved"]'), "Return panel must distinguish processing-only states from customer-action states");

for (const contract of ["CustomerReturnsPanel", "initialLines", "initialReturns={data.returns}"]) {
  expect(orderDetail.includes(contract), `Order detail is missing ${contract}`);
}
expect(!orderDetail.includes("returnQuantity") && !orderDetail.includes("returnReason") && !orderDetail.includes("returnNote"), "Order detail must not retain shared return form state");
expect(!orderDetail.includes("requestedRemedy: \"refund\""), "Order detail must not hard-code refund-only return requests");
expect(orderDetail.includes("/account/support?context=order"), "Order support entry must survive the return refactor");

for (const contract of [
  "requireAccountSession(request, true)",
  "CUSTOMER_RETURN_REMEDIES",
  "requestedRemedy as CustomerReturnRemedy",
  "sendTransactionalEmailBestEffort",
  "requestedRemedy,"
]) expect(route.includes(contract), `Return route is missing ${contract}`);
expect(!route.includes('requestedRemedy !== "refund"'), "Return route must not hard-code refund-only self service");

expect(service.includes('CUSTOMER_RETURN_REMEDIES = ["refund", "replacement", "repair"]'), "Return service must govern supported remedies");
for (const contract of ["manual_review", "serializable", "reserved_return_quantity", "fulfilled <= 0", "input.quantity > returnable"]) {
  expect(service.includes(contract), `Return service is missing safety contract ${contract}`);
}

expect(primitives.includes('"--customer-stage-count"'), "Customer lifecycle primitive must expose dynamic stage count");
expect(primitives.includes("export function CustomerStatusNotice"), "Shared customer status notice primitive is missing");
expect(styles.includes("repeat(var(--customer-stage-count,5)"), "Return lifecycle styles must support variable stage counts responsively");
expect(layout.includes('import "./customer-returns-lifecycle.css"'), "Return lifecycle stylesheet is not loaded");
expect(supportVerifier.includes('returnsPanel.includes("/account/support?context=return")'), "Contextual-support verification must follow return links into the return panel");

if (failures.length) {
  console.error("Customer returns UX checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer returns UX checks passed: per-line forms, governed remedy preferences, ownership/CSRF route, eligibility/RMA lifecycle, contextual support and responsive status semantics verified.");
