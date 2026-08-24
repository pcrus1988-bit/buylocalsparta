import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const migration = read("db/migrations/0143_smart_cart_recovery.sql");
const service = read("packages/postgres-runtime/src/cart-recovery.ts");
const runtime = read("packages/postgres-runtime/src/index.ts");
const worker = read("workers/notification-worker.ts");
const preference = read("apps/web/src/lib/customer-cart-recovery-preference.ts");
const route = read("apps/web/src/app/api/account/cart-recovery-preference/route.ts");
const page = read("apps/web/src/app/account/notifications/page.tsx");
const failures: string[] = [];

for (const contract of [
  "CREATE TABLE cart_recovery_attempts",
  "UNIQUE(cart_id, cart_updated_at)",
  "notification_id uuid NOT NULL UNIQUE REFERENCES notifications(id) DEFERRABLE INITIALLY DEFERRED",
  "append-only",
  "cart_recovery_attempts_platform_insert",
  "app.privacy_erasure"
]) if (!migration.includes(contract)) failures.push(`Migration is missing: ${contract}`);

for (const contract of [
  "c.updated_at <= $1",
  "u.email_verified_at IS NOT NULL",
  "np.event_type='cart_recovery'",
  "COALESCE(",
  "cart_recovery_attempts cra",
  "cra.created_at > $2",
  "customer_orders o",
  "FOR UPDATE SKIP LOCKED",
  "ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $3",
  "purpose,event_type",
  "'marketing','cart_recovery'",
  "ON CONFLICT (cart_id,cart_updated_at) DO NOTHING",
  "https://kontamou.site/cart"
]) if (!service.includes(contract)) failures.push(`Recovery scanner is missing: ${contract}`);

for (const contract of [
  "EXPECTED_SCHEMA_VERSION = 143",
  "PostgresCartRecoveryService",
  "readonly cartRecovery",
  "this.cartRecovery = new PostgresCartRecoveryService",
  "export * from \"./cart-recovery.ts\""
]) if (!runtime.includes(contract)) failures.push(`Runtime is missing: ${contract}`);

for (const contract of [
  "BLS_CART_RECOVERY_ENABLED",
  "BLS_CART_RECOVERY_IDLE_MINUTES",
  "BLS_CART_RECOVERY_COOLDOWN_HOURS",
  "runtime.cartRecovery.runOnce",
  "runtime.notifications.runOnce"
]) if (!worker.includes(contract)) failures.push(`Notification worker is missing: ${contract}`);

for (const contract of [
  "event_type='cart_recovery'",
  "setCustomerCartRecoveryPreference",
  "requireAccountSession(request, true)",
  "CartRecoveryPreferenceToggle"
]) if (!(preference + route + page).includes(contract)) failures.push(`Customer opt-in is missing: ${contract}`);

if (failures.length) {
  console.error("Smart cart recovery checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Smart cart recovery checks passed: explicit opt-in, idle threshold, live-stock verification, cooldown, dedupe and append-only audit are present.");
