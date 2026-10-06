import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import styles from "../../../components/ResearchSurveyPage.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/privacy", {
    title: "Ιδιωτικότητα Έρευνας · KONTA MOY Retail Observatory",
    description: "Πώς διαχωρίζονται πρόσκληση, συγκατάθεση, απαντήσεις, επικοινωνία, rewards και δημόσια ερευνητικά releases στο Παρατηρητήριο Ελληνικού Λιανεμπορίου.",
    keywords: ["ιδιωτικότητα ερευνητικής συμμετοχής", "προστασία δεδομένων έρευνας", "research privacy Greece", "συγκατάθεση συμμετοχής έρευνα", "ανώνυμες απαντήσεις λιανεμπορίου", "retention ερευνητικών δεδομένων"]
  });
}

export default function ResearchPrivacyPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RESEARCH PRIVACY</div>
      <span>Παρατηρητήριο Ελληνικού Λιανεμπορίου</span>
      <h1>Η συμμετοχή στην έρευνα δεν είναι εμπορική συγκατάθεση.</h1>
      <p>
        Η ερευνητική πρόσκληση, η συμμετοχή, η προαιρετική ενημέρωση για αποτελέσματα και ο κωδικός
        ευχαριστίας αποτελούν διαφορετικές επιλογές. Η εμπορική ενημέρωση του KONTA MOY δεν ζητείται μέσα
        στο επιστημονικό questionnaire και δεν επηρεάζει ποτέ την επιλεξιμότητα, την αποζημίωση ή την ανάλυση.
      </p>
      <div className={styles.meta}>
        <Link href="/research">Παρατηρητήριο</Link>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία 2026</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Separation by purpose</div>
      <h2>Πρόσκληση, απάντηση και επικοινωνία</h2>
      <p>
        Οι προσωπικοί σύνδεσμοι πρόσκλησης είναι opaque tokens· το token δεν αποθηκεύεται ως απλό κείμενο.
        Τα στοιχεία επικοινωνίας και τα survey answers λειτουργούν ως διαφορετικά ερευνητικά layers, ώστε η
        ανάλυση να μη χρειάζεται άμεση πρόσβαση στην ταυτότητα ή στο email της επιχείρησης.
      </p>
      <p>
        Μετά την ολοκλήρωση, ο ίδιος προσωπικός σύνδεσμος μπορεί να χρησιμοποιηθεί για αλλαγή των
        προαιρετικών ερευνητικών preferences χωρίς να ξανανοίγει ή να μεταβάλλει τις κλειδωμένες απαντήσεις.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Consent & withdrawal</div>
      <h2>Ξεχωριστές επιλογές και ανάκληση</h2>
      <p>
        Η συμμετοχή στην έρευνα είναι ανεξάρτητη από την προαιρετική ειδοποίηση αποτελεσμάτων και από την
        προαιρετική αποστολή του thank-you code. Η ανάκληση συμμετοχής εξαιρεί την απάντηση από νέες
        αναλύσεις. Ήδη δημοσιευμένα, συγκεντρωτικά και immutable releases παραμένουν ιστορικά τεκμήρια.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Retention governance</div>
      <h2>Retention και καταστροφή linkage</h2>
      <p>
        Πριν από κάθε fieldwork wave δημοσιεύεται retention window για το identity/contact layer και
        ξεχωριστή πολιτική για το pseudonymous analytical layer. Η παραγωγική ενεργοποίηση της wave
        προϋποθέτει τεχνικά ελεγχόμενο lifecycle που λήγει τα invitation identities και καταγράφει
        αποδεικτικό destruction όταν ολοκληρωθεί η περίοδος επαλήθευσης.
      </p>
    </section>

    <SiteFooter />
  </main>;
}
