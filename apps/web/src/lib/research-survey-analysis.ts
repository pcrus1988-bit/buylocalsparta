import { createHash } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import {
  benjaminiHochbergAdjustedPValues,
  normal95ConfidenceInterval,
  normalTwoSidedPValue,
  researchWeightDiagnostics,
  stratifiedSrsMeanVariance
} from "./research-survey-statistics";

const ANALYSIS_CODE_VERSION = "greek-retail-2026-analysis-v4";
const WEIGHT_METHOD_VERSION = "greek-retail-2026-weight-v1";
const MIN_PUBLIC_BASE = 30;
const VARIANCE_METHOD = "stratified_srs_fpc_v1";

type ResponseRow = Readonly<{
  responseId: string;
  stratumId: string;
  stratumCode: string;
  regionCode: string;
  sectorCode: string;
  baseWeight: number;
}>;

type WeightedResponse = ResponseRow & Readonly<{
  finalWeight: number;
  answers: Record<string, unknown>;
  scores: Record<string, number | undefined>;
}>;

type QuestionRow = Readonly<{
  code: string;
  questionType: string;
  analysisKey: string;
  config: Record<string, unknown>;
}>;

type Observation = Readonly<{
  response: WeightedResponse;
  value: number;
}>;

type EstimateSpec = Readonly<{
  metricKey: string;
  observations: readonly Observation[];
  metadata: Record<string, unknown>;
}>;

function text(value: unknown): string {
  return typeof value === "string" ? value : String(value ?? "");
}

function numberValue(value: unknown): number {
  const valueNumber = Number(value);
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

function configPairs(config: Record<string, unknown>, key: string): Array<readonly [string, string]> {
  const value = config[key];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => Array.isArray(item) && item.length >= 2
    ? [[String(item[0]), String(item[1])] as const]
    : []);
}

function weightedMean(observations: readonly Observation[]): { estimate?: number; weightSum: number } {
  let numerator = 0;
  let weightSum = 0;
  for (const observation of observations) {
    if (!Number.isFinite(observation.value) || !Number.isFinite(observation.response.finalWeight) || observation.response.finalWeight <= 0) continue;
    numerator += observation.value * observation.response.finalWeight;
    weightSum += observation.response.finalWeight;
  }
  return weightSum > 0 ? { estimate: numerator / weightSum, weightSum } : { weightSum: 0 };
}

function segmentsFor(observations: readonly Observation[]): Array<Readonly<{
  segment: Record<string, string>;
  observations: readonly Observation[];
}>> {
  const result: Array<{ segment: Record<string, string>; observations: Observation[] }> = [
    { segment: {}, observations: [...observations] }
  ];
  const dimensions: Array<readonly [string, (response: WeightedResponse) => string]> = [
    ["regionCode", (response) => response.regionCode],
    ["sectorCode", (response) => response.sectorCode],
    ["sizeBand", (response) => typeof response.answers.Q02 === "string" ? response.answers.Q02 : ""]
  ];
  for (const [key, getter] of dimensions) {
    const groups = new Map<string, Observation[]>();
    for (const observation of observations) {
      const value = getter(observation.response).trim();
      if (!value) continue;
      const group = groups.get(value) ?? [];
      group.push(observation);
      groups.set(value, group);
    }
    for (const [value, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "el"))) {
      result.push({ segment: { [key]: value }, observations: group });
    }
  }
  return result;
}

function designResponsesForSegment(
  segment: Record<string, string>,
  responses: readonly WeightedResponse[]
): readonly WeightedResponse[] {
  if (segment.regionCode) return responses.filter((response) => response.regionCode === segment.regionCode);
  if (segment.sectorCode) return responses.filter((response) => response.sectorCode === segment.sectorCode);
  if (segment.sizeBand) {
    return responses.filter((response) => (
      typeof response.answers.Q02 === "string" && response.answers.Q02 === segment.sizeBand
    ));
  }
  return responses;
}

function estimateSpecs(
  questions: readonly QuestionRow[],
  responses: readonly WeightedResponse[],
  primaryMetricKeys: ReadonlySet<string>
): EstimateSpec[] {
  const specs: EstimateSpec[] = [];
  for (const question of questions) {
    if (question.questionType === "single") {
      const options = configPairs(question.config, "options");
      const answered = responses.filter((response) => typeof response.answers[question.code] === "string");
      for (const [option, label] of options) {
        specs.push({
          metricKey: `${question.analysisKey}.share.${option}`,
          observations: answered.map((response) => ({
            response,
            value: response.answers[question.code] === option ? 1 : 0
          })),
          metadata: { questionCode: question.code, option, label, format: "proportion", analysisClassification: "prespecified_secondary" }
        });
      }
    } else if (question.questionType === "multi") {
      const options = configPairs(question.config, "options");
      const answered = responses.filter((response) => Array.isArray(response.answers[question.code]));
      for (const [option, label] of options) {
        specs.push({
          metricKey: `${question.analysisKey}.share.${option}`,
          observations: answered.map((response) => ({
            response,
            value: (response.answers[question.code] as unknown[]).map(String).includes(option) ? 1 : 0
          })),
          metadata: { questionCode: question.code, option, label, format: "proportion", multipleResponse: true, analysisClassification: "prespecified_secondary" }
        });
      }
    } else if (question.questionType === "scale") {
      const observations = responses.flatMap((response) => {
        const value = Number(response.answers[question.code]);
        return Number.isFinite(value) ? [{ response, value }] : [];
      });
      if (observations.length) {
        specs.push({
          metricKey: `${question.analysisKey}.mean`,
          observations,
          metadata: { questionCode: question.code, format: "mean", analysisClassification: "prespecified_secondary" }
        });
      }
    } else if (question.questionType === "matrix") {
      const items = configPairs(question.config, "items");
      for (const [item, label] of items) {
        const observations = responses.flatMap((response) => {
          const answer = objectValue(response.answers[question.code]);
          const value = Number(answer[item]);
          return Number.isFinite(value) ? [{ response, value }] : [];
        });
        if (!observations.length) continue;
        specs.push({
          metricKey: `${question.analysisKey}.${item}.mean`,
          observations,
          metadata: { questionCode: question.code, matrixItem: item, label, format: "mean", analysisClassification: "prespecified_secondary" }
        });
      }
    }
  }

  const derived: Array<readonly [string, keyof WeightedResponse["scores"]]> = [
    ["digital_readiness.mean", "digitalReadiness"],
    ["retail_friction.mean", "frictionOverall"]
  ];
  for (const [metricKey, key] of derived) {
    const observations = responses.flatMap((response) => {
      const value = response.scores[key];
      return typeof value === "number" && Number.isFinite(value) ? [{ response, value }] : [];
    });
    if (observations.length) specs.push({
      metricKey,
      observations,
      metadata: {
        format: "mean",
        derived: true,
        analysisClassification: primaryMetricKeys.has(metricKey)
          ? "prespecified_primary"
          : "prespecified_secondary"
      }
    });
  }
  return specs;
}

export async function runGreekRetailAnalysis(
  studyId: string,
  jobId: string
): Promise<Record<string, unknown>> {
  const pool = getProductionPostgresRuntime().sqlPool;

  const pendingReviews = await pool.query<SqlRow>(`
    WITH latest AS (
      SELECT DISTINCT ON (qr.response_id) qr.response_id, qr.decision
      FROM research_response_quality_reviews qr
      JOIN research_responses r ON r.id=qr.response_id
      WHERE r.study_id=$1 AND r.status='completed'
      ORDER BY qr.response_id, qr.created_at DESC, qr.id DESC
    )
    SELECT count(*)::int AS count FROM latest WHERE decision='review'
  `, [studyId]);
  if (numberValue(pendingReviews.rows[0]?.count) > 0) {
    throw new Error("RESEARCH_ANALYSIS_REQUIRES_QA_RESOLUTION");
  }

  const instrumentResult = await pool.query<SqlRow>(`
    SELECT id, version
    FROM research_instruments
    WHERE study_id=$1
    ORDER BY created_at DESC
    LIMIT 1
  `, [studyId]);
  const instrument = instrumentResult.rows[0];
  if (!instrument) throw new Error("RESEARCH_ANALYSIS_INSTRUMENT_MISSING");

  const analysisPlanResult = await pool.query<SqlRow>(`
    SELECT id,version,title,plan_json,content_sha256,locked_at
    FROM research_analysis_plans
    WHERE study_id=$1 AND instrument_id=$2 AND status='locked'
    ORDER BY locked_at DESC,created_at DESC
    LIMIT 1
  `, [studyId, instrument.id]);
  const analysisPlan = analysisPlanResult.rows[0];
  if (!analysisPlan) throw new Error("RESEARCH_ANALYSIS_PLAN_MISSING");
  const analysisPlanJson = objectValue(analysisPlan.plan_json);
  const primaryMetricKeys = new Set(
    (Array.isArray(analysisPlanJson.primaryOutcomes) ? analysisPlanJson.primaryOutcomes : [])
      .map((outcome) => text(objectValue(outcome).metricKey))
      .filter(Boolean)
  );
  if (!primaryMetricKeys.size) throw new Error("RESEARCH_ANALYSIS_PLAN_PRIMARY_OUTCOMES_MISSING");

  const planDisclosure = objectValue(analysisPlanJson.disclosure);
  const planVariance = objectValue(analysisPlanJson.variance);
  const planWeighting = objectValue(analysisPlanJson.weighting);
  const planMinimumBase = numberValue(planDisclosure.minimumUnweightedBase);
  const planConfidenceLevel = numberValue(planVariance.confidenceLevel);
  const planVarianceMethod = text(planVariance.method);
  const planNonresponseAdjustment = text(planWeighting.nonresponseAdjustment);
  if (
    planMinimumBase !== MIN_PUBLIC_BASE ||
    planConfidenceLevel !== 0.95 ||
    planVarianceMethod !== VARIANCE_METHOD ||
    planNonresponseAdjustment !== "within_sampling_stratum"
  ) {
    throw new Error("RESEARCH_ANALYSIS_PLAN_CODE_MISMATCH");
  }

  const drawResult = await pool.query<SqlRow>(`
    SELECT id, frame_snapshot_id
    FROM research_sample_draws
    WHERE study_id=$1 AND status IN ('locked','fielded')
    ORDER BY created_at DESC
    LIMIT 1
  `, [studyId]);
  const draw = drawResult.rows[0];
  if (!draw) throw new Error("RESEARCH_ANALYSIS_SAMPLE_MISSING");

  let runResult = await pool.query<SqlRow>(`
    SELECT id,status,dataset_sha256,code_version,weight_version,analysis_plan_id
    FROM research_analysis_runs
    WHERE study_id=$1 AND parameters->>'jobId'=$2
    ORDER BY created_at DESC
    LIMIT 1
  `, [studyId, jobId]);
  let analysisRunId = text(runResult.rows[0]?.id);
  const weightVersion = `${WEIGHT_METHOD_VERSION}:${jobId}`;
  if (analysisRunId && text(runResult.rows[0]?.analysis_plan_id) !== text(analysisPlan.id)) {
    throw new Error("RESEARCH_ANALYSIS_PLAN_BINDING_MISMATCH");
  }
  if (analysisRunId && text(runResult.rows[0]?.status) === "succeeded") {
    const completed = await pool.query<SqlRow>(`
      SELECT
        (SELECT count(*)::int FROM research_analysis_estimates WHERE analysis_run_id=$1) AS estimate_count,
        (SELECT count(*)::int FROM research_weights WHERE version=$2) AS included_responses
    `, [analysisRunId, text(runResult.rows[0]?.weight_version) || weightVersion]);
    return {
      analysisRunId,
      codeVersion: text(runResult.rows[0]?.code_version) || ANALYSIS_CODE_VERSION,
      weightVersion: text(runResult.rows[0]?.weight_version) || weightVersion,
      datasetSha256: text(runResult.rows[0]?.dataset_sha256),
      includedResponses: numberValue(completed.rows[0]?.included_responses),
      estimateCount: numberValue(completed.rows[0]?.estimate_count),
      varianceMethod: VARIANCE_METHOD,
      publicMinimumBase: MIN_PUBLIC_BASE,
      analysisPlanVersion: text(analysisPlan.version),
      analysisPlanSha256: text(analysisPlan.content_sha256),
      idempotentReplay: true
    };
  }
  if (!analysisRunId) {
    runResult = await pool.query<SqlRow>(`
      INSERT INTO research_analysis_runs (
        study_id,label,code_version,instrument_version,weight_version,analysis_plan_id,parameters,status,started_at
      )
      VALUES (
        $1,'Automated weighted descriptive analysis',$2,$3,$4,$10,
        jsonb_build_object(
          'jobId',$5::text,
          'varianceMethod',$9::text,
          'sampleDrawId',$6::text,
          'frameSnapshotId',$7::text,
          'publicMinimumBase',$8::int,
          'analysisPlanVersion',$11::text,
          'analysisPlanSha256',$12::text
        ),
        'running',now()
      )
      RETURNING id
    `, [
      studyId,
      ANALYSIS_CODE_VERSION,
      instrument.version,
      weightVersion,
      jobId,
      draw.id,
      draw.frame_snapshot_id,
      MIN_PUBLIC_BASE,
      VARIANCE_METHOD,
      analysisPlan.id,
      analysisPlan.version,
      analysisPlan.content_sha256
    ]);
    analysisRunId = text(runResult.rows[0]!.id);
  } else {
    await pool.query(`
      UPDATE research_analysis_runs
      SET status='running', started_at=now(), completed_at=NULL, dataset_sha256=NULL,
          parameters=parameters || jsonb_build_object(
            'varianceMethod',$5::text,
            'sampleDrawId',$2::text,
            'frameSnapshotId',$3::text,
            'publicMinimumBase',$4::int,
            'analysisPlanVersion',$6::text,
            'analysisPlanSha256',$7::text
          )
      WHERE id=$1
    `, [
      analysisRunId,
      draw.id,
      draw.frame_snapshot_id,
      MIN_PUBLIC_BASE,
      VARIANCE_METHOD,
      analysisPlan.version,
      analysisPlan.content_sha256
    ]);
    await pool.query("DELETE FROM research_analysis_estimates WHERE analysis_run_id=$1", [analysisRunId]);
  }

  // Same job id means same immutable analysis attempt. A retry cleans up only
  // this run's not-yet-released weight version before reconstructing it.
  await pool.query("DELETE FROM research_weights WHERE version=$1", [weightVersion]);

  const eligibleByStratum = await pool.query<SqlRow>(`
    WITH latest_disposition AS (
      SELECT DISTINCT ON (e.sample_unit_id)
        e.sample_unit_id,
        e.disposition_code
      FROM research_sample_disposition_events e
      JOIN research_sample_units su ON su.id=e.sample_unit_id
      WHERE su.sample_draw_id=$1
      ORDER BY e.sample_unit_id, e.occurred_at DESC, e.id DESC
    )
    SELECT
      su.stratum_id,
      sum(su.base_weight)::numeric AS represented_weight
    FROM research_sample_units su
    LEFT JOIN latest_disposition d ON d.sample_unit_id=su.id
    WHERE su.sample_draw_id=$1
      AND COALESCE(d.disposition_code,'') NOT IN ('ineligible','duplicate','out_of_scope')
    GROUP BY su.stratum_id
  `, [draw.id]);
  const representedByStratum = new Map(
    eligibleByStratum.rows.map((row) => [text(row.stratum_id), numberValue(row.represented_weight)] as const)
  );

  const responseResult = await pool.query<SqlRow>(`
    WITH latest_quality AS (
      SELECT DISTINCT ON (qr.response_id)
        qr.response_id,
        qr.decision
      FROM research_response_quality_reviews qr
      JOIN research_responses rr ON rr.id=qr.response_id
      WHERE rr.study_id=$1
      ORDER BY qr.response_id, qr.created_at DESC, qr.id DESC
    )
    SELECT
      r.id AS response_id,
      su.stratum_id,
      st.code AS stratum_code,
      COALESCE(fu.region_code,'unknown') AS region_code,
      COALESCE(fu.sector_code,'unknown') AS sector_code,
      su.base_weight
    FROM research_responses r
    JOIN research_invites ri ON ri.id=r.invite_id
    JOIN research_sample_units su ON su.id=ri.sample_unit_id AND su.sample_draw_id=$2
    JOIN research_strata st ON st.id=su.stratum_id
    JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    LEFT JOIN latest_quality q ON q.response_id=r.id
    WHERE r.status='completed'
      AND COALESCE(q.decision,'include') <> 'exclude'
    ORDER BY r.id
  `, [studyId, draw.id]);
  if (!responseResult.rows.length) throw new Error("RESEARCH_ANALYSIS_NO_INCLUDED_RESPONSES");

  const baseResponses: ResponseRow[] = responseResult.rows.map((row) => ({
    responseId: text(row.response_id),
    stratumId: text(row.stratum_id),
    stratumCode: text(row.stratum_code),
    regionCode: text(row.region_code),
    sectorCode: text(row.sector_code),
    baseWeight: numberValue(row.base_weight)
  }));

  const responseBaseByStratum = new Map<string, number>();
  for (const response of baseResponses) {
    responseBaseByStratum.set(
      response.stratumId,
      (responseBaseByStratum.get(response.stratumId) ?? 0) + response.baseWeight
    );
  }

  const adjustmentByStratum = new Map<string, number>();
  for (const [stratumId, representedWeight] of representedByStratum) {
    const respondentBase = responseBaseByStratum.get(stratumId) ?? 0;
    if (representedWeight > 0 && respondentBase <= 0) {
      throw new Error(`RESEARCH_WEIGHTING_EMPTY_RESPONSE_STRATUM:${stratumId}`);
    }
    if (respondentBase > 0) adjustmentByStratum.set(stratumId, representedWeight / respondentBase);
  }

  for (const response of baseResponses) {
    const nonresponseAdjustment = adjustmentByStratum.get(response.stratumId);
    if (!nonresponseAdjustment || !Number.isFinite(nonresponseAdjustment)) {
      throw new Error(`RESEARCH_WEIGHTING_STRATUM_UNRESOLVED:${response.stratumId}`);
    }
    const finalWeight = response.baseWeight * nonresponseAdjustment;
    await pool.query(`
      INSERT INTO research_weights (
        response_id,version,base_weight,nonresponse_adjustment,calibration_adjustment,final_weight,metadata
      )
      VALUES (
        $1,$2,$3,$4,1,$5,
        jsonb_build_object(
          'method','within_stratum_nonresponse_adjustment',
          'analysisRunId',$6::text,
          'stratumId',$7::text
        )
      )
    `, [
      response.responseId,
      weightVersion,
      response.baseWeight,
      nonresponseAdjustment,
      finalWeight,
      analysisRunId,
      response.stratumId
    ]);
  }

  const answersResult = await pool.query<SqlRow>(`
    SELECT a.response_id, q.code, a.answer
    FROM research_answers a
    JOIN research_questions q ON q.id=a.question_id
    JOIN research_responses r ON r.id=a.response_id
    WHERE r.study_id=$1 AND a.response_id=ANY($2::uuid[])
    ORDER BY a.response_id, q.position, q.code
  `, [studyId, baseResponses.map((response) => response.responseId)]);
  const answerMap = new Map<string, Record<string, unknown>>();
  for (const row of answersResult.rows) {
    const id = text(row.response_id);
    const answers = answerMap.get(id) ?? {};
    answers[text(row.code)] = row.answer;
    answerMap.set(id, answers);
  }

  const scoresResult = await pool.query<SqlRow>(`
    SELECT response_id,digital_readiness_score,friction_overall_score
    FROM research_response_scores
    WHERE response_id=ANY($1::uuid[])
  `, [baseResponses.map((response) => response.responseId)]);
  const scoreMap = new Map(scoresResult.rows.map((row) => [
    text(row.response_id),
    {
      digitalReadiness: row.digital_readiness_score == null ? undefined : numberValue(row.digital_readiness_score),
      frictionOverall: row.friction_overall_score == null ? undefined : numberValue(row.friction_overall_score)
    }
  ] as const));

  const weightedResponses: WeightedResponse[] = baseResponses.map((response) => ({
    ...response,
    finalWeight: response.baseWeight * (adjustmentByStratum.get(response.stratumId) ?? 1),
    answers: answerMap.get(response.responseId) ?? {},
    scores: scoreMap.get(response.responseId) ?? {}
  }));

  const adjustmentValues = [...adjustmentByStratum.values()]
    .filter((value) => Number.isFinite(value) && value > 0);
  const weightingDiagnostics = {
    ...researchWeightDiagnostics(weightedResponses.map((response) => response.finalWeight)),
    nonresponseAdjustmentMin: adjustmentValues.length ? Math.min(...adjustmentValues) : null,
    nonresponseAdjustmentMax: adjustmentValues.length ? Math.max(...adjustmentValues) : null,
    adjustmentStrata: adjustmentValues.length
  };

  const questionResult = await pool.query<SqlRow>(`
    SELECT code,question_type,analysis_key,config
    FROM research_questions
    WHERE instrument_id=$1
    ORDER BY position
  `, [instrument.id]);
  const questions: QuestionRow[] = questionResult.rows.map((row) => ({
    code: text(row.code),
    questionType: text(row.question_type),
    analysisKey: text(row.analysis_key),
    config: objectValue(row.config)
  }));

  const datasetHash = createHash("sha256");
  for (const response of weightedResponses) {
    datasetHash.update(canonical({
      responseId: response.responseId,
      stratumId: response.stratumId,
      regionCode: response.regionCode,
      sectorCode: response.sectorCode,
      finalWeight: Number(response.finalWeight.toFixed(10)),
      answers: response.answers,
      scores: response.scores
    }) + "\n", "utf8");
  }
  const datasetSha256 = datasetHash.digest("hex");

  let estimateCount = 0;
  for (const spec of estimateSpecs(questions, weightedResponses, primaryMetricKeys)) {
    for (const segment of segmentsFor(spec.observations)) {
      const result = weightedMean(segment.observations);
      if (result.estimate === undefined) continue;
      const unweightedN = segment.observations.length;
      const suppressed = unweightedN < MIN_PUBLIC_BASE;
      const domainVarianceUnsupported = Boolean(segment.segment.sizeBand);
      const designResponses = designResponsesForSegment(segment.segment, weightedResponses);
      const variance = domainVarianceUnsupported
        ? { reason: "unsupported_non_stratification_domain" as const }
        : stratifiedSrsMeanVariance(
            segment.observations.map((observation) => ({
              stratumId: observation.response.stratumId,
              value: observation.value
            })),
            designResponses.map((response) => ({
              stratumId: response.stratumId,
              finalWeight: response.finalWeight
            }))
          );
      const standardError = "standardError" in variance ? variance.standardError : undefined;
      const confidence = standardError === undefined
        ? undefined
        : normal95ConfidenceInterval(
            result.estimate,
            standardError,
            spec.metadata.format === "proportion" ? "proportion" : "mean"
          );
      await pool.query(`
        INSERT INTO research_analysis_estimates (
          analysis_run_id,metric_key,segment,estimate,standard_error,confidence_level,
          ci_lower,ci_upper,unweighted_n,weighted_n,method,suppressed,metadata
        )
        VALUES (
          $1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,
          'nonresponse_adjusted_stratified_descriptive_v2',$11,$12::jsonb
        )
      `, [
        analysisRunId,
        spec.metricKey,
        JSON.stringify(segment.segment),
        result.estimate,
        standardError ?? null,
        standardError === undefined ? null : 0.95,
        confidence?.lower ?? null,
        confidence?.upper ?? null,
        unweightedN,
        result.weightSum,
        suppressed,
        JSON.stringify({
          ...spec.metadata,
          weightVersion,
          publicMinimumBase: MIN_PUBLIC_BASE,
          varianceMethod: standardError === undefined ? "withheld" : VARIANCE_METHOD,
          varianceWithheldReason: standardError === undefined ? variance.reason ?? "unavailable" : null,
          finitePopulationCorrection: standardError !== undefined
        })
      ]);
      estimateCount += 1;
    }
  }

  const comparisonSource = await pool.query<SqlRow>(`
    SELECT
      metric_key,
      segment,
      estimate,
      standard_error,
      unweighted_n,
      weighted_n,
      metadata
    FROM research_analysis_estimates
    WHERE analysis_run_id=$1
      AND method='nonresponse_adjusted_stratified_descriptive_v2'
      AND metric_key IN ('digital_readiness.mean','retail_friction.mean')
      AND suppressed=false
      AND estimate IS NOT NULL
      AND standard_error IS NOT NULL
      AND (
        segment ? 'regionCode'
        OR segment ? 'sectorCode'
      )
    ORDER BY metric_key,segment::text
  `, [analysisRunId]);

  const comparisonGroups = new Map<string, Array<{
    metricKey: string;
    dimension: "regionCode" | "sectorCode";
    level: string;
    estimate: number;
    standardError: number;
    unweightedN: number;
    weightedN: number | null;
    metadata: Record<string, unknown>;
  }>>();

  for (const row of comparisonSource.rows) {
    const segment = objectValue(row.segment);
    const dimension = typeof segment.regionCode === "string"
      ? "regionCode"
      : typeof segment.sectorCode === "string"
        ? "sectorCode"
        : undefined;
    if (!dimension) continue;
    const level = text(segment[dimension]).trim();
    const estimate = numberValue(row.estimate);
    const standardError = numberValue(row.standard_error);
    if (!level || !Number.isFinite(estimate) || !Number.isFinite(standardError) || standardError < 0) continue;
    const key = `${text(row.metric_key)}:${dimension}`;
    const group = comparisonGroups.get(key) ?? [];
    group.push({
      metricKey: text(row.metric_key),
      dimension,
      level,
      estimate,
      standardError,
      unweightedN: numberValue(row.unweighted_n),
      weightedN: row.weighted_n == null ? null : numberValue(row.weighted_n),
      metadata: objectValue(row.metadata)
    });
    comparisonGroups.set(key, group);
  }

  for (const group of comparisonGroups.values()) {
    group.sort((a, b) => a.level.localeCompare(b.level, "el"));
    const pairs: Array<{
      left: typeof group[number];
      right: typeof group[number];
      difference: number;
      standardError: number;
      confidence: Readonly<{ lower: number; upper: number }>;
      zScore: number;
      pValue: number;
      weightedN: number | null;
    }> = [];

    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex]!;
        const right = group[rightIndex]!;
        const difference = left.estimate - right.estimate;
        const standardError = Math.sqrt(
          left.standardError * left.standardError +
          right.standardError * right.standardError
        );
        const confidence = standardError > 0
          ? normal95ConfidenceInterval(difference, standardError, "mean")
          : { lower: difference, upper: difference };
        const zScore = standardError > 0
          ? difference / standardError
          : difference === 0
            ? 0
            : difference > 0
              ? Number.POSITIVE_INFINITY
              : Number.NEGATIVE_INFINITY;
        const pValue = Number.isFinite(zScore)
          ? normalTwoSidedPValue(zScore) ?? 1
          : 0;
        const weightedN = left.weightedN != null && right.weightedN != null
          ? left.weightedN + right.weightedN
          : null;
        pairs.push({ left, right, difference, standardError, confidence, zScore, pValue, weightedN });
      }
    }

    const adjustedPValues = benjaminiHochbergAdjustedPValues(pairs.map((pair) => pair.pValue));
    for (let pairIndex = 0; pairIndex < pairs.length; pairIndex += 1) {
      const pair = pairs[pairIndex]!;
      const adjustedPValue = adjustedPValues[pairIndex] ?? 1;
      await pool.query(`
        INSERT INTO research_analysis_estimates (
          analysis_run_id,metric_key,segment,estimate,standard_error,confidence_level,
          ci_lower,ci_upper,unweighted_n,weighted_n,method,suppressed,metadata
        )
        VALUES (
          $1,$2,$3::jsonb,$4,$5,0.95,$6,$7,$8,$9,
          'pairwise_independent_strata_difference_v1',false,$10::jsonb
        )
      `, [
        analysisRunId,
        `${pair.left.metricKey}.pairwise_difference`,
        JSON.stringify({
          comparisonDimension: pair.left.dimension,
          levelA: pair.left.level,
          levelB: pair.right.level
        }),
        pair.difference,
        pair.standardError,
        pair.confidence.lower,
        pair.confidence.upper,
        pair.left.unweightedN + pair.right.unweightedN,
        pair.weightedN,
        JSON.stringify({
          format: "difference",
          sourceMetricKey: pair.left.metricKey,
          sourceFormat: pair.left.metadata.format ?? "mean",
          comparisonDimension: pair.left.dimension,
          levelA: pair.left.level,
          levelB: pair.right.level,
          estimateA: pair.left.estimate,
          estimateB: pair.right.estimate,
          standardErrorA: pair.left.standardError,
          standardErrorB: pair.right.standardError,
          unweightedNA: pair.left.unweightedN,
          unweightedNB: pair.right.unweightedN,
          weightedNA: pair.left.weightedN,
          weightedNB: pair.right.weightedN,
          zScore: Number.isFinite(pair.zScore) ? pair.zScore : null,
          pValue: pair.pValue,
          rawPValueAdjustment: "none",
          adjustedPValue,
          adjustedPValueMethod: "benjamini_hochberg",
          adjustmentFamily: `${pair.left.metricKey}:${pair.left.dimension}`,
          exploratory: true,
          analysisClassification: "exploratory",
          independenceBasis: "disjoint_unions_of_sampling_strata"
        })
      ]);
      estimateCount += 1;
    }
  }

  await pool.query(`
    UPDATE research_analysis_runs
    SET dataset_sha256=$2,
        status='succeeded',
        completed_at=now(),
        parameters=parameters || jsonb_build_object('weightDiagnostics',$3::jsonb)
    WHERE id=$1
  `, [analysisRunId, datasetSha256, JSON.stringify(weightingDiagnostics)]);

  return {
    analysisRunId,
    codeVersion: ANALYSIS_CODE_VERSION,
    weightVersion,
    datasetSha256,
    includedResponses: weightedResponses.length,
    estimateCount,
    varianceMethod: VARIANCE_METHOD,
    publicMinimumBase: MIN_PUBLIC_BASE,
    analysisPlanVersion: text(analysisPlan.version),
    analysisPlanSha256: text(analysisPlan.content_sha256),
    weightingDiagnostics
  };
}
