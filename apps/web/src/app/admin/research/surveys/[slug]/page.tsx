import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../components/AdminWorkspaceHeader";
import { RESEARCH_SURVEY_ADMIN_SECTIONS, ResearchSurveyAdminNav } from "../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../lib/admin-session";
import { researchSurveyAdminFastOverview } from "../../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Survey Overview",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100) + "%";
}

export default async function ResearchSurveyOverviewPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const { slug } = await params;
  const overview = await researchSurveyAdminFastOverview(principal, slug);

  if (!overview.databaseConfigured) {
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Surveys" />
      <section className="shell vendor-section">
        <WorkspaceEmptyState title="Research database is not available." body="The Research admin surface will activate when the production Research schema is available." />
      </section>
    </main>;
  }

  const study = overview.study;
  if (!study) notFound();

  const root = "/admin/research/surveys/" + encodeURIComponent(study.slug);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={"Research · " + study.title} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Survey overview</div>
      <h1>{study.title}</h1>
      <p className="lead">This page is only the survey overview. Open a dedicated area below for operational work.</p>
      <div className="hero-actions">
        <WorkspaceStatusBadge status={study.status} label={study.status} />
        <Link className="button button-secondary" href="/admin/research/surveys">All surveys</Link>
        <Link className="button button-secondary" href={root + "/contacts"}>Contact details</Link>
      </div>
    </div></section>

    <ResearchSurveyAdminNav slug={study.slug} current="overview" />

    <WorkspaceMetricStrip items={[
      { label: "Population frame", value: study.framePopulation.toLocaleString("el-GR"), hint: String(study.frameCount) + " snapshot(s)" },
      { label: "Selected sample", value: study.sampleUnits.toLocaleString("el-GR"), hint: String(study.sampleDrawCount) + " draw(s)" },
      { label: "Contacts", value: "Dedicated workspace", hint: "Live contactability, bounces and opt-outs are available in Contacts" },
      { label: "Invitations", value: study.invites.toLocaleString("el-GR"), hint: String(study.inviteBatches) + " batch(es)" },
      { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: percentage(study.completed, study.sent) + " of sent" }
    ]} />

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
          <Link className="button button-secondary" href={root + "/" + item.key}>Open</Link>
        </article>)}
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="State" title="Study status" note={"Instrument " + (study.instrumentVersion ?? "—")} />
      <div className="workspace-queue-card">
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
  </main>;
}
