import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import { ResearchStudyDashboard } from "../../../components/ResearchStudyDashboard";
import styles from "../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026", {
    title: "Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
    description: "Ζωντανή πρόοδος, μεθοδολογία και δημοσιευμένα αποτελέσματα της μελέτης Ελληνικό Λιανεμπόριο 2026.",
    keywords: ["Ελληνικό Λιανεμπόριο 2026", "έρευνα εμπορικών επιχειρήσεων", "ψηφιακή ετοιμότητα επιχειρήσεων", "λειτουργικές δυσκολίες λιανεμπορίου", "marketplaces ελληνικές επιχειρήσεις", "Greek retail study 2026"]
  });
}

export default async function GreekRetailResearchPage() {
  const study = await publicResearchStudy("greek-retail-2026");
  if (study) return <>
    <ResearchStudyDashboard study={study} />
    <SiteFooter />
  </>;

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href="/research">Μελέτες</Link>
          <Link href="/research/greek-retail-2026/methodology">Μεθοδολογία</Link>
          <Link href="/research/greek-retail-2026/results">Αποτελέσματα</Link>
          <Link href="/research/compare">Σύγκριση</Link>
        </nav>
      </div>
      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Greek Retail Observatory · Wave 2026</div>
          <h1>Ελληνικό Λιανεμπόριο 2026</h1>
          <p>Μια επαναλήψιμη μελέτη για το πώς λειτουργούν, ψηφιοποιούνται, προσεγγίζουν πελάτες και αντιμετωπίζουν καθημερινά εμπόδια οι ελληνικές εμπορικές επιχειρήσεις.</p>
        </div>
        <aside className={styles.heroAside}>
          <span>Live data</span>
          <strong>Pending schema activation</strong>
          <span>Η σελίδα θα αρχίσει να εμφανίζει αυτόματα governed aggregates μόλις ενεργοποιηθεί το Research schema στην production βάση.</span>
        </aside>
      </header>
      <section className={styles.section}>
        <div className={styles.notice}>Το UX/UI της δημόσιας μελέτης είναι ενεργό, αλλά δεν εμφανίζουμε κατασκευασμένους αριθμούς όταν το Research database projection δεν είναι διαθέσιμο.</div>
      </section>
      <div className={styles.footer}>KONTA MOY Research · governed public evidence</div>
    </div>
    <SiteFooter />
  </main>;
}
