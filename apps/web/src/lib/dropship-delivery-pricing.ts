export const DROPSHIP_DELIVERY_FEE_MINOR = 750;
export const DROPSHIP_FREE_DELIVERY_THRESHOLD_MINOR = 4000;

export function dropshipDeliveryChargeMinor(subtotalMinor: number): number {
  if (!Number.isSafeInteger(subtotalMinor) || subtotalMinor < 0) {
    throw new Error("Invalid dropshipping subtotal");
  }
  return subtotalMinor > 0 && subtotalMinor < DROPSHIP_FREE_DELIVERY_THRESHOLD_MINOR
    ? DROPSHIP_DELIVERY_FEE_MINOR
    : 0;
}
