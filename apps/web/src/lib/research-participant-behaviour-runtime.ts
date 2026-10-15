import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission } from "./admin-runtime";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

/**
 * Operational behaviour analytics, never official research estimates.
 * Aggregation takes place entirely inside Postgres: no identifiers, answers,
 * tokens, addresses or participant-level timestamps reach the browser.
 */
export type ResearchBehaviourPhase = "all" | "pilot" | "main";
export type ResearchBehaviourDays = 0 | 7 | 14 | 30;
export type ResearchBehaviourDay = Readonly<{
  date: string;
  started: number;
  eventuallyCompleted: number;
  lastSavedCompleted: number;
  formallyCompleted: number;
}>;
export type ResearchBehaviourHour = Readonly<{ hour: number; started: number }>;
export type ResearchBehaviourDuration = Readonly<{ key: string; label: string; count: number }>;
export type ResearchBehaviourDashboard = Readonly<{
  title: string;
  slug: string;
  capturedAt: string;
  phase: ResearchBehaviourPhase;
  days: ResearchBehaviourDays;
  totals: Readonly<{
    started: number;
    completed: number;
    inProgress: number;
    withdrawn: number;
    inProgressWithAnswers: number;
    inProgressWithoutAnswers: number;
    validDurations: number;
    under15Min: number;
    under30Min: number;
    under60Min: number;
    over24Hours: number;
    medianSeconds: number | null;
    p25Seconds: number | null;
    p75Seconds: number | null;
  }>;
  daily: readonly ResearchBehaviourDay[];
  hours: readonly ResearchBehaviourHour[];
  duration: readonly ResearchBehaviourDuration[];
}>;

const SLUG = /^[a-z0-9][a-z0-9-]{2,79}$/;
const n = (value: unknown) => Number(value ?? 0);
const nullableNumber = (value: unknown): number | null =>
  value === undefined || value === null ? null : Number(value);
const txt = (value: unknown) => String(value ?? "");

export function behaviourPhase(input?: string): ResearchBehaviourPhase {
  return input === "pilot" || input === "main" ? input : "all";
}
export function behaviourDays(input?: string): ResearchBehaviourDays {
  return input === "7" ? 7 : input === "14" ? 14 : input === "30" ? 30 : 0;
}

/** UTC arithmetic on *Athens calendar-day strings* avoids server-timezone drift. */
function calendarDays(start: string, end: string): string[] {
  const first = Date.parse(start + "T12:00:00Z");
  const last = Date.parse(end + "T12:00:00Z");
  if (!Number.isFinite(first) || !Number.isFinite(last) || first > last) return [];
  const days: string[] = [];
  for (let ms = first; ms <= last; ms += 86_400_000) {
    days.push(new Date(ms).toISOString().slice(0, 10));
  }
  return days;
}

const DURATION_BUCKETS = [
  { key: "lt5", label: "Under 5 minutes" },
  { key: "5to10", label: "5–10 minutes" },
  { key: "10to15", label: "10–15 minutes" },
  { key: "15to20", label: "15–20 minutes" },
  { key: "20to30", label: "20–30 minutes" },
  { key: "30to60", label: "30–60 minutes" },
  { key: "1to2h", label: "1–2 hours" },
  { key: "2to24h", label: "2–24 hours" },
  { key: "over24h", label: "More than 24 hours" }
] as const;

export async function researchParticipantBehaviour(
  principal: SessionPrincipal,
  slug: string,
  query: { phase?: string; days?: string }
): Promise<ResearchBehaviourDashboard | undefined> {
  assertAdminPermission(principal, "research.read");
  if (!productionDatabaseConfigured() || !SLUG.test(slug)) return undefined;
  const phase = behaviourPhase(query.phase);
  const days = behaviourDays(query.days);
  const pool = getAdminPostgresRuntime().sqlPool;
  const study = await pool.query<SqlRow>(
    "SELECT id, title FROM research_studies WHERE slug=$1 LIMIT 1", [slug]
  );
  const row = study.rows[0];
  if (!row) return undefined;
  const studyId = txt(row.id);
  const args = [studyId, phase];

  // All-time study totals, independent of chart date window. Withdrawn records
  // count among starts, but never among completed response durations.
  const [summary, dailyStarts, dailySaves, dailyFormal, hourlyStarts, durationBuckets, today] =
    await Promise.all([
      pool.query<SqlRow>(`
        SELECT count(*)::bigint AS started,
          count(*) FILTER (WHERE r.status='completed')::bigint AS completed,
          count(*) FILTER (WHERE r.status='in_progress')::bigint AS in_progress,
          count(*) FILTER (WHERE r.status='withdrawn')::bigint AS withdrawn,
          count(*) FILTER (WHERE r.status='in_progress' AND EXISTS (
            SELECT 1 FROM research_answers a WHERE a.response_id=r.id
          ))::bigint AS in_progress_with_answers,
          count(*) FILTER (WHERE r.status='completed' AND r.duration_seconds>=0)::bigint AS valid_durations,
          count(*) FILTER (WHERE r.status='completed' AND r.duration_seconds>=0 AND r.duration_seconds<900)::bigint AS under_15,
          count(*) FILTER (WHERE r.status='completed' AND r.duration_seconds>=0 AND r.duration_seconds<1800)::bigint AS under_30,
          count(*) FILTER (WHERE r.status='completed' AND r.duration_seconds>=0 AND r.duration_seconds<3600)::bigint AS under_60,
          count(*) FILTER (WHERE r.status='completed' AND r.duration_seconds>=86400)::bigint AS over_day,
          percentile_cont(0.25) WITHIN GROUP (ORDER BY r.duration_seconds)
            FILTER (WHERE r.status='completed' AND r.duration_seconds>=0) AS p25,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY r.duration_seconds)
            FILTER (WHERE r.status='completed' AND r.duration_seconds>=0) AS median,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY r.duration_seconds)
            FILTER (WHERE r.status='completed' AND r.duration_seconds>=0) AS p75
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND ($2='all' OR i.fieldwork_phase=$2)
      `, args),
      pool.query<SqlRow>(`
        SELECT (r.started_at AT TIME ZONE 'Europe/Athens')::date::text AS day,
          count(*)::bigint AS started,
          count(*) FILTER (WHERE r.status='completed')::bigint AS eventually_completed
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND ($2='all' OR i.fieldwork_phase=$2)
          AND r.started_at IS NOT NULL
          AND ($3::integer=0 OR (r.started_at AT TIME ZONE 'Europe/Athens')::date >=
               (now() AT TIME ZONE 'Europe/Athens')::date - ($3::integer-1))
        GROUP BY 1 ORDER BY 1
      `, [...args, days]),
      pool.query<SqlRow>(`
        SELECT (r.last_saved_at AT TIME ZONE 'Europe/Athens')::date::text AS day,
          count(*)::bigint AS saved
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND r.status='completed' AND r.last_saved_at IS NOT NULL
          AND ($2='all' OR i.fieldwork_phase=$2)
          AND ($3::integer=0 OR (r.last_saved_at AT TIME ZONE 'Europe/Athens')::date >=
               (now() AT TIME ZONE 'Europe/Athens')::date - ($3::integer-1))
        GROUP BY 1 ORDER BY 1
      `, [...args, days]),
      pool.query<SqlRow>(`
        SELECT (r.completed_at AT TIME ZONE 'Europe/Athens')::date::text AS day,
          count(*)::bigint AS formal
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND r.status='completed' AND r.completed_at IS NOT NULL
          AND ($2='all' OR i.fieldwork_phase=$2)
          AND ($3::integer=0 OR (r.completed_at AT TIME ZONE 'Europe/Athens')::date >=
               (now() AT TIME ZONE 'Europe/Athens')::date - ($3::integer-1))
        GROUP BY 1 ORDER BY 1
      `, [...args, days]),
      pool.query<SqlRow>(`
        SELECT extract(hour FROM r.started_at AT TIME ZONE 'Europe/Athens')::int AS hour,
          count(*)::bigint AS started
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND ($2='all' OR i.fieldwork_phase=$2)
          AND r.started_at IS NOT NULL
          AND ($3::integer=0 OR (r.started_at AT TIME ZONE 'Europe/Athens')::date >=
               (now() AT TIME ZONE 'Europe/Athens')::date - ($3::integer-1))
        GROUP BY 1 ORDER BY 1
      `, [...args, days]),
      pool.query<SqlRow>(`
        SELECT CASE
          WHEN r.duration_seconds<300 THEN 'lt5'
          WHEN r.duration_seconds<600 THEN '5to10'
          WHEN r.duration_seconds<900 THEN '10to15'
          WHEN r.duration_seconds<1200 THEN '15to20'
          WHEN r.duration_seconds<1800 THEN '20to30'
          WHEN r.duration_seconds<3600 THEN '30to60'
          WHEN r.duration_seconds<7200 THEN '1to2h'
          WHEN r.duration_seconds<86400 THEN '2to24h'
          ELSE 'over24h' END AS bucket,
          count(*)::bigint AS total
        FROM research_responses r
        LEFT JOIN research_invites i ON i.id=r.invite_id
        WHERE r.study_id=$1 AND r.status='completed' AND r.duration_seconds>=0
          AND ($2='all' OR i.fieldwork_phase=$2)
          AND ($3::integer=0 OR (r.last_saved_at AT TIME ZONE 'Europe/Athens')::date >=
               (now() AT TIME ZONE 'Europe/Athens')::date - ($3::integer-1))
        GROUP BY 1
      `, [...args, days]),
      pool.query<SqlRow>("SELECT (now() AT TIME ZONE 'Europe/Athens')::date::text AS today")
    ]);

  const totalsRow = summary.rows[0] ?? {};
  const inProgress = n(totalsRow.in_progress);
  const inProgressWithAnswers = n(totalsRow.in_progress_with_answers);
  const todayStr = txt(today.rows[0]?.today);
  const startIndex = new Map(dailyStarts.rows.map(r => [txt(r.day), r]));
  const saveIndex = new Map(dailySaves.rows.map(r => [txt(r.day), r]));
  const formalIndex = new Map(dailyFormal.rows.map(r => [txt(r.day), r]));
  const eventDays = [...startIndex.keys(), ...saveIndex.keys(), ...formalIndex.keys()].sort();
  // Chart periods have zero-filled days so a missing event day never disappears.
  const first = days > 0
    ? new Date(Date.parse(todayStr + "T12:00:00Z") - (days - 1) * 86_400_000).toISOString().slice(0, 10)
    : eventDays[0] ?? todayStr;
  const daily = calendarDays(first, todayStr).map(date => ({
    date,
    started: n(startIndex.get(date)?.started),
    eventuallyCompleted: n(startIndex.get(date)?.eventually_completed),
    lastSavedCompleted: n(saveIndex.get(date)?.saved),
    formallyCompleted: n(formalIndex.get(date)?.formal)
  }));
  const hourIndex = new Map(hourlyStarts.rows.map(r => [n(r.hour), n(r.started)]));
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, started: hourIndex.get(hour) ?? 0 }));
  const bucketIndex = new Map(durationBuckets.rows.map(r => [txt(r.bucket), n(r.total)]));

  return {
    title: txt(row.title),
    slug,
    capturedAt: new Date().toISOString(),
    phase,
    days,
    totals: {
      started: n(totalsRow.started),
      completed: n(totalsRow.completed),
      inProgress,
      withdrawn: n(totalsRow.withdrawn),
      inProgressWithAnswers,
      inProgressWithoutAnswers: Math.max(0, inProgress - inProgressWithAnswers),
      validDurations: n(totalsRow.valid_durations),
      under15Min: n(totalsRow.under_15),
      under30Min: n(totalsRow.under_30),
      under60Min: n(totalsRow.under_60),
      over24Hours: n(totalsRow.over_day),
      medianSeconds: nullableNumber(totalsRow.median),
      p25Seconds: nullableNumber(totalsRow.p25),
      p75Seconds: nullableNumber(totalsRow.p75)
    },
    daily,
    hours,
    duration: DURATION_BUCKETS.map(b => ({ ...b, count: bucketIndex.get(b.key) ?? 0 }))
  };
}
