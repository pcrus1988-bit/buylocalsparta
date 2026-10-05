import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { ResearchStudyLifecycleControls } from "../../../../components/ResearchStudyLifecycleControls";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchSurveyAdminOverview } from "../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Research Studies",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function ResearchSurveysAdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const overview = await researchSurveyAdminOverview(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research Studies" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · governed evidence</div>
      <h1>Research Studies</h1>
      <p className="lead">Population frame → probability sample → invitation → consent → response → weighting → analysis → public release, with versioned evidence at every step.</p>
      <div className="hero-actions">
        <Link className="button button-secondary" href="/research/greek-retail-2026/methodology">Public methodology</Link>
      </div>
    </div></section>

    {!overview.databaseConfigured
      ? <section className="shell vendor-section"><WorkspaceEmptyState title="Research database is not available." body="The admin surface will activate after schema 411 is deployed." /></section>
      : overview.studies.length === 0
        ? <section className="shell vendor-section"><WorkspaceEmptyState title="No research studies have been created." /></section>
        : overview.studies.map((study) => <div key={study.id}>
          <WorkspaceMetricStrip items={[
            { label: "Population frame", value: study.framePopulation.toLocaleString("el-GR"), hint: String(study.frameCount) + " snapshot(s)" },
            { label: "Selected sample", value: study.sampleUnits.toLocaleString("el-GR"), hint: String(study.sampleDrawCount) + " draw(s)" },
            { label: "Invitations", value: study.invites.toLocaleString("el-GR"), hint: String(study.sent) + " sent/opened/started" },
            { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: String(study.started) + " responses started" },
            { label: "Evidence releases", value: study.releases, hint: String(study.analysisRuns) + " analysis run(s)" }
          ]} />
          <section className="shell vendor-section">
            <WorkspaceSectionHeading
              eyebrow={"Study · " + study.slug}
              title={study.title}
              note={"Instrument " + (study.instrumentVersion ?? "—")}
              action={<WorkspaceStatusBadge status={study.status} label={study.status} />}
            />
            <div className="workspace-queue-card">
              <div className="workspace-action-bar">
                <span>Instrument status</span>
                <WorkspaceStatusBadge status={study.instrumentStatus ?? "missing"} label={study.instrumentStatus ?? "missing"} />
              </div>
              <div className="workspace-action-bar">
                <span>Fieldwork</span>
                <strong>{study.fieldworkStartsAt ? new Date(study.fieldworkStartsAt).toLocaleString("el-GR") : "Not started"} → {study.fieldworkEndsAt ? new Date(study.fieldworkEndsAt).toLocaleString("el-GR") : "open"}</strong>
              </div>
            </div>

            {hasAdminPermission(principal, "research.manage") && <ResearchStudyLifecycleControls
              slug={study.slug}
              csrfToken={principal.csrfToken}
              studyStatus={study.status}
              instrumentStatus={study.instrumentStatus}
            />}

            <WorkspaceSectionHeading
              eyebrow="Evidence chain"
              title="The release must be reconstructable"
              note="Each stage remains separately versioned. No published result should exist without a traceable frame, sample, instrument, weights and analysis run."
            />
            <div className="analytics-workflow-grid">
              <article className="analytics-workflow-card"><span>01 · Frame</span><strong>Frozen target population</strong><small>G.E.MI. population snapshot, eligibility rules, stratum counts and content hash.</small></article>
              <article className="analytics-workflow-card"><span>02 · Sample</span><strong>Reproducible selection</strong><small>Algorithm version, random seed, inclusion probability and base weight for every selected unit.</small></article>
              <article className="analytics-workflow-card"><span>03 · Fieldwork</span><strong>Tokenized invitations</strong><small>Random link token stored only as SHA-256, separate contact record and explicit research consent.</small></article>
              <article className="analytics-workflow-card"><span>04 · Evidence</span><strong>Immutable completed response</strong><small>Questionnaire version, raw answers, optional experiment assignment and scoring version.</small></article>
              <article className="analytics-workflow-card"><span>05 · Analysis</span><strong>Weights + code version</strong><small>Base, non-response and calibration weights tied to an auditable analysis run.</small></article>
              <article className="analytics-workflow-card"><span>06 · Release</span><strong>Public reproducibility snapshot</strong><small>Methodology JSON, dataset hash, artifact hash and exact publication version.</small></article>
            </div>
          </section>
        </div>)}
  </main>;
}
