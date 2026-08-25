import type { Metadata } from "next";
import { CartPageClient } from "../../components/CartPageClient";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";

export const metadata: Metadata = { title: "Καλάθι", description: "Το καλάθι σου στο ΚΟΝΤΑ ΜΟΥ.", robots: { index: false, follow: false } };

export default function CartPage() {
  return <main>
    <div className="announcement">Όλα όσα διάλεξες, καθαρά και απλά. Μία αγορά στο τέλος.</div>
    <SiteHeader compact />
    <section className="shell page-hero">
      <div className="eyebrow">Το καλάθι σου</div>
      <h1>Είναι όλα εδώ.</h1>
      <div className="checkout-context-links"><a className="text-link" href="/shop">← Συνέχεια αγορών</a><a className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</a><a className="text-link" href="/payments-security">Ασφαλής πληρωμή →</a></div>
    </section>
    <section className="shell page-section"><CartPageClient /></section>
    <SiteFooter />
  </main>;
}
