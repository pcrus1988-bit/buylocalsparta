import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const progress = read("apps/web/src/components/CustomerFulfilmentProgress.tsx");
const orderDetail = read("apps/web/src/components/OrderDetailClient.tsx");
const accountView = read("apps/web/src/lib/account-view.ts");
const styles = read("apps/web/src/app/customer-fulfilment-progress.css");
const layout = read("apps/web/src/app/layout.tsx");
const failures: string[] = [];
const expect = (condition: boolean, message: string) => { if (!condition) failures.push(message); };

for (const contract of [
  'const completed = fulfilments.filter((item) => ["handed_over", "delivered"].includes(item.status)).length',
  "const customerActions = fulfilments.filter",
  "const problems = fulfilments.filter",
  "toneFor(item.status, fulfilmentMode)",
  "nextStep(item.status, fulfilmentMode)",
  "<progress",
  "`${completed} από ${fulfilments.length} τμήματα ολοκληρώθηκαν`",
  'status === "ready_for_handover"',
  'status === "failed"',
  'status === "cancelled"',
  'tone === "action" ? "Δική σου ενέργεια"',
  'tone === "problem" ? "Χρειάζεται προσοχή"',
  "part.lineIds.flatMap",
  "line.title",
  "Χρέωση παράδοσης: {item.deliveryCharge}"
]) expect(progress.includes(contract), `Fulfilment progress component is missing ${contract}`);

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
  "lineIds: fulfilment.lineIds"
]) expect(accountView.includes(contract), `Customer order projection is missing governed fulfilment field ${contract}`);

for (const contract of [
  ".customer-fulfilment-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))",
  ".customer-fulfilment-card.is-success",
  ".customer-fulfilment-card.is-action",
  ".customer-fulfilment-card.is-problem",
  "@media(max-width:760px)",
  ".customer-fulfilment-grid{grid-template-columns:1fr}"
]) expect(styles.includes(contract), `Fulfilment progress stylesheet is missing ${contract}`);
expect(!styles.includes("var(--success)") && !styles.includes("var(--warning)") && !styles.includes("var(--danger)"), "Fulfilment progress styles must use existing project design tokens");
expect(layout.includes('import "./customer-fulfilment-progress.css"'), "Global layout must load fulfilment progress styles");

if (failures.length) {
  console.error("Customer fulfilment progress checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer fulfilment progress checks passed: split completion, per-part next steps, customer action/problem semantics, governed projection fields and responsive presentation verified.");
