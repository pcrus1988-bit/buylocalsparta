import type { Metadata } from "next";
import "./globals.css";
import "./storefront-merchants.css";
import "./storefront-merchant-media.css";
import { CartProvider } from "../components/CartProvider";

export const metadata: Metadata = {
  title: {
    default: "Buy Local Sparta | Η τοπική αγορά της Σπάρτης online",
    template: "%s | Buy Local Sparta"
  },
  description: "Ανακάλυψε προϊόντα από καταστήματα της Σπάρτης, πάρε πραγματική συμβουλή από τοπικούς επαγγελματίες και αγόρασε με μία ενιαία εμπειρία checkout.",
  keywords: ["Σπάρτη", "τοπικά καταστήματα", "buy local", "marketplace", "Λακωνία", "online αγορές"],
  openGraph: {
    title: "Buy Local Sparta",
    description: "Buy Local. Know Your Vendor. Get Real Advice.",
    locale: "el_GR",
    type: "website"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="el">
      <body><CartProvider>{children}</CartProvider></body>
    </html>
  );
}
