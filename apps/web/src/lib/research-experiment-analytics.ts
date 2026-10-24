import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/**
 * Admin-only exploratory analysis of the randomized marketplace profiles.
 * This module never writes estimates, changes research answers, or feeds a public route.
 * It is deliberately independent of the locked publication analysis pipeline.
 */
export type ExperimentPhase = "main" | "pilot";
export type ExperimentMode = "completed" | "draft";
export type ExperimentAttributeLevel = Readonly<{
  attribute: string;
  level: string;
  exposed: number;
  chosen: number;
  choiceRate: number | null;
}>;
export type ExperimentAnalytics = Readonly<{
  slug: string;
  title: string;
  phase: ExperimentPhase;
  mode: ExperimentMode;
  generatedAt: string;
  lockedPlanVersion: string | null;
  lastOfficialRunStatus: string | null;
  qaPending: number;
  qaExcluded: number;
  respondents: number;
  assignedTasks: number;
  answeredTasks: number;
  chosenA: number;
  chosenB: number;
  chosenNeither: number;
  unansweredTasks: number;
  attributes: readonly ExperimentAttributeLevel[];
}>;

const VALID_SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const MIN_ATTRIBUTE_BASE = 30;
const n = (value: unknown): number => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
const t = (value: unknown): string => value == null ? "" : String(value);

/** A missing or small denominator is not evidence of a zero selection rate. */
export function experimentSelectionRate(chosen: number, exposed: number): number | null {
  if (!Number.isSafeInteger(chosen) || !Number.isSafeInteger(exposed) ||
      exposed < MIN_ATTRIBUTE_BASE || chosen < 0 || chosen > exposed) return null;
  return Math.round((chosen / exposed) * 1000) / 10;
}

export async function researchExperimentAnalytics(
  principal: SessionPrincipal,
  slug: string,
  input: { phase?: string; mode?: string }
): Promise<ExperimentAnalytics | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!VALID_SLUG.test(slug) || !productionDatabaseConfigured()) return undefined;

  const phase: ExperimentPhase = input.phase === "pilot" ? "pilot" : "main";
  const mode: ExperimentMode = input.mode === "draft" ? "draft" : "completed";
  const status = mode === "draft" ? "in_progress" : "completed";
  const pool = getAdminPostgresRuntime().sqlPool;

  const study = await pool.query<SqlRow>(
    "SELECT id,title,current_wave_id FROM research_studies WHERE slug=$1 LIMIT 1",
    [slug]
  );
  const found = study.rows[0];
  if (!found?.id || !found.current_wave_id) return undefined;
  const args = [found.id, found.current_wave_id, phase, status];

  // Last decision only: superseded QA reviews must not decide today's eligibility.
  // Pending and excluded responses do not enter provisional choice statistics.
  const cohort = [
    "FROM research_experiment_assignments e",
    "JOIN research_responses r ON r.id=e.response_id",
    "JOIN research_invites ri ON ri.id=r.invite_id",
    "LEFT JOIN LATERAL (",
    "  SELECT q.decision FROM research_response_quality_reviews q",
    "  WHERE q.response_id=r.id ORDER BY q.created_at DESC,q.id DESC LIMIT 1",
    ") quality ON true",
    "WHERE r.study_id=$1 AND r.wave_id=$2",
    "  AND ri.fieldwork_phase=$3 AND r.status=$4",
    "  AND COALESCE(quality.decision,'include')='include'"
  ].join("\n");

  const summary = await pool.query<SqlRow>([
    "SELECT count(DISTINCT e.response_id)::int AS respondents,",
    "count(*)::int AS assigned_tasks,",
    "count(*) FILTER (WHERE e.selected IN ('a','b','none'))::int AS answered_tasks,",
    "count(*) FILTER (WHERE e.selected='a')::int AS chosen_a,",
    "count(*) FILTER (WHERE e.selected='b')::int AS chosen_b,",
    "count(*) FILTER (WHERE e.selected='none')::int AS chosen_neither,",
    "count(*) FILTER (WHERE e.selected IS NULL)::int AS unanswered_tasks",
    cohort
  ].join("\n"), args);
  const counts = summary.rows[0] ?? {};

  // Marginal descriptive rates by *offered* attribute level, not preference
  // shares among all selected offers. Both profiles count as exposures, while
  // 'neither' contributes two unchosen exposures. Do not interpret causally.
  const levels = await pool.query<SqlRow>([
    "WITH tasks AS (",
    "SELECT e.selected,e.alternative_a,e.alternative_b",
    cohort,
    "AND e.selected IN ('a','b','none')",
    ")",
    "SELECT attrs.key AS attribute, attrs.value AS level,",
    "count(*)::int AS exposed,",
    "count(*) FILTER (WHERE offered.chosen)::int AS chosen",
    "FROM tasks t",
    "CROSS JOIN LATERAL (VALUES",
    "  (t.alternative_a,t.selected='a'),",
    "  (t.alternative_b,t.selected='b')",
    ") offered(profile,chosen)",
    "CROSS JOIN LATERAL jsonb_each_text(offered.profile) attrs(key,value)",
    "GROUP BY attrs.key,attrs.value",
    "ORDER BY attrs.key,attrs.value",
    "LIMIT 200"
  ].join("\n"), args);

  // Status of quality review and official analysis are displayed separately.
  // This page never starts a run or treats pilot/draft figures as final.
  const readiness = await pool.query<SqlRow>([
    "WITH cohort AS (",
    "SELECT r.id FROM research_responses r",
    "JOIN research_invites i ON i.id=r.invite_id",
    "WHERE r.study_id=$1 AND r.wave_id=$2 AND i.fieldwork_phase=$3",
    "AND r.status='completed'",
    "), latest AS (",
    "SELECT c.id, q.decision FROM cohort c",
    "LEFT JOIN LATERAL (",
    " SELECT decision FROM research_response_quality_reviews",
    " WHERE response_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1",
    ") q ON true",
    ") SELECT",
    "count(*) FILTER (WHERE decision='review')::int AS qa_pending,",
    "count(*) FILTER (WHERE decision='exclude')::int AS qa_excluded,",
    "(SELECT version FROM research_analysis_plans",
    " WHERE study_id=$1 AND wave_id=$2 AND status='locked'",
    " ORDER BY locked_at DESC LIMIT 1) AS locked_plan_version,",
    "(SELECT status FROM research_analysis_runs",
    " WHERE study_id=$1 AND wave_id=$2",
    " ORDER BY created_at DESC LIMIT 1) AS last_run_status",
    "FROM latest"
  ].join("\n"), [found.id, found.current_wave_id, phase]);
  const qa = readiness.rows[0] ?? {};

  await recordAdminPersonalDataAccess(principal, {
    route: "/admin/research/surveys/" + encodeURIComponent(slug) + "/analytics",
    resourceType: "research_experiment_aggregate",
    resourceId: slug,
    purpose: "privacy_operations",
    dataClasses: ["research_experiment_assignments"],
    recordCount: n(counts.assigned_tasks),
    accessScope: "bulk"
  });

  return {
    slug, title: t(found.title), phase, mode, generatedAt: new Date().toISOString(),
    lockedPlanVersion: qa.locked_plan_version == null ? null : t(qa.locked_plan_version),
    lastOfficialRunStatus: qa.last_run_status == null ? null : t(qa.last_run_status),
    qaPending: n(qa.qa_pending), qaExcluded: n(qa.qa_excluded),
    respondents: n(counts.respondents),
    assignedTasks: n(counts.assigned_tasks),
    answeredTasks: n(counts.answered_tasks),
    chosenA: n(counts.chosen_a),
    chosenB: n(counts.chosen_b),
    chosenNeither: n(counts.chosen_neither),
    unansweredTasks: n(counts.unanswered_tasks),
    attributes: levels.rows.map((row) => ({
      attribute: t(row.attribute), level: t(row.level),
      exposed: n(row.exposed), chosen: n(row.chosen),
      choiceRate: experimentSelectionRate(n(row.chosen), n(row.exposed))
    }))
  };
}
