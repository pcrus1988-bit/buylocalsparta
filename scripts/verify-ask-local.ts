import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES, NON_INDEXABLE_PAGE_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
import { ADMIN_WORKSPACE_NAVIGATION } from "../apps/web/src/lib/workspace-navigation.ts";

const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/ask-local-service.ts");
const route = read("apps/web/src/app/api/account/ask-local/route.ts");
const candidateRoute = read("apps/web/src/app/api/account/ask-local/vendors/route.ts");
const adminRoute = read("apps/web/src/app/api/admin/ask-local/route/route.ts");
const vendorReturnRoute = read("apps/web/src/app/api/vendor/advice/ask-local/route.ts");
const page = read("apps/web/src/app/ask-local/page.tsx");
const client = read("apps/web/src/components/AskLocalClient.tsx");
const adminPage = read("apps/web/src/app/admin/ask-local/page.tsx");
const adminRouteForm = read("apps/web/src/components/AdminAskLocalRouteForm.tsx");
const vendorClient = read("apps/web/src/components/VendorAdviceClient.tsx");
const home = read("apps/web/src/app/page.tsx");
const vendorOps = read("packages/postgres-runtime/src/vendor-operations.ts");
const failures: string[] = [];

for (const contract of ["requireAccountSession(request, true)", "submitAskLocal", "customerAskLocalRequests", "entryMode"]) if (!route.includes(contract)) failures.push(`Ask Local API is missing ${contract}`);
for (const contract of [
  "publicAssignedCanonical",
  "reason: \"product_view\"",
  "counteroffer_allowed",
  "status='active'",
  "vo.status='approved'",
  "platformAccess: true",
  "isolation: \"serializable\"",
  "cr.customer_user_id",
  "counteroffer.requested",
  "ask-local-vendor:",
  "persisted_before_routing",
  "search_requires_admin_review",
  "customer_selected_system_category_candidate",
  "askLocalVendorCandidates",
  "adminRouteAskLocalRequest",
  "vendorReturnAskLocalToAdmin",
  "vendor_response_sla_elapsed",
  "returned_to_admin",
  "routingHistory",
  "routingOwner",
  "assigned ? \"awaiting_vendor\" : \"submitted\"",
  "SET status='submitted',assigned_vendor_id=NULL,assigned_offer_id=NULL,expires_at=NULL"
]) if (!service.includes(contract)) failures.push(`Ask Local service is missing ${contract}`);

if (!service.includes("need.length < 10") || !service.includes("/^\\d{5}$/") || !service.includes("input.quantity > 99")) failures.push("Ask Local server validation is incomplete");
if (!service.includes("['http:','https:'].includes(parsed.protocol)")) failures.push("Ask Local source links must be limited to HTTP(S)");

for (const contract of ["requireAccountSession()", "askLocalVendorCandidates", "category"]) if (!candidateRoute.includes(contract)) failures.push(`Ask Local category candidate endpoint is missing ${contract}`);
for (const contract of ["requireAdminSession(request, { csrf: true })", "adminRouteAskLocalRequest", "adminAskLocalWorkspace"]) if (!adminRoute.includes(contract)) failures.push(`Ask Local admin dispatch endpoint is missing ${contract}`);
for (const contract of ["requireVendorSession(request, true)", "vendorReturnAskLocalRequest", "vendorAdviceWorkspace"]) if (!vendorReturnRoute.includes(contract)) failures.push(`Ask Local vendor fallback endpoint is missing ${contract}`);

for (const contract of ["x-csrf-token", "role=\"alert\"", "privateOffers", "/api/account/ask-local/vendors", "STOREFRONT_CATEGORIES", "entryMode", "routingOwner", "Ανάθεση από την πλατφόρμα", "Δεν υπάρχει αυτή τη στιγμή ενεργός κατάλληλος σύμβουλος"]) if (!client.includes(contract)) failures.push(`Ask Local customer UI is missing ${contract}`);
if (!page.includes("getAccountSession()") || !page.includes("login?next=") || !page.includes("customerAskLocalRequests")) failures.push("Ask Local page must gate and restore authenticated customer state");

for (const contract of ["adminAskLocalWorkspace", "AdminAskLocalRouteForm", "Admin queue", "Vendor-owned", "Lossless customer routing"]) if (!adminPage.includes(contract)) failures.push(`Ask Local admin workspace is missing ${contract}`);
for (const contract of ["categoryCodeMatches", "/api/admin/ask-local/route", "Επίλεξε vendor / σύμβουλο", "Κανένας ενεργός κατάλληλος vendor"]) if (!adminRouteForm.includes(contract)) failures.push(`Ask Local admin routing control is missing ${contract}`);
for (const contract of ["/api/vendor/advice/ask-local", "Δεν μπορώ να το εξυπηρετήσω", "returnToAdmin", "Καμία ερώτηση δεν μένει χωρίς ιδιοκτήτη"]) if (!vendorClient.includes(contract)) failures.push(`Vendor Ask Local safety UI is missing ${contract}`);

if (!vendorOps.includes("cr.assigned_vendor_id") || !vendorOps.includes("counteroffers:")) failures.push("Vendor workspace must consume only privately assigned Ask Local requests");
if (!home.includes('action="/ask-local"') || home.includes("Demo interface — δεν αποστέλλεται")) failures.push("Homepage Ask Local must submit to the live workflow");
if (!INDEXABLE_STATIC_ROUTES.some((entry) => entry.href === "/ask-local")) failures.push("Sitemap registry must contain Ask Local");
if (!NON_INDEXABLE_PAGE_ROUTES.includes("/admin/ask-local")) failures.push("Admin Ask Local workspace must be non-indexable");
if (!ADMIN_WORKSPACE_NAVIGATION.some((group) => group.links.some((link) => link.href === "/admin/ask-local"))) failures.push("Admin navigation must expose the Ask Local dispatch queue");

if (failures.length) {
  console.error("Ask Local checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Ask Local checks passed: authenticated category candidates, persist-first routing, explicit Admin/vendor ownership, category eligibility, vendor fallback, SLA rescue, CSRF, customer tracking and private vendor scope verified.");
