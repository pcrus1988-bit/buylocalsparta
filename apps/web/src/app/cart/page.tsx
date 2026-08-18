import type { Metadata } from "next";
import { CartPageClient } from "../../components/CartPageClient";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
export const metadata: Metadata = { title: "Καλάθι", description: "Το καλάθι σου στο Buy Local Sparta.", robots: { index: false, follow: false } };
export default function CartPage() { return <main><div className="announcement">Ένα καλάθι. Μία πληρωμή. Πολλά τοπικά καταστήματα στο παρασκήνιο.</div><SiteHeader compact /><section className="shell page-hero"><div className="eyebrow">Καλάθι</div><h1>Οι τοπικές επιλογές σου.</h1><div className="checkout-context-links"><a className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</a><a className="text-link" href="/payments-security">Πληρωμές & ασφάλεια →</a><a className="text-link" href="/returns-refunds">Επιστροφές & refunds →</a></div></section><section className="shell page-section"><CartPageClient /></section><SiteFooter /></main>; }
