import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/shop" } };

export default function ShopLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
