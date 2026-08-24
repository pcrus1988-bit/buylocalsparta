import Link from "next/link";
import type { Metadata } from "next";
import { giftCardsLiveEnabled } from "../../lib/gift-card-service";

export const metadata: Metadata = { title: "Δωροκάρτες ΚΟΝΤΑ ΜΟΥ", description: "Δωροκάρτες για αγορές από την τοπική αγορά της Σπάρτης." };

export default function GiftCardsPage() {
  const live = giftCardsLiveEnabled();
  return <main><section className="shell vendor-hero"><div><div className="eyebrow">ΚΟΝΤΑ ΜΟΥ · local spending</div><h1>Μία δωροκάρτα. Πολλά τοπικά καταστήματα.</h1><p className="lead">Η ΚΟΝΤΑ ΜΟΥ Gift Card έχει σχεδιαστεί ώστε η αξία της να μένει στην τοπική αγορά και να μπορεί να χρησιμοποιηθεί σε συμμετέχοντα καταστήματα μέσα από το marketplace.</p><div className="workspace-inline-actions"><Link className="button" href="/account/gift-cards">Οι δωροκάρτες μου</Link><Link className="button button-secondary" href="/shops">Δες καταστήματα</Link></div></div></section><section className="shell vendor-section"><div className="workspace-queue-list"><article className="workspace-queue-card"><h2>Ασφαλής stored value</h2><p>Ο πλήρης κωδικός δεν αποθηκεύεται στη βάση. Κάθε χρέωση και επιστροφή θα περνά από immutable ledger με idempotency.</p></article><article className="workspace-queue-card"><h2>Για όλη την τοπική αγορά</h2><p>Η αξία δεν είναι δεμένη με ένα μόνο κατάστημα· ο στόχος είναι να λειτουργεί σε επιλέξιμες αγορές μέσα στο ΚΟΝΤΑ ΜΟΥ.</p></article><article className="workspace-queue-card"><h2>{live ? "Διαθέσιμη αγορά" : "Η δημόσια αγορά ανοίγει μετά το production gate"}</h2><p>{live ? "Η υπηρεσία gift-card purchase έχει ενεργοποιηθεί από την πλατφόρμα." : "Δεν δεχόμαστε ακόμη χρήματα για δημόσια έκδοση. Πρώτα ολοκληρώνεται ο PSP, λογιστικός και φορολογικός έλεγχος."}</p></article></div></section></main>;
}
