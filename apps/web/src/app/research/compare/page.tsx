import type { Metadata } from "next";
import Link from "next/link";
import { SiteFooter } from "../../../components/SiteFooter";
import { ResearchExternalAnalysis } from "../../../components/ResearchExternalAnalysis";
import { ResearchSpendingDrivers } from "../../../components/ResearchSpendingDrivers";
import { EXTERNAL_GROUPS, EXTERNAL_STUDIES } from "../../../lib/research-external-analysis";
import styles from "../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import {
  publicResearchComparisons,
  publicResearchPublishedMetrics,
  type PublicResearchPublishedMetric
} from "../../../lib/research-observatory-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/compare", {
    title: "Σύγκριση μελετών · KONTA MOY Research",
    description: "Διαδραστική σύγκριση ελληνικών και ευρωπαϊκών δεικτών, ιστορικών μελετών και δημοσιευμένων αποτελεσμάτων του KONTA MOY με πηγές και μεθοδολογία.",
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

export default async function ResearchComparePage({
  searchParams
}: {
  searchParams: Promise<{ view?: string; indicator?: string }>;
}) {
  const { view, indicator } = await searchParams;

  // External public evidence is local, read-only and requires no database access.
  // Only the explicitly selected own-study view loads published survey aggregates.
  if (view !== "ours") {
    const selectedGroup = EXTERNAL_GROUPS.find((group) => group.id === indicator) ?? EXTERNAL_GROUPS[0]!;
    const directGroups = EXTERNAL_GROUPS.filter((group) => group.comparison === "direct").length;

    return <main className={styles.shell}>
      <div className={styles.frame}>
        <div className={styles.topbar}>
          <Link className={styles.brand} href="/research">KONTA MOY · ΕΡΕΥΝΑ</Link>
          <nav className={styles.nav} aria-label="Έρευνα">
            <Link href="/research">Μελέτες</Link>
            <Link href="/research/market-sentiment">Άλλοι φορείς</Link>
            <Link href="/research/compare" aria-current="page">Σύγκριση</Link>
            <Link href="/research/privacy">Ιδιωτικότητα</Link>
          </nav>
        </div>

        <header className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>Παρατηρητήριο · Εργαστήριο συγκρίσεων</div>
            <h1>Συγκρίνετε την αγορά μέσα από δεδομένα, μελέτες και πραγματικές χρονιές.</h1>
            <p>Εξερευνήστε πώς αλλάζουν η δαπάνη των νοικοκυριών, οι τιμές, οι πωλήσεις και η εμπιστοσύνη στην αγορά. Συνδυάστε έτη και δείκτες μόνο όταν οι ορισμοί τους το επιτρέπουν.</p>
            <div className={styles.heroBadges}>
              <span className={[styles.badge, styles.badgeDark].join(" ")}>{EXTERNAL_STUDIES.length} πηγές και εκδόσεις</span>
              <span className={styles.badge}>{EXTERNAL_GROUPS.length} διαθέσιμα γραφήματα</span>
              <span className={styles.badge}>{directGroups} σειρές με άμεση σύγκριση</span>
            </div>
            <div className={styles.tabbar} aria-label="Είδος σύγκρισης">
              <Link className={styles.primaryButton} href="/research/compare" aria-current="page">Δημοσιευμένα στοιχεία αγοράς</Link>
              <Link href="/research/compare?view=ours">Μελέτες KONTA MOY</Link>
              <Link href="/research/market-sentiment">Αρχικές δημοσιεύσεις</Link>
              <Link href="/research/compare#income-spending-relations">Εισόδημα & πληθωρισμός</Link>
            </div>
          </div>
          <aside className={styles.heroAside}>
            <span>Διαδραστικά γραφήματα</span>
            <strong>{EXTERNAL_GROUPS.length}</strong>
            <hr />
            <span>Αρχικές πηγές</span>
            <strong>{EXTERNAL_STUDIES.length}</strong>
            <hr />
            <span>Συγκρίσεις ίδιου ορισμού</span>
            <strong>{directGroups}</strong>
          </aside>
        </header>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Ξεκινήστε από ένα ερώτημα</div>
              <h2>Τι θέλετε να εξετάσετε;</h2>
            </div>
            <p>Επιλέξτε ένα θέμα ή χρησιμοποιήστε τις επιλογές του εργαστηρίου για τη δική σας ανάλυση.</p>
          </div>
          <div className={styles.quickGrid}>
            <Link className={styles.quickLink} href="/research/compare?indicator=household-spending-history#research-workbench-title">
              <span className={styles.eyebrow}>Νοικοκυριά</span>
              <strong>Πώς εξελίσσεται η δαπάνη;</strong>
              <span>Ιστορική πορεία 2019–2025 σε τρέχοντα ευρώ, με τις απαραίτητες επισημάνσεις.</span>
            </Link>
            <Link className={styles.quickLink} href="/research/compare?indicator=retail-monthly#research-workbench-title">
              <span className={styles.eyebrow}>Λιανικό εμπόριο</span>
              <strong>2025 απέναντι στο 2026</strong>
              <span>Επικάλυψη ίδιων μηνών στις επιχειρηματικές προσδοκίες.</span>
            </Link>
            <Link className={styles.quickLink} href="/research/compare?indicator=annual-esi#research-workbench-title">
              <span className={styles.eyebrow}>Ελλάδα και Ευρώπη</span>
              <strong>Πώς αλλάζει το οικονομικό κλίμα;</strong>
              <span>Παράλληλη προβολή εθνικών και ευρωπαϊκών δεικτών.</span>
            </Link>
          </div>
        </section>

        <ResearchExternalAnalysis key={selectedGroup.id} initialGroupId={selectedGroup.id} />
        <ResearchSpendingDrivers />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div><div className={styles.eyebrow}>Μελέτες KONTA MOY</div><h2>Και τα δικά μας αποτελέσματα;</h2></div>
            <p>Η δική μας έρευνα εμφανίζεται στη σύγκριση όταν δημοσιευθούν ελεγμένα αποτελέσματα. Δεν συνδυάζουμε πιλοτικές απαντήσεις με επίσημα στοιχεία.</p>
          </div>
          <div className={styles.sectionActions}>
            <Link className={styles.actionButton} href="/research/compare?view=ours">Σύγκριση μελετών KONTA MOY →</Link>
            <Link className={styles.actionButton} href="/research">Πρόοδος και μεθοδολογία →</Link>
          </div>
        </section>
        <div className={styles.footer}>KONTA MOY Research · Διαδραστικές συγκρίσεις με αναφορά στην αρχική πηγή</div>
      </div>
      <SiteFooter />
    </main>;
  }

  const [comparisons, metrics] = await Promise.all([
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
          <h1>Οι δικές μας μελέτες, συγκρίσιμες όταν υπάρχουν ελεγμένα αποτελέσματα.</h1>
          <p>Δύο αποτελέσματα δεν είναι πάντα άμεσα συγκρίσιμα. Εδώ εμφανίζουμε μόνο τις συγκρίσεις που έχουν ελεγχθεί και εξηγούμε με απλά λόγια αν είναι άμεσες, αν χρειάζονται προσαρμογή ή αν δεν πρέπει να γίνουν.</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, styles.badgeDark].join(" ")}>{publishedStudies} μελέτες με αποτελέσματα</span>
            <span className={styles.badge}>{comparisons.length} διαθέσιμες συγκρίσεις</span>
            <span className={styles.badge}>{metrics.length} δημοσιευμένοι δείκτες</span>
          </div>

          <div className={styles.tabbar} aria-label="Είδος σύγκρισης">
            <Link href="/research/compare">Δημοσιευμένα στοιχεία αγοράς</Link>
            <Link className={styles.primaryButton} href="/research/compare?view=ours" aria-current="page">Μελέτες KONTA MOY</Link>
            <Link href="/research/market-sentiment">Αρχικές δημοσιεύσεις</Link>
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
          Οι πιλοτικές απαντήσεις δεν δημοσιεύονται ως ευρήματα. Στο μεταξύ μπορείτε να αναλύσετε δημοσιευμένα στοιχεία άλλων φορέων. <Link className={styles.cardLink} href="/research/compare">Άνοιγμα συγκρίσεων αγοράς →</Link>
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
