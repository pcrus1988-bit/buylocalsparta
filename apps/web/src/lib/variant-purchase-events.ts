export const OPEN_VARIANT_PURCHASE_EVENT = "konta-mou:open-variant-purchase";

export type VariantPurchaseSource = "product_page" | "mobile_nav";

export type VariantPurchaseRequestDetail = Readonly<{
  source: VariantPurchaseSource;
}>;

export function requestVariantPurchase(source: VariantPurchaseSource): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<VariantPurchaseRequestDetail>(OPEN_VARIANT_PURCHASE_EVENT, { detail: { source } }));
}
