import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { hashPassword, type Role } from "../packages/core/src/index.ts";
import {
  createPostgresRuntimeFromEnv,
  PostgresAdminAuthService,
  PostgresCustomerAuthService,
  PostgresVendorAuthService
} from "../packages/postgres-runtime/src/index.ts";
import { createCustomerReview, customerReviewWorkspace } from "../apps/web/src/lib/customer-reviews-runtime.ts";
import { publicProductReviews } from "../apps/web/src/lib/public-reviews-runtime.ts";
import { reportVendorReview, respondToVendorReview, vendorReviewsWorkspace } from "../apps/web/src/lib/vendor-reviews-runtime.ts";
import { adminModerateReview, adminReviewReportAction, adminReviewsWorkspace } from "../apps/web/src/lib/admin-governance-runtime.ts";

if (process.env.BLS_ACCEPTANCE_SYNTHETIC_DB !== "true") {
  throw new Error("Refusing to run verified reviews acceptance outside an explicitly synthetic disposable database");
}

const runtime = createPostgresRuntimeFromEnv({ applicationName: "verified-reviews-lifecycle-acceptance" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const secret = process.env.BLS_AUTH_SECRET?.trim() || "verified-reviews-acceptance-secret-0123456789";

const customerId = `usr_reviews_${suffix}`;
const otherCustomerId = `usr_reviews_other_${suffix}`;
const vendorId = `vendor_reviews_${suffix}`;
const otherVendorId = `vendor_reviews_other_${suffix}`;
const vendorOwnerId = `usr_vendor_reviews_owner_${suffix}`;
const vendorAdviserId = `usr_vendor_reviews_adviser_${suffix}`;
const vendorCatalogId = `usr_vendor_reviews_catalog_${suffix}`;
const otherVendorOwnerId = `usr_vendor_reviews_other_${suffix}`;
const adminId = `usr_admin_reviews_${suffix}`;
const canonicalId = `canonical_reviews_${suffix}`;
const locationId = `location_reviews_${suffix}`;
const offerId = `offer_reviews_${suffix}`;
const orderId = `order_reviews_${suffix}`;
const orderLineId = `line_reviews_${suffix}`;
const fulfilmentId = `fulfilment_reviews_${suffix}`;
const appointmentId = `appointment_reviews_${suffix}`;
const conversationId = `conversation_reviews_${suffix}`;

const customerEmail = `reviews-${suffix}@example.test`;
const otherCustomerEmail = `reviews-other-${suffix}@example.test`;
const vendorOwnerEmail = `reviews-owner-${suffix}@example.test`;
const vendorAdviserEmail = `reviews-adviser-${suffix}@example.test`;
const vendorCatalogEmail = `reviews-catalog-${suffix}@example.test`;
const otherVendorEmail = `reviews-other-vendor-${suffix}@example.test`;
const adminEmail = `reviews-admin-${suffix}@example.test`;

function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectFailure(run: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> {
  let matched = false;
  try { await run(); }
  catch (error) { matched = error instanceof Error && pattern.test(error.message); }
  if (!matched) throw new Error(message);
}

function source(path: string): string {
  return readFileSync(`${process.cwd()}/${path}`, "utf8");
}

async function saveAccount(input: {
  id: string;
  email: string;
  password: string;
  roles: readonly Role[];
  vendorId?: string;
  createdAt: number;
}) {
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true },
    account: {
      id: input.id,
      email: input.email,
      passwordHash: hashPassword(input.password),
      status: "active",
      roles: [...input.roles],
      vendorId: input.vendorId,
      emailVerified: true,
      createdAt: input.createdAt
    }
  });
}

try {
  const readiness = await runtime.readiness();
  expect(readiness.ok, `Database is not ready: ${readiness.message}`);
  expect(readiness.appliedSchemaVersion === 119, `Reviews acceptance expected schema 119, got ${readiness.appliedSchemaVersion}`);

  const customerApi = source("apps/web/src/app/api/account/reviews/route.ts");
  const vendorReadApi = source("apps/web/src/app/api/vendor/reviews/route.ts");
  const vendorResponseApi = source("apps/web/src/app/api/vendor/reviews/response/route.ts");
  const vendorReportApi = source("apps/web/src/app/api/vendor/reviews/report/route.ts");
  const accountPage = source("apps/web/src/app/account/reviews/page.tsx");
  const vendorPage = source("apps/web/src/app/vendor/reviews/page.tsx");
  const siteNavigation = source("apps/web/src/lib/site-navigation.ts");
  const publicRuntimeSource = source("apps/web/src/lib/public-reviews-runtime.ts");
  const productPage = source("apps/web/src/app/product/[id]/page.tsx");
  const vendorHeader = source("apps/web/src/components/VendorWorkspaceHeader.tsx");
  const workspaceNavigation = source("apps/web/src/lib/workspace-navigation.ts");

  expect(customerApi.includes("requireAccountSession(request, true)"), "Customer review creation route is not CSRF protected");
  expect(vendorResponseApi.includes("requireVendorSession(request, true)"), "Vendor review response route is not CSRF protected");
  expect(vendorReportApi.includes("requireVendorSession(request, true)"), "Vendor review report route is not CSRF protected");
  expect([customerApi, vendorReadApi, vendorResponseApi, vendorReportApi].every((value) => value.includes('"Cache-Control": "no-store"')), "Review APIs must disable response caching");
  expect(accountPage.includes("robots: { index: false, follow: false }"), "Customer reviews page is not explicitly noindex");
  expect(vendorPage.includes("robots: { index: false, follow: false }"), "Vendor reviews page is not explicitly noindex");
  expect(siteNavigation.includes('"/account/reviews"') && siteNavigation.includes('"/vendor/reviews"'), "Review workspaces are missing from private route governance");
  expect(publicRuntimeSource.includes("r.status='published'") && publicRuntimeSource.includes("r.published_at IS NOT NULL"), "Public review projection is not published-only");
  expect(!publicRuntimeSource.includes("customer_user_id") && !publicRuntimeSource.includes("u.email") && !publicRuntimeSource.includes("r.user_id"), "Public review projection exposes customer identity fields");
  expect(productPage.includes('"@type": "AggregateRating"') && productPage.includes("reviews.count > 0"), "Product structured data does not gate AggregateRating on published reviews");
  expect(vendorHeader.includes('can(role as Role, link.permission!)'), "Vendor navigation does not enforce permission-bound links");
  expect(workspaceNavigation.includes('href: "/vendor/reviews"') && workspaceNavigation.includes('permission: "reviews.read"'), "Vendor reviews navigation is not permission scoped");

  await saveAccount({ id: customerId, email: customerEmail, password: "Customer!12345", roles: ["customer"], createdAt: now });
  await saveAccount({ id: otherCustomerId, email: otherCustomerEmail, password: "Customer!12345", roles: ["customer"], createdAt: now + 1 });

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),
    category AS (
      INSERT INTO categories(market_id,code,slug,commerce_mode,active,taxonomy_role,assignable,discoverable)
      SELECT id,$1,$1,'standard',true,'product_class',true,true FROM market
      ON CONFLICT (market_id,slug) DO UPDATE SET active=true,taxonomy_role='product_class',assignable=true,discoverable=true
      RETURNING id
    )
    INSERT INTO canonical_variants(public_id,market_id,category_id,slug,model,platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled)
    SELECT $2,market.id,category.id,$2,$3,1194,'EUR',2400,true,false,false FROM market,category
  `, [`reviews-${suffix}`, canonicalId, `Verified Reviews Product ${suffix}`]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses(public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [vendorId, `Reviews Acceptance Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta')
    INSERT INTO vendor_businesses(public_id,market_id,legal_name,trading_name,status,verification_completed_at,contract_started_at)
    SELECT $1,market.id,$2,$2,'active',$3,$3 FROM market
  `, [otherVendorId, `Reviews Isolation Vendor ${suffix}`, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1)
    INSERT INTO vendor_locations(public_id,vendor_id,market_id,name,address_line1,locality,postcode,active,verified_at)
    SELECT $2,vendor.id,market.id,'Reviews Acceptance','1 Review Street','Sparta','23100',true,$3 FROM market,vendor
  `, [vendorId, locationId, new Date(now)]);
  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$1),
         location AS (SELECT id FROM vendor_locations WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO vendor_offers(public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,status,supplier_unit_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,approved_at)
    SELECT $4,market.id,vendor.id,location.id,canonical.id,$5,'approved',700,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],$6 FROM market,vendor,location,canonical
  `, [vendorId, locationId, canonicalId, offerId, `REV-${suffix}`, new Date(now)]);

  await saveAccount({ id: vendorOwnerId, email: vendorOwnerEmail, password: "Vendor!12345", roles: ["vendor_owner"], vendorId, createdAt: now + 10 });
  await saveAccount({ id: vendorAdviserId, email: vendorAdviserEmail, password: "Vendor!12345", roles: ["vendor_adviser"], vendorId, createdAt: now + 11 });
  await saveAccount({ id: vendorCatalogId, email: vendorCatalogEmail, password: "Vendor!12345", roles: ["vendor_catalog"], vendorId, createdAt: now + 12 });
  await saveAccount({ id: otherVendorOwnerId, email: otherVendorEmail, password: "Vendor!12345", roles: ["vendor_owner"], vendorId: otherVendorId, createdAt: now + 13 });
  await saveAccount({ id: adminId, email: adminEmail, password: "AdminStrong!123", roles: ["super_admin"], createdAt: now + 14 });

  const customerUuid = String((await runtime.sqlPool.query<Record<string, unknown>>("SELECT id::text AS id FROM users WHERE public_id=$1", [customerId])).rows[0]?.id ?? "");
  const otherCustomerUuid = String((await runtime.sqlPool.query<Record<string, unknown>>("SELECT id::text AS id FROM users WHERE public_id=$1", [otherCustomerId])).rows[0]?.id ?? "");
  const vendorUserUuid = String((await runtime.sqlPool.query<Record<string, unknown>>("SELECT id::text AS id FROM users WHERE public_id=$1", [vendorOwnerId])).rows[0]?.id ?? "");
  expect(customerUuid && otherCustomerUuid && vendorUserUuid, "Synthetic account UUID resolution failed");

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),customer AS (SELECT id FROM users WHERE public_id=$1)
    INSERT INTO customer_orders(order_number,public_id,market_id,user_id,checkout_key,status,currency,subtotal_minor,shipping_minor,discount_minor,tax_minor,total_minor,billing_address_snapshot,shipping_address_snapshot,fulfilment_preference,partial_fulfilment_allowed,terms_version,confirmed_at,created_at,updated_at,checkout_fingerprint)
    SELECT $2,$3,market.id,customer.id,$4,'fulfilled','EUR',1000,0,0,194,1194,'{}'::jsonb,'{}'::jsonb,'pickup',false,'reviews-ci',$5,$5,$5,$6
    FROM market,customer
  `, [customerId, `REV-${suffix}`, orderId, `reviews-checkout-${suffix}`, new Date(now + 100), `reviews-fingerprint-${suffix}`]);
  await runtime.sqlPool.query(`
    WITH order_row AS (SELECT id FROM customer_orders WHERE public_id=$1),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$2),
         offer AS (SELECT id,vendor_id,location_id FROM vendor_offers WHERE public_id=$3)
    INSERT INTO order_lines(public_id,order_id,canonical_variant_id,assigned_offer_id,vendor_id,location_id,quantity,product_snapshot,retail_unit_price_minor,tax_rate_bps,tax_minor,supplier_unit_price_minor,supplier_tax_rate_bps,status,fulfilled_quantity,fulfilled_at,created_at)
    SELECT $4,order_row.id,canonical.id,offer.id,offer.vendor_id,offer.location_id,1,$5::jsonb,1194,2400,194,700,2400,'fulfilled',1,$6,$6
    FROM order_row,canonical,offer
  `, [orderId, canonicalId, offerId, orderLineId, JSON.stringify({ title: `Verified Reviews Product ${suffix}` }), new Date(now + 110)]);
  await runtime.sqlPool.query(`
    WITH order_row AS (SELECT id FROM customer_orders WHERE public_id=$1),vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$2),location AS (SELECT id FROM vendor_locations WHERE public_id=$3)
    INSERT INTO fulfilment_orders(fulfilment_number,public_id,order_id,vendor_id,location_id,mode,status,accepted_at,delivered_at,created_at,updated_at,merchandise_subtotal_minor)
    SELECT $4,$5,order_row.id,vendor.id,location.id,'pickup','delivered',$6,$6,$6,$6,1000 FROM order_row,vendor,location
  `, [orderId, vendorId, locationId, `FUL-${suffix}`, fulfilmentId, new Date(now + 120)]);
  await runtime.sqlPool.query(`
    INSERT INTO fulfilment_order_lines(fulfilment_order_id,order_line_id)
    SELECT fo.id,ol.id FROM fulfilment_orders fo,order_lines ol WHERE fo.public_id=$1 AND ol.public_id=$2
  `, [fulfilmentId, orderLineId]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),customer AS (SELECT id FROM users WHERE public_id=$1),
         vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO appointments(public_id,market_id,customer_user_id,vendor_id,canonical_variant_id,channel,status,starts_at,ends_at,created_at,updated_at)
    SELECT $4,market.id,customer.id,vendor.id,canonical.id,'in_person','completed',$5,$6,$5,$6 FROM market,customer,vendor,canonical
  `, [customerId, vendorId, canonicalId, appointmentId, new Date(now + 130), new Date(now + 130 + 30 * 60_000)]);

  await runtime.sqlPool.query(`
    WITH market AS (SELECT id FROM markets WHERE code='sparta'),customer AS (SELECT id FROM users WHERE public_id=$1),
         vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3)
    INSERT INTO conversations(public_id,market_id,customer_user_id,canonical_variant_id,vendor_id,status,created_at,updated_at)
    SELECT $4,market.id,customer.id,canonical.id,vendor.id,'active',$5,$5 FROM market,customer,vendor,canonical
  `, [customerId, vendorId, canonicalId, conversationId, new Date(now + 140)]);
  await runtime.sqlPool.query(`
    WITH conversation AS (SELECT id FROM conversations WHERE public_id=$1),customer AS (SELECT id FROM users WHERE public_id=$2),vendor_user AS (SELECT id FROM users WHERE public_id=$3)
    INSERT INTO messages(public_id,conversation_id,sender_user_id,sender_type,body,created_at)
    SELECT $4,conversation.id,customer.id,'customer','Synthetic customer advice question',$6::timestamptz FROM conversation,customer
    UNION ALL
    SELECT $5,conversation.id,vendor_user.id,'vendor','Synthetic vendor advice response',$7::timestamptz FROM conversation,vendor_user
  `, [conversationId, customerId, vendorOwnerId, `msg_reviews_customer_${suffix}`, `msg_reviews_vendor_${suffix}`, new Date(now + 141), new Date(now + 142)]);

  const customerAuth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret });
  const vendorAuth = new PostgresVendorAuthService({ identity: runtime.persistence.identity, secret });
  const adminAuth = new PostgresAdminAuthService({ identity: runtime.persistence.identity, secret });
  const customer = await customerAuth.authenticate({ email: customerEmail, password: "Customer!12345", now: now + 200 });
  const otherCustomer = await customerAuth.authenticate({ email: otherCustomerEmail, password: "Customer!12345", now: now + 201 });
  const owner = await vendorAuth.authenticate({ email: vendorOwnerEmail, password: "Vendor!12345", now: now + 202 });
  const adviser = await vendorAuth.authenticate({ email: vendorAdviserEmail, password: "Vendor!12345", now: now + 203 });
  const catalog = await vendorAuth.authenticate({ email: vendorCatalogEmail, password: "Vendor!12345", now: now + 204 });
  const otherVendor = await vendorAuth.authenticate({ email: otherVendorEmail, password: "Vendor!12345", now: now + 205 });
  const admin = await adminAuth.authenticate({ email: adminEmail, password: "AdminStrong!123", now: now + 206 });

  const initial = await customerReviewWorkspace(customer.principal);
  expect(initial.candidates.some((item) => item.sourceKind === "order_line" && item.sourceId === orderLineId), "Delivered order line was not review eligible");
  expect(initial.candidates.some((item) => item.sourceKind === "appointment" && item.sourceId === appointmentId), "Completed appointment was not review eligible");
  expect(initial.candidates.some((item) => item.sourceKind === "conversation" && item.sourceId === conversationId), "Two-sided advice conversation was not review eligible");
  expect((await customerReviewWorkspace(otherCustomer.principal)).candidates.every((item) => ![orderLineId, appointmentId, conversationId].includes(item.sourceId)), "Verified interaction leaked to another customer");

  const orderReview = await createCustomerReview(customer.principal, { sourceKind: "order_line", sourceId: orderLineId, rating: 5, body: "Εξαιρετική επαληθευμένη αγορά.", now: now + 300 });
  const appointmentReview = await createCustomerReview(customer.principal, { sourceKind: "appointment", sourceId: appointmentId, rating: 4, body: "Χρήσιμη συμβουλή στο ραντεβού.", now: now + 301 });
  const conversationReview = await createCustomerReview(customer.principal, { sourceKind: "conversation", sourceId: conversationId, rating: 3, body: "Πραγματική αμφίδρομη συμβουλή.", now: now + 302 });
  expect([orderReview, appointmentReview, conversationReview].every((review) => review.status === "pending"), "New verified reviews must start pending moderation");

  await expectFailure(
    () => createCustomerReview(customer.principal, { sourceKind: "order_line", sourceId: orderLineId, rating: 5, now: now + 310 }),
    /ήδη αξιολογήσει|already/i,
    "Duplicate review of the same verified source was not rejected"
  );
  await expectFailure(
    () => createCustomerReview(otherCustomer.principal, { sourceKind: "order_line", sourceId: orderLineId, rating: 5, now: now + 311 }),
    /δεν είναι επιλέξιμη|eligible/i,
    "Another customer could review an interaction they do not own"
  );
  await expectFailure(
    () => createCustomerReview(customer.principal, { sourceKind: "appointment", sourceId: appointmentId, rating: 6, now: now + 312 }),
    /1 έως 5|1.*5/i,
    "Out-of-range review rating was accepted"
  );

  await expectFailure(async () => {
    await runtime.sqlPool.query(`
      WITH market AS (SELECT id FROM markets WHERE code='sparta'),other_customer AS (SELECT id FROM users WHERE public_id=$1),
           vendor AS (SELECT id FROM vendor_businesses WHERE public_id=$2),canonical AS (SELECT id FROM canonical_variants WHERE public_id=$3),
           order_row AS (SELECT id FROM customer_orders WHERE public_id=$4),line AS (SELECT id FROM order_lines WHERE public_id=$5)
      INSERT INTO reviews(public_id,market_id,user_id,vendor_id,canonical_variant_id,order_id,order_line_id,interaction_type,rating,status)
      SELECT $6,market.id,other_customer.id,vendor.id,canonical.id,order_row.id,line.id,'verified_order',5,'pending'
      FROM market,other_customer,vendor,canonical,order_row,line
    `, [otherCustomerId, vendorId, canonicalId, orderId, orderLineId, `forged_review_${suffix}`]);
  }, /not an owned fulfilled order line|verified_order review source/i, "Database provenance trigger accepted a forged cross-customer review");

  const publicBeforeModeration = await publicProductReviews(canonicalId);
  expect(publicBeforeModeration.count === 0, "Pending reviews leaked into the public projection");
  const vendorPending = await vendorReviewsWorkspace(owner.principal);
  expect(vendorPending.length === 3 && vendorPending.every((review) => review.status === "pending"), "Vendor did not see its own pending review queue");
  expect((await vendorReviewsWorkspace(otherVendor.principal)).length === 0, "Cross-vendor review data leaked into another tenant");
  await expectFailure(() => respondToVendorReview(owner.principal, { reviewId: orderReview.id, body: "Too early", now: now + 320 }), /Μόνο δημοσιευμένη|published/i, "Vendor could respond before moderation publication");
  await expectFailure(() => reportVendorReview(owner.principal, { reviewId: orderReview.id, reason: "other", details: "Pending review should not be actionable", now: now + 321 }), /Μόνο δημοσιευμένη|published/i, "Vendor could report before moderation publication");

  await adminModerateReview(admin.principal, { reviewId: orderReview.id, status: "published", reason: "Synthetic verified provenance accepted", now: now + 400 });
  const publicPublished = await publicProductReviews(canonicalId);
  expect(publicPublished.count === 1 && publicPublished.average === 5, "Published review did not enter public aggregate projection");
  expect(publicPublished.reviews[0]?.id === orderReview.id, "Public projection returned the wrong review");
  expect(!("customerId" in (publicPublished.reviews[0] ?? {})) && !("userId" in (publicPublished.reviews[0] ?? {})), "Public review object exposed customer identity");

  await respondToVendorReview(owner.principal, { reviewId: orderReview.id, body: "Ευχαριστούμε για την αξιολόγηση.", now: now + 410 });
  await respondToVendorReview(adviser.principal, { reviewId: orderReview.id, body: "Χαιρόμαστε που βοηθήσαμε.", now: now + 411 });
  const publicWithResponse = await publicProductReviews(canonicalId);
  expect(publicWithResponse.reviews[0]?.vendorResponse === "Χαιρόμαστε που βοηθήσαμε.", "Published vendor response was not reflected publicly");
  const customerAfterResponse = await customerReviewWorkspace(customer.principal);
  expect(customerAfterResponse.reviews.find((review) => review.id === orderReview.id)?.vendorResponse === "Χαιρόμαστε που βοηθήσαμε.", "Customer could not see the vendor response on their own review");

  await expectFailure(() => reportVendorReview(adviser.principal, { reviewId: orderReview.id, reason: "other", details: "Adviser should not have report permission", now: now + 420 }), /VENDOR_REVIEWS_FORBIDDEN/, "Vendor adviser unexpectedly had reviews.report permission");
  await expectFailure(() => vendorReviewsWorkspace(catalog.principal), /VENDOR_REVIEWS_FORBIDDEN/, "Vendor catalog role unexpectedly had reviews.read permission");
  await expectFailure(() => respondToVendorReview(otherVendor.principal, { reviewId: orderReview.id, body: "Cross tenant", now: now + 421 }), /Μόνο δημοσιευμένη|published|access/i, "Another vendor could respond to a review outside its tenant");

  await reportVendorReview(owner.principal, { reviewId: orderReview.id, reason: "personal_data", details: "Synthetic moderation report with enough details", now: now + 430 });
  await expectFailure(() => reportVendorReview(owner.principal, { reviewId: orderReview.id, reason: "other", details: "Second active report must not be accepted", now: now + 431 }), /ήδη ενεργή αναφορά|active report/i, "Duplicate active vendor review report was accepted");
  let adminWorkspace = await adminReviewsWorkspace(admin.principal);
  const report = adminWorkspace.reports.find((item) => item.reviewId === orderReview.id);
  expect(report?.status === "open", "Vendor review report did not enter the admin queue");
  await adminReviewReportAction(admin.principal, { reportId: report!.id, status: "under_review" });
  await adminReviewReportAction(admin.principal, { reportId: report!.id, status: "resolved", resolution: "Synthetic report reviewed" });
  adminWorkspace = await adminReviewsWorkspace(admin.principal);
  expect(adminWorkspace.reports.find((item) => item.id === report!.id)?.status === "resolved", "Admin report resolution did not persist");

  await adminModerateReview(admin.principal, { reviewId: orderReview.id, status: "hidden", reason: "Synthetic hide after publication", now: now + 500 });
  expect((await publicProductReviews(canonicalId)).count === 0, "Hidden review remained in public projection despite published_at history");

  await adminModerateReview(admin.principal, { reviewId: appointmentReview.id, status: "published", reason: "Verified completed appointment", now: now + 510 });
  const advicePublished = await publicProductReviews(canonicalId);
  expect(advicePublished.count === 1 && advicePublished.reviews[0]?.interactionType === "verified_advice", "Published verified advice review did not enter public projection");
  await adminModerateReview(admin.principal, { reviewId: appointmentReview.id, status: "rejected", reason: "Synthetic rejection after publication check", now: now + 511 });
  expect((await publicProductReviews(canonicalId)).count === 0, "Rejected review remained publicly visible");

  const eventRows = await runtime.sqlPool.query<Record<string, unknown>>(`
    SELECT re.public_id,re.action,re.actor_public_id,r.public_id AS review_public_id
    FROM review_events re JOIN reviews r ON r.id=re.review_id
    WHERE r.public_id IN ($1,$2,$3)
    ORDER BY re.created_at,re.public_id
  `, [orderReview.id, appointmentReview.id, conversationReview.id]);
  const orderActions = eventRows.rows.filter((row) => row.review_public_id === orderReview.id).map((row) => String(row.action));
  for (const action of ["review.customer_created","moderate_published","review.vendor_response_created","review.vendor_response_updated","review.vendor_reported","moderate_hidden"]) {
    expect(orderActions.includes(action), `Missing immutable review event ${action}`);
  }
  expect(eventRows.rows.every((row) => typeof row.actor_public_id === "string" && String(row.actor_public_id).length > 0), "Review event actor_public_id coverage is incomplete");
  const eventUniqueness = await runtime.sqlPool.query<Record<string, unknown>>(`SELECT count(*)::int AS total,count(DISTINCT public_id)::int AS distinct_ids FROM review_events`);
  expect(Number(eventUniqueness.rows[0]?.total) === Number(eventUniqueness.rows[0]?.distinct_ids), "Duplicate review event public IDs exist");

  const eventId = String(eventRows.rows[0]?.public_id ?? "");
  expect(eventId, "No review event exists for append-only enforcement test");
  await expectFailure(async () => { await runtime.sqlPool.query("UPDATE review_events SET reason='tampered' WHERE public_id=$1", [eventId]); }, /append-only/i, "review_events UPDATE was not blocked");
  await expectFailure(async () => { await runtime.sqlPool.query("DELETE FROM review_events WHERE public_id=$1", [eventId]); }, /append-only/i, "review_events DELETE was not blocked");

  const finalCustomer = await customerReviewWorkspace(customer.principal);
  expect(finalCustomer.reviews.length === 3, "Customer review history lost moderated reviews");
  expect(finalCustomer.candidates.every((candidate) => ![orderLineId, appointmentId, conversationId].includes(candidate.sourceId)), "Reviewed sources remained eligible for duplicate review creation");

  console.log(JSON.stringify({
    ok: true,
    verifiedSources: ["order_line","appointment","conversation"],
    customerIsolation: true,
    vendorIsolation: true,
    vendorRbac: true,
    adminModeration: true,
    publishedOnlyPublicProjection: true,
    customerIdentityPrivate: true,
    appendOnlyReviewEvents: true,
    schemaVersion: readiness.appliedSchemaVersion
  }, null, 2));
} finally {
  await runtime.close();
}
