import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "../../components/ResearchSurveyPage.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research", {
    title: "Παρατηρητήριο Ελληνικού Λιανεμπορίου · KONTA MOY",
    description: "Το μόνιμο ερευνητικό πρόγραμμα του KONTA MOY για την ψηφιακή ωριμότητα, το κόστος, την τοπική αγορά και το μέλλον του ελληνικού λιανεμπορίου."
  });
}

export default function RetailObservatoryPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RETAIL OBSERVATORY</div>
      <span>Παρατηρητήριο Ελληνικού Λιανεμπορίου</span>
      <h1>Ένα μόνιμο, αναπαραγώγιμο ερευνητικό πρόγραμμα.</h1>
      <p>Ετήσιες και θεματικές μελέτες για το πώς λειτουργεί, ψηφιοποιείται και εξελίσσεται το ελληνικό λιανεμπόριο — με παγωμένα δείγματα, versioned questionnaires, δηλωμένη στάθμιση και δημόσια provenance για κάθε δημοσιευμένο αποτέλεσμα.</p>
      <div className={styles.meta}>
        <Link href="/research/greek-retail-2026">Μελέτη 2026</Link>
        <Link href="/research/privacy">Απόρρητο έρευνας</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Πρώτο ερευνητικό κύμα</div>
      <h2>Ελληνικό Λιανεμπόριο 2026</h2>
      <p><strong>Ψηφιακή Ωριμότητα, Κόστος, Τοπική Αγορά και Μέλλον.</strong> Η πρώτη wave αποτελεί τη βάση για συγκρίσεις 2027, 2028 και επόμενων ετών, με σταθερές core έννοιες και ρητή καταγραφή όταν μια ερώτηση παύει να είναι απολύτως συγκρίσιμη.</p>
      <p><Link href="/research/greek-retail-2026/methodology">Μεθοδολογία & αναπαραγωγιμότητα →</Link></p>
      <p><Link href="/research/greek-retail-2026/results">Αποτελέσματα / releases →</Link></p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Research contract</div>
      <h2>Population → sample → consent → evidence → release.</h2>
      <p>Το Observatory διαχωρίζει το sampling frame και τα στοιχεία επικοινωνίας από τις ερευνητικές απαντήσεις. Τα raw answers δεν διορθώνονται εκ των υστέρων· οι μετασχηματισμοί, τα scores, τα weights και οι αποκλεισμοί αποτελούν ξεχωριστό versioned evidence layer.</p>
      <p>Κάθε wave ανήκει σε μόνιμο study series. Οι core έννοιες μπορούν να δεθούν σε νέα instrument versions ως <em>exact</em>, <em>comparable</em> ή <em>break</em>, ώστε οι διαχρονικές συγκρίσεις να μην δημιουργούνται τεχνητά.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Independence boundary</div>
      <h2>Η έρευνα δεν είναι seller-acquisition funnel.</h2>
      <p>Η συμμετοχή στην έρευνα, η ενημέρωση για αποτελέσματα και η αποστολή του thank-you benefit είναι ξεχωριστοί ερευνητικοί σκοποί. Εμπορική συγκατάθεση για υπηρεσίες KONTA MOY δεν συλλέγεται μέσα στο ερευνητικό questionnaire.</p>
      <p>Μετά το καθορισμένο retention/verification period, το σύστημα μπορεί να καταστρέψει τεχνικά τη σύνδεση contact → sampled company → response, διατηρώντας μόνο τα frozen aggregates, hashes και suppression evidence που χρειάζονται για reproducibility και προστασία opt-out.</p>
    </section>

    <SiteFooter />
  </main>;
}
