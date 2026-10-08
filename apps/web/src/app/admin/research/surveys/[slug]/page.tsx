import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { RESEARCH_SURVEY_ADMIN_SECTIONS, ResearchSurveyAdminNav } from "../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../lib/admin-session";
import { GREEK_RETAIL_2026_SLUG, researchSurveyAdminCohortOverview, researchSurveyAdminFastOverview } from "../../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Survey Overview",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100) + "%";
}

/**
 * Stream live metrics after the authenticated Admin shell and operational links.
 * A transient pooler timeout must not turn the entire survey page into a 500.
 * The fallback explicitly avoids making up stale or zero counts.
 */
async function ResearchSurveyLiveOverview({ principal, slug }: {
  principal: SessionPrincipal;
  slug: string;
}) {
  let overview: Awaited<ReturnType<typeof researchSurveyAdminFastOverview>>;
  let cohorts: Awaited<ReturnType<typeof researchSurveyAdminCohortOverview>>;
  const startedAt = Date.now();
  try {
    const [overviewResult, cohortResult] = await Promise.allSettled([
      researchSurveyAdminFastOverview(principal, slug),
      researchSurveyAdminCohortOverview(principal, slug)
    ]);
    if (overviewResult.status === "rejected") throw overviewResult.reason;
    overview = overviewResult.value;
    cohorts = cohortResult.status === "fulfilled" ? cohortResult.value : undefined;
    if (cohortResult.status === "rejected") {
      console.error("research.admin_cohort_overview_unavailable", cohortResult.reason);
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "research.admin_overview_read_unavailable",
      slug,
      durationMs: Date.now() - startedAt,
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message.slice(0, 200) : "Unknown database error"
    }));
    return <section className="shell vendor-section" role="status">
      <WorkspaceSectionHeading eyebrow="Live status" title="The survey overview is temporarily unavailable"
        note="The database connection did not respond. Operational navigation is still available; no figures are being inferred." />
      <div className="workspace-inline-note form-error">
        The current counts could not be loaded. Refresh to try again. If it persists, review the production database connection.
      </div>
      <a className="button button-secondary" href={"/admin/research/surveys/" + encodeURIComponent(slug)}>Try loading again</a>
    </section>;
  }
  if (!overview.databaseConfigured) {
    return <section className="shell vendor-section"><WorkspaceEmptyState
      title="Research database is not available."
      body="The Research admin surface will activate when the production Research schema is available." /></section>;
  }
  const study = overview.study;
  if (!study) {
    return <section className="shell vendor-section"><WorkspaceEmptyState
      title="This survey could not be found."
      body="Return to All surveys to select an existing study." />
      <Link prefetch={false} className="button button-secondary" href="/admin/research/surveys">All surveys</Link>
    </section>;
  }
  return <>
    <WorkspaceMetricStrip items={[
      { label: "Latest frozen frame", value: study.framePopulation === undefined ? "—" : study.framePopulation.toLocaleString("el-GR"), hint: String(study.frameCount) + " snapshot(s)" + (study.buildingFrames > 0 ? " · " + study.buildingFrames + " building" : "") },
      { label: "Selected sample", value: study.sampleUnits.toLocaleString("el-GR"), hint: String(study.sampleDrawCount) + " draw(s)" },
      { label: "Email contacts (frozen)", value: study.snapshotActiveContacts === undefined ? "—" : study.snapshotActiveContacts.toLocaleString("el-GR"), hint: "Active at latest frozen snapshot · live statuses are in Contacts" },
      { label: "Invitations", value: study.invites.toLocaleString("el-GR"), hint: String(study.inviteBatches) + " batch(es)" },
      { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: percentage(study.completed, study.sent) + " of sent" }
    ]} />
    <div className="shell workspace-inline-note" role="status">Population and email counts come from the latest completed (frozen) frame. A snapshot still building is tracked separately and is not yet eligible for sampling. A dash means no completed snapshot data is available, not zero businesses.</div>
    {slug === GREEK_RETAIL_2026_SLUG && <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Research cohorts" title="Group A · Group B · Combined"
        note="One study and questionnaire. A is invited first; B comprises new, deduplicated businesses from the expanded frame. No messages are sent from this dashboard." />
      {cohorts ? <>
        <div className="analytics-workflow-grid">
          <article className="analytics-workflow-card">
            <span>Cohort A · Original retail frame</span>
            <WorkspaceStatusBadge status={cohorts.a.status}
              label={cohorts.a.population === undefined ? "Not ready" : "Frozen baseline"} />
            <strong>Population: {cohorts.a.population === undefined ? "—" : cohorts.a.population.toLocaleString("el-GR")}</strong>
            <strong>Businesses with active email: {cohorts.a.contactable === undefined ? "—" : cohorts.a.contactable.toLocaleString("el-GR")}</strong>
            <small>Original frozen non-food retail frame · {cohorts.a.frozenAt ? new Date(cohorts.a.frozenAt).toLocaleDateString("el-GR") : "no snapshot yet"}. Frozen contact count, not a live opt-out tally.</small>
          </article>
          <article className="analytics-workflow-card">
            <span>Cohort B · Additional retail businesses</span>
            <WorkspaceStatusBadge status={cohorts.b.status}
              label={cohorts.b.status === "building" ? "Frame building" : cohorts.b.population === undefined ? "Reconciliation pending" : "Deduplicated"} />
            <strong>New businesses: {cohorts.b.population === undefined ? "—" : cohorts.b.population.toLocaleString("el-GR")}</strong>
            <strong>Businesses with active email: {cohorts.b.contactable === undefined ? "—" : cohorts.b.contactable.toLocaleString("el-GR")}</strong>
            <small>{cohorts.b.status === "building"
              ? "Import in progress. Only new, eligible businesses not in A count after the completed frame is reconciled."
              : cohorts.b.population === undefined
                ? "No completed A/B deduplication yet. Do not interpret expanded-frame totals as Cohort B."
                : "Incremental eligible businesses, excluding A-frame business identities and already contacted email identities."}</small>
            {cohorts.b.processedSourceRows !== undefined && <small>{cohorts.b.processedSourceRows.toLocaleString("el-GR")} source records processed so far (not unique cohort businesses).</small>}
            {cohorts.b.expandedFramePopulation !== undefined && <small>Full expanded frame: {cohorts.b.expandedFramePopulation.toLocaleString("el-GR")} businesses before A/B overlap removal.</small>}
          </article>
          <article className="analytics-workflow-card">
            <span>Combined · Unduplicated coverage</span>
            <WorkspaceStatusBadge status={cohorts.combined.population === undefined ? "pending" : "ready"}
              label={cohorts.combined.population === undefined ? "Awaiting B" : "Cohorts reconciled"} />
            <strong>Unique businesses: {cohorts.combined.population === undefined ? "—" : cohorts.combined.population.toLocaleString("el-GR")}</strong>
            <strong>Businesses with active email: {cohorts.combined.contactable === undefined ? "—" : cohorts.combined.contactable.toLocaleString("el-GR")}</strong>
            <small>Calculated as Cohort A plus *new* Cohort B businesses, never by adding two overlapping frames. Email figures count contactable businesses, not necessarily distinct email addresses.</small>
          </article>
        </div>
        <div className="workspace-inline-note">
          Invitation order: A → B. Keep recruitment records and analyses separate by cohort; aggregate them only with a stated denominator and appropriate weighting.
          Suppressions and duplicate email identities must also be checked again at send time. A frozen count alone does not authorize sending.
        </div>
      </> : <div className="workspace-inline-note form-error" role="status">
        Cohort counts are temporarily unavailable. They are not being replaced with zero or estimated from other snapshots.
      </div>}
    </section>}
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="State" title="Study status" note={"Instrument " + (study.instrumentVersion ?? "—")} />
      <div className="workspace-queue-card">
        <div className="workspace-action-bar">
          <span>Survey</span>
          <strong>{study.title}</strong>
          <WorkspaceStatusBadge status={study.status} label={study.status} />
        </div>
        <div className="workspace-action-bar">
          <span>Instrument</span>
          <WorkspaceStatusBadge status={study.instrumentStatus ?? "missing"} label={study.instrumentStatus ?? "missing"} />
        </div>
        <div className="workspace-action-bar">
          <span>Analysis plan</span>
          <strong>{study.analysisPlanVersion ?? "missing"} · {study.analysisPlanStatus ?? "not locked"}</strong>
        </div>
        <div className="workspace-action-bar">
          <span>Pilot</span>
          <strong>{study.pilotStartedAt ? new Date(study.pilotStartedAt).toLocaleString("el-GR") : "Not started"} → {study.pilotEndedAt ? new Date(study.pilotEndedAt).toLocaleString("el-GR") : study.status === "pilot" ? "open" : "—"}</strong>
        </div>
        <div className="workspace-action-bar">
          <span>Main fieldwork</span>
          <strong>{study.fieldworkStartsAt ? new Date(study.fieldworkStartsAt).toLocaleString("el-GR") : "Not started"} → {study.fieldworkEndsAt ? new Date(study.fieldworkEndsAt).toLocaleString("el-GR") : study.fieldworkStartsAt ? "open" : "—"}</strong>
        </div>
      </div>
      {study.failedJobs > 0 && <div className="workspace-inline-note form-error">
        {study.failedJobs} research job(s) require review before relying on the evidence chain.
      </div>}
    </section>
  </>;
}

export default async function ResearchSurveyOverviewPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const { slug } = await params;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const title = slug === GREEK_RETAIL_2026_SLUG ? "Ελληνικό Λιανεμπόριο 2026" : slug.replace(/-/g, " ");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={"Research · " + title} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Survey overview</div>
      <h1>{title}</h1>
      <p className="lead">Open a dedicated area below for questions, sampling, contacts, invitations, evaluation, and publication.</p>
      <div className="hero-actions">
        <Link prefetch={false} className="button button-secondary" href="/admin/research/surveys">All surveys</Link>
        <Link prefetch={false} className="button" href={root + "/workflow?phase=pilot"}>Guided Pilot</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/workflow?phase=main"}>Main study steps</Link>
        <Link prefetch={false} className="button button-secondary" href="/admin/research/handbook">Admin handbook</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/contacts"}>Contact details</Link>
      </div>
    </div></section>

    <ResearchSurveyAdminNav slug={slug} current="overview" />

    <Suspense fallback={<section className="shell vendor-section" role="status">
      <WorkspaceSectionHeading eyebrow="Live status" title="Loading current survey figures"
        note="The operational navigation below remains available while figures load." />
    </section>}>
      <ResearchSurveyLiveOverview principal={principal} slug={slug} />
    </Suspense>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Survey"
        title="Operational areas"
        note="Each area is an independent page. Opening one no longer renders all Research controls and ledgers at once."
      />
      <div className="analytics-workflow-grid">
        {RESEARCH_SURVEY_ADMIN_SECTIONS.filter((item) => item.key !== "overview").map((item) => <article className="analytics-workflow-card" key={item.key}>
          <span>{item.label}</span>
          <strong>{item.description}</strong>
          <Link prefetch={false} className="button button-secondary" href={root + "/" + item.key}>Open</Link>
        </article>)}
      </div>
    </section>
  </main>;
}
