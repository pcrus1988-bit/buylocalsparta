import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import styles from "../../../components/ResearchSurveyPage.module.css";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/privacy", {
    title: "Απόρρητο έρευνας · Παρατηρητήριο Ελληνικού Λιανεμπορίου",
    description: "Αρχές προστασίας δεδομένων και διαχωρισμού contact, sampling και response data για τις μελέτες του KONTA MOY Retail Observatory."
  });
}

export default function ResearchPrivacyPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>RETAIL OBSERVATORY · PRIVACY</div>
      <span>Research privacy architecture</span>
      <h1>Τα στοιχεία επικοινωνίας δεν είναι το dataset των απαντήσεων.</h1>
      <p>Το Παρατηρητήριο έχει σχεδιαστεί ώστε το fieldwork contact layer, η επιστημονική συμμετοχή και η δημοσιευμένη ανάλυση να παραμένουν διαφορετικά συστήματα με διαφορετικούς σκοπούς και δικαιώματα πρόσβασης.</p>
      <div className={styles.meta}>
        <Link href="/research">← Παρατηρητήριο</Link>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία 2026</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Data separation</div>
      <h2>Contact vault ≠ research responses.</h2>
      <p>Ο προσωπικός survey σύνδεσμος χρησιμοποιεί opaque token. Το raw token δεν αποθηκεύεται. Email, ΑΦΜ, ΓΕΜΗ ή επωνυμία δεν μεταφέρονται στο URL και δεν αποτελούν πεδία της ερευνητικής απάντησης.</p>
      <p>Fieldwork χρήστες μπορούν να χειρίζονται invitations και contactability χωρίς να αποκτούν δικαίωμα ανάλυσης απαντήσεων. Οι analysts μπορούν να χειρίζονται pseudonymous responses χωρίς contact permission. Η διάκριση εφαρμόζεται με ξεχωριστά application roles και database policies.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Consent boundary</div>
      <h2>Διαφορετικός σκοπός, διαφορετική επιλογή.</h2>
      <p>Η συμμετοχή στην έρευνα καταγράφεται χωριστά από την προαιρετική ενημέρωση για τα δημοσιευμένα αποτελέσματα και από την προαιρετική παράδοση thank-you benefit. Εμπορικό marketing consent δεν αποτελεί research consent και δεν συλλέγεται μέσα στο scientific questionnaire.</p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>End of linkage</div>
      <h2>Το identity linkage έχει ημερομηνία λήξης.</h2>
      <p>Η διάρκεια διατήρησης δεν είναι hard-coded χωρίς policy decision. Πριν επιτραπεί destruction πρέπει να έχει οριστεί ρητά retention date και να υπάρχει published frozen release. Μετά τη λήξη της περιόδου, η governed destruction operation ακυρώνει personal access tokens, αποσυνδέει response από invitation, invitation από sample/contact identity και διαγράφει τα contact points της wave.</p>
      <p>Το hash-only suppression ledger παραμένει ώστε ένα research opt-out, complaint ή hard bounce να μη χαθεί σε επόμενη wave. Τα ήδη δημοσιευμένα aggregate releases παραμένουν immutable research records.</p>
    </section>

    <SiteFooter />
  </main>;
}
