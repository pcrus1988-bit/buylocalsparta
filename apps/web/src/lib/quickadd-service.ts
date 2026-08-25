import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { flexibleQuickAddSearch } from "./quickadd-flex-search";
import { attachMissingQuickAddGtin } from "./quickadd-gtin-service";
import { postgresVendorRuntimeEnabled } from "./vendor-runtime";
import type { VendorCanonicalPrefillMatch } from "./vendor-canonical-prefill-service";
import { vendorCatalogControlWorkspace, type VendorManagedCatalogProduct } from "./vendor-catalog-control-service";

export type QuickAddMatch = VendorCanonicalPrefillMatch & Readonly<{
  imageUrl?: string;
  listed?: VendorManagedCatalogProduct;
}>;

export type QuickAddSaveInput = Readonly<{
  canonicalVariantId: string;
  gtin?: string;
  vendorSku?: string;
  customerPriceMinor: number;
  onHand: number;
  safetyStock?: number;
  visible?: boolean;
  adviceAvailable?: boolean;
}>;

const clean = (value: unknown) => typeof value === "string" ? value.trim() : "";
const safeInt = (value: unknown, field: string) => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
};
function requiredVendorId(principal: SessionPrincipal) {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}
function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}
function vendorScope(principal: SessionPrincipal) {
  return { actorUserId: principal.userId, vendorId: requiredVendorId(principal), marketId: "sparta" } as const;
}

export async function quickAddLookup(principal: SessionPrincipal, input: { gtin?: string; q?: string; limit?: number }) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Quick Add requires the PostgreSQL vendor runtime");
  const rawGtin = clean(input.gtin);
  const gtin = rawGtin.replace(/\D/g, "");
  const q = clean(input.q) || rawGtin;
  const limit = Math.min(8, Math.max(1, Math.floor(input.limit ?? 6)));

  const flexible = await uow().withTransaction(vendorScope(principal), async (tx) =>
    flexibleQuickAddSearch(tx, { vendorId: requiredVendorId(principal), query: q, code: gtin, limit }),
  { readOnly: true });

  const matches: QuickAddMatch[] = flexible.map((match) => ({
    canonicalVariantId: match.canonicalVariantId,
    title: match.title,
    gtin: match.gtin,
    description: match.description,
    brand: match.brand,
    model: match.model,
    mpn: match.mpn,
    imageUrl: match.imageUrl,
    categoryCode: match.categoryCode,
    categoryName: match.categoryPath.split(" › ").at(-1) ?? match.categoryCode,
    categoryPath: match.categoryPath,
    specifications: match.specifications,
    variantAttributes: match.variantAttributes,
    score: match.score
  }));

  const workspace = await vendorCatalogControlWorkspace(principal);
  const byCanonical = new Map(workspace.catalogProducts.map((item) => [item.canonicalVariantId, item]));
  const byGtin = new Map(workspace.catalogProducts.filter((item) => item.gtin).map((item) => [item.gtin!.replace(/\D/g, ""), item]));
  const enriched: QuickAddMatch[] = matches.map((match) => ({
    ...match,
    listed: byCanonical.get(match.canonicalVariantId) ?? (match.gtin ? byGtin.get(match.gtin.replace(/\D/g, "")) : undefined)
  }));
  return { matches: enriched, csrfToken: principal.csrfToken, metrics: workspace.catalogMetrics };
}

export async function saveCanonicalToVendorShop(principal: SessionPrincipal, input: QuickAddSaveInput) {
  if (!postgresVendorRuntimeEnabled()) throw new Error("Quick Add requires the PostgreSQL vendor runtime");
  const canonicalVariantId = clean(input.canonicalVariantId);
  if (!canonicalVariantId) throw new Error("Canonical product is required");
  const customerPriceMinor = safeInt(input.customerPriceMinor, "price");
  const onHand = safeInt(input.onHand, "stock");
  const safetyStock = safeInt(input.safetyStock ?? 0, "safety stock");
  if (customerPriceMinor < 0) throw new Error("Price cannot be negative");
  if (onHand < 0 || safetyStock < 0 || safetyStock > onHand) throw new Error("Invalid stock/safety stock");
  const visible = input.visible !== false;
  const adviceAvailable = input.adviceAvailable !== false;
  const vendorPublicId = requiredVendorId(principal);

  return uow().withTransaction(vendorScope(principal), async (tx) => {
    const refs = await tx.query<SqlRow>(`
      SELECT vb.id::text vendor_uuid,vb.market_id::text market_uuid,
             (SELECT id::text FROM public.vendor_locations WHERE vendor_id=vb.id AND active ORDER BY created_at LIMIT 1) location_uuid,
             cv.id::text canonical_uuid,cv.public_id canonical_public_id,cv.gtin,cv.active,cv.suppressed,cv.recalled
      FROM public.vendor_businesses vb
      JOIN public.canonical_variants cv ON cv.market_id=vb.market_id AND cv.public_id=$2
      WHERE (vb.public_id=$1 OR vb.id::text=$1)
      LIMIT 1
    `, [vendorPublicId, canonicalVariantId]);
    if (!refs.rowCount) throw new Error("Canonical product was not found for this market");
    const ref = refs.rows[0];
    if (!ref.location_uuid) throw new Error("Vendor location is not configured");
    if (ref.suppressed || ref.recalled) throw new Error("This canonical product is blocked from publication");

    let effectiveGtin = clean(ref.gtin);
    let gtinAdded = false;
    if (clean(input.gtin)) {
      const attached = await attachMissingQuickAddGtin(tx, {
        canonicalUuid: String(ref.canonical_uuid),
        canonicalPublicId: String(ref.canonical_public_id),
        gtin: clean(input.gtin),
        source: "vendor_submission"
      });
      effectiveGtin = attached.gtin;
      gtinAdded = attached.added;
    }

    const canonicalWasInactive = !Boolean(ref.active);
    if (canonicalWasInactive) {
      await tx.query(`SELECT bls_private.activate_source_approved_canonical($1::uuid)`, [ref.canonical_uuid]);
    }

    const existing = await tx.query<SqlRow>(`
      SELECT vo.id::text id,vo.public_id,vo.status::text status,vo.merchant_pause_active,
             COALESCE(ib.active_reservations,0)::integer active_reservations
      FROM public.vendor_offers vo
      LEFT JOIN public.inventory_balances ib ON ib.offer_id=vo.id
      WHERE vo.vendor_id=$1::uuid AND vo.location_id=$2::uuid AND vo.canonical_variant_id=$3::uuid
      ORDER BY vo.created_at LIMIT 1
      FOR UPDATE OF vo
    `, [ref.vendor_uuid, ref.location_uuid, ref.canonical_uuid]);

    let offerUuid: string;
    let offerPublicId: string;
    if (existing.rowCount) {
      const row = existing.rows[0];
      const reservations = Number(row.active_reservations ?? 0);
      if (onHand < reservations) throw new Error(`Stock cannot be lower than ${reservations} reserved units`);
      if (row.status !== "approved" && !row.merchant_pause_active) throw new Error(`Existing offer is ${String(row.status)} and cannot be vendor-published`);
      const changed = await tx.query<SqlRow>(`
        UPDATE public.vendor_offers
        SET vendor_sku=$2,source_gtin=COALESCE(NULLIF($3,''),source_gtin),supplier_unit_price_minor=$4,
            customer_price_minor=$4,merchant_visible=$5::boolean,
            merchant_pause_active=CASE WHEN $5::boolean THEN false ELSE merchant_pause_active END,
            advice_capabilities=jsonb_build_object('available',$6::boolean),
            source_payload=COALESCE(source_payload,'{}'::jsonb)||jsonb_build_object(
              'lastQuickAddSource','daily',
              'canonicalWasInactive',$7::boolean,
              'canonicalActivatedByQuickAdd',$7::boolean
            ),updated_at=now()
        WHERE id=$1::uuid
        RETURNING id::text id,public_id
      `, [row.id, clean(input.vendorSku) || null, effectiveGtin, customerPriceMinor, visible, adviceAvailable, canonicalWasInactive]);
      offerUuid = String(changed.rows[0].id);
      offerPublicId = String(changed.rows[0].public_id);
    } else {
      offerUuid = randomUUID();
      offerPublicId = `vo_${randomUUID()}`;
      await tx.query(`
        INSERT INTO public.vendor_offers(
          id,public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,
          supplier_unit_price_minor,customer_price_minor,currency,supplier_tax_rate_bps,fulfilment_modes,
          advice_capabilities,source_payload,approved_at,merchant_visible,merchant_visibility_updated_by,created_at,updated_at
        ) VALUES(
          $1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,$8,'approved',
          $9,$9,'EUR',2400,ARRAY['pickup']::fulfilment_mode[],jsonb_build_object('available',$10::boolean),
          jsonb_build_object(
            'source','quickadd',
            'canonicalPublicId',$11::text,
            'canonicalWasInactive',$13::boolean,
            'canonicalActivatedByQuickAdd',$13::boolean
          ),now(),$12::boolean,
          NULLIF(current_setting('app.actor_user_id',true),'')::uuid,now(),now()
        )
      `, [offerUuid, offerPublicId, ref.market_uuid, ref.vendor_uuid, ref.location_uuid, ref.canonical_uuid,
        clean(input.vendorSku) || null, effectiveGtin || null, customerPriceMinor, adviceAvailable, canonicalVariantId, visible, canonicalWasInactive]);
    }

    const previous = await tx.query<SqlRow>(`SELECT on_hand FROM public.inventory_balances WHERE offer_id=$1::uuid FOR UPDATE`, [offerUuid]);
    const previousOnHand = previous.rowCount ? Number(previous.rows[0].on_hand ?? 0) : 0;
    await tx.query(`
      INSERT INTO public.inventory_balances(offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,updated_at)
      VALUES($1::uuid,$2,0,$3,0,'manual','merchant_confirmed',now())
      ON CONFLICT(offer_id) DO UPDATE SET on_hand=EXCLUDED.on_hand,safety_stock=EXCLUDED.safety_stock,
        source='manual',source_confidence='merchant_confirmed',updated_at=now()
    `, [offerUuid, onHand, safetyStock]);
    if (previousOnHand !== onHand) {
      await tx.query(`
        INSERT INTO public.inventory_movements(id,offer_id,movement_type,quantity_delta,source,actor_id,metadata,created_at)
        VALUES($1,$2::uuid,'manual_adjustment',$3,'quickadd',NULLIF(current_setting('app.actor_user_id',true),'')::uuid,
          jsonb_build_object('previousOnHand',$4::integer,'newOnHand',$5::integer),now())
      `, [randomUUID(), offerUuid, onHand - previousOnHand, previousOnHand, onHand]);
    }
    return { ok: true, offerId: offerPublicId, canonicalVariantId, canonicalActivated: canonicalWasInactive, gtin: effectiveGtin || undefined, gtinAdded };
  }, { isolation: "serializable" });
}
