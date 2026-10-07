import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../components/SiteFooter";
import styles from "../../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../../lib/research-observatory-runtime";
import { getPublishedResearchResults } from "../../../../lib/research-survey-release";

export const dynamic = "force-dynamic";

type PageProps = Readonly<{ params: Promise<{ slug: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  return governedStaticSeoMetadata("/research/" + slug + "/methodology", {
    title: (study?.title ?? "Research study") + " · Μεθοδολογία · KONTA MOY Research",
    description: study?.methodologySummary ?? "Μεθοδολογία και reproducibility της μελέτης."
  });
}

function date(value?: string): string {
  return value ? new Date(value).toLocaleString("el-GR") : "—";
}

export default async function ResearchMethodologyPage({ params }: PageProps) {
  const { slug } = await params;
  const study = await publicResearchStudy(slug);
  if (!study) notFound();
  const release = await getPublishedResearchResults(study.waveSlug);

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
          <h1>Μεθοδολογία</h1>
          <p>{study.methodologySummary}</p>
        </div>
        <aside className={styles.heroAside}>
          <span>Population</span>
          <strong>{study.populationDefinition}</strong>
          <span>Fieldwork: {date(study.fieldworkStartsAt)} → {date(study.fieldworkEndsAt)}</span>
        </aside>
      </header>

      <section className={styles.section}>
        <div className={styles.split}>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Research identity</div>
            <h3>Programme → Study → Wave</h3>
            <p><strong>Programme:</strong> {study.programmeTitle}</p>
            <p><strong>Study code:</strong> <span className={styles.mono}>{study.studyCode}</span></p>
            <p><strong>Wave:</strong> {study.waveTitle} · ordinal {study.waveOrdinal}</p>
          </article>
          <article className={styles.panel}>
            <div className={styles.eyebrow}>Fieldwork</div>
            <h3>Public operational evidence</h3>
            <p>Selected sample: <strong>{study.selected.toLocaleString("el-GR")}</strong></p>
            <p>Target completes: <strong>{study.targetCompletes > 0 ? study.targetCompletes.toLocaleString("el-GR") : "—"}</strong></p>
            <p>Completed: <strong>{study.completed.toLocaleString("el-GR")}</strong></p>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <div className={styles.eyebrow}>Reproducibility</div>
            <h2>Η δημοσίευση είναι evidence object.</h2>
          </div>
          <p>Το public release δεν ξαναϋπολογίζεται κατά το page load. Συνδέεται με κλειδωμένο analysis run, dataset hash και artifact hash ώστε ένα ιστορικό αποτέλεσμα να μη μεταβάλλεται σιωπηλά.</p>
        </div>
        {release ? <div className={styles.split}>
          <article className={styles.panel}>
            <h3>{release.releaseVersion}</h3>
            <p>Published: {new Date(release.publishedAt).toLocaleString("el-GR")}</p>
            <p className={styles.mono}>dataset {release.datasetSha256}</p>
            <p className={styles.mono}>artifact {release.artifactSha256}</p>
          </article>
          <article className={styles.panel}>
            <h3>Analysis evidence</h3>
            <p className={styles.mono}>run {release.analysisRunId}</p>
            <p>{release.estimates.length.toLocaleString("el-GR")} stored estimates in the published release.</p>
            <Link className={styles.cardLink} href={"/research/" + study.waveSlug + "/results"}>Άνοιγμα published evidence →</Link>
          </article>
        </div> : <div className={styles.empty}>Δεν υπάρχει ακόμη published release. Η μεθοδολογία της ενεργής μελέτης παραμένει ορατή, ενώ τα τελικά hashes και το analytical evidence εμφανίζονται μετά το governed release.</div>}
      </section>

      <div className={styles.footer}>Methodology is part of the result, not a footnote.</div>
    </div>
    <SiteFooter />
  </main>;
}
