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
import { GREEK_RETAIL_2026_SLUG, researchSurveyAdminFastOverview } from "../../../../../lib/research-survey-runtime";

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
  const startedAt = Date.now();
  try {
    overview = await researchSurveyAdminFastOverview(principal, slug);
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
      { label: "Population frame", value: study.framePopulation.toLocaleString("el-GR"), hint: String(study.frameCount) + " snapshot(s)" },
      { label: "Selected sample", value: study.sampleUnits.toLocaleString("el-GR"), hint: String(study.sampleDrawCount) + " draw(s)" },
      { label: "Email contacts", value: study.snapshotActiveContacts === undefined ? "—" : study.snapshotActiveContacts.toLocaleString("el-GR"), hint: "Active at frozen-frame snapshot · live statuses are in Contacts" },
      { label: "Invitations", value: study.invites.toLocaleString("el-GR"), hint: String(study.inviteBatches) + " batch(es)" },
      { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: percentage(study.completed, study.sent) + " of sent" }
    ]} />
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
