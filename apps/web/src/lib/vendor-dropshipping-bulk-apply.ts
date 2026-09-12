import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import type { DropshippingSupplierDefaults } from "./vendor-dropshipping-service";

function parseDefaults(value: unknown): DropshippingSupplierDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Αποθήκευσε πρώτα τις global Dropshipping ρυθμίσεις.");
  const raw = value as Record<string, unknown>;
  const markupPercent = Number(raw.markupPercent);
  const discountPercent = Number(raw.discountPercent);
  if (Number(raw.version) !== 1
    || !Number.isFinite(markupPercent) || markupPercent < 0 || markupPercent > 1000
    || !Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    throw new Error("Οι αποθηκευμένες global Dropshipping ρυθμίσεις δεν είναι έγκυρες.");
  }
  const finalFactor = (1 + markupPercent / 100) * (1 - discountPercent / 100);
  if (finalFactor < 1) throw new Error("Οι global κανόνες δεν μπορούν να δημιουργούν τιμή χαμηλότερη από την supplier buying price.");
  return {
    configured: true,
    visible: raw.visible === true,
    markupPercent,
    discountPercent,
    showMsrp: raw.showMsrp === true
  };
}

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (result.rowCount !== 1) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(result.rows[0].id);
}

/**
 * Apply saved supplier defaults using the same sequential rounding as
 * calculateRetailPriceMinor(): round markup first, then round discount on the
 * marked-up amount. This keeps bulk and per-product calculated prices identical
 * down to the cent while retaining the database-level supplier-cost floor.
 *
 * Visibility defaults are inheritance, not a destructive overwrite of an
 * explicit product choice. A manual product decision is identified by the
 * authenticated actor stored in merchant_visibility_updated_by. Because the
 * database trigger also updates merchant_visibility_updated_at for automated
 * changes, the timestamp alone is intentionally not used as provenance.
 *
 * Safe supplier-linked draft offers can be self-approved by the dedicated
 * dropshipping vendor when the supplier default is public. Marketplace
 * moderation states and archived submissions stay authoritative, and inactive,
 * suppressed or recalled supplier products remain hidden regardless of defaults.
 */
export async function applyDropshippingSupplierDefaultsSequential(
  vendorIdentity: string,
  supplierCode: string
): Promise<Readonly<{
  pricedProducts: number;
  eligibleProducts: number;
  visibleProducts: number;
  overriddenProducts: number;
  defaults: DropshippingSupplierDefaults;
}>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η εφαρμογή global Dropshipping ρυθμίσεων απαιτεί ενεργή βάση δεδομένων.");
  const code = supplierCode.trim();
  if (!code) throw new Error("Απαιτείται supplier.");
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const pool = getProductionPostgresRuntime().nativePool;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const supplier = await client.query(`
      SELECT ds.id::text id, ds.configuration->'vendorMerchandising' vendor_merchandising
        FROM dropship_suppliers ds
       WHERE ds.owner_vendor_id=$1::uuid
         AND ds.code=$2
         AND ds.active=true
       FOR UPDATE
    `, [vendorId, code]);
    if (supplier.rowCount !== 1) throw new Error("Ο Dropshipping supplier δεν βρέθηκε ή δεν είναι ενεργός.");
    const defaults = parseDefaults(supplier.rows[0].vendor_merchandising);
    const supplierId = String(supplier.rows[0].id);

    const priced = await client.query(`
      INSERT INTO vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,discount_type,discount_value,created_at,updated_at
      )
      SELECT vo.id,vo.vendor_id,dso.supplier_cost_minor,'calculated','percent',$3::numeric,
             CASE WHEN $4::numeric > 0 THEN 'percent' ELSE NULL END,
             CASE WHEN $4::numeric > 0 THEN $4::numeric ELSE NULL END,
             now(),now()
        FROM dropship_supplier_offers dso
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
       WHERE dso.supplier_id=$1::uuid
         AND vo.vendor_id=$2::uuid
         AND dso.supplier_cost_minor IS NOT NULL
      ON CONFLICT(offer_id) DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        pricing_mode='calculated',
        markup_type='percent',
        markup_value=EXCLUDED.markup_value,
        discount_type=EXCLUDED.discount_type,
        discount_value=EXCLUDED.discount_value,
        updated_at=now()
      RETURNING offer_id
    `, [supplierId, vendorId, defaults.markupPercent, defaults.discountPercent]);

    const changed = await client.query(`
      UPDATE vendor_offers vo
         SET status=CASE
               WHEN vo.status='draft'
                 AND $6::boolean
                 AND dso.active
                 AND cv.active
                 AND NOT cv.suppressed
                 AND NOT cv.recalled
                 AND NOT EXISTS (
                   SELECT 1
                     FROM vendor_product_submissions s
                    WHERE s.vendor_id=vo.vendor_id
                      AND s.canonical_variant_id=vo.canonical_variant_id
                      AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
                      AND s.status='archived'
                 )
               THEN 'approved'::public.offer_status
               ELSE vo.status
             END,
             customer_price_minor=GREATEST(
               dso.supplier_cost_minor,
               calc.after_markup_minor - ROUND(calc.after_markup_minor * $4::numeric / 100)::bigint
             ),
             show_msrp=$5,
             merchant_visible=CASE
               WHEN vo.status NOT IN ('draft','approved')
                 OR NOT dso.active
                 OR NOT cv.active
                 OR cv.suppressed
                 OR cv.recalled
                 OR EXISTS (
                   SELECT 1
                     FROM vendor_product_submissions s
                    WHERE s.vendor_id=vo.vendor_id
                      AND s.canonical_variant_id=vo.canonical_variant_id
                      AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
                      AND s.status='archived'
                 ) THEN false
               WHEN vo.status='draft' AND NOT $6::boolean THEN false
               WHEN vo.merchant_visibility_updated_by IS NOT NULL THEN COALESCE((
                 SELECT e.visible
                   FROM vendor_catalog_visibility_events e
                  WHERE e.vendor_id=vo.vendor_id
                    AND e.offer_id=vo.id
                    AND e.scope='product'
                    AND e.actor_id IS NOT NULL
                    AND coalesce(e.metadata->>'source','')='vendor_dashboard'
                  ORDER BY e.created_at DESC,e.id DESC
                  LIMIT 1
               ),vo.merchant_visible)
               ELSE $6
             END,
             merchant_pause_active=CASE
               WHEN $6::boolean
                 AND vo.status IN ('draft','approved')
                 AND dso.active
                 AND cv.active
                 AND NOT cv.suppressed
                 AND NOT cv.recalled
               THEN false
               ELSE vo.merchant_pause_active
             END,
             merchant_visibility_updated_at=now(),
             updated_at=now()
        FROM dropship_supplier_offers dso
        CROSS JOIN LATERAL (
          SELECT dso.supplier_cost_minor
                 + ROUND(dso.supplier_cost_minor * $3::numeric / 100)::bigint AS after_markup_minor
        ) calc,
        canonical_variants cv
       WHERE dso.vendor_offer_id=vo.id
         AND cv.id=vo.canonical_variant_id
         AND dso.supplier_id=$1::uuid
         AND vo.vendor_id=$2::uuid
         AND dso.supplier_cost_minor IS NOT NULL
      RETURNING vo.id,vo.status::text status,vo.merchant_visible,(vo.merchant_visibility_updated_by IS NOT NULL) visibility_overridden
    `, [supplierId, vendorId, defaults.markupPercent, defaults.discountPercent, defaults.showMsrp, defaults.visible]);

    await client.query("COMMIT");
    return {
      pricedProducts: priced.rowCount ?? 0,
      eligibleProducts: changed.rowCount ?? 0,
      visibleProducts: changed.rows.filter((row) => Boolean(row.merchant_visible)).length,
      overriddenProducts: changed.rows.filter((row) => Boolean(row.visibility_overridden)).length,
      defaults
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
