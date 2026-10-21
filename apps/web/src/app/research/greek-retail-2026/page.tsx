import { ResearchPublicNavigation } from "../../../components/ResearchPublicNavigation";
import { ResearchStudyDashboard } from "../../../components/ResearchStudyDashboard";
import { SiteFooter } from "../../../components/SiteFooter";
import type { Metadata } from "next";
import type { SqlRow } from "@buy-local-sparta/core";
import Link from "next/link";
import styles from "../../../components/ResearchObservatory.module.css";
import { governedStaticSeoMetadata } from "../../../lib/seo-metadata";
import { publicResearchStudy } from "../../../lib/research-observatory-runtime";
import { getPublicSurveyPostgresRuntime, productionDatabaseConfigured } from "../../../lib/postgres-runtime";

export const dynamic = "force-dynamic";

export function generateMetadata(): Promise<Metadata> {
  return governedStaticSeoMetadata("/research/greek-retail-2026", {
    title: "Ελληνικό Λιανεμπόριο 2026 · KONTA MOY Research",
    description: "Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή",
    keywords: ["Ελληνικό Λιανεμπόριο 2026", "έρευνα εμπορικών επιχειρήσεων", "ψηφιακή ετοιμότητα επιχειρήσεων", "λειτουργικές δυσκολίες λιανεμπορίου", "marketplaces ελληνικές επιχειρήσεις"]
  });
}

// The full public snapshot also scans invitation events and geography. If that
// aggregate query times out, do not replace a live study with an empty hero.
// This read deliberately uses only main-fieldwork response counts, never answers.
async function readFallbackProgress(): Promise<{ started: number; completed: number } | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  try {
    const result = await getPublicSurveyPostgresRuntime().sqlPool.query<SqlRow>(`
      SELECT
        (SELECT count(*) FROM research_responses r
         JOIN research_invites ri ON ri.id=r.invite_id
         WHERE r.study_id=s.id AND r.wave_id=w.id AND ri.fieldwork_phase='main')::int AS started,
        (SELECT count(*) FROM research_responses r
         JOIN research_invites ri ON ri.id=r.invite_id
         WHERE r.study_id=s.id AND r.wave_id=w.id
           AND ri.fieldwork_phase='main' AND r.status='completed')::int AS completed
      FROM research_studies s
      JOIN research_waves w ON w.study_id=s.id AND w.is_current=true
      WHERE s.slug='greek-retail-2026' AND s.status<>'archived' AND w.status<>'archived'
      ORDER BY w.ordinal DESC
      LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) return undefined;
    const started = Number(row.started);
    const completed = Number(row.completed);
    if (!Number.isFinite(started) || !Number.isFinite(completed)) return undefined;
    return { started, completed };
  } catch (error) {
    // Never expose SQL text, connection strings or participant data in public responses.
    const code = error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "unavailable";
    console.warn("research.public_study_fallback_progress_unavailable", { code });
    return undefined;
  }
}

export default async function GreekRetailResearchPage() {
  const study = await publicResearchStudy("greek-retail-2026");
  if (study) return <>
    <ResearchStudyDashboard study={study} compactIntro />
    <SiteFooter />
  </>;

  const fallbackProgress = await readFallbackProgress();
  return <>
    <main className={styles.shell}>
    <div className={styles.frame}>
      <ResearchPublicNavigation active="overview" studySlug="greek-retail-2026" />
      <header className={styles.hero} style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
        <div>
          <h1>Ελληνικό Λιανεμπόριο 2026</h1>
          <p>Η πραγματικότητα της μικρής και μεσαίας εμπορικής επιχείρησης στην ψηφιακή εποχή</p>
          <div className={styles.heroBadges}>
            <span className={[styles.badge, styles.badgeWarm].join(" ")}>Η συλλογή βρίσκεται σε εξέλιξη</span>
          </div>
        </div>
      </header>
      {fallbackProgress ? <section className={styles.section} aria-label="Πρόοδος μελέτης">
        <div className={styles.sectionHead}>
          <div><div className={styles.eyebrow}>Ζωντανή εικόνα συμμετοχής</div><h2>Πρόοδος Ελληνικού Λιανεμπορίου 2026</h2></div>
          <p>Εμφανίζονται επαληθευμένα συγκεντρωτικά στοιχεία κύριας συλλογής. Οι αναλυτικές μετρήσεις ενημερώνονται προσωρινά.</p>
        </div>
        <div className={styles.metrics}>
          <article className={styles.metric}>
            <span>Ερωτηματολόγια που ξεκίνησαν</span>
            <strong>{fallbackProgress.started.toLocaleString("el-GR")}</strong>
          </article>
          <article className={styles.metric}>
            <span>Ολοκληρωμένα ερωτηματολόγια</span>
            <strong>{fallbackProgress.completed.toLocaleString("el-GR")}</strong>
            <small>Περιλαμβάνονται τεκμηριωμένες διαχειριστικές οριστικοποιήσεις.</small>
          </article>
        </div>
        <div className={styles.sectionActions}>
          <Link className={[styles.actionButton, styles.primaryButton].join(" ")} href="/research/greek-retail-2026">Ανανέωση προόδου</Link>
          <Link className={styles.actionButton} href="/research">Παρατηρητήριο · όλες οι μετρήσεις</Link>
        </div>
      </section> : <section className={styles.section}>
        <div className={styles.notice} role="status">
          Τα στοιχεία συμμετοχής δεν είναι προσωρινά διαθέσιμα. Δεν έχουν χαθεί απαντήσεις.
          {" "}<Link href="/research">Δείτε την πρόοδο στο Παρατηρητήριο →</Link>
        </div>
      </section>}
    </div>
    </main>
    <SiteFooter />
  </>;
}
