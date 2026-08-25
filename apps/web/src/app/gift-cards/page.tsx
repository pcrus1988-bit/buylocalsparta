import Link from "next/link";
import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { giftCardsLiveEnabled } from "../../lib/gift-card-service";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/gift-cards", {
    title: "Δωροκάρτες ΚΟΝΤΑ ΜΟΥ",
    description: "Δωροκάρτες για αγορές από την τοπική αγορά της Σπάρτης. Μία αξία που μπορεί να χρησιμοποιηθεί σε συμμετέχοντα καταστήματα μέσα από το ΚΟΝΤΑ ΜΟΥ."
  });
}

export default function GiftCardsPage() {
  const live = giftCardsLiveEnabled();
  return <main>
    <div className="announcement">ΚΟΝΤΑ ΜΟΥ Gift Cards · αξία που μένει στην τοπική αγορά.</div>
    <SiteHeader />
    <section className="shell vendor-hero"><div><div className="eyebrow">ΚΟΝΤΑ ΜΟΥ · local spending</div><h1>Μία δωροκάρτα. Πολλά τοπικά καταστήματα.</h1><p className="lead">Η ΚΟΝΤΑ ΜΟΥ Gift Card έχει σχεδιαστεί ώστε η αξία της να μένει στην τοπική αγορά και να μπορεί να χρησιμοποιηθεί σε συμμετέχοντα καταστήματα μέσα από το marketplace.</p><div className="workspace-inline-actions"><Link className="button" href="/account/gift-cards">Οι δωροκάρτες μου</Link><Link className="button button-secondary" href="/shops">Δες καταστήματα</Link></div></div></section>
    <section className="shell vendor-section"><div className="workspace-queue-list"><article className="workspace-queue-card"><h2>Ασφαλής stored value</h2><p>Ο πλήρης κωδικός δεν αποθηκεύεται στη βάση. Κάθε χρέωση και επιστροφή περνά από immutable ledger με idempotency.</p></article><article className="workspace-queue-card"><h2>Για όλη την τοπική αγορά</h2><p>Η αξία δεν είναι δεμένη με ένα μόνο κατάστημα· ο στόχος είναι να λειτουργεί σε επιλέξιμες αγορές μέσα στο ΚΟΝΤΑ ΜΟΥ.</p></article><article className="workspace-queue-card"><h2>{live ? "Διαθέσιμη αγορά" : "Η δημόσια αγορά ανοίγει μετά το production gate"}</h2><p>{live ? "Η υπηρεσία gift-card purchase έχει ενεργοποιηθεί από την πλατφόρμα." : "Δεν δεχόμαστε ακόμη χρήματα για δημόσια έκδοση. Πρώτα ολοκληρώνεται ο PSP, λογιστικός και φορολογικός έλεγχος."}</p></article></div></section>
    <SiteFooter />
  </main>;
}