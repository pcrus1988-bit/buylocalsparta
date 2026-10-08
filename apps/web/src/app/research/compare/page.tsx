import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import styles from "../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import {
  publicResearchComparisons,
  publicResearchObservatory,
  publicResearchPublishedMetrics,
  type PublicResearchPublishedMetric
} from "../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/compare", {
    title: "Σύγκριση μελετών · KONTA MOY Research",
    description: "Συγκρίνετε δημοσιευμένα αποτελέσματα και δείτε πότε δύο μελέτες μπορούν να συγκριθούν με ασφάλεια.",
    keywords: [
      "σύγκριση ερευνών λιανεμπορίου",
      "σύγκριση μελετών λιανεμπορίου",
      "αξιολόγηση ερευνητικών αποτελεσμάτων",
      "ελληνικό λιανεμπόριο τάσεις",
      "KONTA MOY Research"
    ]
  });
}

function metricLabel(metric: PublicResearchPublishedMetric): string {
  const label = metric.metadata.label;
  return typeof label === "string" && label.trim() ? label : "Δημοσιευμένος δείκτης";
}

function metricValue(metric: PublicResearchPublishedMetric): string {
  if (metric.metadata.format === "proportion") {
    return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(metric.estimate);
  }
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(metric.estimate);
}

function interval(metric: PublicResearchPublishedMetric): string {
  if (metric.ciLower == null || metric.ciUpper == null) return "—";
  if (metric.metadata.format === "proportion") {
    const f = (value: number) => new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(value);
    return f(metric.ciLower) + " – " + f(metric.ciUpper);
  }
  const f = (value: number) => new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(value);
  return f(metric.ciLower) + " – " + f(metric.ciUpper);
}

function metricWidth(metric: PublicResearchPublishedMetric): number {
  if (metric.metadata.format !== "proportion") return 100;
  return Math.min(Math.max(metric.estimate * 100, 2), 100);
}

function publicPeriodLabel(value: string): string {
  const cleaned = value.replace(/\bwave\b/gi, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || "Μελέτη";
}

function comparisonLabel(value?: string, policy?: string): string {
  if (value === "exact" || policy === "core_exact") return "Άμεσα συγκρίσιμη";
  if (value === "harmonised" || policy === "core_harmonisable") return "Συγκρίσιμη με προσαρμογή";
  if (value === "break" || policy === "not_comparable") return "Δεν συγκρίνεται άμεσα";
  return "Μόνο για τη συγκεκριμένη μελέτη";
}

function comparisonClass(value?: string, policy?: string): string {
  const label = comparisonLabel(value, policy);
  if (label === "Άμεσα συγκρίσιμη") return styles.chipExact;
  if (label === "Συγκρίσιμη με προσαρμογή") return styles.chipHarmonised;
  if (label === "Δεν συγκρίνεται άμεσα") return styles.chipBreak;
  return "";
}

export default async function ResearchComparePage() {
  const [snapshot, comparisons, metrics] = await Promise.all([
    publicResearchObservatory(),
    publicResearchComparisons(),
    publicResearchPublishedMetrics()
  ]);

  const metricGroups = new Map<string, PublicResearchPublishedMetric[]>();
  for (const metric of metrics) {
    const group = metricGroups.get(metric.metricKey) ?? [];
    group.push(metric);
    metricGroups.set(metric.metricKey, group);
  }

  const comparableMetricGroups = [...metricGroups.entries()]
    .filter(([, values]) => values.length >= 2)
    .slice(0, 20);

  const exact = comparisons.filter((item) => item.harmonisationStatus === "exact" || item.comparabilityPolicy === "core_exact").length;
  const adjusted = comparisons.filter((item) => item.harmonisationStatus === "harmonised" || item.comparabilityPolicy === "core_harmonisable").length;
  const breaks = comparisons.filter((item) => item.harmonisationStatus === "break" || item.comparabilityPolicy === "not_comparable").length;
  const publishedStudies = new Set(metrics.map((metric) => metric.waveSlug)).size;

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · ΕΡΕΥΝΑ</Link>
        <nav className={styles.nav} aria-label="Έρευνα">
          <Link href="/research">Μελέτες</Link>
          <Link href="/research/market-sentiment">Άλλοι φορείς</Link>
          <Link href="/research/compare">Σύγκριση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Σύγκριση μελετών</div>
          <h1>Συγκρίνετε αποτελέσματα χωρίς παραπλανητικές συνδέσεις.</h1>
          <p>Δύο αποτελέσματα δεν είναι πάντα άμεσα συγκρίσιμα. Εδώ εμφανίζουμε μόνο τις συγκρίσεις που έχουν ελεγχθεί και εξηγούμε με απλά λόγια αν είναι άμεσες, αν χρειάζονται προσαρμογή ή αν δεν πρέπει να γίνουν.</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, styles.badgeDark].join(" ")}>{publishedStudies} μελέτες με αποτελέσματα</span>
            <span className={styles.badge}>{comparisons.length} διαθέσιμες συγκρίσεις</span>
            <span className={styles.badge}>{metrics.length} δημοσιευμένοι δείκτες</span>
          </div>

          <div className={styles.tabbar}>
            <Link href="/research">Μελέτες</Link>
            <Link className={styles.primaryButton} href="/research/compare">Σύγκριση</Link>
            <Link href="/research/market-sentiment">Άλλοι φορείς</Link>
            <Link href="/research/privacy">Ιδιωτικότητα</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Μελέτες με αποτελέσματα</span>
          <strong>{publishedStudies}</strong>
          <hr />
          <span>Άμεσες συγκρίσεις</span>
          <strong>{exact}</strong>
          <hr />
          <span>Με προσαρμογή / μη άμεσες</span>
          <strong>{adjusted} / {breaks}</strong>
        </aside>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Καταλληλότητα σύγκρισης</div>
            <h2>Μπορούν να συγκριθούν;</h2>
          </div>
          <p>Η ένδειξη δίπλα σε κάθε ζεύγος εξηγεί αν η σύγκριση είναι απλή ή αν χρειάζεται ιδιαίτερη προσοχή.</p>
        </div>

        <div className={styles.metrics}>
          <article className={styles.metric}><span>Άμεσα συγκρίσιμες</span><strong>{exact}</strong><small>ίδιος τρόπος μέτρησης</small></article>
          <article className={styles.metric}><span>Με προσαρμογή</span><strong>{adjusted}</strong><small>η σύγκριση χρειάζεται ερμηνεία</small></article>
          <article className={styles.metric}><span>Μη άμεσες</span><strong>{breaks}</strong><small>δεν πρέπει να παρουσιαστούν ως απλή μεταβολή</small></article>
          <article className={styles.metric}><span>Δημοσιευμένοι δείκτες</span><strong>{metrics.length}</strong><small>διαθέσιμα αποτελέσματα</small></article>
        </div>

        {comparisons.length > 0 ? <div className={styles.compareTableWrap} style={{ marginTop: 16 }}>
          <table className={styles.compareTable}>
            <thead><tr><th>Θέμα</th><th>Πρώτη μελέτη</th><th>Δεύτερη μελέτη</th><th>Σύγκριση</th></tr></thead>
            <tbody>{comparisons.map((item) => {
              const label = comparisonLabel(item.harmonisationStatus, item.comparabilityPolicy);
              return <tr key={[item.variableKey,item.baselineWaveSlug,item.comparisonWaveSlug].join(":")}>
                <td><strong>{item.variableLabel}</strong></td>
                <td>{publicPeriodLabel(item.baselineWaveTitle)}</td>
                <td>{publicPeriodLabel(item.comparisonWaveTitle)}</td>
                <td><span className={[styles.chip, comparisonClass(item.harmonisationStatus, item.comparabilityPolicy)].filter(Boolean).join(" ")}>{label}</span></td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className={styles.empty} style={{ marginTop: 16 }}>
          <strong>Δεν υπάρχουν ακόμη αρκετές δημοσιευμένες μελέτες για σύγκριση.</strong><br />
          Η ενότητα θα ενημερωθεί όταν υπάρχουν αποτελέσματα από τουλάχιστον δύο κατάλληλες μελέτες.
        </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Αποτελέσματα</div>
            <h2>Δίπλα-δίπλα, με την αβεβαιότητα ορατή.</h2>
          </div>
          <p>Για κάθε κοινό δείκτη εμφανίζονται η τιμή, το μέγεθος του δείγματος και το 95% διάστημα εμπιστοσύνης όπου είναι διαθέσιμο.</p>
        </div>

        {comparableMetricGroups.length > 0
          ? <div className={styles.compareCards}>{comparableMetricGroups.map(([key, values]) => <article className={styles.compareCard} key={key}>
              <div className={styles.compareCardHead}>
                <div>
                  <div className={styles.eyebrow}>Δείκτης</div>
                  <h3>{metricLabel(values[0]!)}</h3>
                </div>
                <span className={styles.chip}>{values.length} μελέτες</span>
              </div>

              <div className={styles.compareRows}>
                {values.map((metric) => <div className={styles.compareRow} key={metric.waveSlug}>
                  <span>{publicPeriodLabel(metric.waveTitle)}</span>
                  <div>
                    <div className={styles.compareMiniBar} aria-hidden="true"><i style={{ width: metricWidth(metric).toFixed(1) + "%" }} /></div>
                    <span>95% διάστημα εμπιστοσύνης {interval(metric)} · n={metric.unweightedN.toLocaleString("el-GR")}</span>
                  </div>
                  <strong>{metricValue(metric)}</strong>
                </div>)}
              </div>
            </article>)}</div>
          : <div className={styles.empty}>
              <strong>Δεν υπάρχουν ακόμη δύο δημοσιευμένες μελέτες με κοινό δείκτη.</strong>
            </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Πώς αξιολογούμε μια σύγκριση</div>
            <h2>Τέσσερα πράγματα που αξίζει να κοιτάξετε.</h2>
          </div>
          <p>Η ποιότητα μιας σύγκρισης δεν κρίνεται από έναν μόνο αριθμό.</p>
        </div>

        <div className={styles.trustGrid}>
          <article className={styles.trustCard}><div className={styles.eyebrow}>01 · Δείγμα</div><strong>Πόσοι συμμετείχαν</strong><p>Μικρότερα δείγματα συνήθως σημαίνουν μεγαλύτερη αβεβαιότητα.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>02 · Μέτρηση</div><strong>Μετρήθηκε το ίδιο πράγμα;</strong><p>Η ίδια ονομασία δεν αρκεί αν η ερώτηση ή ο τρόπος μέτρησης άλλαξε.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>03 · Αβεβαιότητα</div><strong>Πόσο σταθερή είναι η διαφορά;</strong><p>Τα διαστήματα εμπιστοσύνης βοηθούν να εκτιμηθεί η αβεβαιότητα γύρω από κάθε αποτέλεσμα.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>04 · Πλαίσιο</div><strong>Τι άλλαξε μεταξύ των μελετών;</strong><p>Χρονική περίοδος, πληθυσμός και συνθήκες συλλογής μπορούν να επηρεάσουν την ερμηνεία.</p></article>
        </div>
      </section>

      <div className={styles.footer}>KONTA MOY Research · Οι συγκρίσεις παρουσιάζονται μόνο όταν είναι κατάλληλες</div>
    </div>
    <SiteFooter />
  </main>;
}
