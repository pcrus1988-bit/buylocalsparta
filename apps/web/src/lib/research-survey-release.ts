import { createHash } from "node:crypto";
import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { researchFieldworkOutcomeSummary } from "./research-survey-statistics";

const STUDY_SLUG = "greek-retail-2026";
const PUBLIC_RESULTS_PATH = "/research/greek-retail-2026/results";

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value ?? 0);
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function rate(numerator: unknown, denominator: unknown): number | null {
  const denominatorNumber = numberValue(denominator);
  return denominatorNumber > 0 ? numberValue(numerator) / denominatorNumber : null;
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

  const existing = await pool.query<SqlRow>(`
    SELECT id,analysis_run_id,dataset_sha256,artifact_sha256,public_url
    FROM research_release_snapshots
    WHERE study_id=$1 AND release_version=$2
    LIMIT 1
  `, [studyId, version]);
  if (existing.rows[0]) {
    const row = existing.rows[0];
    if (text(row.analysis_run_id) !== analysisRunId) throw new Error("RESEARCH_RELEASE_VERSION_EXISTS");
    const estimates = await pool.query<SqlRow>(`
      SELECT count(*)::int AS count
      FROM research_analysis_estimates
      WHERE analysis_run_id=$1
    `, [analysisRunId]);
    return {
      releaseId: text(row.id),
      releaseVersion: version,
      analysisRunId,
      datasetSha256: text(row.dataset_sha256),
      artifactSha256: text(row.artifact_sha256),
      publicUrl: text(row.public_url) || PUBLIC_RESULTS_PATH,
      estimateCount: numberValue(estimates.rows[0]?.count),
      jobId,
      idempotentReplay: true
    };
  }

  const studyResult = await pool.query<SqlRow>(`
    SELECT
      s.id,s.slug,s.title,s.subtitle,s.sponsor,s.population_definition,s.methodology_summary,
      s.status,s.default_locale,s.fieldwork_starts_at,s.fieldwork_ends_at,
      i.id AS instrument_id,i.version AS instrument_version,i.content_sha256 AS instrument_sha256,
      i.consent_statement_version,
      ar.code_version,ar.weight_version,ar.parameters,ar.dataset_sha256,ar.completed_at AS analysis_completed_at,
      ap.version AS analysis_plan_version,ap.title AS analysis_plan_title,
      ap.status AS analysis_plan_status,ap.plan_json AS analysis_plan_json,
      ap.content_sha256 AS analysis_plan_sha256,ap.locked_at AS analysis_plan_locked_at
    FROM research_studies s
    JOIN LATERAL (
      SELECT id,version,content_sha256,consent_statement_version
      FROM research_instruments
      WHERE study_id=s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) i ON true
    JOIN research_analysis_runs ar ON ar.id=$2 AND ar.study_id=s.id AND ar.status='succeeded'
    JOIN research_analysis_plans ap
      ON ap.id=ar.analysis_plan_id
      AND ap.study_id=s.id
      AND ap.instrument_id=i.id
      AND ap.status='locked'
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
    WITH sample AS (
      SELECT su.id,su.stratum_id
      FROM research_sample_units su
      WHERE su.sample_draw_id=$2
    ),
    sample_counts AS (
      SELECT stratum_id,count(*)::int AS selected
      FROM sample
      GROUP BY stratum_id
    ),
    invite_base AS (
      SELECT ri.id AS invite_id,su.stratum_id,ri.status
      FROM research_invites ri
      JOIN sample su ON su.id=ri.sample_unit_id
      WHERE ri.study_id=$3
    ),
    invite_counts AS (
      SELECT
        stratum_id,
        count(*) FILTER (WHERE status IN ('sent','opened','started','completed'))::int AS sent
      FROM invite_base
      GROUP BY stratum_id
    ),
    invite_event_counts AS (
      SELECT
        ib.stratum_id,
        count(DISTINCT ib.invite_id) FILTER (WHERE ie.event_type='delivered')::int AS delivered,
        count(DISTINCT ib.invite_id) FILTER (WHERE ie.event_type='opened')::int AS opened
      FROM invite_base ib
      JOIN research_invite_events ie ON ie.invite_id=ib.invite_id
      GROUP BY ib.stratum_id
    ),
    response_counts AS (
      SELECT
        ib.stratum_id,
        count(rr.id)::int AS started,
        count(rr.id) FILTER (WHERE rr.status='completed')::int AS completed,
        count(rr.id) FILTER (WHERE rr.status='withdrawn')::int AS withdrawn
      FROM invite_base ib
      JOIN research_responses rr ON rr.invite_id=ib.invite_id
      GROUP BY ib.stratum_id
    )
    SELECT
      st.code,
      st.label,
      st.dimensions,
      st.population_count,
      st.target_complete_count,
      (
        SELECT count(DISTINCT fu.id)::int
        FROM research_frame_units fu
        WHERE fu.stratum_id=st.id
          AND EXISTS (
            SELECT 1
            FROM research_contact_points cp
            WHERE cp.frame_unit_id=fu.id
              AND cp.contact_type='email'
              AND cp.suppression_status='active'
              AND NOT public.research_contact_is_suppressed(cp.contact_type,cp.contact_value_hash)
          )
      ) AS active_email_units,
      COALESCE(sc.selected,0)::int AS selected,
      COALESCE(ic.sent,0)::int AS sent,
      COALESCE(iec.delivered,0)::int AS delivered,
      COALESCE(iec.opened,0)::int AS opened,
      COALESCE(rc.started,0)::int AS started,
      COALESCE(rc.completed,0)::int AS completed,
      COALESCE(rc.withdrawn,0)::int AS withdrawn
    FROM research_strata st
    LEFT JOIN sample_counts sc ON sc.stratum_id=st.id
    LEFT JOIN invite_counts ic ON ic.stratum_id=st.id
    LEFT JOIN invite_event_counts iec ON iec.stratum_id=st.id
    LEFT JOIN response_counts rc ON rc.stratum_id=st.id
    WHERE st.frame_snapshot_id=$1
    ORDER BY st.code
  `, [frameSnapshotId, sampleDrawId, studyId]);

  const instrumentQuestions = await pool.query<SqlRow>(`
    SELECT
      code,
      section_code,
      position,
      question_type,
      prompt_el,
      help_el,
      required,
      analysis_key,
      config
    FROM research_questions
    WHERE instrument_id=$1
    ORDER BY position,code
  `, [study.instrument_id]);

  const recruitmentTemplates = await pool.query<SqlRow>(`
    WITH used_templates AS (
      SELECT b.recruitment_template_id
      FROM research_invite_batches b
      WHERE b.study_id=$1
        AND b.sample_draw_id=$2
        AND b.status <> 'cancelled'
      UNION
      SELECT m.recruitment_template_id
      FROM research_invite_messages m
      JOIN research_invites ri ON ri.id=m.invite_id
      JOIN research_sample_units su ON su.id=ri.sample_unit_id
      WHERE ri.study_id=$1
        AND su.sample_draw_id=$2
        AND m.status <> 'cancelled'
    )
    SELECT DISTINCT
      rt.version,
      rt.channel,
      rt.subject,
      rt.body_text,
      rt.body_sha256,
      rt.purpose
    FROM used_templates u
    JOIN research_recruitment_templates rt ON rt.id=u.recruitment_template_id
    ORDER BY rt.version,rt.channel
  `, [studyId, sampleDrawId]);

  const contactAttempts = await pool.query<SqlRow>(`
    SELECT
      m.attempt_kind,
      m.status,
      count(*)::int AS count
    FROM research_invite_messages m
    JOIN research_invites ri ON ri.id=m.invite_id
    JOIN research_sample_units su ON su.id=ri.sample_unit_id
    WHERE ri.study_id=$1
      AND su.sample_draw_id=$2
    GROUP BY m.attempt_kind,m.status
    ORDER BY m.attempt_kind,m.status
  `, [studyId, sampleDrawId]);

  const dispositionCounts = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (e.sample_unit_id)
        e.sample_unit_id,
        e.disposition_code,
        e.eligibility
      FROM research_sample_disposition_events e
      JOIN research_sample_units su ON su.id=e.sample_unit_id
      WHERE su.sample_draw_id=$1
      ORDER BY e.sample_unit_id,e.occurred_at DESC,e.id DESC
    )
    SELECT disposition_code,eligibility,count(*)::int AS count
    FROM latest
    GROUP BY disposition_code,eligibility
    ORDER BY disposition_code,eligibility
  `, [sampleDrawId]);

  const latestDispositionCounts = dispositionCounts.rows.map((row) => ({
    dispositionCode: text(row.disposition_code),
    eligibility: text(row.eligibility),
    count: numberValue(row.count)
  }));
  const fieldworkOutcome = researchFieldworkOutcomeSummary(
    numberValue(counts.selected),
    latestDispositionCounts
  );
  if (!fieldworkOutcome.sealed) {
    throw new Error("RESEARCH_RELEASE_REQUIRES_SEALED_FIELDWORK_DISPOSITIONS");
  }

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
      consentStatementVersion: text(study.consent_statement_version),
      questions: instrumentQuestions.rows.map((row) => ({
        code: text(row.code),
        sectionCode: text(row.section_code),
        position: numberValue(row.position),
        type: text(row.question_type),
        promptEl: text(row.prompt_el),
        helpEl: text(row.help_el) || null,
        required: Boolean(row.required),
        analysisKey: text(row.analysis_key),
        config: objectValue(row.config)
      }))
    },
    analysisPlan: {
      version: text(study.analysis_plan_version),
      title: text(study.analysis_plan_title),
      status: text(study.analysis_plan_status),
      contentSha256: text(study.analysis_plan_sha256),
      lockedAt: study.analysis_plan_locked_at ?? null,
      plan: objectValue(study.analysis_plan_json)
    },
    recruitment: {
      templates: recruitmentTemplates.rows.map((row) => ({
        version: text(row.version),
        channel: text(row.channel),
        subject: text(row.subject) || null,
        bodyText: text(row.body_text),
        bodySha256: text(row.body_sha256),
        purpose: text(row.purpose)
      })),
      contactAttempts: contactAttempts.rows.map((row) => ({
        attemptKind: text(row.attempt_kind),
        status: text(row.status),
        count: numberValue(row.count)
      })),
      denominatorRule: "Each selected sample unit has at most one canonical research_invites identity; reminder/reissue messages are paradata and never increase the invitation or response denominator."
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
        targetCompleteCount: numberValue(row.target_complete_count),
        activeEmailUnits: numberValue(row.active_email_units),
        emailContactabilityRate: rate(row.active_email_units, row.population_count),
        selected: numberValue(row.selected),
        sent: numberValue(row.sent),
        delivered: numberValue(row.delivered),
        opened: numberValue(row.opened),
        started: numberValue(row.started),
        completed: numberValue(row.completed),
        withdrawn: numberValue(row.withdrawn),
        deliveryRateOfSent: rate(row.delivered, row.sent),
        openRateOfDelivered: rate(row.opened, row.delivered),
        startRateOfSent: rate(row.started, row.sent),
        completionRateOfSent: rate(row.completed, row.sent),
        completionRateOfStarted: rate(row.completed, row.started)
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
      activeEmailFrameUnits: strata.rows.reduce((sum, row) => sum + numberValue(row.active_email_units), 0),
      emailContactabilityRate: numberValue(design.population_size) > 0
        ? strata.rows.reduce((sum, row) => sum + numberValue(row.active_email_units), 0) / numberValue(design.population_size)
        : 0,
      endsAt: study.fieldwork_ends_at ?? null,
      selected: numberValue(counts.selected),
      sent: numberValue(counts.sent),
      delivered: numberValue(counts.delivered),
      opened: numberValue(counts.opened),
      started: numberValue(counts.started),
      completed: numberValue(counts.completed),
      withdrawn: numberValue(counts.withdrawn),
      deliveryRateOfSent: rate(counts.delivered, counts.sent),
      openRateOfDelivered: rate(counts.opened, counts.delivered),
      startRateOfSent: rate(counts.started, counts.sent),
      completionRateOfSent: rate(counts.completed, counts.sent),
      completionRateOfStarted: rate(counts.completed, counts.started),
      analyzed: numberValue(counts.analyzed),
      qualityExcluded: numberValue(pendingReviews.rows[0]?.exclude_count),
      latestDispositionCounts,
      outcomeSummary: fieldworkOutcome
    },
    analysis: {
      runId: analysisRunId,
      codeVersion: text(study.code_version),
      weightVersion: text(study.weight_version) || null,
      datasetSha256: text(study.dataset_sha256),
      completedAt: study.analysis_completed_at ?? null,
      varianceMethod,
      publicMinimumBase: numberValue(parameters.publicMinimumBase) || 30,
      weightDiagnostics: objectValue(parameters.weightDiagnostics),
      experimentDiagnostics: objectValue(parameters.experimentDiagnostics)
    },
    disclosure: {
      smallBaseSuppression: true,
      confidenceIntervalsPublished: varianceMethod !== "not_estimated",
      conventionalMarginOfErrorPublished: false,
      prespecifiedAnalysisPlanPublished: true,
      randomizedExperimentExploratoryPublished: estimatesResult.rows.some(
        (row) => text(row.method) === "randomized_profile_amce_clustered_v1" && !Boolean(row.suppressed)
      )
    },
    limitations: [
      "The sampling frame depends on the frozen G.E.MI. source snapshot and the contact points available for that frame.",
      "Email contactability is reported for the frozen frame and by sampling stratum. Email-only fieldwork can still be biased if availability of a usable public email is related to survey outcomes after conditioning on the weighting strata.",
      "Non-response adjustment is performed within the governed sampling strata.",
      "Reminder and reissue emails are counted as contact attempts only; they reuse the canonical invite identity and therefore do not inflate sent-invitation or response-rate denominators.",
      "The locked pre-fieldwork analysis plan distinguishes pre-specified primary and secondary analyses from explicitly exploratory pairwise comparisons; later analytical additions must be labelled rather than silently back-dated into the plan.",
      "The optional EXP01 randomized profile experiment is analyzed only as exploratory evidence. Its attribute-level contrasts were added after the locked analysis plan, are labelled not preregistered, and use respondent-clustered weighted uncertainty rather than the descriptive stratified-SRS variance estimator.",
      varianceMethod === "not_estimated"
        ? "Design-based variance has not been estimated for this release; confidence intervals and a conventional margin of sampling error are therefore not published."
        : "Design-aware confidence intervals use the recorded stratified sampling method with finite-population correction where the metric has complete observations within contributing strata. Intervals are withheld for unsupported post-hoc domains or insufficient stratum bases."
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
  standardError: number | null;
  confidenceLevel: number | null;
  ciLower: number | null;
  ciUpper: number | null;
  unweightedN: number;
  weightedN: number | null;
  method: string;
  suppressed: boolean;
  metadata: Record<string, unknown>;
}>;

export async function researchReleaseArtifactIntegrity(
  executor: {
    query<Row extends SqlRow = SqlRow>(
      text: string,
      params?: readonly unknown[]
    ): Promise<{ rows: readonly Row[] }>;
  },
  releaseId: string
): Promise<Readonly<{
  storedSha256: string;
  computedSha256: string;
  integrityOk: boolean;
}> | undefined> {
  const releaseResult = await executor.query<SqlRow>(`
    SELECT
      rs.release_version,
      rs.analysis_run_id,
      rs.dataset_sha256,
      rs.artifact_sha256,
      rs.methodology_json,
      s.slug
    FROM research_release_snapshots rs
    JOIN research_studies s ON s.id=rs.study_id
    WHERE rs.id=$1
    LIMIT 1
  `, [releaseId]);
  const release = releaseResult.rows[0];
  if (!release) return undefined;

  const estimatesResult = await executor.query<SqlRow>(`
    SELECT metric_key,segment,estimate,standard_error,confidence_level,ci_lower,ci_upper,
           unweighted_n,weighted_n,method,suppressed,metadata
    FROM research_analysis_estimates
    WHERE analysis_run_id=$1
    ORDER BY metric_key,segment::text
  `, [release.analysis_run_id]);

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
    releaseVersion: text(release.release_version),
    studySlug: text(release.slug),
    analysisRunId: text(release.analysis_run_id),
    datasetSha256: text(release.dataset_sha256),
    methodology: objectValue(release.methodology_json),
    estimates
  };
  const storedSha256 = text(release.artifact_sha256);
  const computedSha256 = sha256Canonical(artifact);
  return {
    storedSha256,
    computedSha256,
    integrityOk: Boolean(storedSha256) && storedSha256 === computedSha256
  };
}

export async function getPublishedGreekRetailResults(slug: string): Promise<Readonly<{
  releaseVersion: string;
  publishedAt: string;
  analysisRunId: string;
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
    SELECT metric_key,segment,estimate,standard_error,confidence_level,ci_lower,ci_upper,
           unweighted_n,weighted_n,method,suppressed,metadata
    FROM research_analysis_estimates
    WHERE analysis_run_id=$1
    ORDER BY metric_key,segment::text
  `, [row.analysis_run_id]);

  return {
    releaseVersion: text(row.release_version),
    publishedAt: new Date(row.published_at as string | Date).toISOString(),
    analysisRunId: text(row.analysis_run_id),
    datasetSha256: text(row.dataset_sha256),
    artifactSha256: text(row.artifact_sha256),
    methodology: objectValue(row.methodology_json),
    estimates: estimatesResult.rows.map((estimate) => ({
      metricKey: text(estimate.metric_key),
      segment: objectValue(estimate.segment),
      estimate: Boolean(estimate.suppressed) || estimate.estimate == null ? null : numberValue(estimate.estimate),
      standardError: Boolean(estimate.suppressed) || estimate.standard_error == null ? null : numberValue(estimate.standard_error),
      confidenceLevel: Boolean(estimate.suppressed) || estimate.confidence_level == null ? null : numberValue(estimate.confidence_level),
      ciLower: Boolean(estimate.suppressed) || estimate.ci_lower == null ? null : numberValue(estimate.ci_lower),
      ciUpper: Boolean(estimate.suppressed) || estimate.ci_upper == null ? null : numberValue(estimate.ci_upper),
      unweightedN: numberValue(estimate.unweighted_n),
      weightedN: estimate.weighted_n == null ? null : numberValue(estimate.weighted_n),
      method: text(estimate.method),
      suppressed: Boolean(estimate.suppressed),
      metadata: objectValue(estimate.metadata)
    }))
  };
}


export type PublishedResearchReleaseArtifact = Readonly<{
  schema: "kontamou.research.release.v1";
  releaseVersion: string;
  studySlug: string;
  analysisRunId: string;
  datasetSha256: string;
  methodology: Record<string, unknown>;
  estimates: readonly PublishedResearchEstimate[];
}>;

export async function getPublishedGreekRetailReleaseArtifact(slug: string): Promise<Readonly<{
  artifact: PublishedResearchReleaseArtifact;
  canonicalJson: string;
  artifactSha256: string;
  integrityOk: boolean;
}> | undefined> {
  const published = await getPublishedGreekRetailResults(slug);
  if (!published) return undefined;

  const artifact: PublishedResearchReleaseArtifact = {
    schema: "kontamou.research.release.v1",
    releaseVersion: published.releaseVersion,
    studySlug: slug,
    analysisRunId: published.analysisRunId,
    datasetSha256: published.datasetSha256,
    methodology: published.methodology,
    estimates: published.estimates
  };
  const canonicalJson = canonical(artifact);
  const recomputedSha256 = createHash("sha256").update(canonicalJson, "utf8").digest("hex");

  return {
    artifact,
    canonicalJson,
    artifactSha256: published.artifactSha256,
    integrityOk: recomputedSha256 === published.artifactSha256
  };
}
