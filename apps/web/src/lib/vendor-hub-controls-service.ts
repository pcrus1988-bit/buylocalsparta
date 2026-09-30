import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { vendorOperatingContextForPrincipal } from "./vendor-session";

export type VendorHubLocalDelivery = Readonly<{
  active: boolean;
  postcodePrefixes: readonly string[];
  updatedAt?: number;
}>;

export type VendorHubSeoSource = Readonly<{
  locale: "el" | "en";
  story: string;
  expertise: string;
  shortDescription: string;
  seoTitle: string;
  seoDescription: string;
}>;

export type VendorHubAadeDocument = Readonly<{
  id: string;
  type: string;
  documentNumber?: string;
  status: string;
  transmissionStatus: string;
  aadeMark?: string;
  qrUrl?: string;
  lastError?: string;
  grossMinor: number;
  createdAt: number;
}>;

export type VendorHubAadeRequest = Readonly<{
  id: string;
  documentId: string;
  action: string;
  status: string;
  note?: string;
  resolutionNote?: string;
  createdAt: number;
}>;

export type VendorHubPromotionOffer = Readonly<{
  offerId: string;
  canonicalVariantId: string;
  title: string;
  priceMinor: number;
}>;

export type VendorHubPromotionRequest = Readonly<{
  id: string;
  offerId: string;
  title: string;
  name: string;
  currentPriceMinor: number;
  promotionalPriceMinor: number;
  startsAt: number;
  endsAt: number;
  status: string;
  reason: string;
  reviewNote?: string;
  createdAt: number;
}>;

export type VendorHubPlan = Readonly<{
  code: string;
  name: string;
  monthlyPriceMinor?: number;
  annualPriceMinor?: number;
  termPriceMinor?: number;
  termMonths?: number;
  salesFeeBps: number;
}>;

export type VendorHubSubscription = Readonly<{
  id: string;
  planCode: string;
  planName: string;
  status: string;
  startsAt: number;
  endsAt?: number;
}>;

export type VendorHubSubscriptionRequest = Readonly<{
  id: string;
  planCode: string;
  planName: string;
  status: string;
  note?: string;
  resolutionNote?: string;
  createdAt: number;
}>;

export type VendorHubControlsWorkspace = Readonly<{
  csrfToken: string;
  vendorId: string;
  marketId: string;
  hubId?: string;
  locationId?: string;
  operatingModel: "MANAGED" | "SELF_GOVERNED";
  tradingName: string;
  localDelivery: VendorHubLocalDelivery;
  seo: Readonly<Record<"el" | "en", VendorHubSeoSource>>;
  aade: Readonly<{
    documents: readonly VendorHubAadeDocument[];
    requests: readonly VendorHubAadeRequest[];
  }>;
  promotions: Readonly<{
    offers: readonly VendorHubPromotionOffer[];
    requests: readonly VendorHubPromotionRequest[];
  }>;
  subscription: Readonly<{
    current?: VendorHubSubscription;
    plans: readonly VendorHubPlan[];
    requests: readonly VendorHubSubscriptionRequest[];
  }>;
}>;

const runtime = () => getProductionPostgresRuntime();

function vendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Invalid ${label}`);
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function integer(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function optionalInteger(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid timestamp");
  return parsed;
}

function normalizedPrefixes(value: unknown): string[] {
  const source = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  const prefixes = [...new Set(source.map((item) => String(item).trim()).filter(Boolean))];
  if (prefixes.length > 30) throw new Error("Use at most 30 postcode prefixes");
  for (const prefix of prefixes) if (!/^\d{1,5}$/.test(prefix)) throw new Error(`Invalid postcode prefix: ${prefix}`);
  return prefixes;
}

function boundedText(value: unknown, max: number, label: string, required = false): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (required && !text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} is too long`);
  return text;
}

function scope(principal: SessionPrincipal, marketId: string) {
  return { actorUserId: principal.userId, vendorId: vendorId(principal), marketId };
}

async function refs(tx: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[]; rowCount: number }> }, principal: SessionPrincipal) {
  const id = vendorId(principal);
  const result = await tx.query<SqlRow>(`
    SELECT vb.id::text AS vendor_uuid,vb.public_id,vb.trading_name,vb.market_id::text AS market_uuid,
           m.code AS market_code,
           vl.id::text AS location_uuid,COALESCE(vl.public_id,vl.id::text) AS location_public_id
    FROM vendor_businesses vb
    JOIN markets m ON m.id=vb.market_id
    LEFT JOIN LATERAL (
      SELECT l.id,l.public_id
      FROM vendor_locations l
      WHERE l.vendor_id=vb.id AND l.active=true
      ORDER BY l.is_primary DESC,l.created_at,l.id
      LIMIT 1
    ) vl ON true
    WHERE vb.public_id=$1 OR vb.id::text=$1
    LIMIT 1
  `, [id]);
  if (result.rowCount !== 1) throw new Error("Vendor HUB profile could not be resolved");
  const row = result.rows[0];
  return {
    vendorUuid: requiredText(row.vendor_uuid, "vendor_uuid"),
    vendorPublicId: requiredText(row.public_id, "vendor_public_id"),
    tradingName: requiredText(row.trading_name, "trading_name"),
    marketUuid: requiredText(row.market_uuid, "market_uuid"),
    marketCode: requiredText(row.market_code, "market_code"),
    locationUuid: optionalText(row.location_uuid),
    locationPublicId: optionalText(row.location_public_id)
  };
}

function seoProjection(locale: "el" | "en", row?: SqlRow): VendorHubSeoSource {
  return {
    locale,
    story: optionalText(row?.story) ?? "",
    expertise: optionalText(row?.expertise) ?? "",
    shortDescription: optionalText(row?.short_description) ?? "",
    seoTitle: optionalText(row?.seo_title) ?? "",
    seoDescription: optionalText(row?.seo_description) ?? ""
  };
}

export async function vendorHubControlsWorkspace(principal: SessionPrincipal): Promise<VendorHubControlsWorkspace> {
  const context = await vendorOperatingContextForPrincipal(principal);
  const uow = new PostgresUnitOfWork(runtime().sqlPool, { statementTimeoutMs: 12_000, lockTimeoutMs: 3_000 });

  return uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    const zonePublicId = ref.locationPublicId ? `vendor_self_local_delivery_${ref.locationPublicId}` : undefined;

    const [zone, seo, docs, aadeRequests, offers, promotionRequests, subscriptions, plans, subscriptionRequests] = await Promise.all([
      zonePublicId ? tx.query<SqlRow>(`
        SELECT public_id,active,postcode_prefixes,updated_at
        FROM fulfilment_service_zones
        WHERE public_id=$1 AND vendor_id=$2::uuid AND mode='local_delivery'
        LIMIT 1
      `, [zonePublicId, ref.vendorUuid]) : Promise.resolve({ rows: [], rowCount: 0 }),
      tx.query<SqlRow>(`
        SELECT locale,story,expertise,short_description,seo_title,seo_description
        FROM vendor_profile_translations
        WHERE vendor_id=$1::uuid AND locale IN ('el','en')
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT public_id,type,document_number,status,transmission_status,aade_mark,aade_qr_url,last_error,gross_minor,created_at
        FROM tax_documents
        WHERE vendor_id=$1::uuid
        ORDER BY created_at DESC
        LIMIT 80
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT r.public_id,td.public_id AS document_public_id,r.action,r.status,r.note,r.resolution_note,r.created_at
        FROM vendor_aade_action_requests r
        JOIN tax_documents td ON td.id=r.tax_document_id
        WHERE r.vendor_id=$1::uuid
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT vo.public_id AS offer_id,cv.public_id AS canonical_public_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,vo.customer_price_minor
        FROM vendor_offers vo
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=$1::uuid AND vo.status='approved'
        ORDER BY vo.updated_at DESC
        LIMIT 300
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT r.public_id,vo.public_id AS offer_id,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
               r.name,r.current_price_snapshot_minor,r.promotional_price_minor,r.starts_at,r.ends_at,
               r.status,r.reason,r.review_note,r.created_at
        FROM vendor_promotion_requests r
        JOIN vendor_offers vo ON vo.id=r.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=r.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE r.vendor_id=$1::uuid
        ORDER BY r.created_at DESC
        LIMIT 50
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT vs.public_id,vs.status,vs.starts_at,vs.ends_at,vp.code AS plan_code,vp.name AS plan_name
        FROM vendor_subscriptions vs
        JOIN vendor_plans vp ON vp.id=vs.plan_id
        WHERE vs.vendor_id=$1::uuid
        ORDER BY vs.starts_at DESC,vs.created_at DESC
        LIMIT 5
      `, [ref.vendorUuid]),
      tx.query<SqlRow>(`
        SELECT code,name,monthly_price_minor,annual_price_minor,term_price_minor,term_months,sales_fee_bps
        FROM vendor_plans
        WHERE market_id=$1::uuid AND status='active'
        ORDER BY COALESCE(monthly_price_minor,annual_price_minor,term_price_minor,0),name
      `, [ref.marketUuid]),
      tx.query<SqlRow>(`
        SELECT r.public_id,r.status,r.note,r.resolution_note,r.created_at,vp.code AS plan_code,vp.name AS plan_name
        FROM vendor_subscription_change_requests r
        JOIN vendor_plans vp ON vp.id=r.requested_plan_id
        WHERE r.vendor_id=$1::uuid
        ORDER BY r.created_at DESC
        LIMIT 30
      `, [ref.vendorUuid])
    ]);

    const seoRows = new Map(seo.rows.map((row) => [requiredText(row.locale, "locale"), row]));
    const currentSubscriptionRow = subscriptions.rows[0];

    return {
      csrfToken: principal.csrfToken,
      vendorId: ref.vendorPublicId,
      marketId: context.marketId,
      hubId: context.hubId,
      locationId: context.locationId ?? ref.locationPublicId,
      operatingModel: context.operatingModel,
      tradingName: ref.tradingName,
      localDelivery: zone.rowCount ? {
        active: Boolean(zone.rows[0].active),
        postcodePrefixes: Array.isArray(zone.rows[0].postcode_prefixes) ? zone.rows[0].postcode_prefixes.map(String) : [],
        updatedAt: zone.rows[0].updated_at ? epoch(zone.rows[0].updated_at) : undefined
      } : { active: false, postcodePrefixes: [] },
      seo: {
        el: seoProjection("el", seoRows.get("el")),
        en: seoProjection("en", seoRows.get("en"))
      },
      aade: {
        documents: docs.rows.map((row) => ({
          id: requiredText(row.public_id, "tax_document.public_id"),
          type: requiredText(row.type, "tax_document.type"),
          documentNumber: optionalText(row.document_number),
          status: requiredText(row.status, "tax_document.status"),
          transmissionStatus: requiredText(row.transmission_status, "tax_document.transmission_status"),
          aadeMark: optionalText(row.aade_mark),
          qrUrl: optionalText(row.aade_qr_url),
          lastError: optionalText(row.last_error),
          grossMinor: integer(row.gross_minor, "gross_minor"),
          createdAt: epoch(row.created_at)
        })),
        requests: aadeRequests.rows.map((row) => ({
          id: requiredText(row.public_id, "aade_request.public_id"),
          documentId: requiredText(row.document_public_id, "document_public_id"),
          action: requiredText(row.action, "aade_request.action"),
          status: requiredText(row.status, "aade_request.status"),
          note: optionalText(row.note),
          resolutionNote: optionalText(row.resolution_note),
          createdAt: epoch(row.created_at)
        }))
      },
      promotions: {
        offers: offers.rows.map((row) => ({
          offerId: requiredText(row.offer_id, "offer_id"),
          canonicalVariantId: requiredText(row.canonical_public_id, "canonical_public_id"),
          title: requiredText(row.title, "title"),
          priceMinor: integer(row.customer_price_minor, "customer_price_minor")
        })),
        requests: promotionRequests.rows.map((row) => ({
          id: requiredText(row.public_id, "promotion_request.public_id"),
          offerId: requiredText(row.offer_id, "offer_id"),
          title: requiredText(row.title, "title"),
          name: requiredText(row.name, "promotion_request.name"),
          currentPriceMinor: integer(row.current_price_snapshot_minor, "current_price_snapshot_minor"),
          promotionalPriceMinor: integer(row.promotional_price_minor, "promotional_price_minor"),
          startsAt: epoch(row.starts_at),
          endsAt: epoch(row.ends_at),
          status: requiredText(row.status, "promotion_request.status"),
          reason: requiredText(row.reason, "promotion_request.reason"),
          reviewNote: optionalText(row.review_note),
          createdAt: epoch(row.created_at)
        }))
      },
      subscription: {
        current: currentSubscriptionRow ? {
          id: requiredText(currentSubscriptionRow.public_id, "subscription.public_id"),
          planCode: requiredText(currentSubscriptionRow.plan_code, "plan_code"),
          planName: requiredText(currentSubscriptionRow.plan_name, "plan_name"),
          status: requiredText(currentSubscriptionRow.status, "subscription.status"),
          startsAt: epoch(currentSubscriptionRow.starts_at),
          endsAt: currentSubscriptionRow.ends_at ? epoch(currentSubscriptionRow.ends_at) : undefined
        } : undefined,
        plans: plans.rows.map((row) => ({
          code: requiredText(row.code, "plan.code"),
          name: requiredText(row.name, "plan.name"),
          monthlyPriceMinor: optionalInteger(row.monthly_price_minor),
          annualPriceMinor: optionalInteger(row.annual_price_minor),
          termPriceMinor: optionalInteger(row.term_price_minor),
          termMonths: optionalInteger(row.term_months),
          salesFeeBps: integer(row.sales_fee_bps, "sales_fee_bps")
        })),
        requests: subscriptionRequests.rows.map((row) => ({
          id: requiredText(row.public_id, "subscription_request.public_id"),
          planCode: requiredText(row.plan_code, "plan_code"),
          planName: requiredText(row.plan_name, "plan_name"),
          status: requiredText(row.status, "subscription_request.status"),
          note: optionalText(row.note),
          resolutionNote: optionalText(row.resolution_note),
          createdAt: epoch(row.created_at)
        }))
      }
    };
  }, { readOnly: true });
}

export async function updateVendorHubLocalDelivery(principal: SessionPrincipal, input: Readonly<{ active: boolean; postcodePrefixes: unknown }>) {
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") throw new Error("SELF_GOVERNED HUB access is required");
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    if (!ref.locationUuid || !ref.locationPublicId) throw new Error("An active vendor location is required");
    const publicId = `vendor_self_local_delivery_${ref.locationPublicId}`;
    let prefixes = normalizedPrefixes(input.postcodePrefixes);
    if (prefixes.length === 0) {
      const current = await tx.query<SqlRow>("SELECT postcode_prefixes FROM fulfilment_service_zones WHERE public_id=$1 AND vendor_id=$2::uuid LIMIT 1", [publicId, ref.vendorUuid]);
      if (current.rowCount && Array.isArray(current.rows[0].postcode_prefixes)) prefixes = current.rows[0].postcode_prefixes.map(String);
    }
    if (prefixes.length === 0) throw new Error("At least one postcode prefix is required");
    await tx.query(`
      INSERT INTO fulfilment_service_zones(
        public_id,market_id,vendor_id,location_id,mode,postcode_prefixes,active,priority,starts_at,ends_at,created_at,updated_at
      ) VALUES($1,$2::uuid,$3::uuid,$4::uuid,'local_delivery',$5::text[],$6,100,now()-interval '1 minute',NULL,now(),now())
      ON CONFLICT(public_id) DO UPDATE SET
        postcode_prefixes=EXCLUDED.postcode_prefixes,
        active=EXCLUDED.active,
        priority=100,
        ends_at=NULL,
        updated_at=now()
    `, [publicId, ref.marketUuid, ref.vendorUuid, ref.locationUuid, prefixes, Boolean(input.active)]);
  }, { isolation: "serializable" });
  return vendorHubControlsWorkspace(principal);
}

export async function updateVendorHubSeoSource(principal: SessionPrincipal, input: Readonly<{
  locale: "el" | "en";
  story?: unknown;
  expertise?: unknown;
  shortDescription?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
}>) {
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") throw new Error("SELF_GOVERNED HUB access is required");
  if (!["el","en"].includes(input.locale)) throw new Error("Unsupported locale");
  const story = boundedText(input.story, 5000, "Story");
  const expertise = boundedText(input.expertise, 2000, "Expertise");
  const shortDescription = boundedText(input.shortDescription, 500, "Short description");
  const seoTitle = boundedText(input.seoTitle, 120, "SEO title");
  const seoDescription = boundedText(input.seoDescription, 320, "SEO description");
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    await tx.query(`
      INSERT INTO vendor_profile_translations(vendor_id,locale,story,expertise,short_description,seo_title,seo_description)
      VALUES($1::uuid,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(vendor_id,locale) DO UPDATE SET
        story=EXCLUDED.story,
        expertise=EXCLUDED.expertise,
        short_description=EXCLUDED.short_description,
        seo_title=EXCLUDED.seo_title,
        seo_description=EXCLUDED.seo_description
    `, [
      ref.vendorUuid,input.locale,story || null,expertise || null,shortDescription || null,seoTitle || null,seoDescription || null
    ]);
  }, { isolation: "serializable" });
  return vendorHubControlsWorkspace(principal);
}

export async function requestVendorHubPromotion(principal: SessionPrincipal, input: Readonly<{
  offerId?: unknown;
  name?: unknown;
  promotionalPriceMinor?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  reason?: unknown;
}>) {
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") throw new Error("SELF_GOVERNED HUB access is required");
  const offerId = boundedText(input.offerId, 160, "Offer", true);
  const name = boundedText(input.name, 120, "Promotion name", true);
  const reason = boundedText(input.reason, 1000, "Promotion reason", true);
  const promotionalPriceMinor = Number(input.promotionalPriceMinor);
  if (!Number.isSafeInteger(promotionalPriceMinor) || promotionalPriceMinor < 0) throw new Error("Promotional price is invalid");
  const startsAt = new Date(String(input.startsAt ?? "")).getTime();
  const endsAt = new Date(String(input.endsAt ?? "")).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || endsAt <= startsAt) throw new Error("Promotion dates are invalid");
  if (startsAt < Date.now() - 5 * 60 * 1000) throw new Error("Promotion start cannot be in the past");

  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    const offer = await tx.query<SqlRow>(`
      SELECT vo.id::text AS offer_uuid,vo.customer_price_minor,cv.id::text AS canonical_uuid
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      WHERE vo.public_id=$1 AND vo.vendor_id=$2::uuid AND vo.status='approved'
      LIMIT 1
    `, [offerId, ref.vendorUuid]);
    if (offer.rowCount !== 1) throw new Error("Promotion offer was not found");
    const currentPrice = integer(offer.rows[0].customer_price_minor, "current_price");
    if (promotionalPriceMinor >= currentPrice) throw new Error("Promotional price must be lower than the current price");
    await tx.query(`
      INSERT INTO vendor_promotion_requests(
        market_id,vendor_id,vendor_offer_id,canonical_variant_id,name,currency,current_price_snapshot_minor,
        promotional_price_minor,starts_at,ends_at,reason,status,requested_by,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'EUR',$6,$7,$8,$9,$10,'pending',
        (SELECT id FROM users WHERE public_id=$11 OR id::text=$11 LIMIT 1),now(),now()
      )
    `, [
      ref.marketUuid,ref.vendorUuid,requiredText(offer.rows[0].offer_uuid,"offer_uuid"),
      requiredText(offer.rows[0].canonical_uuid,"canonical_uuid"),name,currentPrice,promotionalPriceMinor,
      new Date(startsAt),new Date(endsAt),reason,principal.userId
    ]);
  }, { isolation: "serializable" });
  return vendorHubControlsWorkspace(principal);
}

export async function requestVendorHubAadeAction(principal: SessionPrincipal, input: Readonly<{
  documentId?: unknown;
  action?: unknown;
  note?: unknown;
}>) {
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") throw new Error("SELF_GOVERNED HUB access is required");
  const documentId = boundedText(input.documentId, 160, "AADE document", true);
  const action = boundedText(input.action, 20, "AADE action", true);
  if (!["review","retry","reconcile"].includes(action)) throw new Error("AADE action is invalid");
  const note = boundedText(input.note, 1000, "AADE note");
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    const document = await tx.query<SqlRow>(`
      SELECT id::text AS document_uuid
      FROM tax_documents
      WHERE public_id=$1 AND vendor_id=$2::uuid
      LIMIT 1
    `, [documentId, ref.vendorUuid]);
    if (document.rowCount !== 1) throw new Error("AADE document was not found");
    await tx.query(`
      INSERT INTO vendor_aade_action_requests(
        market_id,vendor_id,tax_document_id,action,note,status,requested_by,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4,$5,'pending',
        (SELECT id FROM users WHERE public_id=$6 OR id::text=$6 LIMIT 1),now(),now()
      )
    `, [ref.marketUuid,ref.vendorUuid,requiredText(document.rows[0].document_uuid,"document_uuid"),action,note || null,principal.userId]);
  }, { isolation: "serializable" });
  return vendorHubControlsWorkspace(principal);
}

export async function requestVendorHubSubscriptionChange(principal: SessionPrincipal, input: Readonly<{
  planCode?: unknown;
  note?: unknown;
}>) {
  const context = await vendorOperatingContextForPrincipal(principal);
  if (context.operatingModel !== "SELF_GOVERNED") throw new Error("SELF_GOVERNED HUB access is required");
  const planCode = boundedText(input.planCode, 80, "Plan", true);
  const note = boundedText(input.note, 1000, "Subscription note");
  const uow = new PostgresUnitOfWork(runtime().sqlPool);
  await uow.withTransaction(scope(principal, context.marketId), async (tx) => {
    const ref = await refs(tx, principal);
    const plan = await tx.query<SqlRow>(`
      SELECT id::text AS plan_uuid
      FROM vendor_plans
      WHERE market_id=$1::uuid AND code=$2 AND status='active'
      LIMIT 1
    `, [ref.marketUuid, planCode]);
    if (plan.rowCount !== 1) throw new Error("Requested plan is not available in this HUB");
    const current = await tx.query<SqlRow>(`
      SELECT id::text AS subscription_uuid
      FROM vendor_subscriptions
      WHERE vendor_id=$1::uuid
      ORDER BY starts_at DESC,created_at DESC
      LIMIT 1
    `, [ref.vendorUuid]);
    await tx.query(`
      INSERT INTO vendor_subscription_change_requests(
        market_id,vendor_id,current_subscription_id,requested_plan_id,note,status,requested_by,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,'pending',
        (SELECT id FROM users WHERE public_id=$6 OR id::text=$6 LIMIT 1),now(),now()
      )
    `, [
      ref.marketUuid,ref.vendorUuid,current.rowCount ? requiredText(current.rows[0].subscription_uuid,"subscription_uuid") : null,
      requiredText(plan.rows[0].plan_uuid,"plan_uuid"),note || null,principal.userId
    ]);
  }, { isolation: "serializable" });
  return vendorHubControlsWorkspace(principal);
}
