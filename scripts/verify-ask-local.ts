import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/ask-local-service.ts"),route = read("apps/web/src/app/api/account/ask-local/route.ts"),page = read("apps/web/src/app/ask-local/page.tsx"),client = read("apps/web/src/components/AskLocalClient.tsx"),home = read("apps/web/src/app/page.tsx"),vendorOps = read("packages/postgres-runtime/src/vendor-operations.ts");
const failures: string[] = [];
for (const contract of ["requireAccountSession(request, true)", "submitAskLocal", "customerAskLocalRequests"]) if (!route.includes(contract)) failures.push(`Ask Local API is missing ${contract}`);
for (const contract of ["publicAssignedCanonical", "reason: \"product_view\"", "counteroffer_allowed", "status='active'", "vo.status='approved'", "platformAccess: true", "isolation: \"serializable\"", "cr.customer_user_id", "counteroffer.requested", "ask-local-vendor:"]) if (!service.includes(contract)) failures.push(`Ask Local service is missing ${contract}`);
if (!service.includes("need.length < 10") || !service.includes("/^\\d{5}$/") || !service.includes("input.quantity > 99")) failures.push("Ask Local server validation is incomplete");
if (!service.includes("['http:','https:'].includes(parsed.protocol)")) failures.push("Ask Local source links must be limited to HTTP(S)");
if (!client.includes('x-csrf-token') || !client.includes('role="alert"') || !client.includes("privateOffers")) failures.push("Ask Local client must preserve CSRF, errors and private-offer status");
if (!page.includes("getAccountSession()") || !page.includes("login?next=") || !page.includes("customerAskLocalRequests")) failures.push("Ask Local page must gate and restore authenticated customer state");
if (!vendorOps.includes("cr.assigned_vendor_id") || !vendorOps.includes("counteroffers:")) failures.push("Vendor workspace must consume only privately assigned Ask Local requests");
if (!home.includes('action="/ask-local"') || home.includes("Demo interface — δεν αποστέλλεται")) failures.push("Homepage Ask Local must submit to the live workflow");
if (!INDEXABLE_STATIC_ROUTES.some((entry) => entry.href === "/ask-local")) failures.push("Sitemap registry must contain Ask Local");
if (failures.length) { console.error("Ask Local checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log("Ask Local checks passed: auth/CSRF, validation, fair product routing, private vendor scope, customer ownership, live homepage and sitemap registry verified.");
