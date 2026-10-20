import type { ReactNode } from "react";

/**
 * Keep BAZAAR route behavior scoped at page level.
 *
 * The listing page remains request-time when it consumes searchParams, while
 * individual product pages can use short ISR because cart/checkout revalidate
 * authoritative availability before accepting a purchase.
 */
export default function BazaarLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
