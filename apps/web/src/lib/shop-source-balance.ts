/**
 * Decide when local inventory and supplier-backed products share a stable
 * paginated product window. Filtered browsing keeps its existing ordering;
 * plain landing and keyword search share their first-page exposure.
 */
export type ShopSourceBalanceInputs = Readonly<{
  hasLocalProducts: boolean;
  includesSupplierProducts: boolean;
  catalogQuery: string;
  rawQuery: string;
  hasActiveBrowseFilter: boolean;
}>;

export function shouldUseBalancedShopSources(input: ShopSourceBalanceInputs): boolean {
  if (!input.hasLocalProducts || !input.includesSupplierProducts) return false;
  if (input.catalogQuery.trim().length > 0) return true;
  return input.rawQuery.trim().length === 0 && !input.hasActiveBrowseFilter;
}
