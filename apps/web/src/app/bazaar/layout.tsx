import type { ReactNode } from "react";

/**
 * BAZAAR is backed by direct production Postgres reads rather than framework fetch().
 * Keep the whole segment dynamic so translated merchandising copy and one-unit
 * availability are evaluated against the current database state on every request.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function BazaarLayout({ children }: Readonly<{ children: ReactNode }>) {
  return children;
}
