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
      <p className="lead">Global Research configuration is separate from each survey. Choose a survey to manage its settings, questions, evaluation, sampling and fieldwork on dedicated pages.</p>
      <div className="hero-actions"><Link className="button button-secondary" href="/admin/research/settings">Global Research settings</Link></div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Global vs survey-specific" title="Two separate levels" note="System-wide delivery and privacy rules live outside individual studies." />
      <div className="analytics-workflow-grid">
        <article className="analytics-workflow-card">
          <span>Global Research</span>
          <strong>Shared infrastructure & safeguards</strong>
          <small>Email delivery, sender identity, suppression and system-wide privacy rules.</small>
          <Link className="button button-secondary" href="/admin/research/settings">Open global settings</Link>
        </article>
        <article className="analytics-workflow-card">
          <span>Survey workspaces</span>
          <strong>Study-specific design & operations</strong>
          <small>Title, questions, evaluation, sample, invitations, consent, quality and publication belong to one survey.</small>
        </article>
      </div>
    </section>

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
