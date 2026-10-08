import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/SiteFooter";
import styles from "../../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../../lib/research-observatory-runtime";
import { getPublishedResearchResults, type PublishedResearchEstimate } from "../../../../lib/research-survey-release";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  return governedStaticSeoMetadata("/research/" + slug + "/results", {
    title: (study?.title ?? "Μελέτη") + " · Αποτελέσματα · KONTA MOY Research",
    description: "Δημοσιευμένα αποτελέσματα της μελέτης με μέγεθος δείγματος και διαστήματα εμπιστοσύνης όπου είναι διαθέσιμα."
  });
}

function label(estimate: PublishedResearchEstimate): string {
  const value = estimate.metadata.label;
  return typeof value === "string" && value.trim() ? value : "Δημοσιευμένος δείκτης";
}

function value(estimate: PublishedResearchEstimate, raw: number): string {
  if (estimate.metadata.format === "proportion") {
    return new Intl.NumberFormat("el-GR", { style: "percent", maximumFractionDigits: 1 }).format(raw);
  }
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 2 }).format(raw);
}

function visualWidth(estimate: PublishedResearchEstimate): number | undefined {
  if (estimate.metadata.format !== "proportion" || estimate.estimate == null) return undefined;
  return Math.min(Math.max(estimate.estimate * 100, 0), 100);
}

export default async function ResearchResultsPage({ params }: PageProps) {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  if (!study) notFound();
  const published = await getPublishedResearchResults(study.waveSlug);

  const overall = published?.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    Object.keys(estimate.segment).length === 0
  ) ?? [];

  const themes = [
    { title: "Επιχειρηματικό κλίμα και οικονομία", description: "Αυτοαναφερόμενες οικονομικές εξελίξεις και προσδοκίες — όχι λογιστικά επαληθευμένα στοιχεία.", keys: ["business_confidence.","revenue_up_profit_down.","business_optimism.","sales_outlook.","profit_outlook.","economic_trends.","economic_pressures."] },
    { title: "Ηλεκτρονικό εμπόριο και πρώτη online πώληση", description: "Στάσεις, υφιστάμενα κανάλια και εμπόδια για επιχειρήσεις που δεν πωλούν online.", keys: ["ecommerce_attitude.","first_sale_barriers.","sales_channels.","digital_sales_share."] },
    { title: "Marketplaces και εξάρτηση", description: "Αναφερόμενες εμπειρίες νυν και πρώην χρηστών · οι απαντήσεις δεν τεκμηριώνουν αιτιώδη επίδραση.", keys: ["marketplace_profitability_decline.","marketplace_dependence_increase.","marketplace_effects.","marketplace_revenue_dependence.","marketplace_experience."] },
    { title: "Τοπική αγορά και ψηφιακή προβολή", description: "Διαφοροποιήσεις ανά περιοχή και αυτοαναφερόμενη επίδραση στο φυσικό κατάστημα.", keys: ["online_to_local_impact.","settlement_class.","local_product_discovery_importance.","local_customer_share."] },
    { title: "Ετοιμότητα, λειτουργία και επόμενες επενδύσεις", description: "Ενδείξεις ψηφιακής ετοιμότητας, δυσκολιών και σχεδίων για την επόμενη χρονιά.", keys: ["digital_readiness.","retail_friction.","top_growth_barriers.","operational_friction.","investment_intentions."] }
  ];
  const seen = new Set<string>();
  const resultSections = themes.map((theme) => {
    const estimates = overall.filter((estimate) => theme.keys.some((key) => estimate.metricKey.startsWith(key))).slice(0,16);
    estimates.forEach((estimate) => seen.add(estimate.metricKey));
    return { title: theme.title, description: theme.description, estimates };
  }).filter((section) => section.estimates.length > 0);
  const otherEstimates = overall.filter((estimate) => !seen.has(estimate.metricKey)).slice(0,20);
  if (otherEstimates.length) resultSections.push({
    title: "Πρόσθετοι δημοσιευμένοι δείκτες",
    description: "Περαιτέρω αποτελέσματα του ερωτηματολογίου.",
    estimates: otherEstimates
  });

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · ΕΡΕΥΝΑ</Link>
        <nav className={styles.nav} aria-label="Έρευνα">
          <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
          <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
          <Link href={"/research/" + study.waveSlug + "/results"}>Αποτελέσματα</Link>
          <Link href="/research/market-sentiment">Άλλοι φορείς</Link>
          <Link href="/research/compare">Σύγκριση</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{study.programmeTitle}</div>
          <h1>{published ? "Αποτελέσματα" : "Τα αποτελέσματα δεν έχουν δημοσιευθεί ακόμη."}</h1>
          <p>{published
            ? "Παρακάτω εμφανίζονται τα δημοσιευμένα αποτελέσματα της μελέτης. Κάθε τιμή συνοδεύεται από το μέγεθος του δείγματος και, όπου είναι διαθέσιμο, από διάστημα εμπιστοσύνης."
            : "Τα αποτελέσματα θα εμφανιστούν αφού ολοκληρωθούν η συλλογή απαντήσεων, οι έλεγχοι ποιότητας και η ανάλυση."}</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, published ? styles.badgeDark : styles.badgeWarm].join(" ")}>{published ? "Δημοσιευμένα" : "Αναμένονται"}</span>
            <span className={styles.badge}>Μόνο τελικά αποτελέσματα</span>
          </div>

          <div className={styles.tabbar}>
            <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
            <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
            <Link className={published ? styles.primaryButton : ""} href={"/research/" + study.waveSlug + "/results"}>Αποτελέσματα</Link>
            <Link href="/research/compare">Σύγκριση μελετών</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Κατάσταση</span>
          <strong>{published ? "Δημοσιευμένα" : "Σε αναμονή"}</strong>
          <hr />
          <span>Δημοσιευμένοι δείκτες</span>
          <strong>{overall.length}</strong>
          <hr />
          <span>Μεγαλύτερο δείγμα</span>
          <strong>{overall.length > 0 ? Math.max(...overall.map((item) => item.unweightedN)).toLocaleString("el-GR") : "—"}</strong>
          {published?.publishedAt && <span>Δημοσιεύτηκε {new Date(published.publishedAt).toLocaleDateString("el-GR")}</span>}
        </aside>
      </header>

      {published ? <>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Κύρια αποτελέσματα</div>
              <h2>Οι βασικοί δημοσιευμένοι δείκτες</h2>
            </div>
            <p>Το 95% διάστημα εμπιστοσύνης δείχνει την αβεβαιότητα της εκτίμησης όταν αυτή μπορεί να υπολογιστεί. Το n δείχνει πόσες απαντήσεις χρησιμοποιήθηκαν.</p>
          </div>

          {resultSections.map((group) => <div key={group.title} style={{ marginBottom: 30 }}>
            <h3 style={{ marginBottom: 8 }}>{group.title}</h3>
            <p>{group.description}</p>
            <div className={styles.resultsGrid}>
              {group.estimates.map((estimate) => {
                const width = visualWidth(estimate);
                return <article className={styles.resultCard} key={estimate.metricKey}>
                  <div className={styles.eyebrow}>{label(estimate)}</div>
                  <strong>{value(estimate, estimate.estimate!)}</strong>
                  <span>
                    {estimate.ciLower != null && estimate.ciUpper != null
                      ? "95% διάστημα εμπιστοσύνης " + value(estimate, estimate.ciLower) + " – " + value(estimate, estimate.ciUpper) + " · "
                      : ""}
                    n={estimate.unweightedN.toLocaleString("el-GR")}
                    {typeof estimate.metadata.denominator === "string" ? " · Ειδική ομάδα ερωτηθέντων" : ""}
                  </span>
                  {width != null && <div className={styles.resultBar} aria-hidden="true"><div className={styles.resultBarFill} style={{ width: width.toFixed(1) + "%" }} /></div>}
                </article>;
              })}
            </div>
          </div>)}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Σωστή ανάγνωση</div>
              <h2>Δείτε το αποτέλεσμα μαζί με τη μέθοδο.</h2>
            </div>
            <p>Ένα ποσοστό ή ένας δείκτης δεν πρέπει να διαβάζεται μόνος του. Η μεθοδολογία εξηγεί ποιον αφορά η μελέτη, πόσοι συμμετείχαν και ποιοι περιορισμοί πρέπει να ληφθούν υπόψη.</p>
          </div>

          <div className={styles.split}>
            <article className={styles.panel}>
              <div className={styles.eyebrow}>Μεθοδολογία</div>
              <h3>Πώς έγινε η μελέτη</h3>
              <p>Δείτε τον πληθυσμό, το δείγμα, την περίοδο συλλογής και τις βασικές αρχές ανάλυσης.</p>
              <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/methodology"}>Άνοιγμα μεθοδολογίας →</Link>
            </article>
            <article className={styles.panel}>
              <div className={styles.eyebrow}>Σύγκριση</div>
              <h3>Συγκρίνετε με προσοχή</h3>
              <p>Η σελίδα σύγκρισης δείχνει πότε δύο αποτελέσματα είναι άμεσα συγκρίσιμα και πότε χρειάζεται προσοχή.</p>
              <Link className={styles.cardLink} href="/research/compare">Σύγκριση μελετών →</Link>
            </article>
          </div>
        </section>
      </> : <section className={styles.section}>
        <div className={styles.empty}>
          <strong>Δεν έχουν δημοσιευθεί αποτελέσματα ακόμη.</strong><br />
          Μπορείτε να παρακολουθείτε την πρόοδο της μελέτης μέχρι να ολοκληρωθεί η ανάλυση.
          <br /><br /><Link className={styles.cardLink} href={"/research/" + study.waveSlug}>Επιστροφή στην επισκόπηση →</Link>
        </div>
      </section>}

      <div className={styles.footer}>KONTA MOY Research · Δημοσιευμένα αποτελέσματα</div>
    </div>
    <SiteFooter />
  </main>;
}
