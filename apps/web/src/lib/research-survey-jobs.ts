import { createHash, randomBytes } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import {
  gemiResearchFrameRecords,
  normalizeGemiAdminFilters,
  type GemiResearchFrameRecord
} from "./gemi-admin-export";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { runGreekRetailAnalysis } from "./research-survey-analysis";
import { buildGreekRetailRelease } from "./research-survey-release";
import {
  assertResearchSurveyEmailReady,
  sendResearchSurveyInvitation
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
  input: Readonly<{ subject: string; bodyText: string; version?: string }>
): Promise<{ templateId: string; version: string }> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const subject = input.subject.trim();
  const bodyText = input.bodyText.trim();
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
    `invite-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(version)) throw new Error("RESEARCH_RECRUITMENT_VERSION_INVALID");

  const inserted = await pool.query<SqlRow>(`
    INSERT INTO research_recruitment_templates (
      study_id,version,channel,subject,body_text,body_sha256,purpose,status,locked_at
    )
    VALUES ($1,$2,'email',$3,$4,$5,'research_invitation','locked',now())
    RETURNING id
  `, [row.id, version, subject, bodyText, sha256(bodyText)]);
  return { templateId: text(inserted.rows[0]!.id), version };
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
        AND job_type IN ('frame_snapshot','sample_draw','invite_batch','analysis','release')
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
      'active'
    FROM units
    JOIN incoming USING (external_key_hash)
    WHERE incoming.email <> '' AND incoming.contact_hash <> ''
    ON CONFLICT (frame_unit_id, contact_type, contact_value_hash)
    DO UPDATE SET
      contact_value=EXCLUDED.contact_value,
      source_kind=EXCLUDED.source_kind
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

export type StratumAllocationInput = Readonly<{ id: string; populationCount: number }>;
export type StratumAllocation = Readonly<{ id: string; populationCount: number; sampleCount: number }>;

export function proportionalStratumAllocation(
  strata: readonly StratumAllocationInput[],
  requestedN: number
): readonly StratumAllocation[] {
  const clean = strata
    .map((stratum) => ({ id: stratum.id, populationCount: Math.max(0, Math.floor(stratum.populationCount)) }))
    .filter((stratum) => stratum.populationCount > 0);
  const population = clean.reduce((sum, stratum) => sum + stratum.populationCount, 0);
  const target = Math.min(Math.max(0, Math.floor(requestedN)), population);
  if (!target || !clean.length) return clean.map((stratum) => ({ ...stratum, sampleCount: 0 }));

  const canCoverEveryStratum = target >= clean.length;
  const base = clean.map((stratum) => ({
    ...stratum,
    sampleCount: canCoverEveryStratum ? 1 : 0
  }));
  let remaining = target - base.reduce((sum, stratum) => sum + stratum.sampleCount, 0);

  while (remaining > 0) {
    const availablePopulation = base.reduce(
      (sum, stratum) => sum + Math.max(0, stratum.populationCount - stratum.sampleCount),
      0
    );
    if (!availablePopulation) break;

    const quotas = base.map((stratum, index) => {
      const capacity = Math.max(0, stratum.populationCount - stratum.sampleCount);
      const exact = remaining * capacity / availablePopulation;
      return { index, exact, floor: Math.min(capacity, Math.floor(exact)), fraction: exact - Math.floor(exact) };
    });
    let added = 0;
    for (const quota of quotas) {
      if (!quota.floor) continue;
      base[quota.index]!.sampleCount += quota.floor;
      added += quota.floor;
    }
    remaining -= added;
    if (remaining <= 0) break;

    const ranked = quotas
      .filter((quota) => base[quota.index]!.sampleCount < base[quota.index]!.populationCount)
      .sort((a, b) => b.fraction - a.fraction || base[a.index]!.id.localeCompare(base[b.index]!.id));
    if (!ranked.length) break;
    for (const quota of ranked) {
      if (remaining <= 0) break;
      const stratum = base[quota.index]!;
      if (stratum.sampleCount >= stratum.populationCount) continue;
      stratum.sampleCount += 1;
      remaining -= 1;
    }
  }

  return base;
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
      targetN
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
      VALUES ($1,$2,$3,'stratified-hash-rank-v1',$4,$5,'draft')
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
             jsonb_build_object('drawId',$1::text,'algorithmVersion','stratified-hash-rank-v1')
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
      algorithmVersion: "stratified-hash-rank-v1",
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

    const surveyUrl = `${base}/research/${encodeURIComponent(text(batchRow.slug))}/t/${encodeURIComponent(token)}`;
    const methodologyUrl = `${base}/research/${encodeURIComponent(text(batchRow.slug))}/methodology`;
    try {
      const delivery = await sendResearchSurveyInvitation({
        destination: text(contact.contact_value),
        studySlug: text(batchRow.slug),
        studyTitle: text(batchRow.title),
        inviteId,
        batchId,
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
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES (
          $1,'sent',
          jsonb_build_object(
            'source','ses',
            'providerMessageId',$2::text,
            'configurationSet',$3::text
          )
        )
      `, [
        inviteId,
        delivery.providerMessageId,
        process.env.BLS_RESEARCH_SES_CONFIGURATION_SET?.trim() || ""
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
      await pool.query(`
        INSERT INTO research_invite_events (invite_id,event_type,metadata)
        VALUES ($1,'expired',jsonb_build_object('source','research_worker','reason','send_failed','error',$2::text))
      `, [inviteId, message]);
      failedCount += 1;
      failures.push({ sampleUnitId, error: message });
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
            : job.job_type === "analysis"
              ? await runGreekRetailAnalysis(job.study_id, job.id)
              : job.job_type === "release"
                ? await buildGreekRetailRelease(job.study_id, job.id, objectValue(job.input))
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
