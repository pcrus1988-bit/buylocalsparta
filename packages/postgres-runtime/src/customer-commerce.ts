import { createHash, randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  id,
  money,
  splitGrossTax,
  type CustomerOrder,
  type DatabaseScope,
  type FulfilmentMode,
  type OrderLine,
  type SqlExecutor,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";

const RESERVATION_TTL_MS = 15 * 60 * 1000;
const PAID_RESERVATION_HOLD_MS = 48 * 60 * 60 * 1000;
const STICKY_MS = 30 * 24 * 60 * 60 * 1000;
const OPEN_FULFILMENT_STATUSES = ["awaiting_acceptance", "accepted", "picking", "packed", "ready_for_handover", "shipped"] as const;

export type PersistentCartItem = Readonly<{
  canonicalVariantId: string;
  title: string;
  quantity: number;
  priceMinor: number;
  currency: "EUR";
  available: boolean;
}>;

export type PersistentCartSnapshot = Readonly<{
  id: string;
  customerId: string;
  marketId: string;
  items: readonly PersistentCartItem[];
  updatedAt: number;
}>;

export type PublicCatalogRecord = Readonly<{
  id: string;
  title: string;
  categoryCode: string;
  priceMinor: number;
  currency: "EUR";
  taxRateBps: number;
}>;

export type PublicAssignedCatalogRecord = PublicCatalogRecord & Readonly<{
  available: boolean;
  availableToSell: number;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}>;

export type PublicVendorProfile = Readonly<{
  id: string;
  name: string;
  adviser?: string;
}>;

export type PostgresCheckoutInput = Readonly<{
  checkoutKey: string;
  visitorKey: string;
  customerId?: string;
  marketId?: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  items: readonly Readonly<{ canonicalVariantId: string; quantity: number }>[];
  now: number;
  developmentAuthorisePayment?: boolean;
  shipping?: Readonly<{ provider?: "boxnow"; providerDestinationId?: string; providerDestinationLabel?: string; recipientName?: string; recipientEmail?: string; recipientPhone?: string }>;
}>;

type CanonicalRow = SqlRow & {
  canonical_uuid: string;
  canonical_public_id: string;
  market_uuid: string;
  market_code: string;
  category_code: string;
  title: string;
  platform_price_minor: number | string;
  currency: string;
  tax_rate_bps: number | string;
};

type OfferRow = SqlRow & {
  offer_uuid: string;
  offer_public_id: string;
  vendor_uuid: string;
  vendor_public_id: string;
  vendor_name: string;
  location_uuid: string;
  location_public_id: string;
  supplier_unit_price_minor: number | string;
  supplier_tax_rate_bps: number | string;
  available_to_sell: number | string;
  stock_confirmed_at: Date | string;
};

type FairnessStateRow = SqlRow & {
  vendor_uuid: string;
  vendor_public_id: string;
  deficit: number | string;
  qualified_exposures: number | string;
};

function asInt(value: unknown, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid integer ${label} from PostgreSQL`);
  return parsed;
}

function epoch(value: unknown, label: string): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Invalid timestamp ${label} from PostgreSQL`);
  return parsed;
}

function text(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid text ${label} from PostgreSQL`);
  return value;
}

function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

function checkoutFingerprint(input: PostgresCheckoutInput): string {
  const payload = {
    visitorHash: visitorHash(input.visitorKey),
    customerId: input.customerId ?? null,
    marketId: input.marketId ?? "sparta",
    postcode: input.postcode,
    fulfilmentMode: input.fulfilmentMode,
    items: [...input.items].map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity })).sort((a, b) => a.canonicalVariantId.localeCompare(b.canonicalVariantId))
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function orderNumber(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  return `BLS-${day}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

function deterministicTie(input: { variantId: string; postcode: string; now: number; vendorId: string }): string {
  const day = Math.floor(input.now / 86_400_000);
  return createHash("sha256").update(`${input.variantId}|${input.postcode}|${day}|${input.vendorId}`).digest("hex");
}

function customerScope(customerId: string): DatabaseScope {
  return { actorUserId: customerId, marketId: "sparta", platformAccess: false };
}

export class PostgresCustomerCommerceService {
  readonly #uow: PostgresUnitOfWork;

  constructor(pool: SqlPool) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  }

  async publicCanonicals(marketId = "sparta"): Promise<readonly PublicCatalogRecord[]> {
    const result = await this.#uow.withTransaction({ marketId, platformAccess: true }, (tx) => tx.query<CanonicalRow>(`
      SELECT cv.id::text AS canonical_uuid, cv.public_id AS canonical_public_id,
             m.id::text AS market_uuid, m.code AS market_code, c.code AS category_code,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
             cv.platform_price_minor, cv.currency, cv.tax_rate_bps
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE (m.code=$1 OR m.id::text=$1)
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      ORDER BY cv.created_at DESC,cv.public_id
    `, [marketId]), { readOnly: true });
    return result.rows.map((row) => this.#canonicalRecord(row));
  }

  async publicCanonicalAvailability(canonicalVariantId: string, input: { postcode?: string; fulfilmentMode?: FulfilmentMode; quantity?: number; now?: number } = {}): Promise<Readonly<{ product: PublicCatalogRecord; available: boolean; availableToSell: number }> | undefined> {
    const now = input.now ?? Date.now();
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const canonical = await this.#canonical(tx, canonicalVariantId, "sparta");
      if (!canonical) return undefined;
      const offers = await this.#eligibleOffers(tx, canonical, input.postcode ?? "23100", input.fulfilmentMode ?? "pickup", input.quantity ?? 1, now);
      return { product: this.#canonicalRecord(canonical), available: offers.length > 0, availableToSell: offers.length ? Math.max(...offers.map((offer) => asInt(offer.available_to_sell, "available_to_sell"))) : 0 };
    }, { readOnly: true });
  }

  async publicAssignedCanonical(input: {
    canonicalVariantId: string;
    visitorKey: string;
    postcode: string;
    fulfilmentMode?: FulfilmentMode;
    reason?: "search_card" | "product_view" | "recommendation_card";
    now?: number;
  }): Promise<PublicAssignedCatalogRecord | undefined> {
    const now = input.now ?? Date.now();
    return this.#withSerializableRetry({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const canonical = await this.#canonical(tx, input.canonicalVariantId, "sparta");
      if (!canonical) return undefined;
      const base = this.#canonicalRecord(canonical);
      const offers = await this.#eligibleOffers(tx, canonical, input.postcode, input.fulfilmentMode ?? "pickup", 1, now);
      if (offers.length === 0) return { ...base, available: false, availableToSell: 0 };
      const selected = await this.#selectFairOffer(tx, {
        canonical,
        offers,
        visitorHash: visitorHash(input.visitorKey),
        postcode: input.postcode,
        reason: input.reason ?? "search_card",
        now
      });
      return {
        ...base,
        available: true,
        availableToSell: asInt(selected.available_to_sell, "available_to_sell"),
        vendorId: text(selected.vendor_public_id, "vendor_public_id"),
        vendorName: text(selected.vendor_name, "vendor_name"),
        adviser: await this.#adviserName(tx, text(selected.vendor_uuid, "vendor_uuid"))
      };
    });
  }

  async customerCart(customerId: string, marketId = "sparta"): Promise<PersistentCartSnapshot> {
    return this.#uow.withTransaction(customerScope(customerId), async (tx) => {
      const user = await this.#userUuid(tx, customerId);
      const market = await this.#marketUuid(tx, marketId);
      const cart = await tx.query<SqlRow>(`SELECT id::text AS id,public_id,updated_at FROM carts WHERE market_id=$1 AND user_id=$2 LIMIT 1`, [market, user]);
      if (cart.rowCount === 0) return { id: "", customerId, marketId, items: [], updatedAt: Date.now() };
      const cartUuid = text(cart.rows[0].id, "cart.id");
      const items = await tx.query<SqlRow>(`
        SELECT cv.public_id AS canonical_public_id,ci.quantity,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
               cv.platform_price_minor,cv.currency,
               EXISTS(
                 SELECT 1 FROM vendor_offers vo JOIN vendor_businesses v ON v.id=vo.vendor_id JOIN vendor_locations l ON l.id=vo.location_id
                 JOIN inventory_balances ib ON ib.offer_id=vo.id
                 WHERE vo.canonical_variant_id=cv.id AND vo.status='approved' AND v.status='active' AND l.active=true
                   AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
                   AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=ci.quantity
                   AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > now()
               ) AS available
        FROM cart_items ci JOIN canonical_variants cv ON cv.id=ci.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE ci.cart_id=$1 ORDER BY ci.created_at,ci.public_id
      `, [cartUuid]);
      return {
        id: text(cart.rows[0].public_id, "cart.public_id"), customerId, marketId,
        updatedAt: epoch(cart.rows[0].updated_at, "cart.updated_at"),
        items: items.rows.map((row) => ({
          canonicalVariantId: text(row.canonical_public_id, "canonical_public_id"),
          title: text(row.title, "title"), quantity: asInt(row.quantity, "quantity"),
          priceMinor: asInt(row.platform_price_minor, "platform_price_minor"), currency: "EUR" as const,
          available: Boolean(row.available)
        }))
      };
    }, { readOnly: true });
  }

  async syncCustomerCart(input: { customerId: string; marketId?: string; items: readonly Readonly<{ canonicalVariantId: string; quantity: number }>[]; now: number }): Promise<PersistentCartSnapshot> {
    const marketId = input.marketId ?? "sparta";
    const unique = new Map<string, number>();
    for (const item of input.items) {
      if (!item.canonicalVariantId.trim() || item.canonicalVariantId.length > 128) throw new Error("Invalid cart product id");
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99) throw new Error("Invalid cart quantity");
      unique.set(item.canonicalVariantId, item.quantity);
    }
    await this.#uow.withTransaction(customerScope(input.customerId), async (tx) => {
      const user = await this.#userUuid(tx, input.customerId);
      const market = await this.#marketUuid(tx, marketId);
      const cartPublicId = id("cart");
      await tx.query(`INSERT INTO carts(id,public_id,market_id,user_id,currency,created_at,updated_at)
        VALUES($1,$2,$3,$4,'EUR',$5,$5)
        ON CONFLICT (market_id,user_id) WHERE user_id IS NOT NULL DO UPDATE SET updated_at=EXCLUDED.updated_at`,
        [randomUUID(), cartPublicId, market, user, new Date(input.now)]);
      const cart = await tx.query<SqlRow>("SELECT id::text AS id FROM carts WHERE market_id=$1 AND user_id=$2", [market, user]);
      const cartUuid = text(cart.rows[0]?.id, "cart.id");
      if (unique.size === 0) {
        await tx.query("DELETE FROM cart_items WHERE cart_id=$1", [cartUuid]);
        return;
      }
      const keepUuids: string[] = [];
      for (const [canonicalVariantId, quantity] of unique) {
        const canonical = await this.#canonical(tx, canonicalVariantId, marketId);
        if (!canonical) throw new Error(`Product ${canonicalVariantId} is not publicly available`);
        const canonicalUuid = text(canonical.canonical_uuid, "canonical_uuid");
        keepUuids.push(canonicalUuid);
        await tx.query(`INSERT INTO cart_items(id,public_id,cart_id,canonical_variant_id,quantity,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$6)
          ON CONFLICT (cart_id,canonical_variant_id) WHERE private_offer_id IS NULL DO UPDATE SET quantity=EXCLUDED.quantity,updated_at=EXCLUDED.updated_at`,
          [randomUUID(), id("cart-item"), cartUuid, canonicalUuid, quantity, new Date(input.now)]);
      }
      await tx.query("DELETE FROM cart_items WHERE cart_id=$1 AND NOT (canonical_variant_id=ANY($2::uuid[]))", [cartUuid, keepUuids]);
    }, { isolation: "serializable" });
    return this.customerCart(input.customerId, marketId);
  }

  async checkout(input: PostgresCheckoutInput): Promise<CustomerOrder> {
    this.#validateCheckout(input);
    const fingerprint = checkoutFingerprint(input);
    const marketId = input.marketId ?? "sparta";
    return this.#withSerializableRetry({ actorUserId: input.customerId, marketId, platformAccess: true }, async (tx) => {
      const existing = await tx.query<SqlRow>("SELECT public_id,checkout_fingerprint,visitor_hash FROM customer_orders WHERE checkout_key=$1 FOR UPDATE", [input.checkoutKey]);
      if (existing.rowCount) {
        const storedFingerprint = text(existing.rows[0].checkout_fingerprint, "checkout_fingerprint");
        if (storedFingerprint.startsWith("legacy:")) {
          if (text(existing.rows[0].visitor_hash, "visitor_hash") !== visitorHash(input.visitorKey)) throw new Error("Idempotent checkout replay belongs to another visitor");
        } else if (storedFingerprint !== fingerprint) throw new Error("Idempotent checkout replay changed request payload");
        return this.#loadOrder(tx, text(existing.rows[0].public_id, "order.public_id"));
      }

      const customerUuid = input.customerId ? await this.#userUuid(tx, input.customerId) : null;
      const marketUuid = await this.#marketUuid(tx, marketId);
      const selectedLines: Array<{
        canonical: CanonicalRow;
        offer: OfferRow;
        quantity: number;
        reservationId: string;
        lineId: string;
      }> = [];
      try {
        for (const item of input.items) {
          const canonical = await this.#canonical(tx, item.canonicalVariantId, marketId);
          if (!canonical) throw new Error(`Product ${item.canonicalVariantId} is unavailable`);
          const offers = await this.#eligibleOffers(tx, canonical, input.postcode, input.fulfilmentMode, item.quantity, input.now);
          if (offers.length === 0) throw new Error(`No eligible local supplier has enough stock for ${item.canonicalVariantId}`);
          const offer = await this.#selectFairOffer(tx, {
            canonical, offers, visitorHash: visitorHash(input.visitorKey), postcode: input.postcode, reason: "checkout", now: input.now
          });
          const reservation = await tx.query<SqlRow>(`SELECT r.public_id FROM reserve_stock($1,$2,$3,$4,$5,$6,$7) r`, [
            marketUuid, input.checkoutKey, text(offer.offer_uuid, "offer_uuid"), null, item.quantity,
            new Date(input.now), new Date(input.now + RESERVATION_TTL_MS)
          ]);
          selectedLines.push({ canonical, offer, quantity: item.quantity, reservationId: text(reservation.rows[0]?.public_id, "reservation.public_id"), lineId: id("line") });
        }

        const groupMap = new Map<string, typeof selectedLines>();
        for (const line of selectedLines) {
          const key = `${line.offer.vendor_uuid}:${line.offer.location_uuid}`;
          const list = groupMap.get(key) ?? [];
          list.push(line); groupMap.set(key, list);
        }
        const fulfilmentGroups: Array<{
          id: string; vendorUuid: string; vendorPublicId: string; locationUuid: string; locationPublicId: string;
          lineIds: string[]; merchandiseMinor: number; deliveryMinor: number; waivedMinor: number; ruleId?: string; ruleVersion?: number; quoteId: string;
        }> = [];
        for (const lines of groupMap.values()) {
          const first = lines[0];
          const merchandiseMinor = lines.reduce((sum, line) => sum + asInt(line.canonical.platform_price_minor, "platform_price_minor") * line.quantity, 0);
          const delivery = await this.#deliveryQuote(tx, { marketUuid, vendorUuid: text(first.offer.vendor_uuid, "vendor_uuid"), vendorPublicId: text(first.offer.vendor_public_id, "vendor_public_id"), mode: input.fulfilmentMode, postcode: input.postcode, merchandiseMinor, now: input.now });
          fulfilmentGroups.push({
            id: id("ful"), vendorUuid: text(first.offer.vendor_uuid, "vendor_uuid"), vendorPublicId: text(first.offer.vendor_public_id, "vendor_public_id"),
            locationUuid: text(first.offer.location_uuid, "location_uuid"), locationPublicId: text(first.offer.location_public_id, "location_public_id"),
            lineIds: lines.map((line) => line.lineId), merchandiseMinor, deliveryMinor: delivery.chargeMinor, waivedMinor: delivery.waivedMinor,
            ruleId: delivery.ruleId, ruleVersion: delivery.ruleVersion, quoteId: id("delivery-quote")
          });
        }

        const merchandiseMinor = selectedLines.reduce((sum, line) => sum + asInt(line.canonical.platform_price_minor, "platform_price_minor") * line.quantity, 0);
        const deliveryMinor = fulfilmentGroups.reduce((sum, group) => sum + group.deliveryMinor, 0);
        const totalMinor = merchandiseMinor + deliveryMinor;
        const taxMinor = selectedLines.reduce((sum, line) => sum + splitGrossTax(money(asInt(line.canonical.platform_price_minor, "platform_price_minor") * line.quantity), asInt(line.canonical.tax_rate_bps, "tax_rate_bps")).tax.minor, 0);
        const orderId = id("ord");
        const paymentId = id("pay");
        const developmentAuthorised = input.developmentAuthorisePayment === true;
        const orderStatus = developmentAuthorised ? "authorised" : "pending_payment";
        const paymentStatus = developmentAuthorised ? "authorised" : "created";
        const orderUuid = randomUUID();
        await tx.query(`INSERT INTO customer_orders(
          id,public_id,order_number,market_id,user_id,visitor_hash,checkout_key,checkout_fingerprint,status,currency,
          subtotal_minor,shipping_minor,discount_minor,tax_minor,total_minor,billing_address_snapshot,shipping_address_snapshot,
          fulfilment_preference,partial_fulfilment_allowed,terms_version,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'EUR',$10,$11,0,$12,$13,$14::jsonb,$15::jsonb,$16,false,$17,$18,$18)`, [
          orderUuid, orderId, orderNumber(input.now), marketUuid, customerUuid, visitorHash(input.visitorKey), input.checkoutKey, fingerprint, orderStatus,
          merchandiseMinor, deliveryMinor, taxMinor, totalMinor,
          JSON.stringify({ postcode: input.postcode, source: "web_checkout" }),
          JSON.stringify(input.fulfilmentMode === "pickup" ? null : { postcode: input.postcode, countryCode: "GR", ...(input.shipping ?? {}) }),
          input.fulfilmentMode, "web-v1", new Date(input.now)
        ]);

        for (const line of selectedLines) {
          const priceMinor = asInt(line.canonical.platform_price_minor, "platform_price_minor");
          const taxRateBps = asInt(line.canonical.tax_rate_bps, "tax_rate_bps");
          const lineTax = splitGrossTax(money(priceMinor * line.quantity), taxRateBps).tax.minor;
          const lineUuid = randomUUID();
          await tx.query(`INSERT INTO order_lines(
            id,public_id,order_id,canonical_variant_id,assigned_offer_id,vendor_id,location_id,quantity,product_snapshot,
            retail_unit_price_minor,tax_rate_bps,tax_minor,supplier_unit_price_minor,supplier_tax_rate_bps,shipping_promise_snapshot,
            attribution_snapshot,status,fulfilled_quantity,refunded_quantity,adjustment_refunded_minor,pricing_source,discount_allocation_minor,created_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,'awaiting_vendor',0,0,0,'catalog',0,$17)`, [
            lineUuid, line.lineId, orderUuid, text(line.canonical.canonical_uuid, "canonical_uuid"), text(line.offer.offer_uuid, "offer_uuid"),
            text(line.offer.vendor_uuid, "vendor_uuid"), text(line.offer.location_uuid, "location_uuid"), line.quantity,
            JSON.stringify({ title: text(line.canonical.title, "title"), categoryCode: text(line.canonical.category_code, "category_code"), pricingSource: "catalog" }),
            priceMinor, taxRateBps, lineTax, asInt(line.offer.supplier_unit_price_minor, "supplier_unit_price_minor"), asInt(line.offer.supplier_tax_rate_bps, "supplier_tax_rate_bps"),
            JSON.stringify({ postcode: input.postcode, mode: input.fulfilmentMode }),
            JSON.stringify({ assignedOfferId: text(line.offer.offer_public_id, "offer_public_id"), vendorId: text(line.offer.vendor_public_id, "vendor_public_id"), fairness: "persistent_deficit" }),
            new Date(input.now)
          ]);
          await tx.query("UPDATE stock_reservations SET order_line_id=$1 WHERE public_id=$2", [lineUuid, line.reservationId]);
        }

        for (const group of fulfilmentGroups) {
          const fulfilUuid = randomUUID();
          const deliveryRuleUuid = group.ruleId ? (await tx.query<SqlRow>("SELECT id::text AS id FROM delivery_rules WHERE public_id=$1", [group.ruleId])).rows[0]?.id ?? null : null;
          await tx.query(`INSERT INTO fulfilment_orders(
            id,public_id,fulfilment_number,order_id,vendor_id,location_id,mode,status,merchandise_subtotal_minor,delivery_charge_minor,
            waived_delivery_minor,delivery_rule_id,delivery_rule_version,delivery_quote_public_id,created_at,updated_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_acceptance',$8,$9,$10,$11,$12,$13,$14,$14)`, [
            fulfilUuid, group.id, `FUL-${group.id.slice(-12).toUpperCase()}`, orderUuid, group.vendorUuid, group.locationUuid, input.fulfilmentMode,
            group.merchandiseMinor, group.deliveryMinor, group.waivedMinor, deliveryRuleUuid, group.ruleVersion ?? null, group.quoteId, new Date(input.now)
          ]);
          for (const lineId of group.lineIds) {
            await tx.query(`INSERT INTO fulfilment_order_lines(fulfilment_order_id,order_line_id)
              SELECT $1,id FROM order_lines WHERE public_id=$2 ON CONFLICT DO NOTHING`, [fulfilUuid, lineId]);
          }
        }

        await tx.query(`INSERT INTO payments(id,public_id,order_id,provider,provider_payment_id,idempotency_key,status,currency,authorised_minor,captured_minor,refunded_minor,created_at,updated_at)
          VALUES($1,$2,$3,$4,NULL,$5,$6,'EUR',$7,0,0,$8,$8)`, [
          randomUUID(), paymentId, orderUuid, developmentAuthorised ? "development" : "pending_psp", `checkout:${input.checkoutKey}`, paymentStatus,
          developmentAuthorised ? totalMinor : 0, new Date(input.now)
        ]);

        if (input.customerId) {
          const userUuid = customerUuid!;
          const cart = await tx.query<SqlRow>("SELECT id::text AS id FROM carts WHERE market_id=$1 AND user_id=$2", [marketUuid, userUuid]);
          if (cart.rowCount) await tx.query("DELETE FROM cart_items WHERE cart_id=$1", [text(cart.rows[0].id, "cart.id")]);
        }
        return this.#loadOrder(tx, orderId);
      } catch (error) {
        // The encompassing SQL transaction rolls back reservations, fairness mutations and order rows together.
        throw error;
      }
    });
  }

  async rejectVendorFulfilment(input: { actorUserId: string; vendorId: string; fulfilmentId: string; reason?: string; now: number }): Promise<CustomerOrder> {
    const reason = input.reason?.trim() || "vendor_rejection";
    if (!input.actorUserId.trim() || !input.vendorId.trim() || !input.fulfilmentId.trim()) throw new Error("Vendor rejection requires actor, vendor and fulfilment identifiers");
    if (reason.length > 500) throw new Error("Vendor rejection reason is too long");
    return this.#withSerializableRetry({ actorUserId: input.actorUserId, vendorId: input.vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const found = await tx.query<SqlRow>(`SELECT fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,fo.mode::text AS mode,
        fo.delivery_charge_minor,fo.waived_delivery_minor,fo.delivery_rule_id::text AS delivery_rule_uuid,fo.delivery_rule_version,fo.delivery_quote_public_id,
        v.id::text AS rejected_vendor_uuid,v.public_id AS rejected_vendor_id,
        o.id::text AS order_uuid,o.public_id AS order_id,o.status::text AS order_status,o.checkout_key,o.visitor_hash,o.market_id::text AS market_uuid,
        m.code AS market_code,COALESCE(o.shipping_address_snapshot->>'postcode',o.billing_address_snapshot->>'postcode','23100') AS postcode
        FROM fulfilment_orders fo JOIN customer_orders o ON o.id=fo.order_id JOIN markets m ON m.id=o.market_id
        JOIN vendor_businesses v ON v.id=fo.vendor_id
        WHERE fo.public_id=$1 FOR UPDATE OF fo,o`, [input.fulfilmentId]);
      if (!found.rowCount || text(found.rows[0].rejected_vendor_id, "rejected_vendor_id") !== input.vendorId) throw new Error("Vendor fulfilment access denied");
      const header = found.rows[0];
      const fulfilmentStatus = text(header.fulfilment_status, "fulfilment_status");
      const orderId = text(header.order_id, "order_id");
      if (fulfilmentStatus === "rejected") return this.#loadOrder(tx, orderId);
      if (fulfilmentStatus !== "awaiting_acceptance") throw new Error(`Cannot reject fulfilment in ${fulfilmentStatus}`);
      const orderStatus = text(header.order_status, "order_status");
      if (!["confirmed", "partially_fulfilled"].includes(orderStatus)) throw new Error("Order must be payment-confirmed before vendor rejection");

      const actor = await this.#userUuid(tx, input.actorUserId);
      const fulfilmentUuid = text(header.fulfilment_uuid, "fulfilment_uuid");
      const orderUuid = text(header.order_uuid, "order_uuid");
      const rejectedVendorUuid = text(header.rejected_vendor_uuid, "rejected_vendor_uuid");
      const marketUuid = text(header.market_uuid, "market_uuid");
      const marketCode = text(header.market_code, "market_code");
      const postcode = text(header.postcode, "postcode");
      const mode = text(header.mode, "mode") as FulfilmentMode;
      const visitor = text(header.visitor_hash, "visitor_hash");
      const checkoutKey = text(header.checkout_key, "checkout_key");

      const lines = await tx.query<SqlRow>(`SELECT ol.id::text AS line_uuid,ol.public_id AS line_id,ol.canonical_variant_id::text AS canonical_uuid,cv.public_id AS canonical_public_id,
        ol.assigned_offer_id::text AS old_offer_uuid,ol.quantity,ol.retail_unit_price_minor,
        sr.id::text AS reservation_uuid,sr.public_id AS reservation_id,sr.status::text AS reservation_status
        FROM fulfilment_order_lines fol JOIN order_lines ol ON ol.id=fol.order_line_id JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
        LEFT JOIN stock_reservations sr ON sr.order_line_id=ol.id AND sr.status='active'
        WHERE fol.fulfilment_order_id=$1 ORDER BY ol.public_id FOR UPDATE OF ol`, [fulfilmentUuid]);
      if (!lines.rowCount) throw new Error("Rejected fulfilment has no order lines");

      await tx.query(`UPDATE fulfilment_orders SET status='rejected',rejection_reason=$2,delivery_charge_minor=0,waived_delivery_minor=0,updated_at=$3 WHERE id=$1`, [fulfilmentUuid, reason, new Date(input.now)]);

      const rescued: Array<{ lineUuid:string; lineId:string; vendorUuid:string; locationUuid:string; quantity:number; retailUnitMinor:number }> = [];
      let rescueFailed = false;
      for (const line of lines.rows) {
        const lineUuid = text(line.line_uuid, "line_uuid");
        const lineId = text(line.line_id, "line_id");
        const canonicalPublicId = text(line.canonical_public_id, "canonical_public_id");
        const canonicalUuid = text(line.canonical_uuid, "canonical_uuid");
        const oldOfferUuid = text(line.old_offer_uuid, "old_offer_uuid");
        const quantity = asInt(line.quantity, "quantity");
        const reservationUuid = optionalText(line.reservation_uuid);
        if (!reservationUuid || text(line.reservation_status, "reservation_status") !== "active") throw new Error(`Paid order line ${lineId} has no active reservation to rescue`);

        await tx.query(`SELECT release_stock_reservation($1::uuid,$2,$3,$4::uuid)`, [reservationUuid, new Date(input.now), "vendor_rejection", actor]);
        await tx.query(`UPDATE sticky_assignments SET released_at=$5,release_reason='vendor_rejection'
          WHERE market_id=$1 AND canonical_variant_id=$2 AND visitor_hash=$3 AND postcode_scope=$4 AND released_at IS NULL`, [marketUuid, canonicalUuid, visitor, postcode, new Date(input.now)]);

        const canonical = await this.#canonical(tx, canonicalPublicId, marketCode);
        if (!canonical) {
          await tx.query("UPDATE order_lines SET status='cancelled' WHERE id=$1", [lineUuid]);
          rescueFailed = true;
          continue;
        }
        const eligible = (await this.#eligibleOffers(tx, canonical, postcode, mode, quantity, input.now))
          .filter((offer) => text(offer.vendor_uuid, "vendor_uuid") !== rejectedVendorUuid && text(offer.offer_uuid, "offer_uuid") !== oldOfferUuid);
        if (!eligible.length) {
          await tx.query("UPDATE order_lines SET status='cancelled' WHERE id=$1", [lineUuid]);
          rescueFailed = true;
          continue;
        }
        const selected = await this.#selectFairOffer(tx, { canonical, offers: eligible, visitorHash: visitor, postcode, reason: "rescue", now: input.now });
        const rescueKey = `${checkoutKey}:rescue:${lineId}`;
        const reservation = await tx.query<SqlRow>(`SELECT r.public_id FROM reserve_stock($1,$2,$3,$4,$5,$6,$7) r`, [
          marketUuid, rescueKey, text(selected.offer_uuid, "offer_uuid"), null, quantity, new Date(input.now), new Date(input.now + PAID_RESERVATION_HOLD_MS)
        ]);
        const reservationId = text(reservation.rows[0]?.public_id, "rescue.reservation_id");
        await tx.query(`UPDATE stock_reservations SET order_line_id=$1 WHERE public_id=$2`, [lineUuid, reservationId]);
        await tx.query(`UPDATE order_lines SET assigned_offer_id=$2,vendor_id=$3,location_id=$4,supplier_unit_price_minor=$5,supplier_tax_rate_bps=$6,
          attribution_snapshot=attribution_snapshot||$7::jsonb,status='awaiting_vendor' WHERE id=$1`, [
          lineUuid, text(selected.offer_uuid, "offer_uuid"), text(selected.vendor_uuid, "vendor_uuid"), text(selected.location_uuid, "location_uuid"),
          asInt(selected.supplier_unit_price_minor, "supplier_unit_price_minor"), asInt(selected.supplier_tax_rate_bps, "supplier_tax_rate_bps"),
          JSON.stringify({ rescue: true, rescuedAt: new Date(input.now).toISOString(), previousVendorId: input.vendorId, assignedOfferId: text(selected.offer_public_id, "offer_public_id"), vendorId: text(selected.vendor_public_id, "vendor_public_id") })
        ]);
        rescued.push({ lineUuid, lineId, vendorUuid:text(selected.vendor_uuid, "vendor_uuid"), locationUuid:text(selected.location_uuid, "location_uuid"), quantity, retailUnitMinor:asInt(line.retail_unit_price_minor, "retail_unit_price_minor") });
      }

      const groups = new Map<string, typeof rescued>();
      for (const line of rescued) {
        const key = `${line.vendorUuid}:${line.locationUuid}`;
        const group = groups.get(key) ?? [];
        group.push(line); groups.set(key, group);
      }
      let first = true;
      for (const group of groups.values()) {
        const fulfilUuid = randomUUID();
        const publicId = id("ful");
        const merchandiseMinor = group.reduce((sum, line) => sum + line.retailUnitMinor * line.quantity, 0);
        await tx.query(`INSERT INTO fulfilment_orders(id,public_id,fulfilment_number,order_id,vendor_id,location_id,mode,status,merchandise_subtotal_minor,
          delivery_charge_minor,waived_delivery_minor,delivery_rule_id,delivery_rule_version,delivery_quote_public_id,rescued_from_fulfilment_id,created_at,updated_at)
          VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_acceptance',$8,$9,$10,$11,$12,$13,$14,$15,$15)`, [
          fulfilUuid, publicId, `FUL-${publicId.slice(-12).toUpperCase()}`, orderUuid, group[0].vendorUuid, group[0].locationUuid, mode, merchandiseMinor,
          first ? asInt(header.delivery_charge_minor ?? 0, "delivery_charge_minor") : 0,
          first ? asInt(header.waived_delivery_minor ?? 0, "waived_delivery_minor") : 0,
          first ? optionalText(header.delivery_rule_uuid) ?? null : null,
          first && header.delivery_rule_version != null ? asInt(header.delivery_rule_version, "delivery_rule_version") : null,
          first ? optionalText(header.delivery_quote_public_id) ?? null : null,
          fulfilmentUuid, new Date(input.now)
        ]);
        for (const line of group) await tx.query(`INSERT INTO fulfilment_order_lines(fulfilment_order_id,order_line_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, [fulfilUuid, line.lineUuid]);
        first = false;
      }

      const nextOrderStatus = rescueFailed ? "requires_customer_action" : orderStatus;
      await tx.query("UPDATE customer_orders SET status=$2,updated_at=$3 WHERE id=$1", [orderUuid, nextOrderStatus, new Date(input.now)]);
      await tx.query(`INSERT INTO order_timeline_events(id,public_id,order_id,fulfilment_order_id,vendor_id,event_type,actor_type,actor_user_id,actor_public_id,customer_visible,message,metadata,created_at)
        VALUES($1,$2,$3,$4,$5,'vendor_rejected','vendor',$6,$7,true,$8,$9::jsonb,$10)`, [
        randomUUID(), id("oev"), orderUuid, fulfilmentUuid, rejectedVendorUuid, actor, input.actorUserId,
        rescueFailed ? "Το κατάστημα δεν μπόρεσε να εκτελέσει μέρος της παραγγελίας. Απαιτείται ενέργεια από την πλατφόρμα." : "Η παραγγελία ανατέθηκε αυτόματα σε άλλο διαθέσιμο τοπικό κατάστημα.",
        JSON.stringify({ reason, rescuedLineIds: rescued.map((line) => line.lineId), rescueFailed }), new Date(input.now)
      ]);
      return this.#loadOrder(tx, orderId);
    });
  }

  async ordersForCustomer(customerId: string): Promise<readonly CustomerOrder[]> {
    return this.#uow.withTransaction({ actorUserId: customerId, marketId: "sparta", platformAccess: false }, async (tx) => {
      const user = await this.#userUuid(tx, customerId);
      const result = await tx.query<SqlRow>("SELECT public_id FROM customer_orders WHERE user_id=$1 ORDER BY created_at DESC", [user]);
      const orders: CustomerOrder[] = [];
      for (const row of result.rows) orders.push(await this.#loadOrder(tx, text(row.public_id, "order.public_id")));
      return orders;
    }, { readOnly: true });
  }

  async orderForCustomer(customerId: string, orderId: string): Promise<CustomerOrder | undefined> {
    return this.#uow.withTransaction({ actorUserId: customerId, marketId: "sparta", platformAccess: false }, async (tx) => {
      const user = await this.#userUuid(tx, customerId);
      const owned = await tx.query<SqlRow>("SELECT public_id FROM customer_orders WHERE public_id=$1 AND user_id=$2", [orderId, user]);
      if (!owned.rowCount) return undefined;
      return this.#loadOrder(tx, orderId);
    }, { readOnly: true });
  }

  async cancelCustomerOrder(input: { customerId: string; orderId: string; reason: string; now: number }): Promise<CustomerOrder> {
    if (input.reason.trim().length < 3 || input.reason.length > 500) throw new Error("Cancellation reason must be between 3 and 500 characters");
    return this.#withSerializableRetry({ actorUserId: input.customerId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const user = await this.#userUuid(tx, input.customerId);
      const order = await tx.query<SqlRow>("SELECT id::text AS id,status FROM customer_orders WHERE public_id=$1 AND user_id=$2 FOR UPDATE", [input.orderId, user]);
      if (!order.rowCount) throw new Error("ORDER_NOT_FOUND");
      const orderUuid = text(order.rows[0].id, "order.id");
      const status = text(order.rows[0].status, "order.status");
      if (status === "cancelled") return this.#loadOrder(tx, input.orderId);
      if (["fulfilled", "completed", "refunded"].includes(status)) throw new Error(`Order cannot be cancelled in ${status}`);
      const handed = await tx.query<SqlRow>("SELECT 1 AS hit FROM fulfilment_orders WHERE order_id=$1 AND status IN ('ready_for_handover','shipped','delivered') LIMIT 1", [orderUuid]);
      if (handed.rowCount) throw new Error("Order cancellation is no longer allowed after physical handover starts");
      const fulfilled = await tx.query<SqlRow>("SELECT 1 AS hit FROM order_lines WHERE order_id=$1 AND (fulfilled_quantity>refunded_quantity OR status='fulfilled') LIMIT 1", [orderUuid]);
      if (fulfilled.rowCount) throw new Error("Fulfilled items must use the return/withdrawal workflow");

      const reservations = await tx.query<SqlRow>("SELECT sr.public_id FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='active'", [orderUuid]);
      for (const reservation of reservations.rows) {
        await tx.query("SELECT release_stock_reservation((SELECT id FROM stock_reservations WHERE public_id=$1),$2,$3,$4)", [
          text(reservation.public_id, "reservation.public_id"), new Date(input.now), "customer_cancellation", user
        ]);
      }
      const consumed = await tx.query<SqlRow>(`SELECT sr.id::text AS reservation_uuid,sr.offer_id::text AS offer_uuid,sr.quantity
        FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='consumed'`,[orderUuid]);
      for(const reservation of consumed.rows){
        const quantity=asInt(reservation.quantity,"reservation.quantity"),offerUuid=text(reservation.offer_uuid,"offer_uuid"),reservationUuid=text(reservation.reservation_uuid,"reservation_uuid");
        const restored=await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,reservation_id,source,actor_id,metadata,created_at)
          SELECT gen_random_uuid(),$1,$2,'cancellation_restore',$3,$4,'order_cancellation',$5,$6::jsonb,$7
          WHERE NOT EXISTS (SELECT 1 FROM inventory_movements WHERE reservation_id=$4 AND movement_type='cancellation_restore')`,[id("im"),offerUuid,quantity,reservationUuid,user,JSON.stringify({orderId:input.orderId}),new Date(input.now)]);
        if(restored.rowCount) await tx.query(`UPDATE inventory_balances SET on_hand=on_hand+$2,updated_at=$3 WHERE offer_id=$1`,[offerUuid,quantity,new Date(input.now)]);
      }
      await tx.query("UPDATE order_lines SET status='cancelled' WHERE order_id=$1 AND status IN ('awaiting_vendor','accepted')", [orderUuid]);
      await tx.query("UPDATE fulfilment_orders SET status='cancelled',updated_at=$2 WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')", [orderUuid, new Date(input.now)]);
      await tx.query("UPDATE payments SET status=CASE WHEN status IN ('created','requires_action','authorised','failed') THEN 'cancelled' ELSE status END,updated_at=$2 WHERE order_id=$1", [orderUuid, new Date(input.now)]);
      await tx.query("UPDATE customer_orders SET status='cancelled',cancelled_at=$2,cancellation_reason=$3,updated_at=$2 WHERE id=$1", [orderUuid, new Date(input.now), input.reason.trim()]);
      return this.#loadOrder(tx, input.orderId);
    });
  }

  async publicVendorProfile(vendorId: string): Promise<PublicVendorProfile | undefined> {
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT id::text AS vendor_uuid,public_id,trading_name FROM vendor_businesses WHERE (public_id=$1 OR id::text=$1) AND status='active' LIMIT 1`, [vendorId]);
      const row = result.rows[0];
      if (!row) return undefined;
      return { id: text(row.public_id, "vendor.public_id"), name: text(row.trading_name, "vendor.trading_name"), adviser: await this.#adviserName(tx, text(row.vendor_uuid, "vendor_uuid")) };
    }, { readOnly: true });
  }

  async publicVendorCanonicals(vendorId: string, now = Date.now()): Promise<readonly PublicAssignedCatalogRecord[]> {
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const profile = await tx.query<SqlRow>(`SELECT id::text AS vendor_uuid,public_id,trading_name FROM vendor_businesses WHERE (public_id=$1 OR id::text=$1) AND status='active' LIMIT 1`, [vendorId]);
      const vendor = profile.rows[0];
      if (!vendor) return [];
      const vendorUuid = text(vendor.vendor_uuid, "vendor_uuid");
      const rows = await tx.query<CanonicalRow & SqlRow & { available_to_sell: number | string }>(`
        SELECT cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,m.id::text AS market_uuid,m.code AS market_code,c.code AS category_code,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title,cv.platform_price_minor,cv.currency,cv.tax_rate_bps,
               MAX(GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)) AS available_to_sell
        FROM vendor_offers vo JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id JOIN markets m ON m.id=cv.market_id JOIN categories c ON c.id=cv.category_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id JOIN vendor_locations l ON l.id=vo.location_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=$1 AND vo.status='approved' AND l.active=true AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $2
        GROUP BY cv.id,cv.public_id,m.id,m.code,c.code,el.title,en.title
        ORDER BY cv.public_id`, [vendorUuid, new Date(now)]);
      const adviser = await this.#adviserName(tx, vendorUuid);
      return rows.rows.map((row) => ({ ...this.#canonicalRecord(row), available: asInt(row.available_to_sell, "available_to_sell") > 0, availableToSell: asInt(row.available_to_sell, "available_to_sell"), vendorId: text(vendor.public_id, "vendor.public_id"), vendorName: text(vendor.trading_name, "vendor.trading_name"), adviser }));
    }, { readOnly: true });
  }

  async #canonical(tx: SqlExecutor, canonicalVariantId: string, marketId: string): Promise<CanonicalRow | undefined> {
    const result = await tx.query<CanonicalRow>(`
      SELECT cv.id::text AS canonical_uuid,cv.public_id AS canonical_public_id,m.id::text AS market_uuid,m.code AS market_code,c.code AS category_code,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS title,cv.platform_price_minor,cv.currency,cv.tax_rate_bps
      FROM canonical_variants cv JOIN markets m ON m.id=cv.market_id JOIN categories c ON c.id=cv.category_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE (cv.public_id=$1 OR cv.id::text=$1) AND (m.code=$2 OR m.id::text=$2)
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      LIMIT 1`, [canonicalVariantId, marketId]);
    return result.rows[0];
  }

  #canonicalRecord(row: CanonicalRow): PublicCatalogRecord {
    return {
      id: text(row.canonical_public_id, "canonical_public_id"), title: text(row.title, "title"), categoryCode: text(row.category_code, "category_code"),
      priceMinor: asInt(row.platform_price_minor, "platform_price_minor"), currency: "EUR", taxRateBps: asInt(row.tax_rate_bps, "tax_rate_bps")
    };
  }

  async #eligibleOffers(tx: SqlExecutor, canonical: CanonicalRow, postcode: string, mode: FulfilmentMode, quantity: number, now: number): Promise<OfferRow[]> {
    const result = await tx.query<OfferRow>(`
      SELECT vo.id::text AS offer_uuid,vo.public_id AS offer_public_id,v.id::text AS vendor_uuid,v.public_id AS vendor_public_id,
             v.trading_name AS vendor_name,l.id::text AS location_uuid,l.public_id AS location_public_id,
             vo.supplier_unit_price_minor,vo.supplier_tax_rate_bps,
             GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) AS available_to_sell,ib.stock_confirmed_at
      FROM vendor_offers vo JOIN vendor_businesses v ON v.id=vo.vendor_id JOIN vendor_locations l ON l.id=vo.location_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      LEFT JOIN LATERAL (
        SELECT r.max_open_fulfilments FROM fulfilment_capacity_rules r
        WHERE r.vendor_id=vo.vendor_id AND r.location_id=vo.location_id AND r.mode=$2 AND r.active=true
          AND r.starts_at <= $4 AND (r.ends_at IS NULL OR r.ends_at > $4)
        ORDER BY r.priority DESC,r.starts_at DESC,r.public_id LIMIT 1
      ) cap ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::integer AS open_count FROM fulfilment_orders fo JOIN customer_orders co ON co.id=fo.order_id
        WHERE fo.vendor_id=vo.vendor_id AND fo.location_id=vo.location_id AND fo.mode=$2
          AND fo.status=ANY($5::fulfilment_status[]) AND co.status <> 'pending_payment'
      ) load ON true
      WHERE vo.canonical_variant_id=$1 AND vo.status='approved' AND v.status='active' AND l.active=true
        AND $2=ANY(vo.fulfilment_modes)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked) >= $3
        AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds) > $4
        AND (cap.max_open_fulfilments IS NULL OR COALESCE(load.open_count,0)<cap.max_open_fulfilments)
        AND ($2::fulfilment_mode <> 'local_delivery' OR EXISTS(
          SELECT 1 FROM fulfilment_service_zones z
          WHERE z.market_id=$7 AND z.vendor_id=vo.vendor_id AND z.location_id=vo.location_id
            AND z.mode='local_delivery' AND z.active=true AND z.starts_at<=$4 AND (z.ends_at IS NULL OR z.ends_at>$4)
            AND (cardinality(z.postcode_prefixes)=0 OR EXISTS(SELECT 1 FROM unnest(z.postcode_prefixes) p WHERE $6 LIKE p||'%'))
        ))
      ORDER BY ib.stock_confirmed_at DESC,vo.public_id`, [
      text(canonical.canonical_uuid, "canonical_uuid"), mode, quantity, new Date(now), [...OPEN_FULFILMENT_STATUSES], postcode, text(canonical.market_uuid, "market_uuid")
    ]);
    return [...result.rows];
  }

  async #selectFairOffer(tx: SqlExecutor, input: { canonical: CanonicalRow; offers: readonly OfferRow[]; visitorHash: string; postcode: string; reason: string; now: number }): Promise<OfferRow> {
    const marketUuid = text(input.canonical.market_uuid, "market_uuid");
    const variantUuid = text(input.canonical.canonical_uuid, "canonical_uuid");
    const offerByUuid = new Map(input.offers.map((offer) => [text(offer.offer_uuid, "offer_uuid"), offer]));
    const sticky = await tx.query<SqlRow>(`SELECT offer_id::text AS offer_uuid,expires_at FROM sticky_assignments
      WHERE market_id=$1 AND canonical_variant_id=$2 AND visitor_hash=$3 AND postcode_scope=$4 AND released_at IS NULL AND expires_at>$5
      FOR UPDATE`, [marketUuid, variantUuid, input.visitorHash, input.postcode, new Date(input.now)]);
    const stickyOffer = sticky.rows[0] ? offerByUuid.get(text(sticky.rows[0].offer_uuid, "sticky.offer_uuid")) : undefined;
    if (stickyOffer) {
      await this.#recordFairnessEvent(tx, input, stickyOffer, true, {});
      return stickyOffer;
    }

    // Exactly one fairness ticket per vendor: freshest/best stable offer represents each vendor.
    const representatives = new Map<string, OfferRow>();
    for (const offer of input.offers) {
      const vendor = text(offer.vendor_uuid, "vendor_uuid");
      const existing = representatives.get(vendor);
      if (!existing || epoch(offer.stock_confirmed_at, "stock_confirmed_at") > epoch(existing.stock_confirmed_at, "stock_confirmed_at") ||
        (epoch(offer.stock_confirmed_at, "stock_confirmed_at") === epoch(existing.stock_confirmed_at, "stock_confirmed_at") && text(offer.offer_public_id, "offer_public_id") < text(existing.offer_public_id, "offer_public_id"))) {
        representatives.set(vendor, offer);
      }
    }
    const vendorUuids = [...representatives.keys()];
    const before = await tx.query<FairnessStateRow>(`SELECT s.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id,s.deficit,s.qualified_exposures
      FROM fairness_rotation_state s JOIN vendor_businesses v ON v.id=s.vendor_id
      WHERE s.market_id=$1 AND s.canonical_variant_id=$2 AND s.vendor_id=ANY($3::uuid[]) FOR UPDATE`, [marketUuid, variantUuid, vendorUuids]);
    const existing = new Map(before.rows.map((row) => [text(row.vendor_uuid, "vendor_uuid"), Number(row.deficit)]));
    const warmBaseline = existing.size ? Math.max(...existing.values()) : 0;
    for (const vendorUuid of vendorUuids) {
      if (existing.has(vendorUuid)) continue;
      await tx.query(`INSERT INTO fairness_rotation_state(market_id,canonical_variant_id,vendor_id,deficit,qualified_exposures,capacity_weight,updated_at)
        VALUES($1,$2,$3,$4,0,1,$5) ON CONFLICT DO NOTHING`, [marketUuid, variantUuid, vendorUuid, warmBaseline + 0.25, new Date(input.now)]);
    }
    const locked = await tx.query<FairnessStateRow>(`SELECT s.vendor_id::text AS vendor_uuid,v.public_id AS vendor_public_id,s.deficit,s.qualified_exposures
      FROM fairness_rotation_state s JOIN vendor_businesses v ON v.id=s.vendor_id
      WHERE s.market_id=$1 AND s.canonical_variant_id=$2 AND s.vendor_id=ANY($3::uuid[]) FOR UPDATE`, [marketUuid, variantUuid, vendorUuids]);
    const increment = 1 / Math.max(1, vendorUuids.length);
    const deficits = new Map<string, number>();
    for (const row of locked.rows) deficits.set(text(row.vendor_uuid, "vendor_uuid"), Number(row.deficit) + increment);
    const sorted = [...representatives.entries()].sort(([vendorA, offerA], [vendorB, offerB]) => {
      const deficitDiff = (deficits.get(vendorB) ?? 0) - (deficits.get(vendorA) ?? 0);
      if (Math.abs(deficitDiff) > 1e-12) return deficitDiff;
      const freshDiff = epoch(offerB.stock_confirmed_at, "stock_confirmed_at") - epoch(offerA.stock_confirmed_at, "stock_confirmed_at");
      if (freshDiff) return freshDiff;
      return deterministicTie({ variantId: text(input.canonical.canonical_public_id, "canonical_public_id"), postcode: input.postcode, now: input.now, vendorId: text(offerA.vendor_public_id, "vendor_public_id") })
        .localeCompare(deterministicTie({ variantId: text(input.canonical.canonical_public_id, "canonical_public_id"), postcode: input.postcode, now: input.now, vendorId: text(offerB.vendor_public_id, "vendor_public_id") }));
    });
    const [selectedVendorUuid, selected] = sorted[0];
    deficits.set(selectedVendorUuid, (deficits.get(selectedVendorUuid) ?? 0) - 1);
    for (const vendorUuid of vendorUuids) {
      await tx.query(`UPDATE fairness_rotation_state SET deficit=$4,qualified_exposures=qualified_exposures+$5,updated_at=$6
        WHERE market_id=$1 AND canonical_variant_id=$2 AND vendor_id=$3`, [marketUuid, variantUuid, vendorUuid, deficits.get(vendorUuid) ?? 0, vendorUuid === selectedVendorUuid ? 1 : 0, new Date(input.now)]);
    }
    await tx.query(`INSERT INTO sticky_assignments(id,public_id,market_id,canonical_variant_id,visitor_hash,postcode_scope,offer_id,reason,locked_at,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT(market_id,canonical_variant_id,visitor_hash,postcode_scope)
      DO UPDATE SET offer_id=EXCLUDED.offer_id,reason=EXCLUDED.reason,locked_at=EXCLUDED.locked_at,expires_at=EXCLUDED.expires_at,released_at=NULL,release_reason=NULL`, [
      randomUUID(), id("sticky"), marketUuid, variantUuid, input.visitorHash, input.postcode, text(selected.offer_uuid, "offer_uuid"), input.reason, new Date(input.now), new Date(input.now + STICKY_MS)
    ]);
    await this.#recordFairnessEvent(tx, input, selected, false, Object.fromEntries([...deficits.entries()].map(([uuid, deficit]) => [text(representatives.get(uuid)!.vendor_public_id, "vendor_public_id"), deficit])));
    return selected;
  }

  async #recordFairnessEvent(tx: SqlExecutor, input: { canonical: CanonicalRow; offers: readonly OfferRow[]; visitorHash: string; postcode: string; reason: string; now: number }, selected: OfferRow, sticky: boolean, deficits: Record<string, number>): Promise<void> {
    const eligibleVendorUuids = [...new Set(input.offers.map((offer) => text(offer.vendor_uuid, "vendor_uuid")))];
    const eligibility = Object.fromEntries(input.offers.map((offer) => [text(offer.offer_public_id, "offer_public_id"), { eligible: true, reasons: [] }]));
    await tx.query(`INSERT INTO fairness_assignment_events(id,public_id,market_id,canonical_variant_id,selected_offer_id,selected_vendor_id,visitor_hash,postcode_scope,reason,eligible_vendor_ids,eligibility_snapshot,deficit_snapshot,tie_break,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::uuid[],$11::jsonb,$12::jsonb,$13::jsonb,$14)`, [
      randomUUID(), id("fae"), text(input.canonical.market_uuid, "market_uuid"), text(input.canonical.canonical_uuid, "canonical_uuid"),
      text(selected.offer_uuid, "offer_uuid"), text(selected.vendor_uuid, "vendor_uuid"), input.visitorHash, input.postcode, input.reason,
      eligibleVendorUuids, JSON.stringify(eligibility), JSON.stringify(deficits), JSON.stringify({ reusedStickyAssignment: sticky }), new Date(input.now)
    ]);
  }

  async #deliveryQuote(tx: SqlExecutor, input: { marketUuid: string; vendorUuid: string; vendorPublicId: string; mode: FulfilmentMode; postcode: string; merchandiseMinor: number; now: number }) {
    if (input.mode === "pickup") return { chargeMinor: 0, waivedMinor: 0 };
    const rule = await tx.query<SqlRow>(`SELECT public_id,version,base_charge_minor,additional_package_charge_minor,free_above_subtotal_minor,minimum_subtotal_minor
      FROM delivery_rules WHERE market_id=$1 AND mode=$2 AND active=true AND starts_at<=$3 AND (ends_at IS NULL OR ends_at>$3)
        AND (vendor_id IS NULL OR vendor_id=$4)
        AND (cardinality(postcode_prefixes)=0 OR EXISTS(SELECT 1 FROM unnest(postcode_prefixes) p WHERE $5 LIKE p||'%'))
      ORDER BY (CASE WHEN vendor_id IS NOT NULL THEN 4 ELSE 0 END + CASE WHEN cardinality(postcode_prefixes)>0 THEN 2 ELSE 0 END) DESC,
               priority DESC,version DESC,public_id LIMIT 1`, [input.marketUuid, input.mode, new Date(input.now), input.vendorUuid, input.postcode]);
    if (!rule.rowCount) return { chargeMinor: 0, waivedMinor: 0 };
    const row = rule.rows[0];
    const minimum = row.minimum_subtotal_minor == null ? undefined : asInt(row.minimum_subtotal_minor, "minimum_subtotal_minor");
    if (minimum !== undefined && input.merchandiseMinor < minimum) throw new Error(`Delivery subtotal must be at least ${minimum} minor units for vendor ${input.vendorPublicId}`);
    const standard = asInt(row.base_charge_minor, "base_charge_minor");
    const freeAbove = row.free_above_subtotal_minor == null ? undefined : asInt(row.free_above_subtotal_minor, "free_above_subtotal_minor");
    const free = freeAbove !== undefined && input.merchandiseMinor >= freeAbove;
    return { chargeMinor: free ? 0 : standard, waivedMinor: free ? standard : 0, ruleId: text(row.public_id, "delivery_rule.public_id"), ruleVersion: asInt(row.version, "delivery_rule.version") };
  }

  async #adviserName(tx: SqlExecutor, vendorUuid: string): Promise<string | undefined> {
    const result = await tx.query<SqlRow>(`SELECT COALESCE(NULLIF(display_name,''),NULLIF(job_title,''),'Local adviser') AS name
      FROM adviser_profiles WHERE vendor_id=$1 AND active=true ORDER BY created_at,public_id LIMIT 1`, [vendorUuid]);
    return optionalText(result.rows[0]?.name);
  }

  async #loadOrder(tx: SqlExecutor, orderId: string): Promise<CustomerOrder> {
    const orderResult = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.public_id,o.checkout_key,o.visitor_hash,o.status,o.currency,o.subtotal_minor,o.shipping_minor,o.discount_minor,o.total_minor,
      o.fulfilment_preference,o.created_at,o.cancelled_at,o.cancellation_reason,m.code AS market_code,u.public_id AS customer_public_id,
      COALESCE((o.shipping_address_snapshot->>'postcode'),(o.billing_address_snapshot->>'postcode'),'23100') AS postcode,
      p.public_id AS payment_public_id
      FROM customer_orders o JOIN markets m ON m.id=o.market_id LEFT JOIN users u ON u.id=o.user_id
      LEFT JOIN payments p ON p.order_id=o.id WHERE o.public_id=$1 LIMIT 1`, [orderId]);
    if (!orderResult.rowCount) throw new Error("Order not found");
    const o = orderResult.rows[0];
    const orderUuid = text(o.order_uuid, "order_uuid");
    const linesResult = await tx.query<SqlRow>(`SELECT ol.public_id,cv.public_id AS canonical_public_id,vo.public_id AS offer_public_id,v.public_id AS vendor_public_id,l.public_id AS location_public_id,
      ol.quantity,ol.product_snapshot,ol.retail_unit_price_minor,ol.tax_rate_bps,ol.supplier_unit_price_minor,ol.supplier_tax_rate_bps,ol.status,
      ol.fulfilled_quantity,ol.refunded_quantity,ol.fulfilled_at,ol.adjustment_refunded_minor,ol.pricing_source,ol.discount_allocation_minor,
      sr.public_id AS reservation_public_id
      FROM order_lines ol JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id JOIN vendor_offers vo ON vo.id=ol.assigned_offer_id
      JOIN vendor_businesses v ON v.id=ol.vendor_id JOIN vendor_locations l ON l.id=ol.location_id
      LEFT JOIN stock_reservations sr ON sr.order_line_id=ol.id WHERE ol.order_id=$1 ORDER BY ol.created_at,ol.public_id`, [orderUuid]);
    const lines: OrderLine[] = linesResult.rows.map((row) => {
      const snap = typeof row.product_snapshot === "string" ? JSON.parse(row.product_snapshot) : (row.product_snapshot ?? {}) as Record<string, unknown>;
      return {
        id: text(row.public_id, "line.public_id"), canonicalVariantId: text(row.canonical_public_id, "canonical_public_id"), titleSnapshot: typeof snap.title === "string" ? snap.title : text(row.canonical_public_id, "canonical_public_id"),
        quantity: asInt(row.quantity, "line.quantity"), retailUnitPrice: money(asInt(row.retail_unit_price_minor, "retail_unit_price_minor")), taxRateBps: asInt(row.tax_rate_bps, "tax_rate_bps"),
        categoryCodeSnapshot: typeof snap.categoryCode === "string" ? snap.categoryCode : undefined, pricingSource: text(row.pricing_source, "pricing_source") as OrderLine["pricingSource"],
        discountAllocation: money(asInt(row.discount_allocation_minor ?? 0, "discount_allocation_minor")), supplierUnitPrice: money(asInt(row.supplier_unit_price_minor, "supplier_unit_price_minor")),
        supplierTaxRateBps: asInt(row.supplier_tax_rate_bps, "supplier_tax_rate_bps"), fulfilledQuantity: asInt(row.fulfilled_quantity ?? 0, "fulfilled_quantity"),
        fulfilledAt: row.fulfilled_at ? epoch(row.fulfilled_at, "fulfilled_at") : undefined, refundedQuantity: asInt(row.refunded_quantity ?? 0, "refunded_quantity"),
        adjustmentRefundedAmount: money(asInt(row.adjustment_refunded_minor ?? 0, "adjustment_refunded_minor")), assignedOfferId: text(row.offer_public_id, "offer_public_id"),
        vendorId: text(row.vendor_public_id, "vendor_public_id"), locationId: text(row.location_public_id, "location_public_id"), reservationId: optionalText(row.reservation_public_id) ?? "",
        status: text(row.status, "line.status") as OrderLine["status"]
      };
    });
    const fulfilmentResult = await tx.query<SqlRow>(`SELECT fo.id::text AS fulfil_uuid,fo.public_id,v.public_id AS vendor_public_id,l.public_id AS location_public_id,fo.status,
      fo.merchandise_subtotal_minor,fo.delivery_charge_minor,fo.waived_delivery_minor,dr.public_id AS rule_public_id,fo.delivery_rule_version,fo.delivery_quote_public_id,fo.delivered_at,
      COALESCE(array_agg(ol.public_id ORDER BY ol.public_id) FILTER (WHERE ol.public_id IS NOT NULL),'{}') AS line_ids
      FROM fulfilment_orders fo JOIN vendor_businesses v ON v.id=fo.vendor_id JOIN vendor_locations l ON l.id=fo.location_id
      LEFT JOIN delivery_rules dr ON dr.id=fo.delivery_rule_id LEFT JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id LEFT JOIN order_lines ol ON ol.id=fol.order_line_id
      WHERE fo.order_id=$1 GROUP BY fo.id,v.public_id,l.public_id,dr.public_id ORDER BY fo.created_at,fo.public_id`, [orderUuid]);
    const paymentId = optionalText(o.payment_public_id) ?? "";
    return {
      id: text(o.public_id, "order.public_id"), checkoutKey: text(o.checkout_key, "checkout_key"), visitorKey: text(o.visitor_hash, "visitor_hash"), customerId: optionalText(o.customer_public_id),
      marketId: text(o.market_code, "market_code"), postcode: text(o.postcode, "postcode"), fulfilmentMode: text(o.fulfilment_preference, "fulfilment_preference") as FulfilmentMode,
      status: text(o.status, "order.status") as CustomerOrder["status"], lines,
      fulfilments: fulfilmentResult.rows.map((row) => ({
        id: text(row.public_id, "fulfilment.public_id"), vendorId: text(row.vendor_public_id, "vendor_public_id"), locationId: text(row.location_public_id, "location_public_id"),
        lineIds: Array.isArray(row.line_ids) ? row.line_ids.map(String) : [], merchandiseSubtotal: money(asInt(row.merchandise_subtotal_minor ?? 0, "merchandise_subtotal_minor")),
        deliveryCharge: money(asInt(row.delivery_charge_minor ?? 0, "delivery_charge_minor")), waivedDeliveryAmount: money(asInt(row.waived_delivery_minor ?? 0, "waived_delivery_minor")),
        deliveryRuleId: optionalText(row.rule_public_id), deliveryRuleVersion: row.delivery_rule_version == null ? undefined : asInt(row.delivery_rule_version, "delivery_rule_version"),
        deliveryQuoteId: optionalText(row.delivery_quote_public_id), status: text(row.status, "fulfilment.status") as CustomerOrder["fulfilments"][number]["status"],
        deliveredAt: row.delivered_at ? epoch(row.delivered_at, "delivered_at") : undefined
      })),
      paymentId, merchandiseSubtotal: money(asInt(o.subtotal_minor, "subtotal_minor")), discount: money(asInt(o.discount_minor, "discount_minor")),
      deliveryCharge: money(asInt(o.shipping_minor, "shipping_minor")), total: money(asInt(o.total_minor, "total_minor")), createdAt: epoch(o.created_at, "created_at"),
      cancelledAt: o.cancelled_at ? epoch(o.cancelled_at, "cancelled_at") : undefined, cancellationReason: optionalText(o.cancellation_reason)
    };
  }

  async #userUuid(tx: SqlExecutor, customerId: string): Promise<string> {
    const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1", [customerId]);
    if (!result.rowCount) throw new Error(`Customer ${customerId} not found`);
    return text(result.rows[0].id, "user.id");
  }

  async #marketUuid(tx: SqlExecutor, marketId: string): Promise<string> {
    const result = await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code=$1 OR id::text=$1", [marketId]);
    if (!result.rowCount) throw new Error(`Market ${marketId} not found`);
    return text(result.rows[0].id, "market.id");
  }

  #validateCheckout(input: PostgresCheckoutInput): void {
    if (!/^[A-Za-z0-9-]{16,128}$/.test(input.checkoutKey)) throw new Error("Invalid checkout key");
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.visitorKey)) throw new Error("Invalid visitor identity");
    if (!/^\d{5}$/.test(input.postcode)) throw new Error("A five-digit Greek postcode is required");
    if (!["pickup", "local_delivery", "shipping", "bulky_special"].includes(input.fulfilmentMode)) throw new Error("Invalid fulfilment mode");
    if (input.items.length === 0 || input.items.length > 100) throw new Error("Checkout requires between 1 and 100 items");
    const seen = new Set<string>();
    for (const item of input.items) {
      if (!item.canonicalVariantId.trim() || item.canonicalVariantId.length > 128) throw new Error("Invalid canonical product id");
      if (seen.has(item.canonicalVariantId)) throw new Error("Checkout must consolidate duplicate canonical products");
      seen.add(item.canonicalVariantId);
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > 99) throw new Error("Invalid checkout quantity");
    }
  }

  async #withSerializableRetry<T>(scope: DatabaseScope, work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    let last: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.#uow.withTransaction(scope, work, { isolation: "serializable" });
      } catch (error) {
        last = error;
        const code = typeof error === "object" && error && "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
        if (code !== "40001" && code !== "40P01") throw error;
      }
    }
    throw last;
  }
}
