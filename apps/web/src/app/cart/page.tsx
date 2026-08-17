import type { Metadata } from "next";
import { CartPageClient } from "../../components/CartPageClient";
import { SiteHeader } from "../../components/SiteHeader";
export const metadata: Metadata = { title: "Καλάθι", description: "Το καλάθι σου στο Buy Local Sparta." };
export default function CartPage() { return <main><div className="announcement">Ένα καλάθι. Μία πληρωμή. Πολλά τοπικά καταστήματα στο παρασκήνιο.</div><SiteHeader compact /><section className="shell page-hero"><div className="eyebrow">Καλάθι</div><h1>Οι τοπικές επιλογές σου.</h1></section><section className="shell page-section"><CartPageClient /></section></main>; }
