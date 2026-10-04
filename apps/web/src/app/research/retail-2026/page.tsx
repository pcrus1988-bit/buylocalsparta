import type { Metadata } from "next";
import { RetailStudy2026Survey } from "../../components/RetailStudy2026Survey";

export const metadata: Metadata = {
  title: "Ελληνικό Λιανεμπόριο 2026 · Έρευνα",
  description: "Έρευνα για την ψηφιακή ετοιμότητα, τα εμπόδια και την πραγματικότητα του ελληνικού λιανεμπορίου.",
  robots: { index: false, follow: false },
  referrer: "no-referrer"
};

export default function Page() {
  return <main className="vendor-app">
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">ΕΡΕΥΝΑ ΕΛΛΗΝΙΚΟΥ ΛΙΑΝΕΜΠΟΡΙΟΥ 2026</div>
        <h1>Η πραγματικότητα της ελληνικής λιανικής, με τις απαντήσεις των ίδιων των επιχειρήσεων.</h1>
        <p className="lead">Πρωτοβουλία του ΚΟΝΤΑ ΜΟΥ. Η συμμετοχή είναι προαιρετική, διαρκεί περίπου 3 λεπτά και τα αποτελέσματα θα αναλύονται συγκεντρωτικά.</p>
      </div>
    </section>
    <section className="shell vendor-section">
      <RetailStudy2026Survey />
    </section>
  </main>;
}
