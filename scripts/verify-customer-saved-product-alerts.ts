import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-saved-product-alert-actions.ts");
const route = read("apps/web/src/app/api/account/saved-products/[id]/route.ts");
const client = read("apps/web/src/components/AccountSavedClient.tsx");
const view = read("apps/web/src/lib/account-view.ts");
const core = read("packages/core/src/engagement/service.ts");
const css = read("apps/web/src/app/customer-saved-product-alerts.css");
const layout = read("apps/web/src/app/layout.tsx");
const failures: string[] = [];

for (const contract of [
  "export async function configureCustomerSavedProductAlert",
  "const snapshot = await customerStateSnapshot(principal.userId, now)",
  "snapshot.savedProducts.some((item) => item.canonicalVariantId === canonicalVariantId)",
  "getCanonicalProductSummary(canonicalVariantId)",
  "getCanonicalAvailability(canonicalVariantId)",
  "currentPriceMinor: product.priceMinor",
  "currentAvailable: availability?.available ?? false",
  "saveAlertPreference",
  "scope: customerScope(principal.userId)"
]) if (!service.includes(contract)) failures.push(`Saved-product alert service is missing contract: ${contract}`);

const ownershipIndex = service.indexOf("snapshot.savedProducts.some");
const catalogIndex = service.indexOf("getCanonicalProductSummary(canonicalVariantId)");
if (ownershipIndex < 0 || catalogIndex < 0 || ownershipIndex > catalogIndex) failures.push("Saved-product ownership must be verified before catalog/availability work.");
if (!service.includes("input.minimumPriceDropMinor > 100_000_000")) failures.push("Saved-product alert threshold must be bounded server-side.");

for (const contract of [
  "export async function PATCH",
  "requireAccountSession(request, true)",
  "configureCustomerSavedProductAlert(principal",
  "backInStockEnabled",
  "priceDropEnabled",
  "minimumPriceDropMinor",
  "customerBrowserSavedProductAlert(alert)"
]) if (!route.includes(contract)) failures.push(`Saved-product alert API is missing contract: ${contract}`);
if (!route.includes("saved: { canonicalVariantId: result.saved.canonicalVariantId }") || !route.includes("alert: customerBrowserSavedProductAlert(result.alert)")) failures.push("Saving a product should return a minimized saved-product identity and its alert baseline preference.");

for (const contract of [
  "const alert = state.savedProductAlerts.find",
  "customerBrowserSavedProductAlert(alert)",
  "type ProductAlert",
  "backInStockEnabled",
  "priceDropEnabled",
  "minimumPriceDropMinor",
  "updateProductAlert(product",
  "method: \"PATCH\"",
  "\"x-csrf-token\": csrfToken",
  "encodeURIComponent(product.canonicalVariantId)",
  "Ξανά διαθέσιμο",
  "Πτώση τιμής",
  "Ελάχιστη πτώση τιμής",
  "customer-price-drop-threshold",
  "disabled={Boolean(busy) || !alert.priceDropEnabled}",
  "setProducts((current) => current.map",
  "customer-saved-product-unavailable",
  "Κάθε αλλαγή ρύθμισης χρησιμοποιεί την τωρινή διαθεσιμότητα και τιμή ως νέο σημείο αναφοράς"
]) if (!(view + client).includes(contract)) failures.push(`Saved-product alert customer UI/projection is missing contract: ${contract}`);

for (const contract of [
  "Re-baseline when the customer changes alert settings",
  "lastObservedAvailable: input.currentAvailable",
  "lastObservedPriceMinor: input.currentPriceMinor",
  "minimumPriceDropMinor"
]) if (!core.includes(contract)) failures.push(`Core saved-product alert baseline contract is missing: ${contract}`);

for (const contract of [
  ".customer-product-alerts",
  ".customer-product-alert-option",
  ".customer-price-drop-threshold",
  ":focus-visible",
  "min-height:44px",
  "@media(max-width:700px)"
]) if (!css.includes(contract)) failures.push(`Saved-product alert responsive/accessibility styling is missing: ${contract}`);
if (!layout.includes('import "./customer-saved-product-alerts.css";')) failures.push("Saved-product alert stylesheet is not loaded by the app layout.");

if (failures.length) {
  console.error("Customer saved-product alert checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer saved-product alert checks passed: preferences are customer-scoped, CSRF-protected, re-baselined against current product state, and exposed through responsive self-service controls.");
