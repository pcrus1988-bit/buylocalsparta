import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { URL } from "node:url";
import {
  assertVendorScope,
  articleStructuredData,
  can,
  contentSitemap,
  formatMoney,
  money,
  multiplyMoney,
  productStructuredData,
  seoForPage,
  offerStockIsFresh,
  previewVendorProductCsv,
  splitGrossTax,
  RateLimitError,
  defaultCustomerRetentionSnapshot,
  type FeeBasis,
  type FeeCalculation,
  type FeeRuleSource,
  type Permission,
  type SessionPrincipal
} from "../packages/core/src/index.ts";
import { createDemoRuntime, demoProductDetails, demoVendors } from "./runtime.ts";
import { adminPage, customerPage, joinPage, publicSeoPage, vendorPage } from "./ui.ts";
import { BUILD_VERSION } from "./build.ts";

const runtime = createDemoRuntime();
const PORT = Number(process.env.PORT ?? 3000);
const MARKET_ID = "sparta";
const SESSION_COOKIE = "bls_session";
const VISITOR_COOKIE = "bls_visitor";
const PUBLIC_ORIGIN = process.env.PUBLIC_ORIGIN?.replace(/\/$/, "") || `http://localhost:${PORT}`;
const BUILD = BUILD_VERSION;
const SECURE_COOKIES = PUBLIC_ORIGIN.startsWith("https://");
const TRUST_PROXY = process.env.TRUST_PROXY === "true";
const RATE_LIMITS = {
  loginIp: { limit: 10, windowMs: 60_000 },
  loginIdentity: { limit: 6, windowMs: 60_000 },
  register: { limit: 5, windowMs: 10 * 60_000 },
  verify: { limit: 20, windowMs: 10 * 60_000 },
  advice: { limit: 60, windowMs: 60_000 },
  askLocal: { limit: 12, windowMs: 60 * 60_000 },
  reviews: { limit: 8, windowMs: 60 * 60_000 },
  returns: { limit: 10, windowMs: 60 * 60_000 },
  privacy: { limit: 6, windowMs: 60 * 60_000 }
} as const;

const server = createServer(async (req, res) => {
  const requestId = randomBytes(12).toString("base64url");
  applySecurityHeaders(res, requestId);
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `localhost:${PORT}`}`);

    // Public/system
    if (req.method === "GET" && url.pathname === "/api/health/live") return json(res, 200, { ...runtime.health.liveness(), service: "buy-local-sparta-core", build: BUILD });
    if (req.method === "GET" && url.pathname === "/api/health/ready") { const report = await runtime.health.readiness(); return json(res, report.ok ? 200 : 503, { ...report, service: "buy-local-sparta-core", build: BUILD }); }
    if (req.method === "GET" && url.pathname === "/api/health") { const report = await runtime.health.readiness(); return json(res, report.ok ? 200 : 503, { ...report, service: "buy-local-sparta-core", build: BUILD }); }
    if (req.method === "GET" && url.pathname === "/api/catalog") return catalog(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/search/autocomplete") return autocomplete(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/analytics/search-click") return await searchAnalyticsClick(req, res);
    if (req.method === "GET" && /^\/api\/products\/[^/]+$/.test(url.pathname)) return product(req, res, url.pathname.split("/")[3], url);
    if (req.method === "GET" && /^\/api\/products\/[^/]+\/advice-windows$/.test(url.pathname)) return productAdviceWindows(req, res, url.pathname.split("/")[3], url);
    if (req.method === "GET" && url.pathname === "/api/vendors") return json(res, 200, { vendors: publicVendors(), demoData: true });
    if (req.method === "GET" && url.pathname === "/api/plans") return publicPlans(res);
    if (req.method === "GET" && url.pathname === "/api/promotions") return publicPromotions(res);
    if (req.method === "GET" && /^\/api\/vendors\/[^/]+$/.test(url.pathname)) return vendorProfile(res, url.pathname.split("/")[3]);
    if (req.method === "GET" && /^\/api\/vendors\/[^/]+\/availability$/.test(url.pathname)) return vendorAvailability(res, url.pathname.split("/")[3], url);
    if (req.method === "GET" && url.pathname === "/api/reviews") return publicReviews(res, url);
    if (req.method === "GET" && url.pathname === "/api/delivery/quote") return deliveryQuote(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/content/home") return publicCmsPage(res, url, "");
    if (req.method === "GET" && url.pathname === "/api/content/page") return publicCmsPage(res, url, url.searchParams.get("slug") ?? "");
    if (req.method === "GET" && url.pathname === "/api/content/navigation") return publicNavigation(res, url);
    if (req.method === "GET" && url.pathname === "/api/content/stories") return publicStories(res, url);
    if (req.method === "GET" && url.pathname === "/api/content/collections") return publicCollections(res, url);
    if (req.method === "GET" && url.pathname === "/api/content/redirect") return publicRedirect(res, url);
    if (req.method === "GET" && url.pathname === "/sitemap.xml") return sitemapXml(res);
    if (req.method === "GET" && url.pathname === "/robots.txt") return robotsTxt(res);
    if (req.method === "GET" && /^\/(el|en)$/.test(url.pathname)) return publicContentDocument(res, url.pathname.split("/")[1] as "el"|"en", "");
    if (req.method === "GET" && /^\/(el|en)\/[a-z0-9\-_/]+$/.test(url.pathname) && !url.pathname.includes("/products/") && !url.pathname.includes("/shops/") && !url.pathname.includes("/stories/") && !url.pathname.includes("/collections/")) return publicContentDocument(res, url.pathname.split("/")[1] as "el"|"en", url.pathname.split("/").slice(2).join("/"));
    if (req.method === "GET" && /^\/(el|en)\/stories\/[^/]+$/.test(url.pathname)) return publicStoryDocument(res, url.pathname.split("/")[1] as "el"|"en", url.pathname.split("/")[3]);
    if (req.method === "GET" && /^\/(el|en)\/collections\/[^/]+$/.test(url.pathname)) return publicCollectionDocument(req, res, url.pathname.split("/")[1] as "el"|"en", url.pathname.split("/")[3]);
    if (req.method === "GET" && /^\/(el|en)\/products\/[^/]+$/.test(url.pathname)) return publicProductDocument(req, res, url.pathname.split("/")[1] as "el"|"en", url.pathname.split("/")[3]);
    if (req.method === "GET" && /^\/(el|en)\/shops\/[^/]+$/.test(url.pathname)) return publicVendorDocument(res, url.pathname.split("/")[1] as "el"|"en", url.pathname.split("/")[3]);

    // Auth
    if (req.method === "POST" && url.pathname === "/api/auth/register") return await registerCustomer(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/verify-email") return await verifyEmail(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/login") return await login(req, res);
    if (req.method === "POST" && url.pathname === "/api/auth/logout") return await logout(req, res);
    if (req.method === "GET" && url.pathname === "/api/auth/me") return me(req, res);

    // Persistent cart / customer commerce
    if (req.method === "GET" && url.pathname === "/api/cart") return getCart(req, res, url);
    if (req.method === "POST" && url.pathname === "/api/cart/items") return await addCartItem(req, res);
    if (req.method === "POST" && url.pathname === "/api/cart/coupon") return await applyCartCoupon(req, res);
    if (req.method === "DELETE" && url.pathname === "/api/cart/coupon") return clearCartCoupon(req, res);
    if (req.method === "PATCH" && /^\/api\/cart\/items\/[^/]+$/.test(url.pathname)) return await updateCartItem(req, res, url.pathname.split("/")[4]);
    if (req.method === "DELETE" && /^\/api\/cart\/items\/[^/]+$/.test(url.pathname)) return deleteCartItem(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/checkout") return await checkout(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/orders") return accountOrders(req, res);
    if (req.method === "GET" && /^\/api\/account\/orders\/[^/]+\/tracking$/.test(url.pathname)) return accountOrderTracking(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/orders\/[^/]+\/cancel$/.test(url.pathname)) return await accountCancelOrder(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/substitutions\/[^/]+\/decision$/.test(url.pathname)) return await accountSubstitutionDecision(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/account/advice") return accountAdvice(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/notifications") return accountNotifications(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/account/notification-preferences") return accountNotificationPreferences(req, res);
    if (req.method === "PUT" && url.pathname === "/api/account/notification-preferences") return await updateAccountNotificationPreference(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/pickups") return accountPickups(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/shipments") return accountShipments(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/notifications/read-all") return markAllAccountNotificationsRead(req, res, url);
    if (req.method === "POST" && /^\/api\/account\/notifications\/[^/]+\/archive$/.test(url.pathname)) return archiveAccountNotification(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/notifications\/[^/]+\/read$/.test(url.pathname)) return markAccountNotificationRead(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/private-offers\/[^/]+\/add-to-cart$/.test(url.pathname)) return await addPrivateOfferToCart(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/account/reviews") return accountReviews(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/reviews/order") return await submitOrderReview(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/reviews/advice") return await submitAdviceReview(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/saved-searches") return accountSavedSearches(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/saved-searches") return await accountCreateSavedSearch(req, res);
    if (req.method === "PUT" && /^\/api\/account\/saved-searches\/[^/]+$/.test(url.pathname)) return await accountUpdateSavedSearch(req, res, url.pathname.split("/")[4]);
    if (req.method === "DELETE" && /^\/api\/account\/saved-searches\/[^/]+$/.test(url.pathname)) return accountDeleteSavedSearch(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/account/saved-products") return accountSavedProducts(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/saved-product-alerts") return accountSavedProductAlerts(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/recommendations") return accountRecommendations(req, res, url);
    if (req.method === "PUT" && /^\/api\/account\/saved-products\/[^/]+\/alerts$/.test(url.pathname)) return await accountUpdateSavedProductAlert(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/saved-products\/[^/]+$/.test(url.pathname)) return accountSaveProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "DELETE" && /^\/api\/account\/saved-products\/[^/]+$/.test(url.pathname)) return accountUnsaveProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/account/saved-vendors") return accountSavedVendors(req, res);
    if (req.method === "POST" && /^\/api\/account\/saved-vendors\/[^/]+$/.test(url.pathname)) return accountSaveVendor(req, res, url.pathname.split("/")[4]);
    if (req.method === "DELETE" && /^\/api\/account\/saved-vendors\/[^/]+$/.test(url.pathname)) return accountUnsaveVendor(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/account/recently-viewed") return accountRecentlyViewed(req, res);
    if (req.method === "DELETE" && url.pathname === "/api/account/recently-viewed") return accountClearRecentlyViewed(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/personalization-preferences") return accountPersonalizationPreferences(req, res);
    if (req.method === "PUT" && url.pathname === "/api/account/personalization-preferences") return await accountUpdatePersonalizationPreferences(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/privacy") return accountPrivacy(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/privacy/export") return accountPrivacyExport(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/privacy/deletion") return await accountPrivacyDeletion(req, res);
    if (req.method === "POST" && url.pathname === "/api/account/privacy/close") return await accountPrivacyClose(req, res);

    // Advice + Ask Local
    if (req.method === "POST" && url.pathname === "/api/advice/conversations") return await startConversation(req, res);
    if (req.method === "POST" && /^\/api\/advice\/conversations\/[^/]+\/messages$/.test(url.pathname)) return await sendConversationMessage(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/advice/appointments") return await bookAdviceAppointment(req, res);
    if (req.method === "POST" && url.pathname === "/api/ask-local") return await askLocal(req, res);

    // Customer returns / guarantees / recalls
    if (req.method === "POST" && url.pathname === "/api/returns") return await requestReturn(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/returns") return accountReturns(req, res);
    if (req.method === "GET" && url.pathname === "/api/account/recalls") return accountRecalls(req, res);
    if (req.method === "POST" && /^\/api\/returns\/[^/]+\/evidence$/.test(url.pathname)) return await addReturnEvidence(req, res, url.pathname.split("/")[3]);
    if (req.method === "POST" && /^\/api\/returns\/[^/]+\/dispatch$/.test(url.pathname)) return await dispatchReturn(req, res, url.pathname.split("/")[3]);
    if (req.method === "POST" && /^\/api\/account\/recalls\/[^/]+\/acknowledge$/.test(url.pathname)) return acknowledgeRecall(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/account\/recalls\/[^/]+\/remedy$/.test(url.pathname)) return await requestRecallRemedy(req, res, url.pathname.split("/")[4]);

    // Merchant application / onboarding
    if (req.method === "POST" && url.pathname === "/api/merchant/applications") return await startVendorApplication(req, res);
    if (req.method === "GET" && url.pathname === "/api/merchant/application") return ownVendorApplication(req, res);
    if (req.method === "POST" && /^\/api\/merchant\/applications\/[^/]+\/submit$/.test(url.pathname)) return submitVendorApplication(req, res, url.pathname.split("/")[4]);

    // Vendor workspace
    if (req.method === "GET" && url.pathname === "/api/vendor/dashboard") return vendorDashboard(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/operations-config") return vendorOperationsConfig(req, res);
    if (req.method === "PUT" && url.pathname === "/api/vendor/operations-config") return await updateVendorOperationsConfig(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/locations") return await vendorAddLocation(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/analytics") return vendorAnalytics(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/vendor/stories") return vendorStories(req, res);
    if (req.method === "POST" && /^\/api\/vendor\/stories\/[^/]+\/approve$/.test(url.pathname)) return vendorApproveStory(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/vendor/products") return vendorProducts(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/products") return await vendorCreateProduct(req, res);
    if (req.method === "PATCH" && /^\/api\/vendor\/products\/[^/]+$/.test(url.pathname)) return await vendorUpdateProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/products\/[^/]+\/submit$/.test(url.pathname)) return vendorSubmitProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/vendor/products/import/preview") return await vendorImportPreview(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/products/import/commit") return await vendorImportCommit(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/media") return vendorMedia(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/media/upload-intent") return await vendorCreateMediaUploadIntent(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/media/upload") return await vendorUploadMedia(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/compliance-documents") return vendorComplianceDocuments(req, res);
    if (req.method === "POST" && url.pathname === "/api/vendor/compliance-documents") return await vendorSubmitComplianceDocument(req, res);
    if (req.method === "GET" && /^\/api\/vendor\/inventory\/[^/]+\/history$/.test(url.pathname)) return vendorInventoryHistory(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/vendor/orders") return vendorOrders(req, res);
    if (req.method === "POST" && /^\/api\/vendor\/orders\/[^/]+\/lines\/[^/]+\/substitution$/.test(url.pathname)) return await vendorProposeSubstitution(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/api/vendor/advice") return vendorAdvice(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/money") return vendorMoney(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/pickups") return vendorPickups(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/shipments") return vendorShipments(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/notifications") return vendorNotifications(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/notification-preferences") return vendorNotificationPreferences(req, res);
    if (req.method === "PUT" && url.pathname === "/api/vendor/notification-preferences") return await updateVendorNotificationPreference(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/fairness") return vendorFairness(req, res);
    if (req.method === "GET" && url.pathname === "/api/vendor/reviews") return vendorReviews(req, res);
    if (req.method === "POST" && /^\/api\/vendor\/reviews\/[^/]+\/response$/.test(url.pathname)) return await vendorRespondReview(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/reviews\/[^/]+\/report$/.test(url.pathname)) return await vendorReportReview(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/appointments\/[^/]+\/complete$/.test(url.pathname)) return vendorCompleteAppointment(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/vendor/fairness/appeals") return await vendorSubmitFairnessAppeal(req, res);
    if (req.method === "POST" && /^\/api\/vendor\/notifications\/[^/]+\/read$/.test(url.pathname)) return markVendorNotificationRead(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/inventory\/[^/]+$/.test(url.pathname)) return await vendorInventoryUpdate(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/orders\/[^/]+\/fulfilments\/[^/]+\/(accept|reject|deliver)$/.test(url.pathname)) return await vendorFulfilmentAction(req, res, url.pathname);
    if (req.method === "POST" && /^\/api\/vendor\/orders\/[^/]+\/fulfilments\/[^/]+\/ready-pickup$/.test(url.pathname)) return vendorReadyPickup(req, res, url.pathname);
    if (req.method === "POST" && /^\/api\/vendor\/pickups\/[^/]+\/verify$/.test(url.pathname)) return await vendorVerifyPickup(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/orders\/[^/]+\/fulfilments\/[^/]+\/shipment$/.test(url.pathname)) return await vendorCreateShipment(req, res, url.pathname);
    if (req.method === "POST" && /^\/api\/vendor\/shipments\/[^/]+\/label$/.test(url.pathname)) return vendorCreateShippingLabel(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/shipments\/[^/]+\/handover$/.test(url.pathname)) return vendorHandoverShipment(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/procurements\/[^/]+\/invoice$/.test(url.pathname)) return await vendorMatchProcurementInvoice(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/counteroffers\/[^/]+\/offer$/.test(url.pathname)) return await vendorMakePrivateOffer(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/vendor/returns") return vendorReturns(req, res);
    if (req.method === "POST" && /^\/api\/vendor\/returns\/[^/]+\/receive$/.test(url.pathname)) return vendorReceiveReturn(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/vendor\/returns\/[^/]+\/replacement\/(accept|ready|ship|deliver|reject)$/.test(url.pathname)) return await vendorReplacementAction(req, res, url.pathname);
    if (req.method === "POST" && /^\/api\/vendor\/returns\/[^/]+\/repair\/(start|await_part|ready|return_to_customer|fail)$/.test(url.pathname)) return await vendorRepairAction(req, res, url.pathname);

    // Platform admin
    if (req.method === "GET" && url.pathname === "/api/admin/local-operations") return adminLocalOperations(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/content") return adminContent(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/content/pages") return await adminCreateContentPage(req, res);
    if (req.method === "PUT" && /^\/api\/admin\/content\/pages\/[^/]+$/.test(url.pathname)) return await adminUpdateContentPage(req, res, url.pathname.split("/")[5]);
    if (req.method === "POST" && /^\/api\/admin\/content\/pages\/[^/]+\/publish$/.test(url.pathname)) return await adminPublishContentPage(req, res, url.pathname.split("/")[5]);
    if (req.method === "POST" && /^\/api\/admin\/content\/pages\/[^/]+\/archive$/.test(url.pathname)) return await adminArchiveContentPage(req, res, url.pathname.split("/")[5]);
    if (req.method === "POST" && url.pathname === "/api/admin/content/navigation") return await adminSetNavigation(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/content/redirects") return await adminCreateRedirect(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/content/stories") return await adminCreateStory(req, res);
    if (req.method === "POST" && /^\/api\/admin\/content\/stories\/[^/]+\/publish$/.test(url.pathname)) return adminPublishStory(req, res, url.pathname.split("/")[5]);
    if (req.method === "POST" && url.pathname === "/api/admin/content/collections") return await adminCreateCollection(req, res);
    if (req.method === "POST" && /^\/api\/admin\/content\/collections\/[^/]+\/publish$/.test(url.pathname)) return adminPublishCollection(req, res, url.pathname.split("/")[5]);
    if (req.method === "GET" && url.pathname === "/api/admin/vendor-applications") return adminVendorApplications(req, res);
    if (req.method === "POST" && /^\/api\/admin\/vendor-applications\/[^/]+\/transition$/.test(url.pathname)) return await adminTransitionVendorApplication(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/dashboard") return adminDashboard(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/health") return await adminHealth(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/security") return adminSecurity(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/privacy-requests") return adminPrivacyRequests(req, res);
    if (req.method === "POST" && /^\/api\/admin\/privacy-requests\/[^/]+\/processing$/.test(url.pathname)) return adminStartPrivacyRequest(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/privacy-requests\/[^/]+\/complete$/.test(url.pathname)) return await adminCompletePrivacyRequest(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/analytics") return adminAnalytics(req, res, url);
    if (req.method === "GET" && url.pathname === "/api/admin/notifications") return adminNotifications(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/reviews") return adminReviews(req, res);
    if (req.method === "POST" && /^\/api\/admin\/reviews\/[^/]+\/moderate$/.test(url.pathname)) return await adminModerateReview(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/review-reports\/[^/]+\/review$/.test(url.pathname)) return await adminReviewReviewReport(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/admin/notification-templates") return await adminCreateNotificationTemplate(req, res);
    if (req.method === "POST" && /^\/api\/admin\/notifications\/[^/]+\/retry$/.test(url.pathname)) return adminRetryNotification(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/fairness") return adminFairness(req, res);
    if (req.method === "POST" && /^\/api\/admin\/fairness-appeals\/[^/]+\/review$/.test(url.pathname)) return await adminReviewFairnessAppeal(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/fairness-anomalies\/[^/]+\/(acknowledge|resolve)$/.test(url.pathname)) return adminFairnessAnomalyAction(req, res, url.pathname);
    if (req.method === "GET" && url.pathname === "/api/admin/category-governance") return adminCategoryGovernance(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/promotions") return adminPromotions(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/promotions") return await adminCreatePromotion(req, res);
    if (req.method === "POST" && /^\/api\/admin\/promotions\/[^/]+\/cancel$/.test(url.pathname)) return await adminCancelPromotion(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/products\/[^/]+\/platform-price$/.test(url.pathname)) return await adminSetPlatformPrice(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/admin/coupons") return await adminCreateCoupon(req, res);
    if (req.method === "PUT" && /^\/api\/admin\/category-governance\/[^/]+$/.test(url.pathname)) return await adminUpdateCategoryGovernance(req, res, decodeURIComponent(url.pathname.split("/")[4]));
    if (req.method === "GET" && url.pathname === "/api/admin/product-matching") return adminProductMatching(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/media") return adminMedia(req, res);
    if (req.method === "POST" && /^\/api\/admin\/media\/[^/]+\/review$/.test(url.pathname)) return await adminReviewMedia(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/compliance-documents") return adminComplianceDocuments(req, res);
    if (req.method === "POST" && /^\/api\/admin\/compliance-documents\/[^/]+\/review$/.test(url.pathname)) return await adminReviewComplianceDocument(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/product-notices") return adminProductNotices(req, res);
    if (req.method === "POST" && /^\/api\/admin\/products\/[^/]+\/notices$/.test(url.pathname)) return await adminOpenProductNotice(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/product-notices\/[^/]+\/resolve$/.test(url.pathname)) return await adminResolveProductNotice(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/products\/[^/]+\/restore$/.test(url.pathname)) return await adminRestoreProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/product-matching\/[^/]+\/approve$/.test(url.pathname)) return await adminApproveProductMatch(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/product-matching\/[^/]+\/reject$/.test(url.pathname)) return await adminRejectProductMatch(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/vendor-products\/[^/]+\/create-canonical$/.test(url.pathname)) return await adminCreateCanonical(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/vendor-products\/[^/]+\/approve$/.test(url.pathname)) return await adminApproveVendorProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/vendor-products\/[^/]+\/reject$/.test(url.pathname)) return await adminRejectVendorProduct(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/orders") return adminOrders(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/order-operations") return adminOrderOperations(req, res);
    if (req.method === "POST" && /^\/api\/admin\/fulfilment-sla\/[^/]+\/resolve$/.test(url.pathname)) return await adminResolveFulfilmentSla(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/returns") return adminReturns(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/recalls") return adminRecalls(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/settlements") return adminSettlements(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/commercial-rules") return adminCommercialRules(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/delivery-rules") return await adminCreateDeliveryRule(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/fee-rules") return await adminCreateFeeRule(req, res);
    if (req.method === "POST" && /^\/api\/admin\/procurements\/[^/]+\/commercials$/.test(url.pathname)) return await adminApplyProcurementCommercials(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/disputes") return adminDisputes(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/disputes/open") return await adminOpenDispute(req, res);
    if (req.method === "POST" && /^\/api\/admin\/disputes\/[^/]+\/evidence$/.test(url.pathname)) return await adminAddDisputeEvidence(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/disputes\/[^/]+\/submit$/.test(url.pathname)) return adminSubmitDispute(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/disputes\/[^/]+\/resolve$/.test(url.pathname)) return await adminResolveDispute(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/disputes\/[^/]+\/allocate$/.test(url.pathname)) return await adminAllocateDispute(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/procurements\/[^/]+\/approve-payable$/.test(url.pathname)) return adminApproveProcurementPayable(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/admin/settlements") return await adminCreateSettlement(req, res);
    if (req.method === "POST" && /^\/api\/admin\/settlements\/[^/]+\/submit$/.test(url.pathname)) return adminSubmitSettlement(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/settlements\/[^/]+\/approve$/.test(url.pathname)) return adminApproveSettlement(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/settlements\/[^/]+\/pay$/.test(url.pathname)) return await adminPaySettlement(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/approve$/.test(url.pathname)) return await adminApproveReturn(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/authorize$/.test(url.pathname)) return await adminAuthorizeReturn(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/inspect$/.test(url.pathname)) return await adminInspectReturn(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/remedy$/.test(url.pathname)) return await adminApproveReturnRemedy(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/price-reduction$/.test(url.pathname)) return adminExecutePriceReduction(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && /^\/api\/admin\/returns\/[^/]+\/refund$/.test(url.pathname)) return await adminRefundReturn(req, res, url.pathname.split("/")[4]);
    if (req.method === "GET" && url.pathname === "/api/admin/outbox") return adminOutbox(req, res);
    if (req.method === "POST" && url.pathname === "/api/admin/jobs/run") return await adminRunJobs(req, res);
    if (req.method === "POST" && /^\/api\/admin\/outbox\/[^/]+\/replay$/.test(url.pathname)) return adminReplayOutbox(req, res, url.pathname.split("/")[4]);
    if (req.method === "POST" && url.pathname === "/api/admin/courier-events") return await adminCourierEvent(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/audit") return adminAudit(req, res);

    if (req.method === "GET" && !url.pathname.startsWith("/api/")) {
      const redirectRule = runtime.content.resolveRedirect(MARKET_ID, url.pathname);
      if (redirectRule) return redirect(res, redirectRule.statusCode, redirectRule.toPath);
    }

    // Compatibility endpoints from iteration 1 (admin/dev protected for writes)
    if (req.method === "GET" && url.pathname === "/api/orders") return json(res, 200, runtime.commerce.orders());

    // Functional development UI
    if (req.method === "GET" && url.pathname === "/") return html(res, customerPage());
    if (req.method === "GET" && url.pathname === "/join") return html(res, joinPage());
    if (req.method === "GET" && url.pathname === "/vendor") return html(res, vendorPage());
    if (req.method === "GET" && url.pathname === "/admin") return html(res, adminPage());

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    recordSecurityFailure(req, requestId, error, message);
    if (error instanceof RateLimitError) {
      res.setHeader("retry-after", String(Math.max(1, Math.ceil(error.decision.retryAfterMs / 1000))));
      res.setHeader("x-ratelimit-limit", String(error.decision.limit));
      res.setHeader("x-ratelimit-remaining", String(error.decision.remaining));
      res.setHeader("x-ratelimit-reset", String(Math.ceil(error.decision.resetAt / 1000)));
      return json(res, 429, { error: "too_many_requests", retryAfterMs: error.decision.retryAfterMs });
    }
    const status = /authentication required|invalid email or password/i.test(message) ? 401
      : /permission|vendor isolation|csrf|only the assigned vendor/i.test(message) ? 403
      : /not found|unknown/i.test(message) ? 404
      : 400;
    return json(res, status, { error: message });
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Buy Local Sparta development runtime: http://127.0.0.1:${PORT}`);
  console.log("Demo customer: customer@demo.local / Customer!123");
  console.log("Demo vendor:   tech@demo.local / VendorOwner!123");
  console.log("Demo admin:    admin@demo.local / AdminStrong!123");
  console.log("Demo finance:  finance@demo.local / FinanceStrong!123");
});

function catalog(req: IncomingMessage, res: ServerResponse, url: URL) {
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const postcode = url.searchParams.get("postcode") ?? "23100";
  const q = url.searchParams.get("q") ?? "";
  const availability = url.searchParams.get("availability") === "pickup_today" ? "pickup_today" : url.searchParams.get("availability") === "in_stock" ? "in_stock" : "any";
  const minPriceMinor = euroFilter(url.searchParams.get("minPrice"));
  const maxPriceMinor = euroFilter(url.searchParams.get("maxPrice"));
  const categoryCode = url.searchParams.get("category") || undefined;
  const adviceOnly = url.searchParams.get("advice") === "1";
  const openNowOnly = url.searchParams.get("open") === "1";
  const attributeFilters: Record<string, string[]> = {};
  for (const [key, value] of url.searchParams.entries()) if (key.startsWith("attr.") && value.trim()) {
    const code = key.slice(5);
    if (code) (attributeFilters[code] ??= []).push(value.trim());
  }
  const hits = runtime.search.search({ marketId: MARKET_ID, q, type: "product", availability, adviceOnly, minPriceMinor, maxPriceMinor, categoryCode, attributeFilters, limit: 40 });
  let products = hits.flatMap((hit) => {
    const canonical = runtime.catalog.canonical(hit.document.id);
    if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) return [];
    return [publicProduct(hit.document.id, visitorKey, postcode, "search_card")];
  });
  if (openNowOnly) products = products.filter((product) => product.localPartner.openNow);
  const sort = url.searchParams.get("sort");
  if (sort === "price_asc") products = products.sort((a, b) => a.price.minor - b.price.minor);
  if (sort === "price_desc") products = products.sort((a, b) => b.price.minor - a.price.minor);
  const categories = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true }).reduce((acc, product) => {
    const existing = acc.find((item) => item.code === product.categoryCode);
    if (existing) existing.count += 1;
    else acc.push({ code: product.categoryCode, label: categoryLabel(product.categoryCode), count: 1 });
    return acc;
  }, [] as Array<{ code: string; label: string; count: number }>).sort((a, b) => a.label.localeCompare(b.label, "el"));
  const categorySchema = categoryCode ? runtime.categoryGovernance.schema(categoryCode) : undefined;
  const attributeFacets = categoryCode ? runtime.categoryGovernance.facetValues(categoryCode, runtime.catalog.canonicals({ marketId: MARKET_ID, categoryCode, activeOnly: true }).map((item) => item.identity.attributes)) : {};
  const shouldTrack = Boolean(q.trim() || categoryCode || Object.keys(attributeFilters).length || adviceOnly || openNowOnly || availability !== "any" || minPriceMinor !== undefined || maxPriceMinor !== undefined);
  const searchEvent = shouldTrack ? runtime.analytics.recordSearch({ marketId: MARKET_ID, query: q, resultCount: products.length, visitorKey, customerId: principal?.userId, filters: { availability, minPriceMinor, maxPriceMinor, categoryCode, attributeFilters, adviceOnly, openNowOnly, sort: sort ?? "local_relevance" }, now: Date.now() }) : undefined;
  return json(res, 200, { market: "Sparta", demoData: true, query: q, searchEventId: searchEvent?.id, filters: { availability, minPriceMinor, maxPriceMinor, categoryCode, attributeFilters, adviceOnly, openNowOnly, sort: sort ?? "local_relevance" }, facets: { categories, categorySchema, attributes: attributeFacets }, products });
}

function autocomplete(_req: IncomingMessage, res: ServerResponse, url: URL) {
  return json(res, 200, { suggestions: runtime.search.autocomplete({ marketId: MARKET_ID, q: url.searchParams.get("q") ?? "", limit: 8 }) });
}

async function searchAnalyticsClick(req: IncomingMessage, res: ServerResponse) {
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const body = await readJson(req);
  const entityType = ["product", "vendor", "category", "advice"].includes(String(body.entityType)) ? body.entityType : "product";
  const event = runtime.analytics.recordSearchClick({ searchEventId: String(body.searchEventId ?? ""), entityId: String(body.entityId ?? ""), entityType, position: Number(body.position ?? 0), visitorKey, customerId: principal?.userId, now: Date.now() });
  return json(res, 201, { eventId: event.id });
}

function product(req: IncomingMessage, res: ServerResponse, variantId: string, url: URL) {
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  if (principal?.roles.includes("customer")) runtime.personalization.recordView(principal.userId, variantId, Date.now());
  return json(res, 200, publicProduct(variantId, visitorKey, url.searchParams.get("postcode") ?? "23100", "product_view"));
}

function publicProduct(variantId: string, visitorKey: string, postcode: string, reason: "search_card" | "recommendation_card" | "product_view" | "product_page") {
  const variant = runtime.commerce.variant(variantId);
  const canonical = runtime.catalog.canonical(variantId);
  if (!variant || !canonical || !canonical.active || canonical.suppressed || canonical.recalled) throw new Error("Product not found");
  const assignment = runtime.fairness.select({
    marketId: variant.marketId,
    canonicalVariantId: variant.id,
    visitorKey,
    postcode,
    desiredFulfilment: "pickup",
    now: Date.now(),
    reason
  }, liveOffers(variant.id, postcode, "pickup"));
  const vendor = publicVendors().find((entry: any) => entry.id === assignment.vendorId) ?? {
    id: assignment.vendorId, name: "Verified local partner", adviser: "Local adviser",
    adviserId: `adviser-${assignment.vendorId}`, expertise: [categoryLabel(canonical.categoryCode)], area: "Sparta"
  };
  const locationId = assignment.locationId;
  let openingStatus: ReturnType<typeof runtime.tradingCalendar.status> | undefined;
  try { openingStatus = runtime.tradingCalendar.status(locationId, Date.now()); } catch { /* onboarding location has no schedule yet */ }
  const details = demoProductDetails[variant.id];
  const priceResolution = runtime.retailPricing.resolve(variant.id, Date.now());
  const analyticsNow = Date.now();
  const categoryCode = canonical.categoryCode;
  if (reason === "search_card" || reason === "recommendation_card") {
    const bucket = Math.floor(analyticsNow / (15 * 60 * 1000));
    runtime.analytics.record({ eventName: "product.impression", marketId: MARKET_ID, visitorKey, vendorId: assignment.vendorId, canonicalVariantId: variant.id, metadata: { categoryCode, source: reason }, dedupeKey: `product-impression:${visitorKey}:${variant.id}:${assignment.vendorId}:${bucket}`, now: analyticsNow });
  } else {
    const bucket = Math.floor(analyticsNow / (30 * 60 * 1000));
    runtime.analytics.record({ eventName: "product.viewed", marketId: MARKET_ID, visitorKey, vendorId: assignment.vendorId, canonicalVariantId: variant.id, metadata: { categoryCode, source: reason }, dedupeKey: `product-view:${visitorKey}:${variant.id}:${assignment.vendorId}:${bucket}`, now: analyticsNow });
  }
  return {
    id: variant.id,
    title: canonical.titleEl,
    titleEn: canonical.titleEn ?? canonical.identity.title,
    description: canonical.descriptionEl ?? details?.descriptionEl ?? "Verified local product available through Buy Local Sparta.",
    brand: canonical.identity.brand,
    model: canonical.identity.model,
    category: categoryLabel(canonical.categoryCode),
    categoryCode: canonical.categoryCode,
    attributes: canonical.identity.attributes,
    attributeSchema: runtime.categoryGovernance.schema(canonical.categoryCode),
    commercePolicy: runtime.categoryGovernance.policy(canonical.categoryCode),
    checkoutDecision: runtime.categoryGovernance.decide({ categoryCode: canonical.categoryCode, action: "checkout", fulfilmentMode: "pickup", compatibilityConfirmed: false, complianceCleared: runtime.trust.documents({ canonicalVariantId: canonical.id }).some((document) => document.status === "verified") }),
    accent: details?.accent ?? "local",
    price: priceResolution.currentPrice,
    formattedPrice: formatMoney(priceResolution.currentPrice),
    pricePresentation: { ...priceResolution, formattedBasePrice: formatMoney(priceResolution.basePrice), formattedPriorPrice: priceResolution.priorPrice ? formatMoney(priceResolution.priorPrice) : undefined, formattedSavings: priceResolution.savings ? formatMoney(priceResolution.savings) : undefined },
    vatIncluded: true,
    availableToSell: runtime.inventory.availableToSell(assignment.offerId),
    localPartner: { id: vendor.id, name: vendor.name, adviser: vendor.adviser, adviserId: vendor.adviserId, expertise: vendor.expertise, area: vendor.area, locationId, openNow: openingStatus?.open ?? false, closesAt: openingStatus?.closesAt, nextOpenAt: openingStatus?.nextOpenAt },
    seller: { name: "Buy Local Sparta", role: "consumer-facing seller" },
    assignment: { reusedStickyAssignment: assignment.reusedStickyAssignment, stickyUntil: assignment.stickyUntil },
    media: runtime.media.publicAssets(variant.id).map((asset) => ({ id: asset.id, kind: asset.kind, altText: asset.altText, objectKey: asset.objectKey })),
    structuredData: productStructuredData({ url: `${PUBLIC_ORIGIN}/el/products/${variant.id}`, name: canonical.titleEl, description: canonical.descriptionEl, brand: canonical.identity.brand, sku: canonical.identity.mpn, gtin: canonical.identity.gtin, priceMinor: priceResolution.currentPrice.minor, currency: priceResolution.currentPrice.currency, available: runtime.inventory.availableToSell(assignment.offerId) > 0, sellerName: "Buy Local Sparta", fulfillerName: vendor.name }),
    reviews: runtime.reviews.aggregateForProduct(variant.id),
    recentReviews: runtime.reviews.publicForProduct(variant.id).slice(0, 3),
    demoData: Boolean(details)
  };
}

function publicReviews(res: ServerResponse, url: URL) {
  const canonicalVariantId = url.searchParams.get("canonicalVariantId");
  const vendorId = url.searchParams.get("vendorId");
  if (!canonicalVariantId && !vendorId) throw new Error("canonicalVariantId or vendorId is required");
  if (canonicalVariantId) return json(res, 200, { reviews: runtime.reviews.publicForProduct(canonicalVariantId), aggregate: runtime.reviews.aggregateForProduct(canonicalVariantId) });
  return json(res, 200, { reviews: runtime.reviews.publicForVendor(vendorId!), aggregate: runtime.reviews.aggregateForVendor(vendorId!) });
}

function publicPlans(res: ServerResponse) {
  const plans = runtime.plans.publicPlans().map((plan) => ({
    ...plan,
    formattedMonthlyPrice: plan.monthlyPrice ? formatMoney(plan.monthlyPrice) : undefined,
    formattedAnnualPrice: plan.annualPrice ? formatMoney(plan.annualPrice) : undefined,
    formattedTermPrice: plan.termPrice ? formatMoney(plan.termPrice) : undefined
  }));
  return json(res, 200, { plans, note: "Only approved active plans are public; draft standard pricing remains unpublished." });
}

function publicPromotions(res: ServerResponse) {
  const now = Date.now();
  const promotions = runtime.retailPricing.promotions({ marketId: MARKET_ID })
    .filter((promotion) => runtime.retailPricing.status(promotion, now) === "active")
    .map((promotion) => {
      const price = runtime.retailPricing.resolve(promotion.canonicalVariantId, now);
      const canonical = runtime.catalog.canonical(promotion.canonicalVariantId);
      return { id: promotion.id, canonicalVariantId: promotion.canonicalVariantId, title: canonical?.titleEl ?? promotion.canonicalVariantId, name: promotion.name, status: "active", price: price.currentPrice, formattedPrice: formatMoney(price.currentPrice), priorPrice: price.priorPrice, formattedPriorPrice: price.priorPrice ? formatMoney(price.priorPrice) : undefined, endsAt: promotion.endsAt };
    });
  return json(res, 200, { promotions });
}

function deliveryQuote(_req: IncomingMessage, res: ServerResponse, url: URL) {
  const vendorId = url.searchParams.get("vendorId") ?? "";
  const mode = url.searchParams.get("mode");
  if (!vendorId) throw new Error("vendorId is required");
  if (mode !== "pickup" && mode !== "local_delivery" && mode !== "shipping") throw new Error("Valid delivery mode is required");
  const vendor = publicVendors().find((item: any) => item.id === vendorId);
  if (!vendor) throw new Error("Vendor not found");
  const postcode = url.searchParams.get("postcode") ?? "23100";
  const now = Date.now();
  const locationId = url.searchParams.get("locationId") ?? vendor.locationId ?? `loc-${vendorId}`;
  const location = runtime.vendorLocations.get(locationId);
  if (location && location.vendorId !== vendorId) throw new Error("Vendor location mismatch");
  const serviceable = runtime.deliveryCoverage.canServe({ vendorId, locationId, context: { marketId: MARKET_ID, postcode, fulfilmentMode: mode, now } });
  if (!serviceable) throw new Error("Selected merchant cannot serve this delivery method and postcode");
  const subtotalMinor = Number(url.searchParams.get("subtotalMinor") ?? "0");
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) throw new Error("subtotalMinor must be a non-negative integer");
  const quote = runtime.deliveryPricing.quote({
    marketId: MARKET_ID,
    vendorId,
    mode,
    postcode,
    merchandiseSubtotal: money(subtotalMinor),
    packageCount: Number(url.searchParams.get("packageCount") ?? "1"),
    now
  });
  return json(res, 200, { ...quote, serviceable: true, formattedCustomerCharge: formatMoney(quote.customerCharge), formattedWaivedAmount: formatMoney(quote.waivedAmount) });
}


function publicContentDocument(res: ServerResponse, locale: "el"|"en", slug: string) {
  const record = runtime.content.publicPage({ marketId: MARKET_ID, slug, locale, now: Date.now() });
  if (!record) throw new Error("Content page not found");
  const seo = seoForPage({ origin: PUBLIC_ORIGIN, page: record.page, translation: record.translation, locale });
  const sections = record.translation.blocks.map((block) => ({ heading: typeof block.data.heading === "string" ? block.data.heading : undefined, body: String(block.data.body ?? block.data.text ?? block.data.subtitle ?? "") })).filter((section) => section.heading || section.body);
  return html(res, publicSeoPage({ lang: locale, title: seo.title, description: seo.description, canonicalUrl: seo.canonicalUrl, robots: seo.robots, alternates: seo.alternates, eyebrow: record.page.pageType === "local_landing" ? "Sparta · local discovery" : "Buy Local Sparta", heading: record.translation.title, intro: seo.description, sections }));
}

function publicStoryDocument(res: ServerResponse, locale: "el"|"en", slug: string) {
  const story = runtime.content.stories({ marketId: MARKET_ID, locale, status: "published" }).find((item) => item.slug === slug);
  if (!story) throw new Error("Merchant story not found");
  const vendor = publicVendors().find((item: any) => item.id === story.vendorId);
  const url = `${PUBLIC_ORIGIN}/${locale}/stories/${story.slug}`;
  const structuredData = articleStructuredData({ url, headline: story.title, description: story.excerpt, datePublished: story.publishedAt!, dateModified: story.updatedAt, authorName: vendor?.name ?? story.authorLabel, publisherName: "Buy Local Sparta" });
  const sections = story.blocks.map((block) => ({ heading: typeof block.data.heading === "string" ? block.data.heading : undefined, body: String(block.data.body ?? block.data.text ?? "") })).filter((section) => section.heading || section.body);
  return html(res, publicSeoPage({ lang: locale, title: story.seo.title, description: story.seo.description, canonicalUrl: url, robots: story.seo.noindex ? "noindex,follow" : "index,follow", eyebrow: vendor?.name ?? "Local shop story", heading: story.title, intro: story.excerpt, sections, structuredData }));
}

function publicCollectionDocument(req: IncomingMessage, res: ServerResponse, locale: "el"|"en", slug: string) {
  const collection = runtime.content.collections({ marketId: MARKET_ID, locale, status: "published" }).find((item) => item.slug === slug);
  if (!collection) throw new Error("Product collection not found");
  const visitor = visitorKey(req);
  const productNames = collection.canonicalVariantIds.flatMap((variantId) => { try { return [publicProduct(variantId, visitor, "23100", "search_card").title]; } catch { return []; } });
  const url = `${PUBLIC_ORIGIN}/${locale}/collections/${collection.slug}`;
  return html(res, publicSeoPage({ lang: locale, title: collection.seo.title, description: collection.seo.description, canonicalUrl: url, robots: collection.seo.noindex ? "noindex,follow" : "index,follow", eyebrow: "Local collection", heading: collection.title, intro: collection.description ?? collection.seo.description, sections: [{ heading: locale === "el" ? "Προϊόντα" : "Products", body: productNames.join(" · ") || (locale === "el" ? "Η συλλογή ενημερώνεται." : "Collection is being updated.") }] }));
}

function publicProductDocument(req: IncomingMessage, res: ServerResponse, locale: "el"|"en", variantId: string) {
  const principal = currentPrincipal(req);
  if (principal?.roles.includes("customer")) runtime.personalization.recordView(principal.userId, variantId, Date.now());
  const item = publicProduct(variantId, visitorKey(req), "23100", "product_page");
  const detail = demoProductDetails[variantId];
  const title = locale === "en" ? detail?.titleEn ?? item.title : item.title;
  const description = locale === "en" ? `Available through Buy Local Sparta with local advice and fulfilment by ${item.localPartner.name}.` : detail?.descriptionEl ?? `Διαθέσιμο μέσω Buy Local Sparta με τοπική συμβουλή και εκπλήρωση από ${item.localPartner.name}.`;
  const url = `${PUBLIC_ORIGIN}/${locale}/products/${variantId}`;
  return html(res, publicSeoPage({ lang: locale, title: `${title} | Buy Local Sparta`, description, canonicalUrl: url, eyebrow: item.category, heading: title, intro: `${item.formattedPrice} · ${item.availableToSell} ${locale === "el" ? "διαθέσιμα" : "available"}`, sections: [{ heading: locale === "el" ? "Τοπική συμβουλή & εκπλήρωση" : "Local advice & fulfilment", body: `${item.localPartner.name} · ${item.localPartner.adviser}` }], structuredData: item.structuredData }));
}

function publicVendorDocument(res: ServerResponse, locale: "el"|"en", vendorId: string) {
  const vendor = publicVendors().find((entry: any) => entry.id === vendorId);
  if (!vendor) throw new Error("Vendor not found");
  const url = `${PUBLIC_ORIGIN}/${locale}/shops/${vendorId}`;
  const description = vendor.story ?? (locale === "el" ? "Επαληθευμένος τοπικός συνεργάτης του Buy Local Sparta." : "Verified local Buy Local Sparta partner.");
  return html(res, publicSeoPage({ lang: locale, title: `${vendor.name} | Buy Local Sparta`, description, canonicalUrl: url, eyebrow: vendor.category ?? "Local shop", heading: vendor.name, intro: description, sections: [{ heading: locale === "el" ? "Εξειδίκευση" : "Expertise", body: (vendor.expertise ?? []).join(" · ") }, { heading: locale === "el" ? "Περιοχή & ώρες" : "Area & hours", body: `${vendor.area ?? "Sparta"} · ${vendor.hours ?? ""}` }] }));
}

function publicCmsPage(res: ServerResponse, url: URL, slug: string) {
  const locale = url.searchParams.get("locale") === "en" ? "en" : "el";
  const record = runtime.content.publicPage({ marketId: MARKET_ID, slug, locale, now: Date.now() });
  if (!record) throw new Error("Content page not found");
  return json(res, 200, { ...record, seo: seoForPage({ origin: PUBLIC_ORIGIN, page: record.page, translation: record.translation, locale }) });
}

function publicNavigation(res: ServerResponse, url: URL) {
  const locale = url.searchParams.get("locale") === "en" ? "en" : "el";
  const key = url.searchParams.get("key") === "footer" ? "footer" : url.searchParams.get("key") === "merchant" ? "merchant" : "primary";
  return json(res, 200, { menu: runtime.content.navigation(MARKET_ID, key, locale) ?? null });
}

function publicStories(res: ServerResponse, url: URL) {
  const locale = url.searchParams.get("locale") === "en" ? "en" : "el";
  const stories = runtime.content.stories({ marketId: MARKET_ID, locale, status: "published" }).map((story) => ({
    ...story,
    vendor: publicVendors().find((vendor: any) => vendor.id === story.vendorId) ?? { id: story.vendorId, name: "Verified local shop" },
    structuredData: articleStructuredData({ url: `${PUBLIC_ORIGIN}/${story.locale}/stories/${story.slug}`, headline: story.title, description: story.excerpt, datePublished: story.publishedAt!, dateModified: story.updatedAt, authorName: publicVendors().find((vendor: any) => vendor.id === story.vendorId)?.name ?? story.authorLabel, publisherName: "Buy Local Sparta" })
  }));
  return json(res, 200, { stories });
}

function publicCollections(res: ServerResponse, url: URL) {
  const locale = url.searchParams.get("locale") === "en" ? "en" : "el";
  const visitorKey = `collection:${url.searchParams.get("visitor") ?? "public"}`;
  const postcode = url.searchParams.get("postcode") ?? "23100";
  const collections = runtime.content.collections({ marketId: MARKET_ID, locale, status: "published" }).map((collection) => ({
    ...collection,
    products: collection.canonicalVariantIds.flatMap((variantId) => {
      try { return [publicProduct(variantId, visitorKey, postcode, "search_card")]; } catch { return []; }
    })
  }));
  return json(res, 200, { collections });
}

function publicRedirect(res: ServerResponse, url: URL) {
  const path = url.searchParams.get("path") ?? "";
  if (!path) throw new Error("Redirect path is required");
  return json(res, 200, { redirect: runtime.content.resolveRedirect(MARKET_ID, path) ?? null });
}

function sitemapXml(res: ServerResponse) {
  const entries = contentSitemap({ pages: runtime.content.pages({ marketId: MARKET_ID }), stories: runtime.content.stories({ marketId: MARKET_ID, status: "published" }), collections: runtime.content.collections({ marketId: MARKET_ID, status: "published" }), now: Date.now() });
  const productEntries = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true }).filter((product) => !product.suppressed && !product.recalled).map((product) => ({ path: `/el/products/${product.id}`, lastModified: product.updatedAt }));
  const vendorEntries = publicVendors().map((vendor: any) => ({ path: `/el/shops/${vendor.id}`, lastModified: Date.UTC(2026, 7, 14) }));
  const rows = [...entries.map((entry) => ({ path: entry.path, lastModified: entry.lastModified })), ...productEntries, ...vendorEntries]
    .map((entry) => `<url><loc>${xmlEsc(`${PUBLIC_ORIGIN}${entry.path}`)}</loc><lastmod>${new Date(entry.lastModified).toISOString()}</lastmod></url>`).join("");
  return xml(res, 200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows}</urlset>`);
}

function robotsTxt(res: ServerResponse) {
  return text(res, 200, `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /vendor\nDisallow: /api/\nSitemap: ${PUBLIC_ORIGIN}/sitemap.xml\n`);
}

function vendorStories(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "content.vendor_approve");
  const vendorId = requireVendor(principal);
  return json(res, 200, { stories: runtime.content.stories({ marketId: MARKET_ID, vendorId }) });
}

function vendorApproveStory(req: IncomingMessage, res: ServerResponse, storyId: string) {
  const principal = requirePermission(req, "content.vendor_approve", true);
  const vendorId = requireVendor(principal);
  const before = runtime.content.stories({ vendorId }).find((story) => story.id === storyId);
  if (!before) throw new Error("Merchant story not found for this vendor");
  const story = runtime.content.approveStory({ storyId, vendorId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.story_vendor_approved", entityType: "merchant_story", entityId: story.id, reason: "vendor approved editorial story", before, after: story, createdAt: Date.now() });
  return json(res, 200, story);
}

function adminContent(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "content.read");
  return json(res, 200, {
    pages: runtime.content.pages({ marketId: MARKET_ID }).map((page) => ({ ...page, revisions: runtime.content.revisions(page.id).map((revision) => ({ id: revision.id, version: revision.version, actorId: revision.actorId, reason: revision.reason, createdAt: revision.createdAt })) })),
    stories: runtime.content.stories({ marketId: MARKET_ID }),
    collections: runtime.content.collections({ marketId: MARKET_ID }),
    navigation: ["el", "en"].flatMap((locale) => ["primary", "footer"].flatMap((key) => {
      const menu = runtime.content.navigation(MARKET_ID, key as any, locale as any);
      return menu ? [menu] : [];
    })),
    redirects: runtime.content.redirects(MARKET_ID),
    sitemapEntries: contentSitemap({ pages: runtime.content.pages({ marketId: MARKET_ID }), stories: runtime.content.stories({ marketId: MARKET_ID, status: "published" }), collections: runtime.content.collections({ marketId: MARKET_ID, status: "published" }), now: Date.now() })
  });
}

async function adminCreateContentPage(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const page = runtime.content.createPage({ marketId: MARKET_ID, pageType: contentPageType(body.pageType), slug: String(body.slug ?? ""), translations: contentTranslations(body), actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.page_created", entityType: "cms_page", entityId: page.id, reason: "CMS page created", after: page, createdAt: Date.now() });
  return json(res, 201, page);
}

async function adminUpdateContentPage(req: IncomingMessage, res: ServerResponse, pageId: string) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const before = runtime.content.page(pageId);
  const page = runtime.content.updatePage({ pageId, translations: contentTranslations(body), pageType: body.pageType ? contentPageType(body.pageType) : undefined, actorId: principal.userId, reason: String(body.reason ?? "CMS content updated"), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.page_updated", entityType: "cms_page", entityId: page.id, reason: String(body.reason ?? "CMS content updated"), before, after: page, createdAt: Date.now() });
  return json(res, 200, page);
}

async function adminPublishContentPage(req: IncomingMessage, res: ServerResponse, pageId: string) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const before = runtime.content.page(pageId);
  const scheduledAt = body.scheduledAt ? new Date(String(body.scheduledAt)).getTime() : undefined;
  if (scheduledAt !== undefined && !Number.isFinite(scheduledAt)) throw new Error("Scheduled publication date is invalid");
  const page = runtime.content.publishPage({ pageId, actorId: principal.userId, now: Date.now(), scheduledAt });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: page.status === "scheduled" ? "content.page_scheduled" : "content.page_published", entityType: "cms_page", entityId: page.id, reason: "CMS publication workflow", before, after: page, createdAt: Date.now() });
  return json(res, 200, page);
}

async function adminArchiveContentPage(req: IncomingMessage, res: ServerResponse, pageId: string) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const before = runtime.content.page(pageId);
  const page = runtime.content.archivePage({ pageId, actorId: principal.userId, reason, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.page_archived", entityType: "cms_page", entityId: page.id, reason, before, after: page, createdAt: Date.now() });
  return json(res, 200, page);
}

async function adminSetNavigation(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  if (!Array.isArray(body.items)) throw new Error("Navigation items must be an array");
  const menu = runtime.content.setNavigation({ marketId: MARKET_ID, key: body.key === "footer" ? "footer" : body.key === "merchant" ? "merchant" : "primary", locale: body.locale === "en" ? "en" : "el", items: body.items, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.navigation_updated", entityType: "navigation", entityId: menu.id, reason: `${menu.key}/${menu.locale} navigation updated`, after: menu, createdAt: Date.now() });
  return json(res, 200, menu);
}

async function adminCreateRedirect(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const statusCode = [301,302,307,308].includes(Number(body.statusCode)) ? Number(body.statusCode) as 301|302|307|308 : 301;
  const redirect = runtime.content.addRedirect({ marketId: MARKET_ID, fromPath: String(body.fromPath ?? ""), toPath: String(body.toPath ?? ""), statusCode, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.redirect_created", entityType: "redirect", entityId: redirect.id, reason: `${redirect.fromPath} -> ${redirect.toPath}`, after: redirect, createdAt: Date.now() });
  return json(res, 201, redirect);
}

async function adminCreateStory(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const vendorId = String(body.vendorId ?? "");
  if (!publicVendors().some((vendor: any) => vendor.id === vendorId)) throw new Error("Merchant story vendor not found");
  const story = runtime.content.createStory({ marketId: MARKET_ID, vendorId, slug: String(body.slug ?? ""), locale: body.locale === "en" ? "en" : "el", title: String(body.title ?? ""), excerpt: String(body.excerpt ?? ""), blocks: Array.isArray(body.blocks) ? body.blocks : [{ id: `story-${Date.now()}`, type: "shop_story", data: { text: String(body.body ?? body.excerpt ?? "") } }], seo: { title: String(body.seoTitle ?? body.title ?? ""), description: String(body.seoDescription ?? body.excerpt ?? ""), noindex: Boolean(body.noindex) }, authorLabel: String(body.authorLabel ?? "Buy Local Sparta editorial"), now: Date.now() });
  const review = runtime.content.requestStoryApproval(story.id, Date.now());
  runtime.notificationOrchestrator.emit({ vendorId, eventType: "content.story_approval_requested", title: "Ιστορία καταστήματος για έγκριση", body: `Η ιστορία «${review.title}» περιμένει την έγκρισή σας πριν δημοσιευθεί.`, payload: { storyId: review.id }, dedupeKey: `story-review:${review.id}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.story_created", entityType: "merchant_story", entityId: story.id, reason: "story sent to vendor approval", after: review, createdAt: Date.now() });
  return json(res, 201, review);
}

function adminPublishStory(req: IncomingMessage, res: ServerResponse, storyId: string) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const before = runtime.content.stories({ marketId: MARKET_ID }).find((story) => story.id === storyId);
  const story = runtime.content.publishStory({ storyId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.story_published", entityType: "merchant_story", entityId: story.id, reason: "vendor-approved merchant story published", before, after: story, createdAt: Date.now() });
  return json(res, 200, story);
}

async function adminCreateCollection(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const body = await readJson(req);
  const variantIds = Array.isArray(body.canonicalVariantIds) ? body.canonicalVariantIds.map(String) : [];
  for (const variantId of variantIds) if (!runtime.catalog.canonical(variantId)) throw new Error(`Canonical product ${variantId} not found`);
  const collection = runtime.content.createCollection({ marketId: MARKET_ID, slug: String(body.slug ?? ""), locale: body.locale === "en" ? "en" : "el", title: String(body.title ?? ""), description: body.description ? String(body.description) : undefined, canonicalVariantIds: variantIds, seo: { title: String(body.seoTitle ?? body.title ?? ""), description: String(body.seoDescription ?? body.description ?? body.title ?? ""), noindex: Boolean(body.noindex) }, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.collection_created", entityType: "product_collection", entityId: collection.id, reason: "curated canonical collection created", after: collection, createdAt: Date.now() });
  return json(res, 201, collection);
}

function adminPublishCollection(req: IncomingMessage, res: ServerResponse, collectionId: string) {
  const principal = requirePlatformPermission(req, "content.write", true);
  const collection = runtime.content.publishCollection({ collectionId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "content.collection_published", entityType: "product_collection", entityId: collection.id, reason: "curated collection published", after: collection, createdAt: Date.now() });
  return json(res, 200, collection);
}

function contentPageType(value: unknown): "home"|"standard"|"landing"|"legal"|"local_landing" {
  return new Set(["home","standard","landing","legal","local_landing"]).has(String(value)) ? String(value) as any : "standard";
}

function contentTranslations(body: any) {
  if (Array.isArray(body.translations)) return body.translations;
  const title = String(body.title ?? "");
  const description = String(body.seoDescription ?? body.description ?? title);
  const blocks = Array.isArray(body.blocks) ? body.blocks : [{ id: `block-${Date.now()}`, type: "rich_text", data: { heading: title, body: String(body.body ?? body.description ?? "") } }];
  const result: any[] = [{ locale: "el", title, seo: { title: String(body.seoTitle ?? title), description, noindex: Boolean(body.noindex) }, blocks }];
  if (body.titleEn) result.push({ locale: "en", title: String(body.titleEn), seo: { title: String(body.seoTitleEn ?? body.titleEn), description: String(body.seoDescriptionEn ?? body.descriptionEn ?? body.titleEn), noindex: Boolean(body.noindexEn) }, blocks: Array.isArray(body.blocksEn) ? body.blocksEn : [{ id: `block-en-${Date.now()}`, type: "rich_text", data: { heading: String(body.titleEn), body: String(body.bodyEn ?? body.descriptionEn ?? "") } }] });
  return result;
}

function vendorProfile(res: ServerResponse, vendorId: string) {
  const vendor = publicVendors().find((entry: any) => entry.id === vendorId);
  if (!vendor) throw new Error("Vendor not found");
  const products = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true })
    .filter((product) => runtime.commerce.offersForVariant(product.id).some((offer) => offer.vendorId === vendorId))
    .map((product) => ({ id: product.id, title: product.titleEl, formattedPrice: formatMoney(product.platformPrice), category: categoryLabel(product.categoryCode) }));
  return json(res, 200, { ...vendor, products, demoData: vendor.demoData ?? false });
}

function publicVendors() {
  const onboarded = runtime.vendorRegistry.all()
    .filter((application) => application.state === "active" && application.vendorId)
    .map((application) => ({
      id: application.vendorId!,
      name: application.tradingName,
      adviser: application.tradingName,
      adviserId: `adviser-${application.vendorId}`,
      category: application.primaryCategory,
      story: application.shopStory ?? `${application.tradingName} is a verified local merchant onboarding through Buy Local Sparta.`,
      expertise: [application.primaryCategory],
      area: `${application.address}, ${application.postcode}`,
      hours: "Merchant hours pending storefront configuration",
      verified: true,
      demoData: false
    }));
  return [...demoVendors.map((vendor) => ({ ...vendor, demoData: true })), ...onboarded].map((vendor) => {
    const locations = runtime.vendorLocations.forVendor(vendor.id, true);
    const primary = runtime.vendorLocations.primary(vendor.id);
    const locationId = primary?.id ?? `loc-${vendor.id}`;
    let openingStatus: ReturnType<typeof runtime.tradingCalendar.status> | undefined;
    try { openingStatus = runtime.tradingCalendar.status(locationId, Date.now()); } catch { /* onboarding schedule may still be pending */ }
    return { ...vendor, locationId, locations, openNow: openingStatus?.open ?? false, closesAt: openingStatus?.closesAt, nextOpenAt: openingStatus?.nextOpenAt, serviceModes: [
      "pickup",
      ...(runtime.deliveryCoverage.zones({ vendorId: vendor.id, mode: "local_delivery" }).length ? ["local_delivery"] : []),
      ...(runtime.deliveryCoverage.zones({ vendorId: vendor.id, mode: "shipping" }).length ? ["shipping"] : [])
    ] };
  });
}

function vendorAvailability(res: ServerResponse, vendorId: string, url: URL) {
  const vendor = publicVendors().find((entry: any) => entry.id === vendorId);
  if (!vendor) throw new Error("Vendor not found");
  const locationId = vendor.locationId ?? `loc-${vendorId}`;
  const at = Number(url.searchParams.get("at") ?? Date.now());
  if (!Number.isFinite(at)) throw new Error("Invalid availability timestamp");
  const schedule = runtime.tradingCalendar.schedule(locationId);
  if (!schedule) return json(res, 200, { vendorId, locationId, scheduleConfigured: false, status: { open: false, reason: "Merchant hours pending configuration" }, pickupWindows: [], deliveryZones: runtime.deliveryCoverage.zones({ vendorId }) });
  const status = runtime.tradingCalendar.status(locationId, at);
  const pickupWindows = runtime.tradingCalendar.pickupWindows({ locationId, earliestAt: at, preparationMs: 30 * 60_000, durationMs: 30 * 60_000, limit: 12 });
  return json(res, 200, { vendorId, locationId, scheduleConfigured: true, schedule, status, pickupWindows, deliveryZones: runtime.deliveryCoverage.zones({ vendorId }) });
}

function productAdviceWindows(req: IncomingMessage, res: ServerResponse, variantId: string, url: URL) {
  const visitorKey = ensureVisitor(req, res);
  const postcode = url.searchParams.get("postcode") ?? "23100";
  const durationMinutes = Math.min(120, Math.max(15, Number(url.searchParams.get("durationMinutes") ?? 30)));
  const variant = runtime.commerce.variant(variantId);
  if (!variant) throw new Error("Product not found");
  const now = Date.now();
  const assignment = runtime.fairness.select({ marketId: variant.marketId, canonicalVariantId: variant.id, visitorKey, postcode, desiredFulfilment: "pickup", reason: "appointment", now }, liveOffers(variantId, postcode, "pickup"));
  const vendor = publicVendors().find((entry: any) => entry.id === assignment.vendorId);
  if (!vendor) throw new Error("Assigned local adviser not found");
  const windows = runtime.tradingCalendar.pickupWindows({ locationId: assignment.locationId, earliestAt: now, preparationMs: 30 * 60_000, durationMs: durationMinutes * 60_000, stepMinutes: 30, horizonDays: 7, limit: 16 });
  return json(res, 200, { localPartner: vendor, durationMinutes, windows });
}

async function registerCustomer(req: IncomingMessage, res: ServerResponse) {
  assertRequestRateLimit(req, "register", RATE_LIMITS.register);
  const body = await readJson(req);
  const now = Date.now();
  const account = runtime.auth.register({
    email: String(body.email ?? ""),
    password: String(body.password ?? ""),
    roles: ["customer"],
    status: "pending_verification",
    emailVerified: false,
    now
  });
  const verificationToken = runtime.auth.createEmailVerification(account.id, now);
  runtime.outbox.enqueue({
    type: "identity.email_verification_requested",
    aggregateType: "user",
    aggregateId: account.id,
    payload: { userId: account.id, email: account.email },
    idempotencyKey: `verify-email:${account.id}:${now}`,
    now
  });
  return json(res, 201, {
    account,
    verificationRequired: true,
    developmentVerificationToken: verificationToken,
    developmentNote: "In production this token is delivered through the transactional email provider, never displayed in the UI."
  });
}

async function verifyEmail(req: IncomingMessage, res: ServerResponse) {
  assertRequestRateLimit(req, "verify-email", RATE_LIMITS.verify);
  const body = await readJson(req);
  const account = runtime.auth.verifyEmail(String(body.token ?? ""), Date.now());
  return json(res, 200, { account, verified: true });
}

async function login(req: IncomingMessage, res: ServerResponse) {
  assertRequestRateLimit(req, "login-ip", RATE_LIMITS.loginIp);
  const body = await readJson(req);
  const loginEmail = String(body.email ?? "").trim().toLowerCase();
  assertRateLimitKey(`login-identity:${hashAbuseKey(loginEmail || "empty")}`, RATE_LIMITS.loginIdentity);
  const loginResult = runtime.auth.authenticate({ email: loginEmail, password: String(body.password ?? ""), now: Date.now() });
  appendCookie(res, `${SESSION_COOKIE}=${encodeURIComponent(loginResult.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor((loginResult.expiresAt - Date.now()) / 1000)}${SECURE_COOKIES ? "; Secure" : ""}; Priority=High`);
  return json(res, 200, { principal: loginResult.principal, expiresAt: loginResult.expiresAt });
}

function me(req: IncomingMessage, res: ServerResponse) {
  const principal = currentPrincipal(req);
  return json(res, 200, { authenticated: Boolean(principal), principal });
}

async function logout(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  runtime.auth.logout(cookie(req, SESSION_COOKIE));
  appendCookie(res, `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_COOKIES ? "; Secure" : ""}; Priority=High`);
  return json(res, 200, { ok: true });
}

function getCart(req: IncomingMessage, res: ServerResponse, url: URL) {
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const mode = url.searchParams.get("fulfilmentMode");
  const fulfilmentMode = mode === "shipping" || mode === "local_delivery" || mode === "pickup" ? mode : undefined;
  const cart = runtime.cart.getOrCreate({ marketId: MARKET_ID, visitorKey, postcode: url.searchParams.get("postcode") ?? "23100", fulfilmentMode, userId: principal?.userId, now: Date.now() });
  return json(res, 200, decorateCart(cart));
}

async function addCartItem(req: IncomingMessage, res: ServerResponse) {
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const body = await readJson(req);
  const fulfilmentMode = body.fulfilmentMode === "shipping" || body.fulfilmentMode === "local_delivery" || body.fulfilmentMode === "pickup" ? body.fulfilmentMode : undefined;
  const cart = runtime.cart.getOrCreate({ marketId: MARKET_ID, visitorKey, postcode: String(body.postcode ?? "23100"), fulfilmentMode, userId: principal?.userId, now: Date.now() });
  const updated = runtime.cart.add({ cartId: cart.id, canonicalVariantId: String(body.canonicalVariantId ?? ""), quantity: Number(body.quantity ?? 1), now: Date.now() });
  runtime.outbox.enqueue({ type: "cart.item_added", aggregateType: "cart", aggregateId: cart.id, payload: { canonicalVariantId: body.canonicalVariantId }, idempotencyKey: `cart-add:${cart.id}:${body.canonicalVariantId}:${updated.updatedAt}`, now: Date.now() });
  const addedItem = updated.items.find((item) => item.canonicalVariantId === String(body.canonicalVariantId));
  const addedCanonical = runtime.catalog.canonical(String(body.canonicalVariantId));
  if (addedItem) runtime.analytics.record({ eventName: "cart.item_added", marketId: MARKET_ID, visitorKey, customerId: principal?.userId, vendorId: addedItem.vendorId, canonicalVariantId: addedItem.canonicalVariantId, quantity: Number(body.quantity ?? 1), metadata: { categoryCode: addedCanonical?.categoryCode }, now: Date.now() });
  return json(res, 201, decorateCart(updated));
}

function quoteCouponForCart(cart: ReturnType<typeof runtime.cart.get>, code: string, now: number) {
  const items = cart.items.map((item) => {
    const variant = runtime.commerce.variant(item.canonicalVariantId);
    const canonical = runtime.catalog.canonical(item.canonicalVariantId);
    if (!variant || !canonical) throw new Error("Cart references unknown canonical product");
    const price = runtime.retailPricing.resolve(item.canonicalVariantId, now);
    return {
      lineKey: item.id, canonicalVariantId: item.canonicalVariantId, categoryCode: canonical.categoryCode,
      unitPrice: item.retailUnitPriceOverride ?? price.currentPrice, quantity: item.quantity,
      pricingSource: item.retailUnitPriceOverride ? "private_offer" as const : price.source
    };
  });
  return runtime.coupons.quote({ marketId: cart.marketId, code, items, subjectKey: cart.userId ?? `visitor:${cart.visitorKey}`, now });
}

async function applyCartCoupon(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const visitorKey = ensureVisitor(req, res);
  const cart = runtime.cart.forVisitor(MARKET_ID, visitorKey);
  if (!cart) throw new Error("Cart not found");
  const code = String(body.code ?? "").trim();
  if (!code) throw new Error("Coupon code is required");
  quoteCouponForCart(cart, code, Date.now());
  const updated = runtime.cart.setCoupon({ cartId: cart.id, couponCode: code, now: Date.now() });
  return json(res, 200, decorateCart(updated));
}

function clearCartCoupon(req: IncomingMessage, res: ServerResponse) {
  const visitorKey = ensureVisitor(req, res);
  const cart = runtime.cart.forVisitor(MARKET_ID, visitorKey);
  if (!cart) throw new Error("Cart not found");
  return json(res, 200, decorateCart(runtime.cart.setCoupon({ cartId: cart.id, now: Date.now() })));
}

async function updateCartItem(req: IncomingMessage, res: ServerResponse, itemId: string) {
  const body = await readJson(req);
  const visitorKey = ensureVisitor(req, res);
  const cart = runtime.cart.forVisitor(MARKET_ID, visitorKey);
  if (!cart) throw new Error("Cart not found");
  return json(res, 200, decorateCart(runtime.cart.setQuantity({ cartId: cart.id, itemId, quantity: Number(body.quantity), now: Date.now() })));
}

function deleteCartItem(req: IncomingMessage, res: ServerResponse, itemId: string) {
  const visitorKey = ensureVisitor(req, res);
  const cart = runtime.cart.forVisitor(MARKET_ID, visitorKey);
  if (!cart) throw new Error("Cart not found");
  return json(res, 200, decorateCart(runtime.cart.remove({ cartId: cart.id, itemId, now: Date.now() })));
}

function decorateCart(cart: ReturnType<typeof runtime.cart.get>) {
  const items = cart.items.map((item) => {
    const variant = runtime.commerce.variant(item.canonicalVariantId);
    const canonical = runtime.catalog.canonical(item.canonicalVariantId);
    if (!variant || !canonical) throw new Error("Cart references unknown canonical product");
    const vendor = publicVendors().find((entry: any) => entry.id === item.vendorId);
    const priceResolution = runtime.retailPricing.resolve(variant.id, Date.now());
    const unitPrice = item.retailUnitPriceOverride ?? priceResolution.currentPrice;
    const complianceCleared = runtime.trust.documents({ canonicalVariantId: canonical.id }).some((document) => document.status === "verified") && !runtime.trust.notices(canonical.id).some((notice) => notice.status === "open" && (notice.type === "recall" || notice.type === "compliance_hold"));
    const checkoutRequirement = runtime.categoryGovernance.decide({ categoryCode: canonical.categoryCode, action: "checkout", fulfilmentMode: cart.fulfilmentMode, compatibilityConfirmed: false, complianceCleared });
    return {
      ...item,
      title: canonical.titleEl,
      unitPrice,
      formattedUnitPrice: formatMoney(unitPrice),
      localPartner: vendor?.name ?? item.vendorId,
      categoryCode: canonical.categoryCode,
      attributes: canonical.identity.attributes,
      checkoutRequirement,
      pricingSource: item.retailUnitPriceOverride ? "private_offer" : priceResolution.source,
      promotion: !item.retailUnitPriceOverride && priceResolution.source === "promotion" ? { id: priceResolution.promotionId, name: priceResolution.promotionName, priorPrice: priceResolution.priorPrice, formattedPriorPrice: priceResolution.priorPrice ? formatMoney(priceResolution.priorPrice) : undefined, endsAt: priceResolution.endsAt } : undefined,
      specialOffer: Boolean(item.retailUnitPriceOverride)
    };
  });
  const merchandiseMinor = items.reduce((sum, item) => sum + item.unitPrice.minor * item.quantity, 0);
  const groups = new Map<string, { vendorId: string; locationId: string; subtotalMinor: number }>();
  for (const item of items) {
    const key = `${item.vendorId}:${item.locationId}`;
    const group = groups.get(key) ?? { vendorId: item.vendorId, locationId: item.locationId, subtotalMinor: 0 };
    group.subtotalMinor += item.unitPrice.minor * item.quantity;
    groups.set(key, group);
  }
  const now = Date.now();
  const deliveryIssues: Array<{ vendorId: string; locationId?: string; mode: string; postcode: string; reason: string }> = [];
  const deliveryQuotes = [...groups.values()].flatMap((group) => {
    const locationId = group.locationId;
    const serviceable = runtime.deliveryCoverage.canServe({ vendorId: group.vendorId, locationId, context: { marketId: cart.marketId, postcode: cart.postcode, fulfilmentMode: cart.fulfilmentMode, now } });
    if (!serviceable) {
      deliveryIssues.push({ vendorId: group.vendorId, locationId, mode: cart.fulfilmentMode, postcode: cart.postcode, reason: "Assigned merchant location cannot serve this fulfilment method/postcode" });
      return [];
    }
    return [runtime.deliveryPricing.quote({
      marketId: cart.marketId,
      vendorId: group.vendorId,
      mode: cart.fulfilmentMode,
      postcode: cart.postcode,
      merchandiseSubtotal: money(group.subtotalMinor),
      packageCount: 1,
      now
    })];
  });
  const deliveryMinor = deliveryQuotes.reduce((sum, quote) => sum + quote.customerCharge.minor, 0);
  const merchandiseSubtotal = money(merchandiseMinor);
  const deliveryCharge = money(deliveryMinor);
  let couponQuote: ReturnType<typeof runtime.coupons.quote> | undefined;
  let couponIssue: string | undefined;
  if (cart.couponCode) {
    try { couponQuote = quoteCouponForCart(cart, cart.couponCode, now); } catch (error) { couponIssue = error instanceof Error ? error.message : "Coupon is not valid"; }
  }
  const discount = couponQuote?.discount ?? money(0);
  const total = money(merchandiseMinor + deliveryMinor - discount.minor);
  const commerceIssues = items.filter((item) => !item.checkoutRequirement.allowed && item.checkoutRequirement.code !== "compatibility_confirmation_required").map((item) => ({ canonicalVariantId: item.canonicalVariantId, title: item.title, ...item.checkoutRequirement }));
  const compatibilityRequirements = items.filter((item) => item.checkoutRequirement.code === "compatibility_confirmation_required").map((item) => ({ canonicalVariantId: item.canonicalVariantId, title: item.title, message: item.checkoutRequirement.message }));
  return {
    ...cart,
    items,
    merchandiseSubtotal,
    formattedMerchandiseSubtotal: formatMoney(merchandiseSubtotal),
    deliveryCharge,
    formattedDeliveryCharge: formatMoney(deliveryCharge),
    coupon: couponQuote ? { ...couponQuote, formattedDiscount: formatMoney(couponQuote.discount), formattedEligibleSubtotal: formatMoney(couponQuote.eligibleSubtotal) } : undefined,
    couponCode: cart.couponCode,
    couponIssue,
    discount,
    formattedDiscount: formatMoney(discount),
    deliveryQuotes,
    deliveryIssues,
    commerceIssues,
    compatibilityRequirements,
    checkoutBlocked: deliveryIssues.length > 0 || commerceIssues.length > 0 || Boolean(couponIssue),
    total,
    formattedTotal: formatMoney(total)
  };
}

async function checkout(req: IncomingMessage, res: ServerResponse) {
  const body = await readJson(req);
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const cart = body.cartId ? runtime.cart.get(String(body.cartId)) : runtime.cart.forVisitor(MARKET_ID, visitorKey);
  const items = cart?.items.length
    ? cart.items.map((item) => ({
        canonicalVariantId: item.canonicalVariantId,
        quantity: item.quantity,
        lockedOfferId: item.retailUnitPriceOverride ? item.assignedOfferId : undefined,
        retailUnitPriceOverride: item.retailUnitPriceOverride,
        sourceReference: item.sourceReference
      }))
    : Array.isArray(body.items) ? body.items.map((item: any) => ({ canonicalVariantId: String(item.canonicalVariantId), quantity: Number(item.quantity) })) : [];
  const compatibilityConfirmed = new Set(Array.isArray(body.compatibilityConfirmedVariantIds) ? body.compatibilityConfirmedVariantIds.map(String) : []);
  for (const item of items) {
    const canonical = runtime.catalog.canonical(item.canonicalVariantId);
    if (!canonical) throw new Error("Canonical product not found");
    const complianceCleared = runtime.trust.documents({ canonicalVariantId: canonical.id }).some((document) => document.status === "verified") && !runtime.trust.notices(canonical.id).some((notice) => notice.status === "open" && (notice.type === "recall" || notice.type === "compliance_hold"));
    const decision = runtime.categoryGovernance.decide({ categoryCode: canonical.categoryCode, action: "checkout", fulfilmentMode: body.fulfilmentMode === "shipping" || body.fulfilmentMode === "local_delivery" ? body.fulfilmentMode : cart?.fulfilmentMode ?? "pickup", compatibilityConfirmed: compatibilityConfirmed.has(canonical.id), complianceCleared });
    if (!decision.allowed) throw new Error(`${decision.code}: ${decision.message}`);
  }
  const checkoutNow = Date.now();
  const couponQuote = cart?.couponCode ? quoteCouponForCart(cart, cart.couponCode, checkoutNow) : undefined;
  const couponSubjectKey = principal?.userId ?? `visitor:${visitorKey}`;
  const order = runtime.commerce.checkout({
    checkoutKey: String(body.checkoutKey ?? `web-${Date.now()}-${randomBytes(4).toString("hex")}`),
    visitorKey,
    customerId: principal?.userId,
    postcode: String(body.postcode ?? cart?.postcode ?? "23100"),
    fulfilmentMode: body.fulfilmentMode === "shipping" || body.fulfilmentMode === "local_delivery" ? body.fulfilmentMode : cart?.fulfilmentMode ?? "pickup",
    now: checkoutNow,
    items,
    discount: couponQuote ? { amount: couponQuote.discount, sourceReference: `coupon:${couponQuote.couponId}:v${couponQuote.ruleVersion}`, allocations: couponQuote.allocations.map((allocation) => ({ canonicalVariantId: allocation.canonicalVariantId, amount: allocation.amount })) } : undefined
  });
  if (couponQuote) {
    try { runtime.coupons.redeem({ quote: couponQuote, orderId: order.id, subjectKey: couponSubjectKey, now: checkoutNow }); }
    catch (error) { runtime.commerce.cancelOrder({ orderId: order.id, reason: "Coupon redemption failed after authorization", idempotencyKey: `coupon-rollback:${order.id}`, now: checkoutNow }); throw error; }
  }
  runtime.orderOperations.registerOrder(order, Date.now());
  runtime.outbox.enqueue({ type: "checkout.authorised", aggregateType: "order", aggregateId: order.id, payload: { orderId: order.id, totalMinor: order.total.minor }, idempotencyKey: `checkout-authorised:${order.id}`, now: Date.now() });
  if (principal) runtime.notificationOrchestrator.emit({ userId: principal.userId, eventType: "order.authorised", title: "Η παραγγελία σου δημιουργήθηκε", body: `Παραγγελία ${order.id} · ${formatMoney(order.total)}`, payload: { orderId: order.id }, dedupeKey: `customer-order:${order.id}:authorised`, now: Date.now() });
  for (const fulfilment of order.fulfilments) runtime.notificationOrchestrator.emit({ vendorId: fulfilment.vendorId, eventType: "fulfilment.created", title: "Νέα παραγγελία για προετοιμασία", body: `Fulfilment ${fulfilment.id} για την παραγγελία ${order.id}`, payload: { orderId: order.id, fulfilmentId: fulfilment.id }, dedupeKey: `vendor-fulfilment:${fulfilment.id}:created`, now: Date.now() });
  runtime.analytics.record({ eventName: "checkout.authorised", marketId: MARKET_ID, visitorKey, customerId: principal?.userId, orderId: order.id, valueMinor: order.total.minor, quantity: order.lines.reduce((sum, line) => sum + line.quantity, 0), metadata: { fulfilmentMode: order.fulfilmentMode, vendorCount: order.fulfilments.length, multiVendor: order.fulfilments.length > 1 }, dedupeKey: `analytics-checkout:${order.id}`, now: Date.now() });
  for (const fulfilment of order.fulfilments) {
    const vendorLines = order.lines.filter((line) => line.vendorId === fulfilment.vendorId);
    const vendorPaidMerchandiseMinor = vendorLines.reduce((sum, line) => sum + (line.retailUnitPrice.minor * line.quantity) - line.discountAllocation.minor, 0);
    runtime.analytics.record({ eventName: "order.vendor_attributed", marketId: MARKET_ID, visitorKey, customerId: principal?.userId, vendorId: fulfilment.vendorId, orderId: order.id, valueMinor: vendorPaidMerchandiseMinor, quantity: vendorLines.reduce((sum, line) => sum + line.quantity, 0), metadata: { fulfilmentMode: order.fulfilmentMode }, dedupeKey: `analytics-order-vendor:${order.id}:${fulfilment.vendorId}`, now: Date.now() });
  }
  if (cart) runtime.cart.clear(cart.id, Date.now());
  return json(res, 201, { order, payment: runtime.payments.get(order.paymentId) });
}

function accountReviews(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { reviews: runtime.reviews.forCustomer(principal.userId) });
}

async function submitOrderReview(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  assertAuthenticatedRateLimit(req, "review-submit", RATE_LIMITS.reviews);
  const body = await readJson(req);
  const incentiveType = ["none", "discount", "gift", "other"].includes(String(body.incentiveType)) ? body.incentiveType : "none";
  const review = runtime.reviews.submitOrderReview({
    marketId: MARKET_ID, customerId: principal.userId, orderId: String(body.orderId ?? ""), orderLineId: String(body.orderLineId ?? ""),
    rating: Number(body.rating), body: body.body ? String(body.body) : undefined, incentiveType,
    incentiveDetails: body.incentiveDetails ? String(body.incentiveDetails) : undefined, now: Date.now()
  });
  runtime.notificationOrchestrator.emit({ vendorId: review.vendorId, eventType: "review.received", title: "Νέα επαληθευμένη αξιολόγηση", body: `${review.rating}/5 · ${review.interactionType === "verified_order" ? "επαληθευμένη αγορά" : "επαληθευμένη συμβουλή"}`, payload: { reviewId: review.id, canonicalVariantId: review.canonicalVariantId }, dedupeKey: `review-received:${review.id}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "review.submitted", entityType: "review", entityId: review.id, reason: review.interactionType, after: { rating: review.rating, vendorId: review.vendorId, canonicalVariantId: review.canonicalVariantId, incentiveType: review.incentiveType }, createdAt: Date.now() });
  return json(res, 201, review);
}

async function submitAdviceReview(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  assertAuthenticatedRateLimit(req, "review-submit", RATE_LIMITS.reviews);
  const body = await readJson(req);
  const incentiveType = ["none", "discount", "gift", "other"].includes(String(body.incentiveType)) ? body.incentiveType : "none";
  const review = runtime.reviews.submitAdviceReview({
    marketId: MARKET_ID, customerId: principal.userId, conversationId: body.conversationId ? String(body.conversationId) : undefined,
    appointmentId: body.appointmentId ? String(body.appointmentId) : undefined, rating: Number(body.rating), body: body.body ? String(body.body) : undefined,
    incentiveType, incentiveDetails: body.incentiveDetails ? String(body.incentiveDetails) : undefined, now: Date.now()
  });
  runtime.notificationOrchestrator.emit({ vendorId: review.vendorId, eventType: "review.received", title: "Νέα επαληθευμένη αξιολόγηση συμβουλής", body: `${review.rating}/5 · επαληθευμένη συμβουλή`, payload: { reviewId: review.id, canonicalVariantId: review.canonicalVariantId }, dedupeKey: `review-received:${review.id}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "review.submitted", entityType: "review", entityId: review.id, reason: review.interactionType, after: { rating: review.rating, vendorId: review.vendorId, canonicalVariantId: review.canonicalVariantId, incentiveType: review.incentiveType }, createdAt: Date.now() });
  return json(res, 201, review);
}

function accountSavedProducts(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const items = runtime.personalization.savedProducts(principal.userId).map((saved) => {
    const canonical = runtime.catalog.canonical(saved.canonicalVariantId);
    if (!canonical) return { ...saved, unavailable: true };
    const price = runtime.retailPricing.resolve(canonical.id, Date.now());
    return { ...saved, title: canonical.titleEl, categoryCode: canonical.categoryCode, price: price.currentPrice, formattedPrice: formatMoney(price.currentPrice), available: Boolean(runtime.search.document(canonical.id)?.available) && canonical.active && !canonical.suppressed && !canonical.recalled, alert: runtime.savedProductAlerts.preference(principal.userId, canonical.id) ?? null };
  });
  return json(res, 200, { products: items });
}


function savedSearchQueryFromBody(body: Record<string, any>) {
  const availability = body.availability === "pickup_today" ? "pickup_today" : body.availability === "in_stock" ? "in_stock" : "any";
  const attributeFilters: Record<string, string | readonly string[]> = {};
  if (body.attributeFilters && typeof body.attributeFilters === "object" && !Array.isArray(body.attributeFilters)) {
    for (const [code, value] of Object.entries(body.attributeFilters)) {
      if (Array.isArray(value)) attributeFilters[code] = value.map(String);
      else if (value !== null && value !== undefined) attributeFilters[code] = String(value);
    }
  }
  return {
    q: String(body.q ?? ""), availability, adviceOnly: Boolean(body.adviceOnly),
    minPriceMinor: body.minPriceMinor === undefined || body.minPriceMinor === null ? undefined : Number(body.minPriceMinor),
    maxPriceMinor: body.maxPriceMinor === undefined || body.maxPriceMinor === null ? undefined : Number(body.maxPriceMinor),
    categoryCode: body.categoryCode ? String(body.categoryCode) : undefined,
    attributeFilters
  } as const;
}

function savedSearchMatches(query: ReturnType<typeof savedSearchQueryFromBody>): readonly string[] {
  return runtime.search.search({ marketId: MARKET_ID, type: "product", ...query, limit: 100 }).map((hit) => hit.document.id);
}

function accountSavedSearches(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const events = runtime.savedSearches.eventsForUser(principal.userId);
  const searches = runtime.savedSearches.forUser(principal.userId).map((saved) => {
    const currentIds = savedSearchMatches(saved.query as ReturnType<typeof savedSearchQueryFromBody>);
    return { ...saved, currentResultCount: currentIds.length, newMatchEvents: events.filter((event) => event.savedSearchId === saved.id).slice(0, 10) };
  });
  return json(res, 200, { searches, events });
}

async function accountCreateSavedSearch(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const query = savedSearchQueryFromBody(body);
  const currentCanonicalVariantIds = savedSearchMatches(query);
  const item = runtime.savedSearches.create({ userId: principal.userId, marketId: MARKET_ID, name: body.name ? String(body.name) : undefined, query, alertsEnabled: body.alertsEnabled !== false, currentCanonicalVariantIds, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.search_saved", entityType: "saved_search", entityId: item.id, after: { query: item.query, alertsEnabled: item.alertsEnabled }, createdAt: Date.now() });
  return json(res, 201, { savedSearch: item, currentResultCount: currentCanonicalVariantIds.length });
}

async function accountUpdateSavedSearch(req: IncomingMessage, res: ServerResponse, searchId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const current = runtime.savedSearches.get(searchId);
  if (!current || current.userId !== principal.userId) throw new Error("Saved search not found");
  const body = await readJson(req);
  const currentCanonicalVariantIds = savedSearchMatches(current.query as ReturnType<typeof savedSearchQueryFromBody>);
  const item = runtime.savedSearches.configure({ searchId, userId: principal.userId, alertsEnabled: body.alertsEnabled !== false, currentCanonicalVariantIds, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.saved_search_alert_updated", entityType: "saved_search", entityId: item.id, after: { alertsEnabled: item.alertsEnabled }, createdAt: Date.now() });
  return json(res, 200, { savedSearch: item, currentResultCount: currentCanonicalVariantIds.length });
}

function accountDeleteSavedSearch(req: IncomingMessage, res: ServerResponse, searchId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return json(res, 200, { removed: runtime.savedSearches.remove({ searchId, userId: principal.userId }) });
}

function accountSaveProduct(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  if (!runtime.catalog.canonical(canonicalVariantId)) throw new Error("Canonical product not found");
  const item = runtime.personalization.saveProduct(principal.userId, canonicalVariantId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.product_saved", entityType: "canonical_product", entityId: canonicalVariantId, createdAt: Date.now() });
  return json(res, 201, item);
}

function accountUnsaveProduct(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const removed = runtime.personalization.unsaveProduct(principal.userId, canonicalVariantId);
  const alertRemoved = runtime.savedProductAlerts.remove(principal.userId, canonicalVariantId);
  return json(res, 200, { removed, alertRemoved });
}

function accountSavedProductAlerts(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { alerts: runtime.savedProductAlerts.forUser(principal.userId).map((alert) => {
    const canonical = runtime.catalog.canonical(alert.canonicalVariantId);
    const price = canonical && runtime.retailPricing.hasPriceHistory(canonical.id) ? runtime.retailPricing.resolve(canonical.id, Date.now()).currentPrice : undefined;
    return { ...alert, title: canonical?.titleEl ?? alert.canonicalVariantId, currentPrice: price, formattedCurrentPrice: price ? formatMoney(price) : undefined, available: Boolean(runtime.search.document(alert.canonicalVariantId)?.available) };
  }), events: runtime.savedProductAlerts.eventsForUser(principal.userId) });
}

async function accountUpdateSavedProductAlert(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  if (!runtime.personalization.savedProducts(principal.userId).some((item) => item.canonicalVariantId === canonicalVariantId)) throw new Error("Product must be saved before alerts can be enabled");
  const canonical = runtime.catalog.canonical(canonicalVariantId);
  if (!canonical) throw new Error("Canonical product not found");
  const body = await readJson(req);
  const price = runtime.retailPricing.resolve(canonicalVariantId, Date.now()).currentPrice;
  const preference = runtime.savedProductAlerts.configure({
    userId: principal.userId, canonicalVariantId, backInStockEnabled: typeof body.backInStockEnabled === "boolean" ? body.backInStockEnabled : undefined,
    priceDropEnabled: typeof body.priceDropEnabled === "boolean" ? body.priceDropEnabled : undefined, minimumPriceDropMinor: body.minimumPriceDropMinor === undefined ? undefined : Number(body.minimumPriceDropMinor),
    currentAvailable: Boolean(runtime.search.document(canonicalVariantId)?.available), currentPriceMinor: price.minor, now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.saved_product_alert_updated", entityType: "canonical_product", entityId: canonicalVariantId, after: preference, createdAt: Date.now() });
  return json(res, 200, { preference, currentPrice: price, formattedCurrentPrice: formatMoney(price) });
}

function accountRecommendations(req: IncomingMessage, res: ServerResponse, url: URL) {
  const principal = requirePrincipal(req);
  const preferences = runtime.personalization.preferences(principal.userId, Date.now());
  if (!preferences.recommendationsEnabled) return json(res, 200, { enabled: false, recommendations: [], note: "Personalized recommendations are disabled by the customer." });
  const saved = runtime.personalization.savedProducts(principal.userId).flatMap((item) => { const canonical = runtime.catalog.canonical(item.canonicalVariantId); return canonical ? [{ canonicalVariantId: canonical.id, categoryCode: canonical.categoryCode, brand: canonical.identity.brand }] : []; });
  const recentlyViewed = runtime.personalization.recentlyViewed(principal.userId, Date.now()).flatMap((item) => { const canonical = runtime.catalog.canonical(item.canonicalVariantId); return canonical ? [{ canonicalVariantId: canonical.id, categoryCode: canonical.categoryCode, brand: canonical.identity.brand, viewedAt: item.viewedAt }] : []; });
  const products = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true }).filter((canonical) => !canonical.suppressed && !canonical.recalled).map((canonical) => ({ canonicalVariantId: canonical.id, categoryCode: canonical.categoryCode, brand: canonical.identity.brand, available: Boolean(runtime.search.document(canonical.id)?.available), adviceAvailable: canonical.adviceAvailable }));
  const ranked = runtime.recommendations.recommend({ enabled: true, products, saved, recentlyViewed, limit: Number(url.searchParams.get("limit") ?? 6), locale: url.searchParams.get("locale") === "en" ? "en" : "el", maxPerBrand: 2, maxPerCategory: 3 });
  const visitor = ensureVisitor(req, res); const postcode = url.searchParams.get("postcode") ?? "23100";
  const recommendations = ranked.flatMap((result) => { try { return [{ ...result, product: publicProduct(result.canonicalVariantId, visitor, postcode, "recommendation_card") }]; } catch { return []; } });
  return json(res, 200, { enabled: true, recommendations, methodology: "Canonical-product recommendations use saved/recent category and brand signals plus public local availability, then apply category/brand diversity caps. Vendor assignment is resolved separately by the Fair Vendor Exposure Engine." });
}

function accountSavedVendors(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const vendors = publicVendors();
  return json(res, 200, { vendors: runtime.personalization.savedVendors(principal.userId).map((saved) => ({ ...saved, vendor: vendors.find((vendor: any) => vendor.id === saved.vendorId) ?? { id: saved.vendorId, unavailable: true } })) });
}

function accountSaveVendor(req: IncomingMessage, res: ServerResponse, vendorId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  if (!publicVendors().some((vendor: any) => vendor.id === vendorId)) throw new Error("Vendor not found");
  const item = runtime.personalization.saveVendor(principal.userId, vendorId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.vendor_saved", entityType: "vendor", entityId: vendorId, createdAt: Date.now() });
  return json(res, 201, item);
}

function accountUnsaveVendor(req: IncomingMessage, res: ServerResponse, vendorId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return json(res, 200, { removed: runtime.personalization.unsaveVendor(principal.userId, vendorId) });
}

function accountRecentlyViewed(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const items = runtime.personalization.recentlyViewed(principal.userId, Date.now()).map((recent) => {
    const canonical = runtime.catalog.canonical(recent.canonicalVariantId);
    return { ...recent, title: canonical?.titleEl ?? recent.canonicalVariantId, available: Boolean(canonical?.active && !canonical.suppressed && !canonical.recalled) };
  });
  return json(res, 200, { products: items });
}

function accountClearRecentlyViewed(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const removed = runtime.personalization.clearRecentlyViewed(principal.userId);
  return json(res, 200, { removed });
}

function accountPersonalizationPreferences(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { preferences: runtime.personalization.preferences(principal.userId, Date.now()) });
}

async function accountUpdatePersonalizationPreferences(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const preferences = runtime.personalization.updatePreferences({
    userId: principal.userId,
    recommendationsEnabled: typeof body.recommendationsEnabled === "boolean" ? body.recommendationsEnabled : undefined,
    recentlyViewedEnabled: typeof body.recentlyViewedEnabled === "boolean" ? body.recentlyViewedEnabled : undefined,
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "personalization.preferences_updated", entityType: "user", entityId: principal.userId, after: preferences, createdAt: Date.now() });
  return json(res, 200, { preferences });
}

function privacyDataForCustomer(principal: SessionPrincipal, now: number) {
  const account = runtime.auth.account(principal.userId);
  if (!account) throw new Error("Account not found");
  const conversations = runtime.advice.conversationsForCustomer(principal.userId);
  return runtime.privacyRequests.buildExport({
    now,
    subject: { userId: account.id, accountStatus: account.status, email: account.email },
    personalization: {
      preferences: runtime.personalization.preferences(principal.userId, now),
      savedProducts: runtime.personalization.savedProducts(principal.userId),
      savedVendors: runtime.personalization.savedVendors(principal.userId),
      recentlyViewed: runtime.personalization.recentlyViewed(principal.userId, now)
    },
    data: {
      savedProductAlerts: runtime.savedProductAlerts.forUser(principal.userId),
      savedProductAlertEvents: runtime.savedProductAlerts.eventsForUser(principal.userId),
      savedSearches: runtime.savedSearches.forUser(principal.userId),
      savedSearchAlertEvents: runtime.savedSearches.eventsForUser(principal.userId),
      orders: runtime.commerce.orders().filter((order) => order.customerId === principal.userId),
      conversations: conversations.map((conversation) => ({ conversation, messages: runtime.advice.messages(conversation.id) })),
      appointments: runtime.advice.appointmentsForCustomer(principal.userId),
      askLocalRequests: runtime.advice.counteroffersForCustomer(principal.userId),
      privateOffers: runtime.advice.privateOffersForCustomer(principal.userId),
      returns: runtime.returns.listForCustomer(principal.userId),
      recalls: runtime.recalls.forCustomer(principal.userId),
      reviews: runtime.reviews.forCustomer(principal.userId),
      notifications: runtime.notifications.listForUser(principal.userId),
      notificationPreferences: runtime.notificationPreferences.list("user", principal.userId)
    },
    retention: defaultCustomerRetentionSnapshot(now)
  });
}

function accountPrivacy(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, {
    requests: runtime.privacyRequests.forUser(principal.userId),
    personalization: {
      preferences: runtime.personalization.preferences(principal.userId, Date.now()),
      savedProducts: runtime.personalization.savedProducts(principal.userId).length,
      savedVendors: runtime.personalization.savedVendors(principal.userId).length,
      recentlyViewed: runtime.personalization.recentlyViewed(principal.userId, Date.now()).length,
      savedProductAlerts: runtime.savedProductAlerts.forUser(principal.userId).length,
      savedSearches: runtime.savedSearches.forUser(principal.userId).length
    },
    retention: defaultCustomerRetentionSnapshot(Date.now()),
    note: "Self-service controls erase non-essential personalization immediately where supported. Order/tax/guarantee/security records may require retention; exact production periods require Greek legal/accounting confirmation."
  });
}

function accountPrivacyExport(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  assertAuthenticatedRateLimit(req, "privacy-export", RATE_LIMITS.privacy);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const now = Date.now();
  const request = runtime.privacyRequests.submit({ userId: principal.userId, type: "export", now });
  const dataExport = privacyDataForCustomer(principal, now);
  runtime.privacyRequests.complete({ requestId: request.id, actorId: principal.userId, now, status: "completed", retention: dataExport.retention, outcome: { generatedInline: true, exportVersion: dataExport.exportVersion } });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "privacy.export_generated", entityType: "privacy_request", entityId: request.id, createdAt: now });
  return json(res, 200, { request: runtime.privacyRequests.get(request.id), export: dataExport });
}

async function accountPrivacyDeletion(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  assertAuthenticatedRateLimit(req, "privacy-deletion", RATE_LIMITS.privacy);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const now = Date.now();
  const request = runtime.privacyRequests.submit({ userId: principal.userId, type: "deletion", now, details: body.reason ? { reason: String(body.reason).slice(0, 500) } : undefined });
  const erased = { ...runtime.personalization.eraseNonEssential(principal.userId, now), savedProductAlerts: runtime.savedProductAlerts.clearUser(principal.userId), savedSearches: runtime.savedSearches.clearUser(principal.userId) };
  for (const channel of ["email", "sms", "push"] as const) runtime.notificationPreferences.set({ targetType: "user", targetId: principal.userId, channel, eventType: "*", enabled: false, now });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "privacy.deletion_requested", entityType: "privacy_request", entityId: request.id, after: { erasedPersonalization: erased }, createdAt: now });
  return json(res, 202, { request, erasedPersonalization: erased, retention: defaultCustomerRetentionSnapshot(now) });
}

async function accountPrivacyClose(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  assertAuthenticatedRateLimit(req, "privacy-account-close", RATE_LIMITS.privacy);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  if (String(body.confirmation ?? "") !== "CLOSE") throw new Error("Account closure requires confirmation=CLOSE");
  const now = Date.now();
  const request = runtime.privacyRequests.submit({ userId: principal.userId, type: "account_closure", now });
  const erased = { ...runtime.personalization.eraseNonEssential(principal.userId, now), savedProductAlerts: runtime.savedProductAlerts.clearUser(principal.userId), savedSearches: runtime.savedSearches.clearUser(principal.userId) };
  for (const channel of ["email", "sms", "push"] as const) runtime.notificationPreferences.set({ targetType: "user", targetId: principal.userId, channel, eventType: "*", enabled: false, now });
  const retention = defaultCustomerRetentionSnapshot(now);
  runtime.privacyRequests.complete({ requestId: request.id, actorId: principal.userId, now, status: "partially_completed", retention, outcome: { accountClosed: true, erasedPersonalization: erased } });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "privacy.account_closed", entityType: "user", entityId: principal.userId, after: { retainedCategories: retention.filter((item) => item.retained).map((item) => item.category) }, createdAt: now });
  const account = runtime.auth.closeCustomerAccount({ userId: principal.userId, now });
  appendCookie(res, `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${SECURE_COOKIES ? "; Secure" : ""}; Priority=High`);
  return json(res, 200, { closed: true, account: { id: account.id, status: account.status }, request: runtime.privacyRequests.get(request.id), retention });
}

function accountOrders(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const orders = runtime.commerce.orders().filter((order) => order.customerId === principal.userId);
  return json(res, 200, { orders, tracking: orders.map((order) => runtime.orderOperations.trackingForCustomer({ orderId: order.id, customerId: principal.userId, now: Date.now() })) });
}

function accountOrderTracking(req: IncomingMessage, res: ServerResponse, orderId: string) {
  const principal = requirePrincipal(req);
  return json(res, 200, runtime.orderOperations.trackingForCustomer({ orderId, customerId: principal.userId, now: Date.now() }));
}

async function accountCancelOrder(req: IncomingMessage, res: ServerResponse, orderId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const before = runtime.commerce.getOrder(orderId);
  const cancellation = runtime.orderOperations.cancelByCustomer({ orderId, customerId: principal.userId, reason: String(body.reason ?? "Customer requested cancellation"), now: Date.now() });
  const order = runtime.commerce.getOrder(orderId);
  if (cancellation.paymentOutcome === "authorisation_cancelled" && order.discountSourceReference?.startsWith("coupon:")) {
    runtime.coupons.reverseRedemption({ orderId, reason: "Customer cancelled before payment capture", now: Date.now() });
  }
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "order.cancelled", entityType: "order", entityId: orderId, reason: cancellation.reason, before: { status: before.status }, after: { status: order.status, paymentOutcome: cancellation.paymentOutcome }, createdAt: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: principal.userId, eventType: "order.cancelled", title: "Η παραγγελία ακυρώθηκε", body: `Η παραγγελία ${orderId} ακυρώθηκε.`, payload: { orderId, paymentOutcome: cancellation.paymentOutcome }, dedupeKey: `order-cancelled:${orderId}:customer`, now: Date.now() });
  for (const vendorId of new Set(before.fulfilments.map((item) => item.vendorId))) runtime.notificationOrchestrator.emit({ vendorId, eventType: "order.cancelled", title: "Ακύρωση παραγγελίας", body: `Η παραγγελία ${orderId} ακυρώθηκε πριν από φυσική παράδοση.`, payload: { orderId }, dedupeKey: `order-cancelled:${orderId}:${vendorId}`, now: Date.now() });
  return json(res, 200, { cancellation, order, payment: runtime.payments.get(order.paymentId) });
}

async function accountSubstitutionDecision(req: IncomingMessage, res: ServerResponse, substitutionId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const decision = String(body.decision) === "approve" ? "approve" : String(body.decision) === "reject" ? "reject" : undefined;
  if (!decision) throw new Error("Substitution decision must be approve or reject");
  const result = runtime.orderOperations.respondToSubstitution({ substitutionId, customerId: principal.userId, decision, reason: body.reason ? String(body.reason) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: `substitution.${result.substitution.status}`, entityType: "order_substitution", entityId: substitutionId, reason: result.substitution.decisionReason ?? decision, after: result.substitution, createdAt: Date.now() });
  runtime.notificationOrchestrator.emit({ vendorId: result.substitution.vendorId, eventType: decision === "approve" ? "substitution.approved" : "substitution.rejected", title: decision === "approve" ? "Ο πελάτης ενέκρινε την αντικατάσταση" : "Ο πελάτης απέρριψε την αντικατάσταση", body: `${result.substitution.proposedTitle} · order ${result.substitution.orderId}`, payload: { substitutionId, orderId: result.substitution.orderId }, dedupeKey: `substitution-decision:${substitutionId}:${decision}`, now: Date.now() });
  return json(res, 200, result);
}

function accountAdvice(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, {
    conversations: runtime.advice.conversationsForCustomer(principal.userId),
    appointments: runtime.advice.appointmentsForCustomer(principal.userId),
    counteroffers: runtime.advice.counteroffersForCustomer(principal.userId),
    privateOffers: runtime.advice.privateOffersForCustomer(principal.userId)
  });
}

function accountNotifications(req: IncomingMessage, res: ServerResponse, url: URL) {
  const principal = requirePrincipal(req);
  const allowedGroups = new Set(["orders","delivery","advice","saved","returns","safety","account","other"]);
  const requestedGroup = url.searchParams.get("group");
  const group = requestedGroup && allowedGroups.has(requestedGroup) ? requestedGroup as any : undefined;
  const unreadOnly = url.searchParams.get("unread") === "1";
  const notifications = runtime.notifications.centerForUser(principal.userId, { group, unreadOnly });
  const all = runtime.notifications.centerForUser(principal.userId);
  const byGroup = Object.fromEntries([...allowedGroups].map((value) => [value, all.filter((item) => item.group === value).length]));
  return json(res, 200, { notifications, unread: runtime.notifications.unreadForUser(principal.userId), byGroup });
}

function markAllAccountNotificationsRead(req: IncomingMessage, res: ServerResponse, url: URL) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const requestedGroup = url.searchParams.get("group");
  const allowedGroups = new Set(["orders","delivery","advice","saved","returns","safety","account","other"]);
  const group = requestedGroup && allowedGroups.has(requestedGroup) ? requestedGroup as any : undefined;
  return json(res, 200, { updated: runtime.notifications.markAllRead({ userId: principal.userId, group, now: Date.now() }) });
}

function archiveAccountNotification(req: IncomingMessage, res: ServerResponse, notificationId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return json(res, 200, runtime.notifications.archive({ id: notificationId, userId: principal.userId, now: Date.now() }));
}

function accountNotificationPreferences(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, {
    preferences: runtime.notificationPreferences.list("user", principal.userId),
    defaults: { email: "enabled for transactional/service unless optional event is disabled", sms: "opt-in", push: "opt-in", marketing: "opt-in" },
    requiredEmailEvents: runtime.notificationTemplates.all().filter((item) => item.channel === "email" && item.required && item.active).map((item) => item.eventType)
  });
}

async function updateAccountNotificationPreference(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const channel = String(body.channel ?? "");
  if (!(["email", "sms", "push"] as const).includes(channel as any)) throw new Error("Unsupported notification preference channel");
  const preference = runtime.notificationPreferences.set({ targetType: "user", targetId: principal.userId, channel: channel as "email"|"sms"|"push", eventType: body.eventType ? String(body.eventType) : "*", enabled: Boolean(body.enabled), now: Date.now() });
  return json(res, 200, preference);
}

function accountPickups(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { pickups: runtime.pickup.forCustomer(principal.userId, Date.now()) });
}

function markAccountNotificationRead(req: IncomingMessage, res: ServerResponse, notificationId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return json(res, 200, runtime.notifications.markRead({ id: notificationId, userId: principal.userId, now: Date.now() }));
}

async function addPrivateOfferToCart(req: IncomingMessage, res: ServerResponse, offerId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const privateOffer = runtime.advice.privateOffer(offerId);
  if (!privateOffer) throw new Error("Private offer not found");
  const request = runtime.advice.counteroffer(privateOffer.requestId);
  if (!request) throw new Error("Counteroffer request not found");
  if (request.customerId !== principal.userId) throw new Error("Permission denied for private offer");
  const accepted = runtime.advice.acceptPrivateOffer(offerId, Date.now());
  const visitorKey = ensureVisitor(req, res);
  const cart = runtime.cart.getOrCreate({ marketId: MARKET_ID, visitorKey, postcode: request.postcode, userId: principal.userId, now: Date.now() });
  const updated = runtime.cart.addLocked({
    cartId: cart.id,
    canonicalVariantId: request.canonicalVariantId,
    quantity: request.quantity,
    lockedOfferId: request.assignedOfferId,
    retailUnitPriceOverride: accepted.price,
    sourceReference: `private_offer:${accepted.id}`,
    now: Date.now()
  });
  runtime.outbox.enqueue({
    type: "counteroffer.accepted",
    aggregateType: "counteroffer",
    aggregateId: request.id,
    payload: { requestId: request.id, privateOfferId: accepted.id, cartId: cart.id },
    idempotencyKey: `counteroffer-accepted:${accepted.id}`,
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: "customer", action: "counteroffer.accepted", entityType: "private_offer", entityId: accepted.id, reason: "customer added accepted private offer to cart", after: { cartId: cart.id, priceMinor: accepted.price.minor }, createdAt: Date.now() });
  runtime.analytics.record({ eventName: "counteroffer.accepted", marketId: MARKET_ID, visitorKey, customerId: principal.userId, vendorId: request.assignedVendorId, canonicalVariantId: request.canonicalVariantId, valueMinor: accepted.price.minor, quantity: request.quantity, metadata: { requestId: request.id, privateOfferId: accepted.id, categoryCode: runtime.catalog.canonical(request.canonicalVariantId)?.categoryCode }, dedupeKey: `analytics-counteroffer-accepted:${accepted.id}`, now: Date.now() });
  runtime.analytics.record({ eventName: "cart.item_added", marketId: MARKET_ID, visitorKey, customerId: principal.userId, vendorId: request.assignedVendorId, canonicalVariantId: request.canonicalVariantId, quantity: request.quantity, metadata: { categoryCode: runtime.catalog.canonical(request.canonicalVariantId)?.categoryCode, source: "private_offer" }, dedupeKey: `analytics-private-offer-cart:${accepted.id}`, now: Date.now() });
  return json(res, 200, { privateOffer: accepted, cart: decorateCart(updated) });
}

async function startConversation(req: IncomingMessage, res: ServerResponse) {
  assertAuthenticatedRateLimit(req, "advice-conversation", RATE_LIMITS.advice);
  const body = await readJson(req);
  const visitorKey = ensureVisitor(req, res);
  const principal = currentPrincipal(req);
  const variantId = String(body.canonicalVariantId ?? "");
  const conversation = runtime.advice.startConversation({
    marketId: MARKET_ID,
    customerId: principal?.userId ?? visitorKey,
    visitorKey,
    canonicalVariantId: variantId,
    postcode: String(body.postcode ?? "23100"),
    offers: liveOffers(variantId, String(body.postcode ?? "23100"), "pickup"),
    now: Date.now()
  });
  runtime.analytics.record({ eventName: "advice.started", marketId: MARKET_ID, visitorKey, customerId: principal?.userId, vendorId: conversation.vendorId, canonicalVariantId: variantId, metadata: { categoryCode: runtime.catalog.canonical(variantId)?.categoryCode }, dedupeKey: `analytics-advice-started:${conversation.id}`, now: Date.now() });
  return json(res, 201, { conversation, localPartner: demoVendors.find((vendor) => vendor.id === conversation.vendorId) });
}

async function sendConversationMessage(req: IncomingMessage, res: ServerResponse, conversationId: string) {
  assertAuthenticatedRateLimit(req, "advice-message", RATE_LIMITS.advice);
  const body = await readJson(req);
  const principal = currentPrincipal(req);
  const visitorKey = ensureVisitor(req, res);
  const conversation = runtime.advice.conversation(conversationId);
  if (!conversation) throw new Error("Conversation not found");
  const isVendor = principal?.vendorId === conversation.vendorId && principal.roles.some((role) => can(role, "advice.write"));
  const senderType = isVendor ? "vendor" : "customer";
  const senderId = principal?.userId ?? visitorKey;
  const message = runtime.advice.sendMessage({ conversationId, senderType, senderId, body: String(body.body ?? ""), now: Date.now() });
  return json(res, 201, { message, conversation: runtime.advice.conversation(conversationId) });
}

async function bookAdviceAppointment(req: IncomingMessage, res: ServerResponse) {
  assertAuthenticatedRateLimit(req, "advice-appointment", RATE_LIMITS.advice);
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const visitorKey = ensureVisitor(req, res);
  const variantId = String(body.canonicalVariantId ?? "");
  const startsAt = Number(body.startsAt);
  const durationMinutes = Number(body.durationMinutes ?? 30);
  if (!Number.isFinite(startsAt) || startsAt <= Date.now()) throw new Error("Appointment start must be in the future");
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes < 15 || durationMinutes > 120) throw new Error("Appointment duration must be between 15 and 120 minutes");
  const channel = ["in_store", "phone", "google_meet", "whatsapp", "viber"].includes(String(body.channel)) ? body.channel : "in_store";
  const assignment = runtime.fairness.select({
    marketId: MARKET_ID,
    canonicalVariantId: variantId,
    visitorKey,
    postcode: String(body.postcode ?? "23100"),
    desiredFulfilment: "pickup",
    reason: "appointment",
    now: Date.now()
  }, liveOffers(variantId, String(body.postcode ?? "23100"), "pickup"));
  const vendor = publicVendors().find((entry: any) => entry.id === assignment.vendorId);
  if (!vendor) throw new Error("Assigned local adviser not found");
  const appointment = runtime.advice.bookAppointment({
    marketId: MARKET_ID,
    customerId: principal.userId,
    adviserId: vendor.adviserId,
    vendorId: assignment.vendorId,
    canonicalVariantId: variantId,
    channel,
    startsAt,
    endsAt: startsAt + durationMinutes * 60_000,
    now: Date.now()
  });
  runtime.outbox.enqueue({ type: "appointment.booked", aggregateType: "appointment", aggregateId: appointment.id, payload: appointment, idempotencyKey: `appointment-booked:${appointment.id}`, now: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: principal.userId, eventType: "appointment.booked", title: "Η συμβουλευτική σου έκλεισε", body: `${vendor.name} · ${new Date(appointment.startsAt).toLocaleString("el-GR")}`, payload: { appointmentId: appointment.id, vendorId: appointment.vendorId }, dedupeKey: `customer-appointment:${appointment.id}:booked`, now: Date.now() });
  runtime.notificationOrchestrator.emit({ vendorId: appointment.vendorId, eventType: "appointment.booked", title: "Νέο ραντεβού συμβουλής", body: `${new Date(appointment.startsAt).toLocaleString("el-GR")} · ${appointment.channel}`, payload: { appointmentId: appointment.id }, dedupeKey: `vendor-appointment:${appointment.id}:booked`, now: Date.now() });
  runtime.analytics.record({ eventName: "appointment.booked", marketId: MARKET_ID, visitorKey, customerId: principal.userId, vendorId: appointment.vendorId, canonicalVariantId: variantId, metadata: { channel: appointment.channel, categoryCode: runtime.catalog.canonical(variantId)?.categoryCode }, dedupeKey: `analytics-appointment:${appointment.id}`, now: Date.now() });
  return json(res, 201, { appointment, localPartner: vendor });
}

async function askLocal(req: IncomingMessage, res: ServerResponse) {
  assertAuthenticatedRateLimit(req, "ask-local", RATE_LIMITS.askLocal);
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const variantId = String(body.canonicalVariantId ?? "");
  const visitorKey = ensureVisitor(req, res);
  const request = runtime.advice.requestCounteroffer({
    marketId: MARKET_ID,
    customerId: principal.userId,
    visitorKey,
    canonicalVariantId: variantId,
    sourceUrl: String(body.sourceUrl ?? ""),
    quantity: Number(body.quantity ?? 1),
    postcode: String(body.postcode ?? "23100"),
    need: ["price", "availability", "advice", "bundle", "installation", "delivery"].includes(String(body.need)) ? body.need : "price",
    offers: liveOffers(variantId, String(body.postcode ?? "23100"), "shipping"),
    now: Date.now()
  });
  runtime.outbox.enqueue({ type: "counteroffer.assigned", aggregateType: "counteroffer", aggregateId: request.id, payload: request, idempotencyKey: `counteroffer-assigned:${request.id}`, now: Date.now() });
  runtime.notificationOrchestrator.emit({ vendorId: request.assignedVendorId, eventType: "counteroffer.assigned", title: "Νέο Ask Local αίτημα", body: `Αίτημα ${request.id} · απάντηση έως ${new Date(request.responseDueAt).toLocaleString("el-GR")}`, payload: { requestId: request.id, canonicalVariantId: request.canonicalVariantId }, dedupeKey: `vendor-counteroffer:${request.id}:assigned`, now: Date.now() });
  runtime.analytics.record({ eventName: "counteroffer.requested", marketId: MARKET_ID, visitorKey, customerId: principal.userId, vendorId: request.assignedVendorId, canonicalVariantId: request.canonicalVariantId, quantity: request.quantity, metadata: { need: request.need, categoryCode: runtime.catalog.canonical(request.canonicalVariantId)?.categoryCode }, dedupeKey: `analytics-counteroffer-request:${request.id}`, now: Date.now() });
  return json(res, 201, { request, assignedShop: publicVendors().find((vendor: any) => vendor.id === request.assignedVendorId)?.name });
}

async function requestReturn(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  assertAuthenticatedRateLimit(req, "return-submit", RATE_LIMITS.returns);
  const body = await readJson(req);
  const order = runtime.commerce.getOrder(String(body.orderId ?? ""));
  if (order.customerId !== principal.userId) throw new Error("Permission denied for order");
  const reasons = new Set(["withdrawal", "defect", "nonconformity", "transit_damage", "wrong_item", "missing_part", "other"]);
  const remedies = new Set(["refund", "replacement", "repair", "price_reduction"]);
  const now = Date.now();
  const item = runtime.returns.request({
    customerId: principal.userId,
    orderId: order.id,
    orderLineId: String(body.orderLineId ?? ""),
    quantity: Number(body.quantity ?? 1),
    reason: reasons.has(String(body.reason)) ? body.reason : "other",
    requestedRemedy: remedies.has(String(body.requestedRemedy)) ? body.requestedRemedy : undefined,
    notes: body.notes ? String(body.notes) : undefined,
    now
  });
  runtime.outbox.enqueue({ type: "return.requested", aggregateType: "return", aggregateId: item.id, payload: item, idempotencyKey: `return-requested:${item.id}`, now });
  return json(res, 201, item);
}

function accountReturns(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { returns: runtime.returns.listForCustomer(principal.userId), policy: runtime.returns.policy() });
}

function accountRecalls(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { recalls: runtime.recalls.forCustomer(principal.userId) });
}

async function addReturnEvidence(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const item = runtime.returns.get(returnId);
  if (!item || item.customerId !== principal.userId) throw new Error("Return case ownership violation");
  const body = await readJson(req);
  const kinds = new Set(["photo", "document", "message", "carrier_proof", "product_serial", "other"]);
  const updated = runtime.returns.addEvidence({
    returnId, actorId: principal.userId,
    kind: kinds.has(String(body.kind)) ? body.kind : "other",
    reference: body.reference ? String(body.reference) : undefined,
    note: body.note ? String(body.note) : undefined,
    now: Date.now()
  });
  return json(res, 200, updated);
}

async function dispatchReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const item = runtime.returns.get(returnId);
  if (!item || item.customerId !== principal.userId) throw new Error("Return case ownership violation");
  const body = await readJson(req);
  const updated = runtime.returns.markInTransit({
    returnId, actorId: principal.userId,
    carrier: body.carrier ? String(body.carrier) : undefined,
    trackingNumber: body.trackingNumber ? String(body.trackingNumber) : undefined,
    now: Date.now()
  });
  return json(res, 200, updated);
}

function acknowledgeRecall(req: IncomingMessage, res: ServerResponse, recallCaseId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return json(res, 200, runtime.recalls.acknowledge({ recallCaseId, customerId: principal.userId, now: Date.now() }));
}

async function requestRecallRemedy(req: IncomingMessage, res: ServerResponse, recallCaseId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  assertAuthenticatedRateLimit(req, "return-submit", RATE_LIMITS.returns);
  const body = await readJson(req);
  const remedies = new Set(["refund", "replacement", "repair", "price_reduction"]);
  const remedy = remedies.has(String(body.remedy)) ? body.remedy : "refund";
  const result = runtime.recalls.requestRemedy({ recallCaseId, customerId: principal.userId, remedy, now: Date.now() });
  runtime.outbox.enqueue({ type: "return.requested", aggregateType: "return", aggregateId: result.returnCase.id, payload: result.returnCase, idempotencyKey: `return-requested:${result.returnCase.id}`, now: Date.now() });
  return json(res, 201, result);
}

async function startVendorApplication(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const body = await readJson(req);
  const application = runtime.vendorRegistry.startApplication({
    ownerUserId: principal.userId,
    marketId: MARKET_ID,
    legalName: String(body.legalName ?? ""),
    tradingName: String(body.tradingName ?? ""),
    contactEmail: String(body.contactEmail ?? principal.email),
    phone: body.phone ? String(body.phone) : undefined,
    taxNumber: body.taxNumber ? String(body.taxNumber) : undefined,
    gemiNumber: body.gemiNumber ? String(body.gemiNumber) : undefined,
    address: String(body.address ?? ""),
    postcode: String(body.postcode ?? "23100"),
    primaryCategory: String(body.primaryCategory ?? ""),
    shopStory: body.shopStory ? String(body.shopStory) : undefined,
    requestedPlanCode: String(body.requestedPlanCode ?? "free_listing"),
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor.application_started", entityType: "vendor_application", entityId: application.id, reason: "merchant self-service onboarding", after: { state: application.state, tradingName: application.tradingName }, createdAt: Date.now() });
  return json(res, 201, application);
}

function ownVendorApplication(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  return json(res, 200, { application: runtime.vendorRegistry.forOwner(principal.userId) ?? null });
}

function submitVendorApplication(req: IncomingMessage, res: ServerResponse, applicationId: string) {
  const principal = requirePrincipal(req);
  runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  const before = runtime.vendorRegistry.get(applicationId);
  const application = runtime.vendorRegistry.submit(applicationId, principal.userId, Date.now());
  runtime.outbox.enqueue({ type: "vendor.verification_requested", aggregateType: "vendor_application", aggregateId: application.id, payload: { applicationId: application.id, tradingName: application.tradingName }, idempotencyKey: `vendor-verification:${application.id}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor.application_submitted", entityType: "vendor_application", entityId: application.id, reason: "merchant submitted application for KYB review", before, after: application, createdAt: Date.now() });
  return json(res, 200, application);
}

function adminVendorApplications(req: IncomingMessage, res: ServerResponse) {
  requirePermission(req, "vendor.manage");
  return json(res, 200, { applications: runtime.vendorRegistry.all() });
}

async function adminTransitionVendorApplication(req: IncomingMessage, res: ServerResponse, applicationId: string) {
  const principal = requirePermission(req, "vendor.manage", true);
  const body = await readJson(req);
  const allowed = new Set(["catalog_onboarding", "test_ready", "active", "restricted", "suspended", "closed", "verification_pending"]);
  const to = String(body.to ?? "");
  if (!allowed.has(to)) throw new Error("Unsupported vendor onboarding transition");
  const reason = String(body.reason ?? "").trim();
  if (!reason) throw new Error("Transition reason is required");
  const now = Date.now();
  const before = runtime.vendorRegistry.get(applicationId);
  if (!before) throw new Error("Vendor application not found");
  if (to === "active") {
    const requestedPlan = runtime.plans.latest(before.requestedPlanCode, now);
    if (!requestedPlan || requestedPlan.status !== "active") throw new Error("Requested merchant plan is not approved for activation");
  }
  const application = runtime.vendorRegistry.adminTransition({ applicationId, to: to as any, actorId: principal.userId, reason, now });
  if (application.state === "active" && application.vendorId) {
    const subscription = runtime.plans.activate({ vendorId: application.vendorId, planCode: application.requestedPlanCode, now });
    runtime.auth.grantVendorAccess({ userId: application.ownerUserId, vendorId: application.vendorId, roles: ["vendor_owner"] });
    if (!runtime.vendorLocations.primary(application.vendorId)) runtime.vendorLocations.register({ id: `loc-${application.vendorId}`, vendorId: application.vendorId, marketId: MARKET_ID, name: `${application.tradingName} · Main shop`, addressLine1: application.address, locality: "Sparta", postcode: application.postcode, timezone: "Europe/Athens", active: true, primary: true, createdAt: now });
    runtime.outbox.enqueue({ type: "vendor.activated", aggregateType: "vendor", aggregateId: application.vendorId, payload: { applicationId: application.id, vendorId: application.vendorId, subscriptionId: subscription.id }, idempotencyKey: `vendor-activated:${application.vendorId}`, now: Date.now() });
    runtime.notificationOrchestrator.emit({ userId: application.ownerUserId, vendorId: application.vendorId, eventType: "vendor.activated", title: "Το κατάστημά σου ενεργοποιήθηκε", body: `${application.tradingName} είναι πλέον ενεργό στο Buy Local Sparta.`, payload: { applicationId: application.id, vendorId: application.vendorId, subscriptionId: subscription.id }, dedupeKey: `vendor-owner:${application.vendorId}:activated`, now: Date.now() });
  }
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `vendor.application_${application.state}`, entityType: "vendor_application", entityId: application.id, reason, before, after: application, createdAt: Date.now() });
  return json(res, 200, application);
}

function vendorProducts(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.read");
  const vendorId = requireVendor(principal);
  const submissions = runtime.catalog.submissions({ vendorId }).map((submission) => ({
    ...submission,
    canonical: submission.canonicalVariantId ? runtime.catalog.canonical(submission.canonicalVariantId) : undefined,
    matchCandidates: runtime.catalog.candidates({ submissionId: submission.id })
  }));
  const publishedOffers = allSupplierOffers().filter((offer) => offer.vendorId === vendorId).map((offer) => ({
    ...offer,
    canonical: runtime.catalog.canonical(offer.canonicalVariantId),
    balance: runtime.inventory.balance(offer.offerId),
    availableToSell: runtime.inventory.availableToSell(offer.offerId)
  }));
  return json(res, 200, { submissions, publishedOffers });
}

async function vendorCreateProduct(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const now = Date.now();
  const rawAttributes = typeof body.attributes === "object" && body.attributes ? Object.fromEntries(Object.entries(body.attributes).map(([key, value]) => [key, String(value)])) : {};
  const governedAttributes = runtime.categoryGovernance.validateAttributes(String(body.categoryCode ?? ""), rawAttributes);
  if (!governedAttributes.valid) throw new Error(`Product attributes invalid: ${governedAttributes.issues.map((issue) => issue.message).join("; ")}`);
  const submission = runtime.catalog.createDraft({
    marketId: MARKET_ID,
    vendorId,
    locationId: String(body.locationId ?? `loc-${vendorId}`),
    vendorSku: body.vendorSku ? String(body.vendorSku) : undefined,
    categoryCode: String(body.categoryCode ?? ""),
    title: String(body.title ?? ""),
    brand: body.brand ? String(body.brand) : undefined,
    model: body.model ? String(body.model) : undefined,
    mpn: body.mpn ? String(body.mpn) : undefined,
    gtin: body.gtin ? String(body.gtin) : undefined,
    condition: body.condition === "used" || body.condition === "refurbished" ? body.condition : "new",
    warrantyBasis: body.warrantyBasis ? String(body.warrantyBasis) : undefined,
    attributes: governedAttributes.normalized,
    supplierUnitPriceMinor: Number(body.supplierUnitPriceMinor),
    supplierTaxRateBps: body.supplierTaxRateBps === undefined ? 2400 : Number(body.supplierTaxRateBps),
    stockOnHand: Number(body.stockOnHand),
    safetyStock: body.safetyStock === undefined ? 0 : Number(body.safetyStock),
    fulfilmentModes: Array.isArray(body.fulfilmentModes) ? body.fulfilmentModes.map(String) as any : ["pickup"],
    adviceAvailable: Boolean(body.adviceAvailable),
    source: "manual",
    now
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor_product.created", entityType: "vendor_product", entityId: submission.id, reason: "vendor product editor", after: submission, createdAt: now });
  return json(res, 201, submission);
}

async function vendorUpdateProduct(req: IncomingMessage, res: ServerResponse, submissionId: string) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const before = runtime.catalog.submission(submissionId);
  if (!before) throw new Error("Vendor product not found");
  assertVendorScope(vendorId, before.vendorId);
  const identity: any = {};
  for (const field of ["title", "brand", "model", "mpn", "gtin", "warrantyBasis", "condition", "attributes"] as const) {
    if (body[field] !== undefined) identity[field] = field === "attributes" && typeof body[field] === "object" && body[field]
      ? Object.fromEntries(Object.entries(body[field]).map(([key, value]) => [key, String(value)]))
      : body[field];
  }
  const patch: any = {};
  for (const field of ["vendorSku", "categoryCode", "supplierTaxRateBps", "stockOnHand", "safetyStock", "fulfilmentModes", "adviceAvailable"] as const) if (body[field] !== undefined) patch[field] = body[field];
  const effectiveCategory = String(body.categoryCode ?? before.categoryCode);
  if (identity.attributes !== undefined || body.categoryCode !== undefined) {
    const effectiveAttributes = identity.attributes !== undefined ? identity.attributes : before.identity.attributes;
    const governed = runtime.categoryGovernance.validateAttributes(effectiveCategory, effectiveAttributes);
    if (!governed.valid) throw new Error(`Product attributes invalid: ${governed.issues.map((issue) => issue.message).join("; ")}`);
    identity.attributes = governed.normalized;
  }
  if (body.supplierUnitPriceMinor !== undefined) patch.supplierUnitPriceMinor = Number(body.supplierUnitPriceMinor);
  if (Object.keys(identity).length) patch.identity = identity;
  const updated = runtime.catalog.updateDraft({ submissionId, vendorId, patch, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor_product.updated", entityType: "vendor_product", entityId: submissionId, reason: "vendor product editor", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function vendorSubmitProduct(req: IncomingMessage, res: ServerResponse, submissionId: string) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const before = runtime.catalog.submission(submissionId);
  if (!before) throw new Error("Vendor product not found");
  assertVendorScope(vendorId, before.vendorId);
  const updated = runtime.catalog.submit({ submissionId, vendorId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor_product.submitted", entityType: "vendor_product", entityId: submissionId, reason: "vendor submitted for catalog QA", before, after: updated, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: "vendor_product.submitted", aggregateType: "vendor_product", aggregateId: submissionId, payload: { vendorId, status: updated.status, canonicalVariantId: updated.canonicalVariantId }, idempotencyKey: `vendor-product-submitted:${submissionId}:${updated.updatedAt}`, now: Date.now() });
  return json(res, 200, updated);
}

async function vendorImportPreview(req: IncomingMessage, res: ServerResponse) {
  requirePermission(req, "catalog.write", true);
  const body = await readJson(req);
  const preview = previewVendorProductCsv(String(body.csv ?? ""));
  return json(res, 200, { ...preview, canCommit: preview.errors.length === 0 && preview.rows.length > 0 });
}

async function vendorImportCommit(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  if (body.confirm !== true) throw new Error("CSV import requires explicit confirmation after dry-run preview");
  const preview = previewVendorProductCsv(String(body.csv ?? ""));
  if (preview.errors.length) return json(res, 422, { error: "CSV contains validation errors; nothing imported", ...preview });
  if (!preview.rows.length) throw new Error("CSV contains no importable rows");
  const now = Date.now();
  const created = preview.rows.map((row) => runtime.catalog.createDraft({
    marketId: MARKET_ID,
    vendorId,
    locationId: String(body.locationId ?? `loc-${vendorId}`),
    vendorSku: row.vendorSku,
    categoryCode: row.categoryCode,
    title: row.title,
    brand: row.brand,
    model: row.model,
    mpn: row.mpn,
    gtin: row.gtin,
    condition: row.condition,
    attributes: row.attributes,
    supplierUnitPriceMinor: row.supplierUnitPriceMinor,
    supplierTaxRateBps: row.supplierTaxRateBps,
    stockOnHand: row.stockOnHand,
    safetyStock: row.safetyStock,
    fulfilmentModes: row.fulfilmentModes,
    adviceAvailable: row.adviceAvailable,
    source: "csv",
    sourcePayload: { importRow: row.rowNumber },
    now
  }));
  const submitted = body.submit === true ? created.map((item) => runtime.catalog.submit({ submissionId: item.id, vendorId, now })) : created;
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor_product.csv_import", entityType: "vendor", entityId: vendorId, reason: `confirmed CSV import of ${submitted.length} rows`, after: { submissionIds: submitted.map((item) => item.id), submitted: body.submit === true }, createdAt: now });
  return json(res, 201, { imported: submitted.length, submissions: submitted, dryRunErrors: 0 });
}

function vendorInventoryHistory(req: IncomingMessage, res: ServerResponse, offerId: string) {
  const principal = requirePermission(req, "inventory.read");
  const vendorId = requireVendor(principal);
  const offer = allSupplierOffers().find((entry) => entry.offerId === offerId);
  if (!offer) throw new Error("Offer not found");
  assertVendorScope(vendorId, offer.vendorId);
  return json(res, 200, {
    offer,
    balance: runtime.inventory.balance(offerId),
    availableToSell: runtime.inventory.availableToSell(offerId),
    movements: runtime.inventory.movements().filter((movement) => movement.offerId === offerId).slice().reverse(),
    freshness: runtime.stockFreshness.status(offerId, Date.now())
  });
}

async function vendorAddLocation(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "vendor.manage", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const now = Date.now();
  const location = runtime.vendorLocations.register({ vendorId, marketId: MARKET_ID, name: String(body.name ?? ""), addressLine1: String(body.addressLine1 ?? ""), locality: String(body.locality ?? "Sparta"), postcode: String(body.postcode ?? "23100"), timezone: String(body.timezone ?? "Europe/Athens"), coordinates: body.lat !== undefined && body.lon !== undefined ? { lat: Number(body.lat), lon: Number(body.lon) } : undefined, active: true, primary: Boolean(body.primary), createdAt: now });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor.location_created", entityType: "vendor_location", entityId: location.id, reason: "Merchant added storefront/fulfilment location", after: location, createdAt: now });
  return json(res, 201, location);
}

function vendorOperationsConfig(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "vendor.manage");
  const vendorId = requireVendor(principal);
  const vendor = publicVendors().find((entry: any) => entry.id === vendorId) ?? { id: vendorId, locationId: `loc-${vendorId}`, name: vendorId };
  const locationId = vendor.locationId ?? `loc-${vendorId}`;
  const schedule = runtime.tradingCalendar.schedule(locationId);
  const zones = runtime.deliveryCoverage.zones({ vendorId, locationId });
  const now = Date.now();
  const locations = runtime.vendorLocations.forVendor(vendorId).map((location) => {
    const locationSchedule = runtime.tradingCalendar.schedule(location.id);
    const openFulfilments = runtime.commerce.orders().flatMap((order) => order.fulfilments.map((fulfilment) => ({ order, fulfilment }))).filter(({ fulfilment }) => fulfilment.vendorId === vendorId && fulfilment.locationId === location.id && !["delivered","rejected","failed","cancelled"].includes(fulfilment.status)).length;
    return { ...location, schedule: locationSchedule ?? null, scheduleConfigured: Boolean(locationSchedule), status: locationSchedule ? runtime.tradingCalendar.status(location.id, now) : { open:false, reason:"Trading hours are not configured" }, pickupWindows: locationSchedule ? runtime.tradingCalendar.pickupWindows({ locationId: location.id, earliestAt: now, preparationMs: 30 * 60_000, durationMs: 30 * 60_000, limit: 8 }) : [], localDeliveryPrefixes: runtime.deliveryCoverage.zones({ vendorId, locationId: location.id }).filter((zone) => zone.mode === "local_delivery" && zone.active).flatMap((zone) => zone.postcodePrefixes ?? []), shippingEnabled: runtime.deliveryCoverage.zones({ vendorId, locationId: location.id }).some((zone) => zone.mode === "shipping" && zone.active), deliveryZones: runtime.deliveryCoverage.zones({ vendorId, locationId: location.id }), capacityRules: runtime.fulfilmentCapacity.rules({ vendorId, locationId: location.id }), openFulfilments };
  });
  return json(res, 200, { vendorId, locationId, locations, schedule: schedule ?? null, status: schedule ? runtime.tradingCalendar.status(locationId, now) : { open: false, reason: "Trading hours are not configured" }, pickupWindows: schedule ? runtime.tradingCalendar.pickupWindows({ locationId, earliestAt: now, preparationMs: 30 * 60_000, durationMs: 30 * 60_000, limit: 8 }) : [], localDeliveryPrefixes: zones.filter((zone) => zone.mode === "local_delivery" && zone.active).flatMap((zone) => zone.postcodePrefixes ?? []), shippingEnabled: zones.some((zone) => zone.mode === "shipping" && zone.active), deliveryZones: zones, capacityRules: runtime.fulfilmentCapacity.rules({ vendorId, locationId }) });
}

async function updateVendorOperationsConfig(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "vendor.manage", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const vendor = publicVendors().find((entry: any) => entry.id === vendorId) ?? { id: vendorId, locationId: `loc-${vendorId}`, name: vendorId };
  const locationId = body.locationId ? String(body.locationId) : (vendor.locationId ?? `loc-${vendorId}`);
  const locationProfile = runtime.vendorLocations.get(locationId);
  if (!locationProfile || locationProfile.vendorId !== vendorId) throw new Error("Vendor location ownership violation");
  const beforeSchedule = runtime.tradingCalendar.schedule(locationId) ?? null;
  const beforeZones = runtime.deliveryCoverage.zones({ vendorId, locationId });
  const weekly = Array.isArray(body.weekly) ? body.weekly.map((day: any) => ({
    weekday: Number(day.weekday),
    intervals: Array.isArray(day.intervals) ? day.intervals.map((interval: any) => ({ opensMinute: Number(interval.opensMinute), closesMinute: Number(interval.closesMinute) })) : []
  })) : [];
  if (weekly.length !== 7) throw new Error("Trading schedule must define all seven weekdays");
  const exceptions = Array.isArray(body.exceptions) ? body.exceptions.map((item: any) => ({
    date: String(item.date ?? ""),
    closed: Boolean(item.closed),
    reason: item.reason ? String(item.reason) : undefined,
    intervals: Array.isArray(item.intervals) ? item.intervals.map((interval: any) => ({ opensMinute: Number(interval.opensMinute), closesMinute: Number(interval.closesMinute) })) : []
  })) : [];
  const prefixes = [...new Set((Array.isArray(body.localDeliveryPrefixes) ? body.localDeliveryPrefixes : []).map((value: any) => String(value).trim()).filter(Boolean))];
  for (const prefix of prefixes) if (!/^\d{1,5}$/.test(prefix)) throw new Error(`Invalid local-delivery postcode prefix ${prefix}`);
  const radiusKm = body.localDeliveryRadiusKm === undefined || body.localDeliveryRadiusKm === "" ? undefined : Number(body.localDeliveryRadiusKm);
  if (radiusKm !== undefined && (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100)) throw new Error("Local-delivery radius must be between 0 and 100 km");
  const lat = body.localDeliveryLat === undefined || body.localDeliveryLat === "" ? locationProfile.coordinates?.lat : Number(body.localDeliveryLat);
  const lon = body.localDeliveryLon === undefined || body.localDeliveryLon === "" ? locationProfile.coordinates?.lon : Number(body.localDeliveryLon);
  if (radiusKm !== undefined && (lat === undefined || lon === undefined || !Number.isFinite(lat) || !Number.isFinite(lon))) throw new Error("Radius-based delivery requires valid location coordinates");
  const schedule = runtime.tradingCalendar.setSchedule({ locationId, timezone: String(body.timezone ?? locationProfile.timezone ?? "Europe/Athens"), weekly, exceptions });
  for (const zone of runtime.deliveryCoverage.zones({ vendorId, locationId })) if (zone.mode === "local_delivery" || zone.mode === "shipping") runtime.deliveryCoverage.remove(zone.id);
  const now = Date.now();
  if (prefixes.length || radiusKm !== undefined) runtime.deliveryCoverage.register({ id: `zone-local-${vendorId}-${locationId}`, marketId: MARKET_ID, vendorId, locationId, mode: "local_delivery", postcodePrefixes: prefixes, center: radiusKm !== undefined ? { lat: lat!, lon: lon! } : undefined, radiusKm, active: true, priority: 10, startsAt: now });
  if (Boolean(body.shippingEnabled)) runtime.deliveryCoverage.register({ id: `zone-shipping-${vendorId}-${locationId}`, marketId: MARKET_ID, vendorId, locationId, mode: "shipping", active: true, priority: 1, startsAt: now });
  if (body.maxOpenFulfilments !== undefined) { const limit=Number(body.maxOpenFulfilments); for (const mode of ["pickup","local_delivery","shipping"] as const) runtime.fulfilmentCapacity.register({ id:`capacity-${vendorId}-${locationId}-${mode}-${now}`,vendorId,locationId,mode,maxOpenFulfilments:limit,active:true,priority:100,startsAt:now }); }
  const after = { schedule, zones: runtime.deliveryCoverage.zones({ vendorId, locationId }), capacityRules: runtime.fulfilmentCapacity.rules({ vendorId, locationId }) };
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "vendor.operations_config_updated", entityType: "vendor_location", entityId: locationId, reason: "Merchant updated trading hours and fulfilment coverage", before: { schedule: beforeSchedule, zones: beforeZones }, after, createdAt: now });
  return vendorOperationsConfig(req, res);
}

function adminLocalOperations(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "fulfilment.read");
  const vendors = publicVendors().flatMap((vendor: any) => {
    const locations = runtime.vendorLocations.forVendor(vendor.id).length ? runtime.vendorLocations.forVendor(vendor.id) : [{ id: vendor.locationId ?? `loc-${vendor.id}`, timezone: "Europe/Athens", name: "Main shop", primary: true } as any];
    return locations.map((location: any) => {
      const schedule = runtime.tradingCalendar.schedule(location.id);
      const openFulfilments = runtime.commerce.orders().flatMap((order) => order.fulfilments).filter((f) => f.vendorId === vendor.id && f.locationId === location.id && !["delivered","rejected","failed","cancelled"].includes(f.status)).length;
      return { vendorId: vendor.id, vendorName: vendor.name, locationId: location.id, locationName: location.name, primary: Boolean(location.primary), scheduleConfigured: Boolean(schedule), timezone: schedule?.timezone ?? location.timezone, status: schedule ? runtime.tradingCalendar.status(location.id, Date.now()) : { open: false, reason: "Trading hours pending configuration" }, deliveryZones: runtime.deliveryCoverage.zones({ vendorId: vendor.id, locationId: location.id }), capacityRules: runtime.fulfilmentCapacity.rules({ vendorId: vendor.id, locationId: location.id }), openFulfilments };
    });
  });
  return json(res, 200, { vendors, openNow: vendors.filter((item) => item.status.open).length, configured: vendors.filter((item) => item.scheduleConfigured).length });
}

function vendorDashboard(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const vendorId = requireVendor(principal);
  const allowed = (permission: Permission) => principal.roles.some((role) => can(role, permission));
  const orderViews = allowed("fulfilment.read") ? vendorOrderViews(vendorId) : [];
  const offers = (allowed("catalog.read") || allowed("inventory.read"))
    ? allSupplierOffers().filter((offer) => offer.vendorId === vendorId).map((offer) => ({
        ...offer,
        onHand: runtime.inventory.balance(offer.offerId).onHand,
        availableToSell: runtime.inventory.availableToSell(offer.offerId),
        productTitle: runtime.catalog.canonical(offer.canonicalVariantId)?.titleEl ?? offer.canonicalVariantId,
        freshness: runtime.stockFreshness.status(offer.offerId, Date.now())
      }))
    : [];
  const pending = orderViews.filter((view) => view.fulfilment.status === "awaiting_acceptance").length;
  const payload: Record<string, unknown> = {
    vendor: publicVendors().find((vendor: any) => vendor.id === vendorId) ?? { id: vendorId, name: vendorId, verified: false },
    metrics: {
      ordersRequiringAction: allowed("fulfilment.read") ? pending : undefined,
      activeProducts: allowed("catalog.read") ? offers.length : undefined,
      stockUnits: allowed("inventory.read") ? offers.reduce((sum, offer) => sum + offer.availableToSell, 0) : undefined,
      counteroffersWaiting: allowed("advice.read") ? runtime.advice.counteroffersForVendor(vendorId).filter((item) => item.status === "waiting_vendor").length : undefined,
      appointmentsUpcoming: allowed("advice.read") ? runtime.advice.appointmentsForVendor(vendorId).filter((item) => item.status === "booked" && item.startsAt > Date.now()).length : undefined,
      notificationsUnread: allowed("fulfilment.read") ? runtime.notifications.unreadForVendor(vendorId) : undefined
    }
  };
  if (allowed("inventory.read")) payload.inventory = offers;
  if (allowed("catalog.read")) {
    payload.products = runtime.catalog.submissions({ vendorId });
    payload.media = runtime.media.vendorAssets(vendorId);
    payload.complianceDocuments = runtime.trust.documents({ vendorId });
  }
  if (allowed("fulfilment.read")) {
    payload.recentOrders = orderViews.slice(-8).reverse();
    payload.pickups = runtime.pickup.forVendor(vendorId, Date.now());
    payload.shipments = runtime.shipping.forVendor(vendorId);
    payload.orderSubstitutions = runtime.orderOperations.substitutionsForVendor(vendorId);
    payload.fulfilmentSla = runtime.orderOperations.slaCases({ vendorId, activeOnly: true });
    payload.notifications = runtime.notifications.listForVendor(vendorId).filter((item) => item.channel === "in_app");
  }
  if (allowed("returns.read")) payload.returns = runtime.returns.listForVendor(vendorId);
  if (allowed("advice.read")) {
    payload.counteroffers = runtime.advice.counteroffersForVendor(vendorId);
    payload.conversations = runtime.advice.conversationsForVendor(vendorId);
    payload.appointments = runtime.advice.appointmentsForVendor(vendorId);
  }
  if (allowed("finance.read")) {
    payload.money = runtime.procurement.recordsForVendor(vendorId);
    payload.settlements = runtime.settlements.forVendor(vendorId);
  }
  if (allowed("vendor.manage")) {
    payload.plan = runtime.plans.currentForVendor(vendorId);
    const vendor = publicVendors().find((entry: any) => entry.id === vendorId) ?? { id: vendorId, locationId: `loc-${vendorId}` };
    const now = Date.now();
    const managedLocations = runtime.vendorLocations.forVendor(vendorId);
    const primaryLocationId = runtime.vendorLocations.primary(vendorId)?.id ?? vendor.locationId ?? `loc-${vendorId}`;
    const locationViews = managedLocations.map((location) => {
      const schedule = runtime.tradingCalendar.schedule(location.id);
      const zones = runtime.deliveryCoverage.zones({ vendorId, locationId: location.id });
      const openFulfilments = runtime.commerce.orders().flatMap((order) => order.fulfilments)
        .filter((fulfilment) => fulfilment.vendorId === vendorId && fulfilment.locationId === location.id && !["delivered", "rejected", "failed", "cancelled"].includes(fulfilment.status)).length;
      return {
        ...location, schedule: schedule ?? null, scheduleConfigured: Boolean(schedule),
        status: schedule ? runtime.tradingCalendar.status(location.id, now) : { open: false, reason: "Trading hours are not configured" },
        pickupWindows: schedule ? runtime.tradingCalendar.pickupWindows({ locationId: location.id, earliestAt: now, preparationMs: 30 * 60_000, durationMs: 30 * 60_000, limit: 8 }) : [],
        localDeliveryPrefixes: zones.filter((zone) => zone.mode === "local_delivery" && zone.active).flatMap((zone) => zone.postcodePrefixes ?? []),
        shippingEnabled: zones.some((zone) => zone.mode === "shipping" && zone.active),
        deliveryZones: zones, capacityRules: runtime.fulfilmentCapacity.rules({ vendorId, locationId: location.id }), openFulfilments
      };
    });
    const primaryView = locationViews.find((location) => location.id === primaryLocationId) ?? locationViews[0];
    payload.operations = primaryView ? { ...primaryView, vendorId, locationId: primaryView.id, locations: locationViews } : { vendorId, locationId: primaryLocationId, locations: [] };
  }
  if (allowed("analytics.vendor.read")) payload.analytics = runtime.analytics.vendorReport({ marketId: MARKET_ID, vendorId, from: Date.now() - 30 * 24 * 60 * 60 * 1000, to: Date.now() });
  if (allowed("fairness.read")) {
    payload.fairness = {
      appeals: runtime.fairnessGovernance.appealsForVendor(vendorId),
      anomalies: runtime.fairnessGovernance.anomaliesForVendor(vendorId),
      variants: runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true })
        .filter((product) => allSupplierOffers().some((offer) => offer.vendorId === vendorId && offer.canonicalVariantId === product.id))
        .map((product) => ({ variantId: product.id, title: product.titleEl, snapshot: runtime.fairness.snapshot({ marketId: MARKET_ID, canonicalVariantId: product.id }) }))
    };
  }
  return json(res, 200, payload);
}

function vendorAnalytics(req: IncomingMessage, res: ServerResponse, url: URL) {
  const principal = requirePermission(req, "analytics.vendor.read");
  const vendorId = requireVendor(principal);
  const { from, to } = analyticsWindow(url);
  return json(res, 200, { report: runtime.analytics.vendorReport({ marketId: MARKET_ID, vendorId, from, to }) });
}

function vendorOrders(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fulfilment.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { orders: vendorOrderViews(vendorId), substitutions: runtime.orderOperations.substitutionsForVendor(vendorId), slaCases: runtime.orderOperations.slaCases({ vendorId, activeOnly: true }) });
}

async function vendorProposeSubstitution(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const vendorId = requireVendor(principal);
  const parts = path.split("/");
  const orderId = parts[4];
  const lineId = parts[6];
  const body = await readJson(req);
  const proposal = runtime.orderOperations.proposeSubstitution({ orderId, lineId, vendorId, proposedCanonicalVariantId: String(body.proposedCanonicalVariantId ?? ""), reason: String(body.reason ?? ""), now: Date.now(), expiresAt: body.expiresAt ? Number(body.expiresAt) : undefined });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "substitution.proposed", entityType: "order_substitution", entityId: proposal.id, reason: proposal.reason, after: proposal, createdAt: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: proposal.customerId, eventType: "substitution.proposed", title: "Χρειάζεται η έγκρισή σου για εναλλακτικό προϊόν", body: `${proposal.proposedTitle} · ${formatMoney(proposal.proposedRetailUnitPrice)}`, payload: { substitutionId: proposal.id, orderId: proposal.orderId, lineId: proposal.lineId }, dedupeKey: `substitution-proposed:${proposal.id}`, now: Date.now() });
  return json(res, 201, proposal);
}

function vendorOrderViews(vendorId: string) {
  const views: any[] = [];
  for (const order of runtime.commerce.orders()) {
    for (const fulfilment of order.fulfilments.filter((entry) => entry.vendorId === vendorId)) {
      views.push({
        orderId: order.id,
        orderStatus: order.status,
        postcode: order.postcode,
        fulfilmentMode: order.fulfilmentMode,
        fulfilment,
        lines: order.lines.filter((line) => fulfilment.lineIds.includes(line.id)).map((line) => ({ ...line, formattedRetailPrice: formatMoney(line.retailUnitPrice) }))
      });
    }
  }
  return views;
}

function vendorAdvice(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "advice.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { conversations: runtime.advice.conversationsForVendor(vendorId), counteroffers: runtime.advice.counteroffersForVendor(vendorId), privateOffers: runtime.advice.privateOffersForVendor(vendorId), appointments: runtime.advice.appointmentsForVendor(vendorId) });
}

function vendorMoney(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "finance.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { procurements: runtime.procurement.recordsForVendor(vendorId), settlements: runtime.settlements.forVendor(vendorId) });
}

function vendorPickups(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fulfilment.read");
  return json(res, 200, { pickups: runtime.pickup.forVendor(requireVendor(principal), Date.now()) });
}

function vendorNotificationPreferences(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "vendor.manage");
  const vendorId = requireVendor(principal);
  return json(res, 200, {
    preferences: runtime.notificationPreferences.list("vendor", vendorId),
    defaults: { email: "enabled for transactional/service unless optional event is disabled", sms: "opt-in", push: "opt-in", marketing: "opt-in" },
    requiredEmailEvents: runtime.notificationTemplates.all().filter((item) => item.channel === "email" && item.required && item.active).map((item) => item.eventType)
  });
}

async function updateVendorNotificationPreference(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "vendor.manage", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const channel = String(body.channel ?? "");
  if (!(["email", "sms", "push"] as const).includes(channel as any)) throw new Error("Unsupported notification preference channel");
  const preference = runtime.notificationPreferences.set({ targetType: "vendor", targetId: vendorId, channel: channel as "email"|"sms"|"push", eventType: body.eventType ? String(body.eventType) : "*", enabled: Boolean(body.enabled), now: Date.now() });
  return json(res, 200, preference);
}

function vendorNotifications(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fulfilment.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { notifications: runtime.notifications.listForVendor(vendorId).filter((item) => item.channel === "in_app"), unread: runtime.notifications.unreadForVendor(vendorId) });
}

function vendorReviews(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "reviews.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, {
    reviews: runtime.reviews.forVendor(vendorId).map((review) => ({ ...review, customerId: undefined, response: runtime.reviews.response(review.id) })),
    aggregate: runtime.reviews.aggregateForVendor(vendorId),
    reports: runtime.reviews.reportsForVendor(vendorId)
  });
}

async function vendorRespondReview(req: IncomingMessage, res: ServerResponse, reviewId: string) {
  const principal = requirePermission(req, "reviews.respond", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const response = runtime.reviews.respond({ reviewId, vendorId, actorId: principal.userId, body: String(body.body ?? ""), now: Date.now() });
  const review = runtime.reviews.get(reviewId)!;
  runtime.notificationOrchestrator.emit({ userId: review.customerId, eventType: "review.response_received", title: "Το τοπικό κατάστημα απάντησε στην αξιολόγησή σου", body: response.body, payload: { reviewId }, dedupeKey: `review-response:${reviewId}:${response.updatedAt}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "review.vendor_response", entityType: "review", entityId: reviewId, reason: "merchant response to verified review", after: { vendorId, responseId: response.id }, createdAt: Date.now() });
  return json(res, 200, response);
}

async function vendorReportReview(req: IncomingMessage, res: ServerResponse, reviewId: string) {
  const principal = requirePermission(req, "reviews.report", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const reason = ["not_genuine", "abusive", "personal_data", "conflict_of_interest", "other"].includes(String(body.reason)) ? body.reason : "other";
  const report = runtime.reviews.report({ reviewId, vendorId, actorId: principal.userId, reason, details: String(body.details ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "review.reported", entityType: "review", entityId: reviewId, reason: `${report.reason}: ${report.details}`, after: { reportId: report.id, status: report.status }, createdAt: Date.now() });
  return json(res, 201, report);
}

function vendorCompleteAppointment(req: IncomingMessage, res: ServerResponse, appointmentId: string) {
  const principal = requirePermission(req, "advice.write", true);
  const vendorId = requireVendor(principal);
  const appointment = runtime.advice.appointment(appointmentId);
  if (!appointment) throw new Error("Appointment not found");
  assertVendorScope(vendorId, appointment.vendorId);
  const completed = runtime.advice.completeAppointment(appointmentId);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "appointment.completed", entityType: "appointment", entityId: appointmentId, reason: "merchant confirmed consultation completed", before: { status: appointment.status }, after: { status: completed.status }, createdAt: Date.now() });
  return json(res, 200, completed);
}

function vendorFairness(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fairness.read");
  const vendorId = requireVendor(principal);
  const variants = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true })
    .filter((product) => allSupplierOffers().some((offer) => offer.vendorId === vendorId && offer.canonicalVariantId === product.id))
    .map((product) => {
      const snapshot = runtime.fairness.snapshot({ marketId: MARKET_ID, canonicalVariantId: product.id });
      return {
        variantId: product.id,
        title: product.titleEl,
        targetShare: Object.keys(snapshot.exposures).length > 0 ? 1 / Object.keys(snapshot.exposures).length : 0,
        actualExposures: snapshot.exposures[vendorId] ?? 0,
        totalSelections: snapshot.selections,
        deficit: snapshot.deficits[vendorId] ?? 0
      };
    });
  return json(res, 200, { variants, appeals: runtime.fairnessGovernance.appealsForVendor(vendorId), anomalies: runtime.fairnessGovernance.anomaliesForVendor(vendorId) });
}

async function vendorSubmitFairnessAppeal(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fairness.appeal", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const canonicalVariantId = body.canonicalVariantId ? String(body.canonicalVariantId) : undefined;
  if (canonicalVariantId && !allSupplierOffers().some((offer) => offer.vendorId === vendorId && offer.canonicalVariantId === canonicalVariantId)) throw new Error("Vendor isolation violation");
  const appeal = runtime.fairnessGovernance.submitAppeal({ marketId: MARKET_ID, vendorId, canonicalVariantId, submittedBy: principal.userId, reason: String(body.reason ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "fairness.appeal_submitted", entityType: "fairness_appeal", entityId: appeal.id, reason: appeal.reason, after: appeal, createdAt: Date.now() });
  return json(res, 201, appeal);
}

function markVendorNotificationRead(req: IncomingMessage, res: ServerResponse, notificationId: string) {
  const principal = requirePermission(req, "fulfilment.read", true);
  return json(res, 200, runtime.notifications.markRead({ id: notificationId, vendorId: requireVendor(principal), now: Date.now() }));
}

async function vendorInventoryUpdate(req: IncomingMessage, res: ServerResponse, offerId: string) {
  const principal = requirePermission(req, "inventory.write", true);
  const vendorId = requireVendor(principal);
  const offer = allSupplierOffers().find((entry) => entry.offerId === offerId);
  if (!offer) throw new Error("Offer not found");
  assertVendorScope(vendorId, offer.vendorId);
  const body = await readJson(req);
  const now = Date.now();
  const before = runtime.inventory.balance(offerId);
  runtime.inventory.adjustOnHand(offerId, Number(body.onHand), now, "vendor_dashboard", principal.userId);
  const freshness = runtime.stockFreshness.confirm(offerId, now);
  const refreshedOffer = { ...offer, stockConfirmedAt: now, stockFresh: true };
  const variant = runtime.commerce.variant(offer.canonicalVariantId);
  if (!variant) throw new Error("Canonical sellable variant not found");
  runtime.commerce.upsertVariantOffer(variant, refreshedOffer);
  runtime.cart.upsertVariantOffer(offer.canonicalVariantId, refreshedOffer);
  const after = runtime.inventory.balance(offerId);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "inventory.set_on_hand", entityType: "offer", entityId: offerId, reason: "vendor dashboard update and stock freshness confirmation", before, after: { balance: after, freshness }, createdAt: now });
  runtime.outbox.enqueue({ type: "inventory.changed", aggregateType: "offer", aggregateId: offerId, payload: { offerId, vendorId, canonicalVariantId: offer.canonicalVariantId, onHand: Number(body.onHand), confirmedAt: now }, idempotencyKey: `inventory:${offerId}:${now}`, now });
  if (freshness.previousState && freshness.previousState !== "fresh") runtime.outbox.enqueue({ type: "inventory.stock_refreshed", aggregateType: "offer", aggregateId: offerId, payload: freshness, idempotencyKey: `inventory.stock_refreshed:${offerId}:${now}`, now });
  return json(res, 200, { offerId, balance: after, availableToSell: runtime.inventory.availableToSell(offerId), freshness });
}

async function vendorFulfilmentAction(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const parts = path.split("/");
  const orderId = parts[4];
  const fulfilmentId = parts[6];
  const action = parts[7];
  const order = runtime.commerce.getOrder(orderId);
  const fulfilment = order.fulfilments.find((entry) => entry.id === fulfilmentId);
  if (!fulfilment) throw new Error("Fulfilment not found");
  assertVendorScope(requireVendor(principal), fulfilment.vendorId);
  const operationNow = Date.now();
  let updated;
  if (action === "accept") updated = runtime.commerce.acceptFulfilment(orderId, fulfilmentId, operationNow);
  else if (action === "reject") updated = runtime.commerce.rejectFulfilment(orderId, fulfilmentId, operationNow);
  else {
    if (order.fulfilmentMode !== "local_delivery") throw new Error("Shipping delivery is carrier-confirmed and pickup uses secure collection verification");
    updated = runtime.commerce.markDelivered(orderId, fulfilmentId, operationNow);
    runtime.procurement.accrueFulfilledLines(updated, operationNow);
  }
  const resultingFulfilment = updated.fulfilments.find((entry) => entry.id === fulfilmentId);
  if (resultingFulfilment) runtime.orderOperations.recordFulfilmentTransition({ orderId, fulfilmentId, actorType: "vendor", actorId: principal.userId, previousStatus: fulfilment.status, status: resultingFulfilment.status, now: operationNow });
  runtime.orderOperations.registerOrder(updated, operationNow);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `fulfilment.${action}`, entityType: "fulfilment", entityId: fulfilmentId, reason: "vendor operational action", before: { status: fulfilment.status }, after: { status: updated.fulfilments.find((entry) => entry.id === fulfilmentId)?.status ?? action }, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: `fulfilment.${action}`, aggregateType: "fulfilment", aggregateId: fulfilmentId, payload: { orderId, fulfilmentId }, idempotencyKey: `fulfilment:${action}:${fulfilmentId}:${Date.now()}`, now: Date.now() });
  if (updated.customerId && action === "accept") runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "fulfilment.accepted", title: "Το τοπικό κατάστημα ανέλαβε την παραγγελία", body: `Η προετοιμασία για ${orderId} ξεκίνησε.`, payload: { orderId, fulfilmentId }, dedupeKey: `customer-fulfilment:${fulfilmentId}:accepted`, now: Date.now() });
  if (updated.customerId && action === "deliver") runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "fulfilment.delivered", title: "Η τοπική εκπλήρωση ολοκληρώθηκε", body: `Η ομάδα εκπλήρωσης ολοκλήρωσε το ${fulfilmentId}.`, payload: { orderId, fulfilmentId }, dedupeKey: `customer-fulfilment:${fulfilmentId}:delivered`, now: Date.now() });
  return json(res, 200, updated);
}

function vendorReadyPickup(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const parts = path.split("/");
  const orderId = parts[4];
  const fulfilmentId = parts[6];
  const order = runtime.commerce.getOrder(orderId);
  const fulfilment = order.fulfilments.find((entry) => entry.id === fulfilmentId);
  if (!fulfilment) throw new Error("Fulfilment not found");
  const vendorId = requireVendor(principal);
  assertVendorScope(vendorId, fulfilment.vendorId);
  const readyNow = Date.now();
  const credential = runtime.pickup.markReady({
    orderId,
    fulfilmentId,
    vendorId,
    customerId: order.customerId,
    now: readyNow
  });
  runtime.orderOperations.recordFulfilmentTransition({ orderId, fulfilmentId, actorType: "vendor", actorId: principal.userId, previousStatus: fulfilment.status, status: "ready_for_handover", now: readyNow });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "pickup.ready", entityType: "pickup", entityId: credential.id, reason: "vendor marked click-and-collect ready", before: { fulfilmentStatus: fulfilment.status }, after: { fulfilmentStatus: "ready_for_handover", expiresAt: credential.expiresAt }, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: "pickup.ready", aggregateType: "pickup", aggregateId: credential.id, payload: { orderId, fulfilmentId, pickupId: credential.id }, idempotencyKey: `pickup-ready:${credential.id}`, now: Date.now() });
  if (order.customerId) runtime.notificationOrchestrator.emit({ userId: order.customerId, eventType: "pickup.ready", title: "Η παραγγελία σου είναι έτοιμη για παραλαβή", body: `Κωδικός παραλαβής: ${credential.shortCode}`, payload: { orderId, fulfilmentId, pickupId: credential.id }, dedupeKey: `customer-pickup:${credential.id}:ready`, now: Date.now() });
  return json(res, 200, { credential, order: runtime.commerce.getOrder(orderId) });
}

async function vendorVerifyPickup(req: IncomingMessage, res: ServerResponse, pickupId: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const before = runtime.pickup.get(pickupId, Date.now());
  if (!before) throw new Error("Pickup credential not found");
  assertVendorScope(vendorId, before.vendorId);
  const collectedNow = Date.now();
  const credential = runtime.pickup.verifyAndCollect({ pickupId, vendorId, proof: String(body.proof ?? ""), now: collectedNow });
  const order = runtime.commerce.getOrder(credential.orderId);
  runtime.orderOperations.recordFulfilmentTransition({ orderId: credential.orderId, fulfilmentId: credential.fulfilmentId, actorType: "vendor", actorId: principal.userId, previousStatus: "ready_for_handover", status: "delivered", now: collectedNow });
  runtime.procurement.accrueFulfilledLines(order, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "pickup.collected", entityType: "pickup", entityId: pickupId, reason: "secure pickup code/QR verified", before, after: credential, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: "pickup.collected", aggregateType: "pickup", aggregateId: pickupId, payload: { orderId: credential.orderId, fulfilmentId: credential.fulfilmentId }, idempotencyKey: `pickup-collected:${pickupId}`, now: Date.now() });
  if (order.customerId) runtime.notificationOrchestrator.emit({ userId: order.customerId, eventType: "pickup.collected", title: "Η παραλαβή ολοκληρώθηκε", body: `Η παραγγελία ${order.id} παραδόθηκε με ασφαλή επιβεβαίωση.`, payload: { orderId: order.id, pickupId }, dedupeKey: `customer-pickup:${pickupId}:collected`, now: Date.now() });
  return json(res, 200, { credential, order });
}

async function vendorMatchProcurementInvoice(req: IncomingMessage, res: ServerResponse, procurementId: string) {
  const principal = requirePermission(req, "finance.write", true);
  const vendorId = requireVendor(principal);
  const record = runtime.procurement.record(procurementId);
  assertVendorScope(vendorId, record.vendorId);
  const body = await readJson(req);
  const invoiceGrossMinor = body.invoiceGrossMinor === undefined ? record.gross.minor : Number(body.invoiceGrossMinor);
  const updated = runtime.procurement.matchInvoice({ procurementId, invoiceNumber: String(body.invoiceNumber ?? ""), invoiceGross: money(invoiceGrossMinor), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "procurement.invoice_matched", entityType: "procurement", entityId: procurementId, reason: "vendor submitted supplier invoice reference", before: record, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function vendorMakePrivateOffer(req: IncomingMessage, res: ServerResponse, requestId: string) {
  const principal = requirePermission(req, "advice.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const request = runtime.advice.counteroffer(requestId);
  if (!request) throw new Error("Counteroffer request not found");
  assertVendorScope(vendorId, request.assignedVendorId);
  const offer = runtime.advice.makePrivateOffer({
    requestId,
    vendorId,
    price: money(Number(body.priceMinor)),
    inclusions: Array.isArray(body.inclusions) ? body.inclusions.map(String) : [],
    fulfilmentPromise: String(body.fulfilmentPromise ?? "Παραλαβή από το κατάστημα"),
    expiresAt: Date.now() + Number(body.validForHours ?? 24) * 60 * 60 * 1000,
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "counteroffer.private_offer_created", entityType: "counteroffer", entityId: requestId, reason: "assigned vendor response", after: { offerId: offer.id, priceMinor: offer.price.minor, expiresAt: offer.expiresAt }, createdAt: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: request.customerId, eventType: "counteroffer.offer_received", title: "Έλαβες ιδιωτική τοπική προσφορά", body: `${formatMoney(offer.price)} · ισχύει έως ${new Date(offer.expiresAt).toLocaleString("el-GR")}`, payload: { requestId, privateOfferId: offer.id }, dedupeKey: `customer-private-offer:${offer.id}`, now: Date.now() });
  runtime.analytics.record({ eventName: "counteroffer.offer_sent", marketId: MARKET_ID, customerId: request.customerId, vendorId, canonicalVariantId: request.canonicalVariantId, valueMinor: offer.price.minor, quantity: request.quantity, metadata: { requestId, categoryCode: runtime.catalog.canonical(request.canonicalVariantId)?.categoryCode }, dedupeKey: `analytics-counteroffer-offer:${offer.id}`, now: Date.now() });
  return json(res, 201, offer);
}

function vendorReturns(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "returns.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { returns: runtime.returns.listForVendor(vendorId) });
}

function vendorReceiveReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const item = runtime.returns.get(returnId);
  if (!item) throw new Error("Return case not found");
  assertVendorScope(requireVendor(principal), item.vendorId);
  const updated = runtime.returns.markReceived({ returnId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.received", entityType: "return", entityId: returnId, reason: "vendor received returned goods", before: { status: item.status }, after: { status: updated.status }, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function vendorReplacementAction(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const parts = path.split("/");
  const returnId = parts[4];
  const action = parts[6] as "accept" | "ready" | "ship" | "deliver" | "reject";
  const item = runtime.returns.get(returnId);
  if (!item?.replacement) throw new Error("Replacement return not found");
  const vendorId = requireVendor(principal);
  assertVendorScope(vendorId, item.replacement.vendorId);
  const body = await readJson(req);
  const updated = runtime.returns.replacementAction({ returnId, vendorId, actorId: principal.userId, action, reference: body.reference ? String(body.reference) : undefined, now: Date.now() });
  if (action === "ready" && updated.customerId) runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "return.replacement_ready", title: "Η αντικατάστασή σου είναι έτοιμη", body: `Return ${updated.id} · η αντικατάσταση είναι έτοιμη για παράδοση.`, payload: { returnId: updated.id }, dedupeKey: `return-replacement-ready:${updated.id}`, now: Date.now() });
  if (new Set(["deliver"]).has(action)) runtime.recalls.resolveForReturn(returnId, Date.now());
  return json(res, 200, updated);
}

async function vendorRepairAction(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const parts = path.split("/");
  const returnId = parts[4];
  const action = parts[6] as "start" | "await_part" | "ready" | "return_to_customer" | "fail";
  const item = runtime.returns.get(returnId);
  if (!item?.repair) throw new Error("Repair return not found");
  const vendorId = requireVendor(principal);
  assertVendorScope(vendorId, item.repair.vendorId);
  const body = await readJson(req);
  const updated = runtime.returns.repairAction({ returnId, vendorId, actorId: principal.userId, action, findings: body.findings ? String(body.findings) : undefined, reference: body.reference ? String(body.reference) : undefined, now: Date.now() });
  if (action === "ready") runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "return.repair_ready", title: "Η επισκευή ολοκληρώθηκε", body: `Return ${updated.id} · το προϊόν είναι έτοιμο για επιστροφή.`, payload: { returnId: updated.id }, dedupeKey: `return-repair-ready:${updated.id}`, now: Date.now() });
  if (action === "return_to_customer") runtime.recalls.resolveForReturn(returnId, Date.now());
  return json(res, 200, updated);
}

function adminPromotions(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "promotions.read");
  const now = Date.now();
  const promotions = runtime.retailPricing.promotions({ marketId: MARKET_ID }).map((promotion) => ({
    ...promotion, status: runtime.retailPricing.status(promotion, now), formattedPromotionalPrice: formatMoney(promotion.promotionalPrice),
    formattedPriorPrice: promotion.priorPriceSnapshot ? formatMoney(promotion.priorPriceSnapshot) : undefined
  }));
  const history = runtime.retailPricing.history({ marketId: MARKET_ID }).map((entry) => ({ ...entry, formattedPrice: formatMoney(entry.price) }));
  const coupons = runtime.coupons.rules({ marketId: MARKET_ID }).map((rule) => {
    const redemptions = runtime.coupons.redemptions({ couponId: rule.id }).length;
    const reversals = runtime.coupons.reversals({ couponId: rule.id }).length;
    return { ...rule, redemptions, reversals, effectiveRedemptions: redemptions - reversals };
  });
  return json(res, 200, { promotions, history, coupons, priorPriceWindowDays: 30 });
}

async function adminSetPlatformPrice(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePlatformPermission(req, "promotions.write", true);
  const canonical = runtime.catalog.canonical(canonicalVariantId);
  if (!canonical) throw new Error("Canonical product not found");
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const now = Date.now();
  const before = runtime.retailPricing.resolve(canonicalVariantId, now);
  const entry = runtime.retailPricing.setBasePrice({ marketId: MARKET_ID, canonicalVariantId, price: money(Number(body.priceMinor)), effectiveAt: now, actorId: principal.userId, reason, recordedAt: now });
  await runtime.searchIndexer.reindex(canonicalVariantId, now);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "pricing.base_price_changed", entityType: "canonical_product", entityId: canonicalVariantId, reason, before, after: runtime.retailPricing.resolve(canonicalVariantId, now), createdAt: now });
  runtime.outbox.enqueue({ type: "pricing.base_price_changed", aggregateType: "canonical_product", aggregateId: canonicalVariantId, payload: { canonicalVariantId, priceMinor: entry.price.minor }, idempotencyKey: `base-price:${entry.id}`, now });
  return json(res, 200, { entry, price: runtime.retailPricing.resolve(canonicalVariantId, now) });
}

async function adminCreatePromotion(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "promotions.write", true);
  const body = await readJson(req);
  const canonicalVariantId = String(body.canonicalVariantId ?? "");
  if (!runtime.catalog.canonical(canonicalVariantId)) throw new Error("Canonical product not found");
  const now = Date.now();
  const requestedStartsAt = body.startsAt === undefined ? now : Number(body.startsAt);
  // Treat a just-submitted timestamp as "start now" while still rejecting genuinely backdated campaigns in the domain.
  const startsAt = requestedStartsAt < now && now - requestedStartsAt <= 60_000 ? now : requestedStartsAt;
  const endsAt = body.endsAt === undefined ? startsAt + 7 * 24 * 60 * 60 * 1000 : Number(body.endsAt);
  const promotion = runtime.retailPricing.schedulePromotion({ marketId: MARKET_ID, canonicalVariantId, name: String(body.name ?? "Local promotion"), promotionalPrice: money(Number(body.promotionalPriceMinor)), startsAt, endsAt, priority: Number(body.priority ?? 0), version: Number(body.version ?? 1), reason: String(body.reason ?? ""), createdBy: principal.userId, createdAt: now });
  await runtime.searchIndexer.reindex(canonicalVariantId, now);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "promotion.created", entityType: "promotion", entityId: promotion.id, reason: promotion.reason, after: promotion, createdAt: now });
  runtime.outbox.enqueue({ type: "promotion.changed", aggregateType: "canonical_product", aggregateId: canonicalVariantId, payload: { canonicalVariantId, promotionId: promotion.id }, idempotencyKey: `promotion-created:${promotion.id}`, now });
  return json(res, 201, { ...promotion, status: runtime.retailPricing.status(promotion, now), price: runtime.retailPricing.resolve(canonicalVariantId, now) });
}

async function adminCancelPromotion(req: IncomingMessage, res: ServerResponse, promotionId: string) {
  const principal = requirePlatformPermission(req, "promotions.write", true);
  const body = await readJson(req);
  const now = Date.now();
  const promotion = runtime.retailPricing.cancelPromotion({ promotionId, actorId: principal.userId, reason: String(body.reason ?? ""), now });
  await runtime.searchIndexer.reindex(promotion.canonicalVariantId, now);
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "promotion.cancelled", entityType: "promotion", entityId: promotion.id, reason: promotion.cancellationReason, after: promotion, createdAt: now });
  runtime.outbox.enqueue({ type: "promotion.changed", aggregateType: "canonical_product", aggregateId: promotion.canonicalVariantId, payload: { canonicalVariantId: promotion.canonicalVariantId, promotionId: promotion.id, status: "cancelled" }, idempotencyKey: `promotion-cancelled:${promotion.id}:${now}`, now });
  return json(res, 200, { ...promotion, status: runtime.retailPricing.status(promotion, now), price: runtime.retailPricing.resolve(promotion.canonicalVariantId, now) });
}

async function adminCreateCoupon(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "promotions.write", true);
  const body = await readJson(req);
  const now = Date.now();
  const discountType = body.discountType === "fixed" ? "fixed" : "percentage";
  const coupon = runtime.coupons.register({
    marketId: MARKET_ID, code: String(body.code ?? ""), name: String(body.name ?? body.code ?? "Coupon"), discountType,
    fixedAmount: discountType === "fixed" ? money(Number(body.fixedAmountMinor)) : undefined, rateBps: discountType === "percentage" ? Number(body.rateBps) : undefined,
    minSubtotal: body.minSubtotalMinor === undefined ? undefined : money(Number(body.minSubtotalMinor)), maxDiscount: body.maxDiscountMinor === undefined ? undefined : money(Number(body.maxDiscountMinor)),
    eligibleCanonicalVariantIds: Array.isArray(body.eligibleCanonicalVariantIds) ? body.eligibleCanonicalVariantIds.map(String) : undefined,
    eligibleCategoryCodes: Array.isArray(body.eligibleCategoryCodes) ? body.eligibleCategoryCodes.map(String) : undefined,
    excludePrivateOffers: body.excludePrivateOffers !== false, excludePromotionalPrices: body.excludePromotionalPrices === true,
    startsAt: body.startsAt === undefined ? now : Number(body.startsAt), endsAt: body.endsAt === undefined ? undefined : Number(body.endsAt),
    maxRedemptions: body.maxRedemptions === undefined ? undefined : Number(body.maxRedemptions), maxPerSubject: body.maxPerSubject === undefined ? 1 : Number(body.maxPerSubject),
    version: Number(body.version ?? 1), active: body.active !== false, createdBy: principal.userId, createdAt: now
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "coupon.created", entityType: "coupon", entityId: coupon.id, reason: "Platform coupon created", after: coupon, createdAt: now });
  return json(res, 201, coupon);
}

function adminCategoryGovernance(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "catalog.read");
  const categories = runtime.categoryGovernance.categories().map((policy) => ({
    policy,
    schema: runtime.categoryGovernance.schema(policy.categoryCode)
  }));
  return json(res, 200, {
    categories,
    attributeDefinitions: runtime.categoryGovernance.attributeDefinitions(),
    note: "Commerce modes and category attributes are governed configuration. Identical-product fairness remains a separate domain."
  });
}

async function adminUpdateCategoryGovernance(req: IncomingMessage, res: ServerResponse, categoryCode: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const current = runtime.categoryGovernance.categories().find((item) => item.categoryCode === categoryCode);
  if (!current) throw new Error("Governed category not found");
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  if (!reason) throw new Error("Reason is required for category governance changes");
  const commerceModes = new Set(["standard", "logistics_sensitive", "compatibility_sensitive", "regulated_mixed", "vehicles", "directory_only"]);
  const fulfilmentModes = new Set(["pickup", "local_delivery", "shipping", "bulky_special"]);
  const commerceMode = body.commerceMode === undefined ? current.commerceMode : String(body.commerceMode);
  if (!commerceModes.has(commerceMode)) throw new Error("Invalid category commerce mode");
  let checkoutFulfilmentModes = current.checkoutFulfilmentModes;
  if (body.checkoutFulfilmentModes !== undefined) {
    if (!Array.isArray(body.checkoutFulfilmentModes)) throw new Error("checkoutFulfilmentModes must be an array");
    const values = body.checkoutFulfilmentModes.map(String);
    if (values.some((value) => !fulfilmentModes.has(value))) throw new Error("Invalid checkout fulfilment mode");
    checkoutFulfilmentModes = values as any;
  }
  let attributes = current.attributes;
  if (body.attributes !== undefined) {
    if (!Array.isArray(body.attributes)) throw new Error("attributes must be an array");
    attributes = body.attributes.map((item: any, index: number) => ({
      attributeCode: String(item.attributeCode ?? "").trim(),
      required: Boolean(item.required),
      sortOrder: item.sortOrder === undefined ? index : Number(item.sortOrder)
    }));
    if (attributes.some((item: any) => !item.attributeCode || !Number.isFinite(item.sortOrder))) throw new Error("Invalid category attribute binding");
  }
  const next = {
    ...current,
    commerceMode: commerceMode as any,
    attributes,
    requireCompatibilityConfirmation: body.requireCompatibilityConfirmation === undefined ? current.requireCompatibilityConfirmation : Boolean(body.requireCompatibilityConfirmation),
    regulatedCheckoutAllowed: body.regulatedCheckoutAllowed === undefined ? current.regulatedCheckoutAllowed : Boolean(body.regulatedCheckoutAllowed),
    checkoutFulfilmentModes,
    counterofferAllowed: body.counterofferAllowed === undefined ? current.counterofferAllowed : Boolean(body.counterofferAllowed),
    adviceAllowed: body.adviceAllowed === undefined ? current.adviceAllowed : Boolean(body.adviceAllowed)
  };
  runtime.categoryGovernance.registerCategory(next);
  const after = runtime.categoryGovernance.policy(categoryCode);
  runtime.audit.record({
    actorId: principal.userId,
    actorRole: principal.roles[0],
    action: "catalog.category_governance_updated",
    entityType: "category",
    entityId: categoryCode,
    reason,
    before: current,
    after,
    createdAt: Date.now()
  });
  return json(res, 200, { policy: after, schema: runtime.categoryGovernance.schema(categoryCode) });
}

function adminProductMatching(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "catalog.read");
  const submissions = runtime.catalog.submissions().filter((item) => item.status !== "archived").map((submission) => ({
    ...submission,
    vendor: publicVendors().find((vendor: any) => vendor.id === submission.vendorId),
    canonical: submission.canonicalVariantId ? runtime.catalog.canonical(submission.canonicalVariantId) : undefined,
    candidates: runtime.catalog.candidates({ submissionId: submission.id }).map((candidate) => ({
      ...candidate,
      canonical: runtime.catalog.canonical(candidate.candidateCanonicalVariantId)
    })),
    history: runtime.catalog.events({ submissionId: submission.id })
  }));
  return json(res, 200, {
    submissions,
    pendingReview: submissions.filter((item) => item.status === "needs_review").length,
    linkedAwaitingApproval: submissions.filter((item) => item.status === "linked").length,
    approved: submissions.filter((item) => item.status === "approved").length
  });
}

async function adminApproveProductMatch(req: IncomingMessage, res: ServerResponse, candidateId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const candidate = runtime.catalog.candidates().find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Product match candidate not found");
  const before = runtime.catalog.submission(candidate.submissionId);
  const updated = runtime.catalog.approveMatch({ candidateId, actorId: principal.userId, reason, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.match_approved", entityType: "vendor_product", entityId: updated.id, reason, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminRejectProductMatch(req: IncomingMessage, res: ServerResponse, candidateId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const candidate = runtime.catalog.candidates().find((item) => item.id === candidateId);
  if (!candidate) throw new Error("Product match candidate not found");
  const before = runtime.catalog.submission(candidate.submissionId);
  const updated = runtime.catalog.rejectMatch({ candidateId, actorId: principal.userId, reason, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.match_rejected", entityType: "vendor_product", entityId: updated.id, reason, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminCreateCanonical(req: IncomingMessage, res: ServerResponse, submissionId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const product = runtime.catalog.createCanonicalFromSubmission({
    submissionId,
    actorId: principal.userId,
    platformPriceMinor: Number(body.platformPriceMinor),
    taxRateBps: body.taxRateBps === undefined ? undefined : Number(body.taxRateBps),
    titleEl: body.titleEl ? String(body.titleEl) : undefined,
    titleEn: body.titleEn ? String(body.titleEn) : undefined,
    descriptionEl: body.descriptionEl ? String(body.descriptionEl) : undefined,
    synonyms: Array.isArray(body.synonyms) ? body.synonyms.map(String) : undefined,
    reason,
    now: Date.now()
  });
  if (!runtime.retailPricing.hasPriceHistory(product.id)) runtime.retailPricing.registerInitialPrice({ marketId: product.marketId, canonicalVariantId: product.id, price: product.platformPrice, effectiveAt: product.createdAt, actorId: principal.userId });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.canonical_created", entityType: "canonical_product", entityId: product.id, reason, after: product, createdAt: Date.now() });
  return json(res, 201, product);
}

async function adminApproveVendorProduct(req: IncomingMessage, res: ServerResponse, submissionId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const before = runtime.catalog.submission(submissionId);
  if (!before) throw new Error("Vendor product not found");
  const updated = runtime.catalog.approveOffer({ submissionId, actorId: principal.userId, reason, now: Date.now() });
  const publication = publishApprovedSubmission(updated.id, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.offer_approved", entityType: "vendor_product", entityId: submissionId, reason, before, after: { submission: updated, publication }, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: "offer.approved", aggregateType: "vendor_product", aggregateId: submissionId, payload: publication, idempotencyKey: `offer-approved:${submissionId}:${updated.updatedAt}`, now: Date.now() });
  const owner = runtime.vendorRegistry.all().find((application) => application.vendorId === updated.vendorId)?.ownerUserId;
  runtime.notificationOrchestrator.emit({ userId: owner, vendorId: updated.vendorId, eventType: "catalog.product_approved", title: "Το προϊόν εγκρίθηκε", body: `${runtime.catalog.canonical(updated.canonicalVariantId!)?.titleEl ?? updated.identity.title} είναι πλέον διαθέσιμο στο marketplace.`, payload: { submissionId, canonicalVariantId: updated.canonicalVariantId, offerId: publication.offerId }, dedupeKey: `vendor-product:${submissionId}:approved`, now: Date.now() });
  return json(res, 200, { submission: updated, publication });
}

async function adminRejectVendorProduct(req: IncomingMessage, res: ServerResponse, submissionId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "").trim();
  const before = runtime.catalog.submission(submissionId);
  if (!before) throw new Error("Vendor product not found");
  const updated = runtime.catalog.rejectOffer({ submissionId, actorId: principal.userId, reason, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "catalog.offer_rejected", entityType: "vendor_product", entityId: submissionId, reason, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function publishApprovedSubmission(submissionId: string, now: number) {
  const submission = runtime.catalog.submission(submissionId);
  if (!submission || submission.status !== "approved" || !submission.canonicalVariantId) throw new Error("Approved linked vendor product required for publication");
  const canonical = runtime.catalog.canonical(submission.canonicalVariantId);
  if (!canonical) throw new Error("Canonical product not found");
  const offerId = `offer-${submission.id}`;
  const offer = {
    offerId,
    vendorId: submission.vendorId,
    locationId: submission.locationId,
    canonicalVariantId: canonical.id,
    marketId: canonical.marketId,
    approved: true,
    vendorActive: true,
    locationActive: true,
    productAllowed: canonical.active && !canonical.suppressed && !canonical.recalled,
    availableToSell: 0,
    stockFresh: true,
    canServe: true,
    costWithinCeiling: true,
    capacityOpen: true,
    capacityWeight: 1,
    fulfilmentMode: submission.fulfilmentModes[0] ?? "pickup",
    fulfilmentFit: 1,
    stockConfirmedAt: now,
    stockTtlMs: runtime.stockFreshnessPolicy.ruleFor(canonical.categoryCode).ttlMs,
    supplierUnitPrice: submission.supplierUnitPrice,
    supplierTaxRateBps: submission.supplierTaxRateBps
  } as const;
  if (!runtime.inventory.hasOffer(offerId)) runtime.inventory.seed({ offerId, onHand: submission.stockOnHand, activeReservations: 0, safetyStock: submission.safetyStock, blocked: 0, updatedAt: now });
  else runtime.inventory.adjustOnHand(offerId, submission.stockOnHand, now, "catalog_reapproval");
  const variant = { id: canonical.id, marketId: canonical.marketId, title: canonical.titleEl, platformPrice: canonical.platformPrice, taxRateBps: canonical.taxRateBps };
  runtime.commerce.upsertVariantOffer(variant, offer);
  runtime.cart.upsertVariantOffer(canonical.id, offer);
  runtime.stockFreshness.register({ offerId, vendorId: submission.vendorId, canonicalVariantId: canonical.id, categoryCode: canonical.categoryCode, confirmedAt: now });
  runtime.search.upsert({
    id: canonical.id,
    type: "product",
    marketId: canonical.marketId,
    title: canonical.titleEl,
    titleEl: canonical.titleEl,
    titleEn: canonical.titleEn,
    body: canonical.descriptionEl,
    brand: canonical.identity.brand,
    model: canonical.identity.model,
    identifiers: [canonical.identity.gtin, canonical.identity.mpn].filter(Boolean) as string[],
    categoryCodes: [canonical.categoryCode],
    synonyms: canonical.synonyms,
    available: runtime.inventory.availableToSell(offerId) > 0,
    pickupToday: submission.fulfilmentModes.includes("pickup") && runtime.inventory.availableToSell(offerId) > 0,
    adviceAvailable: submission.adviceAvailable,
    priceMinor: canonical.platformPrice.minor,
    metadata: { variantId: canonical.id }
  });
  return { offerId, canonicalVariantId: canonical.id, vendorId: submission.vendorId, availableToSell: runtime.inventory.availableToSell(offerId) };
}

function adminDashboard(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  const orders = runtime.commerce.orders();
  const returns = runtime.returns.all();
  const procurement = runtime.procurement.all();
  return json(res, 200, {
    metrics: {
      customerOrders: orders.length,
      vendorApplicationsPending: runtime.vendorRegistry.all().filter((application) => !["active", "closed"].includes(application.state)).length,
      activeOnboardedVendors: runtime.vendorRegistry.all().filter((application) => application.state === "active").length,
      authorisedOrders: orders.filter((order) => order.status === "authorised").length,
      fulfilledOrders: orders.filter((order) => ["fulfilled", "completed"].includes(order.status)).length,
      returnsOpen: returns.filter((item) => !["refunded", "closed", "rejected"].includes(item.status)).length,
      procurementAccruedMinor: procurement.filter((item) => item.status !== "reversed").reduce((sum, item) => sum + item.gross.minor, 0),
      fairnessEvents: runtime.fairness.events().length,
      outboxPending: runtime.outbox.events().filter((event) => event.status !== "processed").length,
      staleStockOffers: runtime.stockFreshness.all(Date.now()).filter((item) => item.state === "stale").length,
      stockConfirmationsDueSoon: runtime.stockFreshness.all(Date.now()).filter((item) => item.state === "due_soon").length,
      indexedDocuments: runtime.search.documents().length,
      publishedContentPages: runtime.content.pages({ marketId: MARKET_ID, status: "published" }).length,
      merchantStoriesAwaitingApproval: runtime.content.stories({ marketId: MARKET_ID }).filter((item) => ["vendor_review", "approved"].includes(item.status)).length,
      openPaymentDisputes: runtime.disputes.all().filter((item) => !["closed", "won"].includes(item.status)).length,
      notificationsQueued: runtime.notifications.all().filter((item) => item.channel !== "in_app" && ["queued", "sending"].includes(item.status)).length,
      notificationsFailed: runtime.notifications.all().filter((item) => item.channel !== "in_app" && item.status === "failed").length,
      privacyRequestsOpen: runtime.privacyRequests.all().filter((item) => ["submitted", "processing"].includes(item.status)).length
    },
    alerts: operationalAlerts()
  });
}

function adminSecurity(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "security.read");
  const since = Date.now() - 24 * 60 * 60 * 1000;
  return json(res, 200, { summary: runtime.securityEvents.summary(since), events: runtime.securityEvents.recent({ since, limit: 200 }), retentionDays: 90 });
}

function adminPrivacyRequests(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "privacy.read");
  return json(res, 200, { requests: runtime.privacyRequests.all(), retentionDefaults: defaultCustomerRetentionSnapshot(Date.now()) });
}

function adminStartPrivacyRequest(req: IncomingMessage, res: ServerResponse, requestId: string) {
  const principal = requirePlatformPermission(req, "privacy.manage", true);
  const before = runtime.privacyRequests.get(requestId);
  if (!before) throw new Error("Privacy request not found");
  const item = runtime.privacyRequests.start({ requestId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "privacy.request_processing", entityType: "privacy_request", entityId: requestId, before, after: item, createdAt: Date.now() });
  return json(res, 200, item);
}

async function adminCompletePrivacyRequest(req: IncomingMessage, res: ServerResponse, requestId: string) {
  const principal = requirePlatformPermission(req, "privacy.manage", true);
  const body = await readJson(req);
  const before = runtime.privacyRequests.get(requestId);
  if (!before) throw new Error("Privacy request not found");
  const retention = Array.isArray(body.retention) ? body.retention : defaultCustomerRetentionSnapshot(Date.now());
  const status = body.status === "completed" ? "completed" : body.status === "partially_completed" ? "partially_completed" : undefined;
  const item = runtime.privacyRequests.complete({ requestId, actorId: principal.userId, now: Date.now(), status, retention, outcome: body.outcome && typeof body.outcome === "object" ? body.outcome : { note: String(body.note ?? "Completed by privacy operations") } });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "privacy.request_completed", entityType: "privacy_request", entityId: requestId, before, after: item, createdAt: Date.now() });
  return json(res, 200, item);
}

async function adminHealth(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  const report = await runtime.health.readiness();
  return json(res, 200, { ...report, build: BUILD, rateLimitBuckets: runtime.rateLimiter.bucketCount() });
}

function adminReviews(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "reviews.read");
  return json(res, 200, { reviews: runtime.reviews.all(), reports: runtime.reviews.reports(), events: runtime.reviews.events() });
}

async function adminModerateReview(req: IncomingMessage, res: ServerResponse, reviewId: string) {
  const principal = requirePlatformPermission(req, "reviews.manage", true);
  const body = await readJson(req);
  const status = ["published", "hidden", "rejected"].includes(String(body.status)) ? body.status as "published"|"hidden"|"rejected" : "hidden";
  const before = runtime.reviews.get(reviewId);
  if (!before) throw new Error("Review not found");
  const review = runtime.reviews.moderate({ reviewId, actorId: principal.userId, status, reason: String(body.reason ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `review.moderated_${status}`, entityType: "review", entityId: reviewId, reason: String(body.reason ?? ""), before, after: review, createdAt: Date.now() });
  return json(res, 200, review);
}

async function adminReviewReviewReport(req: IncomingMessage, res: ServerResponse, reportId: string) {
  const principal = requirePlatformPermission(req, "reviews.manage", true);
  const body = await readJson(req);
  const status = ["under_review", "resolved", "rejected"].includes(String(body.status)) ? body.status as "under_review"|"resolved"|"rejected" : "under_review";
  const before = runtime.reviews.reportById(reportId);
  if (!before) throw new Error("Review report not found");
  const report = runtime.reviews.reviewReport({ reportId, actorId: principal.userId, status, resolution: body.resolution ? String(body.resolution) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `review.report_${status}`, entityType: "review_report", entityId: reportId, reason: report.resolution ?? "review report moved to investigation", before, after: report, createdAt: Date.now() });
  return json(res, 200, report);
}

function adminNotifications(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "notifications.read");
  const notifications = runtime.notifications.all();
  const counts = notifications.reduce((acc, item) => { acc[item.status] = (acc[item.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);
  return json(res, 200, {
    counts,
    recent: notifications.filter((item) => item.channel !== "in_app").slice(0, 100),
    queued: notifications.filter((item) => item.channel !== "in_app" && (item.status === "queued" || item.status === "sending")).slice(0, 100),
    failed: notifications.filter((item) => item.status === "failed").slice(0, 100),
    attempts: runtime.notificationDelivery.attempts().slice(-200).reverse(),
    templates: runtime.notificationTemplates.all(),
    providers: {
      email: { name: runtime.notificationProviders.email.name, sent: runtime.notificationProviders.email.sent.length },
      sms: { name: runtime.notificationProviders.sms.name, sent: runtime.notificationProviders.sms.sent.length },
      push: { name: runtime.notificationProviders.push.name, sent: runtime.notificationProviders.push.sent.length }
    }
  });
}

async function adminCreateNotificationTemplate(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "notifications.manage", true);
  const body = await readJson(req);
  const channel = String(body.channel ?? "");
  if (!(["email", "sms", "push"] as const).includes(channel as any)) throw new Error("Unsupported notification template channel");
  const locale = String(body.locale ?? "el");
  if (locale !== "el" && locale !== "en") throw new Error("Unsupported notification template locale");
  const purpose = String(body.purpose ?? "service");
  if (!(["transactional", "service", "marketing"] as const).includes(purpose as any)) throw new Error("Unsupported notification purpose");
  const template = runtime.notificationTemplates.register({
    eventType: String(body.eventType ?? ""), channel: channel as "email"|"sms"|"push", locale: locale as "el"|"en", purpose: purpose as "transactional"|"service"|"marketing",
    revision: Number(body.revision), titleTemplate: String(body.titleTemplate ?? ""), bodyTemplate: String(body.bodyTemplate ?? ""), required: Boolean(body.required), active: body.active !== false,
    createdBy: principal.userId, createdAt: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "notification.template_created", entityType: "notification_template", entityId: template.id, after: template, createdAt: Date.now() });
  return json(res, 201, template);
}

async function adminRetryNotification(req: IncomingMessage, res: ServerResponse, notificationId: string) {
  const principal = requirePlatformPermission(req, "notifications.manage", true);
  const updated = await runtime.notificationDelivery.retry(notificationId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "notification.delivery_requeued", entityType: "notification", entityId: notificationId, after: { status: updated.status }, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminAnalytics(req: IncomingMessage, res: ServerResponse, url: URL) {
  requirePlatformPermission(req, "analytics.market.read");
  const { from, to } = analyticsWindow(url);
  return json(res, 200, { report: runtime.analytics.marketReport({ marketId: MARKET_ID, from, to, topLimit: 15 }) });
}

function adminFairness(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "fairness.read");
  const variants = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true }).map((product) => ({
    variantId: product.id,
    title: product.titleEl,
    snapshot: runtime.fairness.snapshot({ marketId: MARKET_ID, canonicalVariantId: product.id })
  }));
  const events = runtime.fairness.events().slice(-100).reverse().map((event) => ({ ...event, vendorName: publicVendors().find((vendor: any) => vendor.id === event.vendorId)?.name }));
  return json(res, 200, { variants, events, appeals: runtime.fairnessGovernance.appeals(), anomalies: runtime.fairnessGovernance.anomalies() });
}

async function adminReviewFairnessAppeal(req: IncomingMessage, res: ServerResponse, appealId: string) {
  const principal = requirePlatformPermission(req, "fairness.manage", true);
  const body = await readJson(req);
  const status = new Set(["under_review", "resolved", "rejected"]).has(String(body.status)) ? String(body.status) as "under_review" | "resolved" | "rejected" : "under_review";
  const updated = runtime.fairnessGovernance.reviewAppeal({ appealId, actorId: principal.userId, status, resolution: body.resolution ? String(body.resolution) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `fairness.appeal_${status}`, entityType: "fairness_appeal", entityId: appealId, reason: updated.resolution ?? "appeal review started", after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminFairnessAnomalyAction(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePlatformPermission(req, "fairness.manage", true);
  const parts = path.split("/");
  const anomalyId = parts[4];
  const action = parts[5];
  const updated = action === "resolve"
    ? runtime.fairnessGovernance.resolveAnomaly({ anomalyId, actorId: principal.userId, now: Date.now() })
    : runtime.fairnessGovernance.acknowledgeAnomaly({ anomalyId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `fairness.anomaly_${action}`, entityType: "fairness_anomaly", entityId: anomalyId, reason: "operator fairness anomaly review", after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminOrders(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  return json(res, 200, { orders: runtime.commerce.orders(), payments: runtime.commerce.orders().map((order) => runtime.payments.get(order.paymentId)), procurements: runtime.procurement.all(), cancellations: runtime.orderOperations.cancellations(), substitutions: runtime.commerce.orders().flatMap((order) => runtime.orderOperations.substitutionsForOrder(order.id)), slaCases: runtime.orderOperations.slaCases({ activeOnly: true }) });
}

function adminOrderOperations(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "fulfilment.read");
  return json(res, 200, { cancellations: runtime.orderOperations.cancellations(), substitutions: runtime.commerce.orders().flatMap((order) => runtime.orderOperations.substitutionsForOrder(order.id)), slaCases: runtime.orderOperations.slaCases(), timeline: runtime.orderOperations.allEvents().slice(-500).reverse() });
}

async function adminResolveFulfilmentSla(req: IncomingMessage, res: ServerResponse, slaCaseId: string) {
  const principal = requirePlatformPermission(req, "fulfilment.write", true);
  const body = await readJson(req);
  const before = runtime.orderOperations.slaCases().find((item) => item.id === slaCaseId);
  if (!before) throw new Error("SLA case not found");
  const updated = runtime.orderOperations.resolveSla({ slaCaseId, actorId: principal.userId, resolution: String(body.resolution ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "fulfilment.sla_resolved", entityType: "fulfilment_sla", entityId: slaCaseId, reason: updated.resolution ?? "resolved", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminReturns(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "returns.read");
  return json(res, 200, { returns: runtime.returns.all(), policy: runtime.returns.policy() });
}

function adminRecalls(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "returns.read");
  return json(res, 200, { recalls: runtime.recalls.all() });
}

function adminSettlements(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "finance.read");
  return json(res, 200, { settlements: runtime.settlements.all(), procurements: runtime.procurement.all() });
}

function adminCommercialRules(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "finance.read");
  return json(res, 200, { deliveryRules: runtime.deliveryPricing.rules(), feeRules: runtime.feeRules.rules() });
}

async function adminCreateDeliveryRule(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const mode = body.mode === "local_delivery" || body.mode === "shipping" || body.mode === "pickup" ? body.mode : undefined;
  if (!mode) throw new Error("Valid delivery mode is required");
  const now = Date.now();
  const rule = runtime.deliveryPricing.register({
    marketId: MARKET_ID,
    mode,
    vendorId: body.vendorId ? String(body.vendorId) : undefined,
    postcodePrefixes: Array.isArray(body.postcodePrefixes) ? body.postcodePrefixes.map(String) : undefined,
    baseCharge: money(Number(body.baseChargeMinor ?? 0)),
    additionalPackageCharge: body.additionalPackageChargeMinor === undefined ? undefined : money(Number(body.additionalPackageChargeMinor)),
    freeAboveSubtotal: body.freeAboveSubtotalMinor === undefined ? undefined : money(Number(body.freeAboveSubtotalMinor)),
    minimumSubtotal: body.minimumSubtotalMinor === undefined ? undefined : money(Number(body.minimumSubtotalMinor)),
    priority: Number(body.priority ?? 0),
    version: Number(body.version ?? 1),
    active: body.active !== false,
    startsAt: body.startsAt ? Number(body.startsAt) : now,
    endsAt: body.endsAt ? Number(body.endsAt) : undefined
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "delivery_rule.created", entityType: "delivery_rule", entityId: rule.id, reason: "admin configured customer delivery pricing", after: rule, createdAt: now });
  return json(res, 201, rule);
}

async function adminCreateFeeRule(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const sources = new Set(["vendor_contract", "campaign_credit", "plan", "category", "market_default"]);
  const calculations = new Set(["fixed", "percentage", "credit"]);
  const bases = new Set(["supplier_net", "supplier_gross", "retail_net", "retail_gross", "shipping_reimbursement"]);
  if (!sources.has(String(body.source)) || !calculations.has(String(body.calculation)) || !bases.has(String(body.basis))) throw new Error("Invalid fee rule configuration");
  const source = String(body.source) as FeeRuleSource;
  const calculation = String(body.calculation) as FeeCalculation;
  const basis = String(body.basis) as FeeBasis;
  const now = Date.now();
  const rule = runtime.feeRules.register({
    feeCode: String(body.feeCode ?? "sales_service"),
    marketId: MARKET_ID,
    source,
    calculation,
    basis,
    vendorId: body.vendorId ? String(body.vendorId) : undefined,
    planCode: body.planCode ? String(body.planCode) : undefined,
    categoryCode: body.categoryCode ? String(body.categoryCode) : undefined,
    fulfilmentMode: body.fulfilmentMode === "pickup" || body.fulfilmentMode === "local_delivery" || body.fulfilmentMode === "shipping" ? body.fulfilmentMode : undefined,
    fixedAmount: body.fixedMinor === undefined ? undefined : money(Number(body.fixedMinor)),
    rateBps: body.rateBps === undefined ? undefined : Number(body.rateBps),
    capAmount: body.capMinor === undefined ? undefined : money(Number(body.capMinor)),
    floorAmount: body.floorMinor === undefined ? undefined : money(Number(body.floorMinor)),
    taxRateBps: Number(body.taxRateBps ?? 2400),
    priority: Number(body.priority ?? 0),
    version: Number(body.version ?? 1),
    active: body.active !== false,
    startsAt: body.startsAt ? Number(body.startsAt) : now,
    endsAt: body.endsAt ? Number(body.endsAt) : undefined
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "fee_rule.created", entityType: "fee_rule", entityId: rule.id, reason: "admin configured versioned B2B service fee rule", after: rule, createdAt: now });
  return json(res, 201, rule);
}

async function adminApplyProcurementCommercials(req: IncomingMessage, res: ServerResponse, procurementId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const before = runtime.procurement.record(procurementId);
  const order = runtime.commerce.getOrder(before.orderId);
  const line = order.lines.find((entry) => entry.id === before.orderLineId);
  if (!line) throw new Error("Procurement order line not found");
  const retailGross = multiplyMoney(line.retailUnitPrice, before.accruedQuantity - before.reversedQuantity);
  const retailNet = splitGrossTax(retailGross, line.taxRateBps).net;
  const subscription = runtime.plans.currentForVendor(before.vendorId, Date.now());
  const shippingReimbursement = money(Number(body.shippingReimbursementMinor ?? 0));
  const snapshots = runtime.feeRules.resolve({
    marketId: order.marketId,
    vendorId: before.vendorId,
    planCode: subscription?.planCode,
    categoryCode: line.categoryCodeSnapshot,
    fulfilmentMode: order.fulfilmentMode,
    supplierNet: before.net,
    supplierGross: before.gross,
    retailNet,
    retailGross,
    shippingReimbursement,
    now: Date.now()
  });
  const updated = runtime.procurement.applyCommercialSnapshot({ procurementId, feeSnapshots: snapshots, shippingReimbursement, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "procurement.commercial_snapshot", entityType: "procurement", entityId: procurementId, reason: "versioned service fee and shipping reimbursement resolved before payable approval", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminDisputes(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  return json(res, 200, { disputes: runtime.disputes.all() });
}

async function adminOpenDispute(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const order = runtime.commerce.getOrder(String(body.orderId ?? ""));
  const result = runtime.disputes.open({
    provider: String(body.provider ?? "dev-psp"),
    providerCaseId: String(body.providerCaseId ?? ""),
    providerEventId: String(body.providerEventId ?? ""),
    orderId: order.id,
    paymentId: order.paymentId,
    amount: money(Number(body.amountMinor ?? order.total.minor)),
    reasonCode: String(body.reasonCode ?? "unspecified"),
    evidenceDeadline: body.evidenceDeadline ? Number(body.evidenceDeadline) : undefined,
    now: Date.now()
  });
  if (!result.duplicate) runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "payment_dispute.opened", entityType: "payment_dispute", entityId: result.dispute.id, reason: result.dispute.reasonCode, after: result.dispute, createdAt: Date.now() });
  return json(res, result.duplicate ? 200 : 201, result);
}

async function adminAddDisputeEvidence(req: IncomingMessage, res: ServerResponse, disputeId: string) {
  const principal = requirePlatform(req, true);
  const body = await readJson(req);
  const kinds = new Set(["order_confirmation", "shipment_tracking", "proof_of_delivery", "pickup_proof", "customer_message", "product_description", "refund_record", "other"]);
  if (!kinds.has(String(body.kind))) throw new Error("Invalid dispute evidence kind");
  const updated = runtime.disputes.addEvidence({ disputeId, kind: body.kind, reference: String(body.reference ?? ""), description: body.description ? String(body.description) : undefined, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "payment_dispute.evidence_added", entityType: "payment_dispute", entityId: disputeId, reason: String(body.kind), after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminSubmitDispute(req: IncomingMessage, res: ServerResponse, disputeId: string) {
  const principal = requirePlatform(req, true);
  const updated = runtime.disputes.submit({ disputeId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "payment_dispute.submitted", entityType: "payment_dispute", entityId: disputeId, reason: "evidence package submitted to PSP", after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminResolveDispute(req: IncomingMessage, res: ServerResponse, disputeId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  if (body.outcome !== "won" && body.outcome !== "lost") throw new Error("Dispute outcome must be won or lost");
  const result = runtime.disputes.resolve({ disputeId, providerEventId: String(body.providerEventId ?? ""), outcome: body.outcome, reason: body.reason ? String(body.reason) : undefined, now: Date.now() });
  if (!result.duplicate) runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `payment_dispute.${body.outcome}`, entityType: "payment_dispute", entityId: disputeId, reason: body.reason ? String(body.reason) : "provider dispute outcome", after: result.dispute, createdAt: Date.now() });
  return json(res, 200, result);
}

async function adminAllocateDispute(req: IncomingMessage, res: ServerResponse, disputeId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  if (body.allocation !== "platform" && body.allocation !== "vendor") throw new Error("Liability allocation must be platform or vendor");
  const updated = runtime.disputes.allocateLoss({ disputeId, allocation: body.allocation, reason: String(body.reason ?? ""), actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `payment_dispute.liability_${body.allocation}`, entityType: "payment_dispute", entityId: disputeId, reason: updated.liabilityReason, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminApproveProcurementPayable(req: IncomingMessage, res: ServerResponse, procurementId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const before = runtime.procurement.record(procurementId);
  const updated = runtime.procurement.approvePayable(procurementId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "procurement.approved_payable", entityType: "procurement", entityId: procurementId, reason: "platform finance approved matched supplier invoice", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminCreateSettlement(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const now = Date.now();
  const batch = runtime.settlements.createDraft({
    marketId: MARKET_ID,
    procurementIds: Array.isArray(body.procurementIds) ? body.procurementIds.map(String) : [],
    periodStart: body.periodStart ? Number(body.periodStart) : now - 7 * 24 * 60 * 60 * 1000,
    periodEnd: body.periodEnd ? Number(body.periodEnd) : now,
    createdBy: principal.userId,
    now
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "settlement.created", entityType: "settlement", entityId: batch.id, reason: "finance payout batch draft", after: { totalMinor: batch.totalPayable.minor, lines: batch.lines.length }, createdAt: now });
  return json(res, 201, batch);
}

function adminSubmitSettlement(req: IncomingMessage, res: ServerResponse, batchId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const before = runtime.settlements.get(batchId);
  const updated = runtime.settlements.submitForApproval({ batchId, actorId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "settlement.submitted", entityType: "settlement", entityId: batchId, reason: "reconciliation complete; maker submitted for checker approval", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminApproveSettlement(req: IncomingMessage, res: ServerResponse, batchId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const before = runtime.settlements.get(batchId);
  const updated = runtime.settlements.approve({ batchId, checkerId: principal.userId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "settlement.approved", entityType: "settlement", entityId: batchId, reason: "maker/checker payout approval", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminPaySettlement(req: IncomingMessage, res: ServerResponse, batchId: string) {
  const principal = requirePlatformPermission(req, "finance.write", true);
  const body = await readJson(req);
  const before = runtime.settlements.get(batchId);
  const updated = runtime.settlements.markPaid({ batchId, actorId: principal.userId, payoutReference: String(body.payoutReference ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "settlement.paid", entityType: "settlement", entityId: batchId, reason: "external bank/PSP payout reference recorded", before, after: updated, createdAt: Date.now() });
  runtime.outbox.enqueue({ type: "settlement.paid", aggregateType: "settlement", aggregateId: batchId, payload: { payoutReference: updated.payoutReference, totalMinor: updated.totalPayable.minor }, idempotencyKey: `settlement-paid:${batchId}`, now: Date.now() });
  for (const vendorId of new Set(updated.lines.map((line) => line.vendorId))) runtime.notificationOrchestrator.emit({ vendorId, eventType: "settlement.paid", title: "Η εκκαθάριση πληρώθηκε", body: `${formatMoney(updated.totalPayable)} · ${updated.payoutReference}`, payload: { settlementId: batchId }, dedupeKey: `vendor-settlement:${batchId}:${vendorId}`, now: Date.now() });
  return json(res, 200, updated);
}

async function adminApproveReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const body = await readJson(req);
  const before = runtime.returns.get(returnId);
  const updated = runtime.returns.approve({ returnId, actorId: principal.userId, inspectionRequired: Boolean(body.inspectionRequired), note: body.note ? String(body.note) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.approved", entityType: "return", entityId: returnId, reason: body.note ? String(body.note) : "platform return review", before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminAuthorizeReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const body = await readJson(req);
  const destinationType = new Set(["vendor", "platform_inspection", "repairer"]).has(String(body.destinationType)) ? body.destinationType : "vendor";
  const returnCostPayer = new Set(["customer", "platform", "vendor"]).has(String(body.returnCostPayer)) ? body.returnCostPayer : "platform";
  const item = runtime.returns.get(returnId);
  if (!item) throw new Error("Return case not found");
  const updated = runtime.returns.issueAuthorization({
    returnId, actorId: principal.userId, destinationType,
    destinationVendorId: destinationType === "vendor" ? String(body.destinationVendorId ?? item.vendorId) : undefined,
    instructions: String(body.instructions ?? "Ακολούθησε τις οδηγίες επιστροφής που εμφανίζονται στον λογαριασμό σου."),
    returnCostPayer,
    carrier: body.carrier ? String(body.carrier) : undefined,
    trackingNumber: body.trackingNumber ? String(body.trackingNumber) : undefined,
    now: Date.now()
  });
  runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "return.authorized", title: "Η επιστροφή σου εγκρίθηκε για αποστολή", body: `${updated.authorization?.rmaCode} · ${updated.authorization?.instructions}`, payload: { returnId, rmaCode: updated.authorization?.rmaCode }, dedupeKey: `return-authorized:${returnId}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.authorized", entityType: "return", entityId: returnId, reason: updated.authorization?.rmaCode, before: item, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminInspectReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const body = await readJson(req);
  const before = runtime.returns.get(returnId);
  const updated = runtime.returns.inspect({ returnId, actorId: principal.userId, disposition: body.disposition === "blocked" ? "blocked" : "sellable", findings: body.findings ? String(body.findings) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.inspected", entityType: "return", entityId: returnId, reason: updated.inspectionFindings, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminApproveReturnRemedy(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const body = await readJson(req);
  const remedies = new Set(["refund", "replacement", "repair", "price_reduction"]);
  const remedy = remedies.has(String(body.remedy)) ? body.remedy : undefined;
  const before = runtime.returns.get(returnId);
  const priceReduction = remedy === "price_reduction" ? money(Number(body.amountMinor ?? 0)) : undefined;
  const updated = runtime.returns.approveRemedy({ returnId, actorId: principal.userId, remedy, priceReduction, repairSlaMs: body.repairSlaMs ? Number(body.repairSlaMs) : undefined, now: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "return.remedy_approved", title: "Εγκρίθηκε λύση για την επιστροφή σου", body: `Return ${updated.id} · ${updated.approvedRemedy}`, payload: { returnId, remedy: updated.approvedRemedy }, dedupeKey: `return-remedy:${returnId}:${updated.approvedRemedy}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.remedy_approved", entityType: "return", entityId: returnId, reason: updated.approvedRemedy, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

function adminExecutePriceReduction(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const before = runtime.returns.get(returnId);
  const updated = runtime.returns.executePriceReduction({ returnId, actorId: principal.userId, now: Date.now() });
  runtime.recalls.resolveForReturn(returnId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.price_reduction_completed", entityType: "return", entityId: returnId, reason: updated.priceReduction ? formatMoney(updated.priceReduction) : undefined, before, after: updated, createdAt: Date.now() });
  return json(res, 200, updated);
}

async function adminRefundReturn(req: IncomingMessage, res: ServerResponse, returnId: string) {
  const principal = requirePlatformPermission(req, "returns.manage", true);
  const body = await readJson(req);
  const before = runtime.returns.get(returnId);
  let updated = before;
  if (!updated) throw new Error("Return case not found");
  // Backward-compatible fast path used by the existing development smoke workflow.
  if (updated.status === "received") updated = runtime.returns.inspect({ returnId, actorId: principal.userId, disposition: body.disposition === "blocked" ? "blocked" : "sellable", findings: body.note ? String(body.note) : undefined, now: Date.now() });
  if (updated.status === "inspected") updated = runtime.returns.approveRemedy({ returnId, actorId: principal.userId, remedy: "refund", now: Date.now() });
  if (updated.status !== "remedy_approved" || updated.approvedRemedy !== "refund") throw new Error("Return is not approved for refund");
  updated = runtime.returns.executeRefund({ returnId, actorId: principal.userId, note: body.note ? String(body.note) : undefined, now: Date.now() });
  runtime.recalls.resolveForReturn(returnId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "return.refunded", entityType: "return", entityId: returnId, reason: body.note ? String(body.note) : "platform refund decision", before, after: updated, createdAt: Date.now() });
  runtime.notificationOrchestrator.emit({ userId: updated.customerId, eventType: "return.refunded", title: "Η επιστροφή σου αποζημιώθηκε", body: `Return ${returnId} · η επιστροφή χρημάτων καταγράφηκε.`, payload: { returnId, orderId: updated.orderId }, dedupeKey: `customer-return:${returnId}:refunded`, now: Date.now() });
  return json(res, 200, updated);
}

function adminOutbox(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  const scheduledNames = ["reservation-expiry", "compliance-document-expiry", "stock-freshness", "search-reconcile", "analytics-retention", "fulfilment-sla", "substitution-expiry", "cms-scheduled-publication", "promotion-lifecycle", "notification-delivery", "security-event-retention", "recently-viewed-retention", "saved-product-alert-reconcile", "saved-search-alert-reconcile", "rate-limit-prune"];
  return json(res, 200, {
    events: runtime.outbox.events(),
    scheduledJobs: scheduledNames.map((name) => runtime.scheduledJobStore.state(name)).filter(Boolean),
    stockFreshness: runtime.stockFreshness.all(Date.now()),
    searchDocuments: runtime.search.documents().map((document) => ({ id: document.id, type: document.type, marketId: document.marketId, available: document.available }))
  });
}

function adminAudit(req: IncomingMessage, res: ServerResponse) {
  requirePlatform(req);
  return json(res, 200, { events: runtime.audit.events().slice(-250).reverse() });
}

function accountShipments(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePrincipal(req);
  const orderIds = new Set(runtime.commerce.orders().filter((order) => order.customerId === principal.userId).map((order) => order.id));
  return json(res, 200, { shipments: runtime.shipping.all().filter((shipment) => orderIds.has(shipment.orderId)) });
}

function vendorMedia(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { media: runtime.media.vendorAssets(vendorId) });
}

async function vendorCreateMediaUploadIntent(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const canonicalVariantId = String(body.canonicalVariantId ?? "");
  assertVendorCatalogRelationship(vendorId, canonicalVariantId);
  const kind = body.kind === "video" || body.kind === "document" ? body.kind : "image";
  const intent = runtime.media.createUploadIntent({
    canonicalVariantId,
    vendorId,
    kind,
    originalFilename: String(body.originalFilename ?? ""),
    altText: body.altText ? String(body.altText) : undefined,
    rightsOwner: body.rightsOwner ? String(body.rightsOwner) : undefined,
    now: Date.now()
  });
  return json(res, 201, intent);
}

async function vendorUploadMedia(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const bytes = Buffer.from(String(body.base64 ?? ""), "base64");
  if (!bytes.length) throw new Error("base64 upload payload is required in development mode");
  const asset = runtime.media.uploadAndFinalize({ intentToken: String(body.intentToken ?? ""), contentType: String(body.contentType ?? ""), bytes, now: Date.now(), expectedVendorId: vendorId });
  assertVendorScope(vendorId, asset.vendorId ?? "");
  runtime.outbox.enqueue({ type: "media.scan_requested", aggregateType: "product_media", aggregateId: asset.id, payload: { assetId: asset.id, vendorId }, idempotencyKey: `media-scan:${asset.id}`, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "product_media.uploaded", entityType: "product_media", entityId: asset.id, reason: "vendor media upload awaiting scan and moderation", after: asset, createdAt: Date.now() });
  return json(res, 201, asset);
}

function vendorComplianceDocuments(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { documents: runtime.trust.documents({ vendorId }) });
}

async function vendorSubmitComplianceDocument(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "catalog.write", true);
  const vendorId = requireVendor(principal);
  const body = await readJson(req);
  const canonicalVariantId = String(body.canonicalVariantId ?? "");
  assertVendorCatalogRelationship(vendorId, canonicalVariantId);
  const document = runtime.trust.submitComplianceDocument({
    canonicalVariantId,
    vendorId,
    type: String(body.type ?? ""),
    issuer: body.issuer ? String(body.issuer) : undefined,
    identifier: body.identifier ? String(body.identifier) : undefined,
    mediaAssetId: body.mediaAssetId ? String(body.mediaAssetId) : undefined,
    validFrom: body.validFrom ? Number(body.validFrom) : undefined,
    validTo: body.validTo ? Number(body.validTo) : undefined,
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "product_compliance.submitted", entityType: "product_compliance_document", entityId: document.id, reason: "vendor compliance evidence submitted", after: document, createdAt: Date.now() });
  return json(res, 201, document);
}

function vendorShipments(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePermission(req, "fulfilment.read");
  const vendorId = requireVendor(principal);
  return json(res, 200, { shipments: runtime.shipping.forVendor(vendorId) });
}

async function vendorCreateShipment(req: IncomingMessage, res: ServerResponse, path: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const vendorId = requireVendor(principal);
  const parts = path.split("/");
  const orderId = parts[4];
  const fulfilmentId = parts[6];
  const body = await readJson(req);
  const shipment = runtime.shipping.create({ orderId, fulfilmentId, vendorId, fromPostcode: String(body.fromPostcode ?? "23100"), packageCount: body.packageCount === undefined ? 1 : Number(body.packageCount), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "shipment.created", entityType: "shipment", entityId: shipment.id, reason: "vendor direct-shipping workflow", after: shipment, createdAt: Date.now() });
  return json(res, 201, shipment);
}

function vendorCreateShippingLabel(req: IncomingMessage, res: ServerResponse, shipmentId: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const vendorId = requireVendor(principal);
  const before = runtime.shipping.get(shipmentId);
  const shipment = runtime.shipping.createLabel({ shipmentId, vendorId, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "shipment.label_created", entityType: "shipment", entityId: shipment.id, reason: "carrier label generated", before, after: shipment, createdAt: Date.now() });
  return json(res, 200, shipment);
}

function vendorHandoverShipment(req: IncomingMessage, res: ServerResponse, shipmentId: string) {
  const principal = requirePermission(req, "fulfilment.write", true);
  const vendorId = requireVendor(principal);
  const before = runtime.shipping.get(shipmentId);
  const handoverNow = Date.now();
  const orderBefore = runtime.commerce.getOrder(before.orderId);
  const fulfilmentBefore = orderBefore.fulfilments.find((item) => item.id === before.fulfilmentId);
  const shipment = runtime.shipping.handToCarrier({ shipmentId, vendorId, now: handoverNow });
  if (fulfilmentBefore) runtime.orderOperations.recordFulfilmentTransition({ orderId: before.orderId, fulfilmentId: before.fulfilmentId, actorType: "vendor", actorId: principal.userId, previousStatus: fulfilmentBefore.status, status: "shipped", now: handoverNow });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "shipment.handed_to_carrier", entityType: "shipment", entityId: shipment.id, reason: "vendor confirmed physical carrier handover", before, after: shipment, createdAt: handoverNow });
  return json(res, 200, shipment);
}

function adminMedia(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "catalog.read");
  return json(res, 200, { media: runtime.media.all() });
}

async function adminReviewMedia(req: IncomingMessage, res: ServerResponse, assetId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const before = runtime.media.get(assetId);
  if (!before) throw new Error("Product media asset not found");
  const reviewed = runtime.media.review({
    assetId,
    actorId: principal.userId,
    rightsStatus: body.rightsStatus === "rejected" ? "rejected" : body.rightsStatus === "approved" ? "approved" : undefined,
    moderationStatus: body.moderationStatus === "rejected" ? "rejected" : body.moderationStatus === "approved" ? "approved" : undefined,
    reason: body.reason ? String(body.reason) : undefined,
    now: Date.now()
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "product_media.reviewed", entityType: "product_media", entityId: assetId, reason: body.reason ? String(body.reason) : "media rights/moderation review", before, after: reviewed, createdAt: Date.now() });
  return json(res, 200, reviewed);
}

function adminComplianceDocuments(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "catalog.read");
  return json(res, 200, { documents: runtime.trust.documents() });
}

async function adminReviewComplianceDocument(req: IncomingMessage, res: ServerResponse, documentId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const decision = body.decision === "rejected" ? "rejected" : "verified";
  const before = runtime.trust.documents().find((document) => document.id === documentId);
  if (!before) throw new Error("Compliance document not found");
  const reviewed = runtime.trust.reviewComplianceDocument({ documentId, actorId: principal.userId, decision, reason: body.reason ? String(body.reason) : undefined, now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `product_compliance.${decision}`, entityType: "product_compliance_document", entityId: documentId, reason: body.reason ? String(body.reason) : "compliance evidence review", before, after: reviewed, createdAt: Date.now() });
  return json(res, 200, reviewed);
}

function adminProductNotices(req: IncomingMessage, res: ServerResponse) {
  requirePlatformPermission(req, "catalog.read");
  return json(res, 200, { notices: runtime.trust.notices() });
}

async function adminOpenProductNotice(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const type = new Set(["safety_notice", "recall", "compliance_hold", "content_notice"]).has(String(body.type)) ? String(body.type) as any : "compliance_hold";
  const severity = new Set(["low", "medium", "high", "critical"]).has(String(body.severity)) ? String(body.severity) as any : "high";
  const now = Date.now();
  const notice = runtime.trust.openNotice({ canonicalVariantId, type, severity, details: String(body.details ?? ""), actorId: principal.userId, now });
  if (type === "recall" || type === "compliance_hold") runtime.search.remove(canonicalVariantId);
  let affected: readonly any[] = [];
  if (type === "recall") {
    affected = runtime.recalls.activate({ noticeId: notice.id, canonicalVariantId, now });
    for (const recallCase of affected) {
      if (!recallCase.customerId) continue;
      runtime.notificationOrchestrator.emit({ userId: recallCase.customerId, eventType: "product.recall", title: "Σημαντική ενημέρωση ανάκλησης προϊόντος", body: `Υπάρχει ανάκληση για προϊόν της παραγγελίας ${recallCase.orderId}. Άνοιξε τον λογαριασμό σου για τις διαθέσιμες λύσεις.`, payload: { recallCaseId: recallCase.id, noticeId: notice.id, orderId: recallCase.orderId, canonicalVariantId }, dedupeKey: `product-recall:${recallCase.id}`, now });
      runtime.recalls.markNotified({ recallCaseId: recallCase.id, now });
    }
  }
  runtime.outbox.enqueue({ type: "catalog.product_availability_changed", aggregateType: "canonical_product", aggregateId: canonicalVariantId, payload: { canonicalVariantId, reason: type, suppressed: type === "recall" || type === "compliance_hold" }, idempotencyKey: `catalog-availability:${canonicalVariantId}:${notice.id}`, now });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: `product_notice.${type}`, entityType: "canonical_product", entityId: canonicalVariantId, reason: notice.details, after: { ...notice, affectedCustomers: affected.length }, createdAt: now });
  return json(res, 201, { ...notice, affectedCustomers: affected.length });
}

async function adminResolveProductNotice(req: IncomingMessage, res: ServerResponse, noticeId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const notice = runtime.trust.resolveNotice({ noticeId, actorId: principal.userId, resolution: String(body.resolution ?? ""), now: Date.now() });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "product_notice.resolved", entityType: "product_notice", entityId: noticeId, reason: notice.resolution, after: notice, createdAt: Date.now() });
  return json(res, 200, notice);
}

async function adminRestoreProduct(req: IncomingMessage, res: ServerResponse, canonicalVariantId: string) {
  const principal = requirePlatformPermission(req, "catalog.write", true);
  const body = await readJson(req);
  const reason = String(body.reason ?? "");
  const now = Date.now();
  runtime.trust.restoreProduct({ canonicalVariantId, actorId: principal.userId, reason, now });
  reindexCanonical(canonicalVariantId);
  runtime.outbox.enqueue({ type: "catalog.product_availability_changed", aggregateType: "canonical_product", aggregateId: canonicalVariantId, payload: { canonicalVariantId, reason: "manual_restore", suppressed: false }, idempotencyKey: `catalog-restore:${canonicalVariantId}:${now}`, now });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "canonical_product.restored", entityType: "canonical_product", entityId: canonicalVariantId, reason, after: runtime.catalog.canonical(canonicalVariantId), createdAt: Date.now() });
  return json(res, 200, runtime.catalog.canonical(canonicalVariantId));
}

async function adminRunJobs(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatform(req, true);
  const now = Date.now();
  const scheduled = await runtime.scheduledJobs.runDue(now, 20);
  const worker = await runtime.worker.runOnce(now, 100);
  const fairnessAnomalies = runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true }).flatMap((product) => {
    const snapshot = runtime.fairness.snapshot({ marketId: MARKET_ID, canonicalVariantId: product.id });
    return runtime.fairnessGovernance.detectExposureAnomalies({ marketId: MARKET_ID, canonicalVariantId: product.id, exposures: snapshot.exposures, now });
  });
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "jobs.manual_run", entityType: "system", entityId: "background_jobs", reason: "manual development worker + persistent-schedule lease run", after: { worker, scheduled, fairnessAnomalies }, createdAt: now });
  return json(res, 200, { worker, scheduled, fairnessAnomalies });
}

function adminReplayOutbox(req: IncomingMessage, res: ServerResponse, eventId: string) {
  const principal = requirePlatform(req, true);
  const replayed = runtime.outbox.replay(eventId, Date.now());
  runtime.audit.record({ actorId: principal.userId, actorRole: principal.roles[0], action: "outbox.replayed", entityType: "outbox_event", entityId: eventId, reason: "manual replay after operational review", after: replayed, createdAt: Date.now() });
  return json(res, 200, replayed);
}

async function adminCourierEvent(req: IncomingMessage, res: ServerResponse) {
  const principal = requirePlatform(req, true);
  if (!principal.roles.some((role) => role === "super_admin" || role === "logistics" || role === "vendor_operations")) throw new Error("Platform permission required");
  const body = await readJson(req);
  const result = runtime.shipping.processProviderEvent({
    providerEventId: String(body.providerEventId ?? ""),
    shipmentId: String(body.shipmentId ?? ""),
    status: body.status,
    reason: body.reason ? String(body.reason) : undefined,
    proof: body.proof && typeof body.proof === "object" ? body.proof : undefined,
    now: Date.now()
  });
  if (!result.duplicate && result.shipment.status === "delivered") {
    const order = runtime.commerce.getOrder(result.shipment.orderId);
    runtime.orderOperations.recordFulfilmentTransition({ orderId: result.shipment.orderId, fulfilmentId: result.shipment.fulfilmentId, actorType: "provider", actorId: String(body.providerEventId ?? "courier"), previousStatus: "shipped", status: "delivered", now: Date.now() });
    runtime.procurement.accrueFulfilledLines(order, Date.now());
    if (order.customerId) runtime.notificationOrchestrator.emit({ userId: order.customerId, eventType: "shipment.delivered", title: "Η αποστολή παραδόθηκε", body: `${result.shipment.trackingNumber ?? result.shipment.id}`, payload: { shipmentId: result.shipment.id, orderId: order.id }, dedupeKey: `shipment-delivered:${result.shipment.id}`, now: Date.now() });
  }
  return json(res, 200, result);
}

function assertVendorCatalogRelationship(vendorId: string, canonicalVariantId: string): void {
  if (!runtime.catalog.canonical(canonicalVariantId)) throw new Error("Canonical product not found");
  const hasOffer = runtime.commerce.offersForVariant(canonicalVariantId).some((offer) => offer.vendorId === vendorId);
  const hasSubmission = runtime.catalog.submissions({ vendorId }).some((submission) => submission.canonicalVariantId === canonicalVariantId);
  if (!hasOffer && !hasSubmission) throw new Error("Vendor is not related to this canonical product");
}

function reindexCanonical(canonicalVariantId: string): void {
  const canonical = runtime.catalog.canonical(canonicalVariantId);
  if (!canonical || !canonical.active || canonical.suppressed || canonical.recalled) {
    runtime.search.remove(canonicalVariantId);
    return;
  }
  const details = demoProductDetails[canonicalVariantId];
  const offers = runtime.commerce.offersForVariant(canonicalVariantId);
  runtime.search.upsert({
    id: canonical.id,
    type: "product",
    marketId: canonical.marketId,
    title: canonical.titleEl,
    titleEl: canonical.titleEl,
    titleEn: canonical.titleEn ?? canonical.identity.title,
    body: canonical.descriptionEl ?? "",
    brand: canonical.identity.brand,
    model: canonical.identity.model,
    identifiers: [canonical.identity.gtin, canonical.identity.mpn].filter(Boolean) as string[],
    categoryCodes: [canonical.categoryCode],
    synonyms: canonical.synonyms,
    available: offers.some((offer) => runtime.inventory.hasOffer(offer.offerId) && runtime.inventory.availableToSell(offer.offerId) > 0 && offerStockIsFresh(offer, Date.now())),
    pickupToday: offers.some((offer) => offer.fulfilmentMode === "pickup" && runtime.inventory.hasOffer(offer.offerId) && runtime.inventory.availableToSell(offer.offerId) > 0 && offerStockIsFresh(offer, Date.now())),
    adviceAvailable: canonical.adviceAvailable ?? false,
    priceMinor: canonical.platformPrice.minor,
    metadata: { variantId: canonical.id, accent: details?.accent }
  });
}

function operationalAlerts() {
  const alerts: { severity: string; message: string }[] = [];
  const awaiting = runtime.commerce.orders().flatMap((order) => order.fulfilments).filter((fulfilment) => fulfilment.status === "awaiting_acceptance").length;
  if (awaiting) alerts.push({ severity: "attention", message: `${awaiting} vendor fulfilment order(s) await acceptance.` });
  const openReturns = runtime.returns.all().filter((item) => !["refunded", "closed", "rejected"].includes(item.status)).length;
  if (openReturns) alerts.push({ severity: "attention", message: `${openReturns} return case(s) need action.` });
  const freshness = runtime.stockFreshness.all(Date.now());
  const staleStock = freshness.filter((item) => item.state === "stale");
  const dueStock = freshness.filter((item) => item.state === "due_soon");
  const failedNotifications = runtime.notifications.all().filter((item) => item.channel !== "in_app" && item.status === "failed");
  const queuedNotifications = runtime.notifications.all().filter((item) => item.channel !== "in_app" && ["queued", "sending"].includes(item.status));
  const openPrivacy = runtime.privacyRequests.all().filter((item) => ["submitted", "processing"].includes(item.status));
  const overduePrivacy = openPrivacy.filter((item) => item.targetAt < Date.now());
  if (staleStock.length) alerts.push({ severity: "warning", message: `${staleStock.length} supplier offer(s) are excluded because stock confirmation expired.` });
  if (dueStock.length) alerts.push({ severity: "attention", message: `${dueStock.length} supplier offer(s) need stock confirmation soon.` });
  if (failedNotifications.length) alerts.push({ severity: "warning", message: `${failedNotifications.length} external notification(s) exhausted delivery retries.` });
  if (queuedNotifications.length >= 25) alerts.push({ severity: "attention", message: `${queuedNotifications.length} external notification(s) are waiting for provider delivery.` });
  if (overduePrivacy.length) alerts.push({ severity: "warning", message: `${overduePrivacy.length} privacy request(s) exceeded their operational response target.` });
  else if (openPrivacy.length) alerts.push({ severity: "attention", message: `${openPrivacy.length} privacy request(s) require privacy-operations follow-up.` });
  for (const product of runtime.catalog.canonicals({ marketId: MARKET_ID, activeOnly: true })) {
    const snapshot = runtime.fairness.snapshot({ marketId: MARKET_ID, canonicalVariantId: product.id });
    const values = Object.values(snapshot.exposures);
    if (snapshot.selections >= 200 && values.length > 1) {
      const total = values.reduce((sum, value) => sum + value, 0);
      const target = 1 / values.length;
      const maxDeviation = Math.max(...values.map((value) => Math.abs(value / total - target)));
      if (maxDeviation > 0.05) alerts.push({ severity: "warning", message: `Fairness deviation above 5% for ${product.titleEl}.` });
    }
  }
  return alerts.length ? alerts : [{ severity: "ok", message: "No current operational exceptions in the development runtime." }];
}

function liveOffers(variantId: string, postcode = "23100", fulfilmentMode: "pickup" | "local_delivery" | "shipping" = "pickup") {
  const offers = runtime.commerce.offersForVariant(variantId);
  if (!offers.length) throw new Error("Product not found");
  const now = Date.now();
  return offers.map((offer) => {
    const openFulfilments = runtime.commerce.orders().filter((order) => order.fulfilmentMode === fulfilmentMode).flatMap((order) => order.fulfilments).filter((f) => f.vendorId === offer.vendorId && f.locationId === offer.locationId && !["delivered","rejected","failed","cancelled"].includes(f.status)).length;
    const capacity = runtime.fulfilmentCapacity.status({ vendorId: offer.vendorId, locationId: offer.locationId, mode: fulfilmentMode, currentOpenFulfilments: openFulfilments, now });
    return { ...offer, availableToSell: runtime.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now), canServe: offer.canServe && runtime.deliveryCoverage.canServe({ vendorId: offer.vendorId, locationId: offer.locationId, context: { marketId: MARKET_ID, postcode, fulfilmentMode, now } }), capacityOpen: offer.capacityOpen && capacity.open };
  });
}

function allSupplierOffers() {
  return runtime.catalog.canonicals({ marketId: MARKET_ID }).flatMap((product) => runtime.commerce.offersForVariant(product.id));
}

function categoryLabel(code: string): string {
  const demo = Object.values(demoProductDetails).find((details) => details.categoryCode === code);
  if (demo) return demo.categoryLabel;
  return code.split("-").map((part) => part ? part[0].toLocaleUpperCase("el-GR") + part.slice(1) : part).join(" ");
}

function currentPrincipal(req: IncomingMessage): SessionPrincipal | undefined {
  return runtime.auth.session(cookie(req, SESSION_COOKIE), Date.now());
}

function requirePrincipal(req: IncomingMessage): SessionPrincipal {
  const principal = currentPrincipal(req);
  if (!principal) throw new Error("Authentication required");
  return principal;
}

function requirePermission(req: IncomingMessage, permission: Permission, csrf = false): SessionPrincipal {
  const principal = requirePrincipal(req);
  if (!principal.roles.some((role) => can(role, permission))) throw new Error(`Permission denied: ${permission}`);
  if (csrf) runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return principal;
}

function requirePlatform(req: IncomingMessage, csrf = false): SessionPrincipal {
  const principal = requirePrincipal(req);
  const platformRoles = new Set(["super_admin", "vendor_operations", "catalog_qa", "customer_support", "platform_finance", "content_seo", "compliance", "logistics", "auditor"]);
  if (!principal.roles.some((role) => platformRoles.has(role))) throw new Error("Platform permission required");
  if (csrf) runtime.auth.assertCsrf(principal, req.headers["x-csrf-token"]?.toString());
  return principal;
}

function requirePlatformPermission(req: IncomingMessage, permission: Permission, csrf = false): SessionPrincipal {
  const principal = requirePlatform(req, csrf);
  if (!principal.roles.some((role) => can(role, permission))) throw new Error(`Platform role lacks ${permission}`);
  return principal;
}

function requireVendor(principal: SessionPrincipal): string {
  if (!principal.vendorId) throw new Error("Vendor-scoped account required");
  return principal.vendorId;
}

function analyticsWindow(url: URL): { from: number; to: number } {
  const to = url.searchParams.get("to") ? new Date(String(url.searchParams.get("to"))).getTime() : Date.now();
  const from = url.searchParams.get("from") ? new Date(String(url.searchParams.get("from"))).getTime() : to - 30 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) throw new Error("Invalid analytics date range");
  if (to - from > 366 * 24 * 60 * 60 * 1000) throw new Error("Analytics date range cannot exceed 366 days");
  return { from, to };
}

function ensureVisitor(req: IncomingMessage, res: ServerResponse): string {
  const existing = cookie(req, VISITOR_COOKIE);
  if (existing) return existing;
  const value = randomBytes(16).toString("base64url");
  appendCookie(res, `${VISITOR_COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000${SECURE_COOKIES ? "; Secure" : ""}`);
  return value;
}

function cookie(req: IncomingMessage, name: string): string | undefined {
  const header = req.headers.cookie ?? "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

function appendCookie(res: ServerResponse, value: string): void {
  const current = res.getHeader("set-cookie");
  if (!current) res.setHeader("set-cookie", [value]);
  else if (Array.isArray(current)) res.setHeader("set-cookie", [...current.map(String), value]);
  else res.setHeader("set-cookie", [String(current), value]);
}

function readJson(req: IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let raw = "";
    let rejected = false;
    req.on("data", (chunk) => {
      if (rejected) return;
      raw += chunk;
      if (Buffer.byteLength(raw, "utf8") > 1_000_000) {
        rejected = true;
        reject(new Error("Request too large"));
      }
    });
    req.on("end", () => {
      if (rejected) return;
      const contentType = String(req.headers["content-type"] ?? "").toLowerCase();
      if (raw && !contentType.includes("application/json")) return reject(new Error("JSON content type is required"));
      try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", (error) => { if (!rejected) reject(error); });
  });
}

function recordSecurityFailure(req: IncomingMessage, requestId: string, error: unknown, message: string): void {
  let type: "rate_limit.exceeded" | "auth.login_failed" | "csrf.rejected" | "access.denied" | "request.rejected" | undefined;
  let severity: "low" | "medium" | "high" = "low";
  if (error instanceof RateLimitError) { type = "rate_limit.exceeded"; severity = "medium"; }
  else if (/invalid email or password/i.test(message)) { type = "auth.login_failed"; severity = "medium"; }
  else if (/csrf/i.test(message)) { type = "csrf.rejected"; severity = "high"; }
  else if (/permission|vendor isolation|only the assigned vendor/i.test(message)) { type = "access.denied"; severity = "medium"; }
  else if (/request too large|invalid json|json content type/i.test(message)) { type = "request.rejected"; severity = "low"; }
  if (!type) return;
  let actorUserId: string | undefined;
  try { actorUserId = currentPrincipal(req)?.userId; } catch { actorUserId = undefined; }
  runtime.securityEvents.record({
    type, severity, requestId, route: (req.url ?? "").split("?", 1)[0], method: req.method,
    subjectHash: hashAbuseKey(clientAddress(req)), actorUserId,
    details: error instanceof RateLimitError ? { limit: error.decision.limit, retryAfterMs: error.decision.retryAfterMs } : { reason: message },
    occurredAt: Date.now()
  });
}

function assertRequestRateLimit(req: IncomingMessage, scope: string, rule: { limit: number; windowMs: number }): void {
  assertRateLimitKey(`${scope}:ip:${hashAbuseKey(clientAddress(req))}`, rule);
}

function assertAuthenticatedRateLimit(req: IncomingMessage, scope: string, rule: { limit: number; windowMs: number }): void {
  const principal = currentPrincipal(req);
  const subject = principal ? `user:${principal.userId}` : `ip:${hashAbuseKey(clientAddress(req))}`;
  assertRateLimitKey(`${scope}:${subject}`, rule);
}

function assertRateLimitKey(key: string, rule: { limit: number; windowMs: number }): void {
  runtime.rateLimiter.assertAllowed({ key, rule, now: Date.now() });
}

function clientAddress(req: IncomingMessage): string {
  if (TRUST_PROXY) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "").split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress ?? "unknown";
}

function hashAbuseKey(value: string): string {
  return createHash("sha256").update(`buy-local-sparta-abuse-v1:${value}`).digest("hex").slice(0, 24);
}

function applySecurityHeaders(res: ServerResponse, requestId: string): void {
  res.setHeader("x-request-id", requestId);
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("cross-origin-opener-policy", "same-origin");
  res.setHeader("cross-origin-resource-policy", "same-origin");
  res.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=(self), payment=(self), usb=()");
  res.setHeader("content-security-policy", "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");
  if (SECURE_COOKIES) res.setHeader("strict-transport-security", "max-age=31536000; includeSubDomains");
}

function euroFilter(value: string | null): number | undefined {
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value.replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("Price filter must be a positive number");
  return Math.round(parsed * 100);
}

function json(res: ServerResponse, status: number, payload: unknown) {
  if (!res.headersSent) {
    res.statusCode = status;
    res.setHeader("content-type", "application/json; charset=utf-8");
    res.setHeader("cache-control", "no-store");
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  }
  res.end(JSON.stringify(payload));
}

function html(res: ServerResponse, payload: string) {
  res.statusCode = 200;
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  res.end(payload);
}

function redirect(res: ServerResponse, status: 301|302|307|308, location: string) {
  res.statusCode = status;
  res.setHeader("location", location);
  res.setHeader("cache-control", status === 301 || status === 308 ? "public, max-age=300" : "no-store");
  res.setHeader("x-content-type-options", "nosniff");
  res.end();
}

function text(res: ServerResponse, status: number, payload: string) {
  res.statusCode = status;
  res.setHeader("content-type", "text/plain; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "public, max-age=300");
  res.end(payload);
}

function xml(res: ServerResponse, status: number, payload: string) {
  res.statusCode = status;
  res.setHeader("content-type", "application/xml; charset=utf-8");
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("cache-control", "public, max-age=300");
  res.end(payload);
}

function xmlEsc(value: string): string {
  return value.replace(/[<>&'\"]/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[character] ?? character));
}
