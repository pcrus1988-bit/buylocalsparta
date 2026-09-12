import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { assertDropshippingOnlyVendor } from "./vendor-dropshipping-access";
import {
  assertDropshipPublicFields,
  parseDropshipPresentationConfig,
  resolveDropshipPublicFields,
  type DropshipPresentationConfig,
  type DropshipPublicFields
} from "./dropship-presentation-policy";

export type VendorDropshipPresentationSnapshot = Readonly<{
  supplierFields: DropshipPublicFields;
  products: Readonly<Record<string, Readonly<{ fields: DropshipPublicFields; overridden: boolean }>>>;
}>;

async function resolveVendorUuid(vendorIdentity: string): Promise<string> {
  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT id::text id FROM vendor_businesses WHERE public_id=$1 OR id::text=$1 LIMIT 1`,
    [vendorIdentity]
  );
  if (result.rowCount !== 1) throw new Error("DROPSHIPPING_VENDOR_NOT_FOUND");
  return String(result.rows[0].id);
}

function payload(config: DropshipPresentationConfig) {
  return {
    version: 1,
    fields: config.fields,
    productOverrides: config.productOverrides,
    updatedAt: new Date().toISOString()
  };
}

export async function vendorDropshippingPresentationSnapshot(
  vendorIdentity: string,
  supplierCode: string,
  offerIds: readonly string[]
): Promise<VendorDropshipPresentationSnapshot> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  const fallback = parseDropshipPresentationConfig(null);
  if (!productionDatabaseConfigured() || !supplierCode.trim()) {
    return { supplierFields: fallback.fields, products: {} };
  }
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const supplier = await getProductionPostgresRuntime().nativePool.query(`
    SELECT configuration->'vendorPresentation' vendor_presentation
      FROM dropship_suppliers
     WHERE owner_vendor_id=$1::uuid AND code=$2 AND active=true
     LIMIT 1
  `, [vendorId, supplierCode.trim()]);
  const config = parseDropshipPresentationConfig(supplier.rows[0]?.vendor_presentation);
  const products: Record<string, Readonly<{ fields: DropshipPublicFields; overridden: boolean }>> = {};
  for (const offerId of offerIds) {
    const key = offerId.trim();
    if (!key) continue;
    products[key] = resolveDropshipPublicFields(config, key);
  }
  return { supplierFields: config.fields, products };
}

export async function vendorDropshippingSupplierPublicFields(
  vendorIdentity: string,
  supplierCode: string
): Promise<DropshipPublicFields> {
  const snapshot = await vendorDropshippingPresentationSnapshot(vendorIdentity, supplierCode, []);
  return snapshot.supplierFields;
}

export async function vendorDropshippingProductPublicFields(
  vendorIdentity: string,
  offerId: string
): Promise<Readonly<{ fields: DropshipPublicFields; overridden: boolean }>> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  const fallback = parseDropshipPresentationConfig(null);
  if (!productionDatabaseConfigured()) return { fields: fallback.fields, overridden: false };
  const publicOfferId = offerId.trim();
  if (!publicOfferId) throw new Error("Απαιτείται προϊόν.");
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const result = await getProductionPostgresRuntime().nativePool.query(`
    SELECT ds.configuration->'vendorPresentation' vendor_presentation
      FROM vendor_offers vo
      JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
     WHERE vo.public_id=$1
       AND vo.vendor_id=$2::uuid
       AND ds.owner_vendor_id=$2::uuid
       AND ds.active=true
     LIMIT 1
  `, [publicOfferId, vendorId]);
  if (result.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε.");
  const config = parseDropshipPresentationConfig(result.rows[0].vendor_presentation);
  return resolveDropshipPublicFields(config, publicOfferId);
}

export async function saveDropshippingSupplierPublicFields(
  vendorIdentity: string,
  supplierCode: string,
  fieldsInput: unknown
): Promise<DropshipPublicFields> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Οι public field ρυθμίσεις απαιτούν ενεργή βάση δεδομένων.");
  const code = supplierCode.trim();
  if (!code) throw new Error("Απαιτείται supplier.");
  const fields = assertDropshipPublicFields(fieldsInput);
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const supplier = await client.query(`
      SELECT id::text id, configuration->'vendorPresentation' vendor_presentation
        FROM dropship_suppliers
       WHERE owner_vendor_id=$1::uuid AND code=$2 AND active=true
       FOR UPDATE
    `, [vendorId, code]);
    if (supplier.rowCount !== 1) throw new Error("Ο Dropshipping supplier δεν βρέθηκε ή δεν είναι ενεργός.");
    const current = parseDropshipPresentationConfig(supplier.rows[0].vendor_presentation);
    const next: DropshipPresentationConfig = { version: 1, fields, productOverrides: current.productOverrides };
    await client.query(`
      UPDATE dropship_suppliers
         SET configuration=jsonb_set(configuration,'{vendorPresentation}',$2::jsonb,true), updated_at=now()
       WHERE id=$1::uuid
    `, [String(supplier.rows[0].id), JSON.stringify(payload(next))]);
    await client.query("COMMIT");
    return fields;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveDropshippingProductPublicFields(
  vendorIdentity: string,
  offerId: string,
  fieldsInput: unknown
): Promise<DropshipPublicFields> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Οι product public field ρυθμίσεις απαιτούν ενεργή βάση δεδομένων.");
  const publicOfferId = offerId.trim();
  if (!publicOfferId) throw new Error("Απαιτείται προϊόν.");
  const fields = assertDropshipPublicFields(fieldsInput);
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const supplier = await client.query(`
      SELECT ds.id::text id, ds.configuration->'vendorPresentation' vendor_presentation
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
       WHERE vo.public_id=$1
         AND vo.vendor_id=$2::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND ds.active=true
       LIMIT 1
       FOR UPDATE OF ds
    `, [publicOfferId, vendorId]);
    if (supplier.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε.");
    const current = parseDropshipPresentationConfig(supplier.rows[0].vendor_presentation);
    const overrides = { ...current.productOverrides, [publicOfferId]: fields };
    if (Object.keys(overrides).length > 10_000) throw new Error("Υπάρχουν πάρα πολλά per-product field overrides. Χρησιμοποίησε supplier defaults.");
    const next: DropshipPresentationConfig = { version: 1, fields: current.fields, productOverrides: overrides };
    await client.query(`
      UPDATE dropship_suppliers
         SET configuration=jsonb_set(configuration,'{vendorPresentation}',$2::jsonb,true), updated_at=now()
       WHERE id=$1::uuid
    `, [String(supplier.rows[0].id), JSON.stringify(payload(next))]);
    await client.query("COMMIT");
    return fields;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function resetDropshippingProductPublicFields(vendorIdentity: string, offerId: string): Promise<void> {
  await assertDropshippingOnlyVendor(vendorIdentity);
  if (!productionDatabaseConfigured()) throw new Error("Η επαναφορά public fields απαιτεί ενεργή βάση δεδομένων.");
  const publicOfferId = offerId.trim();
  if (!publicOfferId) throw new Error("Απαιτείται προϊόν.");
  const vendorId = await resolveVendorUuid(vendorIdentity);
  const client = await getProductionPostgresRuntime().nativePool.connect();
  try {
    await client.query("BEGIN");
    const supplier = await client.query(`
      SELECT ds.id::text id, ds.configuration->'vendorPresentation' vendor_presentation
        FROM vendor_offers vo
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
       WHERE vo.public_id=$1
         AND vo.vendor_id=$2::uuid
         AND ds.owner_vendor_id=$2::uuid
         AND ds.active=true
       LIMIT 1
       FOR UPDATE OF ds
    `, [publicOfferId, vendorId]);
    if (supplier.rowCount !== 1) throw new Error("Το Dropshipping προϊόν δεν βρέθηκε.");
    const current = parseDropshipPresentationConfig(supplier.rows[0].vendor_presentation);
    const overrides = { ...current.productOverrides } as Record<string, DropshipPublicFields>;
    delete overrides[publicOfferId];
    const next: DropshipPresentationConfig = { version: 1, fields: current.fields, productOverrides: overrides };
    await client.query(`
      UPDATE dropship_suppliers
         SET configuration=jsonb_set(configuration,'{vendorPresentation}',$2::jsonb,true), updated_at=now()
       WHERE id=$1::uuid
    `, [String(supplier.rows[0].id), JSON.stringify(payload(next))]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
