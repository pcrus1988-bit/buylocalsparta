/**
 * Server-owned, idempotent onboarding of the complete current KAD 47 retail frame.
 * Runs through the existing authenticated production Research cron (which already
 * has the application's database connection). No GitHub database secret needed.
 *
 * This ONLY queues frame construction: never samples businesses or sends emails.
 */
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  RETAIL_ACTIVITY_GROUP_IDS,
  RETAIL_CLASSIFICATION_VERSION,
  RETAIL_SOURCE_REFERENCE
} from "./research-kad-coverage";

export type RetailFrameOnboardingState =
  | "queued" | "running" | "ready" | "blocked" | "failed" | "not_started" | "unavailable";

export type RetailFrameOnboarding = Readonly<{
  state: RetailFrameOnboardingState;
  reason?: string;
}>;

/** A small, read-only status query used by the delivery-check workflow. */
export async function researchB2cFrameStatus(): Promise<RetailFrameOnboarding> {
  if (!productionDatabaseConfigured()) return { state: "unavailable" };
  const pool = getProductionPostgresRuntime().sqlPool;
  const result = await pool.query<SqlRow>(`
    WITH wave AS (
      SELECT id, current_wave_id
      FROM research_studies
      WHERE slug='greek-retail-2026'
      LIMIT 1
    )
    SELECT
      EXISTS (
        SELECT 1 FROM research_frame_snapshots fs
        JOIN wave w ON fs.study_id=w.id AND fs.wave_id=w.current_wave_id
        WHERE fs.selection_criteria->>'classificationVersion'=$1
          AND fs.status IN ('frozen','superseded')
      ) AS completed,
      (SELECT j.status FROM research_study_jobs j
         JOIN wave w ON j.study_id=w.id AND j.wave_id=w.current_wave_id
        WHERE j.job_type='frame_snapshot'
          AND j.input->>'classificationVersion'=$1
        ORDER BY j.created_at DESC LIMIT 1
      ) AS latest_job_status,
      EXISTS(
        SELECT 1 FROM research_sample_draws sd
        JOIN wave w ON sd.study_id=w.id AND sd.wave_id=w.current_wave_id
        WHERE sd.status IN ('locked','fielded')
      ) AS locked_sample,
      EXISTS(
        SELECT 1 FROM research_invites ri
        JOIN wave w ON ri.study_id=w.id AND ri.wave_id=w.current_wave_id
        WHERE ri.sent_at IS NOT NULL
      ) AS invited
  `, [RETAIL_CLASSIFICATION_VERSION]);
  const row = result.rows[0];
  if (row?.completed) return { state: "ready" };
  const status = String(row?.latest_job_status ?? "");
  if (status === "queued") return { state: "queued" };
  if (status === "running") return { state: "running" };
  if (status === "failed") return { state: "failed", reason: "frame_job_failed" };
  if (status === "succeeded") return { state: "blocked", reason: "frame_job_requires_review" };
  if (row?.locked_sample || row?.invited) return {
    state: "blocked", reason: "current_wave_sample_or_fieldwork_locked"
  };
  return { state: "not_started" };
}

/**
 * Queue-once. A transaction lock serialises overlapping Vercel cron invocations.
 * On failure, leave any previous job visible for operator investigation instead
 * of inserting an endless series of new jobs.
 */
export async function ensureGreekRetailB2cFrameOnboarded(): Promise<RetailFrameOnboarding> {
  if (!productionDatabaseConfigured()) return { state: "unavailable" };
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('research_b2c_frame_expansion_v2'))");
    const study = await client.query<SqlRow>(`
      SELECT id, current_wave_id
      FROM research_studies
      WHERE slug='greek-retail-2026'
      FOR UPDATE
    `);
    const row = study.rows[0];
    let result: RetailFrameOnboarding;
    if (!row?.current_wave_id) {
      result = { state: "blocked", reason: "study_or_wave_missing" };
    } else {
      const checks = await client.query<SqlRow>(`
        SELECT
          EXISTS(
            SELECT 1 FROM research_frame_snapshots fs
            WHERE fs.study_id=$1 AND fs.wave_id=$2
              AND fs.selection_criteria->>'classificationVersion'=$3
              AND fs.status IN ('frozen','superseded')
          ) AS completed,
          EXISTS(
            SELECT 1 FROM research_sample_draws sd
            WHERE sd.study_id=$1 AND sd.wave_id=$2
              AND sd.status IN ('locked','fielded')
          ) AS locked_sample,
          EXISTS(
            SELECT 1 FROM research_invites ri
            WHERE ri.study_id=$1 AND ri.wave_id=$2 AND ri.sent_at IS NOT NULL
          ) AS invited,
          EXISTS(
            SELECT 1 FROM research_study_jobs j
            WHERE j.study_id=$1 AND j.wave_id=$2
              AND j.job_type IN ('frame_snapshot','sample_draw')
              AND j.status IN ('queued','running')
          ) AS sampling_job_active,
          (SELECT j.status FROM research_study_jobs j
            WHERE j.study_id=$1 AND j.wave_id=$2 AND j.job_type='frame_snapshot'
              AND j.input->>'classificationVersion'=$3
            ORDER BY j.created_at DESC LIMIT 1
          ) AS previous_v2_job
      `, [row.id, row.current_wave_id, RETAIL_CLASSIFICATION_VERSION]);
      const guard = checks.rows[0]!;
      if (guard.completed) {
        result = { state: "ready" };
      } else if (guard.previous_v2_job === "failed") {
        result = { state: "failed", reason: "previous_frame_job_failed" };
      } else if (guard.previous_v2_job === "queued" || guard.previous_v2_job === "running") {
        result = { state: guard.previous_v2_job as "queued" | "running" };
      } else if (guard.previous_v2_job) {
        result = { state: "blocked", reason: "previous_frame_job_requires_review" };
      } else if (guard.locked_sample || guard.invited) {
        result = { state: "blocked", reason: "current_wave_sample_or_fieldwork_locked" };
      } else if (guard.sampling_job_active) {
        result = { state: "not_started", reason: "another_sampling_job_active" };
      } else {
        await client.query(`
          INSERT INTO research_study_jobs
            (study_id,wave_id,job_type,status,input)
          VALUES ($1,$2,'frame_snapshot','queued',jsonb_build_object(
            'activityGroupIds',to_jsonb($3::text[]),
            'activeOnly',true,
            'scope','all-greece',
            'classificationVersion',$4::text,
            'sourceReference',$5::text,
            'queuedBy','production_research_cron'
          ))
        `, [row.id, row.current_wave_id, [...RETAIL_ACTIVITY_GROUP_IDS],
          RETAIL_CLASSIFICATION_VERSION, RETAIL_SOURCE_REFERENCE]);
        result = { state: "queued" };
      }
    }
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
