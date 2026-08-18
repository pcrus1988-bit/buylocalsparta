import type { Metadata } from "next";

export const metadata: Metadata = { alternates: { canonical: "/shops" } };

export default function ShopsLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
