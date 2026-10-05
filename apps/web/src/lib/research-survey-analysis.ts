import { createHash } from "node:crypto";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

const ANALYSIS_CODE_VERSION = "greek-retail-2026-analysis-v1";
const WEIGHT_METHOD_VERSION = "greek-retail-2026-weight-v1";
const MIN_PUBLIC_BASE = 30;

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

function estimateSpecs(questions: readonly QuestionRow[], responses: readonly WeightedResponse[]): EstimateSpec[] {
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
          metadata: { questionCode: question.code, option, label, format: "proportion" }
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
          metadata: { questionCode: question.code, option, label, format: "proportion", multipleResponse: true }
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
          metadata: { questionCode: question.code, format: "mean" }
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
          metadata: { questionCode: question.code, matrixItem: item, label, format: "mean" }
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
    if (observations.length) specs.push({ metricKey, observations, metadata: { format: "mean", derived: true } });
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
    SELECT id
    FROM research_analysis_runs
    WHERE study_id=$1 AND parameters->>'jobId'=$2
    ORDER BY created_at DESC
    LIMIT 1
  `, [studyId, jobId]);
  let analysisRunId = text(runResult.rows[0]?.id);
  const weightVersion = `${WEIGHT_METHOD_VERSION}:${jobId}`;
  if (!analysisRunId) {
    runResult = await pool.query<SqlRow>(`
      INSERT INTO research_analysis_runs (
        study_id,label,code_version,instrument_version,weight_version,parameters,status,started_at
      )
      VALUES (
        $1,'Automated weighted descriptive analysis',$2,$3,$4,
        jsonb_build_object('jobId',$5::text,'varianceMethod','pending_design_based_v1'),
        'running',now()
      )
      RETURNING id
    `, [studyId, ANALYSIS_CODE_VERSION, instrument.version, weightVersion, jobId]);
    analysisRunId = text(runResult.rows[0]!.id);
  } else {
    await pool.query(`
      UPDATE research_analysis_runs
      SET status='running', started_at=now(), completed_at=NULL, dataset_sha256=NULL
      WHERE id=$1
    `, [analysisRunId]);
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
  for (const spec of estimateSpecs(questions, weightedResponses)) {
    for (const segment of segmentsFor(spec.observations)) {
      const result = weightedMean(segment.observations);
      if (result.estimate === undefined) continue;
      const unweightedN = segment.observations.length;
      const suppressed = unweightedN < MIN_PUBLIC_BASE;
      await pool.query(`
        INSERT INTO research_analysis_estimates (
          analysis_run_id,metric_key,segment,estimate,standard_error,confidence_level,
          ci_lower,ci_upper,unweighted_n,weighted_n,method,suppressed,metadata
        )
        VALUES (
          $1,$2,$3::jsonb,$4,NULL,NULL,NULL,NULL,$5,$6,
          'nonresponse_adjusted_weighted_descriptive_v1',$7,$8::jsonb
        )
      `, [
        analysisRunId,
        spec.metricKey,
        JSON.stringify(segment.segment),
        result.estimate,
        unweightedN,
        result.weightSum,
        suppressed,
        JSON.stringify({
          ...spec.metadata,
          weightVersion,
          publicMinimumBase: MIN_PUBLIC_BASE,
          variance: "not_estimated"
        })
      ]);
      estimateCount += 1;
    }
  }

  await pool.query(`
    UPDATE research_analysis_runs
    SET dataset_sha256=$2,status='succeeded',completed_at=now()
    WHERE id=$1
  `, [analysisRunId, datasetSha256]);

  return {
    analysisRunId,
    codeVersion: ANALYSIS_CODE_VERSION,
    weightVersion,
    datasetSha256,
    includedResponses: weightedResponses.length,
    estimateCount,
    varianceMethod: "not_estimated",
    publicMinimumBase: MIN_PUBLIC_BASE
  };
}
