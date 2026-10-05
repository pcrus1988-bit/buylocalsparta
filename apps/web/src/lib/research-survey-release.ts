import { createHash } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const STUDY_SLUG = "greek-retail-2026";
const PUBLIC_RESULTS_PATH = "/research/greek-retail-2026/results";

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

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const object = value as Record<string, unknown>;
  return "{" + Object.keys(object).sort().map((key) => JSON.stringify(key) + ":" + canonical(object[key])).join(",") + "}";
}

function sha256Canonical(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}

function releaseVersion(raw?: string): string {
  const value = raw?.trim() || `release-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(value)) throw new Error("RESEARCH_RELEASE_VERSION_INVALID");
  return value;
}

export async function queueGreekRetailRelease(
  principal: SessionPrincipal,
  input: Readonly<{ releaseVersion?: string }> = {}
): Promise<Readonly<{ jobId: string; releaseVersion: string; analysisRunId: string }>> {
  assertAdminPermission(principal, "research.manage");
  if (!productionDatabaseConfigured()) throw new Error("SURVEY_DATABASE_UNAVAILABLE");
  const version = releaseVersion(input.releaseVersion);
  const pool = getProductionPostgresRuntime().sqlPool;

  const study = await pool.query<SqlRow>(`
    SELECT id,status
    FROM research_studies
    WHERE slug=$1
    LIMIT 1
  `, [STUDY_SLUG]);
  const row = study.rows[0];
  if (!row) throw new Error("RESEARCH_STUDY_NOT_FOUND");
  if (text(row.status) !== "analysis") throw new Error("RESEARCH_RELEASE_REQUIRES_ANALYSIS_STATUS");

  const analysis = await pool.query<SqlRow>(`
    SELECT id,dataset_sha256
    FROM research_analysis_runs
    WHERE study_id=$1 AND status='succeeded' AND dataset_sha256 IS NOT NULL
    ORDER BY completed_at DESC NULLS LAST,created_at DESC
    LIMIT 1
  `, [row.id]);
  const analysisRow = analysis.rows[0];
  if (!analysisRow) throw new Error("RESEARCH_RELEASE_REQUIRES_SUCCEEDED_ANALYSIS");

  const existingRelease = await pool.query<SqlRow>(`
    SELECT id
    FROM research_release_snapshots
    WHERE study_id=$1 AND release_version=$2
    LIMIT 1
  `, [row.id, version]);
  if (existingRelease.rows[0]) throw new Error("RESEARCH_RELEASE_VERSION_EXISTS");

  const existingJob = await pool.query<SqlRow>(`
    SELECT id,input
    FROM research_study_jobs
    WHERE study_id=$1 AND job_type='release' AND status IN ('queued','running')
    ORDER BY created_at DESC
    LIMIT 1
  `, [row.id]);
  if (existingJob.rows[0]) {
    const existingInput = objectValue(existingJob.rows[0].input);
    return {
      jobId: text(existingJob.rows[0].id),
      releaseVersion: text(existingInput.releaseVersion) || version,
      analysisRunId: text(existingInput.analysisRunId) || text(analysisRow.id)
    };
  }

  const job = await pool.query<SqlRow>(`
    INSERT INTO research_study_jobs (study_id,job_type,status,input)
    VALUES (
      $1,'release','queued',
      jsonb_build_object(
        'releaseVersion',$2::text,
        'analysisRunId',$3::text
      )
    )
    RETURNING id
  `, [row.id, version, analysisRow.id]);
  return {
    jobId: text(job.rows[0]!.id),
    releaseVersion: version,
    analysisRunId: text(analysisRow.id)
  };
}

export async function buildGreekRetailRelease(
  studyId: string,
  jobId: string,
  input: Readonly<{ releaseVersion?: string; analysisRunId?: string }>
): Promise<Record<string, unknown>> {
  const pool = getProductionPostgresRuntime().sqlPool;
  const version = releaseVersion(input.releaseVersion);
  const analysisRunId = text(input.analysisRunId);
  if (!analysisRunId) throw new Error("RESEARCH_RELEASE_ANALYSIS_RUN_REQUIRED");

  const studyResult = await pool.query<SqlRow>(`
    SELECT
      s.id,s.slug,s.title,s.subtitle,s.sponsor,s.population_definition,s.methodology_summary,
      s.status,s.default_locale,s.fieldwork_starts_at,s.fieldwork_ends_at,
      i.id AS instrument_id,i.version AS instrument_version,i.content_sha256 AS instrument_sha256,
      i.consent_statement_version,
      ar.code_version,ar.weight_version,ar.parameters,ar.dataset_sha256,ar.completed_at AS analysis_completed_at
    FROM research_studies s
    JOIN LATERAL (
      SELECT id,version,content_sha256,consent_statement_version
      FROM research_instruments
      WHERE study_id=s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) i ON true
    JOIN research_analysis_runs ar ON ar.id=$2 AND ar.study_id=s.id AND ar.status='succeeded'
    WHERE s.id=$1
    LIMIT 1
  `, [studyId, analysisRunId]);
  const study = studyResult.rows[0];
  if (!study) throw new Error("RESEARCH_RELEASE_ANALYSIS_NOT_FOUND");
  if (text(study.slug) !== STUDY_SLUG) throw new Error("RESEARCH_RELEASE_STUDY_UNSUPPORTED");
  if (text(study.status) !== "analysis") throw new Error("RESEARCH_RELEASE_REQUIRES_ANALYSIS_STATUS");
  if (!text(study.dataset_sha256)) throw new Error("RESEARCH_RELEASE_DATASET_HASH_MISSING");

  const pendingReviews = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (qr.response_id) qr.response_id,qr.decision
      FROM research_response_quality_reviews qr
      JOIN research_responses rr ON rr.id=qr.response_id
      WHERE rr.study_id=$1 AND rr.status='completed'
      ORDER BY qr.response_id,qr.created_at DESC,qr.id DESC
    )
    SELECT
      count(*) FILTER (WHERE decision='review')::int AS review_count,
      count(*) FILTER (WHERE decision='exclude')::int AS exclude_count
    FROM latest
  `, [studyId]);
  const reviewCount = numberValue(pendingReviews.rows[0]?.review_count);
  if (reviewCount > 0) throw new Error("RESEARCH_RELEASE_REQUIRES_QA_RESOLUTION");

  const parameters = objectValue(study.parameters);
  let sampleDrawId = text(parameters.sampleDrawId);
  let frameSnapshotId = text(parameters.frameSnapshotId);

  if (!sampleDrawId) {
    const draw = await pool.query<SqlRow>(`
      SELECT id,frame_snapshot_id
      FROM research_sample_draws
      WHERE study_id=$1 AND status IN ('locked','fielded')
      ORDER BY drawn_at DESC NULLS LAST,created_at DESC
      LIMIT 1
    `, [studyId]);
    if (!draw.rows[0]) throw new Error("RESEARCH_RELEASE_SAMPLE_MISSING");
    sampleDrawId = text(draw.rows[0].id);
    frameSnapshotId = text(draw.rows[0].frame_snapshot_id);
  }

  const designResult = await pool.query<SqlRow>(`
    SELECT
      d.id AS sample_draw_id,d.label AS sample_label,d.algorithm_version,d.random_seed,d.target_n,
      d.status AS sample_status,d.drawn_at,
      f.id AS frame_snapshot_id,f.label AS frame_label,f.source_kind,f.source_reference,
      f.population_size,f.selection_criteria,f.content_sha256 AS frame_sha256,f.captured_at,f.frozen_at
    FROM research_sample_draws d
    JOIN research_frame_snapshots f ON f.id=d.frame_snapshot_id
    WHERE d.id=$1 AND d.study_id=$2
    LIMIT 1
  `, [sampleDrawId, studyId]);
  const design = designResult.rows[0];
  if (!design) throw new Error("RESEARCH_RELEASE_DESIGN_MISSING");
  frameSnapshotId = frameSnapshotId || text(design.frame_snapshot_id);

  const fieldworkCounts = await pool.query<SqlRow>(`
    SELECT
      (SELECT count(*)::int FROM research_sample_units WHERE sample_draw_id=$2) AS selected,
      (SELECT count(*)::int FROM research_invites WHERE study_id=$1 AND sent_at IS NOT NULL) AS sent,
      (SELECT count(DISTINCT invite_id)::int FROM research_invite_events ie
       JOIN research_invites ri ON ri.id=ie.invite_id
       WHERE ri.study_id=$1 AND ie.event_type='delivered') AS delivered,
      (SELECT count(DISTINCT invite_id)::int FROM research_invite_events ie
       JOIN research_invites ri ON ri.id=ie.invite_id
       WHERE ri.study_id=$1 AND ie.event_type='opened') AS opened,
      (SELECT count(*)::int FROM research_responses WHERE study_id=$1) AS started,
      (SELECT count(*)::int FROM research_responses WHERE study_id=$1 AND status='completed') AS completed,
      (SELECT count(*)::int FROM research_responses WHERE study_id=$1 AND status='withdrawn') AS withdrawn,
      (SELECT count(*)::int FROM research_weights w
       JOIN research_responses rr ON rr.id=w.response_id
       JOIN research_analysis_runs ar ON ar.weight_version=w.version
       WHERE ar.id=$3) AS analyzed
  `, [studyId, sampleDrawId, analysisRunId]);
  const counts = fieldworkCounts.rows[0] ?? {};

  const strata = await pool.query<SqlRow>(`
    SELECT code,label,dimensions,population_count,target_complete_count
    FROM research_strata
    WHERE frame_snapshot_id=$1
    ORDER BY code
  `, [frameSnapshotId]);

  const estimatesResult = await pool.query<SqlRow>(`
    SELECT metric_key,segment,estimate,standard_error,confidence_level,ci_lower,ci_upper,
           unweighted_n,weighted_n,method,suppressed,metadata
    FROM research_analysis_estimates
    WHERE analysis_run_id=$1
    ORDER BY metric_key,segment::text
  `, [analysisRunId]);

  const varianceMethod = text(parameters.varianceMethod) || "not_estimated";
  const methodology = {
    releaseVersion: version,
    study: {
      slug: text(study.slug),
      title: text(study.title),
      subtitle: text(study.subtitle) || null,
      sponsor: text(study.sponsor),
      populationDefinition: text(study.population_definition),
      methodologySummary: text(study.methodology_summary),
      locale: text(study.default_locale)
    },
    instrument: {
      version: text(study.instrument_version),
      contentSha256: text(study.instrument_sha256),
      consentStatementVersion: text(study.consent_statement_version)
    },
    frame: {
      id: text(design.frame_snapshot_id),
      label: text(design.frame_label),
      sourceKind: text(design.source_kind),
      sourceReference: text(design.source_reference) || null,
      populationSize: numberValue(design.population_size),
      selectionCriteria: objectValue(design.selection_criteria),
      contentSha256: text(design.frame_sha256),
      capturedAt: design.captured_at ?? null,
      frozenAt: design.frozen_at ?? null,
      strata: strata.rows.map((row) => ({
        code: text(row.code),
        label: text(row.label),
        dimensions: objectValue(row.dimensions),
        populationCount: numberValue(row.population_count),
        targetCompleteCount: numberValue(row.target_complete_count)
      }))
    },
    sample: {
      id: text(design.sample_draw_id),
      label: text(design.sample_label),
      algorithmVersion: text(design.algorithm_version),
      randomSeed: text(design.random_seed),
      targetN: numberValue(design.target_n),
      status: text(design.sample_status),
      drawnAt: design.drawn_at ?? null
    },
    fieldwork: {
      startsAt: study.fieldwork_starts_at ?? null,
      endsAt: study.fieldwork_ends_at ?? null,
      selected: numberValue(counts.selected),
      sent: numberValue(counts.sent),
      delivered: numberValue(counts.delivered),
      opened: numberValue(counts.opened),
      started: numberValue(counts.started),
      completed: numberValue(counts.completed),
      withdrawn: numberValue(counts.withdrawn),
      analyzed: numberValue(counts.analyzed),
      qualityExcluded: numberValue(pendingReviews.rows[0]?.exclude_count)
    },
    analysis: {
      runId: analysisRunId,
      codeVersion: text(study.code_version),
      weightVersion: text(study.weight_version) || null,
      datasetSha256: text(study.dataset_sha256),
      completedAt: study.analysis_completed_at ?? null,
      varianceMethod,
      publicMinimumBase: numberValue(parameters.publicMinimumBase) || 30
    },
    disclosure: {
      smallBaseSuppression: true,
      confidenceIntervalsPublished: varianceMethod !== "not_estimated",
      conventionalMarginOfErrorPublished: false
    },
    limitations: [
      "The sampling frame depends on the frozen G.E.MI. source snapshot and the contact points available for that frame.",
      "Non-response adjustment is performed within the governed sampling strata.",
      varianceMethod === "not_estimated"
        ? "Design-based variance has not been estimated for this release; confidence intervals and a conventional margin of sampling error are therefore not published."
        : "Variance estimates follow the analysis method recorded for this release."
    ]
  };

  const estimates = estimatesResult.rows.map((row) => {
    const suppressed = Boolean(row.suppressed);
    return {
      metricKey: text(row.metric_key),
      segment: objectValue(row.segment),
      estimate: suppressed || row.estimate == null ? null : numberValue(row.estimate),
      standardError: suppressed || row.standard_error == null ? null : numberValue(row.standard_error),
      confidenceLevel: suppressed || row.confidence_level == null ? null : numberValue(row.confidence_level),
      ciLower: suppressed || row.ci_lower == null ? null : numberValue(row.ci_lower),
      ciUpper: suppressed || row.ci_upper == null ? null : numberValue(row.ci_upper),
      unweightedN: numberValue(row.unweighted_n),
      weightedN: row.weighted_n == null ? null : numberValue(row.weighted_n),
      method: text(row.method),
      suppressed,
      metadata: objectValue(row.metadata)
    };
  });

  const artifact = {
    schema: "kontamou.research.release.v1",
    releaseVersion: version,
    studySlug: text(study.slug),
    analysisRunId,
    datasetSha256: text(study.dataset_sha256),
    methodology,
    estimates
  };
  const artifactSha256 = sha256Canonical(artifact);

  const inserted = await pool.query<SqlRow>(`
    INSERT INTO research_release_snapshots (
      study_id,analysis_run_id,release_version,methodology_json,dataset_sha256,
      artifact_sha256,public_url,published_at
    )
    VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,NULL)
    RETURNING id
  `, [
    studyId,
    analysisRunId,
    version,
    JSON.stringify(methodology),
    text(study.dataset_sha256),
    artifactSha256,
    PUBLIC_RESULTS_PATH
  ]);

  return {
    releaseId: text(inserted.rows[0]!.id),
    releaseVersion: version,
    analysisRunId,
    datasetSha256: text(study.dataset_sha256),
    artifactSha256,
    publicUrl: PUBLIC_RESULTS_PATH,
    estimateCount: estimates.length,
    jobId
  };
}

export type PublishedResearchEstimate = Readonly<{
  metricKey: string;
  segment: Record<string, unknown>;
  estimate: number | null;
  unweightedN: number;
  weightedN: number | null;
  suppressed: boolean;
  metadata: Record<string, unknown>;
}>;

export async function getPublishedGreekRetailResults(slug: string): Promise<Readonly<{
  releaseVersion: string;
  publishedAt: string;
  datasetSha256: string;
  artifactSha256: string;
  methodology: Record<string, unknown>;
  estimates: readonly PublishedResearchEstimate[];
}> | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const pool = getProductionPostgresRuntime().sqlPool;
  const release = await pool.query<SqlRow>(`
    SELECT rs.release_version,rs.published_at,rs.dataset_sha256,rs.artifact_sha256,
           rs.methodology_json,rs.analysis_run_id
    FROM research_release_snapshots rs
    JOIN research_studies s ON s.id=rs.study_id
    WHERE s.slug=$1 AND rs.published_at IS NOT NULL
    ORDER BY rs.published_at DESC,rs.created_at DESC
    LIMIT 1
  `, [slug]);
  const row = release.rows[0];
  if (!row) return undefined;

  const estimatesResult = await pool.query<SqlRow>(`
    SELECT metric_key,segment,estimate,unweighted_n,weighted_n,suppressed,metadata
    FROM research_analysis_estimates
    WHERE analysis_run_id=$1
    ORDER BY metric_key,segment::text
  `, [row.analysis_run_id]);

  return {
    releaseVersion: text(row.release_version),
    publishedAt: new Date(row.published_at as string | Date).toISOString(),
    datasetSha256: text(row.dataset_sha256),
    artifactSha256: text(row.artifact_sha256),
    methodology: objectValue(row.methodology_json),
    estimates: estimatesResult.rows.map((estimate) => ({
      metricKey: text(estimate.metric_key),
      segment: objectValue(estimate.segment),
      estimate: Boolean(estimate.suppressed) || estimate.estimate == null ? null : numberValue(estimate.estimate),
      unweightedN: numberValue(estimate.unweighted_n),
      weightedN: estimate.weighted_n == null ? null : numberValue(estimate.weighted_n),
      suppressed: Boolean(estimate.suppressed),
      metadata: objectValue(estimate.metadata)
    }))
  };
}
