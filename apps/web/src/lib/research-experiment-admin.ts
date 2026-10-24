import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/** EXP01 contains private commercial-choice research. Restrict it to research/platform superadmins. */
export function canViewPrivateResearchExperiment(
  principal: Pick<SessionPrincipal, "roles"> | undefined
): boolean {
  return Boolean(principal?.roles.some((role) => role === "super_admin" || role === "research_superadmin"));
}

export type PrivateExperimentScope = "completed" | "approved";

export type PrivateExperimentAttribute = Readonly<{
  attribute: string;
  level: string;
  offered: number;
  chosen: number;
}>;

export type PrivateExperimentTaskChoice = Readonly<{
  task_number: number;
  selection: "a" | "b" | "none" | "unanswered";
  count: number;
}>;

export type PrivateExperimentSummary = Readonly<{
  respondents: number;
  tasks: number;
  a: number;
  b: number;
  none: number;
  unanswered: number;
  taskChoices: PrivateExperimentTaskChoice[];
  attributes: PrivateExperimentAttribute[];
  pricingPairs: ReadonlyArray<Readonly<{commission: number; monthlyFee: number; chosen: number}>>;
  scope: PrivateExperimentScope;
}>;

export async function privateResearchExperimentSummary(
  principal: SessionPrincipal,
  slug: string,
  scope: PrivateExperimentScope
): Promise<PrivateExperimentSummary> {
  if (!canViewPrivateResearchExperiment(principal)) throw new Error("PRIVATE_EXPERIMENT_ACCESS_DENIED");
  if (!productionDatabaseConfigured()) throw new Error("RESEARCH_DATABASE_UNAVAILABLE");
  if (slug !== "greek-retail-2026") throw new Error("PRIVATE_EXPERIMENT_STUDY_UNSUPPORTED");
  if (scope !== "completed" && scope !== "approved") throw new Error("PRIVATE_EXPERIMENT_SCOPE_INVALID");

  // Only bounded aggregate results cross the database-to-UI boundary:
  // no response IDs, contact details, raw submissions, or respondent-level profile lists.
  const result = await getAdminPostgresRuntime().sqlPool.query<SqlRow>(`
    WITH filtered AS MATERIALIZED (
      SELECT e.response_id,e.task_number,e.selected,e.alternative_a,e.alternative_b
      FROM public.research_experiment_assignments e
      JOIN public.research_responses r ON r.id=e.response_id
      JOIN public.research_studies s ON s.id=r.study_id
      LEFT JOIN public.research_invites ri ON ri.id=r.invite_id
      LEFT JOIN LATERAL (
        SELECT q.decision
        FROM public.research_response_quality_reviews q
        WHERE q.response_id=r.id
        ORDER BY q.created_at DESC,q.id DESC LIMIT 1
      ) quality ON true
      WHERE s.slug=$1
        AND e.experiment_code='EXP01'
        AND r.status='completed'
        AND ($2::text='completed' OR (
          ri.fieldwork_phase='main' AND quality.decision='include'
        ))
    ),
    chosen_profiles AS (
      SELECT CASE WHEN selected='a' THEN alternative_a
                  WHEN selected='b' THEN alternative_b
                  ELSE NULL END AS chosen
      FROM filtered
    ),
    pricing_pairs AS (
      SELECT (chosen->>'commission_pct')::int AS commission,
             (chosen->>'monthly_fee_eur')::int AS monthly_fee,
             count(*)::int AS chosen
      FROM chosen_profiles
      WHERE chosen IS NOT NULL
      GROUP BY 1,2
    ),
    exposures AS (
      SELECT f.selected,profile.side,a.key AS attribute,a.value AS level
      FROM filtered f
      CROSS JOIN LATERAL (VALUES ('a',f.alternative_a),('b',f.alternative_b)) profile(side,details)
      CROSS JOIN LATERAL jsonb_each_text(profile.details) a(key,value)
    ),
    attributes AS (
      SELECT attribute,level,count(*)::int AS offered,
             count(*) FILTER(WHERE side=selected)::int AS chosen
      FROM exposures GROUP BY attribute,level
    )
    SELECT
      (SELECT count(DISTINCT response_id)::int FROM filtered) AS respondents,
      (SELECT count(*)::int FROM filtered) AS tasks,
      (SELECT count(*)::int FROM filtered WHERE selected='a') AS a,
      (SELECT count(*)::int FROM filtered WHERE selected='b') AS b,
      (SELECT count(*)::int FROM filtered WHERE selected='none') AS none,
      (SELECT count(*)::int FROM filtered WHERE selected IS NULL) AS unanswered,
      (SELECT coalesce(jsonb_agg(row_to_json(t) ORDER BY task_number,selection),'[]'::jsonb)
       FROM (SELECT task_number,coalesce(selected,'unanswered') AS selection,
                    count(*)::int AS count FROM filtered GROUP BY 1,2) t
      ) AS task_choices,
      (SELECT coalesce(jsonb_agg(row_to_json(a) ORDER BY attribute,level),'[]'::jsonb)
       FROM attributes a) AS attributes,
      (SELECT coalesce(jsonb_agg(row_to_json(p) ORDER BY commission,monthly_fee),'[]'::jsonb)
       FROM pricing_pairs p) AS pricing_pairs
  `, [slug, scope]);

  const row = result.rows[0] ?? {};
  const nonnegative = (value: unknown) => Math.max(0, Number(value) || 0);
  const taskChoices = Array.isArray(row.task_choices) ? row.task_choices : [];
  const attributes = Array.isArray(row.attributes) ? row.attributes : [];
  const pricingPairs = Array.isArray(row.pricing_pairs) ? row.pricing_pairs : [];
  return {
    respondents: nonnegative(row.respondents),
    tasks: nonnegative(row.tasks),
    a: nonnegative(row.a),
    b: nonnegative(row.b),
    none: nonnegative(row.none),
    unanswered: nonnegative(row.unanswered),
    taskChoices: taskChoices.map((item: Record<string, unknown>) => ({
      task_number: nonnegative(item.task_number),
      selection: String(item.selection) as PrivateExperimentTaskChoice["selection"],
      count: nonnegative(item.count)
    })),
    pricingPairs: pricingPairs.map((item: Record<string, unknown>) => ({
      commission: nonnegative(item.commission),
      monthlyFee: nonnegative(item.monthly_fee),
      chosen: nonnegative(item.chosen)
    })),
    attributes: attributes.map((item: Record<string, unknown>) => ({
      attribute: String(item.attribute),
      level: String(item.level),
      offered: nonnegative(item.offered),
      chosen: nonnegative(item.chosen)
    })),
    scope
  };
}
