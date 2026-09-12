import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";

type SupplierDefaults = Readonly<{
  configured: boolean;
  visible: boolean;
  markupPercent: number;
  discountPercent: number;
  showMsrp: boolean;
}>;

const EMPTY_DEFAULTS: SupplierDefaults = {
  configured: false,
  visible: false,
  markupPercent: 0,
  discountPercent: 0,
  showMsrp: false
};

function parseDefaults(value: unknown): SupplierDefaults {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_DEFAULTS;
  const raw = value as Record<string, unknown>;
  const markupPercent = Number(raw.markupPercent);
  const discountPercent = Number(raw.discountPercent);
  if (Number(raw.version) !== 1 || !Number.isFinite(markupPercent) || !Number.isFinite(discountPercent)) return EMPTY_DEFAULTS;
  return {
    configured: true,
    visible: raw.visible === true,
    markupPercent,
    discountPercent,
    showMsrp: raw.showMsrp === true
  };
}

function validateDefaults(defaults: SupplierDefaults): void {
  if (!defaults.configured) throw new Error("Δεν έχουν αποθηκευτεί supplier defaults.");
  if (defaults.markupPercent < 0 || defaults.markupPercent > 1000) throw new Error("Μη έγκυρο supplier markup.");
  if (defaults.discountPercent < 0 || defaults.discountPercent > 100) throw new Error("Μη έγκυρη supplier έκπτωση.");
  const finalFactor = (1 + defaults.markupPercent / 100) * (1 - defaults.discountPercent / 100);
  if (finalFactor < 1) throw new Error("Τα supplier defaults δεν επιτρέπεται να δημιουργούν τιμή χαμηλότερη από την buying price.");
}

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (!result.rowCount) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(result.rows[0].id);
}

/**
 * Dropshipping supplier products are trusted catalogue imports owned by the
 * dedicated dropshipping vendor. A vendor publish action may therefore promote
 * an otherwise safe supplier-linked offer from draft -> approved without an
 * Admin review round-trip. Marketplace moderation states remain authoritative:
 * pending_review/rejected/archived/suppressed offers, archived submissions and
 * suppressed/recalled canonicals can never be self-published here.
 */
export async function setDropshippingProductVisibility(
  vendorIdentity: string,
  actorUserId: string,
  offerId: string,
  visible: boolean
): Promise<Readonly<{ status: string; visible: boolean; paused: boolean; selfApproved: boolean }>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η αλλαγή ορατότητας Dropshipping προϊόντος απαιτεί ενεργή βάση δεδομένων.");
  const publicOfferId = offerId.trim();
  const actorId = actorUserId.trim();
  if (!publicOfferId) throw new Error("Απαιτείται προϊόν.");
  if (!actorId) throw new Error("Vendor user account could not be resolved");

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT vo.id::text offer_uuid,
             vo.status::text status,
             vo.customer_price_minor,
             vo.merchant_pause_active,
             dso.active supplier_offer_active,
             dso.supplier_cost_minor,
             cv.active canonical_active,
             cv.suppressed canonical_suppressed,
             cv.recalled canonical_recalled,
             COALESCE((
               SELECT s.status::text
                 FROM vendor_product_submissions s
                WHERE s.vendor_id=vo.vendor_id
                  AND s.canonical_variant_id=vo.canonical_variant_id
                  AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
                ORDER BY (s.vendor_sku=vo.vendor_sku) DESC NULLS LAST,s.updated_at DESC,s.id DESC
                LIMIT 1
             ),'') latest_submission_status
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
       WHERE vo.public_id=$1
         AND vo.vendor_id=$2::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND ds.active=true
       LIMIT 1
       FOR UPDATE OF vo,dso,cv
    `, [publicOfferId, vendorId]);
    if (result.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε ή δεν ανήκει στον ενεργό supplier.");

    const row = result.rows[0];
    const status = String(row.status);
    const selfPublishableStatus = status === "draft" || status === "approved";
    const supplierCostMinor = Number(row.supplier_cost_minor);
    const customerPriceMinor = Number(row.customer_price_minor);
    const canonicalEligible = row.canonical_active === true
      && row.canonical_suppressed !== true
      && row.canonical_recalled !== true;

    if (visible) {
      if (!selfPublishableStatus) throw new Error("Το προϊόν έχει marketplace moderation status και δεν μπορεί να δημοσιευτεί από τον vendor.");
      if (row.latest_submission_status === "archived") throw new Error("Το προϊόν έχει αρχειοθετηθεί από marketplace moderation και δεν μπορεί να δημοσιευτεί από τον vendor.");
      if (row.supplier_offer_active !== true) throw new Error("Το supplier product δεν είναι ενεργό.");
      if (!Number.isSafeInteger(supplierCostMinor) || supplierCostMinor < 0) throw new Error("Δεν υπάρχει έγκυρη supplier buying price για αυτό το προϊόν.");
      if (!Number.isSafeInteger(customerPriceMinor) || customerPriceMinor < supplierCostMinor) throw new Error("Η τελική τιμή πρέπει να είναι τουλάχιστον ίση με τη supplier buying price.");
      if (!canonicalEligible) throw new Error("Το προϊόν είναι suppressed ή recalled και δεν μπορεί να δημοσιευτεί.");
    }

    const changed = await client.query(`
      UPDATE vendor_offers
         SET status=CASE
               WHEN $3::boolean AND status='draft' THEN 'approved'::public.offer_status
               ELSE status
             END,
             merchant_visible=$3::boolean,
             merchant_pause_active=CASE WHEN $3::boolean THEN false ELSE merchant_pause_active END,
             merchant_visibility_updated_by=$4::uuid,
             merchant_visibility_updated_at=now(),
             updated_at=now()
       WHERE id=$1::uuid
         AND vendor_id=$2::uuid
       RETURNING status::text status,merchant_visible,merchant_pause_active
    `, [String(row.offer_uuid), vendorId, visible, actorId]);
    if (changed.rowCount !== 1) throw new Error("Η αλλαγή ορατότητας απέτυχε.");

    await client.query(`
      INSERT INTO vendor_catalog_visibility_events(vendor_id,offer_id,scope,visible,actor_id,metadata)
      VALUES(
        $1::uuid,
        $2::uuid,
        'product',
        $3::boolean,
        $4::uuid,
        jsonb_build_object(
          'source','vendor_dashboard',
          'channel','dropshipping',
          'offer_public_id',$5::text,
          'self_approved_from_draft',($3::boolean AND $6::text='draft')
        )
      )
    `, [vendorId, String(row.offer_uuid), visible, actorId, publicOfferId, status]);

    await client.query("COMMIT");
    const changedRow = changed.rows[0];
    return {
      status: String(changedRow.status),
      visible: Boolean(changedRow.merchant_visible),
      paused: Boolean(changedRow.merchant_pause_active),
      selfApproved: visible && status === "draft"
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resetDropshippingProductToSupplierDefaults(
  vendorIdentity: string,
  offerId: string
): Promise<Readonly<{ customerPriceMinor: number; visible: boolean; markupPercent: number; discountPercent: number; showMsrp: boolean }>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η επαναφορά Dropshipping προϊόντος απαιτεί ενεργή βάση δεδομένων.");
  const publicOfferId = offerId.trim();
  if (!publicOfferId) throw new Error("Απαιτείται προϊόν.");

  const vendorId = await resolveVendorUuid(vendorIdentity);
  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(`
      SELECT vo.id::text offer_uuid, vo.status::text status, vo.vendor_sku,
             dso.active supplier_offer_active,
             dso.supplier_cost_minor, ds.configuration->'vendorMerchandising' vendor_merchandising,
             cv.active canonical_active, cv.suppressed canonical_suppressed, cv.recalled canonical_recalled,
             COALESCE((
               SELECT s.status::text
                 FROM vendor_product_submissions s
                WHERE s.vendor_id=vo.vendor_id
                  AND s.canonical_variant_id=vo.canonical_variant_id
                  AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
                ORDER BY (s.vendor_sku=vo.vendor_sku) DESC NULLS LAST,s.updated_at DESC,s.id DESC
                LIMIT 1
             ),'') latest_submission_status
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
       WHERE vo.public_id=$1
         AND vo.vendor_id=$2::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND ds.active=true
       LIMIT 1
       FOR UPDATE OF vo,dso,ds,cv
    `, [publicOfferId, vendorId]);
    if (result.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε.");

    const row = result.rows[0];
    const defaults = parseDefaults(row.vendor_merchandising);
    validateDefaults(defaults);
    const supplierCostMinor = Number(row.supplier_cost_minor);
    if (!Number.isSafeInteger(supplierCostMinor) || supplierCostMinor < 0) throw new Error("Δεν υπάρχει έγκυρη supplier buying price για αυτό το προϊόν.");

    const afterMarkupMinor = supplierCostMinor
      + Math.round(supplierCostMinor * defaults.markupPercent / 100);
    const calculatedPriceMinor = Math.max(
      supplierCostMinor,
      afterMarkupMinor - Math.round(afterMarkupMinor * defaults.discountPercent / 100)
    );
    const offerUuid = String(row.offer_uuid);
    const canonicalEligible = row.canonical_active === true
      && row.canonical_suppressed !== true
      && row.canonical_recalled !== true;
    const selfPublishableStatus = row.status === "draft" || row.status === "approved";
    const visible = defaults.visible
      && selfPublishableStatus
      && row.latest_submission_status !== "archived"
      && row.supplier_offer_active === true
      && canonicalEligible;

    await client.query(`
      INSERT INTO vendor_offer_pricing_private(
        offer_id,vendor_id,buying_price_minor,pricing_mode,markup_type,markup_value,
        discount_type,discount_value,created_at,updated_at
      ) VALUES(
        $1::uuid,$2::uuid,$3::bigint,'calculated','percent',$4::numeric,
        CASE WHEN $5::numeric > 0 THEN 'percent' ELSE NULL END,
        CASE WHEN $5::numeric > 0 THEN $5::numeric ELSE NULL END,
        now(),now()
      )
      ON CONFLICT(offer_id) DO UPDATE SET
        buying_price_minor=EXCLUDED.buying_price_minor,
        pricing_mode='calculated',
        markup_type='percent',
        markup_value=EXCLUDED.markup_value,
        discount_type=EXCLUDED.discount_type,
        discount_value=EXCLUDED.discount_value,
        updated_at=now()
    `, [offerUuid, vendorId, supplierCostMinor, defaults.markupPercent, defaults.discountPercent]);

    await client.query(`
      UPDATE vendor_offers
         SET status=CASE
               WHEN $4::boolean AND status='draft' THEN 'approved'::public.offer_status
               ELSE status
             END,
             customer_price_minor=$2::bigint,
             show_msrp=$3::boolean,
             merchant_visible=$4::boolean,
             merchant_pause_active=CASE WHEN $4::boolean THEN false ELSE merchant_pause_active END,
             merchant_visibility_updated_by=NULL,
             merchant_visibility_updated_at=now(),
             updated_at=now()
       WHERE id=$1::uuid
         AND vendor_id=$5::uuid
    `, [offerUuid, calculatedPriceMinor, defaults.showMsrp, visible, vendorId]);

    await client.query("COMMIT");
    return {
      customerPriceMinor: calculatedPriceMinor,
      visible,
      markupPercent: defaults.markupPercent,
      discountPercent: defaults.discountPercent,
      showMsrp: defaults.showMsrp
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function setDropshippingSupplierVisibility(
  vendorIdentity: string,
  supplierCode: string,
  visible: boolean
): Promise<Readonly<{ affectedProducts: number; visibleProducts: number; selfApprovedProducts: number }>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η μαζική αλλαγή ορατότητας απαιτεί ενεργή βάση δεδομένων.");
  const code = supplierCode.trim();
  if (!code) throw new Error("Απαιτείται supplier.");
  const vendorId = await resolveVendorUuid(vendorIdentity);

  const result = await getProductionPostgresRuntime().nativePool.query(`
    UPDATE vendor_offers vo
       SET status=CASE
             WHEN $3::boolean
              AND vo.status='draft'
              AND dso.active=true
              AND dso.supplier_cost_minor IS NOT NULL
              AND dso.supplier_cost_minor >= 0
              AND vo.customer_price_minor >= dso.supplier_cost_minor
              AND cv.active=true
              AND cv.suppressed=false
              AND cv.recalled=false
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
           merchant_visible=CASE
             WHEN $3::boolean
              AND vo.status IN ('draft','approved')
              AND dso.active=true
              AND dso.supplier_cost_minor IS NOT NULL
              AND dso.supplier_cost_minor >= 0
              AND vo.customer_price_minor >= dso.supplier_cost_minor
              AND cv.active=true
              AND cv.suppressed=false
              AND cv.recalled=false
              AND NOT EXISTS (
                SELECT 1
                  FROM vendor_product_submissions s
                 WHERE s.vendor_id=vo.vendor_id
                   AND s.canonical_variant_id=vo.canonical_variant_id
                   AND ((s.vendor_sku IS NULL AND vo.vendor_sku IS NULL) OR s.vendor_sku=vo.vendor_sku OR s.vendor_sku IS NULL)
                   AND s.status='archived'
              )
             THEN true
             ELSE false
           END,
           merchant_pause_active=CASE
             WHEN $3::boolean
              AND vo.status IN ('draft','approved')
              AND dso.active=true
              AND dso.supplier_cost_minor IS NOT NULL
              AND dso.supplier_cost_minor >= 0
              AND vo.customer_price_minor >= dso.supplier_cost_minor
              AND cv.active=true
              AND cv.suppressed=false
              AND cv.recalled=false
             THEN false
             ELSE vo.merchant_pause_active
           END,
           merchant_visibility_updated_by=NULL,
           merchant_visibility_updated_at=now(),
           updated_at=now()
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id,
           canonical_variants cv
     WHERE dso.vendor_offer_id=vo.id
       AND cv.id=vo.canonical_variant_id
       AND vo.vendor_id=$1::uuid
       AND ds.owner_vendor_id=$1::uuid
       AND ds.code=$2
       AND ds.active=true
     RETURNING vo.status::text status,vo.merchant_visible
  `, [vendorId, code, visible]);

  return {
    affectedProducts: result.rowCount ?? 0,
    visibleProducts: result.rows.filter((row) => row.merchant_visible === true).length,
    selfApprovedProducts: result.rows.filter((row) => row.status === "approved" && row.merchant_visible === true).length
  };
}
