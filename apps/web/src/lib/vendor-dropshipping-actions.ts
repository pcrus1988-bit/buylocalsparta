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
      SELECT vo.id::text offer_uuid, vo.status, dso.active supplier_offer_active,
             dso.supplier_cost_minor, ds.configuration->'vendorMerchandising' vendor_merchandising
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
       WHERE vo.public_id=$1
         AND vo.vendor_id=$2::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND ds.active=true
       LIMIT 1
       FOR UPDATE OF vo,dso,ds
    `, [publicOfferId, vendorId]);
    if (result.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε.");

    const row = result.rows[0];
    const defaults = parseDefaults(row.vendor_merchandising);
    validateDefaults(defaults);
    const supplierCostMinor = Number(row.supplier_cost_minor);
    if (!Number.isSafeInteger(supplierCostMinor) || supplierCostMinor < 0) throw new Error("Δεν υπάρχει έγκυρη supplier buying price για αυτό το προϊόν.");

    const calculatedPriceMinor = Math.max(
      supplierCostMinor,
      Math.round(supplierCostMinor * (1 + defaults.markupPercent / 100) * (1 - defaults.discountPercent / 100))
    );
    const offerUuid = String(row.offer_uuid);
    const visible = defaults.visible && row.status === "approved" && row.supplier_offer_active === true;

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
         SET customer_price_minor=$2::bigint,
             show_msrp=$3::boolean,
             merchant_visible=$4::boolean,
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
): Promise<Readonly<{ affectedProducts: number; visibleProducts: number }>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η μαζική αλλαγή ορατότητας απαιτεί ενεργή βάση δεδομένων.");
  const code = supplierCode.trim();
  if (!code) throw new Error("Απαιτείται supplier.");
  const vendorId = await resolveVendorUuid(vendorIdentity);

  const result = await getProductionPostgresRuntime().nativePool.query(`
    UPDATE vendor_offers vo
       SET merchant_visible=CASE
             WHEN $3::boolean
              AND vo.status='approved'
              AND dso.active=true
              AND dso.supplier_cost_minor IS NOT NULL
              AND vo.customer_price_minor >= dso.supplier_cost_minor
             THEN true
             ELSE false
           END,
           updated_at=now()
      FROM dropship_supplier_offers dso
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
     WHERE dso.vendor_offer_id=vo.id
       AND vo.vendor_id=$1::uuid
       AND ds.owner_vendor_id=$1::uuid
       AND ds.code=$2
       AND ds.active=true
     RETURNING vo.merchant_visible
  `, [vendorId, code, visible]);

  return {
    affectedProducts: result.rowCount ?? 0,
    visibleProducts: result.rows.filter((row) => row.merchant_visible === true).length
  };
}
