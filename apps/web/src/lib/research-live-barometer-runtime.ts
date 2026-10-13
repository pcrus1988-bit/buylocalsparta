import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {
  buildLiveBarometer, type BarometerAggregate, type BarometerObservation, type BarometerQuestion
} from "./research-live-barometer-core";

export type BarometerMode = "draft" | "completed";
export type BarometerPhase = "main" | "pilot";
export const BAROMETER_MAX_CASES = 3000;

export function barometerMode(value?: string): BarometerMode {
  return value === "completed" ? "completed" : "draft";
}
export function barometerPhase(value?: string): BarometerPhase {
  return value === "pilot" ? "pilot" : "main";
}
export type ResearchBarometerDashboard = Readonly<{
  slug: string;
  title: string;
  capturedAt: string;
  instrumentVersion: string;
  mode: BarometerMode;
  phase: BarometerPhase;
  statuses: Readonly<{ drafts: number; completed: number; withdrawn: number; withAnswers: number; answerRows: number }>;
  selectedCount: number;
  eligibleCount: number;
  truncated: boolean;
  trend: readonly Readonly<{ day: string; started: number }>[];
  metrics: BarometerAggregate;
}>;

const txt = (v: unknown): string => v == null ? "" : String(v);
const num = (v: unknown): number => Number(v ?? 0);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;

/**
 * Reads a bounded group of current-version responses using only structured
 * answers. Text and experiment payloads stay inside the database.
 * Unweighted/saved-draft statistics are NEVER persisted as official results.
 */
export async function researchLiveBarometer(
  principal: SessionPrincipal, slug: string, input: { mode?: string; phase?: string }
): Promise<ResearchBarometerDashboard | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const mode = barometerMode(input.mode);
  const phase = barometerPhase(input.phase);
  const status = mode === "draft" ? "in_progress" : "completed";
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>([
    "SELECT s.id AS study_id,s.slug,s.title,",
    "i.id AS instrument_id,i.version AS instrument_version",
    "FROM research_studies s",
    "LEFT JOIN LATERAL (",
    " SELECT id,version FROM research_instruments",
    " WHERE study_id=s.id AND wave_id=s.current_wave_id",
    " ORDER BY CASE WHEN status='fielding' THEN 0 ELSE 1 END, created_at DESC LIMIT 1",
    ") i ON true WHERE s.slug=$1 LIMIT 1"
  ].join("\n"), [slug]);
  const st = study.rows[0];
  if (!st || !st.instrument_id) return undefined;

  const summary = await pool.query<SqlRow>([
    "SELECT",
    "count(*) FILTER (WHERE r.status='in_progress')::bigint AS drafts,",
    "count(*) FILTER (WHERE r.status='completed')::bigint AS completed,",
    "count(*) FILTER (WHERE r.status='withdrawn')::bigint AS withdrawn,",
    "count(*) FILTER (WHERE r.status=$3 AND EXISTS",
    " (SELECT 1 FROM research_answers a WHERE a.response_id=r.id))::bigint AS with_answers,",
    "(SELECT count(*)::bigint FROM research_answers a",
    " JOIN research_responses rr ON rr.id=a.response_id",
    " JOIN research_invites ri ON ri.id=rr.invite_id",
    " WHERE rr.study_id=$1 AND rr.instrument_id=$2",
    " AND ri.fieldwork_phase=$4 AND rr.status=$3) AS answer_rows",
    "FROM research_responses r",
    "JOIN research_invites i ON i.id=r.invite_id",
    "WHERE r.study_id=$1 AND r.instrument_id=$2 AND i.fieldwork_phase=$4"
  ].join("\n"), [st.study_id, st.instrument_id, status, phase]);
  const stats = summary.rows[0] ?? {};
  const eligibleCount = status === "completed" ? num(stats.completed) : num(stats.drafts);
  const statuses = {
    drafts: num(stats.drafts), completed: num(stats.completed),
    withdrawn: num(stats.withdrawn), withAnswers: num(stats.with_answers), answerRows: num(stats.answer_rows)
  };

  const [questionRows, selection, daily] = await Promise.all([
    pool.query<SqlRow>([
      "SELECT code, prompt_el,section_code,question_type,config",
      "FROM research_questions WHERE instrument_id=$1",
      "ORDER BY position,code LIMIT 200"
    ].join("\n"), [st.instrument_id]),
    pool.query<SqlRow>([
      "SELECT r.id,r.started_at,r.last_saved_at",
      "FROM research_responses r JOIN research_invites i ON i.id=r.invite_id",
      "WHERE r.study_id=$1 AND r.instrument_id=$2 AND r.status=$3",
      "AND i.fieldwork_phase=$4",
      "ORDER BY COALESCE(r.last_saved_at,r.started_at) DESC,r.id DESC",
      "LIMIT $5"
    ].join("\n"), [st.study_id, st.instrument_id, status, phase, BAROMETER_MAX_CASES + 1]),
    pool.query<SqlRow>([
      "SELECT (r.started_at AT TIME ZONE 'Europe/Athens')::date::text AS day,",
      "count(*)::integer AS started",
      "FROM research_responses r JOIN research_invites i ON i.id=r.invite_id",
      "WHERE r.study_id=$1 AND r.instrument_id=$2 AND r.status=$3",
      "AND i.fieldwork_phase=$4",
      "AND r.started_at >= now() - INTERVAL '14 days'",
      "GROUP BY 1 ORDER BY 1"
    ].join("\n"), [st.study_id, st.instrument_id, status, phase])
  ]);

  const questions: BarometerQuestion[] = questionRows.rows.map(q => ({
    code: txt(q.code), prompt: txt(q.prompt_el), section: txt(q.section_code),
    type: txt(q.question_type), config: obj(q.config)
  }));
  const sliced = selection.rows.slice(0, BAROMETER_MAX_CASES);
  const records = new Map<string, { id: string; startedAt: string; answers: Record<string, unknown> }>();
  for (const row of sliced) records.set(txt(row.id), {
    id: txt(row.id), startedAt: txt(row.started_at), answers: {}
  });

  if (sliced.length) {
    const detail = await pool.query<SqlRow>([
      "SELECT a.response_id,q.code,a.answer",
      "FROM research_answers a JOIN research_questions q ON q.id=a.question_id",
      "WHERE a.response_id=ANY($1::uuid[]) AND q.instrument_id=$2",
      "AND q.question_type IN ('single','multi','scale','matrix')",
      "ORDER BY a.id"
    ].join("\n"), [sliced.map(r => txt(r.id)), st.instrument_id]);
    for (const row of detail.rows) {
      const found = records.get(txt(row.response_id));
      if (found) found.answers[txt(row.code)] = row.answer;
    }
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/barometer",
      resourceType: "research_descriptive_aggregate", resourceId: slug,
      purpose: "privacy_operations",
      dataClasses: ["research_structured_answers"],
      recordCount: records.size, accessScope: "bulk"
    });
  }

  return {
    slug, title: txt(st.title), capturedAt: new Date().toISOString(),
    instrumentVersion: txt(st.instrument_version), mode, phase,
    statuses, selectedCount: sliced.length, eligibleCount,
    truncated: selection.rows.length > BAROMETER_MAX_CASES,
    trend: daily.rows.map(row => ({ day: txt(row.day), started: num(row.started) })),
    metrics: buildLiveBarometer(questions, [...records.values()] as BarometerObservation[])
  };
}
