import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchSurveyAdminOverview } from "../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Surveys",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function ResearchSurveysAdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const overview = await researchSurveyAdminOverview(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Surveys" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Surveys</div>
      <h1>Surveys</h1>
      <p className="lead">Choose a survey first. Each operational area then opens on its own page so this overview stays fast, focused and easy to navigate.</p>
    </div></section>

    {!overview.databaseConfigured
      ? <section className="shell vendor-section"><WorkspaceEmptyState title="Research database is not available." body="The Research admin surface will activate when the production Research schema is available." /></section>
      : overview.studies.length === 0
        ? <section className="shell vendor-section"><WorkspaceEmptyState title="No research studies have been created." /></section>
        : <section className="shell vendor-section">
            <WorkspaceSectionHeading eyebrow="Research" title="All surveys" note="Open one survey to see its overview and dedicated operational pages." />
            <div className="analytics-workflow-grid">
              {overview.studies.map((study) => <article className="analytics-workflow-card" key={study.id}>
                <div className="workspace-action-bar">
                  <span>{study.slug}</span>
                  <WorkspaceStatusBadge status={study.status} label={study.status} />
                </div>
                <strong>{study.title}</strong>
                <small>{study.completed.toLocaleString("el-GR")} completed · {study.activeContacts.toLocaleString("el-GR")} contactable · instrument {study.instrumentVersion ?? "—"}</small>
                <Link className="button" href={"/admin/research/surveys/" + encodeURIComponent(study.slug)}>Open survey</Link>
              </article>)}
            </div>
          </section>}
  </main>;
}
