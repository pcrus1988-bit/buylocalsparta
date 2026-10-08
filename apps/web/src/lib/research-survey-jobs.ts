import { createHash, createHmac, randomBytes } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import {
  gemiResearchFrameChunk,
  normalizeGemiAdminFilters,
  type GemiResearchFrameRecord
} from "./gemi-admin-export";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { runGreekRetailAnalysis } from "./research-survey-analysis";
import { proportionalStratumAllocation } from "./research-survey-statistics";
import { buildGreekRetailRelease } from "./research-survey-release";
import { greekRetailSector, greekRetailSectorV1, isRetailKad, RETAIL_ACTIVITY_GROUP_IDS, RETAIL_CLASSIFICATION_VERSION, RETAIL_SOURCE_REFERENCE } from "./research-kad-coverage";
import {
  assertResearchSurveyEmailReady,
  sendResearchResultsNotification,
  sendResearchSurveyInvitation,
  sendResearchThankYouCode
} from "./research-survey-mail";

const STUDY_SLUG = "greek-retail-2026";
const FRAME_CLASSIFICATION_VERSION = RETAIL_CLASSIFICATION_VERSION;
const FRAME_SOURCE_REFERENCE = RETAIL_SOURCE_REFERENCE;
const FRAME_FLUSH_SIZE = 500;
const MAX_JOB_ATTEMPTS = 3;
const AUTO_REMINDER_BATCH_SIZE = 100;
const AUTO_REMINDER_MIN_AGE_DAYS = 5;
const AUTO_REMINDER_MIN_GAP_DAYS = 5;
const AUTO_REMINDER_MAX_COUNT = 2;
const AUTO_REMINDER_COOLDOWN_MINUTES = 60;

type ResearchJobRow = SqlRow & {
  id: string;
  study_id: string;
  wave_id: string;
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

export const RESEARCH_JOB_TYPES = [
  "frame_snapshot",
  "sample_draw",
  "invite_batch",
  "invite_reminder",
  "reward_delivery",
  "analysis",
  "release",
  "results_notification",
  "identity_destruction"
] as const;

export type ResearchJobType = (typeof RESEARCH_JOB_TYPES)[number];
const RESEARCH_JOB_TYPE_SET = new Set<string>(RESEARCH_JOB_TYPES);

export type ResearchEmailApprovalPurpose =
  | "research_invitation"
  | "research_reminder"
  | "thank_you_code"
  | "results_notification";

export type ResearchEmailBatchApproval = Readonly<{
  studySlug?: string;
  studyTitle?: string;
  purpose?: ResearchEmailApprovalPurpose;
  maxEmails?: number;
  reviewConfirmed?: boolean;
  finalConfirmed?: boolean;
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

function assertResearchEmailBatchApproval(
  approval: ResearchEmailBatchApproval | undefined,
  expected: Readonly<{
    studyTitle: string;
    purpose: ResearchEmailApprovalPurpose;
    maxEmails: number;
  }>
): void {
  if (!approval || approval.reviewConfirmed !== true || approval.finalConfirmed !== true) {
    throw new Error("RESEARCH_EMAIL_DOUBLE_CONFIRMATION_REQUIRED");
  }
  if (text(approval.studySlug) !== STUDY_SLUG) {
    throw new Error("RESEARCH_EMAIL_CONFIRMATION_STUDY_MISMATCH");
  }
  if (text(approval.studyTitle) !== expected.studyTitle) {
    throw new Error("RESEARCH_EMAIL_CONFIRMATION_STUDY_MISMATCH");
  }
  if (approval.purpose !== expected.purpose) {
    throw new Error("RESEARCH_EMAIL_CONFIRMATION_PURPOSE_MISMATCH");
  }
  if (Math.floor(numberValue(approval.maxEmails)) !== expected.maxEmails) {
    throw new Error("RESEARCH_EMAIL_CONFIRMATION_COUNT_MISMATCH");
  }
}

function assertQueuedResearchEmailApproval(job: ResearchJobRow): void {
  const expectedPurpose: Partial<Record<ResearchJobType, ResearchEmailApprovalPurpose>> = {
    invite_batch: "research_invitation",
    reward_delivery: "thank_you_code",
    results_notification: "results_notification"
  };
  const purpose = expectedPurpose[job.job_type as ResearchJobType];
  if (!purpose) return;
  // Completion-triggered thank-you delivery is one explicitly requested
  // participant email. Bulk campaigns still require double approval.
  const perResponse = objectValue(job.input);
  if (job.job_type === "reward_delivery" &&
      perResponse.source === "survey_completion" &&
      /^[a-f0-9-]{36}$/i.test(text(perResponse.responseId))) return;
  const input = objectValue(job.input);
  const approval = objectValue(input.emailApproval) as ResearchEmailBatchApproval;
  const limit = Math.floor(numberValue(input.limit));
  if (
    !approval ||
    approval.reviewConfirmed !== true ||
    approval.finalConfirmed !== true ||
    text(approval.studySlug) !== STUDY_SLUG ||
    approval.purpose !== purpose ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    Math.floor(numberValue(approval.maxEmails)) !== limit
  ) {
    throw new Error("RESEARCH_EMAIL_DOUBLE_CONFIRMATION_REQUIRED");
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalResearchJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalResearchJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalResearchJson(record[key])}`
  ).join(",")}}`;
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

function frameRecord(record: GemiResearchFrameRecord, classificationVersion: string): FrameBufferRecord | undefined {
  const identity = record.gemiNumber ? `gemi:${record.gemiNumber}` : record.afm ? `afm:${record.afm}` : "";
  if (!identity) return undefined;
  // Match only current retail activity evidence; mixed wholesale companies must
  // not be classified from unrelated secondary, historical or wholesale KADs.
  const matchedCodes = (record.matchedActivityCodes.length
    ? record.matchedActivityCodes
    : record.activityCodes).filter(isRetailKad);
  if (!matchedCodes.length) return undefined;
  const regionCode = record.prefectureId || "unknown";
  const sectorCode = classificationVersion === "greek-retail-kad-sector-v1"
    ? greekRetailSectorV1(matchedCodes)
    : greekRetailSector(matchedCodes);
  const email = record.email.trim().toLowerCase();
  return {
    externalKeyHash: sha256(identity),
    sourceRecordRef: record.gemiNumber ? `gemi:${record.gemiNumber}` : "gemi:identity-withheld",
    regionCode,
    sectorCode,
    samplingAttributes: JSON.stringify({
      source: "gemi_opendata",
      classificationVersion,
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
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>("SELECT id,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1", [STUDY_SLUG]);
  if (!study.rows[0]) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(study.rows[0].current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1 AND wave_id=$2 AND job_type='frame_snapshot' AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [study.rows[0].id, study.rows[0].current_wave_id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id, wave_id, job_type, status, input)
    VALUES (
      $1,
      $2,
      'frame_snapshot',
      'queued',
      jsonb_build_object(
        'activityGroupIds', jsonb_build_array('retail-all'),
        'activeOnly', true,
        'scope', 'all-greece',
        'classificationVersion', $3::text
      )
    )
    RETURNING id
  `, [study.rows[0].id, study.rows[0].current_wave_id, FRAME_CLASSIFICATION_VERSION]);
  return { jobId: text(job.rows[0]!.id) };
}

export async function queueGreekRetailSampleDraw(
  principal: SessionPrincipal,
  input: Readonly<{
    targetN: number;
    desiredCompleteN?: number;
    expectedResponseRate?: number;
    randomSeed?: string;
    label?: string;
    fieldworkPhase?: "pilot" | "main";
  }>
): Promise<{ jobId: string; randomSeed: string; fieldworkPhase: "pilot" | "main" }> {
  assertAdminPermission(principal, "research.design.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const targetN = Math.floor(input.targetN);
  if (!Number.isSafeInteger(targetN) || targetN < 1 || targetN > 100_000) {
    throw new Error("RESEARCH_SAMPLE_TARGET_INVALID");
  }
  const expectedResponseRate = Number(input.expectedResponseRate ?? 0.15);
  if (!Number.isFinite(expectedResponseRate) || expectedResponseRate <= 0 || expectedResponseRate > 1) {
    throw new Error("RESEARCH_SAMPLE_EXPECTED_RESPONSE_INVALID");
  }
  const desiredCompleteN = Math.floor(Number(
    input.desiredCompleteN ?? Math.max(1, Math.round(targetN * expectedResponseRate))
  ));
  if (!Number.isSafeInteger(desiredCompleteN) || desiredCompleteN < 1 || desiredCompleteN > targetN) {
    throw new Error("RESEARCH_SAMPLE_DESIRED_COMPLETES_INVALID");
  }
  const randomSeed = input.randomSeed?.trim() || randomBytes(24).toString("hex");
  if (randomSeed.length < 16 || randomSeed.length > 200) throw new Error("RESEARCH_SAMPLE_SEED_INVALID");

  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>("SELECT id,status,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1", [STUDY_SLUG]);
  if (!study.rows[0]) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(study.rows[0].current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  const studyStatus = text(study.rows[0].status);
  const fieldworkPhase: "pilot" | "main" = input.fieldworkPhase
    ?? (["draft","pilot"].includes(studyStatus) ? "pilot" : "main");
  const minTargetN = fieldworkPhase === "pilot" ? 10 : 100;
  const maxTargetN = fieldworkPhase === "pilot" ? 1_000 : 100_000;
  if (targetN < minTargetN || targetN > maxTargetN) {
    throw new Error(fieldworkPhase === "pilot"
      ? "RESEARCH_PILOT_SAMPLE_TARGET_INVALID"
      : "RESEARCH_SAMPLE_TARGET_INVALID");
  }
  if (fieldworkPhase === "pilot" && !["draft","pilot"].includes(studyStatus)) {
    throw new Error("RESEARCH_PILOT_SAMPLE_PHASE_CLOSED");
  }
  if (fieldworkPhase === "main" && studyStatus !== "fielding") {
    throw new Error("RESEARCH_MAIN_SAMPLE_REQUIRES_FIELDING");
  }
  const frame = await pool.query<SqlRow>(`
    SELECT id FROM research_frame_snapshots
    WHERE study_id=$1 AND wave_id=$2 AND status='frozen'
    ORDER BY frozen_at DESC NULLS LAST, created_at DESC
    LIMIT 1
  `, [study.rows[0].id, study.rows[0].current_wave_id]);
  if (!frame.rows[0]) throw new Error("RESEARCH_SAMPLE_REQUIRES_FROZEN_FRAME");

  const contacted = await pool.query<SqlRow>(`
    SELECT EXISTS(
      SELECT 1
      FROM research_invites
      WHERE study_id=$1
        AND wave_id=$2
        AND fieldwork_phase=$3
        AND sent_at IS NOT NULL
    ) AS has_contacted_units
  `, [study.rows[0].id, study.rows[0].current_wave_id, fieldworkPhase]);
  if (Boolean(contacted.rows[0]?.has_contacted_units)) {
    throw new Error("RESEARCH_SAMPLE_REDRAW_AFTER_CONTACT");
  }

  const existing = await pool.query<SqlRow>(`
    SELECT id,input
    FROM research_study_jobs
    WHERE study_id=$1 AND wave_id=$2 AND job_type='sample_draw' AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [study.rows[0].id, study.rows[0].current_wave_id]);
  if (existing.rows[0]) {
    const existingInput = objectValue(existing.rows[0].input);
    const existingPhase = text(existingInput.fieldworkPhase) === "pilot" ? "pilot" : "main";
    const existingDesiredCompleteN = Math.floor(numberValue(existingInput.desiredCompleteN));
    const existingExpectedResponseRate = numberValue(existingInput.expectedResponseRate);
    if (
      existingPhase !== fieldworkPhase
      || existingDesiredCompleteN !== desiredCompleteN
      || Math.abs(existingExpectedResponseRate - expectedResponseRate) > 1e-9
    ) {
      throw new Error("RESEARCH_SAMPLE_JOB_ALREADY_RUNNING");
    }
    return {
      jobId: text(existing.rows[0].id),
      randomSeed: text(existingInput.randomSeed) || randomSeed,
      fieldworkPhase
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id, wave_id, job_type, status, input)
    VALUES (
      $1,
      $2,
      'sample_draw',
      'queued',
      jsonb_build_object(
        'targetN', $3::int,
        'randomSeed', $4::text,
        'label', $5::text,
        'fieldworkPhase', $6::text,
        'desiredCompleteN', $7::int,
        'expectedResponseRate', $8::numeric
      )
    )
    RETURNING id
  `, [
    study.rows[0].id,
    study.rows[0].current_wave_id,
    targetN,
    randomSeed,
    input.label?.trim() || `${fieldworkPhase}-sample-${targetN}`,
    fieldworkPhase,
    desiredCompleteN,
    expectedResponseRate
  ]);
  return { jobId: text(job.rows[0]!.id), randomSeed, fieldworkPhase };
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
  assertAdminPermission(principal, "research.fieldwork.manage");
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
    "SELECT id,title,status,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(row.current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  if (["closed","analysis","published","archived"].includes(text(row.status))) {
    throw new Error("RESEARCH_RECRUITMENT_LOCKED_AFTER_FIELDWORK");
  }
  const version = input.version?.trim() ||
    `${purpose === "research_reminder" ? "reminder" : "invite"}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(version)) throw new Error("RESEARCH_RECRUITMENT_VERSION_INVALID");

  const inserted = await pool.query<SqlRow>(`
    INSERT INTO research_recruitment_templates (
      study_id,wave_id,version,channel,subject,body_text,body_sha256,purpose,status,locked_at
    )
    VALUES ($1,$2,$3,'email',$4,$5,$6,$7,'locked',now())
    RETURNING id
  `, [row.id, row.current_wave_id, version, subject, bodyText, sha256(bodyText), purpose]);
  return { templateId: text(inserted.rows[0]!.id), version, purpose };
}

export async function queueGreekRetailInviteBatch(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string; emailApproval?: ResearchEmailBatchApproval }>
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.fieldwork.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  const limit = Math.max(1, Math.min(500, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(`
    SELECT
      s.id,s.title,s.status,s.current_wave_id,
      EXISTS(
        SELECT 1 FROM research_sample_draws d
        WHERE d.study_id=s.id
          AND d.wave_id=s.current_wave_id
          AND d.status IN ('locked','fielded')
          AND d.fieldwork_phase=CASE WHEN s.status='pilot' THEN 'pilot' ELSE 'main' END
      ) AS sample_ready,
      EXISTS(
        SELECT 1 FROM research_recruitment_templates rt
        WHERE rt.study_id=s.id AND rt.wave_id=s.current_wave_id AND rt.channel='email' AND rt.status='locked'
          AND rt.purpose='research_invitation'
      ) AS template_ready
    FROM research_studies s
    WHERE s.slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(row.current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  if (!["pilot","fielding"].includes(text(row.status))) throw new Error("SURVEY_NOT_OPEN");
  const fieldworkPhase = text(row.status) === "pilot" ? "pilot" : "main";
  assertResearchEmailBatchApproval(input.emailApproval, {
    studyTitle: text(row.title),
    purpose: "research_invitation",
    maxEmails: limit
  });
  if (!Boolean(row.sample_ready)) throw new Error("RESEARCH_INVITE_SAMPLE_NOT_READY");
  if (!Boolean(row.template_ready)) throw new Error("RESEARCH_RECRUITMENT_TEMPLATE_NOT_READY");

  const existing = await pool.query<SqlRow>(`
    SELECT id FROM research_study_jobs
    WHERE study_id=$1 AND wave_id=$2 AND job_type='invite_batch' AND status IN ('queued','running')
    ORDER BY created_at DESC LIMIT 1
  `, [row.id, row.current_wave_id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,$2,'invite_batch','queued',
      jsonb_build_object(
        'limit',$3::int,
        'label',$4::text,
        'fieldworkPhase',$5::text,
        'emailApproval',$6::jsonb
      )
    )
    RETURNING id
  `, [
    row.id,
    row.current_wave_id,
    limit,
    input.label?.trim() || `${fieldworkPhase}-research-email-${new Date().toISOString()}`,
    fieldworkPhase,
    JSON.stringify(input.emailApproval)
  ]);
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
    emailApproval?: ResearchEmailBatchApproval;
  }> = {}
): Promise<{ jobId: string; templateId: string }> {
  assertAdminPermission(principal, "research.fieldwork.manage");
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
      s.title,
      s.status,
      s.fieldwork_ends_at,
      s.current_wave_id,
      rt.id AS reminder_template_id
    FROM research_studies s
    JOIN LATERAL (
      SELECT id
      FROM research_recruitment_templates
      WHERE study_id=s.id
        AND wave_id=s.current_wave_id
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
  if (!text(row.current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  if (!["pilot","fielding"].includes(text(row.status))) throw new Error("SURVEY_NOT_OPEN");
  const fieldworkPhase = text(row.status) === "pilot" ? "pilot" : "main";

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND wave_id=$2
      AND job_type='invite_reminder'
      AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id, row.current_wave_id]);
  if (existing.rows[0]) {
    return {
      jobId: text(existing.rows[0].id),
      templateId: text(row.reminder_template_id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,
      $2,
      'invite_reminder',
      'queued',
      jsonb_build_object(
        'templateId',$3::text,
        'limit',$4::int,
        'minAgeDays',$5::int,
        'minGapDays',$6::int,
        'maxReminders',$7::int,
        'label',$8::text,
        'fieldworkPhase',$9::text,
        'emailApproval',$10::jsonb
      )
    )
    RETURNING id
  `, [
    row.id,
    row.current_wave_id,
    row.reminder_template_id,
    limit,
    minAgeDays,
    minGapDays,
    maxReminders,
    input.label?.trim() || `${fieldworkPhase}-research-reminder-${new Date().toISOString()}`,
    fieldworkPhase,
    JSON.stringify(input.emailApproval)
  ]);

  return {
    jobId: text(job.rows[0]!.id),
    templateId: text(row.reminder_template_id)
  };
}

export async function suppressGreekRetailResearchEmail(
  principal: SessionPrincipal,
  input: Readonly<{ email: string; note?: string }>
): Promise<Readonly<{ matchedContacts: number; suppressedInvites: number; alreadySuppressed: boolean }>> {
  assertAdminPermission(principal, "research.fieldwork.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");

  const email = input.email.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("RESEARCH_CONTACT_EMAIL_INVALID");
  }
  const contactHash = sha256(email);
  const note = input.note?.trim().slice(0, 500) || "";
  const client = await getProductionPostgresRuntime().sqlPool.connect();

  try {
    await client.query("BEGIN");
    const study = await client.query<SqlRow>(
      "SELECT id FROM research_studies WHERE slug=$1 LIMIT 1",
      [STUDY_SLUG]
    );
    const studyId = text(study.rows[0]?.id);
    if (!studyId) throw new Error("RESEARCH_STUDY_NOT_FOUND");

    const contacts = await client.query<SqlRow>(`
      SELECT id
      FROM research_contact_points
      WHERE contact_type='email' AND contact_value_hash=$1
      FOR UPDATE
    `, [contactHash]);

    const current = await client.query<SqlRow>(`
      SELECT action
      FROM research_contact_suppression_events
      WHERE contact_type='email' AND contact_value_hash=$1
      ORDER BY occurred_at DESC,id DESC
      LIMIT 1
    `, [contactHash]);
    const alreadySuppressed = text(current.rows[0]?.action) === "suppress";

    if (!alreadySuppressed) {
      await client.query(`
        INSERT INTO research_contact_suppression_events (
          contact_type,contact_value_hash,action,reason,study_id,source,metadata
        )
        VALUES (
          'email',$1,'suppress','manual',$2,'admin_research_ui',
          jsonb_build_object('note',$3::text)
        )
      `, [contactHash, studyId, note]);
    }

    await client.query(`
      UPDATE research_contact_points
      SET suppression_status='suppressed'
      WHERE contact_type='email' AND contact_value_hash=$1
    `, [contactHash]);

    const suppressedInvites = await client.query<SqlRow>(`
      UPDATE research_invites ri
      SET status='suppressed'
      FROM research_contact_points cp
      WHERE ri.contact_point_id=cp.id
        AND cp.contact_type='email'
        AND cp.contact_value_hash=$1
        AND ri.status IN ('created','sent','opened','started')
      RETURNING ri.id
    `, [contactHash]);

    if (suppressedInvites.rows.length) {
      await client.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        SELECT id,'suppressed',jsonb_build_object(
          'source','admin_research_ui',
          'reason','manual_contact_suppression'
        )
        FROM unnest($1::uuid[]) AS u(id)
      `, [suppressedInvites.rows.map((row) => text(row.id))]);
    }

    await client.query("COMMIT");
    return {
      matchedContacts: contacts.rows.length,
      suppressedInvites: suppressedInvites.rows.length,
      alreadySuppressed
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function ensureGreekRetailAutomaticReminderBatch(): Promise<Readonly<{
  queued: boolean;
  jobId?: string;
  candidateCount: number;
  reason: string;
}>> {
  if (!productionDatabaseConfigured()) {
    return { queued: false, candidateCount: 0, reason: "database_unavailable" };
  }
  try {
    assertResearchSurveyEmailReady();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { queued: false, candidateCount: 0, reason: message };
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const studyResult = await pool.query<SqlRow>(`
    SELECT
      s.id,
      s.status,
      s.current_wave_id,
      rt.id AS reminder_template_id
    FROM research_studies s
    JOIN LATERAL (
      SELECT id
      FROM research_recruitment_templates
      WHERE study_id=s.id
        AND wave_id=s.current_wave_id
        AND channel='email'
        AND status='locked'
        AND purpose='research_reminder'
      ORDER BY locked_at DESC NULLS LAST,created_at DESC
      LIMIT 1
    ) rt ON true
    WHERE s.slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const study = studyResult.rows[0];
  if (!study) return { queued: false, candidateCount: 0, reason: "reminder_template_not_ready" };
  if (!["pilot","fielding"].includes(text(study.status))) {
    return { queued: false, candidateCount: 0, reason: "study_not_fielding" };
  }
  if (study.fieldwork_ends_at && new Date(String(study.fieldwork_ends_at)).getTime() <= Date.now()) {
    return { queued: false, candidateCount: 0, reason: "fieldwork_deadline_passed" };
  }
  const waveId = text(study.current_wave_id);
  if (!waveId) return { queued: false, candidateCount: 0, reason: "current_wave_missing" };
  const fieldworkPhase = text(study.status) === "pilot" ? "pilot" : "main";

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND wave_id=$2
      AND job_type='invite_reminder'
      AND (
        status IN ('queued','running')
        OR (
          COALESCE((input->>'automatic')::boolean,false)=true
          AND created_at > now() - ($3::int * interval '1 minute')
        )
      )
    ORDER BY created_at DESC
    LIMIT 1
  `, [study.id, waveId, AUTO_REMINDER_COOLDOWN_MINUTES]);
  if (existing.rows[0]) {
    return {
      queued: false,
      jobId: text(existing.rows[0].id),
      candidateCount: 0,
      reason: "reminder_job_active_or_cooldown"
    };
  }

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
    SELECT count(*)::int AS count
    FROM (
      SELECT ri.id
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      LEFT JOIN research_responses rr ON rr.invite_id=ri.id
      LEFT JOIN reminder_stats stats ON stats.invite_id=ri.id
      WHERE ri.study_id=$1
        AND ri.wave_id=$2
        AND ri.fieldwork_phase=$6
        AND ri.sent_at IS NOT NULL
        AND ri.status IN ('sent','opened','started')
        AND (ri.expires_at IS NULL OR ri.expires_at > now())
        AND ri.sent_at <= now() - ($3::int * interval '1 day')
        AND COALESCE(rr.status,'') NOT IN ('completed','withdrawn','excluded')
        AND COALESCE(stats.sent_reminders,0) < $4
        AND COALESCE(stats.last_reminder_sent_at,ri.sent_at)
              <= now() - ($5::int * interval '1 day')
        AND NOT EXISTS (
          SELECT 1
          FROM research_invite_messages pending_delay
          WHERE pending_delay.invite_id=ri.id
            AND pending_delay.status='sent'
            AND pending_delay.last_error LIKE 'SES delivery delay:%'
        )
        AND EXISTS (
          SELECT 1
          FROM research_contact_points cp
          WHERE cp.frame_unit_id=su.frame_unit_id
            AND cp.contact_type='email'
            AND cp.suppression_status='active'
            AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
        )
      ORDER BY COALESCE(stats.last_reminder_sent_at,ri.sent_at),ri.created_at,ri.id
      LIMIT $7
    ) eligible
  `, [
    study.id,
    waveId,
    AUTO_REMINDER_MIN_AGE_DAYS,
    AUTO_REMINDER_MAX_COUNT,
    AUTO_REMINDER_MIN_GAP_DAYS,
    fieldworkPhase,
    AUTO_REMINDER_BATCH_SIZE
  ]);
  const candidateCount = numberValue(candidates.rows[0]?.count);
  if (candidateCount < 1) {
    return { queued: false, candidateCount: 0, reason: "no_eligible_reminders" };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,$2,'invite_reminder','queued',
      jsonb_build_object(
        'templateId',$3::text,
        'limit',$4::int,
        'minAgeDays',$5::int,
        'minGapDays',$6::int,
        'maxReminders',$7::int,
        'label',$8::text,
        'fieldworkPhase',$9::text,
        'automatic',true
      )
    )
    RETURNING id
  `, [
    study.id,
    waveId,
    study.reminder_template_id,
    AUTO_REMINDER_BATCH_SIZE,
    AUTO_REMINDER_MIN_AGE_DAYS,
    AUTO_REMINDER_MIN_GAP_DAYS,
    AUTO_REMINDER_MAX_COUNT,
    `${fieldworkPhase}-automatic-research-reminder-${new Date().toISOString()}`,
    fieldworkPhase
  ]);

  return {
    queued: true,
    jobId: text(job.rows[0]!.id),
    candidateCount,
    reason: "queued"
  };
}

export async function queueGreekRetailRewardDelivery(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string; emailApproval?: ResearchEmailBatchApproval }> = {}
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.fieldwork.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  researchRewardSecret();
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,status,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(row.current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  if (text(row.status) === "archived") throw new Error("RESEARCH_REWARD_DELIVERY_ARCHIVED");
  assertResearchEmailBatchApproval(input.emailApproval, {
    studyTitle: text(row.title),
    purpose: "thank_you_code",
    maxEmails: limit
  });

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND wave_id=$2
      AND job_type='reward_delivery'
      AND status IN ('queued','running')
      AND COALESCE(input->>'responseId','')=''
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id, row.current_wave_id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,$2,'reward_delivery','queued',
      jsonb_build_object('limit',$3::int,'label',$4::text,'emailApproval',$5::jsonb)
    )
    RETURNING id
  `, [
    row.id,
    row.current_wave_id,
    limit,
    input.label?.trim() || `reward-delivery-${new Date().toISOString()}`,
    JSON.stringify(input.emailApproval)
  ]);
  return { jobId: text(job.rows[0]!.id) };
}

export async function queueGreekRetailResultsNotifications(
  principal: SessionPrincipal,
  input: Readonly<{ limit?: number; label?: string; emailApproval?: ResearchEmailBatchApproval }> = {}
): Promise<{ jobId: string; releaseSnapshotId: string }> {
  assertAdminPermission(principal, "research.publish.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  assertResearchSurveyEmailReady();
  const limit = Math.max(1, Math.min(250, Math.floor(input.limit ?? 100)));
  const pool = getProductionPostgresRuntime().sqlPool;
  const release = await pool.query<SqlRow>(`
    SELECT s.id AS study_id,s.title AS study_title,s.current_wave_id AS wave_id,rs.id AS release_snapshot_id
    FROM research_studies s
    JOIN LATERAL (
      SELECT id
      FROM research_release_snapshots
      WHERE study_id=s.id AND wave_id=s.current_wave_id AND published_at IS NOT NULL
      ORDER BY published_at DESC,created_at DESC
      LIMIT 1
    ) rs ON true
    WHERE s.slug=$1 AND s.status='published'
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = release.rows[0];
  if (!row) throw new Error("RESEARCH_RESULTS_NOTIFICATION_REQUIRES_PUBLISHED_RELEASE");
  if (!text(row.wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  assertResearchEmailBatchApproval(input.emailApproval, {
    studyTitle: text(row.study_title),
    purpose: "results_notification",
    maxEmails: limit
  });

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND wave_id=$2
      AND job_type='results_notification'
      AND status IN ('queued','running')
      AND input->>'releaseSnapshotId'=$3
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.study_id, row.wave_id, row.release_snapshot_id]);
  if (existing.rows[0]) {
    return {
      jobId: text(existing.rows[0].id),
      releaseSnapshotId: text(row.release_snapshot_id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,$2,'results_notification','queued',
      jsonb_build_object(
        'releaseSnapshotId',$3::text,
        'limit',$4::int,
        'label',$5::text,
        'emailApproval',$6::jsonb
      )
    )
    RETURNING id
  `, [
    row.study_id,
    row.wave_id,
    row.release_snapshot_id,
    limit,
    input.label?.trim() || `results-notification-${new Date().toISOString()}`,
    JSON.stringify(input.emailApproval)
  ]);
  return {
    jobId: text(job.rows[0]!.id),
    releaseSnapshotId: text(row.release_snapshot_id)
  };
}

export async function setGreekRetailIdentityRetentionPolicy(
  principal: SessionPrincipal,
  input: Readonly<{ retentionUntil: string }>
): Promise<{ waveId: string; retentionUntil: string }> {
  assertAdminPermission(principal, "research.privacy.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");

  const retentionDate = new Date(input.retentionUntil);
  if (!Number.isFinite(retentionDate.getTime())) {
    throw new Error("RESEARCH_IDENTITY_RETENTION_DATE_INVALID");
  }
  if (retentionDate.getTime() <= Date.now()) {
    throw new Error("RESEARCH_IDENTITY_RETENTION_MUST_BE_FUTURE");
  }

  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(`
    SELECT id,status,current_wave_id
    FROM research_studies
    WHERE slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (text(row.status) !== "draft") {
    throw new Error("RESEARCH_IDENTITY_RETENTION_LOCKED_AFTER_DRAFT");
  }

  const updated = await pool.query<SqlRow>(`
    UPDATE research_waves
    SET identity_retention_until=$3::timestamptz,
        updated_at=now()
    WHERE id=$2
      AND study_id=$1
      AND identity_destroyed_at IS NULL
    RETURNING id,identity_retention_until
  `, [row.id, row.current_wave_id, retentionDate.toISOString()]);
  const wave = updated.rows[0];
  if (!wave) throw new Error("RESEARCH_WAVE_NOT_FOUND");

  return {
    waveId: text(wave.id),
    retentionUntil: new Date(String(wave.identity_retention_until)).toISOString()
  };
}

export async function queueGreekRetailIdentityDestruction(
  principal: SessionPrincipal
): Promise<{ jobId: string; waveId: string }> {
  assertAdminPermission(principal, "research.privacy.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;

  const study = await pool.query<SqlRow>(`
    SELECT
      s.id,
      s.status,
      s.current_wave_id,
      rw.identity_retention_until,
      rw.identity_destroyed_at
    FROM research_studies s
    JOIN research_waves rw
      ON rw.id=s.current_wave_id
     AND rw.study_id=s.id
    WHERE s.slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (row.identity_destroyed_at) {
    throw new Error("RESEARCH_IDENTITY_ALREADY_DESTROYED");
  }
  if (!["closed","analysis","published","archived"].includes(text(row.status))) {
    throw new Error("RESEARCH_IDENTITY_DESTRUCTION_REQUIRES_CLOSED_FIELDWORK");
  }
  const retentionUntil = row.identity_retention_until
    ? new Date(String(row.identity_retention_until))
    : undefined;
  if (!retentionUntil || !Number.isFinite(retentionUntil.getTime())) {
    throw new Error("RESEARCH_IDENTITY_RETENTION_POLICY_MISSING");
  }
  if (retentionUntil.getTime() > Date.now()) {
    throw new Error("RESEARCH_IDENTITY_RETENTION_NOT_ELAPSED");
  }

  const existing = await pool.query<SqlRow>(`
    SELECT id
    FROM research_study_jobs
    WHERE study_id=$1
      AND wave_id=$2
      AND job_type='identity_destruction'
      AND status IN ('queued','running')
      AND input->>'waveId'=$2
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id, row.current_wave_id]);
  if (existing.rows[0]) {
    return {
      jobId: text(existing.rows[0].id),
      waveId: text(row.current_wave_id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES (
      $1,$2,'identity_destruction','queued',
      jsonb_build_object(
        'waveId',$2::text,
        'executedBy',$3::text,
        'retentionUntil',$4::text
      )
    )
    RETURNING id
  `, [
    row.id,
    row.current_wave_id,
    principal.userId,
    retentionUntil.toISOString()
  ]);

  return {
    jobId: text(job.rows[0]!.id),
    waveId: text(row.current_wave_id)
  };
}

export async function queueGreekRetailAnalysis(
  principal: SessionPrincipal
): Promise<{ jobId: string }> {
  assertAdminPermission(principal, "research.analysis.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const pool = getProductionPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,status,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1",
    [STUDY_SLUG]
  );
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (!text(row.current_wave_id)) throw new Error("RESEARCH_CURRENT_WAVE_MISSING");
  if (text(row.status) !== "analysis") throw new Error("RESEARCH_ANALYSIS_REQUIRES_ANALYSIS_STATUS");

  const existing = await pool.query<SqlRow>(`
    SELECT id FROM research_study_jobs
    WHERE study_id=$1 AND wave_id=$2 AND job_type='analysis' AND status IN ('queued','running')
    ORDER BY created_at DESC LIMIT 1
  `, [row.id, row.current_wave_id]);
  if (existing.rows[0]) return { jobId: text(existing.rows[0].id) };

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,wave_id,job_type,status,input)
    VALUES ($1,$2,'analysis','queued','{}'::jsonb)
    RETURNING id
  `, [row.id, row.current_wave_id]);
  return { jobId: text(job.rows[0]!.id) };
}

async function claimResearchJob(
  allowedJobTypes: readonly ResearchJobType[]
): Promise<ResearchJobRow | undefined> {
  if (!allowedJobTypes.length) return undefined;
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    // Vercel can terminate a long frame build at the function wall-clock limit.
    // Reclaim only stale frame jobs here; other job types may legitimately use
    // long-running dedicated workers and must not be duplicated.
    await client.query(`
      UPDATE research_study_jobs
      SET status='queued',
          attempts=GREATEST(attempts-1,0),
          available_at=now(),
          started_at=NULL,
          finished_at=NULL,
          error_message=COALESCE(error_message,'RESEARCH_STALE_FRAME_RECOVERED')
      WHERE status='running'
        AND job_type='frame_snapshot'
        AND started_at < now() - interval '6 minutes'
        AND job_type = ANY($1::text[])
    `, [allowedJobTypes]);

    const result = await client.query<ResearchJobRow>(`
      SELECT id, study_id, wave_id, job_type, input, output, attempts
      FROM research_study_jobs
      WHERE status='queued' AND available_at <= now()
        AND job_type = ANY($1::text[])
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `, [allowedJobTypes]);
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
      RETURNING id, study_id, wave_id, job_type, input, output, attempts
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

async function markJobRequeued(
  jobId: string,
  output: Record<string, unknown>,
  delaySeconds = 0
): Promise<void> {
  await getProductionPostgresRuntime().sqlPool.query(`
    UPDATE research_study_jobs
    SET status='queued',
        output=$2::jsonb,
        attempts=GREATEST(attempts-1,0),
        available_at=now() + ($3::int * interval '1 second'),
        started_at=NULL,
        finished_at=NULL,
        error_message=NULL
    WHERE id=$1
  `, [jobId, JSON.stringify(output), Math.max(0, Math.min(60, Math.floor(delaySeconds)))]);
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
    , contacts AS (
      INSERT INTO research_contact_points (
        frame_unit_id,
        contact_type,
        contact_value_hash,
        source_kind,
        suppression_status
      )
      SELECT
        units.id,
        'email',
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
        source_kind=EXCLUDED.source_kind,
        suppression_status=EXCLUDED.suppression_status
      RETURNING id,frame_unit_id,contact_value_hash
    )
    INSERT INTO research_private.contact_vault (
      contact_point_id,contact_value,updated_at
    )
    SELECT
      contacts.id,
      incoming.email,
      now()
    FROM contacts
    JOIN units ON units.id=contacts.frame_unit_id
    JOIN incoming USING (external_key_hash)
    WHERE incoming.contact_hash=contacts.contact_value_hash
    ON CONFLICT (contact_point_id)
    DO UPDATE SET
      contact_value=EXCLUDED.contact_value,
      updated_at=now()
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
  // Keep already-queued v1 jobs reproducible instead of silently broadening
  // them mid-run; every NEW request is all-retail v2.
  const oldNonFoodJob = Array.isArray(job.input.activityGroupIds)
    && job.input.activityGroupIds.length === 1
    && job.input.activityGroupIds[0] === "retail-non-food";
  const activityGroupIds = oldNonFoodJob ? ["retail-non-food"] : [...RETAIL_ACTIVITY_GROUP_IDS];
  const classificationVersion = oldNonFoodJob ? "greek-retail-kad-sector-v1" : FRAME_CLASSIFICATION_VERSION;
  const sourceReference = oldNonFoodJob
    ? "gemi-opendata:retail-non-food:active:all-greece"
    : FRAME_SOURCE_REFERENCE;
  const currentOutput = objectValue(job.output);
  let snapshotId = text(currentOutput.frameSnapshotId);

  if (!snapshotId) {
    const snapshot = await pool.query<SqlRow>(`
      INSERT INTO research_frame_snapshots (
        study_id,
        wave_id,
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
        $3,
        'gemi_opendata',
        $4,
        0,
        $5::jsonb,
        'building'
      )
      RETURNING id
    `, [
      job.study_id,
      job.wave_id,
      `G.E.MI. ${activityGroupIds[0]} ${new Date().toISOString().slice(0, 10)}`,
      sourceReference,
      JSON.stringify({
        activityGroupIds,
        activeOnly: true,
        scope: "all-greece",
        classificationVersion
      })
    ]);
    snapshotId = text(snapshot.rows[0]!.id);
    await pool.query(`
      UPDATE research_study_jobs
      SET output = output || jsonb_build_object('frameSnapshotId',$2::text)
      WHERE id=$1
    `, [job.id, snapshotId]);
  }

  await pool.query(`
    UPDATE research_frame_snapshots
    SET status='building', population_size=0, content_sha256=NULL, captured_at=NULL, frozen_at=NULL
    WHERE id=$1 AND status<>'frozen'
  `, [snapshotId]);

  const cursorValue = objectValue(currentOutput.frameCursor);
  const cursor = {
    batchIndex: Math.max(0, Math.floor(numberValue(cursorValue.batchIndex))),
    offset: Math.max(0, Math.floor(numberValue(cursorValue.offset)))
  };
  const filters = normalizeGemiAdminFilters({
    activityGroupIds,
    activeOnly: true
  });
  const chunk = await gemiResearchFrameChunk(filters, cursor, 12);
  const records = chunk.records.flatMap((raw) => {
    const record = frameRecord(raw, classificationVersion);
    return record ? [record] : [];
  });
  if (records.length) await flushFrameBuffer(snapshotId, records);

  // An all-retail frame may contain hundreds of thousands of businesses.
  // Avoid COUNT/EXISTS across the entire growing frame on every 12-page
  // worker tick; exact, deduplicated totals are calculated ONCE at freeze.
  const persistedUnits = numberValue(currentOutput.persistedUnits) + records.length;
  const activeEmailCount = numberValue(currentOutput.activeEmailCount)
    + records.filter((record) => Boolean(record.email)).length;

  if (!chunk.done && chunk.nextCursor) {
    return {
      __requeue: true,
      __delaySeconds: 0,
      frameSnapshotId: snapshotId,
      frameCursor: chunk.nextCursor,
      persistedUnits,
      activeEmailCount,
      pagesFetched: chunk.pagesFetched,
      queryBatchCount: chunk.queryBatchCount
    };
  }

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
  const finalActiveEmailCount = numberValue(countResult.rows[0]?.active_email_count);

  const hashResult = await pool.query<SqlRow>(`
    SELECT encode(
      digest(
        COALESCE(
          string_agg(
            external_key_hash || '|' || COALESCE(region_code,'') || '|' || COALESCE(sector_code,'') || E'\\n',
            '' ORDER BY external_key_hash
          ),
          ''
        ),
        'sha256'
      ),
      'hex'
    ) AS content_sha256
    FROM research_frame_units
    WHERE frame_snapshot_id=$1
  `, [snapshotId]);
  const digest = text(hashResult.rows[0]?.content_sha256);
  if (!populationSize || !digest) throw new Error("RESEARCH_FRAME_FINALIZATION_EMPTY");

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
    frameCursor: null,
    populationSize,
    activeEmailCount: finalActiveEmailCount,
    streamedWithEmail: finalActiveEmailCount,
    contentSha256: digest,
    classificationVersion,
    sourceReference,
    queryBatchCount: chunk.queryBatchCount
  };
}

async function processSampleDrawJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  const input = objectValue(job.input);
  const targetN = Math.floor(numberValue(input.targetN));
  const desiredCompleteN = Math.floor(numberValue(input.desiredCompleteN));
  const expectedResponseRate = numberValue(input.expectedResponseRate);
  const randomSeed = text(input.randomSeed);
  const fieldworkPhase = text(input.fieldworkPhase) === "pilot" ? "pilot" : "main";
  const minTargetN = fieldworkPhase === "pilot" ? 10 : 100;
  const maxTargetN = fieldworkPhase === "pilot" ? 1_000 : 100_000;
  if (
    !targetN
    || !desiredCompleteN
    || desiredCompleteN > targetN
    || expectedResponseRate <= 0
    || expectedResponseRate > 1
    || !randomSeed
    || targetN < minTargetN
    || targetN > maxTargetN
  ) {
    throw new Error("RESEARCH_SAMPLE_JOB_INVALID");
  }

  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");
    const phaseState = await client.query<SqlRow>(`
      SELECT status,current_wave_id
      FROM research_studies
      WHERE id=$1
      FOR UPDATE
    `, [job.study_id]);
    if (text(phaseState.rows[0]?.current_wave_id) !== job.wave_id) {
      throw new Error("RESEARCH_SAMPLE_JOB_WAVE_CHANGED");
    }
    const currentStatus = text(phaseState.rows[0]?.status);
    if (
      (fieldworkPhase === "pilot" && !["draft","pilot"].includes(currentStatus))
      || (fieldworkPhase === "main" && currentStatus !== "fielding")
    ) {
      throw new Error("RESEARCH_SAMPLE_FIELDWORK_PHASE_CHANGED");
    }
    const contacted = await client.query<SqlRow>(`
      SELECT EXISTS(
        SELECT 1
        FROM research_invites
        WHERE study_id=$1
          AND wave_id=$2
          AND fieldwork_phase=$3
          AND sent_at IS NOT NULL
      ) AS has_contacted_units
    `, [job.study_id, job.wave_id, fieldworkPhase]);
    if (Boolean(contacted.rows[0]?.has_contacted_units)) {
      throw new Error("RESEARCH_SAMPLE_REDRAW_AFTER_CONTACT");
    }
    const frameResult = await client.query<SqlRow>(`
      SELECT id, wave_id, population_size, content_sha256
      FROM research_frame_snapshots
      WHERE study_id=$1 AND wave_id=$2 AND status='frozen'
      ORDER BY frozen_at DESC NULLS LAST, created_at DESC
      LIMIT 1
      FOR UPDATE
    `, [job.study_id, job.wave_id]);
    const frame = frameResult.rows[0];
    if (!frame) throw new Error("RESEARCH_SAMPLE_REQUIRES_FROZEN_FRAME");

    // Freeze population margins from the exact frame before any sample is drawn.
    // The source is response-independent and deterministic, so pilot/main draws
    // can reuse the same append-only evidence set for this frame.
    const populationMarginRows = await client.query<SqlRow>(`
      SELECT dimension,category,target_total
      FROM (
        SELECT
          'region_code'::text AS dimension,
          COALESCE(region_code,'unknown')::text AS category,
          count(*)::numeric AS target_total
        FROM research_frame_units
        WHERE frame_snapshot_id=$1
        GROUP BY COALESCE(region_code,'unknown')
        UNION ALL
        SELECT
          'sector_code'::text AS dimension,
          COALESCE(sector_code,'unknown')::text AS category,
          count(*)::numeric AS target_total
        FROM research_frame_units
        WHERE frame_snapshot_id=$1
        GROUP BY COALESCE(sector_code,'unknown')
      ) margins
      ORDER BY dimension,category
    `, [frame.id]);
    if (!populationMarginRows.rows.length) {
      throw new Error("RESEARCH_POPULATION_MARGINS_EMPTY");
    }
    const populationMargins = populationMarginRows.rows.map((row) => ({
      dimension: text(row.dimension),
      category: text(row.category),
      targetTotal: numberValue(row.target_total)
    }));
    const marginSourceSha256 = sha256(canonicalResearchJson({
      schema: "kontamou.research.population-margins.v1",
      frameSnapshotId: text(frame.id),
      frameContentSha256: text(frame.content_sha256),
      margins: populationMargins
    }));

    const marginSetInsert = await client.query<SqlRow>(`
      INSERT INTO research_population_margin_sets (
        study_id,wave_id,frame_snapshot_id,label,source_kind,source_ref,source_sha256,methodology_version
      )
      VALUES (
        $1,$2,$3,
        'Frozen frame region + sector margins',
        'frozen_frame',
        'research_frame_snapshot:' || $3::text,
        $4,
        'frozen-frame-region-sector-margins-v1'
      )
      ON CONFLICT (wave_id,frame_snapshot_id,source_kind) DO NOTHING
      RETURNING id,source_sha256
    `, [job.study_id, frame.wave_id, frame.id, marginSourceSha256]);

    const marginSet = marginSetInsert.rows[0] ?? (await client.query<SqlRow>(`
      SELECT id,source_sha256
      FROM research_population_margin_sets
      WHERE study_id=$1
        AND wave_id=$2
        AND frame_snapshot_id=$3
        AND source_kind='frozen_frame'
      LIMIT 1
    `, [job.study_id, frame.wave_id, frame.id])).rows[0];
    if (!marginSet) throw new Error("RESEARCH_POPULATION_MARGIN_SET_MISSING");
    if (text(marginSet.source_sha256) !== marginSourceSha256) {
      throw new Error("RESEARCH_POPULATION_MARGIN_SOURCE_HASH_MISMATCH");
    }

    for (const margin of populationMargins) {
      await client.query(`
        INSERT INTO research_population_margins (
          margin_set_id,dimension,category,target_total,evidence_json
        )
        VALUES (
          $1,$2,$3,$4,
          jsonb_build_object(
            'frameSnapshotId',$5::text,
            'frameContentSha256',$6::text,
            'source','frozen_frame'
          )
        )
        ON CONFLICT (margin_set_id,dimension,category) DO NOTHING
      `, [
        marginSet.id,
        margin.dimension,
        margin.category,
        margin.targetTotal,
        frame.id,
        frame.content_sha256
      ]);
    }

    const storedMarginRows = await client.query<SqlRow>(`
      SELECT dimension,category,target_total
      FROM research_population_margins
      WHERE margin_set_id=$1
      ORDER BY dimension,category
    `, [marginSet.id]);
    const storedMargins = storedMarginRows.rows.map((row) => ({
      dimension: text(row.dimension),
      category: text(row.category),
      targetTotal: numberValue(row.target_total)
    }));
    if (canonicalResearchJson(storedMargins) !== canonicalResearchJson(populationMargins)) {
      throw new Error("RESEARCH_POPULATION_MARGIN_REGISTRY_MISMATCH");
    }

    const strataResult = await client.query<SqlRow>(`
      WITH phase_population AS (
        SELECT
          st.id,
          st.code,
          st.population_count,
          count(fu.id) FILTER (
            WHERE EXISTS (
              SELECT 1
              FROM research_contact_points cp
              WHERE cp.frame_unit_id=fu.id
                AND cp.contact_type='email'
                AND cp.suppression_status='active'
                AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
            )
          )::int AS active_contact_count,
          count(fu.id) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM research_invites pri
              JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
              JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
              WHERE pri.study_id=$3
                AND pri.wave_id=$4
                AND pri.fieldwork_phase='pilot'
                AND pri.sent_at IS NOT NULL
                AND pfu.external_key_hash=fu.external_key_hash
            )
          )::int AS main_population_count,
          count(fu.id) FILTER (
            WHERE NOT EXISTS (
              SELECT 1
              FROM research_invites pri
              JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
              JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
              WHERE pri.study_id=$3
                AND pri.wave_id=$4
                AND pri.fieldwork_phase='pilot'
                AND pri.sent_at IS NOT NULL
                AND pfu.external_key_hash=fu.external_key_hash
            )
            AND EXISTS (
              SELECT 1
              FROM research_contact_points cp
              WHERE cp.frame_unit_id=fu.id
                AND cp.contact_type='email'
                AND cp.suppression_status='active'
                AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
            )
          )::int AS main_active_contact_count
        FROM research_strata st
        LEFT JOIN research_frame_units fu
          ON fu.stratum_id=st.id
         AND fu.frame_snapshot_id=st.frame_snapshot_id
        WHERE st.frame_snapshot_id=$1
        GROUP BY st.id,st.code,st.population_count
      )
      SELECT
        id,
        code,
        CASE WHEN $2='main' THEN main_population_count ELSE population_count END AS population_count,
        CASE WHEN $2='main' THEN main_active_contact_count ELSE active_contact_count END AS active_contact_count
      FROM phase_population
      WHERE CASE WHEN $2='main' THEN main_population_count ELSE population_count END > 0
      ORDER BY code
    `, [frame.id, fieldworkPhase, job.study_id, job.wave_id]);
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
    if (desiredCompleteN > actualTargetN) {
      throw new Error("RESEARCH_SAMPLE_DESIRED_COMPLETES_EXCEED_DRAW");
    }

    const completionAllocations = proportionalStratumAllocation(
      allocations.map((allocation) => ({ id: allocation.id, populationCount: allocation.sampleCount })),
      desiredCompleteN,
      0
    );
    const targetCompletesByStratum = new Map(
      completionAllocations.map((allocation) => [allocation.id, allocation.sampleCount] as const)
    );
    const sourceStrataById = new Map(
      strataResult.rows.map((row) => [text(row.id), row] as const)
    );
    const designStrata = allocations
      .filter((allocation) => allocation.sampleCount > 0)
      .map((allocation) => {
        const source = sourceStrataById.get(allocation.id);
        if (!source) throw new Error("RESEARCH_SAMPLE_DESIGN_STRATUM_MISSING");
        const activeContactN = Math.min(
          allocation.populationCount,
          Math.max(0, Math.floor(numberValue(source.active_contact_count)))
        );
        const stratumContactabilityRate = allocation.populationCount > 0
          ? activeContactN / allocation.populationCount
          : 0;
        const expectedContactableN = Math.min(
          allocation.sampleCount,
          Math.round(allocation.sampleCount * stratumContactabilityRate)
        );
        return {
          stratumId: allocation.id,
          code: text(source.code),
          populationN: allocation.populationCount,
          activeContactN,
          selectedN: allocation.sampleCount,
          targetCompleteN: targetCompletesByStratum.get(allocation.id) ?? 0,
          expectedContactableN,
          expectedCompleteN: Math.min(
            expectedContactableN,
            Math.round(expectedContactableN * expectedResponseRate)
          )
        };
      });
    const eligiblePopulationN = designStrata.reduce((sum, stratum) => sum + stratum.populationN, 0);
    const activeContactN = designStrata.reduce((sum, stratum) => sum + stratum.activeContactN, 0);
    const contactabilityRate = eligiblePopulationN > 0 ? activeContactN / eligiblePopulationN : 0;
    const expectedContactableN = designStrata.reduce((sum, stratum) => sum + stratum.expectedContactableN, 0);
    const expectedCompleteN = designStrata.reduce((sum, stratum) => sum + stratum.expectedCompleteN, 0);

    const draw = await client.query<SqlRow>(`
      INSERT INTO research_sample_draws (
        study_id,
        wave_id,
        frame_snapshot_id,
        label,
        algorithm_version,
        random_seed,
        target_n,
        status,
        fieldwork_phase
      )
      VALUES ($1,$2,$3,$4,'stratified-hash-rank-v2',$5,$6,'draft',$7)
      RETURNING id
    `, [
      job.study_id,
      job.wave_id,
      frame.id,
      text(input.label) || `${fieldworkPhase}-sample-${actualTargetN}`,
      randomSeed,
      actualTargetN,
      fieldworkPhase
    ]);
    const drawId = text(draw.rows[0]!.id);

    let selectionOffset = 0;
    for (const allocation of allocations) {
      if (!allocation.sampleCount) continue;
      const probability = allocation.sampleCount / allocation.populationCount;
      const baseWeight = allocation.populationCount / allocation.sampleCount;
      const inserted = await client.query<SqlRow>(`
        WITH chosen AS (
          SELECT fu.id, fu.external_key_hash
          FROM research_frame_units fu
          WHERE fu.frame_snapshot_id=$1
            AND fu.stratum_id=$2
            AND (
              $9::text <> 'main'
              OR NOT EXISTS (
                SELECT 1
                FROM research_invites pri
                JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
                JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
                WHERE pri.study_id=$10
                  AND pri.wave_id=$11
                  AND pri.fieldwork_phase='pilot'
                  AND pri.sent_at IS NOT NULL
                  AND pfu.external_key_hash=fu.external_key_hash
              )
            )
          ORDER BY md5($3::text || ':' || fu.external_key_hash), fu.external_key_hash
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
        baseWeight.toFixed(8),
        fieldworkPhase,
        job.study_id,
        job.wave_id
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

    const designDocument = {
      schema: "kontamou.research.sample-design.v1",
      sampleDrawId: drawId,
      frameSnapshotId: text(frame.id),
      frameContentSha256: text(frame.content_sha256),
      fieldworkPhase,
      desiredCompleteN,
      expectedResponseRate,
      eligiblePopulationN,
      activeContactN,
      contactabilityRate,
      plannedSelectedN: actualTargetN,
      expectedContactableN,
      expectedCompleteN,
      allocationMethod: "proportional_min2_v1",
      strata: designStrata
    };
    const designJson = canonicalResearchJson(designDocument);
    const designResult = await client.query<SqlRow>(`
      INSERT INTO research_sample_designs (
        sample_draw_id,
        study_id,
        wave_id,
        fieldwork_phase,
        desired_complete_n,
        expected_response_rate,
        eligible_population_n,
        active_contact_n,
        contactability_rate,
        planned_selected_n,
        expected_contactable_n,
        expected_complete_n,
        allocation_method,
        design_json,
        content_sha256
      )
      VALUES (
        $1,$2,$3,$4,$5,$6::numeric,$7,$8,$9::numeric,$10,$11,$12,'proportional_min2_v1',$13::jsonb,$14
      )
      RETURNING id
    `, [
      drawId,
      job.study_id,
      job.wave_id,
      fieldworkPhase,
      desiredCompleteN,
      expectedResponseRate.toFixed(6),
      eligiblePopulationN,
      activeContactN,
      contactabilityRate.toFixed(6),
      actualTargetN,
      expectedContactableN,
      expectedCompleteN,
      designJson,
      sha256(designJson)
    ]);
    const designId = text(designResult.rows[0]!.id);
    for (const stratum of designStrata) {
      await client.query(`
        INSERT INTO research_sample_design_strata (
          design_id,
          stratum_id,
          population_n,
          active_contact_n,
          selected_n,
          target_complete_n,
          expected_contactable_n,
          expected_complete_n
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [
        designId,
        stratum.stratumId,
        stratum.populationN,
        stratum.activeContactN,
        stratum.selectedN,
        stratum.targetCompleteN,
        stratum.expectedContactableN,
        stratum.expectedCompleteN
      ]);
    }

    await client.query(`
      UPDATE research_sample_draws
      SET status='superseded'
      WHERE study_id=$1
        AND wave_id=$2
        AND id<>$3
        AND status='locked'
        AND fieldwork_phase=$4
    `, [job.study_id, job.wave_id, drawId, fieldworkPhase]);
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
      sampleDesignId: designId,
      desiredCompleteN,
      expectedResponseRate,
      contactabilityRate,
      expectedContactableN,
      expectedCompleteN,
      algorithmVersion: "stratified-hash-rank-v2",
      randomSeed,
      fieldworkPhase,
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
  const fieldworkPhase = text(input.fieldworkPhase) === "pilot" ? "pilot" : "main";
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
          d.fieldwork_phase,
          rt.id AS recruitment_template_id
        FROM research_studies s
        JOIN LATERAL (
          SELECT id FROM research_instruments
          WHERE study_id=s.id AND status IN ('locked','fielding')
          ORDER BY created_at DESC LIMIT 1
        ) i ON true
        JOIN LATERAL (
          SELECT id,fieldwork_phase FROM research_sample_draws
          WHERE study_id=s.id
            AND wave_id=$3
            AND status IN ('locked','fielded')
            AND fieldwork_phase=$2
          ORDER BY created_at DESC LIMIT 1
        ) d ON true
        JOIN LATERAL (
          SELECT id FROM research_recruitment_templates
          WHERE study_id=s.id AND wave_id=$3 AND channel='email' AND status='locked'
            AND purpose='research_invitation'
          ORDER BY locked_at DESC NULLS LAST,created_at DESC LIMIT 1
        ) rt ON true
        WHERE s.id=$1
        FOR UPDATE OF s
      `, [job.study_id, fieldworkPhase, job.wave_id]);
      const row = study.rows[0];
      if (!row) throw new Error("RESEARCH_INVITE_BATCH_NOT_READY");
      if (row.fieldwork_ends_at && new Date(String(row.fieldwork_ends_at)).getTime() <= Date.now()) {
        throw new Error("SURVEY_INVITE_EXPIRED");
      }
      if (!["pilot","fielding"].includes(text(row.study_status))) throw new Error("SURVEY_NOT_OPEN");
      const currentPhase = text(row.study_status) === "pilot" ? "pilot" : "main";
      if (currentPhase !== fieldworkPhase || text(row.fieldwork_phase) !== fieldworkPhase) {
        throw new Error("RESEARCH_FIELDWORK_PHASE_CHANGED");
      }

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
              AND ri.wave_id=$5
              AND ri.sample_unit_id=su.id
              AND ri.fieldwork_phase=$4
              AND ri.status <> 'expired'
          )
          AND (
            $4::text <> 'main'
            OR NOT EXISTS (
              SELECT 1
              FROM research_invites pri
              JOIN research_sample_units psu ON psu.id=pri.sample_unit_id
              JOIN research_frame_units pfu ON pfu.id=psu.frame_unit_id
              JOIN research_frame_units cfu ON cfu.id=su.frame_unit_id
              WHERE pri.study_id=$2
                AND pri.wave_id=$5
                AND pri.fieldwork_phase='pilot'
                AND pri.sent_at IS NOT NULL
                AND pfu.external_key_hash=cfu.external_key_hash
            )
          )
        ORDER BY su.selection_order
        LIMIT $3
        FOR UPDATE OF su SKIP LOCKED
      `, [row.sample_draw_id, row.study_id, limit, fieldworkPhase, job.wave_id]);
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
          study_id,wave_id,sample_draw_id,instrument_id,recruitment_template_id,label,channel,status,planned_count,fieldwork_phase
        )
        VALUES ($1,$2,$3,$4,$5,$6,'email','ready',$7,$8)
        RETURNING id
      `, [
        row.study_id,
        job.wave_id,
        row.sample_draw_id,
        row.instrument_id,
        row.recruitment_template_id,
        text(input.label) || `${fieldworkPhase}-research-email-${new Date().toISOString()}`,
        sampleUnitIds.length,
        fieldworkPhase
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
      b.id,b.study_id,b.wave_id,b.sample_draw_id,b.instrument_id,b.recruitment_template_id,b.fieldwork_phase,
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
  if (text(batchRow.wave_id) !== job.wave_id) throw new Error("RESEARCH_INVITE_BATCH_WAVE_MISMATCH");
  if (batchRow.fieldwork_ends_at && new Date(String(batchRow.fieldwork_ends_at)).getTime() <= Date.now()) {
    throw new Error("SURVEY_INVITE_EXPIRED");
  }
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
    if (batchRow.fieldwork_ends_at && new Date(String(batchRow.fieldwork_ends_at)).getTime() <= Date.now()) {
      throw new Error("SURVEY_INVITE_EXPIRED");
    }
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
      SELECT
        su.id AS sample_unit_id,
        cp.id AS contact_point_id,
        cp.contact_value,
        fu.sampling_attributes->>'legalName' AS legal_name
      FROM research_sample_units su
      JOIN research_frame_units fu ON fu.id=su.frame_unit_id
      JOIN LATERAL (
        SELECT id,contact_value
        FROM research_private.contact_points_with_value
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
        study_id,wave_id,instrument_id,sample_unit_id,contact_point_id,batch_id,token_hash,channel,status,expires_at,fieldwork_phase
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,'email','created',
        COALESCE($8::timestamptz,now() + interval '30 days'),
        $9
      )
      RETURNING id,expires_at
    `, [
      batchRow.study_id,
      job.wave_id,
      batchRow.instrument_id,
      sampleUnitId,
      contact.contact_point_id,
      batchId,
      sha256(token),
      batchRow.fieldwork_ends_at ?? null,
      batchRow.fieldwork_phase
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
        bodyTemplate: text(batchRow.body_text),
        companyName: text(contact.legal_name).trim() || undefined
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
  const fieldworkPhase = text(input.fieldworkPhase) === "pilot" ? "pilot" : "main";
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
      s.status AS study_status,
      s.fieldwork_ends_at
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
  if (template.fieldwork_ends_at && new Date(String(template.fieldwork_ends_at)).getTime() <= Date.now()) {
    throw new Error("SURVEY_INVITE_EXPIRED");
  }
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
        AND ri.fieldwork_phase=$6
        AND ri.sent_at IS NOT NULL
        AND ri.status IN ('sent','opened','started')
        AND (ri.expires_at IS NULL OR ri.expires_at > now())
        AND ri.sent_at <= now() - ($2::int * interval '1 day')
        AND COALESCE(rr.status,'') NOT IN ('completed','withdrawn','excluded')
        AND COALESCE(stats.sent_reminders,0) < $3
        AND COALESCE(stats.last_reminder_sent_at,ri.sent_at)
              <= now() - ($4::int * interval '1 day')
        AND NOT EXISTS (
          SELECT 1
          FROM research_invite_messages pending_delay
          WHERE pending_delay.invite_id=ri.id
            AND pending_delay.status='sent'
            AND pending_delay.last_error LIKE 'SES delivery delay:%'
        )
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
    `, [job.study_id, minAgeDays, maxReminders, minGapDays, limit, fieldworkPhase]);
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
        fu.sampling_attributes->>'legalName' AS legal_name,
        stats.sent_reminders,
        stats.last_reminder_sent_at,
        stats.max_sequence
      FROM research_invites ri
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      JOIN research_frame_units fu ON fu.id=su.frame_unit_id
      LEFT JOIN research_responses rr ON rr.invite_id=ri.id
      CROSS JOIN reminder_stats stats
      JOIN LATERAL (
        SELECT id,contact_value
        FROM research_private.contact_points_with_value
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
        AND NOT EXISTS (
          SELECT 1
          FROM research_invite_messages pending_delay
          WHERE pending_delay.invite_id=ri.id
            AND pending_delay.status='sent'
            AND pending_delay.last_error LIKE 'SES delivery delay:%'
        )
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
        bodyTemplate: text(template.body_text),
        companyName: text(row.legal_name).trim() || undefined
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
    JOIN research_private.contact_points_with_value cp ON cp.id=ri.contact_point_id
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
  const joinUrl = absoluteResearchUrl("/hubs/join");
  const methodologyUrl = absoluteResearchUrl(`/research/${STUDY_SLUG}/methodology`);

  for (const candidate of candidates.rows) {
    const entitlementId = text(candidate.entitlement_id);
    const responseId = text(candidate.response_id);
    const contactPointId = text(candidate.contact_point_id);
    const inserted = await pool.query<SqlRow>(`
      INSERT INTO research_participant_deliveries (
        study_id,wave_id,response_id,contact_point_id,reward_entitlement_id,
        message_kind,consent_kind,status,provider
      )
      VALUES ($1,$2,$3,$4,$5,'thank_you_code','thank_you_code','planned','ses')
      ON CONFLICT DO NOTHING
      RETURNING id,status
    `, [job.study_id, job.wave_id, responseId, contactPointId, entitlementId]);

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
    JOIN research_private.contact_points_with_value cp ON cp.id=ri.contact_point_id
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
        study_id,wave_id,response_id,contact_point_id,release_snapshot_id,
        message_kind,consent_kind,status,provider
      )
      VALUES ($1,$2,$3,$4,$5,'results_notification','results_notification','planned','ses')
      ON CONFLICT DO NOTHING
      RETURNING id,status
    `, [job.study_id, job.wave_id, responseId, contactPointId, releaseSnapshotId]);
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
    JOIN research_private.contact_points_with_value cp ON cp.id=ri.contact_point_id
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
  // Never create a follow-up email batch automatically. Any remaining
  // opted-in recipients require a fresh two-step admin confirmation.
  const continuationJobId: string | undefined = undefined;

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

async function processIdentityDestructionJob(job: ResearchJobRow): Promise<Record<string, unknown>> {
  const client = await getProductionPostgresRuntime().sqlPool.connect();
  try {
    await client.query("BEGIN");

    const waveResult = await client.query<SqlRow>(`
      SELECT
        rw.id,
        rw.identity_retention_until,
        rw.identity_destroyed_at,
        s.status AS study_status
      FROM research_waves rw
      JOIN research_studies s ON s.id=rw.study_id
      WHERE rw.id=$1
        AND rw.study_id=$2
      FOR UPDATE OF rw
    `, [text(objectValue(job.input).waveId), job.study_id]);
    const wave = waveResult.rows[0];
    if (!wave) throw new Error("RESEARCH_WAVE_NOT_FOUND");

    if (wave.identity_destroyed_at) {
      const existing = await client.query<SqlRow>(`
        SELECT id,content_sha256,occurred_at
        FROM research_identity_destruction_events
        WHERE wave_id=$1
        LIMIT 1
      `, [wave.id]);
      await client.query("COMMIT");
      return {
        waveId: text(wave.id),
        alreadyDestroyed: true,
        destructionEventId: existing.rows[0] ? text(existing.rows[0].id) : undefined,
        destructionSha256: existing.rows[0] ? text(existing.rows[0].content_sha256) : undefined
      };
    }

    if (!["closed","analysis","published","archived"].includes(text(wave.study_status))) {
      throw new Error("RESEARCH_IDENTITY_DESTRUCTION_REQUIRES_CLOSED_FIELDWORK");
    }
    const retentionUntil = wave.identity_retention_until
      ? new Date(String(wave.identity_retention_until))
      : undefined;
    if (!retentionUntil || !Number.isFinite(retentionUntil.getTime())) {
      throw new Error("RESEARCH_IDENTITY_RETENTION_POLICY_MISSING");
    }
    if (retentionUntil.getTime() > Date.now()) {
      throw new Error("RESEARCH_IDENTITY_RETENTION_NOT_ELAPSED");
    }

    const nonterminalInvites = await client.query<SqlRow>(`
      SELECT count(*)::int AS count
      FROM research_invites
      WHERE wave_id=$1
        AND status NOT IN ('completed','suppressed','expired')
    `, [wave.id]);
    if (numberValue(nonterminalInvites.rows[0]?.count) > 0) {
      throw new Error("RESEARCH_IDENTITY_DESTRUCTION_FIELDWORK_NOT_TERMINAL");
    }

    const pendingDeliveries = await client.query<SqlRow>(`
      SELECT count(*)::int AS count
      FROM research_participant_deliveries
      WHERE wave_id=$1
        AND status NOT IN ('sent','cancelled')
    `, [wave.id]);
    if (numberValue(pendingDeliveries.rows[0]?.count) > 0) {
      throw new Error("RESEARCH_IDENTITY_DESTRUCTION_DELIVERIES_PENDING");
    }

    const frozen = await client.query(`
      INSERT INTO research_response_design_context (
        response_id,study_id,wave_id,sample_draw_id,stratum_id,
        region_code,sector_code,size_band,
        inclusion_probability,base_weight,fieldwork_phase
      )
      SELECT
        rr.id,
        rr.study_id,
        rr.wave_id,
        su.sample_draw_id,
        su.stratum_id,
        COALESCE(fu.region_code,'unknown'),
        COALESCE(fu.sector_code,'unknown'),
        COALESCE(fu.size_band,'unknown'),
        su.inclusion_probability,
        su.base_weight,
        ri.fieldwork_phase
      FROM research_responses rr
      JOIN research_invites ri ON ri.id=rr.invite_id
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      JOIN research_frame_units fu ON fu.id=su.frame_unit_id
      WHERE rr.wave_id=$1
      ON CONFLICT (response_id) DO NOTHING
    `, [wave.id]);

    const contextCoverage = await client.query<SqlRow>(`
      SELECT
        (SELECT count(*)::int FROM research_responses WHERE wave_id=$1) AS response_count,
        (SELECT count(*)::int FROM research_response_design_context WHERE wave_id=$1) AS context_count
    `, [wave.id]);
    const responseCount = numberValue(contextCoverage.rows[0]?.response_count);
    const contextCount = numberValue(contextCoverage.rows[0]?.context_count);
    if (responseCount !== contextCount) {
      throw new Error("RESEARCH_IDENTITY_DESTRUCTION_DESIGN_CONTEXT_INCOMPLETE");
    }

    const inviteMessagesDetached = await client.query(`
      UPDATE research_invite_messages rim
      SET contact_point_id=NULL,
          updated_at=now()
      FROM research_invites ri
      WHERE rim.invite_id=ri.id
        AND ri.wave_id=$1
        AND rim.contact_point_id IS NOT NULL
    `, [wave.id]);

    const deliveriesDetached = await client.query(`
      UPDATE research_participant_deliveries
      SET contact_point_id=NULL,
          updated_at=now()
      WHERE wave_id=$1
        AND contact_point_id IS NOT NULL
    `, [wave.id]);

    const invitesDetached = await client.query(`
      UPDATE research_invites
      SET contact_point_id=NULL,
          sample_unit_id=NULL
      WHERE wave_id=$1
        AND (contact_point_id IS NOT NULL OR sample_unit_id IS NOT NULL)
    `, [wave.id]);

    const destroyedContacts = await client.query(`
      DELETE FROM public.research_contact_points cp
      USING public.research_frame_units fu,
            public.research_frame_snapshots fs
      WHERE cp.frame_unit_id=fu.id
        AND fu.frame_snapshot_id=fs.id
        AND fs.wave_id=$1
    `, [wave.id]);

    const occurredAt = new Date().toISOString();
    const evidence = {
      version: "kontamou.research.identity-destruction.v1",
      studyId: job.study_id,
      waveId: text(wave.id),
      jobId: job.id,
      retentionUntil: retentionUntil.toISOString(),
      responseContextsFrozen: contextCount,
      invitesDetached: invitesDetached.rowCount,
      inviteMessagesDetached: inviteMessagesDetached.rowCount,
      participantDeliveriesDetached: deliveriesDetached.rowCount,
      contactPointsDestroyed: destroyedContacts.rowCount,
      occurredAt
    };
    const evidenceJson = canonicalResearchJson(evidence);
    const evidenceSha256 = sha256(evidenceJson);
    const executedBy = text(objectValue(job.input).executedBy) || "research_worker";

    const destructionEvent = await client.query<SqlRow>(`
      INSERT INTO research_identity_destruction_events (
        study_id,wave_id,response_contexts_frozen,invites_detached,
        invite_messages_detached,participant_deliveries_detached,
        contact_points_destroyed,evidence_json,content_sha256,executed_by,occurred_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11::timestamptz
      )
      RETURNING id
    `, [
      job.study_id,
      wave.id,
      contextCount,
      invitesDetached.rowCount,
      inviteMessagesDetached.rowCount,
      deliveriesDetached.rowCount,
      destroyedContacts.rowCount,
      evidenceJson,
      evidenceSha256,
      executedBy,
      occurredAt
    ]);

    await client.query(`
      UPDATE research_waves
      SET identity_destroyed_at=$2::timestamptz,
          updated_at=now()
      WHERE id=$1
    `, [wave.id, occurredAt]);

    await client.query("COMMIT");
    return {
      waveId: text(wave.id),
      destructionEventId: text(destructionEvent.rows[0]!.id),
      destructionSha256: evidenceSha256,
      responseContextsFrozen: contextCount,
      newlyFrozenContexts: frozen.rowCount,
      invitesDetached: invitesDetached.rowCount,
      inviteMessagesDetached: inviteMessagesDetached.rowCount,
      participantDeliveriesDetached: deliveriesDetached.rowCount,
      contactPointsDestroyed: destroyedContacts.rowCount
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function processResearchStudyJobs(
  limit = 1,
  allowedJobTypes: readonly string[] = RESEARCH_JOB_TYPES
): Promise<ResearchJobTick> {
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  const normalizedJobTypes = [...new Set(allowedJobTypes)]
    .filter((jobType): jobType is ResearchJobType => RESEARCH_JOB_TYPE_SET.has(jobType));
  if (!normalizedJobTypes.length) return { claimed: 0, processed: 0, requeued: 0, failed: 0 };
  let claimed = 0;
  let processed = 0;
  let requeued = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index += 1) {
    const job = await claimResearchJob(normalizedJobTypes);
    if (!job) break;
    claimed += 1;
    try {
      assertQueuedResearchEmailApproval(job);
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
                  ? await runGreekRetailAnalysis(job.study_id, job.wave_id, job.id)
                : job.job_type === "release"
                    ? await buildGreekRetailRelease(job.study_id, job.wave_id, job.id, objectValue(job.input))
                  : job.job_type === "results_notification"
                      ? await processResultsNotificationJob(job)
                    : job.job_type === "identity_destruction"
                        ? await processIdentityDestructionJob(job)
                      : (() => { throw new Error("RESEARCH_JOB_TYPE_UNSUPPORTED"); })();
      const outputRecord = objectValue(output);
      if (outputRecord.__requeue === true) {
        const mergedOutput = { ...objectValue(job.output), ...outputRecord };
        const delaySeconds = Math.max(0, Math.floor(numberValue(mergedOutput.__delaySeconds) || 0));
        delete mergedOutput.__requeue;
        delete mergedOutput.__delaySeconds;
        await markJobRequeued(job.id, mergedOutput, delaySeconds);
        requeued += 1;
      } else {
        await markJobSucceeded(job.id, { ...objectValue(job.output), ...outputRecord });
        processed += 1;
      }
    } catch (error) {
      const outcome = await markJobError(job, error);
      if (outcome === "requeued") requeued += 1;
      else failed += 1;
    }
  }

  return { claimed, processed, requeued, failed };
}
