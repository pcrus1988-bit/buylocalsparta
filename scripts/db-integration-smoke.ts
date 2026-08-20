import { randomUUID } from "node:crypto";
import {
  NotificationService,
  PrivacyRequestService,
  SavedSearchService,
  hashPassword,
  id,
  type SavedProduct
} from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  customerScope,
  EXPECTED_SCHEMA_VERSION,
  PostgresAdminAuthService,
  PostgresCustomerAuthService,
  PostgresFixedWindowRateLimiter,
  PostgresVendorAuthService,
  PostgresVivaPaymentsService,
  PostgresProductionSearchService,
  PostgresResendNotificationService,
  type VivaPaymentsGateway
} from "../packages/postgres-runtime/src/index.ts";

class FakeVivaGateway implements VivaPaymentsGateway {
  readonly environment = "demo" as const;
  createCount = 0;
  refundCount = 0;
  lastRefundTransactionId?: string;
  readonly #transactions = new Map<string, Awaited<ReturnType<VivaPaymentsGateway["retrieveTransaction"]>>>();

  checkoutUrl(orderCode: string) { return `https://demo.vivapayments.com/web/checkout?ref=${orderCode}`; }
  async createPaymentOrder(_input: Parameters<VivaPaymentsGateway["createPaymentOrder"]>[0]) {
    this.createCount += 1;
    const orderCode = (9_000_000_000_000_000n + BigInt(this.createCount)).toString();
    return { orderCode, checkoutUrl: this.checkoutUrl(orderCode) };
  }
  confirm(orderCode: string, amountMinor: number) {
    const transactionId = randomUUID();
    this.#transactions.set(transactionId, { transactionId, orderCode, statusId:"F", amountMinor, currencyCode:978 });
    return transactionId;
  }
  async retrieveTransaction(transactionId: string) {
    const transaction = this.#transactions.get(transactionId);
    if (!transaction) throw new Error(`Fake Viva transaction ${transactionId} not found`);
    return transaction;
  }
  async refund(input: Parameters<VivaPaymentsGateway["refund"]>[0]) {
    const original = this.#transactions.get(input.transactionId);
    if (!original) throw new Error("Fake Viva original transaction not found");
    this.refundCount += 1;
    const transactionId = randomUUID();
    this.lastRefundTransactionId = transactionId;
    this.#transactions.set(transactionId, { ...original, transactionId, statusId:"F", amountMinor:input.amountMinor });
    return { success:true, statusId:"F", transactionId, amountMinor:input.amountMinor };
  }
  async cancelPaymentOrder(_orderCode: string) {}
  async webhookVerificationKey() { return "db-smoke-viva-webhook-key"; }
}

class FakeMeilisearch {
  readonly documents = new Map<string,Record<string,unknown>>();
  #task = 0;
  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); const path = url.pathname;
    if (path === "/health") return jsonResponse(200,{status:"available"});
    if (/^\/indexes\/[^/]+$/.test(path) && init?.method === "GET") return jsonResponse(200,{uid:path.split("/").at(-1)});
    if (path.endsWith("/settings") && init?.method === "PATCH") return jsonResponse(202,{taskUid:++this.#task,status:"enqueued"});
    if (/^\/tasks\/\d+$/.test(path)) return jsonResponse(200,{uid:Number(path.split("/").at(-1)),status:"succeeded"});
    if (path.endsWith("/documents") && init?.method === "POST") { const body=JSON.parse(String(init.body)) as Record<string,unknown>[]; for(const doc of body){if(typeof doc.id==="string")this.documents.set(doc.id,doc);} return jsonResponse(202,{taskUid:++this.#task,status:"enqueued"}); }
    if (path.includes("/documents/") && init?.method === "DELETE") { this.documents.delete(decodeURIComponent(path.split("/").at(-1)??"")); return jsonResponse(202,{taskUid:++this.#task,status:"enqueued"}); }
    if (path.endsWith("/search") && init?.method === "POST") return jsonResponse(200,{hits:[...this.documents.values()]});
    return jsonResponse(404,{message:`Unhandled fake Meilisearch request ${init?.method??"GET"} ${path}`});
  };
}
function jsonResponse(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}});}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-db-integration-smoke-a" });
const runtimeB = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-db-integration-smoke-b" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = `usr_db_smoke_${suffix}`;
const email = `db-smoke-${suffix}@example.test`;
const canonicalId = `canonical_db_smoke_${suffix}`;
const vendorId = `vendor_db_smoke_${suffix}`;
const vendorUserId = `usr_vendor_db_smoke_${suffix}`;
const vendorEmail = `vendor-db-smoke-${suffix}@example.test`;
const locationId = `location_db_smoke_${suffix}`;
const offerId = `offer_db_smoke_${suffix}`;
const rescueVendorId = `vendor_rescue_db_smoke_${suffix}`;
const rescueLocationId = `location_rescue_db_smoke_${suffix}`;
const rescueOfferId = `offer_rescue_db_smoke_${suffix}`;
const adminUserId = `usr_admin_db_smoke_${suffix}`;
const adminEmail = `admin-db-smoke-${suffix}@example.test`;
const financeUserId = `usr_finance_db_smoke_${suffix}`;
const financeEmail = `finance-db-smoke-${suffix}@example.test`;
const requestId = `db-smoke-${randomUUID()}`;
const secret = process.env.BLS_AUTH_SECRET?.trim() || "db-integration-smoke-auth-secret-0123456789";

try {
  const readiness = await runtime.readiness(EXPECTED_SCHEMA_VERSION);
  if (!readiness.ok) throw new Error(`Database not ready: ${readiness.message}`);

  await runtime.sqlPool.connect().then(async (client) => {
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.platform_access','true',true)");
      await client.query("SELECT set_config('app.request_id',$1,true)", [requestId]);
      const market = await client.query<{ code: string } & Record<string, unknown>>("SELECT code FROM markets WHERE code='sparta' LIMIT 1");
      if (market.rowCount !== 1) throw new Error("Expected market seed/code 'sparta' is missing");
      const extensions = await client.query<{ extname: string } & Record<string, unknown>>("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext','postgis') ORDER BY extname");
      const names = new Set(extensions.rows.map((row) => String(row.extname)));
      for (const required of ["pgcrypto", "citext", "postgis"]) if (!names.has(required)) throw new Error(`Required PostgreSQL extension ${required} is missing`);
      await client.query("ROLLBACK");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally { client.release(); }
  });

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId },
    account: {
      id: userId,
      email,
      passwordHash: hashPassword("Customer!12345"),
      status: "active",
      roles: ["customer"],
      emailVerified: true,
      createdAt: now
    }
  });

  // Seed one canonical solely for live personalization persistence proof. The
  // taxonomy guard now requires product assignment to an explicit product-class leaf,
  // so the synthetic smoke category must satisfy the same contract as production data.
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
    category AS (
      INSERT INTO categories (market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
      SELECT id,$1,$1,'standard',true,'product_class',true,true FROM market
      ON CONFLICT (market_id,slug) DO UPDATE SET
        active=true,
        taxonomy_role='product_class',
        assignable=true,
        discoverable=true
      RETURNING id
    )
    INSERT INTO canonical_variants (public_id,market_id,category_id,slug,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled)
    SELECT $2, market.id, category.id, $2, 1299, 'EUR', 2400, true, false, false FROM market,category
    ON CONFLICT (public_id) DO NOTHING
  `, [`db-smoke-${suffix}`, canonicalId]);

  // Seed an approved local supplier and fresh stock so public catalog, cart and checkout
  // can be proven across two independent application runtimes.
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses (public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [vendorId, `DB Smoke Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'), vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations (public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'DB Smoke Location','1 Test Street','Sparta','23100',true,$3 FROM market,vendor
  `, [vendorId, locationId, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'), vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2), canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers (public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at)
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',800,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$6 FROM market,vendor,location,canonical
  `, [vendorId, locationId, canonicalId, offerId, `SKU-${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    INSERT INTO inventory_balances (offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at)
    SELECT id,2,0,0,0,'db_smoke','merchant_confirmed',$2,86400,'fresh',$2 FROM vendor_offers WHERE public_id=$1
  `, [offerId, new Date(now)]);

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId },
    account: {
      id: vendorUserId,
      email: vendorEmail,
      passwordHash: hashPassword("Vendor!12345"),
      status: "active",
      roles: ["vendor_owner"],
      vendorId,
      emailVerified: true,
      createdAt: now
    }
  });

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId },
    account: { id: adminUserId, email: adminEmail, passwordHash: hashPassword("AdminStrong!123"), status: "active", roles: ["super_admin"], emailVerified: true, createdAt: now }
  });
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId },
    account: { id: financeUserId, email: financeEmail, passwordHash: hashPassword("FinanceStrong!123"), status: "active", roles: ["platform_finance"], emailVerified: true, createdAt: now }
  });

  const authA = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const authB = new PostgresCustomerAuthService({ identity: runtimeB.persistence.identity, secret });
  const login = await authA.authenticate({ email, password: "Customer!12345", now });
  const crossInstancePrincipal = await authB.session(login.token, now + 1_000);
  if (!crossInstancePrincipal || crossInstancePrincipal.userId !== userId) throw new Error("PostgreSQL session was not visible across runtime instances");
  authB.assertCsrf(crossInstancePrincipal, login.principal.csrfToken);

  const scope = customerScope(userId, requestId);
  await runtime.persistence.customerPrivacy.savePreferences({ scope, preferences: { userId, recommendationsEnabled: false, recentlyViewedEnabled: true, updatedAt: now } });
  const savedProduct: SavedProduct = { userId, canonicalVariantId: canonicalId, savedAt: now };
  await runtime.persistence.customerPrivacy.saveProduct({ scope, item: savedProduct });
  await runtime.persistence.customerPrivacy.recordRecentlyViewed({ scope, item: { userId, canonicalVariantId: canonicalId, viewedAt: now, expiresAt: now + 90 * 24 * 60 * 60 * 1000 } });

  const savedSearch = new SavedSearchService().create({ userId, marketId: "sparta", name: "DB smoke local", query: { q: "smoke" }, alertsEnabled: true, currentCanonicalVariantIds: [canonicalId], now });
  await runtime.persistence.engagement.saveSavedSearch({ scope, search: savedSearch });

  const privacyRequest = new PrivacyRequestService().submit({ userId, type: "export", now });
  await runtime.persistence.customerPrivacy.savePrivacyRequest({ scope, request: privacyRequest });

  const notification = new NotificationService().create({ userId, eventType: "account.db_smoke", title: "Database smoke", body: "Cross-instance notification persistence proof", dedupeKey: `db-smoke:${suffix}`, now });
  await runtime.persistence.trust.saveNotification({ scope: { actorUserId: userId, marketId: "sparta", platformAccess: true, requestId }, notification });

  // Production search projects canonical products only; supplier offers remain private.
  const fakeMeili = new FakeMeilisearch();
  const searchConfig = { host:"https://search.db-smoke.test", indexUid:`products_${suffix}`, adminApiKey:"db-smoke-admin", searchApiKey:"db-smoke-search", timeoutMs:1_000, taskTimeoutMs:1_000, taskPollMs:1 };
  const searchA = new PostgresProductionSearchService(runtime.sqlPool,searchConfig,fakeMeili.fetch);
  const searchB = new PostgresProductionSearchService(runtimeB.sqlPool,searchConfig,fakeMeili.fetch);
  await searchA.configure();
  const projected = await searchA.reindexProduct(canonicalId,now+10);
  if(projected.action!=="upserted") throw new Error("Canonical product was not projected into production search");
  const searchHits = await searchB.search({marketId:"sparta",q:"DB Smoke",type:"product",limit:10});
  if(!searchHits.some(hit=>hit.document.id===canonicalId) || searchHits.some(hit=>Boolean(hit.document.vendorId))) throw new Error("Production search did not preserve canonical-only projection across runtimes");

  const stateFromB = await runtimeB.persistence.customerPrivacy.listForUser({ scope, userId, now: now + 2_000 });
  const searchesFromB = await runtimeB.persistence.engagement.listSavedSearches({ scope, userId });
  const notificationsFromB = await runtimeB.persistence.notificationOperations.centerForUser({ scope, userId });
  const privacyFromB = await runtimeB.persistence.customerPrivacy.privacyRequestsForUser({ scope, userId });
  if (!stateFromB.savedProducts.some((item) => item.canonicalVariantId === canonicalId)) throw new Error("Saved product did not persist across instances");
  if (!stateFromB.recentlyViewed.some((item) => item.canonicalVariantId === canonicalId)) throw new Error("Recent view did not persist across instances");
  if (stateFromB.preferences.recommendationsEnabled !== false) throw new Error("Personalization preference did not persist across instances");
  if (!searchesFromB.some((item) => item.id === savedSearch.id)) throw new Error("Saved search did not persist across instances");
  if (!notificationsFromB.some((item) => item.id === notification.id)) throw new Error("Notification centre state did not persist across instances");
  if (!privacyFromB.some((item) => item.id === privacyRequest.id)) throw new Error("Privacy request did not persist across instances");

  const publicFromA = await runtime.customerCommerce.publicCanonicals();
  const publicFromB = await runtimeB.customerCommerce.publicCanonicalAvailability(canonicalId, { postcode: "23100", now: now + 2_100 });
  if (!publicFromA.some((item) => item.id === canonicalId) || !publicFromB?.available || publicFromB.availableToSell !== 2) throw new Error("Database-backed public catalog/availability did not agree across instances");

  await runtime.customerCommerce.syncCustomerCart({ customerId: userId, items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 2_200 });
  const cartFromB = await runtimeB.customerCommerce.customerCart(userId);
  if (cartFromB.items.length !== 1 || cartFromB.items[0].canonicalVariantId !== canonicalId || cartFromB.items[0].quantity !== 1) throw new Error("Persistent customer cart was not visible across instances");

  const checkoutKey = `checkout-${suffix}-primary`;
  const checkoutInput = { checkoutKey, visitorKey: `visitor_${suffix}_primary`, customerId: userId, postcode: "23100", fulfilmentMode: "pickup" as const, items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 2_300, developmentAuthorisePayment: true };
  const [checkoutA, checkoutB] = await Promise.all([
    runtime.customerCommerce.checkout(checkoutInput),
    runtimeB.customerCommerce.checkout(checkoutInput)
  ]);
  if (checkoutA.id !== checkoutB.id) throw new Error("Cross-instance idempotent checkout produced different customer orders");
  const persistedOrderCount = await runtime.sqlPool.query<{ count: string } & Record<string, unknown>>("SELECT count(*)::text AS count FROM customer_orders WHERE checkout_key=$1", [checkoutKey]);
  if (Number(persistedOrderCount.rows[0]?.count ?? 0) !== 1) throw new Error("Idempotent checkout key persisted more than one order");
  const cartAfterCheckout = await runtimeB.customerCommerce.customerCart(userId);
  if (cartAfterCheckout.items.length !== 0) throw new Error("Authenticated persistent cart was not cleared by committed checkout");
  const orderFromB = await runtimeB.customerCommerce.orderForCustomer(userId, checkoutA.id);
  if (!orderFromB || orderFromB.id !== checkoutA.id || orderFromB.customerId !== userId) throw new Error("Customer order was not visible across instances");

  const contention = await Promise.allSettled([
    runtime.customerCommerce.checkout({ checkoutKey: `checkout-${suffix}-race-a`, visitorKey: `visitor_${suffix}_race_a`, postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 2_400, developmentAuthorisePayment: true }),
    runtimeB.customerCommerce.checkout({ checkoutKey: `checkout-${suffix}-race-b`, visitorKey: `visitor_${suffix}_race_b`, postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 2_400, developmentAuthorisePayment: true })
  ]);
  if (contention.filter((result) => result.status === "fulfilled").length !== 1 || contention.filter((result) => result.status === "rejected").length !== 1) throw new Error("Concurrent checkout did not enforce the final unit of stock exactly once");
  const balanceAfterRace = await runtime.sqlPool.query<{ active_reservations: number } & Record<string, unknown>>("SELECT active_reservations FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)", [offerId]);
  if (Number(balanceAfterRace.rows[0]?.active_reservations ?? 0) !== 2) throw new Error("Concurrent reservation accounting does not match the two reserved units");

  const cancelled = await runtimeB.customerCommerce.cancelCustomerOrder({ customerId: userId, orderId: checkoutA.id, reason: "DB integration cancellation proof", now: now + 2_500 });
  if (cancelled.status !== "cancelled") throw new Error("Cross-instance customer cancellation did not persist");
  const cancelledFromA = await runtime.customerCommerce.orderForCustomer(userId, checkoutA.id);
  if (cancelledFromA?.status !== "cancelled") throw new Error("Customer cancellation was not visible across instances");

  const pendingKey = `checkout-${suffix}-pending-expiry`;
  const pending = await runtime.customerCommerce.checkout({ checkoutKey: pendingKey, visitorKey: `visitor_${suffix}_pending`, postcode: "23100", fulfilmentMode: "pickup", items: [{ canonicalVariantId: canonicalId, quantity: 1 }], now: now + 2_600 });
  if (pending.status !== "pending_payment") throw new Error("Pre-PSP database checkout must remain pending_payment by default");
  await runtime.sqlPool.query("UPDATE stock_reservations SET expires_at=$2 WHERE checkout_key=$1 AND status='active'", [pendingKey, new Date(now + 2_500)]);
  await runtime.persistence.inventory.expireReservations({ now: now + 2_700, limit: 100 });
  const abandoned = await runtime.sqlPool.query<{ expired: number } & Record<string, unknown>>("SELECT expire_pending_payment_orders($1,$2) AS expired", [new Date(now + 2_700), 100]);
  if (Number(abandoned.rows[0]?.expired ?? 0) < 1) throw new Error("Expired pending-payment order was not cleaned up");
  const pendingAfterExpiry = await runtime.sqlPool.query<{ status: string; cancellation_reason: string } & Record<string, unknown>>("SELECT status,cancellation_reason FROM customer_orders WHERE public_id=$1", [pending.id]);
  if (pendingAfterExpiry.rows[0]?.status !== "cancelled" || pendingAfterExpiry.rows[0]?.cancellation_reason !== "payment_window_expired") throw new Error("Pending-payment expiry did not cancel the abandoned order deterministically");

  // Prove that Vendor identity and operational state are shared across independent
  // application runtimes while the vendor tenant boundary remains enforced.
  const vendorAuthA = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret });
  const vendorAuthB = new PostgresVendorAuthService({ identity: runtimeB.persistence.identity, secret });
  const vendorLogin = await vendorAuthA.authenticate({ email: vendorEmail, password: "Vendor!12345", now: now + 2_800 });
  const vendorPrincipalB = await vendorAuthB.session(vendorLogin.token, now + 2_900);
  if (!vendorPrincipalB || vendorPrincipalB.userId !== vendorUserId || vendorPrincipalB.vendorId !== vendorId) throw new Error("PostgreSQL Vendor session was not visible across runtime instances");
  vendorAuthB.assertCsrf(vendorPrincipalB, vendorLogin.principal.csrfToken);

  const vendorDashboardA = await runtime.vendorOperations.dashboard(vendorLogin.principal);
  if (!vendorDashboardA.products.some((item) => item.offerId === offerId)) throw new Error("Vendor dashboard did not expose its own persisted offer");
  await runtime.vendorOperations.updateStock(vendorLogin.principal, { offerId, onHand: 3, now: now + 3_000 });
  const vendorDashboardB = await runtimeB.vendorOperations.dashboard(vendorPrincipalB);
  if (vendorDashboardB.products.find((item) => item.offerId === offerId)?.onHand !== 3) throw new Error("Vendor stock update was not visible across runtime instances");

  const vendorDraft = await runtime.vendorOperations.createProductDraft(vendorLogin.principal, {
    title: `DB Smoke Vendor Draft ${suffix}`, categoryCode: `db-smoke-${suffix}`, vendorSku: `DRAFT-${suffix}`,
    supplierUnitPriceMinor: 700, stockOnHand: 2, safetyStock: 0, adviceAvailable: true
  });
  const vendorCatalogB = await runtimeB.vendorOperations.catalogWorkspace(vendorPrincipalB);
  if (!vendorCatalogB.submissions.some((item) => item.id === vendorDraft.id && item.status === "draft")) throw new Error("Vendor catalog draft was not visible across runtime instances");
  await runtimeB.vendorOperations.submitProduct(vendorPrincipalB, vendorDraft.id);
  const vendorCatalogA = await runtime.vendorOperations.catalogWorkspace(vendorLogin.principal);
  if (vendorCatalogA.submissions.find((item) => item.id === vendorDraft.id)?.status !== "submitted") throw new Error("Vendor catalog submission was not visible across runtime instances");

  // Prove durable media intent/finalization/scan state across independent runtime instances.
  const mediaIntent = await runtime.mediaPipeline.createUploadIntent(vendorLogin.principal,{canonicalVariantId:canonicalId,kind:"image",filename:`smoke-${suffix}.png`,contentType:"image/png",byteSize:123,altText:"DB smoke image",rightsOwner:"DB Smoke Vendor",now:now+3_020});
  const mediaAsset = await runtimeB.mediaPipeline.completeUpload(vendorPrincipalB,{intentId:mediaIntent.id,actualByteSize:123,actualContentType:"image/png",now:now+3_030});
  const mediaLease = await runtime.mediaPipeline.claimNextScan({workerId:`db-smoke-media-${suffix}`,now:now+3_040});
  if(!mediaLease||mediaLease.assetId!==mediaAsset.assetId) throw new Error("Media scan lease was not visible across runtime instances");
  await runtime.mediaPipeline.finishScan({workerId:`db-smoke-media-${suffix}`,assetId:mediaLease.assetId,status:"clean",sha256:"a".repeat(64),verifiedObjectKey:`private/verified-media/${mediaLease.assetId}/${"a".repeat(64)}`,now:now+3_045});
  const vendorTrustB = await runtimeB.vendorOperations.trustWorkspace(vendorPrincipalB);
  if(vendorTrustB.assets.find((asset)=>asset.id===mediaAsset.assetId)?.scanStatus!=="clean") throw new Error("Media scan result was not visible across runtime instances");

  const raceOrder = contention.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof runtime.customerCommerce.checkout>>> => result.status === "fulfilled")?.value;
  if (!raceOrder) throw new Error("Expected one fulfilled race checkout for Vendor fulfilment proof");
  const fulfilmentForVendor = (await runtime.vendorOperations.dashboard(vendorLogin.principal)).fulfilments.find((item) => item.orderId === raceOrder.id);
  if (!fulfilmentForVendor) throw new Error("Vendor fulfilment was not visible for the persisted order");
  // The development authorisation flag proves checkout mechanics only. Vendor acceptance now correctly
  // requires a payment-confirmed order, so the DB smoke promotes this synthetic order explicitly.
  await runtime.sqlPool.query("UPDATE customer_orders SET status='confirmed',confirmed_at=$2,updated_at=$2 WHERE public_id=$1", [raceOrder.id, new Date(now + 3_050)]);
  await runtime.sqlPool.query("UPDATE payments SET status='captured',captured_minor=(SELECT total_minor FROM customer_orders WHERE public_id=$1),authorised_minor=(SELECT total_minor FROM customer_orders WHERE public_id=$1),updated_at=$2 WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)", [raceOrder.id, new Date(now + 3_050)]);
  // Add a second supplier only after the order is already assigned to the first vendor. Rejection must
  // atomically release the original reservation, rerun fair eligibility excluding the rejecting supplier,
  // reserve the replacement stock and create a linked rescue fulfilment in one transaction.
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses (public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `,[rescueVendorId,`DB Smoke Rescue Vendor ${suffix}`,new Date(now+3_060)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations (public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'DB Smoke Rescue Location','2 Test Street','Sparta','23100',true,$3 FROM market,vendor
  `,[rescueVendorId,rescueLocationId,new Date(now+3_060)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers (public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at)
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',810,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$6 FROM market,vendor,location,canonical
  `,[rescueVendorId,rescueLocationId,canonicalId,rescueOfferId,`RESCUE-${suffix}`,new Date(now+3_060)]);
  await runtime.sqlPool.query(`INSERT INTO inventory_balances (offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at)
    SELECT id,2,0,0,0,'db_smoke_rescue','merchant_confirmed',$2,86400,'fresh',$2 FROM vendor_offers WHERE public_id=$1`,[rescueOfferId,new Date(now+3_060)]);
  const rescuedOrder = await runtimeB.vendorOperations.actOnFulfilment(vendorPrincipalB,{fulfilmentId:fulfilmentForVendor.id,action:"reject",now:now+3_100});
  if (!("status" in rescuedOrder) || rescuedOrder.status !== "confirmed") throw new Error("Atomic Vendor rejection unexpectedly changed a fully rescued order out of confirmed state");
  const rescueState = await runtime.sqlPool.query<{old_status:string;new_status:string;assigned_offer:string;rescued_from:string;old_reservation:string;new_reservation:string} & Record<string,unknown>>(`
    SELECT oldfo.status::text AS old_status,newfo.status::text AS new_status,vo.public_id AS assigned_offer,newfo.rescued_from_fulfilment_id::text AS rescued_from,
           oldsr.status::text AS old_reservation,newsr.status::text AS new_reservation
    FROM fulfilment_orders oldfo
    JOIN customer_orders o ON o.id=oldfo.order_id
    JOIN fulfilment_orders newfo ON newfo.rescued_from_fulfilment_id=oldfo.id
    JOIN fulfilment_order_lines nfl ON nfl.fulfilment_order_id=newfo.id
    JOIN order_lines ol ON ol.id=nfl.order_line_id
    JOIN vendor_offers vo ON vo.id=ol.assigned_offer_id
    JOIN stock_reservations newsr ON newsr.order_line_id=ol.id AND newsr.status='active'
    JOIN stock_reservations oldsr ON oldsr.checkout_key=$2 AND oldsr.status='released'
    WHERE oldfo.public_id=$1`,[fulfilmentForVendor.id,raceOrder.checkoutKey]);
  const rescueRow=rescueState.rows[0];
  if(!rescueRow||rescueRow.old_status!=="rejected"||rescueRow.new_status!=="awaiting_acceptance"||rescueRow.assigned_offer!==rescueOfferId||rescueRow.old_reservation!=="released"||rescueRow.new_reservation!=="active") throw new Error("Atomic Vendor rescue did not persist the expected reservation/fulfilment reassignment");
  const rescueReplay = await runtime.vendorOperations.actOnFulfilment(vendorLogin.principal,{fulfilmentId:fulfilmentForVendor.id,action:"reject",now:now+3_110});
  if (!("id" in rescueReplay) || rescueReplay.id!==raceOrder.id) throw new Error("Vendor rescue retry was not idempotent");
  await runtime.sqlPool.query("UPDATE vendor_offers SET status='archived' WHERE public_id=$1",[rescueOfferId]);

  // Viva Smart Checkout provider proof without external network access. Both services share PostgreSQL
  // but are independent application-runtime facades over one deterministic fake provider gateway.
  const vivaGateway = new FakeVivaGateway();
  const vivaA = new PostgresVivaPaymentsService(runtime.sqlPool, vivaGateway, { emailNotificationsEnabled:true });
  const vivaB = new PostgresVivaPaymentsService(runtimeB.sqlPool, vivaGateway, { emailNotificationsEnabled:true });
  const vivaCheckoutKey = `checkout-${suffix}-viva`;
  const vivaVisitorKey = `visitor_${suffix}_viva`;
  const vivaOrder = await runtime.customerCommerce.checkout({ checkoutKey:vivaCheckoutKey, visitorKey:vivaVisitorKey, customerId:userId, postcode:"23100", fulfilmentMode:"pickup", items:[{canonicalVariantId:canonicalId,quantity:1}], now:now+3_150 });
  if (vivaOrder.status !== "pending_payment") throw new Error("Viva proof order must begin pending_payment");
  const vivaInitiatedA = await vivaA.initiateOrderPayment({ orderId:vivaOrder.id, customerId:userId, visitorKey:vivaVisitorKey, now:now+3_160 });
  const vivaInitiatedB = await vivaB.initiateOrderPayment({ orderId:vivaOrder.id, customerId:userId, visitorKey:vivaVisitorKey, now:now+3_170 });
  if (vivaInitiatedA.orderCode !== vivaInitiatedB.orderCode || vivaGateway.createCount !== 1) throw new Error("Cross-instance Viva initiation was not provider-order idempotent");
  const vivaTransactionId = vivaGateway.confirm(vivaInitiatedA.orderCode, vivaOrder.total.minor);
  const vivaConfirmed = await vivaB.reconcileTransaction({ transactionId:vivaTransactionId, expectedOrderCode:vivaInitiatedA.orderCode, source:"webhook", now:now+3_180 });
  if (vivaConfirmed.paymentStatus !== "captured" || vivaConfirmed.orderStatus !== "confirmed") throw new Error("Verified Viva payment did not confirm the customer order");

  // Payment confirmation emits a durable transactional email. A second runtime
  // can deliver and reconcile its provider webhook against the same PostgreSQL state.
  const resendRequests:Array<{url:string;body:Record<string,unknown>;idempotency?:string}>=[];
  const resendFetch:typeof fetch=async(url,init)=>{
    const headerSource=init?.headers as Record<string,string>|undefined;
    const body=JSON.parse(String(init?.body)) as Record<string,unknown>;
    resendRequests.push({url:String(url),body,idempotency:headerSource?.["idempotency-key"]});
    return jsonResponse(200,{id:`resend-${suffix}-${resendRequests.length}`});
  };
  const resendConfig={apiKey:"re_db_smoke",from:"Buy Local Sparta <noreply@example.test>",baseUrl:"https://api.resend.db-smoke.test",timeoutMs:1_000};
  const suppressionSecret=`db-smoke-notification-suppression-${suffix}-0123456789`;
  const emailWorkerA=new PostgresResendNotificationService({db:runtime.sqlPool,store:runtime.persistence.notificationOperations,attemptSink:runtime.persistence.notificationOperations,config:resendConfig,suppressionSecret,workerId:`db-smoke-email-${suffix}`,fetchImpl:resendFetch});
  const deliveredEmail=await emailWorkerA.runOnce(now+3_185,50);
  if(deliveredEmail.sent<1||!resendRequests.some(request=>String(request.body.subject??"").includes("πληρωμή"))) throw new Error("Durable payment confirmation email was not sent through Resend adapter");
  const sentNotification=await runtime.sqlPool.query<{provider_message_id:string}&Record<string,unknown>>(`SELECT provider_message_id FROM notifications WHERE user_id=(SELECT id FROM users WHERE public_id=$1) AND event_type='order.payment_confirmed' AND channel='email' AND status='sent' ORDER BY created_at DESC LIMIT 1`,[userId]);
  const providerMessageId=String(sentNotification.rows[0]?.provider_message_id??"");
  if(!providerMessageId) throw new Error("Resend provider message id was not persisted");
  const emailWorkerB=new PostgresResendNotificationService({db:runtimeB.sqlPool,store:runtimeB.persistence.notificationOperations,attemptSink:runtimeB.persistence.notificationOperations,config:resendConfig,suppressionSecret,workerId:`db-smoke-email-b-${suffix}`,fetchImpl:resendFetch});
  const providerEvent={id:`svix-${suffix}`,type:"email.delivered",createdAt:now+3_186,emailId:providerMessageId,data:{email_id:providerMessageId}};
  const webhookResult=await emailWorkerB.processWebhook(providerEvent,now+3_186);
  if(webhookResult.duplicate) throw new Error("First Resend webhook was treated as duplicate");
  if(!(await emailWorkerA.processWebhook(providerEvent,now+3_187)).duplicate) throw new Error("Resend webhook idempotency was not shared across runtimes");
  await runtime.sqlPool.query("UPDATE stock_reservations SET expires_at=$2 WHERE checkout_key=$1 AND status='active'", [vivaCheckoutKey, new Date(now + 3_000)]);
  await runtime.persistence.inventory.expireReservations({ now:now+3_190, limit:100 });
  const paidReservation = await runtime.sqlPool.query<{status:string} & Record<string,unknown>>("SELECT status::text AS status FROM stock_reservations WHERE checkout_key=$1", [vivaCheckoutKey]);
  if (paidReservation.rows[0]?.status !== "active") throw new Error("Paid Viva reservation was incorrectly expired by the reservation worker");
  const vivaFulfilment = (await runtime.vendorOperations.dashboard(vendorLogin.principal)).fulfilments.find((item)=>item.orderId===vivaOrder.id);
  if (!vivaFulfilment) throw new Error("Paid Viva fulfilment was not visible to the assigned vendor");
  const stockBeforeVivaAccept = await runtime.sqlPool.query<{on_hand:number;active_reservations:number} & Record<string,unknown>>("SELECT on_hand,active_reservations FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)",[offerId]);
  await runtimeB.vendorOperations.actOnFulfilment(vendorPrincipalB,{fulfilmentId:vivaFulfilment.id,action:"accept",now:now+3_200});
  const stockAfterVivaAccept = await runtime.sqlPool.query<{on_hand:number;active_reservations:number} & Record<string,unknown>>("SELECT on_hand,active_reservations FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)",[offerId]);
  if (Number(stockAfterVivaAccept.rows[0]?.on_hand) !== Number(stockBeforeVivaAccept.rows[0]?.on_hand)-1 || Number(stockAfterVivaAccept.rows[0]?.active_reservations)!==Number(stockBeforeVivaAccept.rows[0]?.active_reservations)-1) throw new Error("Vendor acceptance did not consume the paid Viva stock reservation exactly once");
  await vivaA.prepareOrderCancellation({ orderId:vivaOrder.id, reason:"DB smoke Viva refund/cancellation proof", now:now+3_210 });
  if (vivaGateway.refundCount !== 1 || !vivaGateway.lastRefundTransactionId) throw new Error("Captured Viva cancellation did not execute exactly one provider refund");
  const vivaCancelled = await runtime.customerCommerce.cancelCustomerOrder({ customerId:userId, orderId:vivaOrder.id, reason:"DB smoke Viva refund/cancellation proof", now:now+3_220 });
  if (vivaCancelled.status !== "cancelled") throw new Error("Refunded Viva order did not persist customer cancellation");
  const stockAfterVivaCancel = await runtime.sqlPool.query<{on_hand:number;active_reservations:number} & Record<string,unknown>>("SELECT on_hand,active_reservations FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)",[offerId]);
  if (Number(stockAfterVivaCancel.rows[0]?.on_hand) !== Number(stockBeforeVivaAccept.rows[0]?.on_hand)) throw new Error("Cancellation after Vendor acceptance did not restore consumed Viva stock");
  const paymentAfterRefund = await runtime.sqlPool.query<{captured_minor:number;refunded_minor:number;status:string} & Record<string,unknown>>("SELECT captured_minor,refunded_minor,status::text AS status FROM payments WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)",[vivaOrder.id]);
  if (Number(paymentAfterRefund.rows[0]?.refunded_minor)!==Number(paymentAfterRefund.rows[0]?.captured_minor) || paymentAfterRefund.rows[0]?.status!=="refunded") throw new Error("Viva cancellation refund did not reconcile payment totals");
  const refundTx=vivaGateway.lastRefundTransactionId;
  await vivaB.handleWebhook({EventTypeId:1797,EventData:{TransactionId:refundTx,ParentId:vivaTransactionId,OrderCode:vivaInitiatedA.orderCode,Amount:-(vivaOrder.total.minor/100)}},now+3_230);
  const paymentAfterDuplicateReversal = await runtime.sqlPool.query<{refunded_minor:number} & Record<string,unknown>>("SELECT refunded_minor FROM payments WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)",[vivaOrder.id]);
  if (Number(paymentAfterDuplicateReversal.rows[0]?.refunded_minor)!==vivaOrder.total.minor) throw new Error("Viva reversal webhook double-counted a synchronously recorded refund");
  await vivaA.reconcileTransaction({transactionId:vivaTransactionId,expectedOrderCode:vivaInitiatedA.orderCode,source:"webhook",now:now+3_240});
  const paymentAfterOldSuccess = await runtime.sqlPool.query<{status:string;refunded_minor:number} & Record<string,unknown>>("SELECT status::text AS status,refunded_minor FROM payments WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)",[vivaOrder.id]);
  if (paymentAfterOldSuccess.rows[0]?.status!=="refunded" || Number(paymentAfterOldSuccess.rows[0]?.refunded_minor)!==vivaOrder.total.minor) throw new Error("Out-of-order Viva success event regressed an already-refunded payment");

  const lateCaptureKey = `checkout-${suffix}-viva-late-capture`;
  const lateCaptureVisitor = `visitor_${suffix}_viva_late_capture`;
  const lateCaptureOrder = await runtime.customerCommerce.checkout({ checkoutKey:lateCaptureKey, visitorKey:lateCaptureVisitor, customerId:userId, postcode:"23100", fulfilmentMode:"pickup", items:[{canonicalVariantId:canonicalId,quantity:1}], now:now+3_250 });
  const lateCaptureInitiated = await vivaA.initiateOrderPayment({ orderId:lateCaptureOrder.id, customerId:userId, visitorKey:lateCaptureVisitor, now:now+3_260 });
  await vivaA.prepareOrderCancellation({ orderId:lateCaptureOrder.id, reason:"DB smoke cancel before provider capture", now:now+3_270 });
  const lateCaptureCancelled = await runtime.customerCommerce.cancelCustomerOrder({ customerId:userId, orderId:lateCaptureOrder.id, reason:"DB smoke cancel before provider capture", now:now+3_280 });
  if (lateCaptureCancelled.status !== "cancelled") throw new Error("Late-capture proof order did not cancel before provider capture");
  const refundsBeforeLateCapture = vivaGateway.refundCount;
  const lateCaptureTransactionId = vivaGateway.confirm(lateCaptureInitiated.orderCode, lateCaptureOrder.total.minor);
  const lateCaptureReconciled = await vivaB.reconcileTransaction({ transactionId:lateCaptureTransactionId, expectedOrderCode:lateCaptureInitiated.orderCode, source:"webhook", now:now+3_290 });
  if (lateCaptureReconciled.orderStatus !== "cancelled" || lateCaptureReconciled.paymentStatus !== "refunded") throw new Error("Late Viva capture after cancellation was not automatically refunded");
  if (vivaGateway.refundCount !== refundsBeforeLateCapture + 1) throw new Error("Late capture did not execute exactly one provider refund");
  await vivaA.reconcileTransaction({ transactionId:lateCaptureTransactionId, expectedOrderCode:lateCaptureInitiated.orderCode, source:"webhook", now:now+3_300 });
  if (vivaGateway.refundCount !== refundsBeforeLateCapture + 1) throw new Error("Late-capture reconciliation retried an already-recorded provider refund");
  const lateCapturePayment = await runtime.sqlPool.query<{status:string;captured_minor:number;refunded_minor:number} & Record<string,unknown>>("SELECT status::text AS status,captured_minor,refunded_minor FROM payments WHERE order_id=(SELECT id FROM customer_orders WHERE public_id=$1)",[lateCaptureOrder.id]);
  if (lateCapturePayment.rows[0]?.status !== "refunded" || Number(lateCapturePayment.rows[0]?.captured_minor) !== Number(lateCapturePayment.rows[0]?.refunded_minor)) throw new Error("Late-capture payment totals did not settle back to fully refunded");
  const lateCaptureRefund = await runtime.sqlPool.query<{status:string} & Record<string,unknown>>("SELECT status::text AS status FROM refunds WHERE idempotency_key=$1",[`late-capture:${lateCaptureOrder.id}`]);
  if (lateCaptureRefund.rows[0]?.status !== "completed") throw new Error("Late-capture refund was not durably recorded under its stable idempotency key");

  let tenantIsolation = false;
  try {
    await runtimeB.vendorOperations.updateStock({ ...vendorPrincipalB, vendorId: `vendor_other_${suffix}` }, { offerId, onHand: 4, now: now + 3_200 });
  } catch (error) {
    tenantIsolation = error instanceof Error && /access denied|not found/i.test(error.message);
  }
  if (!tenantIsolation) throw new Error("Vendor tenant isolation did not deny cross-vendor stock access");

  await vendorAuthB.logout(vendorLogin.token, now + 3_300);
  if (await vendorAuthA.session(vendorLogin.token, now + 3_400)) throw new Error("Vendor session revocation was not visible across runtime instances");

  const adminAuthA = new PostgresAdminAuthService({ identity: runtime.persistence.identity, secret });
  const adminAuthB = new PostgresAdminAuthService({ identity: runtimeB.persistence.identity, secret });
  const adminLogin = await adminAuthA.authenticate({ email: adminEmail, password: "AdminStrong!123", now: now + 3_500 });
  const adminPrincipalB = await adminAuthB.session(adminLogin.token, now + 3_600);
  if (!adminPrincipalB || adminPrincipalB.userId !== adminUserId || adminPrincipalB.vendorId) throw new Error("PostgreSQL Admin session was not visible across runtime instances");
  adminAuthB.assertCsrf(adminPrincipalB, adminLogin.principal.csrfToken);

  await runtime.adminGovernance.upsertCategory(adminLogin.principal, { categoryCode: `db-smoke-${suffix}`, labelEl: `DB Smoke ${suffix}`, commerceMode: "compatibility_sensitive", now: now + 3_700 });
  const categoriesFromB = await runtimeB.adminGovernance.categoryWorkspace(adminPrincipalB);
  const governedCategory = categoriesFromB.categories.find((item) => item.categoryCode === `db-smoke-${suffix}`);
  if (!governedCategory || governedCategory.commerceMode !== "compatibility_sensitive" || !governedCategory.requireCompatibilityConfirmation) throw new Error("Admin category governance was not visible across runtime instances");

  const page = await runtime.adminGovernance.createContentPage(adminLogin.principal, { slug: `db-smoke-${suffix}`, title: `DB Smoke ${suffix}`, description: "Cross-instance CMS governance proof", now: now + 3_800 });
  await runtimeB.adminGovernance.contentAction(adminPrincipalB, { pageId: page.id, action: "publish", now: now + 3_900 });
  const contentFromA = await runtime.adminGovernance.contentWorkspace(adminLogin.principal);
  if (contentFromA.pages.find((item) => item.id === page.id)?.status !== "published") throw new Error("Admin CMS publication was not visible across runtime instances");

  const recall = await runtime.adminGovernance.openRecall(adminLogin.principal, { canonicalVariantId: canonicalId, details: "DB smoke recall governance proof", severity: "high", now: now + 4_000 });
  const suppressedFromB = await runtimeB.customerCommerce.publicCanonicalAvailability(canonicalId, { postcode: "23100", now: now + 4_100 });
  if (suppressedFromB !== undefined) throw new Error("Admin recall did not suppress the canonical product across instances");
  await runtimeB.adminGovernance.resolveRecall(adminPrincipalB, { noticeId: recall.notice.id, resolution: "DB smoke recall resolved", restoreProduct: true, now: now + 4_200 });
  const restoredFromA = await runtime.customerCommerce.publicCanonicalAvailability(canonicalId, { postcode: "23100", now: now + 4_300 });
  if (!restoredFromA) throw new Error("Resolved Admin recall did not restore the canonical product across instances");

  const raceFulfilmentId = fulfilmentForVendor.id;
  const procurementId = `procurement_admin_db_smoke_${suffix}`;
  await runtime.sqlPool.query(`
    INSERT INTO procurements(id,public_id,procurement_number,market_id,order_id,fulfilment_order_id,vendor_id,status,currency,supplier_net_minor,supplier_tax_minor,shipping_reimbursement_minor,service_fee_minor,adjustment_minor,payable_minor,created_at,updated_at)
    SELECT gen_random_uuid(),$1,$2,m.id,o.id,fo.id,v.id,'payable','EUR',800,192,0,0,0,992,$3,$3
    FROM markets m,customer_orders o,fulfilment_orders fo,vendor_businesses v
    WHERE m.code='sparta' AND o.public_id=$4 AND fo.public_id=$5 AND v.public_id=$6
  `, [procurementId, `PROC-${suffix}`, new Date(now + 4_400), raceOrder.id, raceFulfilmentId, vendorId]);
  const batch = await runtime.adminOperations.settlementAction(adminLogin.principal, { kind: "create", procurementIds: [procurementId], now: now + 4_500 });
  await runtime.adminOperations.settlementAction(adminLogin.principal, { kind: "submit", batchId: batch.id, now: now + 4_600 });
  let makerBlocked = false;
  try { await runtimeB.adminOperations.settlementAction(adminPrincipalB, { kind: "approve", batchId: batch.id, now: now + 4_700 }); }
  catch (error) { makerBlocked = error instanceof Error && /maker cannot approve/i.test(error.message); }
  if (!makerBlocked) throw new Error("PostgreSQL Admin settlement maker/checker separation was not enforced");
  const financeAuth = new PostgresAdminAuthService({ identity: runtimeB.persistence.identity, secret });
  const financeLogin = await financeAuth.authenticate({ email: financeEmail, password: "FinanceStrong!123", now: now + 4_800 });
  await runtimeB.adminOperations.settlementAction(financeLogin.principal, { kind: "approve", batchId: batch.id, now: now + 4_900 });
  await runtime.adminOperations.settlementAction(financeLogin.principal, { kind: "pay", batchId: batch.id, payoutReference: `DBSMOKE-${suffix}`, now: now + 5_000 });
  const financeFromB = await runtimeB.adminOperations.financeWorkspace(financeLogin.principal);
  if (financeFromB.settlements.find((item) => item.id === batch.id)?.status !== "paid") throw new Error("Admin settlement state was not visible across runtime instances");

  const operationsFromB = await runtimeB.adminOperations.operationsWorkspace(adminPrincipalB);
  if (!operationsFromB.audit.some((event) => String(event.action).includes("product.recall_opened"))) throw new Error("Admin audit trail was not visible across runtime instances");
  await adminAuthB.logout(adminLogin.token, now + 5_100);
  if (await adminAuthA.session(adminLogin.token, now + 5_200)) throw new Error("Admin session revocation was not visible across runtime instances");

  const limiterA = new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  const limiterB = new PostgresFixedWindowRateLimiter(runtimeB.sqlPool);
  for (let index = 0; index < 5; index += 1) {
    const decision = await (index % 2 ? limiterA : limiterB).consume({ route: "db-smoke-login", key: suffix, limit: 5, windowMs: 60_000, now: now + index });
    if (!decision.allowed) throw new Error("Cross-instance rate limit blocked too early");
  }
  const blocked = await limiterB.consume({ route: "db-smoke-login", key: suffix, limit: 5, windowMs: 60_000, now: now + 10 });
  if (blocked.allowed || blocked.retryAfterMs <= 0) throw new Error("Cross-instance rate limit did not block the sixth attempt");

  await authB.logout(login.token, now + 3_000);
  if (await authA.session(login.token, now + 4_000)) throw new Error("Session revocation was not visible across runtime instances");

  const activationEvidence = await runtime.activationEvidence.record({ provider:"database", environment:"ci", buildVersion:"db-smoke", checkName:`cross-instance-${suffix}`, checkKind:"scenario", status:"passed", evidence:`db-smoke:${requestId}`, details:{ crossInstance:true }, observedAt:now+5_000, expiresAt:now+60_000 });
  const activationEvidenceSeen = (await runtimeB.activationEvidence.latest()).some((row) => row.id === activationEvidence.id && row.status === "passed");
  if (!activationEvidenceSeen) throw new Error("Activation evidence was not visible across runtime instances");

  const publicProducts = await runtime.persistence.catalog.listCanonicals({ marketId: "sparta", activeOnly: true });
  console.log(JSON.stringify({
    ok: true,
    schema: readiness.appliedSchemaVersion,
    activeCanonicalProducts: publicProducts.length,
    crossInstanceCustomerState: true,
    crossInstanceSessionRevocation: true,
    crossInstanceLoginRateLimit: true,
    crossInstancePersistentCart: true,
    idempotentCheckout: true,
    concurrentOversellProtection: true,
    crossInstanceCustomerOrders: true,
    pendingPaymentExpiryCleanup: true,
    crossInstanceVendorSession: true,
    crossInstanceVendorInventory: true,
    crossInstanceVendorCatalog: true,
    crossInstanceVendorFulfilment: true,
    atomicVendorRescueRouting: true,
    crossInstanceMediaPipeline: true,
    crossInstanceProductionSearchProjection: true,
    crossInstanceResendDeliveryWebhook: true,
    vivaCrossInstancePaymentOrder: true,
    vivaVerifiedPaymentConfirmation: true,
    vivaPaidReservationProtection: true,
    vivaRefundCancellation: true,
    vivaReversalDeduplication: true,
    vivaOutOfOrderWebhookMonotonicity: true,
    vivaLateCaptureAutoRefund: true,
    vendorTenantIsolation: true,
    crossInstanceAdminSession: true,
    crossInstanceAdminCategoryGovernance: true,
    crossInstanceAdminCms: true,
    crossInstanceAdminRecall: true,
    adminSettlementMakerChecker: true,
    crossInstanceAdminAudit: true,
    crossInstanceActivationEvidence: true,
    requestId
  }, null, 2));
} finally {
  // CI database is disposable, but explicit cleanup keeps local integration runs repeatable.
  try {
    await runtime.sqlPool.query("DELETE FROM provider_activation_evidence WHERE build_version='db-smoke' AND check_name=$1", [`cross-instance-${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM settlement_lines WHERE batch_id IN (SELECT id FROM settlement_batches WHERE batch_number LIKE $1)", [`%${suffix.toUpperCase()}%`]);
    await runtime.sqlPool.query("DELETE FROM settlement_batches WHERE batch_number LIKE $1", [`%${suffix.toUpperCase()}%`]);
    await runtime.sqlPool.query("DELETE FROM procurements WHERE public_id=$1", [`procurement_admin_db_smoke_${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM recall_affected_orders WHERE notice_id IN (SELECT id FROM product_notices WHERE public_id LIKE $1)", [`notice_%`]);
    await runtime.sqlPool.query("DELETE FROM product_notices WHERE canonical_variant_id=(SELECT id FROM canonical_variants WHERE public_id=$1) AND details::text LIKE '%DB smoke recall governance proof%'", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM cms_page_revisions WHERE page_id IN (SELECT id FROM cms_pages WHERE slug=$1)", [`db-smoke-${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM cms_page_translations WHERE page_id IN (SELECT id FROM cms_pages WHERE slug=$1)", [`db-smoke-${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM cms_pages WHERE slug=$1", [`db-smoke-${suffix}`]);
    await runtime.sqlPool.query(`DELETE FROM payment_events WHERE payment_id IN (SELECT p.id FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM order_timeline_events WHERE order_id IN (SELECT id FROM customer_orders WHERE checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM refunds WHERE order_id IN (SELECT id FROM customer_orders WHERE checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM payments WHERE order_id IN (SELECT id FROM customer_orders WHERE checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM fulfilment_order_lines WHERE fulfilment_order_id IN (SELECT fo.id FROM fulfilment_orders fo JOIN customer_orders o ON o.id=fo.order_id WHERE o.checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM fulfilment_orders WHERE order_id IN (SELECT id FROM customer_orders WHERE checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM inventory_movements WHERE offer_id IN (SELECT id FROM vendor_offers WHERE public_id=ANY($1::text[]))`, [[offerId,rescueOfferId]]);
    await runtime.sqlPool.query(`DELETE FROM stock_reservations WHERE checkout_key LIKE $1`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM order_lines WHERE order_id IN (SELECT id FROM customer_orders WHERE checkout_key LIKE $1)`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query(`DELETE FROM customer_orders WHERE checkout_key LIKE $1`, [`checkout-${suffix}-%`]);
    await runtime.sqlPool.query("DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id=(SELECT id FROM users WHERE public_id=$1))", [userId]);
    await runtime.sqlPool.query("DELETE FROM carts WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM fairness_assignment_events WHERE canonical_variant_id=(SELECT id FROM canonical_variants WHERE public_id=$1)", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM sticky_assignments WHERE canonical_variant_id=(SELECT id FROM canonical_variants WHERE public_id=$1)", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM fairness_rotation_state WHERE canonical_variant_id=(SELECT id FROM canonical_variants WHERE public_id=$1)", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)", [rescueOfferId]);
    await runtime.sqlPool.query("DELETE FROM vendor_offers WHERE public_id=$1", [rescueOfferId]);
    await runtime.sqlPool.query("DELETE FROM vendor_locations WHERE public_id=$1", [rescueLocationId]);
    await runtime.sqlPool.query("DELETE FROM vendor_businesses WHERE public_id=$1", [rescueVendorId]);
    await runtime.sqlPool.query("DELETE FROM inventory_balances WHERE offer_id=(SELECT id FROM vendor_offers WHERE public_id=$1)", [offerId]);
    await runtime.sqlPool.query("DELETE FROM vendor_offers WHERE public_id=$1", [offerId]);
    await runtime.sqlPool.query("DELETE FROM media_upload_intents WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM product_media WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM catalog_workflow_events WHERE submission_id IN (SELECT id FROM vendor_product_submissions WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1))", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM product_merge_candidates WHERE submission_id IN (SELECT id FROM vendor_product_submissions WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1))", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM vendor_product_submissions WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM vendor_user_roles WHERE vendor_user_id IN (SELECT id FROM vendor_users WHERE user_id=(SELECT id FROM users WHERE public_id=$1))", [vendorUserId]);
    await runtime.sqlPool.query("DELETE FROM vendor_users WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [vendorUserId]);
    await runtime.sqlPool.query("DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE public_id=ANY($1::text[]))", [[adminUserId, financeUserId]]);
    await runtime.sqlPool.query("DELETE FROM platform_user_roles WHERE user_id IN (SELECT id FROM users WHERE public_id=ANY($1::text[]))", [[adminUserId, financeUserId]]);
    await runtime.sqlPool.query("DELETE FROM users WHERE public_id=ANY($1::text[])", [[adminUserId, financeUserId]]);
    await runtime.sqlPool.query("DELETE FROM users WHERE public_id=$1", [vendorUserId]);
    await runtime.sqlPool.query("DELETE FROM vendor_locations WHERE public_id=$1", [locationId]);
    await runtime.sqlPool.query("DELETE FROM vendor_businesses WHERE public_id=$1", [vendorId]);
    await runtime.sqlPool.query("DELETE FROM notification_delivery_attempts WHERE notification_id IN (SELECT id FROM notifications WHERE user_id=(SELECT id FROM users WHERE public_id=$1))", [userId]);
    await runtime.sqlPool.query("DELETE FROM notification_provider_events WHERE provider='resend' AND event_id=$1", [`svix-${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM notification_destination_suppressions WHERE source_event_id=$1", [`svix-${suffix}`]);
    await runtime.sqlPool.query("DELETE FROM notifications WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM search_index_state WHERE entity_type='product' AND entity_public_id=$1", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM users WHERE public_id=$1", [userId]);
    await runtime.sqlPool.query("DELETE FROM canonical_variants WHERE public_id=$1", [canonicalId]);
    await runtime.sqlPool.query("DELETE FROM auth_rate_limit_windows WHERE route='db-smoke-login' AND key_hash IS NOT NULL AND updated_at >= $1", [new Date(now - 1_000)]);
  } catch {}
  await Promise.all([runtime.close(), runtimeB.close()]);
}
