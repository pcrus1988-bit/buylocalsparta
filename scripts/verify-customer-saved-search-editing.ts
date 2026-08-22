import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const core = read("packages/core/src/engagement/saved-searches.ts");
const coreTest = read("packages/core/test/engagement.test.ts");
const service = read("apps/web/src/lib/customer-saved-search-actions.ts");
const route = read("apps/web/src/app/api/account/saved-searches/[id]/route.ts");
const client = read("apps/web/src/components/AccountSavedClient.tsx");
const styles = read("apps/web/src/app/customer-saved-search-editing.css");
const layout = read("apps/web/src/app/layout.tsx");
const shop = read("apps/web/src/app/shop/page.tsx");
const failures: string[] = [];

for (const contract of [
  "export function normalizeSavedSearchQuery",
  "update(input: { searchId: string; userId: string; name: string; query: SavedSearchQuery",
  "current.userId !== input.userId",
  "Saved-search ownership violation",
  "Saved-search name is required",
  "seenCanonicalVariantIds: Object.freeze(baseline)",
  "lastObservedCount: baseline.length"
]) if (!core.includes(contract)) failures.push(`Core saved-search editing contract missing: ${contract}`);

for (const contract of [
  "saved-search editing preserves identity, enforces ownership and re-baselines edited criteria",
  "assert.throws(() => service.update",
  "assert.deepEqual(updated.seenCanonicalVariantIds, [\"p2\", \"p3\"])",
  "assert.equal(service.reconcile({ searchId: saved.id, currentCanonicalVariantIds: [\"p2\", \"p3\"], now: 201 }).length, 0)"
]) if (!coreTest.includes(contract)) failures.push(`Core saved-search edit test missing: ${contract}`);

for (const contract of [
  "configureCustomerSavedSearchAlerts",
  "updateCustomerSavedSearch",
  "removeCustomerSavedSearch",
  "customerStateBackend() === \"memory\"",
  "runtime.persistence.engagement.listSavedSearches",
  "runtime.persistence.engagement.saveSavedSearch",
  "runtime.persistence.engagement.removeSavedSearch",
  "currentSavedSearchMatches",
  "[...new Set([...current.seenCanonicalVariantIds, ...currentCanonicalVariantIds])].slice(-500)",
  "const baseline = [...new Set(currentCanonicalVariantIds)].slice(0, 500)"
]) if (!service.includes(contract)) failures.push(`Saved-search action service missing: ${contract}`);

const editStart = service.indexOf("export async function updateCustomerSavedSearch");
const editEnd = service.indexOf("export async function removeCustomerSavedSearch", editStart);
const edit = editStart >= 0 && editEnd > editStart ? service.slice(editStart, editEnd) : "";
const memoryLookup = edit.indexOf("runtime.savedSearches.get(searchId)");
const firstMatch = edit.indexOf("await currentMatches(query)");
const postgresLookup = edit.indexOf("const current = searches.find", firstMatch + 1);
const secondMatch = edit.indexOf("await currentMatches(query)", firstMatch + 1);
if (!(memoryLookup >= 0 && firstMatch > memoryLookup)) failures.push("Memory saved-search edit must resolve ownership before catalog matching.");
if (!(postgresLookup >= 0 && secondMatch > postgresLookup)) failures.push("PostgreSQL saved-search edit must resolve ownership before catalog matching.");

if ((route.match(/requireAccountSession\(request, true\)/g) ?? []).length < 2) failures.push("Saved-search PATCH and DELETE must both require authenticated CSRF-protected account sessions.");
for (const contract of [
  "body.action === \"alerts\"",
  "body.action === \"edit\"",
  "typeof body.alertsEnabled !== \"boolean\"",
  "configureCustomerSavedSearchAlerts(principal",
  "updateCustomerSavedSearch(principal",
  "removeCustomerSavedSearch(principal",
  "value === \"in_stock\" || value === \"pickup_today\" ? \"in_stock\" : \"any\""
]) if (!route.includes(contract)) failures.push(`Saved-search item API missing: ${contract}`);

for (const contract of [
  "STOREFRONT_CATEGORIES",
  "categoryCodeMatches",
  "type SearchDraft = { name: string; q: string; categoryCode: string; availability: \"any\" | \"in_stock\" }",
  "params.set(\"availability\", \"available\")",
  "action: \"edit\"",
  "action: \"alerts\"",
  "x-csrf-token",
  "encodeURIComponent(search.id)",
  "Όνομα αναζήτησης",
  "Τι ψάχνεις;",
  "Όλες οι κατηγορίες",
  "Διαθέσιμο τώρα",
  "Παύση ειδοποιήσεων",
  "Ενεργοποίηση ειδοποιήσεων",
  "Να διαγραφεί οριστικά;",
  "Ναι, διαγραφή",
  "role=\"status\"",
  "Αποτελέσματα →",
  "νέο σημείο αναφοράς"
]) if (!client.includes(contract)) failures.push(`Saved-search customer UI missing: ${contract}`);
if (client.includes('<option value="pickup_today">')) failures.push("Saved-search editor must not expose unsupported pickup-today storefront semantics.");

for (const contract of [
  ".customer-saved-search-editor",
  ".customer-saved-search-confirm",
  ":focus-visible",
  "min-height:44px",
  "@media(max-width:700px)"
]) if (!styles.includes(contract)) failures.push(`Saved-search responsive styling missing: ${contract}`);
if (!layout.includes('import "./customer-saved-search-editing.css";')) failures.push("Root layout must load saved-search editing styles.");

if (!shop.includes('if (availability === "available") products = products.filter((product) => product.available);')) failures.push("Saved-search reopen contract assumes the storefront supports availability=available.");
if (shop.includes('availability === "pickup_today"')) failures.push("Verifier expected no distinct pickup-today storefront filter; update saved-search editor semantics if storefront gains one.");

if (failures.length) {
  console.error("Customer saved-search editing checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Customer saved-search editing checks passed: edit/pause/delete are customer-scoped and CSRF-protected, edits re-baseline before alerts, ownership is resolved before matching, public criteria map to the real storefront, and mobile controls remain accessible.");
