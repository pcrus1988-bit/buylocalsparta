import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { summarizeResearchPostcodeCells, resolveResearchAdministrativeGeography } from "./research-postcode-geography";
import { GREECE_PREFECTURES } from "./research-prefectures";
import { researchSectorLabel } from "./research-sector-labels";

type Choice = Readonly<{ key: string; label: string }>;
type Question = Readonly<{ code: string; label: string; type: string; options: readonly Choice[] }>;
export type ResearchMapFilters = Readonly<{
  mode: "all" | "completed" | "draft"; phase: "main" | "pilot";
  metric: "density" | "share"; question: string; answer: string;
  sector: string; kad: string; prefecture: string; municipality: string;
  region: string;
}>;
export type ResearchGeographicDashboard = Readonly<{
  title: string;
  capturedAt: string;
  filters: ResearchMapFilters;
  questions: readonly Question[];
  sectors: readonly Choice[];
  kads: readonly Choice[];
  prefectureOptions: readonly Choice[];
  municipalities: readonly Choice[];
  regions: ReturnType<typeof summarizeResearchPostcodeCells>["regions"];
  prefectures: ReturnType<typeof summarizeResearchPostcodeCells>["prefectures"];
  unresolved: number;
  total: number;
  answered: number;
  selected: number;
}>;

const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const clean = (input?: string, max = 120) => (input ?? "").slice(0, max).trim();
const text = (v: unknown) => v == null ? "" : String(v);
const integer = (v: unknown) => Number(v ?? 0) || 0;
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const pairs = (value: unknown): Choice[] =>
  Array.isArray(value) ? value.flatMap(item =>
    Array.isArray(item) && item.length >= 2 ? [{ key: String(item[0]), label: String(item[1]) }] : []) : [];

function questionChoices(row: SqlRow): Choice[] {
  const cfg = obj(row.config);
  if (row.question_type !== "scale") return pairs(cfg.options);
  const min = Number(cfg.min ?? 1), max = Number(cfg.max ?? 5), step = Number(cfg.step ?? 1);
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(step) || step <= 0 || max < min || (max - min) / step > 20) return [];
  return Array.from({ length: Math.floor((max - min) / step) + 1 },
    (_, i) => ({ key: String(min + i * step), label: String(min + i * step) }));
}

/**
 * Read-only, privileged server aggregate; never sends response IDs, e-mails,
 * addresses, unstructured text, tokens or other respondent-level data to UI.
 * Business location comes from the *GEMI frozen frame*, not GPS/geolocation
 * of the individual respondent. Withheld/withdrawn responses are excluded.
 */
export async function researchGeographicMap(
  principal: SessionPrincipal, slug: string, input: Record<string, string | undefined>
): Promise<ResearchGeographicDashboard | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>([
    "SELECT s.id AS study_id,s.title,i.id AS instrument_id",
    "FROM research_studies s LEFT JOIN LATERAL (",
    " SELECT id FROM research_instruments WHERE study_id=s.id AND wave_id=s.current_wave_id",
    " ORDER BY CASE WHEN status='fielding' THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
    ") i ON true WHERE s.slug=$1 LIMIT 1"
  ].join("\n"), [slug]);
  const st = study.rows[0];
  if (!st?.instrument_id) return undefined;
  const mode = input.mode === "draft" ? "draft" : "completed";
  const phase = input.phase === "pilot" ? "pilot" : "main";
  const metric = input.metric === "share" ? "share" : "density";

  const [qResult, sectorsResult, municipalityResult, kadResult] = await Promise.all([
    pool.query<SqlRow>([
      "SELECT id,code,prompt_el,question_type,config FROM research_questions",
      "WHERE instrument_id=$1 AND question_type IN ('single','multi','scale')",
      "ORDER BY position LIMIT 80"
    ].join("\n"), [st.instrument_id]),
    pool.query<SqlRow>([
      "SELECT DISTINCT fu.sector_code AS value FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "WHERE r.study_id=$1 AND NULLIF(fu.sector_code,'') IS NOT NULL ORDER BY 1 LIMIT 40"
    ].join("\n"), [st.study_id]),
    pool.query<SqlRow>([
      "SELECT DISTINCT fu.sampling_attributes->>'municipalityId' AS value,",
      " fu.sampling_attributes->>'municipality' AS label FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "WHERE r.study_id=$1 AND NULLIF(fu.sampling_attributes->>'municipalityId','') IS NOT NULL",
      "ORDER BY 2,1 LIMIT 250"
    ].join("\n"), [st.study_id]),
    pool.query<SqlRow>([
      "SELECT matched_kad.code, count(*) n FROM research_responses r",
      "JOIN research_invites i ON i.id=r.invite_id",
      "JOIN research_sample_units su ON su.id=i.sample_unit_id",
      "JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
      "CROSS JOIN LATERAL jsonb_array_elements_text(",
      "CASE WHEN jsonb_typeof(fu.sampling_attributes->'matchedActivityCodes')='array'",
      "THEN fu.sampling_attributes->'matchedActivityCodes' ELSE '[]'::jsonb END) AS matched_kad(code)",
      "WHERE r.study_id=$1 GROUP BY matched_kad.code ORDER BY n DESC, matched_kad.code LIMIT 80"
    ].join("\n"), [st.study_id])
  ]);

  const availableQuestions: Question[] = qResult.rows.map(row => ({
    code: text(row.code), label: text(row.prompt_el), type: text(row.question_type),
    options: questionChoices(row)
  })).filter(q => q.options.length > 0);
  const requestedQuestion = clean(input.question, 16);
  const question = availableQuestions.find(q => q.code === requestedQuestion)
    ?? availableQuestions.find(q => q.code === "Q19") ?? availableQuestions[0];
  const answer = question?.options.find(o => o.key === clean(input.answer, 80))?.key
    ?? (question?.code === "Q19" ? question.options.find(o => o.key === "pessimistic")?.key : undefined)
    ?? question?.options[0]?.key ?? "";
  const chosenQuestionId = text(qResult.rows.find(row => row.code === question?.code)?.id);
  const sectors = sectorsResult.rows.map(row => ({ key: text(row.value), label: researchSectorLabel(text(row.value)) }));
  const prefectureOptions = GREECE_PREFECTURES.map(row=>({key:row.key,label:row.label}));
  const municipalities = municipalityResult.rows.map(row => ({ key: text(row.value), label: text(row.label) || text(row.value) }));
  const kads = kadResult.rows.map(row => ({ key: text(row.code), label: text(row.code) }));
  const sector = sectors.some(s => s.key === input.sector) ? clean(input.sector) : "";
  const kad = kads.some(k => k.key === input.kad) ? clean(input.kad) : "";
  const prefecture = prefectureOptions.some(p => p.key === input.prefecture) ? clean(input.prefecture) : "";
  const municipality = municipalities.some(m => m.key === input.municipality) ? clean(input.municipality) : "";
  const region = clean(input.region, 50);
  const rows = await pool.query<SqlRow>([
    "WITH base AS (",
    " SELECT r.id,COALESCE(fu.sampling_attributes->>'prefecture','') AS prefecture, COALESCE(fu.sampling_attributes->>'postcode','') AS postcode",
    " FROM research_responses r",
    " JOIN research_invites i ON i.id=r.invite_id",
    " JOIN research_sample_units su ON su.id=i.sample_unit_id",
    " JOIN research_frame_units fu ON fu.id=su.frame_unit_id",
    " WHERE r.study_id=$1 AND r.instrument_id=$2 AND r.status=$3",
    " AND r.withdrawn_at IS NULL AND i.fieldwork_phase=$4",
    " AND ($5::text='' OR fu.sector_code=$5)",
    " AND ($6::text='' OR COALESCE(fu.sampling_attributes->>'prefecture','')=$6)",
    " AND ($7::text='' OR COALESCE(fu.sampling_attributes->'matchedActivityCodes','[]'::jsonb) ? $7::text)",
    " AND ($8::text='' OR fu.sampling_attributes->>'municipalityId'=$8)",
    ")",
    "SELECT b.prefecture,b.postcode,count(*)::integer AS respondents,",
    "count(a.answer)::integer AS answered,",
    "count(a.answer) FILTER (WHERE (",
    "CASE WHEN jsonb_typeof(a.answer)='array' THEN a.answer ? $10::text",
    "ELSE a.answer #>> '{}' = $10::text END))::integer AS selected",
    "FROM base b LEFT JOIN research_answers a ON a.response_id=b.id AND a.question_id=$9::uuid",
    "GROUP BY b.prefecture,b.postcode ORDER BY respondents DESC"
  ].join("\n"), [
    st.study_id, st.instrument_id, mode === "draft" ? "in_progress" : "completed", phase,
    sector, "", kad, municipality, chosenQuestionId || null, answer
  ]);
  const aggregated = rows.rows.map(row => ({
    prefecture: text(row.prefecture), postcode: text(row.postcode), respondents: integer(row.respondents),
    answered: integer(row.answered), selected: integer(row.selected)
  }));
  // Geography filters are applied AFTER postcode resolution, not against an
  // occasionally incorrect historical GEMI prefecture string.
  const assigned=aggregated.filter(row=>!prefecture ||
    resolveResearchAdministrativeGeography(row.postcode,row.prefecture).prefectureCode===prefecture);
  const mapped = summarizeResearchPostcodeCells(assigned);
  const filters: ResearchMapFilters = {
    mode, phase, metric, question: question?.code ?? "", answer,
    sector, kad, prefecture, municipality, region
  };
  await recordAdminPersonalDataAccess(principal, {
    route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/map",
    resourceType: "research_geographic_aggregate", resourceId: slug,
    purpose: "privacy_operations",
    dataClasses: ["research_structured_answers", "source_business_geography"],
    recordCount: aggregated.reduce((n, row) => n + row.respondents, 0),
    accessScope: "bulk"
  });
  return {
    title: text(st.title), capturedAt: new Date().toISOString(), filters,
    questions: availableQuestions, sectors, prefectureOptions, municipalities, kads,
    regions: mapped.regions, prefectures: mapped.prefectures, unresolved: mapped.unresolved,
    total: assigned.reduce((n, row) => n + row.respondents, 0),
    answered: assigned.reduce((n, row) => n + row.answered, 0),
    selected: assigned.reduce((n, row) => n + row.selected, 0)
  };
}
