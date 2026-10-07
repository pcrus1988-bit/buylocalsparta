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
    title: "Σύγκριση & αξιολόγηση · KONTA MOY Research",
    description: "Συγκρίνετε δημοσιευμένες waves και αξιολογήστε comparability, uncertainty και provenance στο KONTA MOY Retail Observatory."
  });
}

function metricLabel(metric: PublicResearchPublishedMetric): string {
  const label = metric.metadata.label;
  return typeof label === "string" && label.trim() ? label : metric.metricKey;
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

function comparabilityLabel(value?: string, policy?: string): string {
  if (value === "exact" || policy === "core_exact") return "Exact";
  if (value === "harmonised" || policy === "core_harmonisable") return "Harmonised";
  if (value === "break" || policy === "not_comparable") return "Break";
  return "Wave-specific";
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
    .slice(0, 16);

  const exact = comparisons.filter((item) => item.harmonisationStatus === "exact" || item.comparabilityPolicy === "core_exact").length;
  const harmonised = comparisons.filter((item) => item.harmonisationStatus === "harmonised" || item.comparabilityPolicy === "core_harmonisable").length;
  const breaks = comparisons.filter((item) => item.harmonisationStatus === "break" || item.comparabilityPolicy === "not_comparable").length;

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href="/research">Μελέτες</Link>
          <Link href="/research/compare">Σύγκριση & αξιολόγηση</Link>
          <Link href="/research/privacy">Ιδιωτικότητα</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>Cross-study explorer</div>
          <h1>Σύγκριση με κανόνες, όχι με ομοιότητες τίτλων.</h1>
          <p>Το Observatory συγκρίνει μόνο governed metrics από δημοσιευμένα releases. Η variable lineage και τα harmonisation rules δηλώνουν αν δύο waves είναι exact comparable, harmonised ή αποτελούν methodological break.</p>
        </div>
        <aside className={styles.heroAside}>
          <span>Studies / current waves</span>
          <strong>{snapshot.studies.length}</strong>
          <span>Locked / published comparison specs</span>
          <strong>{comparisons.length}</strong>
        </aside>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Comparability registry</div>
            <h2>Τι επιτρέπεται να συγκριθεί;</h2>
          </div>
          <p>Η κατάσταση comparability είναι μέρος του research evidence. Ένα methodological break δεν κρύβεται· εμφανίζεται ρητά και εμποδίζει μια παραπλανητική trend line.</p>
        </div>
        <div className={styles.metrics}>
          <article className={styles.metric}><span>Exact</span><strong>{exact}</strong><small>ίδιο construct / locked identity</small></article>
          <article className={styles.metric}><span>Harmonised</span><strong>{harmonised}</strong><small>επιτρεπτή σύγκριση μέσω rule</small></article>
          <article className={styles.metric}><span>Break</span><strong>{breaks}</strong><small>μη άμεση σύγκριση</small></article>
          <article className={styles.metric}><span>Published metrics</span><strong>{metrics.length}</strong><small>unsuppressed overall estimates</small></article>
        </div>

        {comparisons.length > 0 ? <div className={styles.panel} style={{ marginTop: 16 }}>
          <table className={styles.compareTable}>
            <thead><tr><th>Μεταβλητή</th><th>Baseline</th><th>Comparison</th><th>Κατάσταση</th><th>Estimator</th></tr></thead>
            <tbody>{comparisons.map((item) => <tr key={[item.variableKey,item.baselineWaveSlug,item.comparisonWaveSlug].join(":")}>
              <td><strong>{item.variableLabel}</strong><br /><span className={styles.mono}>{item.variableKey}</span></td>
              <td>{item.baselineWaveTitle}</td>
              <td>{item.comparisonWaveTitle}</td>
              <td>{comparabilityLabel(item.harmonisationStatus,item.comparabilityPolicy)}</td>
              <td>{item.estimator}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className={styles.empty} style={{ marginTop: 16 }}>
          Δεν υπάρχει ακόμη κλειδωμένο longitudinal pair. Αυτό είναι αναμενόμενο όσο υπάρχει μόνο μία δημοσιευμένη wave. Η registry θα ενεργοποιηθεί όταν προστεθεί δεύτερη wave και κλειδωθεί η comparability specification.
        </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Published metrics</div>
            <h2>Αποτελέσματα δίπλα-δίπλα</h2>
          </div>
          <p>Εδώ εμφανίζονται μόνο overall, unsuppressed estimates από immutable public releases. Η απλή εμφάνιση δίπλα-δίπλα δεν υποκαθιστά το comparability status παραπάνω.</p>
        </div>

        {comparableMetricGroups.length > 0
          ? <div className={styles.resultsGrid}>{comparableMetricGroups.map(([key, values]) => <article className={styles.resultCard} key={key}>
              <div className={styles.eyebrow}>{metricLabel(values[0]!)}</div>
              {values.map((metric) => <div key={metric.waveSlug} style={{ marginTop: 16 }}>
                <strong>{metricValue(metric)}</strong>
                <span>{metric.waveTitle} · 95% CI {interval(metric)} · n={metric.unweightedN.toLocaleString("el-GR")}</span>
              </div>)}
            </article>)}</div>
          : <div className={styles.empty}>
              Χρειάζονται τουλάχιστον δύο published waves με το ίδιο governed metric key για άμεση side-by-side απεικόνιση.
            </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Evaluation</div>
            <h2>Πώς αξιολογείται μια μελέτη;</h2>
          </div>
          <p>Το evaluation layer θα συνδυάζει completeness, response behaviour, QA, weighting diagnostics, uncertainty και release integrity — χωρίς να συμπυκνώνει την επιστημονική ποιότητα σε έναν αδιαφανή “μαγικό” βαθμό.</p>
        </div>
        <div className={styles.split}>
          <article className={styles.panel}>
            <h3>Fieldwork quality</h3>
            <ul><li>στόχος και ολοκληρώσεις</li><li>response rate</li><li>coverage / strata balance</li><li>QA review και exclusions</li></ul>
          </article>
          <article className={styles.panel}>
            <h3>Analytical quality</h3>
            <ul><li>weight diagnostics</li><li>confidence intervals</li><li>suppression / disclosure rules</li><li>dataset + artifact integrity</li></ul>
          </article>
        </div>
      </section>

      <div className={styles.footer}>Comparisons are evidence objects, not chart decorations.</div>
    </div>
    <SiteFooter />
  </main>;
}
