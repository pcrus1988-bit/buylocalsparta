import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchSurveyAdminIndexOverview } from "../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Surveys",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

function deadlineLabel(value?: string): string {
  if (!value) return "No deadline set";
  const deadline = new Date(value);
  if (!Number.isFinite(deadline.getTime())) return "No deadline set";
  return "Deadline " + deadline.toLocaleString("el-GR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Athens"
  });
}

export default async function ResearchSurveysAdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const overview = await researchSurveyAdminIndexOverview(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Surveys" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Research · Control center</div>
        <h1>Surveys</h1>
        <p className="lead">Choose a study first. Questions, evaluation, sampling, contacts, invitations and publication then open in their own dedicated workspace.</p>
        <div className="hero-actions">
          <Link prefetch={false} className="button" href="/admin/research/handbook">Admin handbook · Start here</Link>
          <Link prefetch={false} className="button button-secondary" href="/admin/research/settings">Global Research settings</Link>
        </div>
      </div>
    </section>

    {!overview.databaseConfigured
      ? <section className="shell vendor-section">
          <WorkspaceEmptyState
            title="Research database is not available."
            body="The Research admin surface will activate when the production Research schema is available."
          />
        </section>
      : overview.studies.length === 0
        ? <section className="shell vendor-section">
            <WorkspaceEmptyState title="No research studies have been created." />
          </section>
        : <section className="shell vendor-section">
            <WorkspaceSectionHeading
              eyebrow="Studies"
              title="All surveys"
              note="This screen stays intentionally lightweight. Detailed operational counts load only after you open a survey."
            />
            <div className="analytics-workflow-grid">
              {overview.studies.map((study) => {
                const root = "/admin/research/surveys/" + encodeURIComponent(study.slug);
                return <article className="analytics-workflow-card" key={study.id}>
                  <div className="workspace-action-bar">
                    <span>{study.slug}</span>
                    <WorkspaceStatusBadge status={study.status} label={study.status} />
                  </div>
                  <strong>{study.title}</strong>
                  <small>
                    {study.completed.toLocaleString("el-GR")} completed
                    {" · "}
                    Instrument {study.instrumentVersion ?? "—"}
                  </small>
                  <small>{deadlineLabel(study.fieldworkEndsAt)}</small>
                  <div className="workspace-action-buttons">
                    <Link prefetch={false} className="button" href={root + "/simulation?mode=workflow"}>Workflow simulation</Link>
                    <Link prefetch={false} className="button button-secondary" href={root + "/simulation?mode=survey&survey=" + encodeURIComponent(study.slug)}>Survey preview</Link>
                    <Link prefetch={false} className="button button-secondary" href={root + "/workflow?phase=pilot"}>Start guided workflow</Link>
                    <Link prefetch={false} className="button button-secondary" href={"/admin/research/surveys/" + encodeURIComponent(study.slug)}>Open survey</Link>
                    <Link prefetch={false} className="button button-secondary" href={root + "/questions"}>Questions</Link>
                    <Link prefetch={false} className="button button-secondary" href={root + "/evaluation"}>Evaluation</Link>
                  </div>
                </article>;
              })}
            </div>
          </section>}
  </main>;
}
