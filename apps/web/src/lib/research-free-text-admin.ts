import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { rawResearchAnswerAccess } from "./research-survey-response-admin";
import {
  RESEARCH_FREE_TEXT_CATEGORIES, RESEARCH_FREE_TEXT_OTHER,
  type ResearchFreeTextCategory
} from "./research-free-text-categories";

export const RESEARCH_FREE_TEXT_PAGE_SIZE = 25;
const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const categoryKeys = new Set<string>([
  ...RESEARCH_FREE_TEXT_CATEGORIES.map(c => c.key), RESEARCH_FREE_TEXT_OTHER.key
]);

export type ResearchFreeTextRow = Readonly<{
  answerId: number;
  responseId: string;
  status: "completed" | "in_progress";
  questionCode: string;
  question: string;
  text: string;
  answeredAt: string;
  categories: readonly ResearchFreeTextCategory[];
}>;

export type ResearchFreeTextExplorer = Readonly<{
  title: string;
  rows: readonly ResearchFreeTextRow[];
  scopedTotal: number;
  matchingTotal: number;
  facets: readonly Readonly<{ key: ResearchFreeTextCategory; count: number }>[];
  questions: readonly Readonly<{ code: string; prompt: string; count: number }>[];
  filters: Readonly<{
    category: string;
    question: string;
    status: string;
    search: string;
    page: number;
  }>;
  pageSize: number;
}>;

function safeDate(value: unknown): string {
  const d = new Date(String(value ?? ""));
  return Number.isFinite(d.getTime()) ? d.toISOString() : "";
}
function safeArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> =>
    Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}
function validatedPage(value?: string): number {
  const n = Number(value);
  return Number.isSafeInteger(n) && n >= 1 && n <= 10000 ? n : 1;
}
export function normalizeResearchFreeTextFilters(input: {
  category?: string; question?: string; status?: string; q?: string; page?: string;
}) {
  return {
    category: categoryKeys.has(input.category ?? "") ? input.category! : "",
    question: /^[a-z0-9_-]{1,24}$/i.test(input.question ?? "") ? input.question! : "",
    status: ["in_progress", "completed"].includes(input.status ?? "") ? input.status! : "",
    search: (input.q ?? "").trim().slice(0, 120),
    page: validatedPage(input.page)
  };
}

// Only fixed, source-controlled regexes are interpolated. All user filter values
// are parameterized, and every non-empty text answer gets at least one category.
function sqlClassificationCases(): string {
  return RESEARCH_FREE_TEXT_CATEGORIES.map(c => {
    if (!/^[a-z_]+$/.test(c.key) || /['\\]/.test(c.pattern)) {
      throw new Error("RESEARCH_FREE_TEXT_UNSAFE_PATTERN");
    }
    return `CASE WHEN normalized_text ~ '${c.pattern}' THEN '${c.key}'::text ELSE NULL END`;
  }).join(",\n        ");
}

const QUERY = `
  WITH raw AS MATERIALIZED (
    SELECT a.id AS answer_id, r.id AS response_id, r.status,
           q.code AS question_code, q.prompt_el AS question,
           a.answered_at, btrim(a.answer #>> '{}') AS answer_text,
           translate(lower(a.answer #>> '{}'),
             'άέήίόύώϊϋΐΰ', 'αεηιουωιυιυ') AS normalized_text
    FROM research_answers a
    JOIN research_responses r ON r.id=a.response_id
    JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=r.instrument_id
    WHERE r.study_id=$1::uuid
      AND r.status IN ('in_progress','completed')
      AND q.question_type IN ('text','textarea','open_text','free_text')
      AND jsonb_typeof(a.answer)='string'
      AND length(btrim(a.answer #>> '{}')) > 0
  ),
  categorized AS MATERIALIZED (
    SELECT raw.*,
      COALESCE(
        NULLIF(array_remove(ARRAY[
          ${sqlClassificationCases()}
        ]::text[], NULL), ARRAY[]::text[]),
        ARRAY['other']::text[]
      ) AS categories
    FROM raw
  ),
  scoped AS MATERIALIZED (
    SELECT * FROM categorized
    WHERE ($2::text IS NULL OR status=$2)
      AND ($3::text IS NULL OR question_code=$3)
      AND ($4::text IS NULL OR strpos(lower(answer_text), lower($4))>0)
  ),
  matched AS MATERIALIZED (
    SELECT * FROM scoped WHERE ($5::text IS NULL OR $5=ANY(categories))
  ),
  facets AS (
    SELECT x.category, COUNT(*)::integer AS n
    FROM scoped CROSS JOIN LATERAL unnest(categories) AS x(category)
    GROUP BY x.category
  ),
  question_facets AS (
    SELECT question_code AS code, question AS prompt, COUNT(*)::integer AS n
    FROM scoped GROUP BY question_code, question
  ),
  page_rows AS (
    SELECT answer_id,response_id,status,question_code,question,answer_text,
           answered_at,categories
    FROM matched ORDER BY answered_at DESC NULLS LAST,answer_id DESC
    LIMIT ${RESEARCH_FREE_TEXT_PAGE_SIZE} OFFSET $6::integer
  )
  SELECT
    (SELECT COUNT(*)::integer FROM scoped) AS scoped_total,
    (SELECT COUNT(*)::integer FROM matched) AS matching_total,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('key',category,'count',n)), '[]'::jsonb)
       FROM facets) AS facets,
    (SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'prompt',prompt,'count',n)), '[]'::jsonb)
       FROM question_facets) AS questions,
    (SELECT COALESCE(jsonb_agg(to_jsonb(p)), '[]'::jsonb) FROM page_rows p) AS rows
`;

/** A single read-only, paged, audited query; never returns withdrawn responses. */
export async function listResearchFreeText(
  principal: SessionPrincipal, slug: string,
  input: { category?: string; question?: string; status?: string; q?: string; page?: string }
): Promise<ResearchFreeTextExplorer | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!rawResearchAnswerAccess(principal)) throw new Error("RESEARCH_ANSWERS_FORBIDDEN");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id,title FROM research_studies WHERE slug=$1 LIMIT 1", [slug]);
  if (!study.rows[0]) return undefined;
  const filters = normalizeResearchFreeTextFilters(input);
  const result = await pool.query<SqlRow>(QUERY, [
    study.rows[0].id, filters.status || null, filters.question || null,
    filters.search || null, filters.category || null,
    (filters.page - 1) * RESEARCH_FREE_TEXT_PAGE_SIZE
  ]);
  const data = result.rows[0] ?? {};
  const rows: ResearchFreeTextRow[] = safeArray(data.rows).map(row => ({
    answerId: Number(row.answer_id),
    responseId: String(row.response_id ?? ""),
    status: String(row.status) === "completed" ? "completed" : "in_progress",
    questionCode: String(row.question_code ?? ""),
    question: String(row.question ?? ""),
    text: String(row.answer_text ?? ""),
    answeredAt: safeDate(row.answered_at),
    categories: (Array.isArray(row.categories) ? row.categories : [])
      .filter((key): key is ResearchFreeTextCategory => typeof key === "string" && categoryKeys.has(key))
  }));
  if (rows.length > 0) {
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/responses/free-text",
      resourceType: "research_free_text_answers", resourceId: slug,
      purpose: "privacy_operations", dataClasses: ["research_open_text_answers"],
      recordCount: rows.length, accessScope: "bulk"
    });
  }
  return {
    title: String(study.rows[0].title ?? slug),
    rows,
    scopedTotal: Number(data.scoped_total ?? 0),
    matchingTotal: Number(data.matching_total ?? 0),
    facets: safeArray(data.facets)
      .filter(f => categoryKeys.has(String(f.key)))
      .map(f => ({ key: String(f.key) as ResearchFreeTextCategory, count: Number(f.count ?? 0) })),
    questions: safeArray(data.questions)
      .map(q => ({ code: String(q.code ?? ""), prompt: String(q.prompt ?? ""), count: Number(q.count ?? 0) })),
    filters,
    pageSize: RESEARCH_FREE_TEXT_PAGE_SIZE
  };
}
