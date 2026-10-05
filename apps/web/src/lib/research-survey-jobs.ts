import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import {
  gemiResearchFrameRecords,
  normalizeGemiAdminFilters,
  type GemiResearchFrameRecord
} from "./gemi-admin-export";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { runGreekRetailAnalysis } from "./research-survey-analysis";
import { proportionalStratumAllocation } from "./research-survey-statistics";
import { buildGreekRetailRelease } from "./research-survey-release";
import {
  assertResearchSurveyEmailReady,
  sendResearchResultsNotification,
  sendResearchSurveyInvitation,
  sendResearchThankYouCode
} from "./research-survey-mail";

const STUDY_SLUG = "greek-retail-2026";
const FRAME_CLASSIFICATION_VERSION = "greek-retail-kad-sector-v1";
const FRAME_SOURCE_REFERENCE = "gemi-opendata:retail-non-food:active:all-greece";
const FRAME_FLUSH_SIZE = 500;
const MAX_JOB_ATTEMPTS = 3;

type ResearchJobRow = SqlRow & {
  id: string;
  study_id: string;
  job_type: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  attempts: number;
};

type FrameBufferRecord = Readonly<{
  externalKeyHash: string;
  sourceRecordRef: string;
  regionCode: string;
  sectorCode: string;
  samplingAttributes: string;
  email: string;
  contactHash: string;
}>;

export type ResearchJobTick = Readonly<{
  claimed: number;
  processed: number;
  requeued: number;
  failed: number;
}>;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value ?? 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}


function researchRewardSecret(env: NodeJS.ProcessEnv = process.env): string {
  const secret = env.BLS_RESEARCH_REWARD_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error("BLS_RESEARCH_REWARD_SECRET must be at least 32 characters");
  }
  return secret;
}

function rewardCodeForEntitlement(entitlementId: string, env: NodeJS.ProcessEnv = process.env): string {
  const digest = createHmac("sha256", researchRewardSecret(env))
    .update(`${STUDY_SLUG}:${entitlementId}`, "utf8")
    .digest("hex")
    .toUpperCase()
    .slice(0, 12);
  return `KM26-${digest.slice(0, 4)}-${digest.slice(4, 8)}-${digest.slice(8, 12)}`;
}

function absoluteResearchUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
  return `${base}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

async function recordParticipantDeliveryEvent(
  deliveryId: string,
  eventType: "planned" | "sending" | "sent" | "failed" | "cancelled",
  metadata: Record<string, unknown> = {},
  providerMessageId?: string
): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    INSERT INTO research_participant_delivery_events
      (delivery_id,event_type,provider_message_id,metadata)
    VALUES ($1,$2,$3,$4::jsonb)
  `, [deliveryId, eventType, providerMessageId ?? null, JSON.stringify(metadata)]);
}

function kadMatches(code: string, prefix: string): boolean {
  const normalized = code.trim().replace(/\s+/g, "");
  const wanted = prefix.trim().replace(/\s+/g, "");
  if (normalized === wanted || normalized.startsWith(wanted + ".")) return true;
  const digits = normalized.replace(/\D/g, "");
  const wantedDigits = wanted.replace(/\D/g, "");
  return Boolean(digits && wantedDigits && digits.startsWith(wantedDigits));
}

export function greekRetailSector(activityCodes: readonly string[]): string {
  const has = (...prefixes: string[]) => activityCodes.some((code) => prefixes.some((prefix) => kadMatches(code, prefix)));
  if (has("47.71", "47.72")) return "fashion_footwear";
  if (has("47.75")) return "beauty_personal_care";
  if (has("47.51", "47.53", "47.54", "47.55", "47.59")) return "home_living";
  if (has("47.52")) return "diy_building";
  if (has("47.40", "47.41", "47.42", "47.43")) return "electronics";
  if (has("47.61", "47.62", "47.63", "47.64", "47.69")) return "sports_books_hobby";
  if (has("47.77")) return "jewellery_watches";
  if (has("47.76")) return "flowers_pets";
  if (has("47.79")) return "second_hand";
  if (has("47.8")) return "automotive_trade";
  return "other_non_food_retail";
}

function frameRecord(record: GemiResearchFrameRecord): FrameBufferRecord | undefined {
  const identity = record.gemiNumber ? `gemi:${record.gemiNumber}` : record.afm ? `afm:${record.afm}` : "";
  if (!identity) return undefined;
  const matchedCodes = record.matchedActivityCodes.length ? record.matchedActivityCodes : record.activityCodes;
  const regionCode = record.prefectureId || "unknown";
  const sectorCode = greekRetailSector(matchedCodes);
  const email = record.email.trim().toLowerCase();
  return {
    externalKeyHash: sha256(identity),
    sourceRecordRef: record.gemiNumber ? `gemi:${record.gemiNumber}` : "gemi:identity-withheld",
    regionCode,
    sectorCode,
    samplingAttributes: JSON.stringify({
      source: "gemi_opendata",
      classificationVersion: FRAME_CLASSIFICATION_VERSION,
      legalName: record.legalName,
      prefectureId: record.prefectureId || null,
      prefecture: record.prefecture || null,
      municipalityId: record.municipalityId || null,
      municipality: record.municipality || null,
      city: record.city || null,
      postcode: record.postcode || null,
      activityCodes: record.activityCodes,
      matchedActivityCodes: matchedCodes,
      website: record.website || null
    }),
    email,
    contactHash: email ? sha256(email) : ""
  };
}

export async function queueGreekRetailFrameBuild(principal: SessionPrincipal): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>("SELECT id FROM research_studies WHERE slug=$1 LIMIT 1", [STUDY_SLUG]);
  if (!study.rows[0]) throw new Error("RESEARCH_STUDY_NOT_FOUND");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1 AND job_type='frame_snapshot' AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [study.rows[0].id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id, job_type, status, input)
    VALUES (
      $1,
      'frame_snapshot',
      'queued',
      jsonb_build_object(
        'activityGroupIds', jsonb_build_array('retail-non-food'),
        'activeOnly', true,
        'scope', 'all-greece',
        'classificationVersion', $2::text
      )
    )
    RETURNING id
  `, [study.rows[0].id, FRAME_CLASSIFICATION_VERSION]);
  return { jobId: text(job.rows[0]!.id) };
}

export async function queueGreekRetailSampleDraw(
  principal: SessionPrincipal,
  input: Readonly<{ targetN: number; randomSeed?: string; label?: string }>
): Promise<{ jobId: string; randomSeed: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const targetN = Math.floor(input.targetN);
  if (!Number.isSafeInteger(targetN) || targetN < 100 || targetN > 100_000) {
    throw new Error("RESEARCH_SAMPLE_TARGET_INVALID");
  }
  const randomSeed = input.randomSeed?.trim() || randomBytes(24).toString("hex");
  if (randomSeed.length < 16 || randomSeed.length > 200) throw new Error("RESEARCH_SAMPLE_SEED_INVALID");

  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>("SELECT id FROM research_studies WHERE slug=$1 LIMIT 1", [STUDY_SLUG]);
  if (!study.rows[0]) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  const frame = await pool.query<SqlRow>(`
    SELECT id FROM research_frame_snapshots
    WHERE study_id=$1 AND status='frozen'
    ORDER BY frozen_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `, [study.rows[0].id]);
  if (!frame.rows[0]) throw new Error("RESEARCH_SAMPLE_REQUIRES_FROZEN_FRAME");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1 AND job_type='sample_draw' AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [study.rows[0].id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id), randomSeed };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id, job_type, status, input)
    VALUES (
      $1,
      'sample_draw',
      'queued',
      jsonb_build_object(
        'targetN', $2::int,
        'randomSeed', $3::text,
        'label', $4::text
      )
    )
    RETURNING id
  `, [study.rows[0].id, targetN, randomSeed, input.label?.trim() || `sample-${targetN}`]);
  return { jobId: text(job.rows[0]!.id), randomSeed };
}

export async function saveGreekRetailRecruitmentTemplate(
  principal: SessionPrincipal,
  input: Readonly<{
    subject: string;
    bodyText: string;
    version?: string;
    purpose?: "research_invitation" | "research_reminder";
  }>
): Promise<{ templateId: string; version: string; purpose: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
  const purpose = input.purpose ?? "research_invitation";
  if (!["research_invitation","research_reminder"].includes(purpose)) {
    throw new Error("RESEARCH_RECRUITMENT_PURPOSE_INVALID");
  }
  if (subject.length < 5 || subject.length > 180) throw new Error("RESEARCH_RECRUITMENT_SUBJECT_INVALID");
  if (bodyText.length < 40 || bodyText.length > 12_000) throw new Error("RESEARCH_RECRUITMENT_BODY_INVALID");
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,status FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (["closed","analysis","published","archived"].includes(text(row.status))) {
    throw new Error("RESEARCH_RECRUITMENT_LOCKED_AFTER_FIELDWORK");
  }
  const version = input.version?.trim() ||
    `${purpose === "research_reminder" ? "reminder" : "invite"}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(version)) throw new Error("RESEARCH_RECRUITMENT_VERSION_INVALID");

  const inserted = await pool.query<SqlRow>(`
    INSERT INTO research_recruitment_templates (
      study_id,version,channel,subject,body_text,body_sha256,purpose,status,locked_at
    )
    VALUES ($1,$2,'email',$3,$4,$5,$6,'locked',now())
    RETURNING id
  `, [row.id, version, subject, bodyText, sha256(bodyText), purpose]);
  return { templateId: text(inserted.rows[0]!.id), version, purpose };
}

export async function queueGreekRetailInviteBatch(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string }>
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(`
    SELECT
      s.id,s.status,
      EXISTS(
        SELECT 1 FROM research_sample_draws d
        WHERE d.study_id=s.id AND d.status IN ('locked','fielded')
      ) AS sample_ready,
      EXISTS(
        SELECT 1 FROM research_recruitment_templates rt
        WHERE rt.study_id=s.id AND rt.channel='email' AND rt.status='locked'
          AND rt.purpose='research_invitation'
      ) AS template_ready
    FROM research_studies s
    WHERE s.slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!["pilot","fielding"].includes(text(row.status))) throw new Error("SURVEY_NOT_OPEN");
  if (!Boolean(row.sample_ready)) throw new Error("RESEARCH_INVITE_SAMPLE_NOT_READY");
  if (!Boolean(row.template_ready)) throw new Error("RESEARCH_RECRUITMENT_TEMPLATE_NOT_READY");

  const existing = await pool.query<SqlRow>(`
    SELECT id FROM research_study_jobs
    WHERE study_id=$1 AND job_type='invite_batch' AND status IN ('queued','running')
    ORDER BY created_at DESC LIMIT 1
  `, [row.id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES (
      $1,'invite_batch','queued',
      jsonb_build_object('limit',$2::int,'label',$3::text)
    )
    RETURNING id
  `, [row.id, limit, input.label?.trim() || `research-email-${new Date().toISOString()}`]);
  return { jobId: text(job.rows[0]!.id) };
}

export async function queueGreekRetailInviteReminderBatch(
  principal: SessionPrincipal,
  input: Readonly<{
    limit?: number;
    label?: string;
    minAgeDays?: number;
    minGapDays?: number;
    maxReminders?: number;
  }> = {}
): Promise<{ jobId: string; templateId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();

  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const minAgeDays = Math.max(1, Math.min(90, Math.floor(input.minAgeDays ?? 5)));
  const minGapDays = Math.max(1, Math.min(90, Math.floor(input.minGapDays ?? 5)));
  const maxReminders = Math.max(1, Math.min(5, Math.floor(input.maxReminders ?? 2)));
  const pool = getProductionPostgresRuntime().sqlPool;

  const study = await pool.query<SqlRow>(`
    SELECT
      s.id,
      s.status,
      rt.id AS reminder_template_id
    FROM research_studies s
    JOIN LATERAL (
      SELECT id
      FROM research_recruitment_templates
      WHERE study_id=s.id
        AND channel='email'
        AND status='locked'
        AND purpose='research_reminder'
      ORDER BY locked_at DESC NULLS LAST,created_at DESC
      LIMIT 1
    ) rt ON true
    WHERE s.slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_REMINDER_TEMPLATE_NOT_READY");
  if (!["pilot","fielding"].includes(text(row.status))) throw new Error("SURVEY_NOT_OPEN");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND job_type='invite_reminder'
      AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id]);
  if (existing.rows[0]) {
    return {
      jobId: text(existing.rows[0].id),
      templateId: text(row.reminder_template_id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES (
      $1,
      'invite_reminder',
      'queued',
      jsonb_build_object(
        'templateId',$2::text,
        'limit',$3::int,
        'minAgeDays',$4::int,
        'minGapDays',$5::int,
        'maxReminders',$6::int,
        'label',$7::text
      )
    )
    RETURNING id
  `, [
    row.id,
    row.reminder_template_id,
    limit,
    minAgeDays,
    minGapDays,
    maxReminders,
    input.label?.trim() || `research-reminder-${new Date().toISOString()}`
  ]);

  return {
    jobId: text(job.rows[0]!.id),
    templateId: text(row.reminder_template_id)
  };
}

export async function queueGreekRetailRewardDelivery(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string }> = {}
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  researchRewardSecret();
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,status FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (text(row.status) === "archived") throw new Error("RESEARCH_REWARD_DELIVERY_ARCHIVED");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND job_type='reward_delivery'
      AND status IN ('queued','running')
      AND COALESCE(input->>'responseId','')=''
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES (
      $1,'reward_delivery','queued',
      jsonb_build_object('limit',$2::int,'label',$3::text)
    )
    RETURNING id
  `, [row.id, limit, input.label?.trim() || `reward-delivery-${new Date().toISOString()}`]);
  return { jobId: text(job.rows[0]!.id) };
}

export async function queueGreekRetailResultsNotifications(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string }> = {}
): Promise<{ jobId: string; releaseSnapshotId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const release = await pool.query<SqlRow>(`
    SELECT s.id AS study_id,rs.id AS release_snapshot_id
    FROM research_studies s
    JOIN LATERAL (
      SELECT id
      FROM research_release_snapshots
      WHERE study_id=s.id AND published_at IS NOT NULL
      ORDER BY published_at DESC,created_at DESC
      LIMIT 1
    ) rs ON true
    WHERE s.slug=$1 AND s.status='published'
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = release.rows[0];
  if (!row) throw new Error("RESEARCH_RESULTS_NOTIFICATION_REQUIRES_PUBLISHED_RELEASE");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND job_type='results_notification'
      AND status IN ('queued','running')
      AND input->>'releaseSnapshotId'=$2
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.study_id, row.release_snapshot_id]);
  if (existing.rows[0]) {
    return {
      jobId: text(existing.rows[0].id),
      releaseSnapshotId: text(row.release_snapshot_id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES (
      $1,'results_notification','queued',
      jsonb_build_object(
        'releaseSnapshotId',$2::text,
        'limit',$3::int,
        'label',$4::text
      )
    )
    RETURNING id
  `, [
    row.study_id,
    row.release_snapshot_id,
    limit,
    input.label?.trim() || `results-notification-${new Date().toISOString()}`
  ]);
  return {
    jobId: text(job.rows[0]!.id),
    releaseSnapshotId: text(row.release_snapshot_id)
  };
}

export async function queueGreekRetailAnalysis(
  principal: SessionPrincipal
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,status FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (text(row.status) !== "analysis") throw new Error("RESEARCH_ANALYSIS_REQUIRES_ANALYSIS_STATUS");

  const existing = await pool.query<SqlRow>(`
    SELECT id FROM research_study_jobs
    WHERE study_id=$1 AND job_type='analysis' AND status IN ('queued','running')
    ORDER BY created_at DESC LIMIT 1
  `, [row.id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES ($1,'analysis','queued','{}'::jsonb)
    RETURNING id
  `, [row.id]);
  return { jobId: text(job.rows[0]!.id) };
}

async function claimResearchJob(): Promise<ResearchJobRow | undefined> {
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<ResearchJobRow>(`
      SELECT id, study_id, job_type, input, output, attempts
      FROM research_study_jobs
      WHERE status='queued' AND available_at <= now()
        AND job_type IN ('frame_snapshot','sample_draw','invite_batch','reward_delivery','analysis','release','results_notification')
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    const job = result.rows[0];
    if (!job) {
      await client.query("COMMIT");
      return undefined;
    }
    const claimed = await client.query<ResearchJobRow>(`
      UPDATE research_study_jobs
      SET status='running',
          attempts=attempts+1,
          started_at=now(),
          finished_at=NULL,
          error_message=NULL
      WHERE id=$1
      RETURNING id, study_id, job_type, input, output, attempts
    `, [job.id]);
    await client.query("COMMIT");
    return claimed.rows[0];
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function markJobSucceeded(jobId: string, output: Record<string, unknown>): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE research_study_jobs
    SET status='succeeded', output=$2::jsonb, error_message=NULL, finished_at=now()
    WHERE id=$1
  `, [jobId, JSON.stringify(output)]);
}

async function markJobError(job: ResearchJobRow, error: unknown): Promise<"requeued" | "failed"> {
  const message = (error instanceof Error ? error.message : String(error)).replace(/[\r\n]+/g, " ").slice(0, 1800);
  const retry = numberValue(job.attempts) < MAX_JOB_ATTEMPTS;
  if (retry) {
    const delayMinutes = Math.min(30, Math.max(2, 2 ** numberValue(job.attempts)));
    await getProductionPostgresRuntime().sqlPool.query(`
      UPDATE research_study_jobs
      SET status='queued',
          error_message=$2,
          available_at=now() + ($3::int * interval '1 minute'),
          finished_at=NULL
      WHERE id=$1
    `, [job.id, message, delayMinutes]);
    return "requeued";
  }
  if (job.job_type === "analysis") {
    await getProductionPostgresRuntime().sqlPool.query(`
      UPDATE research_analysis_runs
      SET status='failed',completed_at=now()
      WHERE study_id=$1 AND parameters->>'jobId'=$2 AND status='running'
    `, [job.study_id, job.id]);
  }
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE research_study_jobs
    SET status='failed', error_message=$2, finished_at=now()
    WHERE id=$1
  `, [job.id, message]);
  return "failed";
}

async function flushFrameBuffer(snapshotId: string, records: readonly FrameBufferRecord[]): Promise<void> {
  if (!records.length) return;
  const pool = getProductionPostgresRuntime().sqlPool;
  await pool.query(`
    WITH incoming AS (
      SELECT *
      FROM unnest(
        $2::text[],
        $3::text[],
        $4::text[],
        $5::text[],
        $6::text[],
        $7::text[],
        $8::text[]
      ) AS x(
        external_key_hash,
        source_record_ref,
        region_code,
        sector_code,
        sampling_attributes_text,
        email,
        contact_hash
      )
    ),
    units AS (
      INSERT INTO research_frame_units (
        frame_snapshot_id,
        external_key_hash,
        source_record_ref,
        region_code,
        sector_code,
        size_band,
        eligibility_status,
        sampling_attributes
      )
      SELECT
        $1::uuid,
        external_key_hash,
        source_record_ref,
        region_code,
        sector_code,
        'unknown',
        'eligible',
        sampling_attributes_text::jsonb
      FROM incoming
      ON CONFLICT (frame_snapshot_id, external_key_hash)
      DO UPDATE SET
        source_record_ref=EXCLUDED.source_record_ref,
        region_code=EXCLUDED.region_code,
        sector_code=EXCLUDED.sector_code,
        eligibility_status='eligible',
        sampling_attributes=EXCLUDED.sampling_attributes
      RETURNING id, external_key_hash
    )
    INSERT INTO research_contact_points (
      frame_unit_id,
      contact_type,
      contact_value,
      contact_value_hash,
      source_kind,
      suppression_status
    )
    SELECT
      units.id,
      'email',
      incoming.email,
      incoming.contact_hash,
      'gemi_public_registry',
      CASE
        WHEN public.research_contact_is_suppressed('email', incoming.contact_hash) THEN 'suppressed'
        ELSE 'active'
      END
    FROM units
    JOIN incoming USING (external_key_hash)
    WHERE incoming.email <> '' AND incoming.contact_hash <> ''
    ON CONFLICT (frame_unit_id, contact_type, contact_value_hash)
    DO UPDATE SET
      contact_value=EXCLUDED.contact_value,
      source_kind=EXCLUDED.source_kind,
      suppression_status=EXCLUDED.suppression_status
  `, [
    snapshotId,
    records.map((record) => record.externalKeyHash),
    records.map((record) => record.sourceRecordRef),
    records.map((record) => record.regionCode),
    records.map((record) => record.sectorCode),
    records.map((record) => record.samplingAttributes),
    records.map((record) => record.email),
    records.map((record) => record.contactHash)
  ]);
}

async function processFrameSnapshotJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const currentOutput = objectValue(job.output);
  let snapshotId = text(currentOutput.frameSnapshotId);

  if (!snapshotId) {
    const snapshot = await pool.query<SqlRow>(`
      INSERT INTO research_frame_snapshots (
        study_id,
        label,
        source_kind,
        source_reference,
        population_size,
        selection_criteria,
        status
      )
      VALUES (
        $1,
        $2,
        'gemi_opendata',
        $3,
        0,
        $4::jsonb,
        'building'
      )
      RETURNING id
    `, [
      job.study_id,
      `G.E.MI. retail non-food ${new Date().toISOString().slice(0, 10)}`,
      FRAME_SOURCE_REFERENCE,
      JSON.stringify({
        activityGroupIds: ["retail-non-food"],
        activeOnly: true,
        scope: "all-greece",
        classificationVersion: FRAME_CLASSIFICATION_VERSION
      })
    ]);
    snapshotId = text(snapshot.rows[0]!.id);
    await pool.query(`
      UPDATE research_study_jobs
      SET output = output || jsonb_build_object('frameSnapshotId',$2::text)
      WHERE id=$1
    `, [job.id, snapshotId]);
  }

  // A retry always starts the still-building snapshot from a clean slate. This
  // prevents an upstream G.E.MI. change between attempts from leaving stale units.
  await pool.query("DELETE FROM research_strata WHERE frame_snapshot_id=$1", [snapshotId]);
  await pool.query("DELETE FROM research_frame_units WHERE frame_snapshot_id=$1", [snapshotId]);
  await pool.query(`
    UPDATE research_frame_snapshots
    SET status='building', population_size=0, content_sha256=NULL, captured_at=NULL, frozen_at=NULL
    WHERE id=$1
  `, [snapshotId]);

  const filters = normalizeGemiAdminFilters({
    activityGroupIds: ["retail-non-food"],
    activeOnly: true
  });
  const contentHash = createHash("sha256");
  const buffer: FrameBufferRecord[] = [];
  let streamed = 0;
  let withEmail = 0;

  for await (const raw of gemiResearchFrameRecords(filters)) {
    const record = frameRecord(raw);
    if (!record) continue;
    contentHash.update(`${record.externalKeyHash}|${record.regionCode}|${record.sectorCode}\n`, "utf8");
    buffer.push(record);
    streamed += 1;
    if (record.email) withEmail += 1;
    if (buffer.length >= FRAME_FLUSH_SIZE) {
      await flushFrameBuffer(snapshotId, buffer.splice(0, buffer.length));
    }
  }
  if (buffer.length) await flushFrameBuffer(snapshotId, buffer.splice(0, buffer.length));

  await pool.query(`
    INSERT INTO research_strata (
      frame_snapshot_id,
      code,
      label,
      dimensions,
      population_count,
      target_complete_count
    )
    SELECT
      $1::uuid,
      region_code || ':' || sector_code,
      region_code || ' · ' || sector_code,
      jsonb_build_object('regionCode',region_code,'sectorCode',sector_code),
      count(*)::int,
      0
    FROM research_frame_units
    WHERE frame_snapshot_id=$1
    GROUP BY region_code, sector_code
    ON CONFLICT (frame_snapshot_id, code)
    DO UPDATE SET
      label=EXCLUDED.label,
      dimensions=EXCLUDED.dimensions,
      population_count=EXCLUDED.population_count
  `, [snapshotId]);

  await pool.query(`
    UPDATE research_frame_units fu
    SET stratum_id=s.id
    FROM research_strata s
    WHERE fu.frame_snapshot_id=$1
      AND s.frame_snapshot_id=fu.frame_snapshot_id
      AND s.code=fu.region_code || ':' || fu.sector_code
  `, [snapshotId]);

  const countResult = await pool.query<SqlRow>(`
    SELECT count(*)::int AS population_size,
           count(*) FILTER (
             WHERE EXISTS (
               SELECT 1 FROM research_contact_points cp
               WHERE cp.frame_unit_id=fu.id
                 AND cp.contact_type='email'
                 AND cp.suppression_status='active'
             )
           )::int AS active_email_count
    FROM research_frame_units fu
    WHERE frame_snapshot_id=$1
  `, [snapshotId]);
  const populationSize = numberValue(countResult.rows[0]?.population_size);
  const activeEmailCount = numberValue(countResult.rows[0]?.active_email_count);
  if (populationSize !== streamed) {
    throw new Error(`RESEARCH_FRAME_COUNT_MISMATCH:streamed=${streamed};persisted=${populationSize}`);
  }
  const digest = contentHash.digest("hex");

  await pool.query(`
    UPDATE research_frame_snapshots
    SET population_size=$2,
        content_sha256=$3,
        status='frozen',
        captured_at=now(),
        frozen_at=now()
    WHERE id=$1
  `, [snapshotId, populationSize, digest]);
  await pool.query(`
    UPDATE research_frame_snapshots
    SET status='superseded'
    WHERE study_id=$1 AND id<>$2 AND status='frozen'
  `, [job.study_id, snapshotId]);

  return {
    frameSnapshotId: snapshotId,
    populationSize,
    activeEmailCount,
    streamedWithEmail: withEmail,
    contentSha256: digest,
    classificationVersion: FRAME_CLASSIFICATION_VERSION,
    sourceReference: FRAME_SOURCE_REFERENCE
  };
}

async function processSampleDrawJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  const input = objectValue(job.input);
  const targetN = Math.floor(numberValue(input.targetN));
  const randomSeed = text(input.randomSeed);
  if (!targetN || !randomSeed) throw new Error("RESEARCH_SAMPLE_JOB_INVALID");

  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const frameResult = await client.query<SqlRow>(`
      SELECT id, population_size, content_sha256
      FROM research_frame_snapshots
      WHERE study_id=$1 AND status='frozen'
      ORDER BY frozen_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [job.study_id]);
    const frame = frameResult.rows[0];
    if (!frame) throw new Error("RESEARCH_SAMPLE_REQUIRES_FROZEN_FRAME");

    const strataResult = await client.query<SqlRow>(`
      SELECT id, code, population_count
      FROM research_strata
      WHERE frame_snapshot_id=$1 AND population_count > 0
      ORDER BY code
    `, [frame.id]);
    if (!strataResult.rows.length) throw new Error("RESEARCH_SAMPLE_STRATA_MISSING");

    const allocations = proportionalStratumAllocation(
      strataResult.rows.map((row) => ({
        id: text(row.id),
        populationCount: numberValue(row.population_count)
      })),
      targetN,
      2
    );
    const actualTargetN = allocations.reduce((sum, allocation) => sum + allocation.sampleCount, 0);
    if (!actualTargetN) throw new Error("RESEARCH_SAMPLE_EMPTY");

    const draw = await client.query<SqlRow>(`
      INSERT INTO research_sample_draws (
        study_id,
        frame_snapshot_id,
        label,
        algorithm_version,
        random_seed,
        target_n,
        status
      )
      VALUES ($1,$2,$3,'stratified-hash-rank-v2',$4,$5,'draft')
      RETURNING id
    `, [
      job.study_id,
      frame.id,
      text(input.label) || `sample-${actualTargetN}`,
      randomSeed,
      actualTargetN
    ]);
    const drawId = text(draw.rows[0]!.id);

    let selectionOffset = 0;
    for (const allocation of allocations) {
      if (!allocation.sampleCount) continue;
      const probability = allocation.sampleCount / allocation.populationCount;
      const baseWeight = allocation.populationCount / allocation.sampleCount;
      const inserted = await client.query<SqlRow>(`
        WITH chosen AS (
          SELECT id, external_key_hash
          FROM research_frame_units
          WHERE frame_snapshot_id=$1 AND stratum_id=$2
          ORDER BY md5($3::text || ':' || external_key_hash), external_key_hash
          LIMIT $4
        ),
        numbered AS (
          SELECT id, row_number() OVER (
            ORDER BY md5($3::text || ':' || external_key_hash), external_key_hash
          ) AS within_order
          FROM chosen
        )
        INSERT INTO research_sample_units (
          sample_draw_id,
          frame_unit_id,
          stratum_id,
          selection_order,
          inclusion_probability,
          base_weight
        )
        SELECT
          $5::uuid,
          id,
          $2::uuid,
          $6::int + within_order::int,
          $7::numeric,
          $8::numeric
        FROM numbered
        RETURNING id
      `, [
        frame.id,
        allocation.id,
        randomSeed,
        allocation.sampleCount,
        drawId,
        selectionOffset,
        probability.toFixed(12),
        baseWeight.toFixed(8)
      ]);
      if (inserted.rows.length !== allocation.sampleCount) {
        throw new Error(`RESEARCH_SAMPLE_STRATUM_COUNT_MISMATCH:${allocation.id}`);
      }
      selectionOffset += allocation.sampleCount;
    }

    await client.query(`
      INSERT INTO research_sample_disposition_events (
        sample_unit_id,
        disposition_code,
        eligibility,
        source,
        metadata
      )
      SELECT id, 'selected', 'eligible', 'sample_draw',
             jsonb_build_object('drawId',$1::text,'algorithmVersion','stratified-hash-rank-v2')
      FROM research_sample_units
      WHERE sample_draw_id=$1
    `, [drawId]);

    await client.query(`
      UPDATE research_sample_draws
      SET status='superseded'
      WHERE study_id=$1 AND id<>$2 AND status='locked'
    `, [job.study_id, drawId]);
    await client.query(`
      UPDATE research_sample_draws
      SET status='locked', drawn_at=now()
      WHERE id=$1
    `, [drawId]);
    await client.query("COMMIT");

    return {
      sampleDrawId: drawId,
      frameSnapshotId: text(frame.id),
      frameContentSha256: text(frame.content_sha256),
      targetN: actualTargetN,
      algorithmVersion: "stratified-hash-rank-v2",
      randomSeed,
      strata: allocations.filter((allocation) => allocation.sampleCount > 0).length
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function processInviteBatchJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  assertResearchSurveyEmailReady();
  const pool = getProductionPostgresRuntime().sqlPool;
  const input = objectValue(job.input);
  const limit = Math.max(1, Math.min(500, Math.floor(numberValue(input.limit) || 100)));
  const currentOutput = objectValue(job.output);
  let batchId = text(currentOutput.batchId);
  let sampleUnitIds = Array.isArray(currentOutput.sampleUnitIds)
    ? currentOutput.sampleUnitIds.map(text).filter(Boolean)
    : [];

  if (!batchId || !sampleUnitIds.length) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const study = await client.query<SqlRow>(`
        SELECT
          s.id AS study_id,s.slug,s.title,s.status AS study_status,s.fieldwork_ends_at,
          i.id AS instrument_id,
          d.id AS sample_draw_id,
          rt.id AS recruitment_template_id
        FROM research_studies s
        JOIN LATERAL (
          SELECT id FROM research_instruments
          WHERE study_id=s.id AND status IN ('locked','fielding')
          ORDER BY created_at DESC LIMIT 1
        ) i ON true
        JOIN LATERAL (
          SELECT id FROM research_sample_draws
          WHERE study_id=s.id AND status IN ('locked','fielded')
          ORDER BY created_at DESC LIMIT 1
        ) d ON true
        JOIN LATERAL (
          SELECT id FROM research_recruitment_templates
          WHERE study_id=s.id AND channel='email' AND status='locked'
            AND purpose='research_invitation'
          ORDER BY locked_at DESC NULLS LAST,created_at DESC LIMIT 1
        ) rt ON true
        WHERE s.id=$1
        FOR UPDATE OF s
      `, [job.study_id]);
      const row = study.rows[0];
      if (!row) throw new Error("RESEARCH_INVITE_BATCH_NOT_READY");
      if (!["pilot","fielding"].includes(text(row.study_status))) throw new Error("SURVEY_NOT_OPEN");

      const candidates = await client.query<SqlRow>(`
        SELECT su.id AS sample_unit_id
        FROM research_sample_units su
        WHERE su.sample_draw_id=$1
          AND EXISTS (
            SELECT 1 FROM research_contact_points cp
            WHERE cp.frame_unit_id=su.frame_unit_id
              AND cp.contact_type='email'
              AND cp.suppression_status='active'
              AND NOT public.research_contact_is_suppressed(cp.contact_type, cp.contact_value_hash)
          )
          AND NOT EXISTS (
            SELECT 1 FROM research_invites ri
            WHERE ri.study_id=$2
              AND ri.sample_unit_id=su.id
              AND ri.status <> 'expired'
          )
        ORDER BY su.selection_order
        LIMIT $3
        FOR UPDATE OF su SKIP LOCKED
      `, [row.sample_draw_id, row.study_id, limit]);
      sampleUnitIds = candidates.rows.map((candidate) => text(candidate.sample_unit_id));

      if (!sampleUnitIds.length) {
        await client.query("COMMIT");
        return {
          batchId: undefined,
          plannedCount: 0,
          sentCount: 0,
          failedCount: 0,
          reason: "no_contactable_unsent_sample_units"
        };
      }

      const batch = await client.query<SqlRow>(`
        INSERT INTO research_invite_batches (
          study_id,sample_draw_id,instrument_id,recruitment_template_id,label,channel,status,planned_count
        )
        VALUES ($1,$2,$3,$4,$5,'email','ready',$6)
        RETURNING id
      `, [
        row.study_id,
        row.sample_draw_id,
        row.instrument_id,
        row.recruitment_template_id,
        text(input.label) || `research-email-${new Date().toISOString()}`,
        sampleUnitIds.length
      ]);
      batchId = text(batch.rows[0]!.id);
      await client.query(`
        UPDATE research_study_jobs
        SET output=output || jsonb_build_object(
          'batchId',$2::text,
          'sampleUnitIds',$3::jsonb,
          'plannedCount',$4::int
        )
        WHERE id=$1
      `, [job.id, batchId, JSON.stringify(sampleUnitIds), sampleUnitIds.length]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  const batch = await pool.query<SqlRow>(`
    SELECT
      b.id,b.study_id,b.sample_draw_id,b.instrument_id,b.recruitment_template_id,
      s.slug,s.title,s.fieldwork_ends_at,
      rt.subject,rt.body_text,rt.version AS template_version
    FROM research_invite_batches b
    JOIN research_studies s ON s.id=b.study_id
    JOIN research_recruitment_templates rt ON rt.id=b.recruitment_template_id
    WHERE b.id=$1
    LIMIT 1
  `, [batchId]);
  const batchRow = batch.rows[0];
  if (!batchRow) throw new Error("RESEARCH_INVITE_BATCH_NOT_FOUND");
  await pool.query(`
    UPDATE research_invite_batches
    SET status='sending',started_at=COALESCE(started_at,now())
    WHERE id=$1 AND status IN ('ready','sending')
  `, [batchId]);

  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
  let sentCount = 0;
  let failedCount = 0;
  let alreadySentCount = 0;
  const failures: Array<{ sampleUnitId: string; error: string }> = [];

  for (const sampleUnitId of sampleUnitIds) {
    const prior = await pool.query<SqlRow>(`
      SELECT id,status
      FROM research_invites
      WHERE batch_id=$1 AND sample_unit_id=$2
      ORDER BY created_at DESC
      LIMIT 1
    `, [batchId, sampleUnitId]);
    const priorRow = prior.rows[0];
    if (priorRow && ["sent","opened","started","completed","suppressed"].includes(text(priorRow.status))) {
      alreadySentCount += 1;
      continue;
    }
    if (priorRow && text(priorRow.status) === "created") {
      // A process can terminate after the provider accepted a message but before
      // the database records its MessageId. The raw token is intentionally not
      // recoverable, so the ambiguous attempt is expired and a fresh token is
      // generated. SES events/tags preserve evidence if the first send surfaces.
      await pool.query(
        "UPDATE research_invites SET status='expired' WHERE id=$1 AND status='created'",
        [priorRow.id]
      );
      await pool.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'expired','{"source":"research_worker","reason":"orphaned_created_attempt"}'::jsonb)
      `, [priorRow.id]);
    }

    const candidate = await pool.query<SqlRow>(`
      SELECT su.id AS sample_unit_id,cp.id AS contact_point_id,cp.contact_value
      FROM research_sample_units su
      JOIN LATERAL (
        SELECT id,contact_value
        FROM research_contact_points
        WHERE frame_unit_id=su.frame_unit_id
          AND contact_type='email'
          AND suppression_status='active'
          AND NOT public.research_contact_is_suppressed(contact_type, contact_value_hash)
        ORDER BY (verified_at IS NOT NULL) DESC,verified_at DESC NULLS LAST,created_at,id
        LIMIT 1
      ) cp ON true
      WHERE su.id=$1 AND su.sample_draw_id=$2
      LIMIT 1
    `, [sampleUnitId, batchRow.sample_draw_id]);
    const contact = candidate.rows[0];
    if (!contact) {
      failedCount += 1;
      failures.push({ sampleUnitId, error: "NO_ACTIVE_EMAIL_CONTACT" });
      continue;
    }

    const token = randomBytes(32).toString("base64url");
    const invite = await pool.query<SqlRow>(`
      INSERT INTO research_invites (
        study_id,instrument_id,sample_unit_id,contact_point_id,batch_id,token_hash,channel,status,expires_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,'email','created',
        COALESCE($7::timestamptz,now() + interval '30 days')
      )
      RETURNING id,expires_at
    `, [
      batchRow.study_id,
      batchRow.instrument_id,
      sampleUnitId,
      contact.contact_point_id,
      batchId,
      sha256(token),
      batchRow.fieldwork_ends_at ?? null
    ]);
    const inviteRow = invite.rows[0]!;
    const inviteId = text(inviteRow.id);
    await pool.query(`
      INSERT INTO research_invite_events (invite_id,event_type,metadata)
      VALUES (
        $1,'created',
        jsonb_build_object(
          'source','research_worker',
          'batchId',$2::text,
          'templateVersion',$3::text
        )
      )
    `, [inviteId, batchId, batchRow.template_version]);

    const attempt = await pool.query<SqlRow>(`
      INSERT INTO research_invite_messages (
        job_id,invite_id,contact_point_id,recruitment_template_id,
        attempt_kind,sequence_no,status,provider
      )
      VALUES ($1,$2,$3,$4,'initial',1,'sending','ses')
      ON CONFLICT (invite_id,sequence_no)
      DO UPDATE SET
        job_id=COALESCE(research_invite_messages.job_id,EXCLUDED.job_id),
        updated_at=now()
      RETURNING id,status
    `, [
      job.id,
      inviteId,
      contact.contact_point_id,
      batchRow.recruitment_template_id
    ]);
    const attemptId = text(attempt.rows[0]!.id);

    const surveyUrl = `${base}/research/${encodeURIComponent(text(batchRow.slug))}/t/${encodeURIComponent(token)}`;
    const methodologyUrl = `${base}/research/${encodeURIComponent(text(batchRow.slug))}/methodology`;
    try {
      const delivery = await sendResearchSurveyInvitation({
        destination: text(contact.contact_value),
        studySlug: text(batchRow.slug),
        studyTitle: text(batchRow.title),
        inviteId,
        batchId,
        attemptId,
        attemptKind: "initial",
        surveyUrl,
        methodologyUrl,
        subjectTemplate: text(batchRow.subject),
        bodyTemplate: text(batchRow.body_text)
      });
      await pool.query(`
        UPDATE research_invites
        SET status='sent',sent_at=now()
        WHERE id=$1 AND status='created'
      `, [inviteId]);
      await pool.query(`
        UPDATE research_invite_messages
        SET status=CASE
              WHEN status IN ('delivered','opened','bounced','complained') THEN status
              ELSE 'sent'
            END,
            provider_message_id=COALESCE(provider_message_id,$2),
            sent_at=COALESCE(sent_at,now()),
            updated_at=now(),
            last_error=CASE
              WHEN status IN ('bounced','complained') THEN last_error
              ELSE NULL
            END
        WHERE id=$1
      `, [attemptId, delivery.providerMessageId]);
      await pool.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES (
          $1,'sent',
          jsonb_build_object(
            'source','ses',
            'providerMessageId',$2::text,
            'configurationSet',$3::text,
            'attemptId',$4::text,
            'attemptKind','initial'
          )
        )
      `, [
        inviteId,
        delivery.providerMessageId,
        process.env.BLS_RESEARCH_SES_CONFIGURATION_SET?.trim() || "",
        attemptId
      ]);
      await pool.query(`
        INSERT INTO research_sample_disposition_events (
          sample_unit_id,disposition_code,eligibility,source,metadata
        )
        VALUES (
          $1,'invited','eligible','ses',
          jsonb_build_object('inviteId',$2::text,'providerMessageId',$3::text)
        )
      `, [sampleUnitId, inviteId, delivery.providerMessageId]);
      sentCount += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/[\r\n]+/g, " ")
        .slice(0, 800);
      await pool.query(
        "UPDATE research_invites SET status='expired' WHERE id=$1 AND status='created'",
        [inviteId]
      );
      const attemptFailure = await pool.query<SqlRow>(`
        UPDATE research_invite_messages
        SET status=CASE
              WHEN status IN ('delivered','opened','bounced','complained') THEN status
              ELSE 'failed'
            END,
            last_error=CASE
              WHEN status IN ('delivered','opened') THEN last_error
              ELSE $2
            END,
            updated_at=now()
        WHERE id=$1
        RETURNING status
      `, [attemptId, message]);
      const finalAttemptStatus = text(attemptFailure.rows[0]?.status);
      if (["delivered","opened"].includes(finalAttemptStatus)) {
        sentCount += 1;
      } else {
        await pool.query(`
          INSERT INTO research_invite_events (invite_id,event_type,metadata)
          VALUES ($1,'expired',jsonb_build_object('source','research_worker','reason','send_failed','error',$2::text))
        `, [inviteId, message]);
        failedCount += 1;
        failures.push({ sampleUnitId, error: message });
      }
    }
  }

  const completed = failedCount === 0;
  await pool.query(`
    UPDATE research_invite_batches
    SET status=$2,completed_at=CASE WHEN $2='complete' THEN now() ELSE NULL END
    WHERE id=$1
  `, [batchId, completed ? "complete" : "ready"]);
  await pool.query(`
    UPDATE research_study_jobs
    SET output=output || $2::jsonb
    WHERE id=$1
  `, [job.id, JSON.stringify({
    batchId,
    plannedCount: sampleUnitIds.length,
    sentCount,
    alreadySentCount,
    failedCount,
    failures: failures.slice(0, 25)
  })]);

  if (failedCount > 0) {
    throw new Error(`RESEARCH_INVITE_PARTIAL_FAILURE:${failedCount}`);
  }

  return {
    batchId,
    plannedCount: sampleUnitIds.length,
    sentCount,
    alreadySentCount,
    failedCount: 0
  };
}


async function processInviteReminderJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  assertResearchSurveyEmailReady();
  const pool = getProductionPostgresRuntime().sqlPool;
  const input = objectValue(job.input);
  const templateId = text(input.templateId);
  const limit = Math.max(1, Math.min(500, Math.floor(numberValue(input.limit) || 100)));
  const minAgeDays = Math.max(1, Math.min(90, Math.floor(numberValue(input.minAgeDays) || 5)));
  const minGapDays = Math.max(1, Math.min(90, Math.floor(numberValue(input.minGapDays) || 5)));
  const maxReminders = Math.max(1, Math.min(5, Math.floor(numberValue(input.maxReminders) || 2)));
  if (!templateId) throw new Error("RESEARCH_REMINDER_TEMPLATE_NOT_READY");

  const templateResult = await pool.query<SqlRow>(`
    SELECT
      rt.id AS template_id,
      rt.subject,
      rt.body_text,
      rt.version AS template_version,
      s.slug,
      s.title,
      s.status AS study_status
    FROM research_recruitment_templates rt
    JOIN research_studies s ON s.id=rt.study_id
    WHERE rt.id=$1
      AND rt.study_id=$2
      AND rt.channel='email'
      AND rt.status='locked'
      AND rt.purpose='research_reminder'
    LIMIT 1
  `, [templateId, job.study_id]);
  const template = templateResult.rows[0];
  if (!template) throw new Error("RESEARCH_REMINDER_TEMPLATE_NOT_READY");
  if (!["pilot","fielding"].includes(text(template.study_status))) throw new Error("SURVEY_NOT_OPEN");

  const currentOutput = objectValue(job.output);
  let inviteIds = Array.isArray(currentOutput.inviteIds)
    ? currentOutput.inviteIds.map(text).filter(Boolean)
    : [];

  if (!inviteIds.length) {
    const candidates = await pool.query<SqlRow>(`
      WITH reminder_stats AS (
        SELECT
          invite_id,
          count(*) FILTER (
            WHERE attempt_kind='reminder'
              AND status IN ('sent','delivered','opened')
          )::int AS sent_reminders,
          max(sent_at) FILTER (
            WHERE attempt_kind='reminder'
              AND status IN ('sent','delivered','opened')
          ) AS last_reminder_sent_at
        FROM research_invite_messages
        GROUP BY invite_id
      )
      SELECT ri.id AS invite_id
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      LEFT JOIN research_responses rr ON rr.invite_id=ri.id
      LEFT JOIN reminder_stats stats ON stats.invite_id=ri.id
      WHERE ri.study_id=$1
        AND ri.sent_at IS NOT NULL
        AND ri.status IN ('sent','opened','started')
        AND (ri.expires_at IS NULL OR ri.expires_at > now())
        AND ri.sent_at <= now() - ($2::int * interval '1 day')
        AND COALESCE(rr.status,'') NOT IN ('completed','withdrawn','excluded')
        AND COALESCE(stats.sent_reminders,0) < $3
        AND COALESCE(stats.last_reminder_sent_at,ri.sent_at)
              <= now() - ($4::int * interval '1 day')
        AND EXISTS (
          SELECT 1
          FROM research_contact_points cp
          WHERE cp.frame_unit_id=su.frame_unit_id
            AND cp.contact_type='email'
            AND cp.suppression_status='active'
            AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        )
      ORDER BY
        COALESCE(stats.last_reminder_sent_at,ri.sent_at),
        ri.created_at,
        ri.id
      LIMIT $5
    `, [job.study_id, minAgeDays, maxReminders, minGapDays, limit]);
    inviteIds = candidates.rows.map((row) => text(row.invite_id));

    await pool.query(`
      UPDATE research_study_jobs
      SET output=output || jsonb_build_object(
        'inviteIds',$2::jsonb,
        'candidateCount',$3::int,
        'templateId',$4::text,
        'minAgeDays',$5::int,
        'minGapDays',$6::int,
        'maxReminders',$7::int
      )
      WHERE id=$1
    `, [
      job.id,
      JSON.stringify(inviteIds),
      inviteIds.length,
      templateId,
      minAgeDays,
      minGapDays,
      maxReminders
    ]);
  }

  if (!inviteIds.length) {
    return {
      candidateCount: 0,
      sentCount: 0,
      skippedCount: 0,
      failedCount: 0,
      reason: "no_eligible_reminders"
    };
  }

  const base = (process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
  let sentCount = 0;
  let skippedCount = 0;
  let failedCount = 0;
  const failures: Array<{ inviteId: string; error: string }> = [];

  for (const inviteId of inviteIds) {
    const priorAttempt = await pool.query<SqlRow>(`
      SELECT id,status
      FROM research_invite_messages
      WHERE job_id=$1 AND invite_id=$2
      LIMIT 1
    `, [job.id, inviteId]);
    if (priorAttempt.rows[0]) {
      const priorStatus = text(priorAttempt.rows[0].status);
      if (["sent","delivered","opened"].includes(priorStatus)) sentCount += 1;
      else {
        skippedCount += 1;
        failures.push({ inviteId, error: "PRIOR_ATTEMPT_NOT_RETRIED:" + priorStatus });
      }
      continue;
    }

    const candidate = await pool.query<SqlRow>(`
      WITH reminder_stats AS (
        SELECT
          count(*) FILTER (
            WHERE attempt_kind='reminder'
              AND status IN ('sent','delivered','opened')
          )::int AS sent_reminders,
          max(sent_at) FILTER (
            WHERE attempt_kind='reminder'
              AND status IN ('sent','delivered','opened')
          ) AS last_reminder_sent_at,
          COALESCE(max(sequence_no),0)::int AS max_sequence
        FROM research_invite_messages
        WHERE invite_id=$1
      )
      SELECT
        ri.id AS invite_id,
        ri.sample_unit_id,
        ri.expires_at,
        cp.id AS contact_point_id,
        cp.contact_value,
        stats.sent_reminders,
        stats.last_reminder_sent_at,
        stats.max_sequence
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      LEFT JOIN research_responses rr ON rr.invite_id=ri.id
      CROSS JOIN reminder_stats stats
      JOIN LATERAL (
        SELECT id,contact_value
        FROM research_contact_points
        WHERE frame_unit_id=su.frame_unit_id
          AND contact_type='email'
          AND suppression_status='active'
          AND NOT public.research_contact_is_suppressed(contact_type,contact_value_hash)
        ORDER BY (verified_at IS NOT NULL) DESC,verified_at DESC NULLS LAST,created_at,id
        LIMIT 1
      ) cp ON true
      WHERE ri.id=$1
        AND ri.study_id=$2
        AND ri.sent_at IS NOT NULL
        AND ri.status IN ('sent','opened','started')
        AND (ri.expires_at IS NULL OR ri.expires_at > now())
        AND ri.sent_at <= now() - ($3::int * interval '1 day')
        AND COALESCE(rr.status,'') NOT IN ('completed','withdrawn','excluded')
        AND stats.sent_reminders < $4
        AND COALESCE(stats.last_reminder_sent_at,ri.sent_at)
              <= now() - ($5::int * interval '1 day')
      LIMIT 1
    `, [inviteId, job.study_id, minAgeDays, maxReminders, minGapDays]);
    const row = candidate.rows[0];
    if (!row) {
      skippedCount += 1;
      continue;
    }

    const token = randomBytes(32).toString("base64url");
    const accessToken = await pool.query<SqlRow>(`
      INSERT INTO research_invite_access_tokens (
        invite_id,recruitment_template_id,token_hash,token_kind,status,expires_at
      )
      VALUES ($1,$2,$3,'reminder','active',$4)
      RETURNING id
    `, [inviteId, templateId, sha256(token), row.expires_at ?? null]);
    const accessTokenId = text(accessToken.rows[0]!.id);
    const reminderNumber = numberValue(row.sent_reminders) + 1;
    const sequenceNo = Math.max(2, numberValue(row.max_sequence) + 1);

    let attemptId = "";
    try {
      const attempt = await pool.query<SqlRow>(`
        INSERT INTO research_invite_messages (
          job_id,invite_id,contact_point_id,recruitment_template_id,access_token_id,
          attempt_kind,sequence_no,status,provider
        )
        VALUES ($1,$2,$3,$4,$5,'reminder',$6,'sending','ses')
        RETURNING id
      `, [
        job.id,
        inviteId,
        row.contact_point_id,
        templateId,
        accessTokenId,
        sequenceNo
      ]);
      attemptId = text(attempt.rows[0]!.id);

      const surveyUrl = `${base}/research/${encodeURIComponent(text(template.slug))}/t/${encodeURIComponent(token)}`;
      const methodologyUrl = `${base}/research/${encodeURIComponent(text(template.slug))}/methodology`;
      const delivery = await sendResearchSurveyInvitation({
        destination: text(row.contact_value),
        studySlug: text(template.slug),
        studyTitle: text(template.title),
        inviteId,
        attemptId,
        attemptKind: "reminder",
        surveyUrl,
        methodologyUrl,
        subjectTemplate: text(template.subject),
        bodyTemplate: text(template.body_text)
      });

      await pool.query(`
        UPDATE research_invite_messages
        SET status=CASE
              WHEN status IN ('delivered','opened','bounced','complained') THEN status
              ELSE 'sent'
            END,
            provider_message_id=COALESCE(provider_message_id,$2),
            sent_at=COALESCE(sent_at,now()),
            updated_at=now(),
            last_error=CASE
              WHEN status IN ('bounced','complained') THEN last_error
              ELSE NULL
            END
        WHERE id=$1
      `, [attemptId, delivery.providerMessageId]);

      await pool.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES (
          $1,
          'sent',
          jsonb_build_object(
            'source','ses',
            'providerMessageId',$2::text,
            'configurationSet',$3::text,
            'attemptId',$4::text,
            'attemptKind','reminder',
            'reminderNumber',$5::int,
            'templateVersion',$6::text
          )
        )
      `, [
        inviteId,
        delivery.providerMessageId,
        process.env.BLS_RESEARCH_SES_CONFIGURATION_SET?.trim() || "",
        attemptId,
        reminderNumber,
        template.template_version
      ]);
      sentCount += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/[\r\n]+/g, " ")
        .slice(0, 800);
      let finalAttemptStatus = "failed";
      if (attemptId) {
        const attemptFailure = await pool.query<SqlRow>(`
          UPDATE research_invite_messages
          SET status=CASE
                WHEN status IN ('delivered','opened','bounced','complained') THEN status
                ELSE 'failed'
              END,
              last_error=CASE
                WHEN status IN ('delivered','opened') THEN last_error
                ELSE $2
              END,
              updated_at=now()
          WHERE id=$1
          RETURNING status
        `, [attemptId, message]);
        finalAttemptStatus = text(attemptFailure.rows[0]?.status) || "failed";
      }
      if (["delivered","opened"].includes(finalAttemptStatus)) {
        sentCount += 1;
      } else {
        await pool.query(`
          UPDATE research_invite_access_tokens
          SET status='revoked',revoked_at=now()
          WHERE id=$1 AND status='active'
        `, [accessTokenId]);
        failedCount += 1;
        failures.push({ inviteId, error: message });
      }
    }
  }

  return {
    candidateCount: inviteIds.length,
    sentCount,
    skippedCount,
    failedCount,
    failures: failures.slice(0,25),
    minAgeDays,
    minGapDays,
    maxReminders,
    templateId
  };
}

async function processRewardDeliveryJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  assertResearchSurveyEmailReady();
  researchRewardSecret();
  const pool = getProductionPostgresRuntime().sqlPool;
  const input = objectValue(job.input);
  const requestedResponseId = text(input.responseId).trim();
  const limit = requestedResponseId
    ? 1
    : Math.max(1, Math.min(250, Math.floor(numberValue(input.limit) || 100)));

  const candidates = await pool.query<SqlRow>(`
    WITH latest_consent AS (
      SELECT DISTINCT ON (rc.response_id)
        rc.response_id,rc.granted
      FROM research_consents rc
      WHERE rc.consent_kind='thank_you_code'
      ORDER BY rc.response_id,rc.occurred_at DESC,rc.id DESC
    )
    SELECT
      re.id AS entitlement_id,
      rr.id AS response_id,
      cp.id AS contact_point_id,
      cp.contact_value,
      s.slug,
      s.title
    FROM research_reward_entitlements re
    JOIN research_responses rr ON rr.id=re.response_id
    JOIN research_studies s ON s.id=rr.study_id
    JOIN research_invites ri ON ri.id=rr.invite_id
    JOIN research_contact_points cp ON cp.id=ri.contact_point_id
    JOIN latest_consent consent ON consent.response_id=rr.id AND consent.granted=true
    LEFT JOIN LATERAL (
      SELECT e.action,e.reason
      FROM research_contact_suppression_events e
      WHERE e.contact_type=cp.contact_type
        AND e.contact_value_hash=cp.contact_value_hash
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
    ) suppression ON true
    WHERE rr.study_id=$1
      AND rr.status='completed'
      AND re.reward_kind='thank_you_code'
      AND re.status IN ('eligible','issued')
      AND cp.contact_type='email'
      AND cp.contact_value <> ''
      AND cp.suppression_status NOT IN ('invalid','bounced')
      AND (
        cp.suppression_status='active'
        OR suppression.action='restore'
        OR (
          suppression.action='suppress'
          AND suppression.reason='participant_research_opt_out'
        )
      )
      AND ($2::text='' OR rr.id::text=$2::text)
      AND NOT EXISTS (
        SELECT 1
        FROM research_participant_deliveries d
        WHERE d.reward_entitlement_id=re.id
          AND d.message_kind='thank_you_code'
          AND d.status='sent'
      )
    ORDER BY re.created_at,re.id
    LIMIT $3
  `, [job.study_id, requestedResponseId, limit]);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failures: Array<{ responseId: string; error: string }> = [];
  const joinUrl = absoluteResearchUrl("/join");
  const methodologyUrl = absoluteResearchUrl(`/research/${STUDY_SLUG}/methodology`);

  for (const candidate of candidates.rows) {
    const entitlementId = text(candidate.entitlement_id);
    const responseId = text(candidate.response_id);
    const contactPointId = text(candidate.contact_point_id);
    const inserted = await pool.query<SqlRow>(`
      INSERT INTO research_participant_deliveries (
        study_id,response_id,contact_point_id,reward_entitlement_id,
        message_kind,consent_kind,status,provider
      )
      VALUES ($1,$2,$3,$4,'thank_you_code','thank_you_code','planned','ses')
      ON CONFLICT DO NOTHING
      RETURNING id,status
    `, [job.study_id, responseId, contactPointId, entitlementId]);

    const deliveryResult = inserted.rows[0]
      ? inserted
      : await pool.query<SqlRow>(`
          SELECT id,status
          FROM research_participant_deliveries
          WHERE reward_entitlement_id=$1 AND message_kind='thank_you_code'
          LIMIT 1
        `, [entitlementId]);
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new Error("RESEARCH_REWARD_DELIVERY_LEDGER_MISSING");
    const deliveryId = text(delivery.id);
    if (text(delivery.status) === "sent") {
      skippedCount += 1;
      continue;
    }
    if (inserted.rows[0]) {
      await recordParticipantDeliveryEvent(deliveryId, "planned", {
        source: "research_worker",
        jobId: job.id,
        entitlementId
      });
    }

    const rewardCode = rewardCodeForEntitlement(entitlementId);
    await pool.query(`
      UPDATE research_participant_deliveries
      SET status='sending',
          attempt_count=attempt_count+1,
          last_error=NULL,
          updated_at=now()
      WHERE id=$1
    `, [deliveryId]);
    await recordParticipantDeliveryEvent(deliveryId, "sending", {
      source: "research_worker",
      jobId: job.id
    });

    try {
      const sent = await sendResearchThankYouCode({
        destination: text(candidate.contact_value),
        studySlug: text(candidate.slug),
        studyTitle: text(candidate.title),
        responseId,
        deliveryId,
        rewardCode,
        joinUrl,
        methodologyUrl
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          UPDATE research_participant_deliveries
          SET status='sent',
              provider_message_id=$2,
              subject_sha256=$3,
              body_sha256=$4,
              sent_at=now(),
              last_error=NULL,
              updated_at=now()
          WHERE id=$1
        `, [deliveryId, sent.providerMessageId, sent.subjectSha256, sent.bodySha256]);
        await client.query(`
          INSERT INTO research_participant_delivery_events
            (delivery_id,event_type,provider_message_id,metadata)
          VALUES ($1,'sent',$2,jsonb_build_object('source','ses','jobId',$3::text))
        `, [deliveryId, sent.providerMessageId, job.id]);
        await client.query(`
          UPDATE research_reward_entitlements
          SET code_hash=$2,
              status=CASE WHEN status='eligible' THEN 'issued' ELSE status END,
              issued_at=COALESCE(issued_at,now()),
              metadata=metadata || jsonb_build_object(
                'deliveryId',$3::text,
                'codeDerivation','hmac-sha256-v1'
              )
          WHERE id=$1 AND status IN ('eligible','issued')
        `, [entitlementId, sha256(rewardCode), deliveryId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      sentCount += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/[\r\n]+/g, " ")
        .slice(0, 1000);
      await pool.query(`
        UPDATE research_participant_deliveries
        SET status='failed',last_error=$2,updated_at=now()
        WHERE id=$1
      `, [deliveryId, message]);
      await recordParticipantDeliveryEvent(deliveryId, "failed", {
        source: "research_worker",
        jobId: job.id,
        error: message
      });
      failedCount += 1;
      failures.push({ responseId, error: message });
    }
  }

  if (failedCount > 0) {
    await pool.query(`
      UPDATE research_study_jobs
      SET output=output || $2::jsonb
      WHERE id=$1
    `, [job.id, JSON.stringify({
      candidateCount: candidates.rows.length,
      sentCount,
      skippedCount,
      failedCount,
      failures: failures.slice(0, 25)
    })]);
    throw new Error(`RESEARCH_REWARD_DELIVERY_PARTIAL_FAILURE:${failedCount}`);
  }

  return {
    candidateCount: candidates.rows.length,
    sentCount,
    skippedCount,
    failedCount: 0
  };
}

async function processResultsNotificationJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  assertResearchSurveyEmailReady();
  const pool = getProductionPostgresRuntime().sqlPool;
  const input = objectValue(job.input);
  const releaseSnapshotId = text(input.releaseSnapshotId).trim();
  const limit = Math.max(1, Math.min(250, Math.floor(numberValue(input.limit) || 100)));
  if (!releaseSnapshotId) throw new Error("RESEARCH_RESULTS_NOTIFICATION_JOB_INVALID");

  const releaseResult = await pool.query<SqlRow>(`
    SELECT
      rs.id,rs.release_version,rs.public_url,rs.published_at,
      s.slug,s.title
    FROM research_release_snapshots rs
    JOIN research_studies s ON s.id=rs.study_id
    WHERE rs.id=$1 AND rs.study_id=$2
    LIMIT 1
  `, [releaseSnapshotId, job.study_id]);
  const release = releaseResult.rows[0];
  if (!release || !release.published_at) {
    throw new Error("RESEARCH_RESULTS_NOTIFICATION_REQUIRES_PUBLISHED_RELEASE");
  }
  const resultsUrl = absoluteResearchUrl(text(release.public_url) || `/research/${text(release.slug)}/results`);
  const methodologyUrl = absoluteResearchUrl(`/research/${text(release.slug)}/methodology`);

  const candidates = await pool.query<SqlRow>(`
    WITH latest_consent AS (
      SELECT DISTINCT ON (rc.response_id)
        rc.response_id,rc.granted
      FROM research_consents rc
      WHERE rc.consent_kind='results_notification'
      ORDER BY rc.response_id,rc.occurred_at DESC,rc.id DESC
    )
    SELECT
      rr.id AS response_id,
      cp.id AS contact_point_id,
      cp.contact_value
    FROM research_responses rr
    JOIN research_invites ri ON ri.id=rr.invite_id
    JOIN research_contact_points cp ON cp.id=ri.contact_point_id
    JOIN latest_consent consent ON consent.response_id=rr.id AND consent.granted=true
    LEFT JOIN LATERAL (
      SELECT e.action,e.reason
      FROM research_contact_suppression_events e
      WHERE e.contact_type=cp.contact_type
        AND e.contact_value_hash=cp.contact_value_hash
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
    ) suppression ON true
    WHERE rr.study_id=$1
      AND rr.status='completed'
      AND cp.contact_type='email'
      AND cp.contact_value <> ''
      AND cp.suppression_status NOT IN ('invalid','bounced')
      AND (
        cp.suppression_status='active'
        OR suppression.action='restore'
        OR (
          suppression.action='suppress'
          AND suppression.reason='participant_research_opt_out'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM research_participant_deliveries d
        WHERE d.response_id=rr.id
          AND d.release_snapshot_id=$2
          AND d.message_kind='results_notification'
          AND d.status='sent'
      )
    ORDER BY rr.completed_at,rr.id
    LIMIT $3
  `, [job.study_id, releaseSnapshotId, limit]);

  let sentCount = 0;
  let failedCount = 0;
  let skippedCount = 0;
  const failures: Array<{ responseId: string; error: string }> = [];

  for (const candidate of candidates.rows) {
    const responseId = text(candidate.response_id);
    const contactPointId = text(candidate.contact_point_id);
    const inserted = await pool.query<SqlRow>(`
      INSERT INTO research_participant_deliveries (
        study_id,response_id,contact_point_id,release_snapshot_id,
        message_kind,consent_kind,status,provider
      )
      VALUES ($1,$2,$3,$4,'results_notification','results_notification','planned','ses')
      ON CONFLICT DO NOTHING
      RETURNING id,status
    `, [job.study_id, responseId, contactPointId, releaseSnapshotId]);
    const deliveryResult = inserted.rows[0]
      ? inserted
      : await pool.query<SqlRow>(`
          SELECT id,status
          FROM research_participant_deliveries
          WHERE response_id=$1
            AND release_snapshot_id=$2
            AND message_kind='results_notification'
          LIMIT 1
        `, [responseId, releaseSnapshotId]);
    const delivery = deliveryResult.rows[0];
    if (!delivery) throw new Error("RESEARCH_RESULTS_DELIVERY_LEDGER_MISSING");
    const deliveryId = text(delivery.id);
    if (text(delivery.status) === "sent") {
      skippedCount += 1;
      continue;
    }
    if (inserted.rows[0]) {
      await recordParticipantDeliveryEvent(deliveryId, "planned", {
        source: "research_worker",
        jobId: job.id,
        releaseSnapshotId
      });
    }

    await pool.query(`
      UPDATE research_participant_deliveries
      SET status='sending',
          attempt_count=attempt_count+1,
          last_error=NULL,
          updated_at=now()
      WHERE id=$1
    `, [deliveryId]);
    await recordParticipantDeliveryEvent(deliveryId, "sending", {
      source: "research_worker",
      jobId: job.id
    });

    try {
      const sent = await sendResearchResultsNotification({
        destination: text(candidate.contact_value),
        studySlug: text(release.slug),
        studyTitle: text(release.title),
        responseId,
        deliveryId,
        releaseVersion: text(release.release_version),
        resultsUrl,
        methodologyUrl
      });
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(`
          UPDATE research_participant_deliveries
          SET status='sent',
              provider_message_id=$2,
              subject_sha256=$3,
              body_sha256=$4,
              sent_at=now(),
              last_error=NULL,
              updated_at=now()
          WHERE id=$1
        `, [deliveryId, sent.providerMessageId, sent.subjectSha256, sent.bodySha256]);
        await client.query(`
          INSERT INTO research_participant_delivery_events
            (delivery_id,event_type,provider_message_id,metadata)
          VALUES ($1,'sent',$2,jsonb_build_object(
            'source','ses',
            'jobId',$3::text,
            'releaseSnapshotId',$4::text
          ))
        `, [deliveryId, sent.providerMessageId, job.id, releaseSnapshotId]);
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release();
      }
      sentCount += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error))
        .replace(/[\r\n]+/g, " ")
        .slice(0, 1000);
      await pool.query(`
        UPDATE research_participant_deliveries
        SET status='failed',last_error=$2,updated_at=now()
        WHERE id=$1
      `, [deliveryId, message]);
      await recordParticipantDeliveryEvent(deliveryId, "failed", {
        source: "research_worker",
        jobId: job.id,
        releaseSnapshotId,
        error: message
      });
      failedCount += 1;
      failures.push({ responseId, error: message });
    }
  }

  if (failedCount > 0) {
    await pool.query(`
      UPDATE research_study_jobs
      SET output=output || $2::jsonb
      WHERE id=$1
    `, [job.id, JSON.stringify({
      releaseSnapshotId,
      candidateCount: candidates.rows.length,
      sentCount,
      skippedCount,
      failedCount,
      failures: failures.slice(0, 25)
    })]);
    throw new Error(`RESEARCH_RESULTS_NOTIFICATION_PARTIAL_FAILURE:${failedCount}`);
  }

  const remaining = await pool.query<SqlRow>(`
    WITH latest_consent AS (
      SELECT DISTINCT ON (rc.response_id)
        rc.response_id,rc.granted
      FROM research_consents rc
      WHERE rc.consent_kind='results_notification'
      ORDER BY rc.response_id,rc.occurred_at DESC,rc.id DESC
    )
    SELECT count(*)::int AS count
    FROM research_responses rr
    JOIN research_invites ri ON ri.id=rr.invite_id
    JOIN research_contact_points cp ON cp.id=ri.contact_point_id
    JOIN latest_consent consent ON consent.response_id=rr.id AND consent.granted=true
    LEFT JOIN LATERAL (
      SELECT e.action,e.reason
      FROM research_contact_suppression_events e
      WHERE e.contact_type=cp.contact_type
        AND e.contact_value_hash=cp.contact_value_hash
      ORDER BY e.occurred_at DESC,e.id DESC
      LIMIT 1
    ) suppression ON true
    WHERE rr.study_id=$1
      AND rr.status='completed'
      AND cp.contact_type='email'
      AND cp.contact_value <> ''
      AND cp.suppression_status NOT IN ('invalid','bounced')
      AND (
        cp.suppression_status='active'
        OR suppression.action='restore'
        OR (
          suppression.action='suppress'
          AND suppression.reason='participant_research_opt_out'
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM research_participant_deliveries d
        WHERE d.response_id=rr.id
          AND d.release_snapshot_id=$2
          AND d.message_kind='results_notification'
          AND d.status='sent'
      )
  `, [job.study_id, releaseSnapshotId]);
  const remainingCount = numberValue(remaining.rows[0]?.count);
  let continuationJobId: string | undefined;
  if (remainingCount > 0) {
    const next = await pool.query<SqlRow>(`
      INSERT INTO research_study_jobs (study_id,job_type,status,input)
      SELECT
        $1,'results_notification','queued',
        jsonb_build_object(
          'releaseSnapshotId',$2::text,
          'limit',$3::int,
          'label','results-notification-continuation'
        )
      WHERE NOT EXISTS (
        SELECT 1
        FROM research_study_jobs
        WHERE study_id=$1
          AND job_type='results_notification'
          AND status='queued'
          AND input->>'releaseSnapshotId'=$2
      )
      RETURNING id
    `, [job.study_id, releaseSnapshotId, limit]);
    continuationJobId = next.rows[0] ? text(next.rows[0].id) : undefined;
  }

  return {
    releaseSnapshotId,
    candidateCount: candidates.rows.length,
    sentCount,
    skippedCount,
    failedCount: 0,
    remainingCount,
    continuationJobId
  };
}

export async function processResearchStudyJobs(limit = 1): Promise<ResearchJobTick> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  let claimed = 0;
  let processed = 0;
  let requeued = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimResearchJob();
    if (!job) break;
    claimed += 1;
    try {
      const output = job.job_type === "frame_snapshot"
        ? await processFrameSnapshotJob(job)
        : job.job_type === "sample_draw"
          ? await processSampleDrawJob(job)
          : job.job_type === "invite_batch"
            ? await processInviteBatchJob(job)
            : job.job_type === "invite_reminder"
              ? await processInviteReminderJob(job)
              : job.job_type === "reward_delivery"
                ? await processRewardDeliveryJob(job)
              : job.job_type === "analysis"
                  ? await runGreekRetailAnalysis(job.study_id, job.id)
                : job.job_type === "release"
                    ? await buildGreekRetailRelease(job.study_id, job.id, objectValue(job.input))
                  : job.job_type === "results_notification"
                      ? await processResultsNotificationJob(job)
                    : (() => { throw new Error("RESEARCH_JOB_TYPE_UNSUPPORTED"); })();
      await markJobSucceeded(job.id, { ...objectValue(job.output), ...output });
      processed += 1;
    } catch (error) {
      const outcome = await markJobError(job, error);
      if (outcome === "requeued") requeued += 1;
      else failed += 1;
    }
  }

  return { claimed, processed, requeued, failed };
}
