import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchBarometerAutoRefresh } from "../../../../../../components/ResearchBarometerAutoRefresh";
import { ResearchParticipantBehaviourCharts } from "../../../../../../components/ResearchParticipantBehaviourCharts";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import {
  researchParticipantBehaviour, behaviourDays, behaviourPhase
} from "../../../../../../lib/research-participant-behaviour-runtime";

export const metadata: Metadata = {
  title: "Admin · Participant Behaviour Analytics",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

const integer = (v: number) => new Intl.NumberFormat("el-GR").format(v);
const percent = (n: number, d: number) =>
  d ? (100 * n / d).toLocaleString("el-GR", { maximumFractionDigits: 1 }) + "%" : "—";
const duration = (seconds: number | null) => {
  if (seconds === null) return "—";
  const total = Math.round(seconds);
  if (total < 3600) return Math.floor(total / 60) + "m " + (total % 60) + "s";
  if (total < 86400) return Math.floor(total / 3600) + "h " + Math.round(total % 3600 / 60) + "m";
  return (seconds / 86400).toLocaleString("el-GR", { maximumFractionDigits: 1 }) + " days";
};
const localStamp = (value: string) => new Date(value).toLocaleString("el-GR", {
  timeZone: "Europe/Athens", dateStyle: "medium", timeStyle: "short"
});

export default async function ParticipantBehaviourPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ phase?: string; days?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const search = await searchParams;
  const phase = behaviourPhase(search.phase);
  const days = behaviourDays(search.days);
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  let data: Awaited<ReturnType<typeof researchParticipantBehaviour>>;
  let error = false;
  try {
    data = await researchParticipantBehaviour(principal, slug, search);
  } catch (reason) {
    error = true;
    console.error(JSON.stringify({
      event: "research.participant_behaviour.read_unavailable",
      errorName: reason instanceof Error ? reason.name : "UnknownError"
    }));
  }
  if (!error && !data) notFound();

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Participant behaviour" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">KONTA MOY Retail Observatory · Admin only</div>
      <h1>Participant Behaviour Analytics</h1>
      <p className="lead">{data?.title ?? slug} · Questionnaire starts, participation by hour,
        time to final save and daily progression from the live research database.</p>
      <div className="hero-actions">
        <Link prefetch={false} className="button button-secondary" href={root}>Survey overview</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/responses"}>Questionnaire responses</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/barometer"}>Live Barometer</Link>
      </div>
    </div></section>
    <ResearchSurveyAdminNav slug={slug} current="behaviour" />
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Participation insights" title="Explore participant behaviour"
        note="All statistics are calculated from current database records. No questionnaire answers or personal identifiers are transmitted to the charts." />
      <form method="get" action={root + "/behaviour"} className="workspace-queue-card"
        style={{ display: "flex", alignItems: "end", flexWrap: "wrap", gap: 12 }}>
        <label style={{ display: "grid", gap: 5, flex: "1 1 180px" }}>
          Cohort / study phase
          <select name="phase" defaultValue={phase}>
            <option value="all">All phases</option>
            <option value="pilot">Pilot</option>
            <option value="main">Main study</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, flex: "1 1 180px" }}>
          Charts date range
          <select name="days" defaultValue={String(days)}>
            <option value="0">All recorded days</option>
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
          </select>
        </label>
        <button className="button" type="submit">Apply filters</button>
        <Link className="button button-secondary" href={root + "/behaviour"} prefetch={false}>Reset</Link>
      </form>
      <div style={{ margin: "14px 0" }}><ResearchBarometerAutoRefresh /></div>
      {error ? <div className="workspace-inline-note form-error" role="alert">
        The live database query was unavailable. No stored, guessed or stale figures are displayed. Refresh to retry.
      </div> : data && <>
        <small>Updated {localStamp(data.capturedAt)} · Athens time zone · phase: {data.phase}.</small>
        <div style={{ marginTop: 16 }}>
          <WorkspaceMetricStrip items={[
            { label: "Started · all time", value: integer(data.totals.started), hint: "Includes withdrawn questionnaires" },
            { label: "Formally completed", value: integer(data.totals.completed), hint: percent(data.totals.completed, data.totals.started) + " of all starts" },
            { label: "Still in progress", value: integer(data.totals.inProgress), hint: integer(data.totals.inProgressWithAnswers) + " already contain answers" },
            { label: "Withdrawn", value: integer(data.totals.withdrawn), hint: "Excluded from completion-time data" },
            { label: "Median duration", value: duration(data.totals.medianSeconds), hint: "Start to final save · completed only" }
          ]} />
        </div>
        <div className="workspace-inline-note" style={{ marginTop: 12 }}>
          <strong>Measurement notes:</strong> The cards above are all-time totals for the selected phase.
          The date filter affects all three charts and the daily table, not those all-time cards.
          Final save means <code>last_saved_at</code> of a questionnaire currently marked completed;
          formal submission means <code>completed_at</code>. Older questionnaires backfilled
          into completed status can appear on a later formal-submission day, so formal
          timestamps must not be mistaken for original participant activity.
        </div>

        <div style={{ marginTop: 24 }}>
          <ResearchParticipantBehaviourCharts days={data.daily} hours={data.hours} duration={data.duration} />
        </div>

        <section className="vendor-section" style={{ marginTop: 24 }}>
          <WorkspaceSectionHeading eyebrow="Completion" title="Completion-time benchmarks"
            note="Durations are recorded elapsed time from starting a questionnaire until the last save. Pauses and return visits may be included." />
          <div className="analytics-workflow-grid">
            {([
              ["25th percentile", duration(data.totals.p25Seconds), "25% of completed questionnaires took no longer than this"],
              ["Median", duration(data.totals.medianSeconds), "Half of completed questionnaires took no longer than this"],
              ["75th percentile", duration(data.totals.p75Seconds), "75% of completed questionnaires took no longer than this"],
              ["Under 15 min", percent(data.totals.under15Min, data.totals.validDurations), integer(data.totals.under15Min) + " completed"],
              ["Under 30 min", percent(data.totals.under30Min, data.totals.validDurations), integer(data.totals.under30Min) + " completed"],
              ["Under 60 min", percent(data.totals.under60Min, data.totals.validDurations), integer(data.totals.under60Min) + " completed"],
              ["Over 24 hours", percent(data.totals.over24Hours, data.totals.validDurations), integer(data.totals.over24Hours) + " elapsed over a day"]
            ] as const).map(([label, value, hint]) => <article className="analytics-workflow-card" key={label}>
              <span>{label}</span><strong style={{ fontSize: "1.35rem" }}>{value}</strong><small>{hint}</small>
            </article>)}
          </div>
          <div className="workspace-inline-note" style={{ marginTop: 12 }}>
            Duration percentiles and overall counts use <strong>all completed questionnaires</strong>
            in the selected phase. The duration chart follows the selected date window,
            filtered by the day of final save (not by initial start).
            Valid duration n={integer(data.totals.validDurations)}.
            This data measures elapsed time, not time actively typing or reading.
          </div>
        </section>

        <section className="vendor-section" style={{ marginTop: 24 }}>
          <WorkspaceSectionHeading eyebrow="Daily breakdown" title="Questionnaires by day"
            note="Starts and eventual completions are grouped by start date; final saves and formal submissions by their respective event dates." />
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", minWidth: 650, textAlign: "left", fontVariantNumeric: "tabular-nums" }}>
              <thead><tr>
                <th>Date (Athens)</th><th>Started</th>
                <th>Started that eventually completed</th>
                <th>Last saved · completed</th><th>Formally submitted</th>
              </tr></thead>
              <tbody>{data.daily.map(row => <tr key={row.date}>
                <td>{row.date}</td>
                <td>{integer(row.started)}</td>
                <td>{integer(row.eventuallyCompleted)}</td>
                <td>{integer(row.lastSavedCompleted)}</td>
                <td>{integer(row.formallyCompleted)}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="workspace-inline-note" style={{ marginTop: 14 }}>
            This is a read-only operational dashboard, not an official weighted research result.
            Withdrawn respondents are never counted as completed, no historical answer or
            consent records are changed, and charts never exclude answered questionnaires merely
            because formal submission was delayed.
          </div>
        </section>
      </>}
    </section>
  </main>;
}
