import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { transitionResearchStudyAfterDeadline } from "./research-survey-runtime";

const STUDY_SLUG = "greek-retail-2026";
type Result = Readonly<{ action: string; reason?: string; studyStatus?: string }>;

/**
 * This is an intentionally conservative, idempotent, single-step state machine.
 * Each cron tick advances at most one lifecycle stage. The existing Research
 * worker performs analysis and release creation asynchronously between ticks.
 * No raw responses, contact addresses or invitation tokens are returned here.
 */
export async function advanceGreekRetailDeadline(): Promise<Result> {
  if (!productionDatabaseConfigured()) return { action: "hold", reason: "database_unavailable" };
  const pool = getProductionPostgresRuntime().sqlPool;
  const snapshot = await pool.query<SqlRow>(`
    SELECT id,current_wave_id,status,fieldwork_ends_at,
      (fieldwork_ends_at IS NOT NULL AND fieldwork_ends_at <= now()) AS deadline_passed
    FROM research_studies
    WHERE slug=$1 LIMIT 1
  `, [STUDY_SLUG]);
  const study = snapshot.rows[0];
  if (!study) return { action: "hold", reason: "study_missing" };
  const status = String(study.status);
  if (["published", "archived"].includes(status)) return { action: "complete", studyStatus: status };
  if (!Boolean(study.deadline_passed)) return { action: "hold", reason: "deadline_not_reached", studyStatus: status };
  if (!study.current_wave_id) return { action: "hold", reason: "wave_missing", studyStatus: status };

  if (status === "fielding") {
    await transitionResearchStudyAfterDeadline({ slug: STUDY_SLUG, action: "close_fieldwork" });
    return { action: "closed_fieldwork", studyStatus: "closed" };
  }
  if (status === "closed") {
    await transitionResearchStudyAfterDeadline({ slug: STUDY_SLUG, action: "begin_analysis" });
    return { action: "began_analysis", studyStatus: "analysis" };
  }
  if (status !== "analysis") return { action: "hold", reason: "study_not_in_main_fieldwork", studyStatus: status };

  const wave = study.current_wave_id;
  // The *latest* quality decision for each response is authoritative.
  const reviews = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (qr.response_id) qr.response_id,qr.decision
      FROM research_response_quality_reviews qr
      JOIN research_responses rr ON rr.id=qr.response_id
      JOIN research_invites ri ON ri.id=rr.invite_id
      WHERE rr.study_id=$1 AND rr.wave_id=$2
        AND rr.status='completed' AND ri.fieldwork_phase='main'
      ORDER BY qr.response_id,qr.created_at DESC,qr.id DESC
    )
    SELECT count(*)::int AS pending FROM latest WHERE decision='review'
  `, [study.id,wave]);
  if (Number(reviews.rows[0]?.pending ?? 0) > 0) {
    return { action: "hold", reason: "quality_reviews_pending", studyStatus: status };
  }

  const existingRelease = await pool.query<SqlRow>(`
    SELECT rs.id,rs.published_at
    FROM research_release_snapshots rs
    JOIN research_analysis_runs ar ON ar.id=rs.analysis_run_id
    WHERE rs.study_id=$1 AND rs.wave_id=$2 AND ar.status='succeeded'
    ORDER BY rs.created_at DESC LIMIT 1
  `, [study.id,wave]);
  if (existingRelease.rows[0]) {
    if (existingRelease.rows[0].published_at) return { action: "complete", studyStatus: "published" };
    await transitionResearchStudyAfterDeadline({ slug: STUDY_SLUG, action: "publish_release" });
    return { action: "published_results", studyStatus: "published" };
  }

  // A failed job is a diagnostic stop, not permission to spin indefinitely.
  const jobs = await pool.query<SqlRow>(`
    SELECT job_type,status
    FROM research_study_jobs
    WHERE study_id=$1 AND wave_id=$2 AND job_type IN ('analysis','release')
    ORDER BY created_at DESC
    LIMIT 25
  `, [study.id,wave]);
  const releaseJobs = jobs.rows.filter((job) => job.job_type === "release");
  if (releaseJobs.some((job) => ["queued","running"].includes(String(job.status))))
    return { action: "hold", reason: "release_in_progress", studyStatus: status };
  if (releaseJobs.some((job) => job.status === "failed"))
    return { action: "hold", reason: "release_failed_requires_review", studyStatus: status };

  const completedAnalysis = await pool.query<SqlRow>(`
    SELECT id FROM research_analysis_runs
    WHERE study_id=$1 AND wave_id=$2 AND status='succeeded' AND dataset_sha256 IS NOT NULL
    ORDER BY completed_at DESC NULLS LAST,created_at DESC LIMIT 1
  `, [study.id,wave]);
  const analysis = completedAnalysis.rows[0];
  if (analysis) {
    const version = "auto-" + new Date(String(study.fieldwork_ends_at)).toISOString().replace(/[-:.TZ]/g,"").slice(0,14);
    const queued = await pool.query<SqlRow>(`
      INSERT INTO research_study_jobs(study_id,wave_id,job_type,status,input)
      SELECT $1,$2,'release','queued',
        jsonb_build_object('releaseVersion',$3::text,'analysisRunId',$4::text,'source','deadline_automation')
      WHERE NOT EXISTS (
        SELECT 1 FROM research_study_jobs
        WHERE study_id=$1 AND wave_id=$2 AND job_type='release' AND status IN ('queued','running','succeeded')
      )
      RETURNING id
    `, [study.id,wave,version,String(analysis.id)]);
    return { action: queued.rows.length ? "queued_release" : "hold", reason: queued.rows.length ? undefined : "release_already_queued", studyStatus: status };
  }
  const analysisJobs = jobs.rows.filter((job) => job.job_type === "analysis");
  if (analysisJobs.some((job) => ["queued","running"].includes(String(job.status))))
    return { action: "hold", reason: "analysis_in_progress", studyStatus: status };
  if (analysisJobs.some((job) => job.status === "failed"))
    return { action: "hold", reason: "analysis_failed_requires_review", studyStatus: status };

  const queued = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs(study_id,wave_id,job_type,status,input)
    SELECT $1,$2,'analysis','queued','{"source":"deadline_automation"}'::jsonb
    WHERE NOT EXISTS (
      SELECT 1 FROM research_study_jobs
      WHERE study_id=$1 AND wave_id=$2 AND job_type='analysis' AND status IN ('queued','running','succeeded')
    )
    RETURNING id
  `, [study.id,wave]);
  return { action: queued.rows.length ? "queued_analysis" : "hold", reason: queued.rows.length ? undefined : "analysis_already_queued", studyStatus: status };
}
