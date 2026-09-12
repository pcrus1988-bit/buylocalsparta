import { createHash, randomUUID } from "node:crypto";
import { id, money, splitGrossTax, type CustomerOrder, type FulfilmentMode } from "@buy-local-sparta/core";
import { revalidateNovaCheckoutStock } from "../../../../integrations/dropship-suppliers/src/nova-checkout-revalidation.ts";
import { NovaV1Client, novaApiKeyFromEnvironment } from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const NOVA_SUPPLIER_CODE = "nova_brandsgateway";

type DropshipCheckoutInput = Readonly<{
  checkoutKey: string;
  visitorKey: string;
  customerId?: string;
  postcode: string;
  fulfilmentMode: FulfilmentMode;
  items: readonly Readonly<{ canonicalVariantId: string; quantity: number }>[];
  now: number;
}>;

type DropshipOfferRow = Readonly<{
  canonical_uuid: string;
  canonical_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  tax_rate_bps: number | string;
  offer_uuid: string;
  offer_public_id: string;
  customer_price_minor: number | string;
  cost_ceiling_minor: number | string | null;
  fulfilment_modes: string[];
  vendor_uuid: string;
  vendor_public_id: string;
  location_uuid: string;
  location_public_id: string;
  supplier_uuid: string;
  supplier_code: string;
  store_id: string | null;
  supplier_offer_uuid: string;
  external_product_id: string;
  external_variant_id: string;
  supplier_cost_minor: number | string | null;
  cached_quantity: number | string | null;
}>;

type ValidatedLine = Readonly<{
  row: DropshipOfferRow;
  quantity: number;
  supplierCostMinor: number;
  revalidatedAt: number;
}>;

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeInt(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

function checkoutFingerprint(input: DropshipCheckoutInput): string {
  return hash(JSON.stringify({
    visitorHash: hash(input.visitorKey),
    customerId: input.customerId ?? null,
    marketId: "sparta",
    postcode: input.postcode,
    fulfilmentMode: input.fulfilmentMode,
    items: [...input.items]
      .map((item) => ({ canonicalVariantId: item.canonicalVariantId, quantity: item.quantity }))
      .sort((a, b) => a.canonicalVariantId.localeCompare(b.canonicalVariantId))
  }));
}

function orderNumber(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  return `BLS-${day}-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`;
}

/**
 * Checkout authority for carts made entirely from API-authoritative NOVA offers.
 *
 * Supplier cache is only used to discover the exact published offer. The exact
 * NOVA variation is then revalidated live before an order is created. This path
 * deliberately does not manufacture inventory_balances or local stock reservations.
 * Local-only carts return undefined and continue through the normal commerce service.
 * Mixed local+dropship carts fail closed until one atomic mixed reservation protocol
 * is implemented rather than silently creating a partially protected order.
 */
export async function checkoutApiAuthoritativeDropship(
  input: DropshipCheckoutInput
): Promise<CustomerOrder | undefined> {
  if (!input.customerId || input.items.length === 0) return undefined;

  const runtime = getProductionPostgresRuntime();
  const requestedIds = [...new Set(input.items.map((item) => item.canonicalVariantId))];
  const discovery = await runtime.nativePool.query<DropshipOfferRow>(`
    SELECT DISTINCT ON (cv.id)
      cv.id::text AS canonical_uuid,
      cv.public_id AS canonical_public_id,
      cv.slug,
      COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
      c.code AS category_code,
      cv.tax_rate_bps,
      vo.id::text AS offer_uuid,
      vo.public_id AS offer_public_id,
      vo.customer_price_minor,
      vo.cost_ceiling_minor,
      vo.fulfilment_modes::text[] AS fulfilment_modes,
      v.id::text AS vendor_uuid,
      v.public_id AS vendor_public_id,
      l.id::text AS location_uuid,
      l.public_id AS location_public_id,
      ds.id::text AS supplier_uuid,
      ds.code AS supplier_code,
      COALESCE(ds.configuration->>'storeId','2') AS store_id,
      dso.id::text AS supplier_offer_uuid,
      dso.external_product_id,
      dso.external_variant_id,
      dso.supplier_cost_minor,
      dso.cached_quantity
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN markets m ON m.id=cv.market_id
    JOIN categories c ON c.id=cv.category_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
    JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
    LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
    LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
    WHERE cv.public_id=ANY($1::text[])
      AND m.code='sparta'
      AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
      AND vo.status='approved'
      AND vo.merchant_visible=true
      AND vo.merchant_pause_active=false
      AND vo.customer_price_minor>0
      AND v.status='active'
      AND l.active=true
      AND dso.active=true
      AND ds.active=true
      AND ds.api_authoritative_availability=true
      AND dso.cached_available=true
      AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
      AND dso.availability_expires_at IS NOT NULL
      AND dso.availability_expires_at>now()
      AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
    ORDER BY cv.id,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
  `, [requestedIds]);

  if (discovery.rows.length === 0) return undefined;
  if (discovery.rows.length !== requestedIds.length) {
    throw new Error("Το καλάθι συνδυάζει τοπικά και dropshipping προϊόντα. Η μικτή ολοκλήρωση αγοράς δεν ενεργοποιείται μέχρι να μπορεί να δεσμεύει και τα δύο είδη αποθέματος ατομικά.");
  }

  const byCanonical = new Map(discovery.rows.map((row) => [row.canonical_public_id, row] as const));
  const client = new NovaV1Client({ apiKey: novaApiKeyFromEnvironment() });
  const validated: ValidatedLine[] = [];

  for (const item of input.items) {
    const row = byCanonical.get(item.canonicalVariantId);
    if (!row) throw new Error(`Dropshipping offer missing for ${item.canonicalVariantId}`);
    if (!row.fulfilment_modes.includes(input.fulfilmentMode)) {
      throw new Error("Ο επιλεγμένος τρόπος παράδοσης δεν υποστηρίζεται για ένα dropshipping προϊόν.");
    }
    if (input.fulfilmentMode === "pickup") {
      throw new Error("Τα dropshipping προϊόντα αποστέλλονται στη διεύθυνσή σου και δεν υποστηρίζουν παραλαβή από τοπικό κατάστημα.");
    }
    if (input.fulfilmentMode === "shipping") {
      throw new Error("Για dropshipping προϊόντα επίλεξε «Παράδοση στη διεύθυνσή σου» αντί για BOX NOW locker.");
    }
    if (row.supplier_code !== NOVA_SUPPLIER_CODE) {
      throw new Error(`Unsupported API-authoritative dropship supplier ${row.supplier_code}`);
    }

    const evidence = await revalidateNovaCheckoutStock(client, {
      storeId: row.store_id?.trim() || "2",
      externalProductId: row.external_product_id,
      externalVariantId: row.external_variant_id,
      quantity: item.quantity
    });
    if (!evidence.eligible || evidence.availableQuantity === null || evidence.availableQuantity < item.quantity) {
      throw new Error("Η διαθεσιμότητα του προμηθευτή άλλαξε. Ανανέωσε το προϊόν και δοκίμασε ξανά.");
    }
    if (evidence.supplierCostMinor === null) {
      throw new Error("Ο προμηθευτής δεν επέστρεψε έγκυρη τιμή αγοράς. Η παραγγελία δεν δημιουργήθηκε.");
    }
    const ceiling = row.cost_ceiling_minor == null ? null : safeInt(row.cost_ceiling_minor, "dropship cost ceiling");
    if (ceiling !== null && evidence.supplierCostMinor > ceiling) {
      throw new Error("Η τιμή του προμηθευτή άλλαξε και η πώληση δεν περνά πλέον τον κανόνα κερδοφορίας. Η παραγγελία δεν δημιουργήθηκε.");
    }
    validated.push({ row, quantity: item.quantity, supplierCostMinor: evidence.supplierCostMinor, revalidatedAt: evidence.checkedAt });
  }

  const db = await runtime.nativePool.connect();
  let orderPublicId = "";
  try {
    await db.query("BEGIN ISOLATION LEVEL SERIALIZABLE");

    const existing = await db.query<{ public_id: string; checkout_fingerprint: string; visitor_hash: string }>(
      "SELECT public_id,checkout_fingerprint,visitor_hash FROM customer_orders WHERE checkout_key=$1 FOR UPDATE",
      [input.checkoutKey]
    );
    const fingerprint = checkoutFingerprint(input);
    if (existing.rowCount) {
      const row = existing.rows[0]!;
      if (row.checkout_fingerprint !== fingerprint || row.visitor_hash !== hash(input.visitorKey)) {
        throw new Error("Checkout idempotency key was already used with different order data");
      }
      orderPublicId = row.public_id;
      await db.query("COMMIT");
      const prior = await runtime.customerCommerce.orderForCustomer(input.customerId, orderPublicId);
      if (!prior) throw new Error("Existing dropshipping order could not be loaded");
      return prior;
    }

    const customer = await db.query<{ id: string }>(
      "SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1",
      [input.customerId]
    );
    const customerUuid = customer.rows[0]?.id;
    if (!customerUuid) throw new Error("Customer account not found");
    const market = await db.query<{ id: string }>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
    const marketUuid = market.rows[0]?.id;
    if (!marketUuid) throw new Error("Sparta market not found");

    const subtotalMinor = validated.reduce((sum, line) => sum + safeInt(line.row.customer_price_minor, "customer price") * line.quantity, 0);
    const taxMinor = validated.reduce((sum, line) => {
      const retail = safeInt(line.row.customer_price_minor, "customer price") * line.quantity;
      return sum + splitGrossTax(money(retail), safeInt(line.row.tax_rate_bps, "tax rate")).tax.minor;
    }, 0);
    const orderUuid = randomUUID();
    orderPublicId = id("ord");
    const createdAt = new Date(input.now);

    await db.query(`
      INSERT INTO customer_orders(
        id,public_id,order_number,market_id,user_id,visitor_hash,checkout_key,checkout_fingerprint,status,currency,
        subtotal_minor,shipping_minor,discount_minor,tax_minor,total_minor,billing_address_snapshot,shipping_address_snapshot,
        fulfilment_preference,partial_fulfilment_allowed,terms_version,created_at,updated_at
      ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'pending_payment','EUR',$9,0,0,$10,$9,'{}'::jsonb,'{}'::jsonb,$11,false,'terms-v1',$12,$12)
    `, [
      orderUuid,
      orderPublicId,
      orderNumber(input.now),
      marketUuid,
      customerUuid,
      hash(input.visitorKey),
      input.checkoutKey,
      fingerprint,
      subtotalMinor,
      taxMinor,
      input.fulfilmentMode,
      createdAt
    ]);

    const fulfilmentGroups = new Map<string, { vendorUuid: string; locationUuid: string; lineUuids: string[]; merchandiseMinor: number }>();
    for (const line of validated) {
      const row = line.row;
      const lineUuid = randomUUID();
      const linePublicId = id("line");
      const retailMinor = safeInt(row.customer_price_minor, "customer price");
      const taxRateBps = safeInt(row.tax_rate_bps, "tax rate");
      const lineTax = splitGrossTax(money(retailMinor * line.quantity), taxRateBps).tax.minor;
      await db.query(`
        INSERT INTO order_lines(
          id,public_id,order_id,canonical_variant_id,assigned_offer_id,vendor_id,location_id,quantity,product_snapshot,
          retail_unit_price_minor,tax_rate_bps,tax_minor,supplier_unit_price_minor,supplier_tax_rate_bps,shipping_promise_snapshot,
          attribution_snapshot,status,fulfilled_quantity,refunded_quantity,adjustment_refunded_minor,pricing_source,discount_allocation_minor,created_at
        ) VALUES(
          $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$11,$14::jsonb,$15::jsonb,
          'awaiting_vendor',0,0,0,'catalog',0,$16
        )
      `, [
        lineUuid,
        linePublicId,
        orderUuid,
        row.canonical_uuid,
        row.offer_uuid,
        row.vendor_uuid,
        row.location_uuid,
        line.quantity,
        JSON.stringify({ title: row.title, categoryCode: row.category_code, pricingSource: "catalog", dropshipSupplier: row.supplier_code }),
        retailMinor,
        taxRateBps,
        lineTax,
        retailMinor,
        JSON.stringify({ postcode: input.postcode, mode: input.fulfilmentMode, supplier: row.supplier_code, externalVariantId: row.external_variant_id, revalidatedAt: new Date(line.revalidatedAt).toISOString() }),
        JSON.stringify({ assignedOfferId: row.offer_public_id, vendorId: row.vendor_public_id, fairness: "api_authoritative_dropship" }),
        createdAt
      ]);

      const groupKey = `${row.vendor_uuid}|${row.location_uuid}`;
      const group = fulfilmentGroups.get(groupKey) ?? { vendorUuid: row.vendor_uuid, locationUuid: row.location_uuid, lineUuids: [], merchandiseMinor: 0 };
      group.lineUuids.push(lineUuid);
      group.merchandiseMinor += retailMinor * line.quantity;
      fulfilmentGroups.set(groupKey, group);
    }

    for (const group of fulfilmentGroups.values()) {
      const fulfilmentUuid = randomUUID();
      const fulfilmentPublicId = id("ful");
      await db.query(`
        INSERT INTO fulfilment_orders(
          id,public_id,fulfilment_number,order_id,vendor_id,location_id,mode,status,merchandise_subtotal_minor,
          delivery_charge_minor,waived_delivery_minor,delivery_rule_id,delivery_rule_version,delivery_quote_public_id,created_at,updated_at
        ) VALUES($1,$2,$3,$4,$5,$6,$7,'awaiting_acceptance',$8,0,0,NULL,NULL,NULL,$9,$9)
      `, [
        fulfilmentUuid,
        fulfilmentPublicId,
        `FUL-${fulfilmentPublicId.slice(-12).toUpperCase()}`,
        orderUuid,
        group.vendorUuid,
        group.locationUuid,
        input.fulfilmentMode,
        group.merchandiseMinor,
        createdAt
      ]);
      for (const lineUuid of group.lineUuids) {
        await db.query("INSERT INTO fulfilment_order_lines(fulfilment_order_id,order_line_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [fulfilmentUuid, lineUuid]);
      }
    }

    await db.query("SELECT bls_private.recalculate_order_financials($1::uuid)", [orderUuid]);
    const paymentPublicId = id("pay");
    await db.query(`
      INSERT INTO payments(
        id,public_id,order_id,provider,provider_payment_id,idempotency_key,status,currency,authorised_minor,captured_minor,refunded_minor,created_at,updated_at
      ) VALUES($1,$2,$3,'pending_psp',NULL,$4,'created','EUR',0,0,0,$5,$5)
    `, [randomUUID(), paymentPublicId, orderUuid, `checkout:${input.checkoutKey}`, createdAt]);

    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }

  const order = await runtime.customerCommerce.orderForCustomer(input.customerId, orderPublicId);
  if (!order) throw new Error("Dropshipping order was created but could not be loaded");
  return order;
}

export async function freshDropshipCartOffer(
  canonicalVariantId: string,
  quantity: number
): Promise<Readonly<{ priceMinor: number; available: boolean }> | undefined> {
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<{ customer_price_minor: number | string; cached_quantity: number | string | null }>(`
    SELECT vo.customer_price_minor,dso.cached_quantity
      FROM vendor_offers vo
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
     WHERE cv.public_id=$1
       AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
       AND vo.status='approved' AND vo.merchant_visible=true AND vo.merchant_pause_active=false
       AND vo.customer_price_minor>0
       AND v.status='active' AND l.active=true
       AND dso.active=true AND ds.active=true AND ds.api_authoritative_availability=true
       AND dso.cached_available=true
       AND (dso.cached_quantity IS NULL OR dso.cached_quantity >= $2)
       AND dso.availability_expires_at IS NOT NULL AND dso.availability_expires_at>now()
       AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
     ORDER BY dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC
     LIMIT 1
  `, [canonicalVariantId, quantity]);
  if (!result.rowCount) return undefined;
  return {
    priceMinor: safeInt(result.rows[0]!.customer_price_minor, "dropship customer price"),
    available: result.rows[0]!.cached_quantity == null || safeInt(result.rows[0]!.cached_quantity, "dropship quantity") >= quantity
  };
}
