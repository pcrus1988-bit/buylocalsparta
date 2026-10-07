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
    title: (study?.title ?? "Research study") + " · Αποτελέσματα · KONTA MOY Research",
    description: "Δημοσιευμένα, governed αποτελέσματα της μελέτης με uncertainty και provenance."
  });
}

function label(estimate: PublishedResearchEstimate): string {
  const value = estimate.metadata.label;
  return typeof value === "string" && value.trim() ? value : estimate.metricKey;
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
  const release = await getPublishedResearchResults(study.waveSlug);

  const overall = release?.estimates.filter((estimate) =>
    !estimate.suppressed &&
    estimate.estimate != null &&
    Object.keys(estimate.segment).length === 0
  ) ?? [];

  return <main className={styles.shell}>
    <div className={styles.frame}>
      <div className={styles.topbar}>
        <Link className={styles.brand} href="/research">KONTA MOY · RETAIL OBSERVATORY</Link>
        <nav className={styles.nav} aria-label="Research">
          <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
          <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
          <Link href={"/research/" + study.waveSlug + "/results"}>Αποτελέσματα</Link>
          <Link href="/research/compare">Σύγκριση</Link>
        </nav>
      </div>

      <header className={styles.hero}>
        <div>
          <div className={styles.eyebrow}>{study.programmeTitle} · {study.waveTitle}</div>
          <h1>{release ? "Το evidence dashboard." : "Τα αποτελέσματα δεν έχουν δημοσιευθεί ακόμη."}</h1>
          <p>{release
            ? "Κάθε αριθμός σε αυτή τη σελίδα προέρχεται από το immutable public release. Suppressed ή unpublished estimates δεν εμφανίζονται, ενώ uncertainty και analytical base παραμένουν δίπλα στο αποτέλεσμα."
            : "Τα ουσιαστικά findings εμφανίζονται μόνο αφού κλείσει η fieldwork, ολοκληρωθούν QA, weighting και analysis και εγκριθεί το governed public release."}</p>

          <div className={styles.heroBadges}>
            <span className={[styles.badge, release ? styles.badgeDark : styles.badgeWarm].join(" ")}>{release ? "Published evidence" : "Release pending"}</span>
            <span className={styles.badge}>No preliminary findings</span>
          </div>

          <div className={styles.tabbar}>
            <Link href={"/research/" + study.waveSlug}>Επισκόπηση</Link>
            <Link href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
            <Link className={release ? styles.primaryButton : ""} href={"/research/" + study.waveSlug + "/results"}>Αποτελέσματα</Link>
            <Link href="/research/compare">Σύγκριση waves</Link>
          </div>
        </div>

        <aside className={styles.heroAside}>
          <span>Release</span>
          <strong>{release?.releaseVersion ?? "Pending"}</strong>
          <hr />
          <span>Published overall metrics</span>
          <strong>{overall.length}</strong>
          <hr />
          <span>Analytical base</span>
          <strong>{overall.length > 0 ? Math.max(...overall.map((item) => item.unweightedN)).toLocaleString("el-GR") : "—"}</strong>
          {release?.publishedAt && <span>{new Date(release.publishedAt).toLocaleString("el-GR")}</span>}
        </aside>
      </header>

      {release ? <>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Headline evidence</div>
              <h2>Τα δημοσιευμένα overall estimates</h2>
            </div>
            <p>Οι κάρτες δείχνουν estimate, 95% confidence interval όπου υπάρχει και το unweighted analytical n. Για proportions, η μπάρα είναι απλώς οπτική κλίμακα του δημοσιευμένου estimate — όχι ξεχωριστός υπολογισμός.</p>
          </div>

          <div className={styles.resultsGrid}>
            {overall.slice(0,30).map((estimate) => {
              const width = visualWidth(estimate);
              return <article className={styles.resultCard} key={estimate.metricKey}>
                <div className={styles.eyebrow}>{label(estimate)}</div>
                <strong>{value(estimate, estimate.estimate!)}</strong>
                <span>
                  {estimate.ciLower != null && estimate.ciUpper != null
                    ? "95% CI " + value(estimate, estimate.ciLower) + " – " + value(estimate, estimate.ciUpper) + " · "
                    : ""}
                  n={estimate.unweightedN.toLocaleString("el-GR")}
                </span>
                {width != null && <div className={styles.resultBar} aria-hidden="true"><div className={styles.resultBarFill} style={{ width: width.toFixed(1) + "%" }} /></div>}
              </article>;
            })}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Release integrity</div>
              <h2>Το αποτέλεσμα συνοδεύεται από provenance.</h2>
            </div>
            <p>Το δημόσιο release συνδέεται με συγκεκριμένο dataset και analysis run, ώστε η ιστορική δημοσίευση να είναι ελέγξιμη και αναπαραγώγιμη.</p>
          </div>

          <div className={styles.provenanceGrid}>
            <article className={styles.panel}>
              <div className={styles.eyebrow}>Immutable evidence</div>
              <h3>{release.releaseVersion}</h3>
              <div className={styles.hashBlock}><span className={styles.eyebrow}>Dataset SHA-256</span><p className={styles.mono}>{release.datasetSha256}</p></div>
              <div className={styles.hashBlock}><span className={styles.eyebrow}>Artifact SHA-256</span><p className={styles.mono}>{release.artifactSha256}</p></div>
              <div className={styles.hashBlock}><span className={styles.eyebrow}>Analysis run</span><p className={styles.mono}>{release.analysisRunId}</p></div>
            </article>
            <article className={styles.panel}>
              <div className={styles.eyebrow}>Context</div>
              <h3>Μην διαβάζετε ένα estimate μόνο του.</h3>
              <p>Χρησιμοποιήστε τη μεθοδολογία για να δείτε population και fieldwork και το comparison explorer για να ελέγξετε αν μια άλλη wave είναι πραγματικά συγκρίσιμη.</p>
              <div className={styles.sectionActions}>
                <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href="/research/compare">Σύγκριση waves</Link>
                <Link className={styles.actionButton} href={"/research/" + study.waveSlug + "/methodology"}>Μεθοδολογία</Link>
              </div>
            </article>
          </div>
        </section>
      </> : <section className={styles.section}>
        <div className={styles.empty}>
          <strong>Το public release δεν υπάρχει ακόμη.</strong><br />
          Μπορείτε να παρακολουθείτε τη live πρόοδο της μελέτης χωρίς να βλέπετε πρόωρα findings. Όταν εγκριθεί το governed release, αυτή η ίδια σελίδα θα μετατραπεί αυτόματα σε evidence dashboard.
          <br /><br /><Link className={styles.cardLink} href={"/research/" + study.waveSlug}>Επιστροφή στη live επισκόπηση →</Link>
        </div>
      </section>}

      <div className={styles.footer}>Only governed public releases become public results.</div>
    </div>
    <SiteFooter />
  </main>;
}
