import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../components/SiteFooter";
import styles from "../../components/ResearchSurveyPage.module.css";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research", {
    title: "Παρατηρητήριο Ελληνικού Λιανεμπορίου · KONTA MOY Research",
    description: "Το μόνιμο Παρατηρητήριο Ελληνικού Λιανεμπορίου του KONTA MOY: ετήσιες ερευνητικές κυματομορφές, μεθοδολογία, δημόσια releases και αναπαραγώγιμα τεκμήρια.",
    keywords: ["Παρατηρητήριο Ελληνικού Λιανεμπορίου", "έρευνα ελληνικού λιανεμπορίου", "Retail Observatory Greece", "στοιχεία λιανεμπορίου Ελλάδα", "μελέτες εμπορικών επιχειρήσεων", "ψηφιακή ωριμότητα λιανεμπορίου"]
  });
}

export default function ResearchObservatoryPage() {
  return <main className={styles.shell}>
    <header className={styles.hero}>
      <div className={styles.brand}>KONTA MOY · RETAIL OBSERVATORY</div>
      <span>Παρατηρητήριο Ελληνικού Λιανεμπορίου</span>
      <h1>Έρευνα που επαναλαμβάνεται, συγκρίνεται και ελέγχεται.</h1>
      <p>
        Το Παρατηρητήριο είναι η μόνιμη ερευνητική υποδομή του KONTA MOY για το ελληνικό λιανεμπόριο.
        Κάθε μελέτη και κάθε wave διατηρεί ξεχωριστό population frame, sample design, questionnaire version,
        fieldwork evidence, quality review, weighting, analysis plan και immutable public release.
      </p>
      <div className={styles.meta}>
        <Link href="/research/greek-retail-2026">Ελληνικό Λιανεμπόριο 2026</Link>
        <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία 2026</Link>
        <Link href="/research/greek-retail-2026/results">Αποτελέσματα 2026</Link>
        <Link href="/research/privacy">Ιδιωτικότητα έρευνας</Link>
      </div>
    </header>

    <section className={styles.invalid}>
      <div className={styles.brand}>Permanent research chain</div>
      <h2>Programme → Study → Wave → Evidence Release</h2>
      <p>
        Η υποδομή σχεδιάζεται για επαναλαμβανόμενες ετήσιες και θεματικές μελέτες χωρίς να ξαναχτίζεται το
        ερευνητικό σύστημα από την αρχή. Η σύγκριση μεταξύ ετών γίνεται μόνο όταν η lineage των μεταβλητών,
        η μεθοδολογία και οι population definitions είναι συμβατές και τεκμηριωμένες.
      </p>
    </section>

    <section className={styles.invalid}>
      <div className={styles.brand}>Wave 2026</div>
      <h2>Ελληνικό Λιανεμπόριο 2026</h2>
      <p>
        Η πρώτη wave εξετάζει ψηφιακή ετοιμότητα, λειτουργική τριβή, τοπική αγορά, marketplaces,
        επενδυτικές προθέσεις και ένα προαιρετικό τυχαιοποιημένο profile-choice experiment.
      </p>
      <div className={styles.meta}>
        <Link href="/research/greek-retail-2026">Μελέτη →</Link>
        <Link href="/research/greek-retail-2026/methodology">Methodology & reproducibility →</Link>
        <Link href="/research/greek-retail-2026/results">Published evidence →</Link>
      </div>
    </section>

    <SiteFooter />
  </main>;
}
