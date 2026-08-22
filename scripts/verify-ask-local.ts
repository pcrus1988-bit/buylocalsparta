import { readFileSync } from "node:fs";
import { INDEXABLE_STATIC_ROUTES } from "../apps/web/src/lib/site-navigation.ts";
const read = (path: string) => readFileSync(`${process.cwd()}/${path}`, "utf8");
const service = read("apps/web/src/lib/ask-local-service.ts"),offerService = read("apps/web/src/lib/ask-local-offer-service.ts"),clarificationService = read("apps/web/src/lib/ask-local-clarification-service.ts"),route = read("apps/web/src/app/api/account/ask-local/route.ts"),offerRoute = read("apps/web/src/app/api/account/ask-local/offers/route.ts"),clarificationRoute = read("apps/web/src/app/api/account/ask-local/clarifications/route.ts"),dailyOfferRoute = read("apps/web/src/app/api/daily/advice/offers/route.ts"),dailyClarificationRoute = read("apps/web/src/app/api/daily/advice/clarifications/route.ts"),page = read("apps/web/src/app/ask-local/page.tsx"),client = read("apps/web/src/components/AskLocalClient.tsx"),clarificationClient = read("apps/web/src/components/AskLocalClarificationClient.tsx"),dailyClient = read("apps/web/src/components/VendorDailyAskLocalClient.tsx"),home = read("apps/web/src/app/page.tsx"),homeSearch = read("apps/web/src/components/HomeQuickSearch.tsx"),vendorOps = read("packages/postgres-runtime/src/vendor-operations.ts");
const failures: string[] = [];
for (const contract of ["requireAccountSession(request, true)", "submitAskLocal", "customerAskLocalBrowserRequests", "customerAskLocalBrowserRequest"]) if (!route.includes(contract)) failures.push(`Ask Local API is missing ${contract}`);
if (route.includes("customerAskLocalRequests(principal)")) failures.push("Ask Local API must not serialize unprojected private-offer identifiers");
for (const contract of ["publicAssignedCanonical", "reason: \"product_view\"", "counteroffer_allowed", "status='active'", "vo.status='approved'", "platformAccess: true", "isolation: \"serializable\"", "cr.customer_user_id", "counteroffer.requested", "ask-local-vendor:"]) if (!service.includes(contract)) failures.push(`Ask Local service is missing ${contract}`);
if (!service.includes("need.length < 10") || !service.includes("/^\\d{5}$/") || !service.includes("input.quantity > 99")) failures.push("Ask Local server validation is incomplete");
if (!/\[\s*["']http:["']\s*,\s*["']https:["']\s*\]\.includes\(parsed\.protocol\)/.test(service)) failures.push("Ask Local source links must be limited to HTTP(S)");
if (!client.includes('x-csrf-token') || !client.includes('role="alert"') || !client.includes("privateOffers")) failures.push("Ask Local client must preserve CSRF, errors and private-offer status");
if (!page.includes("getAccountSession()") || !page.includes("login?next=") || !page.includes("customerAskLocalBrowserRequests")) failures.push("Ask Local page must gate and restore projected authenticated customer state");
if (!vendorOps.includes("cr.assigned_vendor_id") || !vendorOps.includes("counteroffers:")) failures.push("Vendor workspace must consume only privately assigned Ask Local requests");

for (const contract of ["vendorCreateAskLocalOffer", "customerDecideAskLocalOffer", "FOR UPDATE OF po,cr", "status='offered'", "status='revoked'", "ask_local.offer_received", "ask_local.offer_accepted", "ask_local.offer_declined", "expires_at"]) if (!offerService.includes(contract)) failures.push(`Ask Local offer governance is missing ${contract}`);
if (!offerService.includes('if (status !== "awaiting_vendor")') || !offerService.includes('if (request.status !== "awaiting_vendor")')) failures.push("Vendor private offers must be blocked while customer clarification is pending in both PostgreSQL and preview memory");
if (offerService.includes('["awaiting_vendor", "needs_info"].includes')) failures.push("Vendor private offers must never bypass a pending customer clarification");
for (const contract of ["requireAccountSession(request, true)", "customerDecideAskLocalOffer", 'body.action === "accept"', 'body.action === "decline"']) if (!offerRoute.includes(contract)) failures.push(`Customer private-offer API is missing ${contract}`);
for (const contract of ["requireDailySession(request, true)", "vendorCreateAskLocalOffer", "vendorAdviceWorkspace"]) if (!dailyOfferRoute.includes(contract)) failures.push(`Daily private-offer API is missing ${contract}`);
for (const contract of ["/api/account/ask-local/offers", 'decideOffer(offer.id, "accept")', 'decideOffer(offer.id, "decline")', "Αποδέχομαι την προσφορά"]) if (!client.includes(contract)) failures.push(`Customer Ask Local offer UI is missing ${contract}`);
for (const contract of ["/api/daily/advice/offers", "sendOffer(request.id", "Τιμή ανά τεμάχιο (€)", "Ισχύς προσφοράς"]) if (!dailyClient.includes(contract)) failures.push(`Daily Ask Local offer UI is missing ${contract}`);
if (offerService.includes("UPDATE private_offers SET status='accepted' WHERE public_id=$1") && !offerService.includes("u.public_id=$2")) failures.push("Customer offer acceptance must be scoped to the owning customer");

for (const contract of [
  "vendorRequestAskLocalClarification",
  "customerReplyAskLocalClarification",
  "cr.workflow_owner_kind='vendor'",
  'String(row.status) !== "awaiting_vendor"',
  "source_metadata=$2::jsonb,status='needs_info',expires_at=NULL",
  'String(row.status) !== "needs_info"',
  'last.senderType !== "vendor"',
  "source_metadata=$2::jsonb,status='awaiting_vendor',expires_at=$3",
  "24 * 60 * 60 * 1000",
  "clarificationMessages",
  "metadataWithMessages",
  "u.public_id=$2",
  "thread.customerId !== principal.userId",
  "counteroffer.needs_info",
  "counteroffer.customer_replied"
]) if (!clarificationService.includes(contract)) failures.push(`Ask Local clarification governance is missing ${contract}`);
if (clarificationService.includes("c.context") || clarificationService.includes("INSERT INTO conversations")) failures.push("Ask Local clarification must not depend on a non-existent conversations.context schema bridge");
for (const contract of ["getAccountSession()", "requireAccountSession(request, true)", "askLocalClarificationMessages", "customerReplyAskLocalClarification", "customerAskLocalBrowserRequests"]) if (!clarificationRoute.includes(contract)) failures.push(`Customer clarification API is missing ${contract}`);
if (clarificationRoute.includes("customerAskLocalRequests(principal)")) failures.push("Customer clarification API must not re-serialize technical private-offer identifiers");
for (const contract of ["requireDailySession(request, true)", "vendorRequestAskLocalClarification", "vendorAdviceWorkspace"]) if (!dailyClarificationRoute.includes(contract)) failures.push(`Vendor clarification API is missing ${contract}`);
for (const contract of ["/api/account/ask-local/clarifications", "x-csrf-token", "requestId, reply", "νέα 24ωρη προθεσμία"]) if (!clarificationClient.includes(contract)) failures.push(`Customer clarification UI is missing ${contract}`);
if (!client.includes("AskLocalClarificationClient") || !client.includes('request.status === "needs_info"')) failures.push("Customer Ask Local cards must expose clarification reply only when customer action is required");
for (const contract of ["/api/daily/advice/clarifications", "askClarification(request.id", 'request.status === "needs_info"', 'request.status === "awaiting_vendor"', "Η προθεσμία απάντησης του καταστήματος έχει παγώσει"]) if (!dailyClient.includes(contract)) failures.push(`Vendor clarification UI is missing ${contract}`);

const dynamicHomepageAskLocal = home.includes("<HomeQuickSearch />") && homeSearch.includes("/api/search/suggest?q=") && homeSearch.includes("setState(payload.hasResults ? \"found\" : \"empty\")") && homeSearch.includes("/ask-local?need=") && homeSearch.includes("state === \"empty\"");
if (!dynamicHomepageAskLocal && !home.includes('action="/ask-local"')) failures.push("Homepage Ask Local must submit or route to the live workflow after a real zero-result search");
if (home.includes("Demo interface — δεν αποστέλλεται") || homeSearch.includes("Demo interface — δεν αποστέλλεται")) failures.push("Homepage Ask Local must not present a demo-only workflow");
if (!INDEXABLE_STATIC_ROUTES.some((entry) => entry.href === "/ask-local")) failures.push("Sitemap registry must contain Ask Local");
if (failures.length) { console.error("Ask Local checks failed:\n" + failures.map((failure) => `- ${failure}`).join("\n")); process.exit(1); }
console.log("Ask Local checks passed: auth/CSRF, validation, fair product routing, private vendor scope, request-scoped clarification lifecycle, clarification-gated offers, customer-owned offer decisions, notifications, live homepage and sitemap registry verified.");
