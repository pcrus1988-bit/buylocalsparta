import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const progress = read("apps/web/src/components/CustomerFulfilmentProgress.tsx");
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
const accountView = read("apps/web/src/lib/account-view.ts");
const accountPrimitives = read("apps/web/src/components/CustomerAccountPrimitives.tsx");
const deliveryWorkspace = read("apps/web/src/components/CustomerDeliveryWorkspaceClient.tsx");
const customerDeliveryView = read("apps/web/src/lib/customer-delivery-view.ts");
const styles = read("apps/web/src/app/customer-fulfilment-progress.css");
const layout = read("apps/web/src/app/layout.tsx");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  "function isCompleted(status: string, fulfilmentMode: string): boolean",
  'fulfilmentMode === "pickup" && status === "handed_over"',
  "const completed = fulfilments.filter((item) => isCompleted(item.status, fulfilmentMode)).length",
  "const customerActions = fulfilments.filter",
  "const problems = fulfilments.filter",
  "toneFor(item.status, fulfilmentMode)",
  "nextStep(item.status, fulfilmentMode)",
  "statusLabel(item.status, fulfilmentMode)",
  "<progress",
  "`${completed} από ${fulfilments.length} τμήματα ολοκληρώθηκαν`",
  'status === "ready_for_handover"',
  'status === "failed"',
  'status === "cancelled"',
  'fulfilmentMode === "local_delivery"',
  "Παραλήφθηκε από οδηγό",
  "Ο οδηγός παρέλαβε αυτό το τμήμα",
  "Η παραγγελία δεν θεωρείται παραδομένη μέχρι να επιβεβαιωθεί το τελικό QR του πελάτη",
  'tone === "action" ? "Δική σου ενέργεια"',
  'tone === "problem" ? "Χρειάζεται προσοχή"',
  "part.lineIds.flatMap",
  "line.title",
  "Χρέωση παράδοσης: {item.deliveryCharge}"
]) expect(progress.includes(contract), `Fulfilment progress component is missing ${contract}`);

expect(!progress.includes('const completed = fulfilments.filter((item) => ["handed_over", "delivered"].includes(item.status)).length'), "Local-delivery driver pickup must not count as customer completion");
expect(!progress.includes('deliveryCharge !== "0,00'), "Fulfilment progress must not infer zero delivery charge from locale-formatted strings");
expect(progress.includes('aria-label={`${completed} από ${fulfilments.length} ολοκληρωμένα`}'), "Fulfilment completion count must have an accessible label");
expect(progress.includes('role="status"'), "Customer-action/problem summary must be announced as status information");

for (const contract of [
  'import { CustomerFulfilmentProgress } from "./CustomerFulfilmentProgress"',
  "<CustomerFulfilmentProgress",
  "fulfilments={data.fulfilments}",
  "fulfilmentMode={data.fulfilmentMode}",
  "CustomerReturnsPanel",
  "/account/support?context=order"
]) expect(orderDetail.includes(contract), `Order detail is missing ${contract}`);
expect(!orderDetail.includes('data.fulfilments.map((item) => <div className="order-detail-line"'), "Order detail must not keep the old flat fulfilment row presentation");

for (const contract of [
  "fulfilments: order.fulfilments.filter",
  "vendorName: vendorNames.get(fulfilment.vendorId)",
  "deliveryCharge: formatMoney(fulfilment.deliveryCharge)",
  "lineIds: fulfilment.lineIds.flatMap",
  "lineTokens.get(lineId)",
  'order.fulfilmentMode === "local_delivery"',
  "Καθ’ οδόν προς εσένα",
  "Συλλογή από καταστήματα",
  "Περιμένει παραλαβή από οδηγό"
]) expect(accountView.includes(contract), `Customer order projection is missing governed fulfilment field ${contract}`);
expect(!accountView.includes('statuses.every((status) => ["handed_over", "delivered"].includes(status))) return order.fulfilmentMode === "pickup" ? "Παραλήφθηκε" : "Ολοκληρώθηκε"'), "Customer order status must not project local driver custody as completed");

for (const contract of [
  "const deliveryTransit =",
  "καθ’ οδόν",
  "συλλογή από καταστήματα",
  "παραλαβή από οδηγό",
  "ready || shipping || deliveryTransit"
]) expect(accountPrimitives.includes(contract), `Customer lifecycle is missing local-delivery transit contract ${contract}`);

for (const contract of [
  "const vendorPickupsComplete =",
  "const showCustomerQr = Boolean(job.customerQr",
  'job.status === "in_progress"',
  "vendorPickupsComplete",
  "customerDropoffOpen",
  "Το QR τελικής παράδοσης θα εμφανιστεί",
  "showReturnPickupQr"
]) expect(deliveryWorkspace.includes(contract), `Customer delivery UI is missing proof gating contract ${contract}`);

for (const contract of [
  "function customerSafeDeliveryJob",
  "const customerDropoffActive =",
  'stop.kind === "customer_dropoff" && stop.status === "ready"',
  "const exposeLiveLocation =",
  "latestLocation: exposeLiveLocation ? job.latestLocation : undefined",
  "customerQr: exposeDeliveryProof ? job.customerQr : undefined",
  "returnPickupQr: exposeReturnPickupProof ? job.returnPickupQr : undefined",
  'job.status === "in_progress"',
  "vendorPickupsComplete",
  "customerDropoffActive"
]) expect(customerDeliveryView.includes(contract), `Customer delivery server projection is missing privacy/proof contract ${contract}`);
expect(!customerDeliveryView.includes("latestLocation: job.latestLocation"), "Customer delivery projection must not expose driver GPS without active final-leg gating");

for (const contract of [
  ".customer-fulfilment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))",
  ".customer-fulfilment-card.is-success",
  ".customer-fulfilment-card.is-action",
  ".customer-fulfilment-card.is-problem",
  "@media(max-width:760px)",
  ".customer-fulfilment-grid{grid-template-columns:1fr}",
  "@media(max-width:620px)",
  ".order-detail-grid,.order-detail-main,.order-detail-side",
  "overflow-wrap:anywhere"
]) expect(styles.includes(contract), `Fulfilment progress stylesheet is missing ${contract}`);
expect(!styles.includes("var(--success)") && !styles.includes("var(--warning)") && !styles.includes("var(--danger)"), "Fulfilment progress styles must use existing project design tokens");
expect(layout.includes('import "./customer-fulfilment-progress.css"'), "Global layout must load fulfilment progress styles");

if (failures.length) {
  console.error("Customer fulfilment progress checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer fulfilment progress checks passed: local-driver custody is distinct from customer completion, delivery proof and exact GPS are active-final-leg gated, return proof remains governed, lifecycle states and responsive presentation are verified.");
