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
          <h1>Αποτελέσματα</h1>
          <p>{release
            ? "Τα παρακάτω προέρχονται αποκλειστικά από το immutable public release. Suppressed ή unpublished estimates δεν εμφανίζονται."
            : "Τα ουσιαστικά αποτελέσματα εμφανίζονται μόνο αφού κλείσει η fieldwork, ολοκληρωθούν QA / weighting / analysis και εγκριθεί το governed public release."}</p>
        </div>
        <aside className={styles.heroAside}>
          <span>Release</span>
          <strong>{release?.releaseVersion ?? "Not published"}</strong>
          {release?.publishedAt && <span>{new Date(release.publishedAt).toLocaleString("el-GR")}</span>}
        </aside>
      </header>

      {release ? <>
        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <div className={styles.eyebrow}>Headline evidence</div>
              <h2>Published overall estimates</h2>
            </div>
            <p>Κάθε card δείχνει το δημοσιευμένο estimate, confidence interval όπου υπάρχει και το unweighted analytical n.</p>
          </div>
          <div className={styles.resultsGrid}>
            {overall.slice(0,24).map((estimate) => <article className={styles.resultCard} key={estimate.metricKey}>
              <div className={styles.eyebrow}>{label(estimate)}</div>
              <strong>{value(estimate, estimate.estimate!)}</strong>
              <span>
                {estimate.ciLower != null && estimate.ciUpper != null
                  ? "95% CI " + value(estimate, estimate.ciLower) + " – " + value(estimate, estimate.ciUpper) + " · "
                  : ""}
                n={estimate.unweightedN.toLocaleString("el-GR")}
              </span>
            </article>)}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.split}>
            <article className={styles.panel}>
              <h3>Release provenance</h3>
              <p className={styles.mono}>dataset {release.datasetSha256}</p>
              <p className={styles.mono}>artifact {release.artifactSha256}</p>
              <p className={styles.mono}>analysis {release.analysisRunId}</p>
            </article>
            <article className={styles.panel}>
              <h3>Compare with another wave</h3>
              <p>Το cross-study explorer εμφανίζει κοινά governed metrics μόνο από δημοσιευμένα releases και ξεχωρίζει exact, harmonised και broken comparability.</p>
              <Link className={styles.cardLink} href="/research/compare">Άνοιγμα σύγκρισης →</Link>
            </article>
          </div>
        </section>
      </> : <section className={styles.section}>
        <div className={styles.empty}>
          Δεν έχει δημοσιευθεί ακόμη release για αυτή τη wave. Μπορείτε να παρακολουθείτε τη live πρόοδο χωρίς να βλέπετε πρόωρα ευρήματα.
          <br /><Link className={styles.cardLink} href={"/research/" + study.waveSlug}>Επιστροφή στη live επισκόπηση →</Link>
        </div>
      </section>}

      <div className={styles.footer}>Only governed public releases become public results.</div>
    </div>
    <SiteFooter />
  </main>;
}
