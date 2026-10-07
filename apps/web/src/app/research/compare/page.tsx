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
    description: "Συγκρίνετε δημοσιευμένες waves και αξιολογήστε comparability, uncertainty και provenance στο KONTA MOY Retail Observatory.",
    keywords: [
      "σύγκριση ερευνών λιανεμπορίου",
      "σύγκριση waves έρευνας",
      "αξιολόγηση ερευνητικών αποτελεσμάτων",
      "Retail Observatory Greece",
      "longitudinal retail research",
      "comparability research waves",
      "research uncertainty intervals",
      "research methodology provenance",
      "Greek retail trends",
      "KONTA MOY Research"
    ]
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

function metricWidth(metric: PublicResearchPublishedMetric): number {
  if (metric.metadata.format !== "proportion") return 100;
  return Math.min(Math.max(metric.estimate * 100, 2), 100);
}

function comparabilityLabel(value?: string, policy?: string): string {
  if (value === "exact" || policy === "core_exact") return "Exact";
  if (value === "harmonised" || policy === "core_harmonisable") return "Harmonised";
  if (value === "break" || policy === "not_comparable") return "Break";
  return "Wave-specific";
}

function comparabilityClass(value?: string, policy?: string): string {
  const label = comparabilityLabel(value, policy);
  if (label === "Exact") return styles.chipExact;
  if (label === "Harmonised") return styles.chipHarmonised;
  if (label === "Break") return styles.chipBreak;
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
  const harmonised = comparisons.filter((item) => item.harmonisationStatus === "harmonised" || item.comparabilityPolicy === "core_harmonisable").length;
  const breaks = comparisons.filter((item) => item.harmonisationStatus === "break" || item.comparabilityPolicy === "not_comparable").length;
  const publishedWaves = new Set(metrics.map((metric) => metric.waveSlug)).size;

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
          <h1>Trend lines μόνο όταν η σύγκριση επιτρέπεται.</h1>
          <p>Το Observatory δεν ενώνει δύο waves επειδή μοιάζουν οι τίτλοι τους. Συγκρίνει μόνο governed metrics από published releases και εμφανίζει ρητά αν η σχέση είναι Exact, Harmonised ή methodological Break.</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, styles.badgeDark].join(" ")}>{publishedWaves} published waves</span>
            <span className={styles.badge}>{comparisons.length} comparison specs</span>
            <span className={styles.badge}>{metrics.length} public metrics</span>
          </div>

          <div className={styles.tabbar}>
            <Link href="/research">Μελέτες</Link>
            <Link className={styles.primaryButton} href="/research/compare">Σύγκριση</Link>
            <Link href="/research/privacy">Privacy</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Public study waves</span>
          <strong>{snapshot.studies.length}</strong>
          <hr />
          <span>Exact comparisons</span>
          <strong>{exact}</strong>
          <hr />
          <span>Harmonised / breaks</span>
          <strong>{harmonised} / {breaks}</strong>
        </aside>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Comparability registry</div>
            <h2>Τι επιτρέπεται να συγκριθεί;</h2>
          </div>
          <p>Η comparability είναι μέρος του research evidence. Ένα methodological break δεν κρύβεται και δεν μετατρέπεται σε trend line απλώς για να είναι πιο όμορφο το chart.</p>
        </div>

        <div className={styles.metrics}>
          <article className={styles.metric}><span>Exact</span><strong>{exact}</strong><small>ίδιο construct / locked identity</small></article>
          <article className={styles.metric}><span>Harmonised</span><strong>{harmonised}</strong><small>σύγκριση μέσω explicit rule</small></article>
          <article className={styles.metric}><span>Break</span><strong>{breaks}</strong><small>μη άμεση longitudinal σύγκριση</small></article>
          <article className={styles.metric}><span>Published metrics</span><strong>{metrics.length}</strong><small>unsuppressed overall estimates</small></article>
        </div>

        {comparisons.length > 0 ? <div className={styles.compareTableWrap} style={{ marginTop: 16 }}>
          <table className={styles.compareTable}>
            <thead><tr><th>Μεταβλητή</th><th>Baseline</th><th>Comparison</th><th>Comparability</th><th>Estimator</th></tr></thead>
            <tbody>{comparisons.map((item) => {
              const label = comparabilityLabel(item.harmonisationStatus, item.comparabilityPolicy);
              return <tr key={[item.variableKey,item.baselineWaveSlug,item.comparisonWaveSlug].join(":")}>
                <td><strong>{item.variableLabel}</strong><br /><span className={styles.mono}>{item.variableKey}</span></td>
                <td>{item.baselineWaveTitle}</td>
                <td>{item.comparisonWaveTitle}</td>
                <td><span className={[styles.chip, comparabilityClass(item.harmonisationStatus, item.comparabilityPolicy)].filter(Boolean).join(" ")}>{label}</span></td>
                <td>{item.estimator}</td>
              </tr>;
            })}</tbody>
          </table>
        </div> : <div className={styles.empty} style={{ marginTop: 16 }}>
          <strong>Δεν υπάρχει ακόμη locked longitudinal pair.</strong><br />
          Αυτό είναι αναμενόμενο όσο υπάρχει μόνο μία δημοσιευμένη wave. Η registry ενεργοποιείται όταν υπάρχει δεύτερη wave και έχει κλειδωθεί η comparability specification.
        </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Published metrics</div>
            <h2>Δίπλα-δίπλα, με uncertainty ορατό.</h2>
          </div>
          <p>Οι κάρτες παρακάτω εμφανίζουν μόνο overall, unsuppressed estimates από immutable public releases. Η οπτική σύγκριση δεν υπερισχύει ποτέ του comparability status.</p>
        </div>

        {comparableMetricGroups.length > 0
          ? <div className={styles.compareCards}>{comparableMetricGroups.map(([key, values]) => <article className={styles.compareCard} key={key}>
              <div className={styles.compareCardHead}>
                <div>
                  <div className={styles.eyebrow}>Governed metric</div>
                  <h3>{metricLabel(values[0]!)}</h3>
                </div>
                <span className={styles.chip}>{values.length} waves</span>
              </div>

              <div className={styles.compareRows}>
                {values.map((metric) => <div className={styles.compareRow} key={metric.waveSlug}>
                  <span>{metric.waveTitle}</span>
                  <div>
                    <div className={styles.compareMiniBar} aria-hidden="true"><i style={{ width: metricWidth(metric).toFixed(1) + "%" }} /></div>
                    <span>95% CI {interval(metric)} · n={metric.unweightedN.toLocaleString("el-GR")}</span>
                  </div>
                  <strong>{metricValue(metric)}</strong>
                </div>)}
              </div>
            </article>)}</div>
          : <div className={styles.empty}>
              <strong>Χρειάζονται τουλάχιστον δύο published waves.</strong><br />
              Μόλις δύο releases μοιράζονται το ίδιο governed metric key, το side-by-side evidence view ενεργοποιείται εδώ.
            </div>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Evaluation framework</div>
            <h2>Αξιολόγηση χωρίς έναν αδιαφανή “μαγικό” βαθμό.</h2>
          </div>
          <p>Η ποιότητα δεν συμπυκνώνεται σε ένα score. Το UX διαχωρίζει τις διαφορετικές διαστάσεις ώστε ο αναγνώστης να βλέπει πού είναι ισχυρή ή περιορισμένη μια μελέτη.</p>
        </div>

        <div className={styles.trustGrid}>
          <article className={styles.trustCard}><div className={styles.eyebrow}>01 · Coverage</div><strong>Sample & completeness</strong><p>Selected sample, target completes, actual completions και strata/coverage diagnostics όταν είναι διαθέσιμα.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>02 · Fieldwork</div><strong>Response behaviour</strong><p>Delivery, starts, completion και response rate ως operational evidence — όχι ως υποκατάστατο representativeness.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>03 · Analysis</div><strong>Uncertainty & weighting</strong><p>Confidence intervals, analytical n, weighting diagnostics και suppression rules παραμένουν μέρος της ανάγνωσης.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>04 · Integrity</div><strong>Release provenance</strong><p>Dataset hash, artifact hash και analysis run συνδέουν τη δημοσίευση με το evidence που την παρήγαγε.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>05 · Longitudinal</div><strong>Comparability</strong><p>Exact, harmonised και break classifications εμποδίζουν ψευδείς trend claims όταν αλλάζει το construct ή το instrument.</p></article>
          <article className={styles.trustCard}><div className={styles.eyebrow}>06 · Transparency</div><strong>Public method</strong><p>Η μεθοδολογία μένει προσβάσιμη από κάθε study και results view, όχι μόνο από ένα απομονωμένο technical appendix.</p></article>
        </div>
      </section>

      <div className={styles.footer}>Comparisons are evidence objects, not chart decorations.</div>
    </div>
    <SiteFooter />
  </main>;
}
