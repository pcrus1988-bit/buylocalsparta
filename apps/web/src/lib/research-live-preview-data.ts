import "server-only";
import type { SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { resolveResearchAdministrativeGeography } from "./research-postcode-geography";
import { GREECE_PREFECTURES } from "./research-prefectures";
import { GREECE_REGIONS } from "./research-geographic-core";
import { scoreGreekRetail2026, type ResearchAnswerMap } from "./research-survey-model";
import { PUBLIC_RESULTS_METRICS, publicMetricLabel } from "./research-public-results-sections";
import type { SafePublicResultPoint,InternalResearchGeographicCoverage } from "./research-public-results-data";

const ALLOWED_METRICS = new Set<string>(PUBLIC_RESULTS_METRICS);
const MIN_CELL_N = 30;
// The restricted admin Preview may inspect descriptive single-county
// aggregates at n>=10. This NEVER lowers thresholds for the public release.
const MIN_INTERNAL_PREFECTURE_N = 10;
const RESTRICTED = /experiment|exp01|amce|conjoint|randomized_profile|platform_choice/i;
type Question = { code: string; kind: string; key: string; config: Record<string, unknown> };
type Participant = { answers: Record<string, unknown>; regionCode: string; prefectureCode: string; sectorCode: string; sizeBand: string };
type Measure = { metricKey: string; format: "proportion" | "mean"; observations: { person: Participant; value: number }[] };
export type LiveGreekRetailPreview = Readonly<{
  capturedAt: string;
  includedResponses: number;
  pendingQualityReview: number;
  coverage: InternalResearchGeographicCoverage;
  points: readonly SafePublicResultPoint[];
}>;

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function pairs(value: unknown): Array<[string, string]> {
  return Array.isArray(value) ? value.flatMap(item =>
    Array.isArray(item) && item.length >= 2 ? [[String(item[0]), String(item[1])] as [string, string]] : []
  ) : [];
}
function addMetric(target: Measure[], key: string, format: Measure["format"],
  observations: Measure["observations"]) {
  if (ALLOWED_METRICS.has(key) && !RESTRICTED.test(key) && observations.length) {
    target.push({metricKey: key, format, observations});
  }
}

/**
 * Confidential, read-only, unweighted fieldwork snapshot.
 *
 * Do not use release estimates here: there is no completed analysis run during
 * fieldwork. Never persist an analysis run, materialize raw answers in a client
 * payload, or change the 1 November public publication gate.
 */
export async function getLiveGreekRetailPreview(): Promise<LiveGreekRetailPreview> {
  if (!productionDatabaseConfigured()) throw new Error("RESEARCH_PREVIEW_DATABASE_UNAVAILABLE");
  const db = getProductionPostgresRuntime().sqlPool;

  // Latest QA decision owns eligibility. Pending review, excluded, in-progress,
  // withdrawn, pilot and unapproved responses never enter this snapshot.
  const result = await db.query<SqlRow>(`
    WITH latest_quality AS (
      SELECT DISTINCT ON (qr.response_id) qr.response_id, qr.decision
      FROM research_response_quality_reviews qr
      ORDER BY qr.response_id, qr.created_at DESC, qr.id DESC
    )
    SELECT r.id AS response_id,
      COALESCE(NULLIF(fu.sampling_attributes->>'prefecture',''),ctx.source_prefecture,'') AS prefecture,
      COALESCE(fu.sampling_attributes->>'postcode','') AS postcode,
      COALESCE(fu.sector_code, ctx.sector_code, '') AS sector_code,
      quality.decision AS quality_decision,
      COALESCE(jsonb_object_agg(q.code, a.answer)
        FILTER (WHERE a.id IS NOT NULL AND q.question_type NOT IN ('text','experiment')
          AND q.code !~* '(exp01|experiment)'), '{}'::jsonb) AS answers
    FROM research_responses r
    JOIN research_studies s ON s.id=r.study_id AND s.slug='greek-retail-2026'
    JOIN research_invites ri ON ri.id=r.invite_id AND ri.fieldwork_phase='main'
    LEFT JOIN latest_quality quality ON quality.response_id=r.id
    LEFT JOIN research_sample_units su ON su.id=ri.sample_unit_id
    LEFT JOIN research_frame_units fu ON fu.id=su.frame_unit_id
    LEFT JOIN research_response_design_context ctx ON ctx.response_id=r.id
    LEFT JOIN research_answers a ON a.response_id=r.id
    LEFT JOIN research_questions q ON q.id=a.question_id
    WHERE r.wave_id=s.current_wave_id
      AND r.status='completed' AND r.withdrawn_at IS NULL
      AND (quality.decision IS NULL OR quality.decision <> 'exclude')
    GROUP BY r.id,fu.sampling_attributes,ctx.source_prefecture,fu.sector_code,ctx.sector_code,quality.decision
  `);

  // Preliminary dashboard includes the entire set of completed, non-withdrawn
  // main-wave respondents, including pending quality review. It is not a
  // random sample of the respondents; no extrapolation to Greek businesses.
  const pendingQualityReview = result.rows.filter(row=>row.quality_decision!=="include").length;
  const people: Participant[] = result.rows.map(row => {
    const answers = object(row.answers);
    const location = resolveResearchAdministrativeGeography(row.postcode,row.prefecture);
    const {regionCode,prefectureCode} = location;
    const sectorCode = String(row.sector_code ?? "");
    return {answers, regionCode, prefectureCode, sectorCode,
      sizeBand: typeof answers.Q02 === "string" ? answers.Q02 : ""};
  });

  // Expose only county/region labels and broad suppressed cohort bands.
  // n<10 remains null, with no answer values, postcode, identity or raw rows.
  const countCoverage = (dimension:"regionCode"|"prefectureCode") => {
    const totals=new Map<string,number>();
    for(const person of people) {
      const code=person[dimension];
      if(code) totals.set(code,(totals.get(code)??0)+1);
    }
    return totals;
  };
  const countyCounts=countCoverage("prefectureCode");
  const regionCounts=countCoverage("regionCode");
  const band=(n:number):"none"|"under10"|"10to29"|"30plus" =>
    n>=30?"30plus":n>=10?"10to29":n>0?"under10":"none";
  const coverage:InternalResearchGeographicCoverage={
    includedTotal:people.length,
    prefectures:GREECE_PREFECTURES.map(p=>{
      const n=countyCounts.get(p.key)??0;
      return {key:p.key,band:band(n),eligibleN:n>=MIN_INTERNAL_PREFECTURE_N?n:null};
    }),
    regions:GREECE_REGIONS.map(p=>{
      const n=regionCounts.get(p.key)??0;
      return {key:p.key,band:band(n),eligibleN:n>=MIN_INTERNAL_PREFECTURE_N?n:null};
    })
  };

  const questionResult = await db.query<SqlRow>(`
    SELECT DISTINCT ON (q.code) q.code,q.question_type,q.analysis_key,q.config
    FROM research_questions q
    JOIN research_instruments i ON i.id=q.instrument_id
    JOIN research_studies s ON s.id=i.study_id
    WHERE s.slug='greek-retail-2026'
      AND i.wave_id=s.current_wave_id
      AND q.question_type NOT IN ('text','experiment')
    ORDER BY q.code,i.created_at DESC
  `);
  const questions: Question[] = questionResult.rows
    .filter(row => !RESTRICTED.test(String(row.code ?? "")) && !RESTRICTED.test(String(row.analysis_key ?? "")))
    .map(row => ({
      code: String(row.code), kind: String(row.question_type),
      key: String(row.analysis_key), config: object(row.config)
    }));
  const measures: Measure[] = [];

  for (const question of questions) {
    const {code, key, kind, config} = question;
    if (kind === "single" || kind === "multi") {
      const choices = pairs(config.options);
      const permitted = new Set(choices.map(([value]) => value));
      const max = Number(config.max ?? Number.POSITIVE_INFINITY);
      const responded = people.filter(person => {
        const a = person.answers[code];
        if (kind === "single") return typeof a === "string" && permitted.has(a);
        return Array.isArray(a) && a.length>0 && a.length<=max
          && a.every(value=>typeof value==="string" && permitted.has(value));
      });
      for (const [option] of choices) addMetric(measures, key + ".share." + option, "proportion",
        responded.map(person => ({person, value: kind==="single"
          ? Number(person.answers[code]===option)
          : Number((person.answers[code] as unknown[]).includes(option))})));
    } else if (kind === "scale") {
      const min=Number(config.min),max=Number(config.max);
      const observations=people.flatMap(person=>{
        const a=person.answers[code];
        if (typeof a !== "number" || !Number.isFinite(a) || a<min || a>max) return [];
        return [{person,value:a}];
      });
      addMetric(measures,key+".mean","mean",observations);
    } else if (kind === "matrix") {
      const items=pairs(config.items),choices=pairs(config.scale);
      const quantitative=choices.filter(([option])=>option!=="" && Number.isFinite(Number(option))).length>=2;
      const allowed=new Set(choices.map(([value])=>value));
      for (const [item] of items) {
        if (quantitative) {
          const observations=people.flatMap(person=>{
            const raw=object(person.answers[code])[item];
            if (raw===null || raw===undefined || raw==="") return [];
            const value=Number(raw);
            return Number.isFinite(value) && allowed.has(String(raw)) ? [{person,value}] : [];
          });
          addMetric(measures,key+"."+item+".mean","mean",observations);
        } else {
          const responded=people.filter(person=>allowed.has(String(object(person.answers[code])[item]??"")));
          for (const [option] of choices) addMetric(measures,key+"."+item+".share."+option,"proportion",
            responded.map(person=>({person,value:Number(object(person.answers[code])[item]===option)})));
        }
      }
    }
  }

  const known=new Set(["increased","stable","decreased"]);
  const comparable=people.filter(person=>{
    const financial=object(person.answers.Q21);
    return known.has(String(financial.turnover??"")) && known.has(String(financial.profitability??""));
  });
  addMetric(measures,"business_financial_divergence.share.turnover_up_profit_down","proportion",
    comparable.map(person=>({person,value:Number(object(person.answers.Q21).turnover==="increased"
      &&object(person.answers.Q21).profitability==="decreased")})));

  for (const [key, scoreKey] of [
    ["digital_readiness.mean","digitalReadinessScore"],
    ["retail_friction.mean","frictionOverallScore"],
    ["retail_confidence.mean","businessConfidenceScore"]
  ] as const) {
    addMetric(measures,key,"mean",people.flatMap(person=>{
      const score=scoreGreekRetail2026(person.answers as ResearchAnswerMap)[scoreKey];
      return typeof score==="number" && Number.isFinite(score) ? [{person,value:score}] : [];
    }));
  }

  const points: SafePublicResultPoint[]=[];
  for (const measure of measures) {
    const cohorts: Array<{segment:Record<string,string>; observations:Measure["observations"]}>=[
      {segment:{},observations:measure.observations}
    ];
    for (const dimension of ["regionCode","prefectureCode","sectorCode","sizeBand"] as const) {
      const groups=new Map<string,Measure["observations"]>();
      for (const observation of measure.observations) {
        const value=observation.person[dimension];
        if (!value || value==="unknown") continue;
        const rows=groups.get(value)??[];
        rows.push(observation);
        groups.set(value,rows);
      }
      for (const [value,observations] of groups) cohorts.push({segment:{[dimension]:value},observations});
    }
    for (const cohort of cohorts) {
      const n=cohort.observations.length;
      if (n<(cohort.segment.prefectureCode ? MIN_INTERNAL_PREFECTURE_N : MIN_CELL_N)) continue;
      const estimate=cohort.observations.reduce((sum,item)=>sum+item.value,0)/n;
      if (!Number.isFinite(estimate)) continue;
      points.push({
        metricKey:measure.metricKey,label:publicMetricLabel(measure.metricKey),
        format:measure.format,value:estimate,segment:cohort.segment,n,
        // Confidence intervals require the frozen sample design and final weights.
        ciLower:null,ciUpper:null
      });
    }
  }
  return {capturedAt:new Date().toISOString(),includedResponses:people.length,pendingQualityReview,coverage,points};
}
