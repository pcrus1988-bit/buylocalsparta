import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import { questionChoices, SECTOR_LABELS, type RelationshipChoice, type RelationshipQuestion } from "./research-geographic-relations-runtime";
import {
  aggregateDistribution, safeDistributionCounts, safeDistributionRegion,
  type SafeDistributionRegion, type SafeDistributionCounts
} from "./research-geographic-distribution-core";

export type SingleQuestionFilters = Readonly<{
  question: string; answer: string; mode: "all" | "draft" | "completed";
  phase: "main" | "pilot"; sector: string; kad: string;
}>;
export type SingleQuestionDistribution = Readonly<{
  title: string; question: RelationshipQuestion; answer: RelationshipChoice;
  questions: readonly RelationshipQuestion[];
  sectors: readonly RelationshipChoice[]; kads: readonly RelationshipChoice[];
  filters: SingleQuestionFilters;
  national: SafeDistributionCounts;
  regions: readonly SafeDistributionRegion[];
  hasUnmappedGeography: boolean;
  exactCountsAvailable: boolean;
  capturedAt: string;
}>;

const STUDY_SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const asText = (v: unknown) => v == null ? "" : String(v);
const saneParam = (v: string | undefined) => String(v ?? "").trim().slice(0, 80);

/**
 * A ONE-question query: the denominator includes all eligible saved answers
 * to this question, even if no other questionnaire question was answered.
 * No response IDs, individual answers, addresses or raw n<15 aggregates
 * are included in returned client data for research.read-only principals.
 */
export async function researchSingleQuestionDistribution(
  principal: SessionPrincipal, slug: string, input: Record<string, string | undefined>
): Promise<SingleQuestionDistribution | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !STUDY_SLUG.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const studyResult = await pool.query<SqlRow>([
    "SELECT s.id AS study_id,s.title,i.id AS instrument_id",
    "FROM research_studies s LEFT JOIN LATERAL (",
    " SELECT id FROM research_instruments WHERE study_id=s.id AND wave_id=s.current_wave_id",
    " ORDER BY CASE WHEN status='fielding' THEN 0 ELSE 1 END,created_at DESC LIMIT 1",
    ") i ON true WHERE s.slug=$1 LIMIT 1"
  ].join("\n"), [slug]);
  const study = studyResult.rows[0];
  if (!study?.instrument_id) return undefined;
  const [questionRows, sectorRows, kadRows] = await Promise.all([
    pool.query<SqlRow>([
      "SELECT code,prompt_el,question_type,config,id FROM research_questions",
      "WHERE instrument_id=$1 AND question_type IN ('single','multi','scale')",
      "ORDER BY position LIMIT 80"
    ].join("\n"), [study.instrument_id]),
    pool.query<SqlRow>([
      "SELECT DISTINCT fu.sector_code AS code FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "WHERE r.study_id=$1 AND NULLIF(fu.sector_code,'') IS NOT NULL",
      "ORDER BY 1 LIMIT 40"
    ].join("\n"), [study.study_id]),
    pool.query<SqlRow>([
      "SELECT matched.code,count(*) AS n FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "CROSS JOIN LATERAL jsonb_array_elements_text(",
      " CASE WHEN jsonb_typeof(fu.sampling_attributes->'matchedActivityCodes')='array'",
      " THEN fu.sampling_attributes->'matchedActivityCodes' ELSE '[]'::jsonb END) matched(code)",
      "WHERE r.study_id=$1 GROUP BY matched.code ORDER BY n DESC,matched.code LIMIT 100"
    ].join("\n"), [study.study_id])
  ]);
  const questions: RelationshipQuestion[] = questionRows.rows.map(row => ({
    code: asText(row.code), label: asText(row.prompt_el),
    type: row.question_type as RelationshipQuestion["type"],
    options: questionChoices(row)
  })).filter(row => row.options.length > 0);
  const question = questions.find(q => q.code === saneParam(input.question))
    ?? questions.find(q => q.code === "Q11") ?? questions[0];
  if (!question) return undefined;
  const answer = question.options.find(choice => choice.key === saneParam(input.answer))
    ?? question.options[0];
  const id = questionRows.rows.find(row => row.code === question.code)?.id;
  if (!answer || !id) return undefined;
  const sectors = sectorRows.rows.map(row => ({
    key: asText(row.code), label: SECTOR_LABELS[asText(row.code)] ?? asText(row.code)
  }));
  const kads = kadRows.rows.map(row => ({ key: asText(row.code), label: asText(row.code) }));
  const filters: SingleQuestionFilters = {
    question: question.code, answer: answer.key,
    mode: input.mode === "draft" ? "draft" : input.mode === "completed" ? "completed" : "all",
    phase: input.phase === "pilot" ? "pilot" : "main",
    sector: sectors.some(s => s.key === input.sector) ? saneParam(input.sector) : "",
    kad: kads.some(k => k.key === input.kad) ? saneParam(input.kad) : ""
  };
  const selected = await pool.query<SqlRow>([
    "WITH scoped AS (",
    " SELECT COALESCE(fu.sampling_attributes->>'prefecture','') AS prefecture,a.answer",
    " FROM research_responses r",
    " JOIN research_invites i ON i.id=r.invite_id",
    " JOIN research_sample_units su ON su.id=i.sample_unit_id",
    " JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
    " JOIN research_answers a ON a.response_id=r.id AND a.question_id=$3::uuid",
    " WHERE r.study_id=$1 AND r.instrument_id=$2",
    " AND r.status IN ('completed','in_progress') AND r.withdrawn_at IS NULL",
    " AND ($4::text='all' OR r.status=$4::text)",
    " AND i.fieldwork_phase=$5",
    " AND ($6::text='' OR fu.sector_code=$6)",
    " AND ($7::text='' OR COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb) ? $7::text)",
    " AND CASE WHEN jsonb_typeof(a.answer)='array' THEN jsonb_array_length(a.answer)>0",
    "   WHEN jsonb_typeof(a.answer)='string' THEN btrim(a.answer #>> '{}')<>''",
    "   WHEN jsonb_typeof(a.answer) IN ('number','boolean') THEN true",
    "   ELSE false END",
    ")",
    "SELECT prefecture,count(*)::integer AS answered,",
    " count(*) FILTER (WHERE CASE WHEN jsonb_typeof(answer)='array'",
    "  THEN answer ? $8::text ELSE answer #>> '{}' = $8::text END)::integer AS matched",
    " FROM scoped GROUP BY prefecture ORDER BY prefecture"
  ].join("\n"), [
    study.study_id, study.instrument_id, id,
    filters.mode === "draft" ? "in_progress" : filters.mode,
    filters.phase, filters.sector, filters.kad, answer.key
  ]);
  const aggregate = aggregateDistribution(selected.rows.map(row => ({
    prefecture: asText(row.prefecture),
    answered: Number(row.answered ?? 0), matched: Number(row.matched ?? 0)
  })));
  const exact = rawResearchAnswerAccess(principal);
  await recordAdminPersonalDataAccess(principal, {
    route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/map/distribution",
    resourceType: "research_geographic_one_question_distribution", resourceId: slug,
    purpose: "privacy_operations",
    dataClasses: ["research_structured_answers", "source_business_geography"],
    recordCount: aggregate.national.answered, accessScope: "bulk"
  });
  return {
    title: asText(study.title), question, answer, questions, sectors, kads,
    filters,
    national: safeDistributionCounts(aggregate.national, aggregate.mappedMatched, exact),
    regions: aggregate.regions.map(row => safeDistributionRegion(row, aggregate.mappedMatched, exact)),
    hasUnmappedGeography: aggregate.unknown.answered > 0,
    exactCountsAvailable: exact, capturedAt: new Date().toISOString()
  };
}
