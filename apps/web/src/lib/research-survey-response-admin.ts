import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, hasAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const RESEARCH_RESPONSE_PAGE_SIZE = 25;
export const RESEARCH_RESPONSE_EXPORT_MAX_ROWS = 50000;
export const RESEARCH_RESPONSE_STATUSES = ["in_progress", "completed", "withdrawn"] as const;
export type ResearchResponseFilter = "" | (typeof RESEARCH_RESPONSE_STATUSES)[number];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const asText = (value: unknown): string => value == null ? "" : String(value);
const asNumber = (value: unknown): number => Number(value ?? 0);
const asDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const d = new Date(String(value));
  return Number.isFinite(d.getTime()) ? d.toISOString() : undefined;
};

export type ResponseIndexRow = Readonly<{
  id: string;
  status: string;
  instrumentVersion: string;
  startedAt?: string;
  savedAt?: string;
  completedAt?: string;
  answerCount: number;
}>;
export type ResponseSummary = Readonly<{
  total: number;
  inProgress: number;
  completed: number;
  withdrawn: number;
  withAnswers: number;
  savedAnswers: number;
}>;
export type ResponseIndex = Readonly<{
  title: string;
  summary: ResponseSummary;
  rows: readonly ResponseIndexRow[];
  nextCursor?: string;
  canViewRaw: boolean;
  status: ResearchResponseFilter;
  q: string;
}>;
export type ResearchResponseAnswer = Readonly<{
  code: string;
  prompt: string;
  type: string;
  answer: unknown;
  display: string;
  answeredAt?: string;
}>;
export type ResponseDetail = Readonly<{
  title: string;
  response: ResponseIndexRow;
  answers: readonly ResearchResponseAnswer[];
  canViewRaw: boolean;
  withdrawn: boolean;
}>;

export function rawResearchAnswerAccess(principal: SessionPrincipal): boolean {
  return hasAdminPermission(principal, "research.analysis.manage")
    || hasAdminPermission(principal, "research.manage");
}

export function normalizedResearchStatus(value: string | undefined): ResearchResponseFilter {
  return RESEARCH_RESPONSE_STATUSES.includes(value as (typeof RESEARCH_RESPONSE_STATUSES)[number])
    ? value as ResearchResponseFilter : "";
}

export function responseCursor(startedAt: string | undefined, id: string): string | undefined {
  return startedAt && UUID.test(id)
    ? Buffer.from(startedAt + "|" + id).toString("base64url") : undefined;
}

function parseCursor(value?: string): { startedAt: string; id: string } | undefined {
  if (!value || value.length > 256) return undefined;
  try {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const separator = decoded.indexOf("|");
    if (separator < 0) return undefined;
    const startedAt = decoded.slice(0, separator);
    const id = decoded.slice(separator + 1);
    if (!UUID.test(id) || !Number.isFinite(Date.parse(startedAt))) return undefined;
    return { startedAt: new Date(startedAt).toISOString(), id };
  } catch { return undefined; }
}

function options(config: unknown, key: string): Map<string, string> {
  if (!config || typeof config !== "object" || Array.isArray(config)) return new Map();
  const value = (config as Record<string, unknown>)[key];
  return new Map(Array.isArray(value)
    ? value.filter((x): x is [string, string] => Array.isArray(x) && x.length >= 2)
      .map((x): [string, string] => [String(x[0]), String(x[1])])
    : []);
}

/** Friendly values from the exact questionnaire version; raw JSON remains unchanged. */
export function readableResearchAnswer(answer: unknown, config: unknown): string {
  const choices = options(config, "options");
  const rows = options(config, "items");
  const scale = options(config, "scale");
  const choice = (value: unknown) => choices.get(String(value)) ?? scale.get(String(value)) ?? String(value);
  if (answer == null) return "—";
  if (Array.isArray(answer)) return answer.map(choice).join(", ");
  if (typeof answer === "object") {
    return Object.entries(answer).map(([key, value]) =>
      (rows.get(key) ?? key) + ": " + choice(value)).join("\n");
  }
  return choice(answer);
}

/** Guard against CSV/spreadsheet formula execution, including whitespace-prefixed formulas. */
export function researchCsvCell(value: unknown): string {
  let text = asText(value);
  if (/^\s*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}

export async function listResearchResponses(
  principal: SessionPrincipal, slug: string,
  input: { status?: string; q?: string; cursor?: string }
): Promise<ResponseIndex | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id, title FROM research_studies WHERE slug=$1 LIMIT 1", [slug]);
  if (!study.rows[0]) return undefined;
  const studyId = study.rows[0].id;
  const status = normalizedResearchStatus(input.status);
  const q = (input.q ?? "").trim().slice(0, 80);
  const validId = !q || UUID.test(q);
  const cursor = parseCursor(input.cursor);

  const summary = await pool.query<SqlRow>([
    "SELECT count(*)::bigint AS total,",
    "count(*) FILTER (WHERE r.status='in_progress')::bigint AS in_progress,",
    "count(*) FILTER (WHERE r.status='completed')::bigint AS completed,",
    "count(*) FILTER (WHERE r.status='withdrawn')::bigint AS withdrawn,",
    "count(*) FILTER (WHERE EXISTS (SELECT 1 FROM research_answers a WHERE a.response_id=r.id))::bigint AS with_answers,",
    "(SELECT count(*)::bigint FROM research_answers a",
    " JOIN research_responses rr ON rr.id=a.response_id WHERE rr.study_id=$1) AS saved_answers",
    "FROM research_responses r WHERE r.study_id=$1"
  ].join("\n"), [studyId]);
  const s = summary.rows[0] ?? {};
  const stats = {
    total: asNumber(s.total), inProgress: asNumber(s.in_progress),
    completed: asNumber(s.completed), withdrawn: asNumber(s.withdrawn),
    withAnswers: asNumber(s.with_answers), savedAnswers: asNumber(s.saved_answers)
  };

  let rows: readonly SqlRow[] = [];
  if (validId) {
    const result = await pool.query<SqlRow>([
      "WITH page AS MATERIALIZED (",
      " SELECT r.id, r.status, r.started_at, r.last_saved_at, r.completed_at,",
      "        i.version AS instrument_version,",
      "        (SELECT count(*)::integer FROM research_answers a WHERE a.response_id=r.id) AS answer_count",
      " FROM research_responses r",
      " LEFT JOIN research_instruments i ON i.id=r.instrument_id",
      " WHERE r.study_id=$1 AND ($2::text IS NULL OR r.status=$2)",
      " AND ($3::uuid IS NULL OR r.id=$3::uuid)",
      " AND ($4::timestamptz IS NULL OR (r.started_at,r.id) < ($4::timestamptz,$5::uuid))",
      " ORDER BY r.started_at DESC,r.id DESC LIMIT 26",
      ") SELECT * FROM page ORDER BY started_at DESC,id DESC"
    ].join("\n"), [
      studyId, status || null, q || null, cursor?.startedAt ?? null, cursor?.id ?? null
    ]);
    rows = result.rows;
  }
  const page = rows.slice(0, RESEARCH_RESPONSE_PAGE_SIZE).map((r): ResponseIndexRow => ({
    id: asText(r.id), status: asText(r.status),
    instrumentVersion: asText(r.instrument_version),
    startedAt: asDate(r.started_at), savedAt: asDate(r.last_saved_at),
    completedAt: asDate(r.completed_at), answerCount: asNumber(r.answer_count)
  }));
  const last = page[page.length - 1];
  return {
    title: asText(study.rows[0].title), summary: stats, rows: page,
    nextCursor: rows.length > RESEARCH_RESPONSE_PAGE_SIZE && last
      ? responseCursor(last.startedAt, last.id) : undefined,
    canViewRaw: rawResearchAnswerAccess(principal), status, q
  };
}

export async function getResearchResponseDetail(
  principal: SessionPrincipal, slug: string, responseId: string
): Promise<ResponseDetail | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug) || !UUID.test(responseId)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const found = await pool.query<SqlRow>([
    "SELECT s.title, r.id, r.status, r.started_at, r.last_saved_at, r.completed_at,",
    "i.version AS instrument_version, r.instrument_id",
    "FROM research_responses r JOIN research_studies s ON s.id=r.study_id",
    "LEFT JOIN research_instruments i ON i.id=r.instrument_id",
    "WHERE s.slug=$1 AND r.id=$2::uuid LIMIT 1"
  ].join("\n"), [slug, responseId]);
  const r = found.rows[0];
  if (!r) return undefined;
  const canViewRaw = rawResearchAnswerAccess(principal);
  const withdrawn = r.status === "withdrawn";
  let answers: ResearchResponseAnswer[] = [];
  if (canViewRaw && !withdrawn) {
    const result = await pool.query<SqlRow>([
      "SELECT q.code,q.prompt_el,q.question_type,q.config,a.answer,a.answered_at",
      "FROM research_answers a",
      "JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=$2::uuid",
      "WHERE a.response_id=$1::uuid ORDER BY q.position,a.id"
    ].join("\n"), [responseId, r.instrument_id]);
    // Identity of the selected study and response was checked above.
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/responses/" + responseId,
      resourceType: "research_questionnaire_response", resourceId: responseId,
      purpose: "privacy_operations", dataClasses: ["research_question_answers"],
      recordCount: result.rows.length, accessScope: "individual"
    });
    answers = result.rows.map(row => ({
      code: asText(row.code), prompt: asText(row.prompt_el),
      type: asText(row.question_type), answer: row.answer,
      display: readableResearchAnswer(row.answer, row.config),
      answeredAt: asDate(row.answered_at)
    }));
  }
  return {
    title: asText(r.title),
    response: {
      id: asText(r.id), status: asText(r.status), instrumentVersion: asText(r.instrument_version),
      startedAt: asDate(r.started_at), savedAt: asDate(r.last_saved_at),
      completedAt: asDate(r.completed_at), answerCount: answers.length
    },
    answers, canViewRaw, withdrawn
  };
}

export async function exportResearchResponseCsv(
  principal: SessionPrincipal, slug: string, inputStatus?: string
): Promise<string | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!rawResearchAnswerAccess(principal)) throw new Error("RESEARCH_ANSWERS_FORBIDDEN");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>("SELECT id FROM research_studies WHERE slug=$1", [slug]);
  if (!study.rows[0]) return undefined;
  const status = normalizedResearchStatus(inputStatus);
  const result = await pool.query<SqlRow>([
    "SELECT r.id AS response_id, r.status, r.started_at, r.completed_at,",
    "i.version AS instrument_version, q.code, q.prompt_el,q.question_type,q.config,",
    "a.answer,a.answered_at",
    "FROM research_responses r",
    "JOIN research_answers a ON a.response_id=r.id",
    "JOIN research_questions q ON q.id=a.question_id AND q.instrument_id=r.instrument_id",
    "LEFT JOIN research_instruments i ON i.id=r.instrument_id",
    "WHERE r.study_id=$1 AND r.status <> 'withdrawn'",
    "AND ($2::text IS NULL OR r.status=$2)",
    "ORDER BY r.started_at DESC,r.id DESC,q.position,a.id LIMIT 50001"
  ].join("\n"), [study.rows[0].id, status || null]);
  if (result.rows.length > RESEARCH_RESPONSE_EXPORT_MAX_ROWS) {
    throw new Error("RESEARCH_EXPORT_TOO_LARGE");
  }
  // Audit before generating the downloadable, potentially personal data.
  await recordAdminPersonalDataAccess(principal, {
    eventType: "personal_data.exported",
    route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/responses/export",
    resourceType: "research_questionnaire_answers_export", resourceId: slug,
    purpose: "privacy_operations", dataClasses: ["research_question_answers"],
    recordCount: result.rows.length, accessScope: "bulk"
  });
  const header = [
    "response_id", "status", "started_at", "completed_at", "instrument_version",
    "question_code", "question", "answer", "answered_at"
  ];
  const data = result.rows.map(r => [
    r.response_id, r.status, asDate(r.started_at), asDate(r.completed_at), r.instrument_version,
    r.code, r.prompt_el, readableResearchAnswer(r.answer, r.config), asDate(r.answered_at)
  ].map(researchCsvCell).join(","));
  return "\uFEFF" + [header.map(researchCsvCell).join(","), ...data].join("\r\n") + "\r\n";
}
