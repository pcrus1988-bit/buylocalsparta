/**
 * One-shot, idempotent onboarding of newly covered current retail KADs.
 *
 * Called by the protected production workflow AFTER deployment of the new
 * classification. Only queues frame discovery; does not draw samples or email.
 * Existing locked/fielded research samples are never invalidated.
 */
import pg from "pg";
import {
  RETAIL_ACTIVITY_GROUP_IDS,
  RETAIL_CLASSIFICATION_VERSION,
  RETAIL_SOURCE_REFERENCE
} from "../apps/web/src/lib/research-kad-coverage.ts";

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL secret required");

const pool = new pg.Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  application_name: "research-b2c-kad-expansion"
});
const client = await pool.connect();
let outcome = "not-run";
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(hashtext('research_b2c_frame_expansion_v2'))");
  const study = await client.query(
    "SELECT id,current_wave_id,status FROM research_studies WHERE slug=$1 FOR UPDATE",
    ["greek-retail-2026"]
  );
  const row = study.rows[0];
  if (!row?.current_wave_id) {
    outcome = "skipped:study_or_wave_missing";
  } else {
    const existing = await client.query(`
      SELECT
        EXISTS (
          SELECT 1 FROM research_sample_draws sd
          WHERE sd.study_id=$1 AND sd.wave_id=$2 AND sd.status IN ('locked','fielded')
        ) AS locked_samples,
        EXISTS (
          SELECT 1 FROM research_study_jobs j
          WHERE j.study_id=$1 AND j.wave_id=$2 AND j.status IN ('queued','running')
            AND j.job_type IN ('frame_snapshot','sample_draw')
        ) AS active_sampling_jobs,
        EXISTS (
          SELECT 1 FROM research_frame_snapshots fs
          WHERE fs.study_id=$1 AND fs.wave_id=$2
            AND fs.selection_criteria->>'classificationVersion'=$3
            AND fs.status IN ('building','frozen','superseded')
        ) AS already_onboarded
    `, [row.id, row.current_wave_id, RETAIL_CLASSIFICATION_VERSION]);
    const guard = existing.rows[0]!;
    if (guard.locked_samples) {
      outcome = "skipped:locked_or_fielded_sample_requires_governed_new_wave";
    } else if (guard.active_sampling_jobs) {
      outcome = "skipped:another_sampling_job_active";
    } else if (guard.already_onboarded) {
      outcome = "skipped:all_retail_frame_already_exists";
    } else {
      const result = await client.query(`
        INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
        VALUES ($1,$2,'frame_snapshot','queued',jsonb_build_object(
          'activityGroupIds',to_jsonb($3::text[]),
          'activeOnly',true,'scope','all-greece',
          'classificationVersion',$4::text,
          'sourceReference',$5::text,
          'queuedBy','production_b2c_coverage_migration'
        ))
        RETURNING id
      `, [row.id, row.current_wave_id, [...RETAIL_ACTIVITY_GROUP_IDS],
        RETAIL_CLASSIFICATION_VERSION, RETAIL_SOURCE_REFERENCE]);
      outcome = "queued:frame_snapshot:" + result.rows[0]!.id;
    }
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
console.log("Research B2C retail coverage onboarding: " + outcome);
