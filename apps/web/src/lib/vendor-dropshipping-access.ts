import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID = "vendor_e8cb57b3c67b469d9a9d";

export function isDropshippingOnlyVendorPublicId(vendorId: string | null | undefined): boolean {
  return vendorId === DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID;
}

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
