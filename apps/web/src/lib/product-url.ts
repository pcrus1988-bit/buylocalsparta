export type ProductRouteIdentity = Readonly<{
  id: string;
  slug?: string;
}>;

/**
 * Product slugs are a presentation layer only. The canonical public product ID
 * remains the authority used by carts, offers, inventory, orders and finance.
 */
export function productPublicPath(product: ProductRouteIdentity): string {
  const routeKey = product.slug?.trim() || product.id.trim();
  if (!routeKey) throw new Error("Product route identity is empty.");
  return `/product/${encodeURIComponent(routeKey)}`;
}
