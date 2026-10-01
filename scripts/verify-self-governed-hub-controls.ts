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
const settingsPage = read("apps/web/src/app/vendor/settings/page.tsx");
const settingsHelper = read("apps/web/src/components/VendorSettingsHubSectionPage.tsx");
const settingsRoutes = [
  read("apps/web/src/app/vendor/settings/delivery/page.tsx"),
  read("apps/web/src/app/vendor/settings/aade/page.tsx"),
  read("apps/web/src/app/vendor/settings/promotions/page.tsx"),
  read("apps/web/src/app/vendor/settings/seo/page.tsx"),
  read("apps/web/src/app/vendor/settings/subscription/page.tsx")
].join("\n");
const migration = read("db/migrations/0291_self_governed_hub_vendor_controls.sql");
const hardeningMigration = read("db/migrations/0292_self_governed_hub_vendor_controls_advisor_hardening.sql");
const scopeMigration = read("db/migrations/0293_self_governed_hub_scope_helpers.sql");
const checksum = JSON.parse(read("db/migrations/checksums.0291.json")) as Record<string, string>;
const hardeningChecksum = JSON.parse(read("db/migrations/checksums.0292.json")) as Record<string, string>;
const scopeChecksum = JSON.parse(read("db/migrations/checksums.0293.json")) as Record<string, string>;
const postgresRuntime = read("packages/postgres-runtime/src/index.ts");
const sqlScope = read("packages/core/src/persistence/sql.ts");
const vendorAuth = read("packages/postgres-runtime/src/vendor-auth.ts");
const vendorRuntime = read("apps/web/src/lib/vendor-runtime.ts");
const boxNowShipping = read("packages/postgres-runtime/src/boxnow-shipping.ts");
const localDeliveryContact = vendorRuntime.slice(
  vendorRuntime.indexOf("export async function vendorLocalDeliveryContact"),
  vendorRuntime.indexOf("export async function updateVendorStock")
);

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
requireText(nextConfig, '"/vendor/settings/:path*"', "Vendor settings routes must be centrally noindex/no-store");
requireText(settingsHelper, "context.capabilities.includes(capability)", "Focused HUB settings must remain capability-gated");
requireText(settingsHelper, "vendorHubControlsWorkspace(principal)", "Focused HUB settings must reuse the governed HUB workspace");
for (const capability of ["local_delivery.manage", "aade.manage", "promotions.manage", "seo.source_data.manage", "subscription.manage"]) requireText(settingsRoutes, `capability="${capability}"`, `Focused settings route missing ${capability}`);
requireText(settingsPage, "Ρυθμίσεις που διαχειρίζεσαι εσύ", "Settings centre must explain vendor-owned HUB controls");

requireText(sqlScope, "Vendor-facing transactions inherit the authoritative market assigned to the vendor", "PostgresUnitOfWork must derive vendor market scope when callers omit marketId");
requireText(sqlScope, "SELECT market_id::text", "Vendor market derivation must read vendor_businesses.market_id");
requireText(sqlScope, "current_setting('app.vendor_id', true)", "Vendor market derivation must bind to the already-resolved vendor scope");
forbidText(vendorAuth, "DEFAULT_MANAGED_MARKET_ID", "Generic vendor scope must not silently default to Sparta");
requireText(vendorAuth, "return { actorUserId: userId, vendorId, requestId };", "Generic vendor scope must defer market resolution to the persisted vendor assignment");
forbidText(localDeliveryContact, 'marketId: "sparta"', "Local-delivery contact access must not force the Sparta market");
forbidText(boxNowShipping, 'marketId:"sparta"', "BOX NOW shipping must not force compact Sparta transaction scopes");
forbidText(boxNowShipping, 'marketId: "sparta"', "BOX NOW shipping must not force Sparta transaction scopes");
requireText(boxNowShipping, "async #confirm(vendorPublicId:string", "BOX NOW confirmation must retain the initiating vendor scope");
requireText(boxNowShipping, "{vendorId:vendorPublicId,platformAccess:true}", "BOX NOW provider confirmation/recovery must derive market from the initiating vendor");

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

requireText(client, "Η τελική δημόσια προωθητική τιμή ενεργοποιείται μόνο", "Promotion UI must explain platform approval boundary");
requireText(client, "Επανάληψη ή συμφωνία δεν εκτελείται αυτόματα", "AADE UI must explain safe request boundary");
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
if (runtimeSchemaVersion < 293) errors.push(`PostgreSQL runtime schema head must include migration 0293; found ${runtimeSchemaVersion || "none"}`);

const migrationHash = createHash("sha256").update(migration).digest("hex");
if (checksum["0291_self_governed_hub_vendor_controls.sql"] !== migrationHash) {
  errors.push(`Migration 0291 checksum mismatch: expected ${migrationHash}, manifest has ${checksum["0291_self_governed_hub_vendor_controls.sql"] ?? "missing"}`);
}

requireText(hardeningMigration, "TO bls_platform_runtime", "Migration 0292 must scope platform policies to bls_platform_runtime");
requireText(hardeningMigration, "(SELECT nullif(current_setting('app.vendor_id',true),'')::uuid)", "Migration 0292 must use initplan-safe vendor RLS settings");
requireText(hardeningMigration, "vendor_promotion_requests_market_idx", "Migration 0292 must index promotion market FK");
requireText(hardeningMigration, "vendor_aade_action_requests_market_idx", "Migration 0292 must index AADE request market FK");
requireText(hardeningMigration, "vendor_subscription_change_requests_requested_plan_idx", "Migration 0292 must index subscription plan FK");

const hardeningHash = createHash("sha256").update(hardeningMigration).digest("hex");
if (hardeningChecksum["0292_self_governed_hub_vendor_controls_advisor_hardening.sql"] !== hardeningHash) {
  errors.push(`Migration 0292 checksum mismatch: expected ${hardeningHash}, manifest has ${hardeningChecksum["0292_self_governed_hub_vendor_controls_advisor_hardening.sql"] ?? "missing"}`);
}

requireText(scopeMigration, "bls_private.current_vendor_scope_id()", "Migration 0293 must expose a stable private vendor scope helper");
requireText(scopeMigration, "bls_private.current_market_scope_id()", "Migration 0293 must expose a stable private market scope helper");
requireText(scopeMigration, "SET search_path = pg_catalog", "Migration 0293 scope helpers must pin search_path");
requireText(scopeMigration, "REVOKE ALL ON FUNCTION bls_private.current_vendor_scope_id() FROM PUBLIC", "Migration 0293 vendor scope helper must not be public");
requireText(scopeMigration, "vendor_id=(SELECT bls_private.current_vendor_scope_id())", "Migration 0293 vendor policies must use the stable scope helper");

const scopeHash = createHash("sha256").update(scopeMigration).digest("hex");
if (scopeChecksum["0293_self_governed_hub_scope_helpers.sql"] !== scopeHash) {
  errors.push(`Migration 0293 checksum mismatch: expected ${scopeHash}, manifest has ${scopeChecksum["0293_self_governed_hub_scope_helpers.sql"] ?? "missing"}`);
}

if (errors.length) {
  console.error("SELF_GOVERNED HUB controls acceptance failed:\n- " + errors.join("\n- "));
  process.exit(1);
}
console.log("SELF_GOVERNED HUB controls acceptance OK: vendor-owned controls are capability-gated, market-scoped and platform-governed writes remain approval-based.");
