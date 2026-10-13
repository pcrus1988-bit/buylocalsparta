import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYXI — Nail Intelligence",
  description: "Αναζήτηση τεκμηριωμένων πληροφοριών για προϊόντα και φροντίδα νυχιών.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="el"><body>{children}</body></html>;
}
