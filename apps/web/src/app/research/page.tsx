import type { Metadata } from "next";
import Link from "next/link";
import { ResearchPublicNavigation } from "../../components/ResearchPublicNavigation";
import { SiteFooter } from "../../components/SiteFooter";
import { governedStaticSeoMetadata } from "../../lib/seo-metadata";
import styles from "./ResearchLanding.module.css";

const study = "/research/greek-retail-2026";
const results = `${study}/results`;
const methodology = `${study}/methodology`;

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research", {
    title: "Ελληνικό Λιανεμπόριο 2026 · Έρευνα KONTA MOY",
    description: "Γνωρίστε την έρευνα Ελληνικό Λιανεμπόριο 2026. Διαβάστε τα ευρήματα, εξερευνήστε τον χάρτη της Ελλάδας και δείτε τη μεθοδολογία και τους περιορισμούς της μελέτης.",
    keywords: ["Ελληνικό Λιανεμπόριο 2026", "έρευνα ελληνικού λιανεμπορίου", "KONTA MOY Research", "αποτελέσματα εμπορικών επιχειρήσεων", "μεθοδολογία έρευνας λιανεμπορίου"]
  });
}

const steps = [
  {
    number: "01 / ΕΥΡΗΜΑΤΑ",
    title: "Διαβάστε τα αποτελέσματα",
    description: "Ξεκινήστε από τα βασικά συμπεράσματα και συνεχίστε στις αναλυτικές θεματικές ενότητες.",
    href: results
  },
  {
    number: "02 / ΓΕΩΓΡΑΦΙΑ",
    title: "Εξερευνήστε τον χάρτη",
    description: "Δείτε τα διαθέσιμα στοιχεία ανά νομό και πώς διαφέρει η εικόνα της αγοράς σε όλη την Ελλάδα.",
    href: `${results}#results-map`
  },
  {
    number: "03 / ΕΠΙΣΤΗΜΟΝΙΚΗ ΒΑΣΗ",
    title: "Κατανοήστε τη μέθοδο",
    description: "Δείτε πώς συγκεντρώθηκαν και αναλύθηκαν οι απαντήσεις, με σαφείς βάσεις και περιορισμούς.",
    href: methodology
  }
] as const;

const topics = [
  "Οικονομικές πιέσεις και βιωσιμότητα",
  "Ψηφιακή μετάβαση και ηλεκτρονικό εμπόριο",
  "Πελάτες και τοπική αγορά",
  "Εμπόδια, επενδύσεις και προοπτικές"
] as const;

export default function ResearchLandingPage() {
  return <main className={styles.shell}>
    <div className={styles.container}>
      <ResearchPublicNavigation active="studies" />

      <header className={styles.hero}>
        <div>
          <span className={styles.eyebrow}>KONTA MOY / ΠΑΡΑΤΗΡΗΤΗΡΙΟ ΛΙΑΝΕΜΠΟΡΙΟΥ</span>
          <h1 className={styles.title}>Ελληνικό<br /><em>Λιανεμπόριο 2026.</em></h1>
          <p className={styles.intro}>
            Τι αντιμετωπίζουν οι επιχειρήσεις στην καθημερινότητά τους;
            Μια έρευνα για το κόστος, την ψηφιακή μετάβαση, την τοπική αγορά
            και το μέλλον του ελληνικού λιανεμπορίου.
          </p>
          <div className={styles.actions}>
            <Link href={results} className={styles.primary}>Δείτε τα ευρήματα <span aria-hidden="true">&nbsp; ↗</span></Link>
            <Link href={study} className={styles.secondary}>Γνωρίστε τη μελέτη</Link>
          </div>
        </div>
        <aside className={styles.heroNote} aria-label="Η έρευνα με μια ματιά">
          <div className={styles.heroNoteTop}><span className={styles.heroYear}>’26</span></div>
          <h2>Η αγορά, με τη δική της φωνή.</h2>
          <p>Απαντήσεις από επιχειρήσεις, επιστημονική ανάλυση και ανοιχτή παρουσίαση των διαθέσιμων ευρημάτων.</p>
        </aside>
      </header>

      <section className={styles.section} aria-labelledby="research-start-title">
        <div className={styles.sectionTop}>
          <div>
            <span className={styles.eyebrow}>Ο ΟΔΗΓΟΣ ΤΗΣ ΕΡΕΥΝΑΣ</span>
            <h2 id="research-start-title" className={styles.sectionTitle}>Από πού θέλετε να ξεκινήσετε;</h2>
          </div>
          <p className={styles.sectionHint}>Τρεις καθαρές διαδρομές για να βρείτε αυτό που σας ενδιαφέρει, χωρίς να χαθείτε στα δεδομένα.</p>
        </div>
        <nav className={styles.steps} aria-label="Πλοήγηση στη μελέτη Ελληνικό Λιανεμπόριο 2026">
          {steps.map(step => <Link key={step.number} href={step.href} className={styles.step}>
            <span className={styles.stepIndex}>{step.number}</span>
            <h3>{step.title}</h3>
            <p>{step.description}</p>
            <span className={styles.stepArrow} aria-hidden="true">↗</span>
          </Link>)}
        </nav>
      </section>

      <section className={[styles.section, styles.inside].join(" ")} aria-labelledby="research-themes-title">
        <div>
          <span className={styles.eyebrow}>ΤΟ ΠΕΡΙΕΧΟΜΕΝΟ</span>
          <h2 id="research-themes-title" className={styles.sectionTitle}>Μια συνολική εικόνα της αγοράς.</h2>
          <p className={styles.insideIntro}>Από την καθημερινή πίεση του λειτουργικού κόστους έως τις αποφάσεις για την επόμενη ημέρα. <Link className={styles.inlineLink} href={results}>Εξερευνήστε τις θεματικές ↗</Link></p>
        </div>
        <div className={styles.topics} aria-label="Βασικοί άξονες έρευνας">
          {topics.map((topic, index) => <div className={styles.topic} key={topic}>
            <span>{String(index + 1).padStart(2, "0")}</span>{topic}
          </div>)}
        </div>
      </section>

      <div className={styles.disclaimer}>
        <p>Τα ευρήματα περιγράφουν το δείγμα της έρευνας. Σε κάθε δημοσιευμένο δείκτη αναφέρεται η βάση απαντήσεων (n), ενώ η <Link className={styles.inlineLink} href={methodology}>μεθοδολογία</Link> εξηγεί πώς πρέπει να ερμηνεύονται οι εκτιμήσεις και οι περιορισμοί τους.</p>
        <nav className={styles.more} aria-label="Περισσότερα από το Παρατηρητήριο">
          <Link href="/research/market-sentiment">Άλλοι φορείς</Link>
          <Link href="/research/compare">Σύγκριση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>
    </div>
    <SiteFooter />
  </main>;
}
