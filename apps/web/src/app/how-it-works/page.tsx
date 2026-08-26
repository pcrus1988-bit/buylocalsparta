import type { Metadata } from "next";
import { SiteFooter } from "../../components/SiteFooter";
import { SiteHeader } from "../../components/SiteHeader";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/how-it-works", {
  title: "Πώς λειτουργεί",
  description: "Από την αναζήτηση και την τοπική συμβουλή μέχρι την πληρωμή, την εκπλήρωση και την παρακολούθηση της παραγγελίας."
  });
}

const journey = [
  ["01", "Βρίσκεις αυτό που χρειάζεσαι", "Αναζήτησε προϊόν, κατηγορία ή κατάστημα. Τα ίδια προϊόντα ενοποιούνται ώστε να βλέπεις ένα καθαρό αποτέλεσμα."],
  ["02", "Παίρνεις τοπική συμβουλή", "Ρώτησε από τη σελίδα προϊόντος ή χρησιμοποίησε το Ask Local. Η συζήτηση και κάθε πρόταση παραμένουν ιδιωτικές."],
  ["03", "Αγοράζεις μία φορά", "Το ΚΟΝΤΑ ΜΟΥ Σπάρτη είναι το ενιαίο σημείο checkout. Προϊόντα από περισσότερα καταστήματα παραμένουν σε μία παραγγελία πελάτη."],
  ["04", "Η παραγγελία εκτελείται τοπικά", "Στο παρασκήνιο δημιουργούνται ιδιωτές ροές εκπλήρωσης ανά κατάστημα, χωρίς να φορτώνεται ο πελάτης με ξεχωριστές αγορές."],
  ["05", "Παραλαμβάνεις και παρακολουθείς", "Επίλεξε διαθέσιμο τρόπο παραλαβής ή αποστολής και δες την εξέλιξη από τον λογαριασμό σου."]
] as const;

export default function HowItWorksPage() {
  return <main>
    <div className="announcement">Ένα marketplace που κρατά την αγορά απλή για τον πελάτη και δίκαιη για τα τοπικά καταστήματα.</div>
    <SiteHeader />
    <section className="content-hero content-hero-process">
      <div className="shell content-hero-grid">
        <div><div className="eyebrow light">Από την ανάγκη μέχρι την παραλαβή</div><h1>Μία αγορά. Πραγματική τοπική υποστήριξη.</h1><p>Το ΚΟΝΤΑ ΜΟΥ Σπάρτη συνδέει τον καθαρό online κατάλογο με τα φυσικά καταστήματα, τους ανθρώπους και τη γνώση της πόλης.</p><div className="hero-actions"><a className="button button-light" href="/shop">Ξεκίνα από τα προϊόντα</a><a className="button content-outline" href="/ask-local">Περιέγραψε τι ψάχνεις</a></div></div>
        <div className="content-hero-map" aria-hidden="true"><span>FIND</span><span>ASK</span><span>BUY</span><span>LOCAL</span></div>
      </div>
    </section>
    <section className="shell content-section" aria-labelledby="journey-title">
      <div className="content-heading"><div><div className="eyebrow">Η διαδρομή σου</div><h2 id="journey-title">Πέντε καθαρά βήματα</h2></div><p>Κάθε σύνδεσμος οδηγεί σε πραγματική λειτουργία ή σελίδα· δεν χρειάζεται να επιστρέψεις στην αρχική για να συνεχίσεις.</p></div>
      <div className="process-list">{journey.map(([number, title, body]) => <article key={number}><span>{number}</span><div><h3>{title}</h3><p>{body}</p></div></article>)}</div>
    </section>
    <section className="content-band">
      <div className="shell content-split">
        <div><div className="eyebrow light">Ο ρόλος της πλατφόρμας</div><h2>Ένα checkout προς το ΚΟΝΤΑ ΜΟΥ Σπάρτη.</h2><p>Ο πελάτης βλέπει μία παραγγελία και μία συνολική πληρωμή. Η πλατφόρμα οργανώνει ιδιωτικά την προμήθεια και την εκπλήρωση από τους επιλέξιμους τοπικούς συνεργάτες.</p></div>
        <div className="content-fact-list"><div><strong>Δημόσια</strong><span>Προϊόν, τελική τιμή, διαθεσιμότητα και εγκεκριμένο προφίλ καταστήματος.</span></div><div><strong>Ιδιωτικά</strong><span>Supplier offers, τιμές προμήθειας, ανάθεση και εσωτερικές ροές εκπλήρωσης.</span></div><div><strong>Σταθερά</strong><span>Η ανάθεση παραμένει συνεπής μέσα στο σχετικό ταξίδι αγοράς.</span></div></div>
      </div>
    </section>
    <section className="shell content-section">
      <div className="content-heading"><div><div className="eyebrow">Διάλεξε το επόμενο βήμα</div><h2>Πήγαινε κατευθείαν εκεί που χρειάζεσαι.</h2></div></div>
      <div className="destination-grid"><a href="/fairness"><span>01</span><strong>Πώς επιλέγεται το κατάστημα</strong><small>Δες τους κανόνες δίκαιης ανάθεσης.</small></a><a href="/delivery-pickup"><span>02</span><strong>Παράδοση και παραλαβή</strong><small>Κατανόησε τις διαθέσιμες ροές εκπλήρωσης.</small></a><a href="/advice"><span>03</span><strong>Βρες τοπικό σύμβουλο</strong><small>Γνώρισε ανθρώπους που ξέρουν την κατηγορία.</small></a><a href="/help"><span>04</span><strong>Χρειάζεσαι βοήθεια;</strong><small>Βρες γρήγορα τη σωστή διαδρομή.</small></a></div>
    </section>
    <SiteFooter />
  </main>;
}
