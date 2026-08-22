import { randomUUID } from "node:crypto";
import { hashPassword } from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  PostgresCustomerAuthService,
  PostgresVendorAuthService
} from "../packages/postgres-runtime/src/index.ts";
import { submitAskLocal, customerAskLocalRequests } from "../apps/web/src/lib/ask-local-service.ts";
import {
  askLocalClarificationMessages,
  customerReplyAskLocalClarification,
  vendorRequestAskLocalClarification
} from "../apps/web/src/lib/ask-local-clarification-service.ts";
import {
  customerDecideAskLocalOffer,
  vendorCreateAskLocalOffer
} from "../apps/web/src/lib/ask-local-offer-service.ts";
import { customerAskLocalBrowserRequests } from "../apps/web/src/lib/customer-ask-local-browser-view.ts";
import { requireCustomerPrivateOfferInternalId } from "../apps/web/src/lib/customer-private-offer-action-token.ts";
import {
  checkoutCustomerPrivateOffer,
  customerPrivateOfferCheckoutPreview
} from "../apps/web/src/lib/private-offer-checkout-service.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run Ask Local acceptance outside an explicitly synthetic disposable database");
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "ask-local-lifecycle-acceptance" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const secret = process.env.BLS_AUTH_SECRET?.trim() || "ask-local-acceptance-auth-secret-0123456789";
const customerId = `usr_ask_local_${suffix}`;
const otherCustomerId = `usr_ask_local_other_${suffix}`;
const vendorId = `vendor_ask_local_${suffix}`;
const otherVendorId = `vendor_ask_local_other_${suffix}`;
const vendorUserId = `usr_vendor_ask_local_${suffix}`;
const otherVendorUserId = `usr_vendor_ask_local_other_${suffix}`;
const canonicalId = `canonical_ask_local_${suffix}`;
const locationId = `location_ask_local_${suffix}`;
const otherLocationId = `location_ask_local_other_${suffix}`;
const vendorOfferId = `offer_ask_local_${suffix}`;
const customerEmail = `ask-local-${suffix}@example.test`;
const otherCustomerEmail = `ask-local-other-${suffix}@example.test`;
const vendorEmail = `ask-local-vendor-${suffix}@example.test`;
const otherVendorEmail = `ask-local-vendor-other-${suffix}@example.test`;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(run: () => Promise<unknown>, pattern: RegExp, message: string) {
  let matched = false;
  try {
    await run();
  } catch (error) {
    matched = error instanceof Error && pattern.test(error.message);
  }
  if (!matched) throw new Error(message);
}

function tamperToken(token: string): string {
  const last = token.at(-1) ?? "A";
  return `${token.slice(0, -1)}${last === "A" ? "B" : "A"}`;
}

try {
  const readiness = await runtime.readiness();
  expect(readiness.ok, `Database is not ready: ${readiness.message}`);

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: {
      id: customerId,
      email: customerEmail,
      passwordHash: hashPassword("Customer!12345"),
      status: "active",
      roles: ["customer"],
      emailVerified: true,
      createdAt: now
    }
  });
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: {
      id: otherCustomerId,
      email: otherCustomerEmail,
      passwordHash: hashPassword("Customer!12345"),
      status: "active",
      roles: ["customer"],
      emailVerified: true,
      createdAt: now
    }
  });

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
    category AS (
      INSERT INTO categories (market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable,counteroffer_allowed)
      SELECT id,$1,$1,'standard',true,'product_class',true,true,true FROM market
      ON CONFLICT (market_id,slug) DO UPDATE
      SET active=true,taxonomy_role='product_class',assignable=true,discoverable=true,counteroffer_allowed=true
      RETURNING id
    )
    INSERT INTO canonical_variants (public_id,market_id,category_id,slug,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled)
    SELECT $2,market.id,category.id,$2,1599,'EUR',2400,true,false,false FROM market,category
  `, [`ask-local-${suffix}`, canonicalId]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses (public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [vendorId, `Ask Local Acceptance Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses (public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [otherVendorId, `Ask Local Isolation Vendor ${suffix}`, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations (public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'Ask Local Acceptance','1 Ask Local Street','Sparta','23100',true,$3 FROM market,vendor
  `, [vendorId, locationId, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations (public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'Ask Local Isolation','2 Ask Local Street','Sparta','23100',true,$3 FROM market,vendor
  `, [otherVendorId, otherLocationId, new Date(now)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers (public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at)
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',900,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$6 FROM market,vendor,location,canonical
  `, [vendorId, locationId, canonicalId, vendorOfferId, `ASK-${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    INSERT INTO inventory_balances (offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,stock_confirmed_at,freshness_ttl_seconds,freshness_status,updated_at)
    SELECT id,8,0,0,0,'ask_local_acceptance','merchant_confirmed',$2,86400,'fresh',$2 FROM vendor_offers WHERE public_id=$1
  `, [vendorOfferId, new Date(now)]);

  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
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
    scope: { marketId: "sparta", platformAccess: true },
    account: {
      id: otherVendorUserId,
      email: otherVendorEmail,
      passwordHash: hashPassword("Vendor!12345"),
      status: "active",
      roles: ["vendor_owner"],
      vendorId: otherVendorId,
      emailVerified: true,
      createdAt: now
    }
  });

  const customerAuth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const vendorAuth = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret });
  const customer = await customerAuth.authenticate({ email: customerEmail, password: "Customer!12345", now: now + 100 });
  const otherCustomer = await customerAuth.authenticate({ email: otherCustomerEmail, password: "Customer!12345", now: now + 110 });
  const vendor = await vendorAuth.authenticate({ email: vendorEmail, password: "Vendor!12345", now: now + 120 });
  const otherVendor = await vendorAuth.authenticate({ email: otherVendorEmail, password: "Vendor!12345", now: now + 130 });

  const submitted = await submitAskLocal(customer.principal, {
    need: "Χρειάζομαι αυτή την τοπική επιλογή σε δύο τεμάχια και θέλω ιδιωτική προσφορά.",
    postcode: "23100",
    quantity: 2,
    sourceUrl: "https://example.test/ask-local-source",
    canonicalVariantId: canonicalId,
    preferredVendorId: vendorId,
    category: `ask-local-${suffix}`,
    now: now + 200
  });
  expect(submitted.status === "awaiting_vendor", "Assigned Ask Local request did not enter awaiting_vendor");
  expect(submitted.workflowOwnerKind === "vendor" && submitted.assignedVendorId === vendorId, "Ask Local request was not assigned to the preferred eligible vendor");
  expect(submitted.assignmentReason === "customer_preferred_vendor", "Ask Local assignment reason was not preserved");
  expect(Boolean(submitted.referenceNumber) && submitted.id === submitted.referenceNumber, "Customer Ask Local reference was not canonicalized");
  expect(Math.abs(Number(submitted.responseDueAt) - (now + 200 + 24 * 60 * 60 * 1000)) < 1000, "Vendor response deadline was not initialized to 24 hours");

  const requestRow = await runtime.sqlPool.query<{
    public_id: string; reference_number: string; status: string; assigned_offer_public_id: string
  } & Record<string, unknown>>(`
    SELECT cr.public_id,cr.reference_number,cr.status::text AS status,vo.public_id AS assigned_offer_public_id
    FROM counteroffer_requests cr
    JOIN users u ON u.id=cr.customer_user_id
    LEFT JOIN vendor_offers vo ON vo.id=cr.assigned_offer_id
    WHERE cr.reference_number=$1 AND u.public_id=$2
  `, [submitted.referenceNumber, customer.principal.userId]);
  const requestPublicId = String(requestRow.rows[0]?.public_id ?? "");
  expect(requestPublicId.startsWith("cor_"), "Ask Local internal workflow did not receive a public request id");
  expect(requestRow.rows[0]?.reference_number === submitted.referenceNumber && requestPublicId !== submitted.referenceNumber, "Customer reference and workflow public id were not separated");
  expect(requestRow.rows[0]?.assigned_offer_public_id === vendorOfferId, "Ask Local request was not pinned to the vendor offer used for secure conversion");
  expect(!(await customerAskLocalRequests(otherCustomer.principal)).some((item) => item.referenceNumber === submitted.referenceNumber), "Cross-customer Ask Local request leaked into another account");

  await expectFailure(
    () => vendorRequestAskLocalClarification(otherVendor.principal, { requestId: requestPublicId, question: "Isolation probe question", now: now + 210 }),
    /δεν είναι ανατεθειμένο|not.*assigned/i,
    "Unassigned vendor could request a clarification"
  );
  await vendorRequestAskLocalClarification(vendor.principal, {
    requestId: requestPublicId,
    question: "Θέλετε και τα δύο τεμάχια για παραλαβή από το κατάστημα;",
    now: now + 220
  });
  const paused = await runtime.sqlPool.query<{ status: string; expires_at: string | null } & Record<string, unknown>>(
    "SELECT status::text AS status,expires_at::text FROM counteroffer_requests WHERE public_id=$1",
    [requestPublicId]
  );
  expect(paused.rows[0]?.status === "needs_info" && paused.rows[0]?.expires_at === null, "Vendor clarification did not pause the Ask Local deadline");

  await expectFailure(
    () => askLocalClarificationMessages(otherCustomer.principal, submitted.referenceNumber),
    /δεν βρέθηκε|not found/i,
    "Another customer could read the clarification thread"
  );
  await expectFailure(
    () => customerReplyAskLocalClarification(otherCustomer.principal, { requestId: submitted.referenceNumber, reply: "Unauthorized reply", now: now + 225 }),
    /δεν βρέθηκε|not found/i,
    "Another customer could reply to the clarification"
  );
  const vendorThread = await askLocalClarificationMessages(customer.principal, submitted.referenceNumber);
  expect(vendorThread.length === 1 && vendorThread[0]?.senderType === "vendor", "Customer did not receive the vendor clarification");

  await customerReplyAskLocalClarification(customer.principal, {
    requestId: submitted.referenceNumber,
    reply: "Ναι, και τα δύο τεμάχια για παραλαβή από το κατάστημα.",
    now: now + 230
  });
  const replied = await customerAskLocalRequests(customer.principal);
  const repliedRequest = replied.find((item) => item.referenceNumber === submitted.referenceNumber);
  expect(repliedRequest?.status === "awaiting_vendor", "Customer clarification reply did not restore awaiting_vendor");
  expect(Math.abs(Number(repliedRequest?.responseDueAt) - (now + 230 + 24 * 60 * 60 * 1000)) < 1000, "Customer reply did not restart the 24-hour response deadline");
  const fullThread = await askLocalClarificationMessages(customer.principal, submitted.referenceNumber);
  expect(fullThread.length === 2 && fullThread.at(-1)?.senderType === "customer", "Clarification thread did not preserve vendor/customer order");
  await expectFailure(
    () => customerReplyAskLocalClarification(customer.principal, { requestId: submitted.referenceNumber, reply: "Duplicate reply", now: now + 231 }),
    /δεν περιμένει|does not.*wait/i,
    "Duplicate clarification reply was not rejected"
  );

  await expectFailure(
    () => vendorCreateAskLocalOffer(otherVendor.principal, {
      requestId: requestPublicId,
      priceMinor: 1399,
      fulfilmentPromise: "Unauthorized vendor offer",
      expiresAt: now + 60 * 60 * 1000,
      now: now + 240
    }),
    /δεν είναι ανατεθειμένο|not.*assigned/i,
    "Unassigned vendor could create a private offer"
  );
  const privateOffer = await vendorCreateAskLocalOffer(vendor.principal, {
    requestId: requestPublicId,
    priceMinor: 1399,
    fulfilmentPromise: "Παραλαβή από το κατάστημα σήμερα μετά τις 16:00.",
    expiresAt: now + 24 * 60 * 60 * 1000,
    now: now + 250
  });
  expect(privateOffer.id.startsWith("poffer_") && privateOffer.status === "active", "Vendor private offer did not become active");
  await expectFailure(
    () => vendorCreateAskLocalOffer(vendor.principal, {
      requestId: requestPublicId,
      priceMinor: 1299,
      fulfilmentPromise: "Duplicate active offer",
      expiresAt: now + 24 * 60 * 60 * 1000,
      now: now + 251
    }),
    /δεν δέχεται|already|active/i,
    "Second active private offer was not rejected"
  );

  const browserRequests = await customerAskLocalBrowserRequests(customer.principal);
  const browserRequest = browserRequests.find((item) => item.referenceNumber === submitted.referenceNumber);
  const browserOffer = browserRequest?.privateOffers[0];
  expect(browserRequest?.status === "offered" && browserOffer, "Customer browser view did not expose the active offer");
  expect(browserOffer.actionReference.startsWith("offer_"), "Browser offer action reference is not opaque");
  expect(!browserOffer.actionReference.includes(privateOffer.id), "Browser action reference leaked the private-offer public id");
  const privateOfferDb = await runtime.sqlPool.query<{ id: string } & Record<string, unknown>>(
    "SELECT id::text AS id FROM private_offers WHERE public_id=$1",
    [privateOffer.id]
  );
  expect(!JSON.stringify(browserOffer).includes(String(privateOfferDb.rows[0]?.id ?? "")), "Browser offer view leaked the private-offer database UUID");
  expect(!JSON.stringify(browserOffer).includes(privateOffer.id), "Browser offer view leaked the private-offer public id instead of an action token");

  const resolved = await requireCustomerPrivateOfferInternalId(customer.principal, browserOffer.actionReference);
  expect(resolved.internalId === privateOffer.id && resolved.actionToken === browserOffer.actionReference, "Customer action token did not resolve to its owned private offer");
  await expectFailure(
    () => requireCustomerPrivateOfferInternalId(otherCustomer.principal, browserOffer.actionReference),
    /δεν βρέθηκε|not found/i,
    "Another customer could resolve the private-offer action token"
  );
  await expectFailure(
    () => requireCustomerPrivateOfferInternalId(customer.principal, tamperToken(browserOffer.actionReference)),
    /δεν βρέθηκε|not found/i,
    "Tampered private-offer action token was accepted"
  );
  await expectFailure(
    () => requireCustomerPrivateOfferInternalId(otherCustomer.principal, privateOffer.id),
    /δεν βρέθηκε|not found/i,
    "Raw private-offer public id bypassed customer ownership"
  );

  await customerDecideAskLocalOffer(customer.principal, { offerId: resolved.internalId, action: "accept", now: now + 260 });
  const accepted = (await customerAskLocalRequests(customer.principal)).find((item) => item.referenceNumber === submitted.referenceNumber);
  expect(accepted?.status === "accepted" && accepted.privateOffers.some((item) => item.id === privateOffer.id && item.status === "accepted"), "Customer acceptance did not transition request and offer together");

  const declineRequest = await submitAskLocal(customer.principal, {
    need: "Θέλω δεύτερο συνθετικό αίτημα μόνο για πιστοποίηση της απόρριψης προσφοράς.",
    postcode: "23100",
    quantity: 1,
    canonicalVariantId: canonicalId,
    preferredVendorId: vendorId,
    now: now + 270
  });
  const declinePublicRow = await runtime.sqlPool.query<{ public_id: string } & Record<string, unknown>>(
    "SELECT public_id FROM counteroffer_requests WHERE reference_number=$1",
    [declineRequest.referenceNumber]
  );
  const declineOffer = await vendorCreateAskLocalOffer(vendor.principal, {
    requestId: String(declinePublicRow.rows[0]?.public_id ?? ""),
    priceMinor: 1499,
    fulfilmentPromise: "Synthetic decline-path offer",
    expiresAt: now + 24 * 60 * 60 * 1000,
    now: now + 280
  });
  await customerDecideAskLocalOffer(customer.principal, { offerId: declineOffer.id, action: "decline", now: now + 290 });
  const declined = (await customerAskLocalRequests(customer.principal)).find((item) => item.referenceNumber === declineRequest.referenceNumber);
  expect(declined?.status === "declined" && declined.privateOffers.some((item) => item.status === "declined"), "Customer decline did not close the private offer and request");

  const preview = await customerPrivateOfferCheckoutPreview(customer.principal, privateOffer.id, now + 300);
  expect(preview?.purchasable === true, "Accepted private offer was not purchasable");
  expect(preview.pickupOnly === true && preview.quantity === 2 && preview.unitPriceMinor === 1399 && preview.totalMinor === 2798, "Private-offer checkout preview changed quantity, price, or pickup semantics");
  expect(preview.vendorId === vendorId && preview.canonicalVariantId === canonicalId, "Private-offer checkout preview lost vendor/canonical attribution");
  const crossPreview = await customerPrivateOfferCheckoutPreview(otherCustomer.principal, privateOffer.id, now + 300);
  expect(crossPreview === undefined, "Another customer could preview the accepted private offer");

  const checkoutKey = `asklocal-checkout-${suffix}`;
  const visitorKey = `asklocal_visitor_${suffix}`;
  const checkout = await checkoutCustomerPrivateOffer(customer.principal, {
    offerId: privateOffer.id,
    checkoutKey,
    visitorKey,
    billingAddressId: `address_${suffix}`,
    now: now + 310
  });
  expect(checkout.created, "Accepted private offer did not create an order on first checkout");
  expect(checkout.order.status === "pending_payment", "Private-offer order did not enter the production pending-payment state");

  const converted = await runtime.sqlPool.query<{
    offer_status: string; request_status: string; pricing_source: string; source_reference: string;
    quantity: number; retail_unit_price_minor: number; reservation_count: number; order_count: number
  } & Record<string, unknown>>(`
    SELECT po.status::text AS offer_status,cr.status::text AS request_status,ol.pricing_source,ol.source_reference,
           ol.quantity,ol.retail_unit_price_minor,
           (SELECT count(*)::int FROM stock_reservations sr WHERE sr.order_line_id=ol.id) AS reservation_count,
           (SELECT count(DISTINCT ol2.order_id)::int FROM order_lines ol2 WHERE ol2.source_reference=po.public_id) AS order_count
    FROM private_offers po
    JOIN counteroffer_requests cr ON cr.id=po.counteroffer_request_id
    JOIN order_lines ol ON ol.source_reference=po.public_id
    JOIN customer_orders o ON o.id=ol.order_id
    WHERE po.public_id=$1 AND o.public_id=$2
  `, [privateOffer.id, checkout.order.id]);
  const convertedState = converted.rows[0];
  expect(convertedState?.offer_status === "converted" && convertedState?.request_status === "converted", "Checkout did not atomically convert Ask Local offer/request");
  expect(convertedState?.pricing_source === "private_offer" && convertedState?.source_reference === privateOffer.id, "Order line lost trusted private-offer source attribution");
  expect(Number(convertedState?.quantity) === 2 && Number(convertedState?.retail_unit_price_minor) === 1399, "Order line did not preserve accepted private-offer quantity/price");
  expect(Number(convertedState?.reservation_count) === 1 && Number(convertedState?.order_count) === 1, "Private-offer checkout did not create exactly one reservation/order");

  const replay = await checkoutCustomerPrivateOffer(customer.principal, {
    offerId: privateOffer.id,
    checkoutKey,
    visitorKey,
    billingAddressId: `address_${suffix}`,
    now: now + 320
  });
  expect(replay.created === false && replay.order.id === checkout.order.id, "Private-offer checkout replay created a duplicate order");
  const replayCounts = await runtime.sqlPool.query<{ reservation_count: number; order_count: number } & Record<string, unknown>>(`
    SELECT
      (SELECT count(*)::int FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.source_reference=$1) AS reservation_count,
      (SELECT count(DISTINCT order_id)::int FROM order_lines WHERE source_reference=$1) AS order_count
  `, [privateOffer.id]);
  expect(Number(replayCounts.rows[0]?.reservation_count) === 1 && Number(replayCounts.rows[0]?.order_count) === 1, "Checkout replay duplicated reservation or order state");

  await expectFailure(
    () => checkoutCustomerPrivateOffer(otherCustomer.principal, {
      offerId: privateOffer.id,
      checkoutKey: `asklocal-cross-${suffix}`,
      visitorKey: `asklocal_cross_${suffix}`,
      billingAddressId: `address_other_${suffix}`,
      now: now + 330
    }),
    /δεν είναι συνδεδεμένη|not.*linked|not found/i,
    "Another customer could checkout the accepted private offer"
  );

  const analytics = await runtime.sqlPool.query<{ event_name: string; count: number } & Record<string, unknown>>(`
    SELECT event_name,count(*)::int AS count
    FROM analytics_events
    WHERE event_name IN ('counteroffer.requested','counteroffer.converted')
    GROUP BY event_name
  `);
  const analyticsCounts = new Map(analytics.rows.map((row) => [String(row.event_name), Number(row.count)]));
  expect((analyticsCounts.get("counteroffer.requested") ?? 0) >= 2, "Ask Local request analytics were not recorded");
  expect((analyticsCounts.get("counteroffer.converted") ?? 0) === 1, "Ask Local conversion analytics were not recorded exactly once");

  const notifications = await runtime.sqlPool.query<{ event_type: string; count: number } & Record<string, unknown>>(`
    SELECT event_type,count(*)::int AS count
    FROM notifications
    WHERE event_type IN (
      'counteroffer.requested','counteroffer.needs_info','counteroffer.customer_replied',
      'ask_local.offer_received','ask_local.offer_accepted','ask_local.offer_declined'
    )
    GROUP BY event_type
  `);
  const notificationCounts = new Map(notifications.rows.map((row) => [String(row.event_type), Number(row.count)]));
  for (const required of [
    'counteroffer.requested','counteroffer.needs_info','counteroffer.customer_replied',
    'ask_local.offer_received','ask_local.offer_accepted','ask_local.offer_declined'
  ]) {
    expect((notificationCounts.get(required) ?? 0) >= 1, `Ask Local notification coverage is missing ${required}`);
  }

  console.log(JSON.stringify({
    ok: true,
    requestReference: submitted.referenceNumber,
    privateOfferActionToken: "opaque-and-owner-bound",
    orderId: checkout.order.id,
    customerOwnershipIsolation: true,
    vendorTenantIsolation: true,
    clarificationDeadlinePauseResume: true,
    privateOfferTransitionGuards: true,
    customerOfferTokenIsolation: true,
    acceptedOfferCheckout: true,
    checkoutReplayIdempotency: true,
    inventoryReservationExactlyOnce: true,
    conversionAnalyticsExactlyOnce: true,
    notificationCoverage: true
  }, null, 2));
} finally {
  await runtime.close();
}
