import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";

export default function NotFound() {
  return <main>
    <div className="announcement">Η σελίδα δεν βρέθηκε — η τοπική αγορά παραμένει ένα βήμα μακριά.</div>
    <SiteHeader />
    <section className="shell missing-page">
      <div><div className="eyebrow">404 · Δεν βρέθηκε</div><h1>Αυτός ο δρόμος δεν οδηγεί σε ενεργή σελίδα.</h1><p className="lead">Ο σύνδεσμος μπορεί να άλλαξε ή το προϊόν και το κατάστημα να μην είναι πλέον δημόσια διαθέσιμα. Διάλεξε μια πραγματική επόμενη διαδρομή.</p><div className="hero-actions"><a className="button" href="/shop">Πήγαινε στα προϊόντα</a><a className="button button-secondary" href="/shops">Βρες κατάστημα</a><a className="text-link" href="/help">Κέντρο βοήθειας →</a></div></div>
      <div className="missing-mark" aria-hidden="true">404</div>
    </section>
    <SiteFooter />
  </main>;
}
