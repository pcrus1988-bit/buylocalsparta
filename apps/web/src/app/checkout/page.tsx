import type { Metadata } from "next";
import { CheckoutPageClient } from "../../components/CheckoutPageClient";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { molliePaymentsProviderReadiness } from "../../lib/mollie-runtime";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const mollie = await molliePaymentsProviderReadiness();
  const paymentMode = mollie.enabled && mollie.ready ? "mollie" as const : process.env.NODE_ENV === "production" ? "unavailable" as const : "development" as const;
  const boxNowEnabled = process.env.BLS_BOXNOW_ENABLED === "true" && process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true";
  const checkoutEnabled = paymentMode !== "unavailable";

  return <main>
    <div className="announcement">{checkoutEnabled ? "Λίγα βήματα ακόμη · διάλεξε παραλαβή ή παράδοση και ολοκλήρωσε με ασφάλεια." : "Η online πληρωμή είναι προσωρινά μη διαθέσιμη. Το καλάθι σου παραμένει αποθηκευμένο."}</div>
    <SiteHeader compact />
    <section className="shell page-hero checkout-hero">
      <div className="eyebrow">Ολοκλήρωση αγοράς</div>
      <h1>{checkoutEnabled ? "Ολοκλήρωσε την αγορά σου." : "Το καλάθι σου παραμένει ασφαλές."}</h1>
      {checkoutEnabled ? <p className="checkout-hero-note">Τα στοιχεία, η παραλαβή και η πληρωμή μένουν σε τρία καθαρά βήματα. Αν δεν έχεις συνδεθεί, θα το ζητήσουμε πριν δημιουργηθεί παραγγελία ώστε να συνδεθούν σωστά το παραστατικό και η υποστήριξή σου.</p> : null}
      <ol className="checkout-progress" aria-label="Βήματα ολοκλήρωσης αγοράς">
        <li className="is-current"><span>01</span><strong>Στοιχεία</strong></li>
        <li><span>02</span><strong>Παραλαβή</strong></li>
        <li><span>03</span><strong>Πληρωμή</strong></li>
      </ol>
      <div className="checkout-context-links"><a className="text-link" href="/cart">← Πίσω στο καλάθι</a><a className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</a><a className="text-link" href="/payments-security">Ασφαλής πληρωμή →</a></div>
    </section>
    <section className="shell page-section"><CheckoutPageClient checkoutEnabled={checkoutEnabled} paymentMode={paymentMode} boxNowEnabled={boxNowEnabled} /></section>
    <SiteFooter />
  </main>;
}
