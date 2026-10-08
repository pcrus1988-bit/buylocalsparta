import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { ResearchWorkflowSimulator } from "../../../../../../components/ResearchWorkflowSimulator";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { validSimulationSlug } from "../../../../../../lib/research-workflow-simulation";

export const metadata: Metadata = {
  title: "Research · Workflow Simulation",
  robots: { index: false, follow: false, noarchive: true }
};
export const dynamic = "force-dynamic";

export default async function ResearchSimulationAdminPage({ params }: {
  params: Promise<{ slug: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const { slug } = await params;
  if (!validSimulationSlug(slug)) redirect("/admin/research/surveys");
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const canSend = hasAdminPermission(principal, "research.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Workflow Simulation" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Research · Safe rehearsal</div>
        <h1>Workflow Simulation Environment</h1>
        <p className="lead">Test a single email, a private invitation link, sample answer submission and an Admin notice—without starting Pilot or Main fieldwork.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href={root}>Survey overview</Link>
          <Link className="button button-secondary" href={root + "/workflow?phase=pilot"}>Pilot guide</Link>
          <Link className="button button-secondary" href="/admin/research/handbook">Admin handbook</Link>
        </div>
      </div>
    </section>
    <ResearchSurveyAdminNav slug={slug} current="simulation" />
    <section className="shell vendor-section">
      <div className="workspace-inline-note">
        <strong>This is a rehearsal, not the Pilot.</strong> The sample questions are specifically for validating link and submission mechanics; they are not the official questionnaire.
        Dry runs do not send email. A real test send is limited to one manually confirmed destination per action.
        SES message acceptance is never presented as evidence of delivery.
        This page does not query Research contact, response, or invitation tables.
      </div>
    </section>
    {canSend
      ? <ResearchWorkflowSimulator slug={slug} csrfToken={principal.csrfToken} />
      : <section className="shell vendor-section">
          You can view the simulation instructions, but running it requires Research management permission.
        </section>}
  </main>;
}
