import type { Metadata } from "next";
import { CheckoutPageClient } from "../../components/CheckoutPageClient";
import { SiteHeader } from "../../components/SiteHeader";
import { SiteFooter } from "../../components/SiteFooter";
import { vivaPaymentsProviderReadiness } from "../../lib/viva-runtime";

export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const viva = await vivaPaymentsProviderReadiness();
  const paymentMode = viva.enabled && viva.ready ? "viva" as const : process.env.NODE_ENV === "production" ? "unavailable" as const : "development" as const;
  const boxNowEnabled = process.env.BLS_BOXNOW_ENABLED === "true" && process.env.NEXT_PUBLIC_BOXNOW_WIDGET_ENABLED === "true";
  const checkoutEnabled = paymentMode !== "unavailable";

  return <main>
    <div className="announcement">{checkoutEnabled ? "Checkout · η τελική διαθεσιμότητα, παράδοση και χρέωση επιβεβαιώνονται από το backend." : "Online checkout · προσωρινά μη διαθέσιμο μέχρι να ενεργοποιηθεί ο production πάροχος πληρωμών."}</div>
    <SiteHeader compact />
    <section className="shell page-hero">
      <div className="eyebrow">Checkout</div>
      <h1>{checkoutEnabled ? "Μία αγορά. Τοπικά." : "Το καλάθι σου παραμένει ασφαλές."}</h1>
      <div className="checkout-context-links"><a className="text-link" href="/how-it-works">Πώς λειτουργεί η ενιαία αγορά →</a><a className="text-link" href="/delivery-pickup">Παράδοση & παραλαβή →</a><a className="text-link" href="/payments-security">Πώς προστατεύεται η πληρωμή →</a></div>
    </section>
    <section className="shell page-section"><CheckoutPageClient checkoutEnabled={checkoutEnabled} paymentMode={paymentMode} boxNowEnabled={boxNowEnabled} /></section>
    <SiteFooter />
  </main>;
}
