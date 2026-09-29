import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const errors: string[] = [];

const operating = read("packages/core/src/vendor/operating-context.ts");
const page = read("apps/web/src/app/vendor/hub/page.tsx");
const client = read("apps/web/src/components/VendorHubControlsClient.tsx");
const service = read("apps/web/src/lib/vendor-hub-controls-service.ts");
const navigation = read("apps/web/src/lib/workspace-navigation.ts");
const nextConfig = read("apps/web/next.config.ts");
const migration = read("db/migrations/0291_self_governed_hub_vendor_controls.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0291.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");

const routes = {
  localDelivery: read("apps/web/src/app/api/vendor/hub/local-delivery/route.ts"),
  seo: read("apps/web/src/app/api/vendor/hub/seo/route.ts"),
  promotions: read("apps/web/src/app/api/vendor/hub/promotions/route.ts"),
  aade: read("apps/web/src/app/api/vendor/hub/aade/route.ts"),
  subscription: read("apps/web/src/app/api/vendor/hub/subscription/route.ts")
};

function requireText(source: string, needle: string, message: string) {
  if (!source.includes(needle)) errors.push(message);
}
function forbidText(source: string, needle: string, message: string) {
  if (source.includes(needle)) errors.push(message);
}

requireText(operating, '"local_delivery.manage"', "SELF_GOVERNED capability set must include local delivery management");
requireText(operating, '"aade.manage"', "SELF_GOVERNED capability set must include AADE management");
requireText(operating, '"promotions.manage"', "SELF_GOVERNED capability set must include promotion management");
requireText(operating, '"seo.source_data.manage"', "SELF_GOVERNED capability set must include SEO source management");
requireText(operating, '"subscription.manage"', "SELF_GOVERNED capability set must include subscription management");

requireText(page, 'context.operatingModel !== "SELF_GOVERNED"', "HUB Control Centre must reject MANAGED vendors");
requireText(page, 'redirect("/vendor")', "MANAGED vendors must be redirected away from HUB Control Centre");
requireText(navigation, 'vendorCapability: "local_delivery.manage"', "HUB navigation must be capability-gated");
requireText(nextConfig, '"/vendor/hub/:path*"', "HUB private routes must be centrally noindex/no-store");

requireText(routes.localDelivery, 'requireVendorCapability("local_delivery.manage"', "Local delivery API must require local_delivery.manage");
requireText(routes.seo, 'requireVendorCapability("seo.source_data.manage"', "SEO API must require seo.source_data.manage");
requireText(routes.promotions, 'requireVendorCapability("promotions.manage"', "Promotion API must require promotions.manage");
requireText(routes.aade, 'requireVendorCapability("aade.manage"', "AADE API must require aade.manage");
requireText(routes.subscription, 'requireVendorCapability("subscription.manage"', "Subscription API must require subscription.manage");

requireText(service, 'context.operatingModel !== "SELF_GOVERNED"', "Service writes must independently enforce SELF_GOVERNED");
requireText(service, "fulfilment_service_zones", "Local delivery must persist through vendor-owned fulfilment zones");
requireText(service, "vendor_profile_translations", "SEO source data must persist only in vendor profile translations");
requireText(service, "vendor_promotion_requests", "Promotion actions must use approval requests");
requireText(service, "vendor_aade_action_requests", "AADE actions must use approval requests");
requireText(service, "vendor_subscription_change_requests", "Subscription changes must use approval requests");
forbidText(service, "INSERT INTO product_promotions", "Vendor HUB controls must not directly create public promotions");
forbidText(service, "UPDATE tax_documents", "Vendor HUB controls must not directly mutate tax documents");
forbidText(service, "INSERT INTO vendor_subscriptions", "Vendor HUB controls must not directly activate subscriptions");

requireText(client, "Η τελική δημόσια promotional price ενεργοποιείται μόνο", "Promotion UI must explain platform approval boundary");
requireText(client, "Retry/reconcile δεν εκτελείται τυφλά", "AADE UI must explain safe request boundary");
requireText(client, "αλλαγές που επηρεάζουν εμπορική συμφωνία", "Subscription UI must explain commercial approval boundary");

for (const table of ["vendor_promotion_requests","vendor_aade_action_requests","vendor_subscription_change_requests"]) {
  requireText(migration, `CREATE TABLE public.${table}`, `Migration 0291 must create ${table}`);
  requireText(migration, `ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`, `${table} must have RLS enabled`);
}
requireText(migration, "vendor_id=nullif(current_setting('app.vendor_id',true),'')::uuid", "Vendor request RLS must bind app.vendor_id");
requireText(migration, "market_id=nullif(current_setting('app.market_id',true),'')::uuid", "Vendor request RLS must bind app.market_id");
requireText(migration, "validate_vendor_promotion_request_scope", "Promotion request must validate offer ownership");
requireText(migration, "validate_vendor_aade_request_scope", "AADE request must validate document ownership");
requireText(migration, "validate_vendor_subscription_request_scope", "Subscription request must validate plan/subscription ownership");

const runtimeSchemaVersion = Number(postgresRuntime.match(/export const EXPECTED_SCHEMA_VERSION = (\d+);/)?.[1] ?? 0);
if (runtimeSchemaVersion !== 291) errors.push(`PostgreSQL runtime schema head must be 291; found ${runtimeSchemaVersion || "none"}`);

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0291_self_governed_hub_vendor_controls.sql"] !== migrationHash) {
  errors.push(`Migration 0291 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0291_self_governed_hub_vendor_controls.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("SELF_GOVERNED HUB controls acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("SELF_GOVERNED HUB controls acceptance OK: vendor-owned controls are scoped, capability-gated and platform-governed writes remain approval-based.");
