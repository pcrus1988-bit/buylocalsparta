import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID, isDropshippingOnlyVendorPublicId } from "./vendor-dropshipping-constants";

export { DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID, isDropshippingOnlyVendorPublicId } from "./vendor-dropshipping-constants";

/** Resolve the signed session vendor identity to the one vendor that is allowed to operate dropshipping. */
export async function isDropshippingOnlyVendor(vendorIdentity: string | null | undefined): Promise<boolean> {
  if (!vendorIdentity) return false;
  if (isDropshippingOnlyVendorPublicId(vendorIdentity)) return true;
  if (!productionDatabaseConfigured()) return false;

  const result = await getProductionPostgresRuntime().nativePool.query(
    `SELECT 1
       FROM vendor_businesses
      WHERE id::text=$1
        AND public_id=$2
      LIMIT 1`,
    [vendorIdentity, DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID]
  );
  return Boolean(result.rowCount);
}

export async function assertDropshippingOnlyVendor(vendorIdentity: string | null | undefined): Promise<void> {
  if (!await isDropshippingOnlyVendor(vendorIdentity)) throw new Error("DROPSHIPPING_VENDOR_ACCESS_REQUIRED");
}
