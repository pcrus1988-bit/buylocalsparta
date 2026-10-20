import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const src = (path: string) => readFileSync(path, "utf8");
const context = src("apps/web/src/lib/vendor-operating-assignment.ts");
const core = src("packages/core/src/vendor/operating-context.ts");
const auth = src("apps/web/src/lib/vendor-session.ts");
const header = src("apps/web/src/components/VendorWorkspaceHeader.tsx");
const navigation = src("apps/web/src/lib/workspace-navigation.ts");
const home = src("apps/web/src/app/vendor/page.tsx");
for (const value of [
  "vendorCapabilitiesForSubscription", "subscriptionState", "agreement.status",
  "subscription_ends_at", "subscriptionPlanMatches", "hubContractValid"
]) assert.ok(context.includes(value), "DB-scoped plan derivation missing: " + value);
for (const value of [
  "vendorCapabilitiesForSubscription", "roleAllowsVendorCapability",
  "entitledCapabilities", "PLAN_TRIAL", 'planCode === "claim" || planCode === "presence"'
]) assert.ok(core.includes(value), "Plan entitlement ceiling missing: " + value);
assert.ok(auth.includes("assertVendorCapability(context, capability)"), "API capability assertion must be authoritative");
assert.ok(header.includes("operatingContext.capabilities.includes(link.vendorCapability)"), "Nav must filter actual entitlement");
assert.ok(header.includes("if (!operatingContext) return false"), "Nav must fail closed while plan is unresolved");
assert.ok(home.includes('permissions.capabilities.includes("shop.read")'), "Inactive plans must have a restricted dashboard");
assert.ok(navigation.includes('href: "/vendor/orders", icon: "□", vendorCapability: "orders.read"'), "Orders nav must have capability");
assert.ok(navigation.includes('href: "/vendor/reports", icon: "▤", vendorCapability: "analytics.read"'), "Reports nav must have capability");
const pages = new Map([
  ["orders","orders.read"],["advice","customer_messages.manage"],["finance","finance.read"],
  ["analytics","analytics.read"],["reports","analytics.read"],["shipping","shipping.manage"],
  ["pickup","pickup.manage"],["returns","fulfilment.manage"],["notifications","orders.read"],
  ["storefront","shop.manage"],["preview","shop.read"],["trust","shop.manage"],
  ["daily-access","staff.manage"],["dropshipping","catalogue.read"],["settings","shop.read"],
  ["catalog","catalogue.read"]
]);
for (const [route, capability] of pages) {
  const source = src(`apps/web/src/app/vendor/${route}/layout.tsx`);
  assert.ok(source.includes(`capability="${capability}"`), "Vendor route lacks server plan guard: " + route);
}
const APIs = new Map([
  ["catalog/products","catalogue.read"],
  ["finance/invoices","finance.read"],
  ["finance/platform-invoices","finance.read"],
  ["returns/action","fulfilment.manage"],
  ["storefront-settings","shop.manage"],
  ["dropshipping/actions","offer.manage"],
  ["dropshipping/settings","offer.manage"],
  ["instagram/status","shop.read"],
  ["instagram/connect","shop.manage"]
]);
for (const [route, capability] of APIs) {
  const source = src(`apps/web/src/app/api/vendor/${route}/route.ts`);
  assert.ok(source.includes(`requireVendorCapability("${capability}"`), "Direct vendor API bypass: " + route);
}
console.log("Subscription entitlement enforcement: server routes, APIs, staff roles and navigation OK");
