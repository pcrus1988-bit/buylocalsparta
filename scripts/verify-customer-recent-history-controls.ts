import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/customer-recent-history.ts");
const route = read("apps/web/src/app/api/account/recently-viewed/route.ts");
const client = read("apps/web/src/components/AccountDashboardClient.tsx");
const corePrivacy = read("packages/core/src/privacy/service.ts");
const postgresPrivacy = read("packages/core/src/persistence/postgres-privacy.ts");
const css = read("apps/web/src/app/customer-recent-history-controls.css");
const layout = read("apps/web/src/app/layout.tsx");
const failures: string[] = [];

for (const contract of [
  "export async function clearCustomerRecentlyViewed",
  "principal.roles.includes(\"customer\")",
  "getAccountRuntime().personalization.clearRecentlyViewed(principal.userId)",
  "new PostgresUnitOfWork(runtime.sqlPool",
  "customerScope(principal.userId)",
  "SELECT id::text AS id FROM users WHERE public_id=$1",
  "DELETE FROM recently_viewed_products WHERE user_id=$1"
]) if (!service.includes(contract)) failures.push(`Recent-history clear service is missing contract: ${contract}`);

for (const forbidden of ["savePreferences", "recently_viewed_enabled", "recommendations_enabled", "UPDATE customer_profiles"]) {
  if (service.includes(forbidden)) failures.push(`Recent-history clear service must not mutate personalization preferences: ${forbidden}`);
}

for (const contract of [
  "export async function DELETE(request: Request)",
  "requireAccountSession(request, true)",
  "clearCustomerRecentlyViewed(principal)",
  "return Response.json({ removed })"
]) if (!route.includes(contract)) failures.push(`Recent-history API is missing contract: ${contract}`);

for (const contract of [
  "clearRecentHistory",
  'fetch("/api/account/recently-viewed", { method: "DELETE"',
  '"x-csrf-token": data.csrfToken',
  "setData((current) => ({ ...current, recentlyViewed: [] }))",
  "setConfirmHistoryClear(false)",
  "Καθαρισμός ιστορικού",
  "Ναι, καθαρισμός",
  "Η μελλοντική καταγραφή παραμένει ενεργή",
  "Καθαρισμός ή απενεργοποίηση;",
  "δεν αλλάζει την επιλογή σου για μελλοντική καταγραφή",
  "recentlyViewedEnabled"
]) if (!client.includes(contract)) failures.push(`Recent-history customer UI is missing contract: ${contract}`);

if (!corePrivacy.includes("clearRecentlyViewed(userId: string): number")) failures.push("Preview personalization service must retain independent recent-history clearing.");
if (!postgresPrivacy.includes('if (!input.preferences.recentlyViewedEnabled) await tx.query("DELETE FROM recently_viewed_products WHERE user_id=$1"')) failures.push("Existing opt-out behavior must continue clearing history when collection is disabled.");

for (const contract of [
  ".customer-history-head-actions",
  ".customer-history-confirm",
  ".customer-history-status",
  ":focus-visible",
  "min-height:44px",
  "@media(max-width:700px)"
]) if (!css.includes(contract)) failures.push(`Recent-history responsive/accessibility styling is missing: ${contract}`);
if (!layout.includes('import "./customer-recent-history-controls.css";')) failures.push("Recent-history stylesheet is not loaded by the root layout.");

if (failures.length) {
  console.error("Customer recent-history checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer recent-history checks passed: customers can clear stored views independently of future collection consent, with customer-scoped persistence, CSRF protection, confirmation, and responsive controls.");
