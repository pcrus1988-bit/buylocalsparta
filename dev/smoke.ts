import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { BUILD_VERSION } from "./build.ts";

const port = 3200 + (process.pid % 300);
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["--experimental-strip-types", "dev/server.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port), PUBLIC_ORIGIN: base },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
server.stdout.on("data", (chunk) => { logs += chunk.toString(); });
server.stderr.on("data", (chunk) => { logs += chunk.toString(); });

try {
  await waitForHealth();
  const live = await fetch(base + "/api/health/live");
  assert.equal(live.status, 200);
  const liveBody = await live.json();
  assert.equal(liveBody.build, BUILD_VERSION);
  const ready = await fetch(base + "/api/health/ready");
  assert.equal(ready.status, 200);
  const readyBody = await ready.json();
  assert.equal(readyBody.ok, true);
  assert.equal(readyBody.checks.some((item: any) => item.name === "search_projection"), true);
  const storefrontDocument = await fetch(base + "/");
  assert.equal(storefrontDocument.headers.get("x-frame-options"), "DENY");
  assert.match(storefrontDocument.headers.get("permissions-policy") ?? "", /camera=\(\)/);
  assert.match(storefrontDocument.headers.get("content-security-policy") ?? "", /object-src 'none'/);
  assert.ok(storefrontDocument.headers.get("x-request-id"));
  const storefrontHtml = await storefrontDocument.text();
  assert.match(storefrontHtml, /class="skipLink" href="#main-content"/);
  assert.match(storefrontHtml, /id="main-content"/);
  const filteredCatalog = await request("/api/catalog?category=lighting-decor&maxPrice=60&advice=1");
  assert.deepEqual(filteredCatalog.data.products.map((item: any) => item.id), ["cv-desk-lamp"]);
  assert.equal(filteredCatalog.data.facets.categorySchema.commerceMode, "standard");
  assert.equal(filteredCatalog.data.facets.attributes.colour.some((item: any) => item.value === "brass"), true);
  const governedFilter = await request("/api/catalog?category=mobile-telecom-electronics&attr.connector=USB-C");
  assert.deepEqual(governedFilter.data.products.map((item: any) => item.id), ["cv-airpods-pro-2"]);
  assert.equal(governedFilter.data.facets.categorySchema.commerceMode, "compatibility_sensitive");
  const sortedCatalog = await request("/api/catalog?sort=price_asc");
  assert.deepEqual(sortedCatalog.data.products.map((item: any) => item.id), ["cv-notebook", "cv-desk-lamp", "cv-airpods-pro-2"]);
  const publicAvailability = await request("/api/vendors/vendor-demo-lakonian-home/availability");
  assert.equal(publicAvailability.data.scheduleConfigured, true);
  assert.equal(publicAvailability.data.deliveryZones.some((zone: any) => zone.mode === "local_delivery" && zone.postcodePrefixes.includes("231")), true);
  assert.ok(publicAvailability.data.pickupWindows.length >= 1);
  const blockedDeliveryQuote = await fetch(base + "/api/delivery/quote?vendorId=vendor-demo-lakonian-home&mode=local_delivery&postcode=10558&subtotalMinor=4900");
  assert.equal(blockedDeliveryQuote.status, 400);
  const homeContent = await request("/api/content/home?locale=el");
  assert.equal(homeContent.data.page.status, "published");
  assert.equal(homeContent.data.seo.canonicalUrl, `${base}/el`);
  const seededStories = await request("/api/content/stories?locale=el");
  assert.equal(seededStories.data.stories.some((item: any) => item.vendorId === "vendor-demo-lakonian-home" && item.status === "published"), true);
  const seededCollections = await request("/api/content/collections?locale=el");
  assert.equal(seededCollections.data.collections.some((item: any) => item.status === "published" && item.products.length >= 1), true);
  const localizedHome = await fetch(base + "/el");
  assert.equal(localizedHome.status, 200);
  assert.equal((await localizedHome.text()).includes('rel="canonical"'), true);
  const sitemap = await fetch(base + "/sitemap.xml");
  const sitemapText = await sitemap.text();
  assert.equal(sitemap.status, 200);
  assert.equal(sitemapText.includes(`${base}/el`), true);
  assert.equal(sitemapText.includes(`${base}/el/products/cv-airpods-pro-2`), true);
  const legacyShop = await fetch(base + "/shop", { redirect: "manual" });
  assert.equal(legacyShop.status, 301);
  assert.equal(legacyShop.headers.get("location"), "/el");
  const customer = await login("customer@demo.local", "Customer!123");
  const initialNotificationPreferences = await request("/api/account/notification-preferences", { cookie: customer.cookie });
  assert.equal(initialNotificationPreferences.data.defaults.email.includes("enabled"), true);
  const disabledOptionalEmail = await request("/api/account/notification-preferences", { method: "PUT", cookie: customer.cookie, csrf: customer.csrf, body: { channel: "email", eventType: "*", enabled: false } });
  assert.equal(disabledOptionalEmail.data.enabled, false);
  const initialCart = await request("/api/cart", { cookie: customer.cookie });
  const visitorCookie = cookieFrom(initialCart.headers, "bls_visitor");
  const customerCookies = [customer.cookie, visitorCookie].filter(Boolean).join("; ");

  // Personalization is explicit, customer-scoped and exportable. Product detail views—not search impressions—feed recent history.
  await request("/api/account/saved-products/cv-desk-lamp", { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  await request("/api/account/saved-vendors/vendor-demo-lakonian-home", { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  await request("/api/products/cv-desk-lamp", { cookie: customerCookies });
  const savedProductsInitial = await request("/api/account/saved-products", { cookie: customerCookies });
  assert.equal(savedProductsInitial.data.products.some((item: any) => item.canonicalVariantId === "cv-desk-lamp"), true);
  const savedVendorsInitial = await request("/api/account/saved-vendors", { cookie: customerCookies });
  assert.equal(savedVendorsInitial.data.vendors.some((item: any) => item.vendorId === "vendor-demo-lakonian-home"), true);
  const recentInitial = await request("/api/account/recently-viewed", { cookie: customerCookies });
  assert.equal(recentInitial.data.products.some((item: any) => item.canonicalVariantId === "cv-desk-lamp"), true);
  const savedAlertPreference = await request("/api/account/saved-products/cv-desk-lamp/alerts", {
    method: "PUT", cookie: customerCookies, csrf: customer.csrf,
    body: { priceDropEnabled: true, backInStockEnabled: true, minimumPriceDropMinor: 100 }
  });
  assert.equal(savedAlertPreference.data.preference.priceDropEnabled, true);
  assert.equal(savedAlertPreference.data.preference.lastObservedPriceMinor, 5900);
  const savedBottleSearch = await request("/api/account/saved-searches", {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { name: "Travel bottle locally", q: "ZXQJ-987654321", availability: "any", alertsEnabled: true }
  });
  assert.equal(savedBottleSearch.data.currentResultCount, 0);
  assert.equal(savedBottleSearch.data.savedSearch.alertsEnabled, true);
  const recommendedInitial = await request("/api/account/recommendations?limit=4", { cookie: customerCookies });
  assert.equal(recommendedInitial.data.enabled, true);
  assert.ok(recommendedInitial.data.recommendations.length >= 1);
  assert.equal(recommendedInitial.data.recommendations.some((item: any) => item.canonicalVariantId === "cv-desk-lamp"), false);
  assert.match(recommendedInitial.data.methodology, /Fair Vendor Exposure Engine/);
  assert.equal(recommendedInitial.data.recommendations.every((item: any) => typeof item.explanation === "string" && item.explanation.length > 0), true);
  assert.equal(JSON.stringify(recommendedInitial.data).includes("supplierPrice"), false);
  assert.equal(JSON.stringify(recommendedInitial.data).includes("purchasePrice"), false);
  const privacyExport = await request("/api/account/privacy/export", { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  assert.equal(privacyExport.data.export.subject.userId, customer.userId);
  assert.equal(privacyExport.data.export.personalization.savedProducts.some((item: any) => item.canonicalVariantId === "cv-desk-lamp"), true);
  assert.equal(privacyExport.data.export.data.savedProductAlerts.some((item: any) => item.canonicalVariantId === "cv-desk-lamp" && item.priceDropEnabled), true);
  assert.equal(privacyExport.data.export.data.savedSearches.some((item: any) => item.id === savedBottleSearch.data.savedSearch.id), true);
  assert.equal(JSON.stringify(privacyExport.data.export).includes("passwordHash"), false);
  assert.equal(privacyExport.data.request.status, "completed");

  // Category-governed commerce: compatibility-sensitive products cannot silently pass ordinary checkout.
  const compatibilityCart = await request("/api/cart/items", { method: "POST", cookie: customerCookies, body: { canonicalVariantId: "cv-airpods-pro-2", quantity: 1, postcode: "23100", fulfilmentMode: "pickup" } });
  assert.equal(compatibilityCart.data.compatibilityRequirements.some((item: any) => item.canonicalVariantId === "cv-airpods-pro-2"), true);
  const discountedCompatibilityCart = await request("/api/cart/coupon", { method: "POST", cookie: customerCookies, body: { code: "LOCAL10" } });
  assert.equal(discountedCompatibilityCart.data.coupon.code, "LOCAL10");
  assert.equal(discountedCompatibilityCart.data.discount.minor, 1290);
  assert.equal(discountedCompatibilityCart.data.total.minor, 11610);
  const blockedCompatibilityCheckout = await fetch(`${base}/api/checkout`, { method: "POST", headers: { cookie: customerCookies, "content-type": "application/json" }, body: JSON.stringify({ cartId: compatibilityCart.data.id, postcode: "23100", fulfilmentMode: "pickup" }) });
  assert.equal(blockedCompatibilityCheckout.status, 400);
  assert.match(String((await blockedCompatibilityCheckout.json()).error), /compatibility_confirmation_required/);
  const confirmedCompatibilityCheckout = await request("/api/checkout", { method: "POST", cookie: customerCookies, body: { cartId: compatibilityCart.data.id, postcode: "23100", fulfilmentMode: "pickup", compatibilityConfirmedVariantIds: ["cv-airpods-pro-2"] } });
  assert.equal(confirmedCompatibilityCheckout.data.order.status, "authorised");
  assert.equal(confirmedCompatibilityCheckout.data.order.discount.minor, 1290);
  assert.equal(confirmedCompatibilityCheckout.data.order.lines[0].discountAllocation.minor, 1290);
  const cancelledCouponOrder = await request(`/api/account/orders/${confirmedCompatibilityCheckout.data.order.id}/cancel`, { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: { reason: "Smoke-test compatibility acknowledgement checkout" } });
  assert.equal(cancelledCouponOrder.data.cancellation.paymentOutcome, "authorisation_cancelled");

  // Privacy-safe search attribution: the search event is tied to the same customer/visitor context.
  const trackedSearch = await request("/api/catalog?q=lamp&advice=1", { cookie: customerCookies });
  assert.ok(trackedSearch.data.searchEventId);
  assert.ok(trackedSearch.data.products.length >= 1);
  const trackedProduct = trackedSearch.data.products[0];
  const searchClick = await request("/api/analytics/search-click", { method: "POST", cookie: customerCookies, body: { searchEventId: trackedSearch.data.searchEventId, entityId: trackedProduct.id, entityType: "product", position: 0 } });
  assert.ok(searchClick.data.eventId);
  const zeroSearch = await request("/api/catalog?q=nonexistent-local-demand-xyz&minPrice=9999999", { cookie: customerCookies });
  assert.equal(zeroSearch.data.products.length, 0);
  assert.ok(zeroSearch.data.searchEventId);

  // Critical journey B: private Ask Local offer -> special offer cart -> checkout.
  const ask = await request("/api/ask-local", {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { canonicalVariantId: "cv-desk-lamp", sourceUrl: "https://example.test/lamp", need: "price", quantity: 1, postcode: "23100" }
  });
  assert.equal(ask.data.request.assignedVendorId, "vendor-demo-lakonian-home");
  const vendor = await login("home@demo.local", "VendorOwner!123");
  const privateOffer = await request(`/api/vendor/counteroffers/${ask.data.request.id}/offer`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf,
    body: { priceMinor: 4_900, inclusions: ["Local advice"], fulfilmentPromise: "Pickup in Sparta", validForHours: 24 }
  });
  const offerNotifications = await request("/api/account/notifications", { cookie: customerCookies });
  assert.equal(offerNotifications.data.notifications.some((item: any) => item.eventType === "counteroffer.offer_received"), true);
  const specialCart = await request(`/api/account/private-offers/${privateOffer.data.id}/add-to-cart`, {
    method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {}
  });
  assert.equal(specialCart.data.cart.items.length, 1);
  assert.equal(specialCart.data.cart.items[0].specialOffer, true);
  assert.equal(specialCart.data.cart.items[0].unitPrice.minor, 4_900);

  const checkout = await request("/api/checkout", {
    method: "POST",
    cookie: customerCookies,
    body: { cartId: specialCart.data.cart.id, postcode: "23100", fulfilmentMode: "pickup" }
  });
  assert.equal(checkout.data.order.status, "authorised");
  assert.equal(checkout.data.order.fulfilments.length, 1);
  assert.equal(checkout.data.order.lines[0].pricingSource, "private_offer");
  assert.equal(checkout.data.order.lines[0].retailUnitPrice.minor, 4_900);
  assert.equal(checkout.data.order.lines[0].vendorId, "vendor-demo-lakonian-home");
  const order = checkout.data.order;
  const fulfilmentId = order.fulfilments[0].id;
  const lineId = order.lines[0].id;
  const initialTracking = await request(`/api/account/orders/${order.id}/tracking`, { cookie: customerCookies });
  assert.equal(initialTracking.data.orderId, order.id);
  assert.equal(initialTracking.data.fulfilments.length, 1);
  assert.equal(initialTracking.data.timeline.some((item: any) => item.type === "order.authorised"), true);
  assert.ok(initialTracking.data.progressPercent >= 0);

  // Critical journey C: authenticated advice appointment with fair/sticky local adviser assignment.
  const adviceWindows = await request("/api/products/cv-desk-lamp/advice-windows?postcode=23100&durationMinutes=30", { cookie: customerCookies });
  assert.equal(adviceWindows.data.localPartner.id, "vendor-demo-lakonian-home");
  assert.ok(adviceWindows.data.windows.length >= 1);
  const appointment = await request("/api/advice/appointments", {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { canonicalVariantId: "cv-desk-lamp", channel: "in_store", startsAt: adviceWindows.data.windows[0].startsAt, durationMinutes: 30, postcode: "23100" }
  });
  assert.equal(appointment.data.appointment.vendorId, "vendor-demo-lakonian-home");
  const vendorNotifications = await request("/api/vendor/notifications", { cookie: vendor.cookie });
  assert.equal(vendorNotifications.data.notifications.some((item: any) => item.eventType === "appointment.booked"), true);
  assert.ok(vendorNotifications.data.unread >= 1);
  const firstVendorNotification = vendorNotifications.data.notifications[0];
  await request(`/api/vendor/notifications/${firstVendorNotification.id}/read`, { method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {} });

  // Prove server-side vendor isolation with a second order belonging to another vendor.
  const foreignCartResponse = await request("/api/cart/items", {
    method: "POST", cookie: customerCookies, body: { canonicalVariantId: "cv-notebook", quantity: 1, postcode: "23100" }
  });
  const foreignCheckout = await request("/api/checkout", {
    method: "POST", cookie: customerCookies, body: { cartId: foreignCartResponse.data.id, postcode: "23100", fulfilmentMode: "pickup" }
  });
  const foreignOrder = foreignCheckout.data.order;
  const denied = await fetch(`${base}/api/vendor/orders/${foreignOrder.id}/fulfilments/${foreignOrder.fulfilments[0].id}/accept`, {
    method: "POST",
    headers: { cookie: vendor.cookie, "x-csrf-token": vendor.csrf, "content-type": "application/json" },
    body: "{}"
  });
  assert.equal(denied.status, 403);
  const cancelledForeign = await request(`/api/account/orders/${foreignOrder.id}/cancel`, {
    method: "POST", cookie: customerCookies, csrf: customer.csrf, body: { reason: "Smoke-test customer cancellation before vendor handover" }
  });
  assert.equal(cancelledForeign.data.order.status, "cancelled");
  assert.equal(cancelledForeign.data.payment.status, "cancelled");
  const cancelledTracking = await request(`/api/account/orders/${foreignOrder.id}/tracking`, { cookie: customerCookies });
  assert.equal(cancelledTracking.data.orderStatus, "cancelled");
  assert.equal(cancelledTracking.data.timeline.some((item: any) => item.type === "order.cancelled"), true);

  await request(`/api/vendor/orders/${order.id}/fulfilments/${fulfilmentId}/accept`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {}
  });
  const readyPickup = await request(`/api/vendor/orders/${order.id}/fulfilments/${fulfilmentId}/ready-pickup`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {}
  });
  assert.match(readyPickup.data.credential.shortCode, /^\d{6}$/);
  assert.equal(readyPickup.data.order.fulfilments[0].status, "ready_for_handover");
  const customerPickups = await request("/api/account/pickups", { cookie: customerCookies });
  assert.equal(customerPickups.data.pickups.some((item: any) => item.id === readyPickup.data.credential.id), true);
  const collectedPickup = await request(`/api/vendor/pickups/${readyPickup.data.credential.id}/verify`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: { proof: readyPickup.data.credential.shortCode }
  });
  assert.equal(collectedPickup.data.credential.status, "collected");
  assert.equal(collectedPickup.data.order.status, "fulfilled");

  // Verified review trust: only the customer who completed the purchase can review the fulfilled line.
  const verifiedReview = await request("/api/account/reviews/order", {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { orderId: order.id, orderLineId: lineId, rating: 5, body: "Helpful local advice and a smooth verified pickup.", incentiveType: "none" }
  });
  assert.equal(verifiedReview.data.interactionType, "verified_order");
  assert.equal(verifiedReview.data.status, "published");
  const publicReviews = await request("/api/reviews?canonicalVariantId=cv-desk-lamp");
  assert.equal(publicReviews.data.aggregate.count, 1);
  assert.equal(publicReviews.data.reviews[0].authorLabel, "Verified buyer");
  assert.equal(Object.prototype.hasOwnProperty.call(publicReviews.data.reviews[0], "customerId"), false);
  const vendorReviewState = await request("/api/vendor/reviews", { cookie: vendor.cookie });
  assert.equal(vendorReviewState.data.reviews.some((item: any) => item.id === verifiedReview.data.id), true);
  const vendorReviewResponse = await request(`/api/vendor/reviews/${verifiedReview.data.id}/response`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: { body: "Thank you — we are glad the local pickup and advice helped." }
  });
  assert.match(vendorReviewResponse.data.body, /Thank you/);
  const vendorReviewReport = await request(`/api/vendor/reviews/${verifiedReview.data.id}/report`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf,
    body: { reason: "other", details: "Smoke-test moderation report; reporting must not automatically hide the verified review." }
  });
  assert.equal(vendorReviewReport.data.status, "open");
  const stillPublicAfterReport = await request("/api/reviews?canonicalVariantId=cv-desk-lamp");
  assert.equal(stillPublicAfterReport.data.aggregate.count, 1);

  const returnRequest = await request("/api/returns", {
    method: "POST",
    cookie: customerCookies,
    csrf: customer.csrf,
    body: { orderId: order.id, orderLineId: lineId, quantity: 1, reason: "withdrawal" }
  });
  assert.equal(returnRequest.data.status, "requested");

  const admin = await login("admin@demo.local", "AdminStrong!123");
  const localOperations = await request("/api/admin/local-operations", { cookie: admin.cookie });
  assert.ok(localOperations.data.configured >= 4);
  assert.equal(localOperations.data.vendors.some((item: any) => item.vendorId === "vendor-demo-lakonian-home" && item.deliveryZones.some((zone: any) => zone.mode === "local_delivery")), true);
  const adminHealth = await request("/api/admin/health", { cookie: admin.cookie });
  assert.equal(adminHealth.data.ok, true);
  assert.equal(adminHealth.data.build, BUILD_VERSION);
  assert.equal(Array.isArray(adminHealth.data.checks), true);
  const pricingOps = await request("/api/admin/promotions", { cookie: admin.cookie });
  const local10 = pricingOps.data.coupons.find((item: any) => item.code === "LOCAL10");
  assert.equal(local10.redemptions, 1);
  assert.equal(local10.reversals, 1);
  assert.equal(local10.effectiveRedemptions, 0);

  // Saved-product alerts watch only the public platform price/availability; vendor supplier prices never participate.
  const loweredDeskLampPrice = await request("/api/admin/products/cv-desk-lamp/platform-price", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { priceMinor: 5700, reason: "Smoke-test saved-product public price-drop alert" }
  });
  assert.equal(loweredDeskLampPrice.data.price.currentPrice.minor, 5700);
  await request("/api/admin/jobs/run", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const savedAlertState = await request("/api/account/saved-product-alerts", { cookie: customerCookies });
  assert.equal(savedAlertState.data.events.some((item: any) => item.type === "price_drop" && item.canonicalVariantId === "cv-desk-lamp" && item.priceMinor === 5700), true);
  const alertNotifications = await request("/api/account/notifications", { cookie: customerCookies });
  assert.equal(alertNotifications.data.notifications.some((item: any) => item.eventType === "saved_product.price_drop" && item.payload?.canonicalVariantId === "cv-desk-lamp"), true);
  await request("/api/admin/products/cv-desk-lamp/platform-price", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { priceMinor: 5900, reason: "Restore smoke-test platform price after alert proof" }
  });
  await request("/api/admin/jobs/run", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const promoNow = Date.now();
  const notebookPromotion = await request("/api/admin/promotions", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { canonicalVariantId: "cv-notebook", name: "Smoke local offer", promotionalPriceMinor: 1190, startsAt: promoNow, endsAt: promoNow + 60 * 60 * 1000, reason: "Smoke-test prior-price and search projection" } });
  assert.equal(notebookPromotion.data.price.currentPrice.minor, 1190);
  assert.equal(notebookPromotion.data.price.priorPrice.minor, 1490);
  const promotedNotebook = await request("/api/products/cv-notebook");
  assert.equal(promotedNotebook.data.price.minor, 1190);
  assert.ok(promotedNotebook.data.pricePresentation.formattedPriorPrice);
  const activePublicPromotions = await request("/api/promotions");
  assert.equal(activePublicPromotions.data.promotions.some((item: any) => item.id === notebookPromotion.data.id), true);
  const cancelledNotebookPromotion = await request(`/api/admin/promotions/${notebookPromotion.data.id}/cancel`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { reason: "Smoke test complete" } });
  assert.equal(cancelledNotebookPromotion.data.status, "cancelled");
  const restoredNotebook = await request("/api/products/cv-notebook");
  assert.equal(restoredNotebook.data.price.minor, 1490);

  const categoryGovernance = await request("/api/admin/category-governance", { cookie: admin.cookie });
  assert.equal(categoryGovernance.data.categories.length, 39);
  const mobileGovernance = categoryGovernance.data.categories.find((item: any) => item.policy.categoryCode === "mobile-telecom-electronics");
  assert.equal(mobileGovernance.policy.commerceMode, "compatibility_sensitive");
  assert.equal(mobileGovernance.schema.attributes.some((item: any) => item.code === "connector" && item.required), true);
  const lightingGovernance = categoryGovernance.data.categories.find((item: any) => item.policy.categoryCode === "lighting-decor");
  const updatedLightingGovernance = await request("/api/admin/category-governance/lighting-decor", {
    method: "PUT", cookie: admin.cookie, csrf: admin.csrf,
    body: { commerceMode: lightingGovernance.policy.commerceMode, adviceAllowed: true, reason: "Smoke-test governance audit without changing commerce behavior" }
  });
  assert.equal(updatedLightingGovernance.data.policy.commerceMode, "standard");

  const adminReviewState = await request("/api/admin/reviews", { cookie: admin.cookie });
  assert.equal(adminReviewState.data.reviews.some((item: any) => item.id === verifiedReview.data.id), true);
  assert.equal(adminReviewState.data.reports.some((item: any) => item.id === vendorReviewReport.data.id), true);
  await request(`/api/admin/reviews/${verifiedReview.data.id}/moderate`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { status: "hidden", reason: "Smoke-test moderation: temporarily hide while a report is reviewed." }
  });
  const hiddenPublicReview = await request("/api/reviews?canonicalVariantId=cv-desk-lamp");
  assert.equal(hiddenPublicReview.data.aggregate.count, 0);
  await request(`/api/admin/reviews/${verifiedReview.data.id}/moderate`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { status: "published", reason: "Smoke-test review completed; verified content restored." }
  });
  const resolvedReviewReport = await request(`/api/admin/review-reports/${vendorReviewReport.data.id}/review`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { status: "resolved", resolution: "Verified interaction confirmed; review remains published." }
  });
  assert.equal(resolvedReviewReport.data.status, "resolved");
  const restoredPublicReview = await request("/api/reviews?canonicalVariantId=cv-desk-lamp");
  assert.equal(restoredPublicReview.data.aggregate.count, 1);
  assert.equal(restoredPublicReview.data.reviews[0].response?.body.includes("Thank you"), true);

  // CMS/SEO workflow: modular page publication + vendor-approved merchant storytelling.
  const cmsPage = await request("/api/admin/content/pages", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { slug: "pilot-guide", pageType: "standard", title: "Οδηγός Buy Local Sparta", body: "Πρακτικός οδηγός για τοπική αναζήτηση, συμβουλή και αγορά στη Σπάρτη." }
  });
  assert.equal(cmsPage.data.status, "draft");
  const publishedCmsPage = await request(`/api/admin/content/pages/${cmsPage.data.id}/publish`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  assert.equal(publishedCmsPage.data.status, "published");
  const publicCmsPage = await request("/api/content/page?locale=el&slug=pilot-guide");
  assert.equal(publicCmsPage.data.page.id, cmsPage.data.id);
  const cmsDocument = await fetch(base + "/el/pilot-guide");
  assert.equal(cmsDocument.status, 200);
  assert.equal((await cmsDocument.text()).includes("Οδηγός Buy Local Sparta"), true);

  const editorialStory = await request("/api/admin/content/stories", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { vendorId: "vendor-demo-arkadia-tech", slug: "demo-arkadia-tech-people", title: "Γνώρισε τη Demo Arkadia Tech", excerpt: "Μια φανταστική ιστορία που αποδεικνύει το merchant approval workflow.", body: "Ο τοπικός σύμβουλος παραμένει ορατός χωρίς να μετατρέπεται σε bidder." }
  });
  assert.equal(editorialStory.data.status, "vendor_review");
  const techVendor = await login("tech@demo.local", "VendorOwner!123");
  const techOperations = await request("/api/vendor/operations-config", { cookie: techVendor.cookie });
  assert.equal(techOperations.data.schedule.weekly.length, 7);
  assert.equal(techOperations.data.localDeliveryPrefixes.includes("231"), true);
  assert.equal(techOperations.data.locations.length, 2);
  const southLocation = techOperations.data.locations.find((item: any) => item.id === "loc-vendor-demo-arkadia-tech-south");
  assert.ok(southLocation);
  assert.equal(southLocation.deliveryZones.some((zone: any) => zone.mode === "local_delivery" && zone.radiusKm === 8), true);
  assert.equal(southLocation.capacityRules.some((rule: any) => rule.mode === "pickup" && rule.maxOpenFulfilments === 2), true);
  const savedSouth = await request("/api/vendor/operations-config", { method: "PUT", cookie: techVendor.cookie, csrf: techVendor.csrf, body: { locationId: southLocation.id, timezone: southLocation.schedule.timezone, weekly: southLocation.schedule.weekly, exceptions: southLocation.schedule.exceptions ?? [], localDeliveryPrefixes: [], localDeliveryRadiusKm: 8, localDeliveryLat: southLocation.coordinates.lat, localDeliveryLon: southLocation.coordinates.lon, shippingEnabled: true, maxOpenFulfilments: 2 } });
  const savedSouthLocation = savedSouth.data.locations.find((item: any) => item.id === southLocation.id);
  assert.equal(savedSouthLocation.deliveryZones.some((zone: any) => zone.mode === "local_delivery" && zone.radiusKm === 8), true);
  assert.equal(savedSouthLocation.schedule.exceptions.some((item: any) => item.date === "2026-08-15" && item.closed), true);
  const addedBranch = await request("/api/vendor/locations", { method: "POST", cookie: techVendor.cookie, csrf: techVendor.csrf, body: { name: "Demo Arkadia Tech · Workshop", addressLine1: "55 Demo Workshop Road", locality: "Sparta", postcode: "23100", timezone: "Europe/Athens" } });
  assert.equal(addedBranch.data.vendorId, "vendor-demo-arkadia-tech");
  const configuredBranch = await request("/api/vendor/operations-config", { method: "PUT", cookie: techVendor.cookie, csrf: techVendor.csrf, body: { locationId: addedBranch.data.id, timezone: "Europe/Athens", weekly: techOperations.data.schedule.weekly, exceptions: [{ date: "2026-08-15", closed: true, reason: "Public holiday" }], localDeliveryPrefixes: [], shippingEnabled: false, maxOpenFulfilments: 3 } });
  assert.equal(configuredBranch.data.locations.some((item: any) => item.id === addedBranch.data.id && item.capacityRules.some((rule: any) => rule.maxOpenFulfilments === 3)), true);
  const savedTechOperations = await request("/api/vendor/operations-config", {
    method: "PUT", cookie: techVendor.cookie, csrf: techVendor.csrf,
    body: { timezone: techOperations.data.schedule.timezone, weekly: techOperations.data.schedule.weekly, exceptions: techOperations.data.schedule.exceptions ?? [], localDeliveryPrefixes: techOperations.data.localDeliveryPrefixes, shippingEnabled: techOperations.data.shippingEnabled }
  });
  assert.equal(savedTechOperations.data.shippingEnabled, true);
  const techStories = await request("/api/vendor/stories", { cookie: techVendor.cookie });
  assert.equal(techStories.data.stories.some((item: any) => item.id === editorialStory.data.id), true);
  const vendorApprovedStory = await request(`/api/vendor/stories/${editorialStory.data.id}/approve`, { method: "POST", cookie: techVendor.cookie, csrf: techVendor.csrf, body: { approved: true } });
  assert.equal(vendorApprovedStory.data.status, "approved");
  const publishedStory = await request(`/api/admin/content/stories/${editorialStory.data.id}/publish`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  assert.equal(publishedStory.data.status, "published");
  const publicStoryDocument = await fetch(base + "/el/stories/demo-arkadia-tech-people");
  assert.equal(publicStoryDocument.status, 200);
  assert.equal((await publicStoryDocument.text()).includes("Γνώρισε τη Demo Arkadia Tech"), true);
  const adminContent = await request("/api/admin/content", { cookie: admin.cookie });
  assert.equal(adminContent.data.sitemapEntries.some((item: any) => item.path === "/el/pilot-guide"), true);


  // Merchant fairness governance: transparent exposure view, scoped appeal and admin resolution.
  const vendorFairness = await request("/api/vendor/fairness", { cookie: vendor.cookie });
  assert.equal(vendorFairness.data.variants.some((item: any) => item.variantId === "cv-desk-lamp"), true);
  const fairnessAppeal = await request("/api/vendor/fairness/appeals", {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf,
    body: { canonicalVariantId: "cv-desk-lamp", reason: "Please review this product exposure against the transparent rotation target." }
  });
  assert.equal(fairnessAppeal.data.status, "open");
  const foreignAppeal = await fetch(`${base}/api/vendor/fairness/appeals`, {
    method: "POST",
    headers: { cookie: vendor.cookie, "x-csrf-token": vendor.csrf, "content-type": "application/json" },
    body: JSON.stringify({ canonicalVariantId: "cv-notebook", reason: "This should be rejected because the product belongs to another supplier." })
  });
  assert.equal(foreignAppeal.status, 403);
  const adminFairness = await request("/api/admin/fairness", { cookie: admin.cookie });
  assert.equal(adminFairness.data.appeals.some((item: any) => item.id === fairnessAppeal.data.id), true);
  const reviewingAppeal = await request(`/api/admin/fairness-appeals/${fairnessAppeal.data.id}/review`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { status: "under_review" }
  });
  assert.equal(reviewingAppeal.data.status, "under_review");
  const resolvedAppeal = await request(`/api/admin/fairness-appeals/${fairnessAppeal.data.id}/review`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { status: "resolved", resolution: "Exposure history reviewed; rotation remains policy-compliant." }
  });
  assert.equal(resolvedAppeal.data.status, "resolved");
  await request(`/api/admin/returns/${returnRequest.data.id}/approve`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { inspectionRequired: false }
  });
  await request(`/api/vendor/returns/${returnRequest.data.id}/receive`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {}
  });
  const refunded = await request(`/api/admin/returns/${returnRequest.data.id}/refund`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { disposition: "sellable" }
  });
  assert.equal(refunded.data.status, "refunded");

  // Finance hardening: supplier invoice -> payable -> maker/checker settlement -> external payout reference.
  const settlementCart = await request("/api/cart/items", {
    method: "POST", cookie: customerCookies, body: { canonicalVariantId: "cv-desk-lamp", quantity: 1, postcode: "23100" }
  });
  const settlementCheckout = await request("/api/checkout", {
    method: "POST", cookie: customerCookies, body: { cartId: settlementCart.data.id, postcode: "23100", fulfilmentMode: "pickup" }
  });
  const settlementOrder = settlementCheckout.data.order;
  const settlementFulfilmentId = settlementOrder.fulfilments[0].id;
  await request(`/api/vendor/orders/${settlementOrder.id}/fulfilments/${settlementFulfilmentId}/accept`, { method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {} });
  const settlementReady = await request(`/api/vendor/orders/${settlementOrder.id}/fulfilments/${settlementFulfilmentId}/ready-pickup`, { method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {} });
  await request(`/api/vendor/pickups/${settlementReady.data.credential.id}/verify`, { method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: { proof: settlementReady.data.credential.qrToken } });
  const moneyBeforeInvoice = await request("/api/vendor/money", { cookie: vendor.cookie });
  const settlementProcurement = moneyBeforeInvoice.data.procurements.find((item: any) => item.orderId === settlementOrder.id);
  assert.ok(settlementProcurement);
  const matchedInvoice = await request(`/api/vendor/procurements/${settlementProcurement.id}/invoice`, {
    method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: { invoiceNumber: `DEMO-${settlementProcurement.id}`, invoiceGrossMinor: settlementProcurement.gross.minor }
  });
  assert.equal(matchedInvoice.data.status, "matched");
  const demoVendorFeeRule = await request("/api/admin/fee-rules", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { feeCode: "sales_service", source: "vendor_contract", calculation: "percentage", basis: "supplier_net", vendorId: "vendor-demo-lakonian-home", rateBps: 500, taxRateBps: 2400, priority: 500, version: 1 }
  });
  assert.equal(demoVendorFeeRule.data.vendorId, "vendor-demo-lakonian-home");
  const commercialSnapshot = await request(`/api/admin/procurements/${settlementProcurement.id}/commercials`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { shippingReimbursementMinor: 0 }
  });
  assert.equal(commercialSnapshot.data.feeSnapshots.length, 1);
  assert.ok(commercialSnapshot.data.serviceFeeGross.minor > 0);
  assert.ok(commercialSnapshot.data.payable.minor < commercialSnapshot.data.gross.minor);
  const payable = await request(`/api/admin/procurements/${settlementProcurement.id}/approve-payable`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  assert.equal(payable.data.status, "payable");
  assert.equal(payable.data.payable.minor, commercialSnapshot.data.payable.minor);
  const batch = await request("/api/admin/settlements", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { procurementIds: [settlementProcurement.id] } });
  assert.equal(batch.data.status, "draft");
  assert.equal(batch.data.totalPayable.minor, commercialSnapshot.data.payable.minor);
  await request(`/api/admin/settlements/${batch.data.id}/submit`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const financeChecker = await login("finance@demo.local", "FinanceStrong!123");
  const approvedBatch = await request(`/api/admin/settlements/${batch.data.id}/approve`, { method: "POST", cookie: financeChecker.cookie, csrf: financeChecker.csrf, body: {} });
  assert.equal(approvedBatch.data.status, "approved");
  const paidBatch = await request(`/api/admin/settlements/${batch.data.id}/pay`, { method: "POST", cookie: financeChecker.cookie, csrf: financeChecker.csrf, body: { payoutReference: "DEMO-BANK-SETTLEMENT-001" } });
  assert.equal(paidBatch.data.status, "paid");
  const moneyAfterSettlement = await request("/api/vendor/money", { cookie: vendor.cookie });
  assert.equal(moneyAfterSettlement.data.procurements.find((item: any) => item.id === settlementProcurement.id).status, "settled");
  assert.equal(moneyAfterSettlement.data.settlements.some((item: any) => item.id === batch.data.id && item.status === "paid"), true);

  // Recall + consumer remedy operations: settled supplier payment must not block the customer's remedy.
  const affectedRecallNotice = await request("/api/admin/products/cv-desk-lamp/notices", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { type: "recall", severity: "critical", details: "Development affected-customer recall and RMA drill" }
  });
  assert.equal(affectedRecallNotice.data.affectedCustomers, 1);
  const customerRecallState = await request("/api/account/recalls", { cookie: customerCookies });
  const affectedRecallCase = customerRecallState.data.recalls.find((item: any) => item.noticeId === affectedRecallNotice.data.id && item.orderId === settlementOrder.id);
  assert.ok(affectedRecallCase);
  assert.equal(affectedRecallCase.status, "notified");
  const acknowledgedRecall = await request(`/api/account/recalls/${affectedRecallCase.id}/acknowledge`, { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  assert.equal(acknowledgedRecall.data.status, "acknowledged");
  const recallRemedy = await request(`/api/account/recalls/${affectedRecallCase.id}/remedy`, { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: { remedy: "refund" } });
  assert.equal(recallRemedy.data.returnCase.reason, "safety_recall");
  assert.equal(recallRemedy.data.returnCase.source, "safety_recall");
  assert.equal(recallRemedy.data.returnCase.eligibility.basis, "safety_recall");
  const recallReturnId = recallRemedy.data.returnCase.id;
  await request(`/api/returns/${recallReturnId}/evidence`, {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { kind: "product_serial", reference: "DEMO-RECALL-SERIAL-001", note: "Customer confirms affected development item." }
  });
  await request(`/api/admin/returns/${recallReturnId}/approve`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { inspectionRequired: true, note: "Safety recall return approved" } });
  const recallAuthorization = await request(`/api/admin/returns/${recallReturnId}/authorize`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { destinationType: "vendor", returnCostPayer: "platform", carrier: "dev-return-carrier", instructions: "Use the prepaid recall return route and retain the RMA reference." }
  });
  assert.match(recallAuthorization.data.authorization.rmaCode, /^RMA-/);
  const dispatchedRecallReturn = await request(`/api/returns/${recallReturnId}/dispatch`, {
    method: "POST", cookie: customerCookies, csrf: customer.csrf,
    body: { carrier: "dev-return-carrier", trackingNumber: "RET-DEMO-001" }
  });
  assert.equal(dispatchedRecallReturn.data.status, "in_transit");
  const receivedRecallReturn = await request(`/api/vendor/returns/${recallReturnId}/receive`, { method: "POST", cookie: vendor.cookie, csrf: vendor.csrf, body: {} });
  assert.equal(receivedRecallReturn.data.status, "received");
  const inspectedRecallReturn = await request(`/api/admin/returns/${recallReturnId}/inspect`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { disposition: "blocked", findings: "Affected unit quarantined under the development recall drill." }
  });
  assert.equal(inspectedRecallReturn.data.status, "inspected");
  const approvedRecallRefund = await request(`/api/admin/returns/${recallReturnId}/remedy`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { remedy: "refund" } });
  assert.equal(approvedRecallRefund.data.approvedRemedy, "refund");
  const completedRecallRefund = await request(`/api/admin/returns/${recallReturnId}/refund`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { note: "Customer refund completed even though the supplier payout was already settled." } });
  assert.equal(completedRecallRefund.data.status, "refunded");
  const postRecallVendorMoney = await request("/api/vendor/money", { cookie: vendor.cookie });
  const recoveredSettledProcurement = postRecallVendorMoney.data.procurements.find((item: any) => item.id === settlementProcurement.id);
  assert.equal(recoveredSettledProcurement.status, "settled");
  assert.ok(recoveredSettledProcurement.postSettlementReturnReceivable.minor > 0);
  const resolvedRecallState = await request("/api/account/recalls", { cookie: customerCookies });
  assert.equal(resolvedRecallState.data.recalls.find((item: any) => item.id === affectedRecallCase.id)?.status, "resolved");
  await request(`/api/admin/product-notices/${affectedRecallNotice.data.id}/resolve`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { resolution: "Affected-customer recall drill completed" } });
  await request("/api/admin/products/cv-desk-lamp/restore", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { reason: "Recall drill completed and no blocking notices remain" } });

  // Customer registration + email verification + merchant onboarding gates.
  const newEmail = `merchant-${process.pid}@example.test`;
  const registration = await request("/api/auth/register", { method: "POST", body: { email: newEmail, password: "MerchantPass!123" } });
  assert.equal(registration.data.verificationRequired, true);
  await request("/api/auth/verify-email", { method: "POST", body: { token: registration.data.developmentVerificationToken } });
  const applicant = await login(newEmail, "MerchantPass!123");
  const application = await request("/api/merchant/applications", {
    method: "POST", cookie: applicant.cookie, csrf: applicant.csrf,
    body: { legalName: "Demo New Merchant IKE", tradingName: "Demo New Merchant", taxNumber: "123456789", gemiNumber: "999999999", address: "10 Demo Street", postcode: "23100", primaryCategory: "footwear", shopStory: "Fictional onboarding merchant.", requestedPlanCode: "founding_2026" }
  });
  await request(`/api/merchant/applications/${application.data.id}/submit`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: {} });
  for (const [to, reason] of [["catalog_onboarding", "KYB verified"], ["test_ready", "catalog configured"], ["active", "end-to-end test passed"]] as const) {
    await request(`/api/admin/vendor-applications/${application.data.id}/transition`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { to, reason } });
  }
  const applicantMe = await request("/api/auth/me", { cookie: applicant.cookie });
  assert.equal(applicantMe.data.principal.roles.includes("vendor_owner"), true);
  assert.ok(applicantMe.data.principal.vendorId);
  const applicantVendorDashboard = await request("/api/vendor/dashboard", { cookie: applicant.cookie });
  assert.equal(applicantVendorDashboard.data.plan.planCode, "founding_2026");
  assert.equal(applicantVendorDashboard.data.plan.priceSnapshot.minor, 150_000);
  assert.equal(applicantVendorDashboard.data.plan.salesServiceFeeBpsSnapshot, 0);
  const applicantOperations = await request("/api/vendor/operations-config", {
    method: "PUT", cookie: applicant.cookie, csrf: applicant.csrf,
    body: { timezone: "Europe/Athens", weekly: techOperations.data.schedule.weekly, exceptions: [], localDeliveryPrefixes: ["231"], shippingEnabled: true }
  });
  assert.equal(applicantOperations.data.shippingEnabled, true);
  assert.equal(applicantOperations.data.localDeliveryPrefixes.includes("231"), true);
  const publicPlans = await request("/api/plans");
  assert.equal(publicPlans.data.plans.some((plan: any) => plan.code === "founding_2026"), true);
  assert.equal(publicPlans.data.plans.some((plan: any) => plan.code === "standard"), false);
  const activationNotifications = await request("/api/account/notifications", { cookie: applicant.cookie });
  assert.equal(activationNotifications.data.notifications.some((item: any) => item.eventType === "vendor.activated"), true);

  // Catalog workflow: vendor source product -> exact canonical match -> admin approval -> hidden supplier offer publication.
  const sourceProduct = await request("/api/vendor/products", {
    method: "POST", cookie: applicant.cookie, csrf: applicant.csrf,
    body: { categoryCode: "mobile-telecom-electronics", title: "Apple AirPods Pro 2 USB-C", brand: "Apple", model: "AirPods Pro 2", mpn: "MTJV3ZM/A", gtin: "0195949052637", attributes: { colour: "white", connector: "USB-C", wireless: "true" }, supplierUnitPriceMinor: 9_550, stockOnHand: 6, safetyStock: 1, fulfilmentModes: ["pickup", "shipping"], adviceAvailable: true }
  });
  const submittedProduct = await request(`/api/vendor/products/${sourceProduct.data.id}/submit`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: {} });
  assert.equal(submittedProduct.data.status, "linked");
  assert.equal(submittedProduct.data.canonicalVariantId, "cv-airpods-pro-2");
  const matchingCentre = await request("/api/admin/product-matching", { cookie: admin.cookie });
  assert.equal(matchingCentre.data.submissions.some((item: any) => item.id === sourceProduct.data.id), true);
  const publishedProduct = await request(`/api/admin/vendor-products/${sourceProduct.data.id}/approve`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { reason: "Exact GTIN verified; supplier offer QA passed" } });
  assert.equal(publishedProduct.data.submission.status, "approved");
  assert.equal(publishedProduct.data.publication.canonicalVariantId, "cv-airpods-pro-2");
  const applicantProducts = await request("/api/vendor/products", { cookie: applicant.cookie });
  assert.equal(applicantProducts.data.publishedOffers.some((item: any) => item.offerId === publishedProduct.data.publication.offerId), true);
  await request(`/api/vendor/inventory/${publishedProduct.data.publication.offerId}`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { onHand: 7 } });
  const inventoryHistory = await request(`/api/vendor/inventory/${publishedProduct.data.publication.offerId}/history`, { cookie: applicant.cookie });
  assert.equal(inventoryHistory.data.balance.onHand, 7);
  assert.equal(inventoryHistory.data.movements.some((item: any) => item.type === "set_on_hand"), true);
  const airpodsCatalog = await request("/api/catalog?q=AirPods&postcode=23100");
  assert.equal(airpodsCatalog.data.products.filter((item: any) => item.id === "cv-airpods-pro-2").length, 1);

  // Media/compliance workflow: signed upload intent -> background scan -> human moderation -> verified compliance evidence.
  const uploadIntent = await request("/api/vendor/media/upload-intent", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { canonicalVariantId: "cv-airpods-pro-2", kind: "image", originalFilename: "airpods-local.jpg", altText: "AirPods Pro displayed inside the fictional local demo shop", rightsOwner: "Demo New Merchant" } });
  const uploadedMedia = await request("/api/vendor/media/upload", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { intentToken: uploadIntent.data.token, contentType: "image/jpeg", base64: Buffer.from("development-image-bytes").toString("base64") } });
  assert.equal(uploadedMedia.data.scanStatus, "pending");
  const jobRun = await request("/api/admin/jobs/run", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  assert.ok(jobRun.data.worker.processed >= 1);
  const operationsState = await request("/api/admin/outbox", { cookie: admin.cookie });
  assert.equal(operationsState.data.scheduledJobs.length, 15);
  const deliveryState = await request("/api/admin/notifications", { cookie: admin.cookie });
  assert.ok(deliveryState.data.providers.email.sent >= 1);
  assert.equal(deliveryState.data.recent.some((item: any) => item.userId === customer.userId && item.eventType === "order.authorised" && item.channel === "email" && item.status === "sent"), true);
  assert.equal(deliveryState.data.recent.some((item: any) => item.userId === customer.userId && item.eventType === "appointment.booked" && item.channel === "email"), false);
  assert.equal(deliveryState.data.attempts.some((item: any) => item.channel === "email" && item.status === "sent" && item.maskedDestination.includes("@demo.local")), true);
  assert.equal(operationsState.data.searchDocuments.some((item: any) => item.id === "cv-airpods-pro-2"), true);
  assert.equal(operationsState.data.stockFreshness.some((item: any) => item.offerId === publishedProduct.data.publication.offerId && item.state === "fresh"), true);
  const reviewedMedia = await request(`/api/admin/media/${uploadedMedia.data.id}/review`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { rightsStatus: "approved", moderationStatus: "approved" } });
  assert.equal(reviewedMedia.data.scanStatus, "clean");
  const publicAirpods = await request("/api/products/cv-airpods-pro-2?postcode=23100");
  assert.equal(publicAirpods.data.media.some((item: any) => item.id === uploadedMedia.data.id), true);

  const docIntent = await request("/api/vendor/media/upload-intent", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { canonicalVariantId: "cv-airpods-pro-2", kind: "document", originalFilename: "conformity.pdf", rightsOwner: "Demo Manufacturer" } });
  const uploadedDoc = await request("/api/vendor/media/upload", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { intentToken: docIntent.data.token, contentType: "application/pdf", base64: Buffer.from("%PDF development conformity").toString("base64") } });
  await request("/api/admin/jobs/run", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  await request(`/api/admin/media/${uploadedDoc.data.id}/review`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { rightsStatus: "approved", moderationStatus: "approved" } });
  const compliance = await request("/api/vendor/compliance-documents", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { canonicalVariantId: "cv-airpods-pro-2", type: "EU declaration of conformity", issuer: "Demo Manufacturer", identifier: "DEMO-DOC-001", mediaAssetId: uploadedDoc.data.id } });
  const verifiedCompliance = await request(`/api/admin/compliance-documents/${compliance.data.id}/review`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { decision: "verified" } });
  assert.equal(verifiedCompliance.data.status, "verified");

  // Safety gate: a recall immediately removes the canonical product; explicit resolution + restore is required.
  const recall = await request("/api/admin/products/cv-airpods-pro-2/notices", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { type: "recall", severity: "critical", details: "Development recall drill" } });
  const hiddenAirpods = await request("/api/catalog?q=AirPods&postcode=23100");
  assert.equal(hiddenAirpods.data.products.some((item: any) => item.id === "cv-airpods-pro-2"), false);
  await request(`/api/admin/product-notices/${recall.data.id}/resolve`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { resolution: "Development recall remediation verified" } });
  await request("/api/admin/products/cv-airpods-pro-2/restore", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { reason: "All blocking recall actions closed in development drill" } });
  const restoredAirpods = await request("/api/catalog?q=AirPods&postcode=23100");
  assert.equal(restoredAirpods.data.products.some((item: any) => item.id === "cv-airpods-pro-2"), true);

  // CSV dry-run/commit is all-or-nothing on validation, then unmatched product is created as a new canonical by Catalog QA.
  const csv = `vendor_sku,category_code,title,brand,model,supplier_price_minor,stock_on_hand,safety_stock,fulfilment_modes,advice_available\nBOTTLE-1,homeware-household-goods,Demo Insulated Travel Bottle,Demo Local,ZXQJ-987654321,1400,5,1,pickup,true\n`;
  const csvPreview = await request("/api/vendor/products/import/preview", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { csv } });
  assert.equal(csvPreview.data.canCommit, true);
  const csvCommit = await request("/api/vendor/products/import/commit", { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { csv, confirm: true, submit: true } });
  assert.equal(csvCommit.data.imported, 1);
  const unmatched = csvCommit.data.submissions[0];
  assert.equal(unmatched.status, "needs_review");
  const newCanonical = await request(`/api/admin/vendor-products/${unmatched.id}/create-canonical`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { platformPriceMinor: 2590, titleEl: "Ισοθερμικό Μπουκάλι Ταξιδιού Demo", titleEn: "Demo Insulated Travel Bottle", reason: "No existing canonical product; source identity reviewed" } });
  const newPublication = await request(`/api/admin/vendor-products/${unmatched.id}/approve`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { reason: "Canonical data and supplier offer approved" } });
  assert.equal(newPublication.data.publication.canonicalVariantId, newCanonical.data.id);
  await request("/api/admin/jobs/run", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const savedSearchState = await request("/api/account/saved-searches", { cookie: customerCookies });
  const bottleWatch = savedSearchState.data.searches.find((item: any) => item.id === savedBottleSearch.data.savedSearch.id);
  assert.equal(bottleWatch.currentResultCount, 1);
  assert.equal(bottleWatch.newMatchEvents.some((item: any) => item.canonicalVariantId === newCanonical.data.id && item.type === "new_match"), true);
  const savedNotifications = await request("/api/account/notifications?group=saved", { cookie: customerCookies });
  const savedSearchNotification = savedNotifications.data.notifications.find((item: any) => item.eventType === "saved_search.new_match" && item.payload?.savedSearchId === savedBottleSearch.data.savedSearch.id);
  assert.ok(savedSearchNotification);
  assert.equal(savedSearchNotification.group, "saved");
  const markedSaved = await request("/api/account/notifications/read-all?group=saved", { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  assert.ok(markedSaved.data.updated >= 1);
  const unreadSaved = await request("/api/account/notifications?group=saved&unread=1", { cookie: customerCookies });
  assert.equal(unreadSaved.data.notifications.length, 0);
  await request(`/api/account/notifications/${savedSearchNotification.id}/archive`, { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: {} });
  const centerAfterArchive = await request("/api/account/notifications?group=saved", { cookie: customerCookies });
  assert.equal(centerAfterArchive.data.notifications.some((item: any) => item.id === savedSearchNotification.id), false);
  const bottleSearch = await request("/api/catalog?q=travel%20bottle&postcode=23100");
  assert.equal(bottleSearch.data.products.some((item: any) => item.id === newCanonical.data.id), true);

  // Direct shipping: vendor label/handover -> idempotent courier event -> one customer order status.
  const shippingCart = await request("/api/cart/items", { method: "POST", cookie: customerCookies, body: { canonicalVariantId: newCanonical.data.id, quantity: 1, postcode: "10558" } });
  const shippingCheckout = await request("/api/checkout", { method: "POST", cookie: customerCookies, body: { cartId: shippingCart.data.id, postcode: "10558", fulfilmentMode: "shipping" } });
  const shippingOrder = shippingCheckout.data.order;
  assert.equal(shippingOrder.deliveryCharge.minor, 690);
  assert.equal(shippingOrder.total.minor, shippingOrder.merchandiseSubtotal.minor + shippingOrder.deliveryCharge.minor);
  assert.equal(shippingCheckout.data.payment.authorisedAmount.minor, shippingOrder.total.minor);
  const shippingFulfilment = shippingOrder.fulfilments[0];
  assert.equal(shippingFulfilment.vendorId, applicantMe.data.principal.vendorId);
  await request(`/api/vendor/orders/${shippingOrder.id}/fulfilments/${shippingFulfilment.id}/accept`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: {} });
  const shipment = await request(`/api/vendor/orders/${shippingOrder.id}/fulfilments/${shippingFulfilment.id}/shipment`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: { fromPostcode: "23100", packageCount: 1 } });
  const label = await request(`/api/vendor/shipments/${shipment.data.id}/label`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: {} });
  assert.match(label.data.trackingNumber, /^DEV/);
  await request(`/api/vendor/shipments/${shipment.data.id}/handover`, { method: "POST", cookie: applicant.cookie, csrf: applicant.csrf, body: {} });
  const delivered = await request("/api/admin/courier-events", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { providerEventId: "dev-carrier-delivered-1", shipmentId: shipment.data.id, status: "delivered", proof: { recipient: "Demo Customer" } } });
  assert.equal(delivered.data.shipment.status, "delivered");
  const duplicateCarrierEvent = await request("/api/admin/courier-events", { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { providerEventId: "dev-carrier-delivered-1", shipmentId: shipment.data.id, status: "lost" } });
  assert.equal(duplicateCarrierEvent.data.duplicate, true);
  const customerShipments = await request("/api/account/shipments", { cookie: customerCookies });
  assert.equal(customerShipments.data.shipments.some((item: any) => item.id === shipment.data.id && item.status === "delivered"), true);

  // Chargeback governance: provider case freezes unpaid supplier accrual; a lost case requires explicit liability allocation.
  const shippingVendorMoney = await request("/api/vendor/money", { cookie: applicant.cookie });
  const shippingProcurement = shippingVendorMoney.data.procurements.find((item: any) => item.orderId === shippingOrder.id);
  assert.ok(shippingProcurement);
  const openedDispute = await request("/api/admin/disputes/open", {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { orderId: shippingOrder.id, provider: "dev-psp", providerCaseId: "case-shipping-001", providerEventId: "evt-chargeback-open-001", amountMinor: 1000, reasonCode: "fraudulent" }
  });
  assert.equal(openedDispute.data.dispute.status, "evidence_required");
  const heldSupplier = (await request("/api/vendor/money", { cookie: applicant.cookie })).data.procurements.find((item: any) => item.id === shippingProcurement.id);
  assert.equal(heldSupplier.status, "disputed");
  await request(`/api/admin/disputes/${openedDispute.data.dispute.id}/evidence`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { kind: "proof_of_delivery", reference: shipment.data.trackingNumber || shipment.data.id, description: "Carrier-confirmed development delivery" }
  });
  await request(`/api/admin/disputes/${openedDispute.data.dispute.id}/submit`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const lostDispute = await request(`/api/admin/disputes/${openedDispute.data.dispute.id}/resolve`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { outcome: "lost", providerEventId: "evt-chargeback-lost-001", reason: "Development provider rejected evidence" }
  });
  assert.equal(lostDispute.data.dispute.liabilityReviewRequired, true);
  const allocatedDispute = await request(`/api/admin/disputes/${openedDispute.data.dispute.id}/allocate`, {
    method: "POST", cookie: admin.cookie, csrf: admin.csrf,
    body: { allocation: "platform", reason: "Development case: no supplier breach; platform accepts chargeback liability" }
  });
  assert.equal(allocatedDispute.data.status, "closed");
  assert.equal(allocatedDispute.data.liabilityAllocation, "platform");
  const releasedSupplier = (await request("/api/vendor/money", { cookie: applicant.cookie })).data.procurements.find((item: any) => item.id === shippingProcurement.id);
  assert.equal(releasedSupplier.status, shippingProcurement.status);
  assert.equal(releasedSupplier.payable.minor, shippingProcurement.payable.minor);


  const storefront = await fetch(base + "/");
  assert.equal((await storefront.text()).includes(`Build ${BUILD_VERSION.replace(/\.0$/, "")}`), true);
  const vendorUi = await fetch(base + "/vendor");
  assert.equal((await vendorUi.text()).includes("Appointments"), true);

  const vendorAnalytics = await request("/api/vendor/analytics", { cookie: vendor.cookie });
  assert.equal(vendorAnalytics.data.report.vendorId, "vendor-demo-lakonian-home");
  assert.ok(vendorAnalytics.data.report.attributedOrders >= 1);
  assert.equal(JSON.stringify(vendorAnalytics.data.report).includes("vendor-demo-paper-street"), false);

  const analytics = await request("/api/admin/analytics", { cookie: admin.cookie });
  assert.ok(analytics.data.report.searches >= 2);
  assert.ok(analytics.data.report.authorisedOrders >= 4);
  assert.ok(analytics.data.report.gmvMinor > 0);
  assert.equal(analytics.data.report.topZeroResultQueries.some((row: any) => row.query === "nonexistent-local-demand-xyz"), true);
  assert.ok(analytics.data.report.searchClickThroughRate >= 0 && analytics.data.report.searchClickThroughRate <= 1);

  const dashboard = await request("/api/admin/dashboard", { cookie: admin.cookie });
  assert.equal(dashboard.data.metrics.customerOrders, 5);
  assert.equal(dashboard.data.metrics.activeOnboardedVendors, 1);
  assert.equal(dashboard.data.metrics.returnsOpen, 0);

  // Privacy deletion erases non-essential personalization immediately but leaves an auditable request and explicit retention reasons.
  const recentOptOut = await request("/api/account/personalization-preferences", { method: "PUT", cookie: customerCookies, csrf: customer.csrf, body: { recentlyViewedEnabled: false, recommendationsEnabled: false } });
  assert.equal(recentOptOut.data.preferences.recentlyViewedEnabled, false);
  await request("/api/products/cv-desk-lamp", { cookie: customerCookies });
  assert.equal((await request("/api/account/recently-viewed", { cookie: customerCookies })).data.products.length, 0);
  const recommendationsOptedOut = await request("/api/account/recommendations", { cookie: customerCookies });
  assert.equal(recommendationsOptedOut.data.enabled, false);
  assert.equal(recommendationsOptedOut.data.recommendations.length, 0);
  const deletion = await request("/api/account/privacy/deletion", { method: "POST", cookie: customerCookies, csrf: customer.csrf, body: { reason: "Smoke-test non-essential data deletion" } });
  assert.equal(deletion.data.request.status, "submitted");
  assert.ok(deletion.data.retention.some((item: any) => item.category === "tax_financial" && item.retained));
  assert.equal((await request("/api/account/saved-products", { cookie: customerCookies })).data.products.length, 0);
  assert.equal((await request("/api/account/saved-vendors", { cookie: customerCookies })).data.vendors.length, 0);
  const alertsAfterDeletion = await request("/api/account/saved-product-alerts", { cookie: customerCookies });
  assert.equal(alertsAfterDeletion.data.alerts.length, 0);
  assert.equal(alertsAfterDeletion.data.events.length, 0);
  const privacyAfterDeletion = await request("/api/account/privacy", { cookie: customerCookies });
  assert.equal(privacyAfterDeletion.data.personalization.savedProductAlerts, 0);
  assert.equal(privacyAfterDeletion.data.personalization.preferences.recommendationsEnabled, false);
  const adminPrivacy = await request("/api/admin/privacy-requests", { cookie: admin.cookie });
  const deletionRequest = adminPrivacy.data.requests.find((item: any) => item.id === deletion.data.request.id);
  assert.equal(deletionRequest.status, "submitted");
  await request(`/api/admin/privacy-requests/${deletionRequest.id}/processing`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: {} });
  const completedDeletion = await request(`/api/admin/privacy-requests/${deletionRequest.id}/complete`, { method: "POST", cookie: admin.cookie, csrf: admin.csrf, body: { note: "Non-essential personalization erased; retained business records documented." } });
  assert.equal(completedDeletion.data.status, "partially_completed");
  assert.ok(completedDeletion.data.retention.some((item: any) => item.retained));

  // Consumer self-service closure pseudonymizes identity, revokes sessions and does not apply to business/staff accounts.
  const closeEmail = `close-${Date.now()}@example.test`;
  const closeRegistration = await request("/api/auth/register", { method: "POST", body: { email: closeEmail, password: "CloseAccount!123" } });
  await request("/api/auth/verify-email", { method: "POST", body: { token: closeRegistration.data.developmentVerificationToken } });
  const closeCustomer = await login(closeEmail, "CloseAccount!123");
  const closed = await request("/api/account/privacy/close", { method: "POST", cookie: closeCustomer.cookie, csrf: closeCustomer.csrf, body: { confirmation: "CLOSE" } });
  assert.equal(closed.data.closed, true);
  assert.equal(closed.data.account.status, "closed");
  assert.equal(closed.data.request.status, "partially_completed");
  const reloginClosed = await fetch(base + "/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: closeEmail, password: "CloseAccount!123" }) });
  assert.equal(reloginClosed.status, 401);

  // Abuse controls are enforced by the HTTP layer and expose a standards-friendly Retry-After.
  let throttledRegistration: Response | undefined;
  for (let index = 0; index < 6; index += 1) {
    const response = await fetch(base + "/api/auth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: `throttle-${index}-${Date.now()}@example.test`, password: "ThrottlePass!123" }) });
    if (response.status === 429) { throttledRegistration = response; break; }
  }
  assert.ok(throttledRegistration);
  assert.ok(Number(throttledRegistration.headers.get("retry-after")) >= 1);
  const throttledBody = await throttledRegistration.json();
  assert.equal(throttledBody.error, "too_many_requests");
  const securityState = await request("/api/admin/security", { cookie: admin.cookie });
  assert.ok(securityState.data.summary.total >= 1);
  assert.equal(securityState.data.events.some((item: any) => item.type === "rate_limit.exceeded" && item.route === "/api/auth/register"), true);
  assert.equal(JSON.stringify(securityState.data.events).includes("throttle-0-"), false);

  console.log("HTTP smoke passed: security headers/readiness/rate limits + accessibility shell → governed category schemas/attribute filters + compatibility checkout gate + auditable prior-price promotions/coupons + multi-location shop hours/service coverage/capacity + privacy-safe demand analytics → verified purchase review + vendor response/report + admin moderation → CMS/SEO + vendor-approved storytelling → Ask Local → private price → configurable delivery checkout → versioned notification preferences/provider delivery → appointments → vendor isolation → secure pickup → procurement fee snapshot + settlement → merchant onboarding → product matching → fairness governance → durable jobs/search/stock freshness → media/compliance + recall → CSV publication → shipping → chargeback governance → consolidated tracking/cancellation/SLA controls → customer saved items + explicit price/back-in-stock + saved-search alerts + grouped notification centre + explanation/diversity-safe canonical recommendations/recent-history controls + privacy export/deletion/account closure → affected-customer recall + RMA/custody/refund");
} finally {
  server.kill("SIGTERM");
}

async function login(email: string, password: string) {
  const result = await request("/api/auth/login", { method: "POST", body: { email, password } });
  const cookie = cookieFrom(result.headers, "bls_session");
  if (!cookie) throw new Error("Login did not return session cookie");
  return { cookie, csrf: result.data.principal.csrfToken as string, userId: result.data.principal.userId as string };
}

async function request(path: string, options: { method?: string; cookie?: string; csrf?: string; body?: unknown } = {}) {
  const headers: Record<string, string> = {};
  if (options.cookie) headers.cookie = options.cookie;
  if (options.csrf) headers["x-csrf-token"] = options.csrf;
  if (options.body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(base + path, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${path}: ${data.error ?? response.status}`);
  return { data, headers: response.headers };
}

function cookieFrom(headers: Headers, name: string): string | undefined {
  const rawValues = typeof (headers as any).getSetCookie === "function" ? (headers as any).getSetCookie() as string[] : [headers.get("set-cookie") ?? ""];
  for (const raw of rawValues) {
    for (const candidate of raw.split(/,(?=[^;,]+=)/g)) {
      const pair = candidate.trim().split(";", 1)[0];
      if (pair.startsWith(`${name}=`)) return pair;
    }
  }
  return undefined;
}

async function waitForHealth() {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Server exited before smoke test:\n${logs}`);
    try {
      const response = await fetch(base + "/api/health");
      if (response.ok) return;
    } catch {
      // retry until deadline
    }
    await new Promise((resolve) => setTimeout(resolve, 75));
  }
  throw new Error(`Server did not become healthy:\n${logs}`);
}
