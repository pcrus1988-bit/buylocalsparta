export const DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID = "vendor_e8cb57b3c67b469d9a9d";

export function isDropshippingOnlyVendorPublicId(vendorId: string | null | undefined): boolean {
  return vendorId === DROPSHIPPING_ONLY_VENDOR_PUBLIC_ID;
}
