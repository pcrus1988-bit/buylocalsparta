import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchStudyFieldworkBalance } from "../../../../../../components/ResearchStudyFieldworkBalance";
import { ResearchSurveySettingsPanel } from "../../../../../../components/ResearchSurveySettingsPanel";
import { ResearchEvaluationPlanEditor, ResearchSurveyQuestionsEditor } from "../../../../../../components/ResearchSurveyQuestionsEditor";
import { ResearchStudyFieldworkControls } from "../../../../../../components/ResearchStudyFieldworkControls";
import { ResearchStudyLifecycleControls } from "../../../../../../components/ResearchStudyLifecycleControls";
import { ResearchStudyOperationsPanel } from "../../../../../../components/ResearchStudyOperationsPanel";
import { ResearchSurveyDirectoryPanel } from "../../../../../../components/ResearchSurveyDirectoryPanel";
import { ResearchStudyProtocolControls } from "../../../../../../components/ResearchStudyProtocolControls";
import { ResearchStudyQualityControls } from "../../../../../../components/ResearchStudyQualityControls";
import { ResearchStudySamplingControls } from "../../../../../../components/ResearchStudySamplingControls";
import { RESEARCH_SURVEY_ADMIN_SECTIONS, ResearchSurveyAdminNav, type ResearchSurveyAdminSection } from "../../../../../../components/ResearchSurveyAdminNav";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchQualityReviewQueue } from "../../../../../../lib/research-survey-quality";
import { researchSurveyDesignAdminOverview } from "../../../../../../lib/research-survey-admin-design";
import {
  researchDeliveryDelayQueue,
  researchFieldworkStrata,
  researchProtocolEvents,
  researchSurveyAdminOverview,
  researchSurveyAdminFastOverview,
  researchSurveyAdminCohortOverview,
  researchSurveyOperationsOverview
} from "../../../../../../lib/research-survey-runtime";
import { researchDirectorySearch } from "../../../../../../lib/research-survey-directory";

export const metadata: Metadata = {
  title: "Admin · Survey",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

const VALID_SECTIONS = new Set(
  RESEARCH_SURVEY_ADMIN_SECTIONS.filter((item) => item.key !== "overview").map((item) => item.key)
);

export default async function ResearchSurveySectionPage({ params, searchParams }: {
  params: Promise<{ slug: string; section: string }>;
  searchParams: Promise<{ search?: string; q?: string; status?: string; cursor?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const { slug, section: rawSection } = await params;
  if (!VALID_SECTIONS.has(rawSection as ResearchSurveyAdminSection)) notFound();
  const section = rawSection as Exclude<ResearchSurveyAdminSection, "overview">;

  // Directory navigation never executes the expensive global survey overview.
  // No contact or invitation rows are fetched until the Admin submits Search.
  if (section === "contacts" || section === "invitations") {
    const summary = await researchSurveyAdminFastOverview(principal, slug);
    if (!summary.databaseConfigured || !summary.study) notFound();
    const query = await searchParams;
    const directory = await researchDirectorySearch(principal, slug, section, {
      search: query.search === "1", q: query.q, status: query.status, cursor: query.cursor
    });
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={"Research · " + summary.study.title} />
      <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
        <div className="eyebrow">Research · {section === "contacts" ? "Email contacts" : "Invitations"}</div>
        <h1>{summary.study.title}</h1>
        <p className="lead">No directory records are preloaded. Search and filter only when you need specific entries.</p>
      </div></section>
      <ResearchSurveyAdminNav slug={slug} current={section} />
      {section === "contacts" && <section className="shell vendor-section">
        <div className="workspace-action-bar">
          <span>
            <strong>{summary.study.snapshotActiveContacts === undefined ? "Not available" : summary.study.snapshotActiveContacts.toLocaleString("el-GR")}</strong>
            <small> active email contacts at the latest frozen-frame snapshot</small>
          </span>
          <small>Snapshot count, not a live recalculation. Opt-outs and bounces are shown in filtered results.</small>
        </div>
      </section>}
      <ResearchSurveyDirectoryPanel slug={slug} kind={section} data={directory} />
    </main>;
  }

  const overview = await researchSurveyAdminOverview(principal);
  if (!overview.databaseConfigured) notFound();
  const study = overview.studies.find((item) => item.slug === slug);
  if (!study) notFound();

  const canManage = hasAdminPermission(principal, "research.manage");
  const canDesign = hasAdminPermission(principal, "research.design.manage");
  const canAnalyze = hasAdminPermission(principal, "research.analysis.manage");
  const sectionMeta = RESEARCH_SURVEY_ADMIN_SECTIONS.find((item) => item.key === section);
  let content: ReactNode = null;

  if (section === "settings") {
    const design = await researchSurveyDesignAdminOverview(principal, study.slug);
    content = <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Survey design" title="Survey-specific settings" note="These settings apply only to this survey. Global Research infrastructure is managed separately." />
      </section>
      <ResearchSurveySettingsPanel slug={study.slug} csrfToken={principal.csrfToken} canEdit={canDesign} data={design} />
    </>;
  } else if (section === "questions") {
    const design = await researchSurveyDesignAdminOverview(principal, study.slug);
    content = <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Survey design" title="Questions" note="Edit wording, answer options, order, required state and evaluation keys for the current questionnaire version." />
      </section>
      <ResearchSurveyQuestionsEditor slug={study.slug} csrfToken={principal.csrfToken} canEdit={canDesign} canAnalyze={canAnalyze} data={design} />
    </>;
  } else if (section === "evaluation") {
    const design = await researchSurveyDesignAdminOverview(principal, study.slug);
    content = <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Survey design" title="Evaluation" note="Define headline metrics, standard breakdowns and clearly classified exploratory analyses before results are produced." />
      </section>
      <ResearchEvaluationPlanEditor
        slug={study.slug}
        csrfToken={principal.csrfToken}
        canEdit={canAnalyze && canDesign}
        canAddLater={canAnalyze}
        data={design}
      />
    </>;
  } else if (section === "sampling") {
    const cohorts = await researchSurveyAdminCohortOverview(principal, study.slug);
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Recruitment preparation" title="Population frame & full-cohort outreach" note="Official study: complete contactable Cohort A first, Cohort B afterwards. Sampling applies only to the diagnostic Pilot." />
      {canManage ? <ResearchStudySamplingControls
        slug={study.slug}
        csrfToken={principal.csrfToken}
        cohortAStatus={cohorts?.a.status}
        cohortAPopulation={cohorts?.a.population}
        cohortAContacts={cohorts?.a.contactable}
        cohortASampleStatus={cohorts?.a.sampleStatus}
        cohortARecruitmentMode={cohorts?.a.recruitmentMode}
        cohortASampleSelected={cohorts?.a.sampleSelected}
        cohortBStatus={cohorts?.b.status}
        cohortBPopulation={cohorts?.b.population}
        cohortBContacts={cohorts?.b.contactable}
        cohortBSampleStatus={cohorts?.b.sampleStatus}
        cohortBRecruitmentMode={cohorts?.b.recruitmentMode}
        cohortBSampleSelected={cohorts?.b.sampleSelected}
        queuedSampleJobs={study.queuedSampleJobs}
        runningSampleJobs={study.runningSampleJobs}
        latestFrameStatus={study.latestFrameStatus}
        studyStatus={study.status}
        framePopulation={study.framePopulation}
        phasePopulation={study.phasePopulation}
        pilotHoldoutUnits={study.pilotHoldoutUnits}
        latestFrameStrata={study.latestFrameStrata}
        activeContacts={study.activeContacts}
        latestSampleStatus={study.latestSampleStatus}
        latestSampleTarget={study.latestSampleTarget}
        latestSampleDesignSha256={study.latestSampleDesignSha256}
        latestSampleDesiredCompletes={study.latestSampleDesiredCompletes}
        latestSampleExpectedResponseRate={study.latestSampleExpectedResponseRate}
        latestSampleContactabilityRate={study.latestSampleContactabilityRate}
        latestSampleExpectedCompletes={study.latestSampleExpectedCompletes}
        queuedJobs={study.queuedJobs}
        runningJobs={study.runningJobs}
      /> : <div className="workspace-inline-note">Read-only access. Sampling mutations require Research management permission.</div>}
    </section>;
  } else if (section === "fieldwork") {
    const cohorts = await researchSurveyAdminCohortOverview(principal, study.slug);
    const operations = await researchSurveyOperationsOverview(principal, study.slug, "templates");
    content = <>
      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Email & fieldwork" title="Templates and controlled sends" note="Email templates, invitation batches, reminders and fieldwork actions are isolated here." />
        {canManage ? <ResearchStudyFieldworkControls
          slug={study.slug}
          studyTitle={study.title}
          csrfToken={principal.csrfToken}
          studyStatus={study.status}
          cohortAStatus={cohorts?.a.status}
          cohortASampleStatus={cohorts?.a.sampleStatus}
        cohortARecruitmentMode={cohorts?.a.recruitmentMode}
          cohortBStatus={cohorts?.b.status}
          cohortBSampleStatus={cohorts?.b.sampleStatus}
        cohortBRecruitmentMode={cohorts?.b.recruitmentMode}
          queuedSampleJobs={study.queuedSampleJobs}
          runningSampleJobs={study.runningSampleJobs}
          recruitmentTemplateVersion={study.recruitmentTemplateVersion}
          recruitmentTemplateSubject={study.recruitmentTemplateSubject}
          recruitmentTemplateBody={study.recruitmentTemplateBody}
          reminderTemplateVersion={study.reminderTemplateVersion}
          reminderTemplateSubject={study.reminderTemplateSubject}
          reminderTemplateBody={study.reminderTemplateBody}
          reminderSent={study.reminderSent}
          reminderFailed={study.reminderFailed}
          activeContacts={study.activeContacts}
          completed={study.completed}
          rewardEligible={study.rewardEligible}
          rewardIssued={study.rewardIssued}
          rewardDeliveryFailed={study.rewardDeliveryFailed}
          pendingQualityReviews={study.qualityReview}
          succeededAnalysisRuns={study.succeededAnalysisRuns}
          latestReleaseVersion={study.latestReleaseVersion}
          latestReleasePublishedAt={study.latestReleasePublishedAt}
          resultsNotificationSent={study.resultsNotificationSent}
          resultsNotificationFailed={study.resultsNotificationFailed}
          queuedJobs={study.queuedJobs}
          runningJobs={study.runningJobs}
        /> : <div className="workspace-inline-note">Read-only access. Fieldwork mutations require Research management permission.</div>}
      </section>
      <ResearchStudyOperationsPanel slug={study.slug} data={operations} section="templates" />
    </>;
  } else if (section === "balance") {
    const strata = await researchFieldworkStrata(principal, study.slug);
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Fieldwork" title="Sampling-strata balance" note="Only the live balance diagnostic is loaded on this page." />
      <ResearchStudyFieldworkBalance strata={strata} />
      {strata.length === 0 && <div className="workspace-inline-note">No fieldwork strata are available yet.</div>}
    </section>;
  } else if (section === "kad") {
    const operations = await researchSurveyOperationsOverview(principal, study.slug, "kad");
    content = <ResearchStudyOperationsPanel slug={study.slug} data={operations} section="kad" />;
  } else if (section === "consent") {
    const operations = await researchSurveyOperationsOverview(principal, study.slug, "consents");
    content = <ResearchStudyOperationsPanel slug={study.slug} data={operations} section="consents" />;
  } else if (section === "delivery") {
    const delays = await researchDeliveryDelayQueue(principal, study.slug);
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Delivery" title="Email deliverability" note="Temporary SES delivery problems are isolated here." />
      {delays.length === 0
        ? <div className="workspace-inline-note">No active SES delivery delays.</div>
        : <div className="workspace-queue-card">
            <div className="workspace-action-bar">
              <span><strong>SES delivery delays</strong><br />Temporary delivery problems. SES is still retrying.</span>
              <WorkspaceStatusBadge status="warning" label={delays.length + " active"} />
            </div>
            {delays.map((item) => <div className="workspace-action-bar" key={item.id}>
              <span>
                <strong>{item.messageKind}</strong><br />
                {item.delayType ?? "Undetermined"}
                {item.smtpStatus ? " · SMTP " + item.smtpStatus : ""}
                {item.diagnosticCode ? " · " + item.diagnosticCode : ""}
              </span>
              <small>{item.expirationTime
                ? "SES retries until " + new Date(item.expirationTime).toLocaleString("el-GR")
                : item.occurredAt
                  ? "Reported " + new Date(item.occurredAt).toLocaleString("el-GR")
                  : "Temporary delay"}</small>
            </div>)}
          </div>}
    </section>;
  } else if (section === "quality") {
    const queue = await researchQualityReviewQueue(principal, study.slug);
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Quality" title="Response QA" note="Only the manual quality-review queue is loaded here." />
      {canManage
        ? <ResearchStudyQualityControls slug={study.slug} csrfToken={principal.csrfToken} initialItems={queue} />
        : <div className="workspace-inline-note">{queue.length} item(s) currently require review. Resolution requires Research management permission.</div>}
    </section>;
  } else if (section === "protocol") {
    const events = await researchProtocolEvents(principal, study.slug);
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Protocol" title="Deviations & amendments" note="Protocol evidence is separated from day-to-day fieldwork controls." />
      {canManage
        ? <ResearchStudyProtocolControls slug={study.slug} csrfToken={principal.csrfToken} studyStatus={study.status} events={events} />
        : <div className="workspace-inline-note">{events.length} protocol event(s) recorded. Changes require Research management permission.</div>}
    </section>;
  } else if (section === "lifecycle") {
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Lifecycle" title="Lifecycle & publication" note="Controlled state transitions live on this page only." />
      <div className="workspace-queue-card">
        <div className="workspace-action-bar"><span>Study</span><WorkspaceStatusBadge status={study.status} label={study.status} /></div>
        <div className="workspace-action-bar"><span>Instrument</span><WorkspaceStatusBadge status={study.instrumentStatus ?? "missing"} label={study.instrumentStatus ?? "missing"} /></div>
        <div className="workspace-action-bar"><span>Analysis plan</span><strong>{study.analysisPlanVersion ?? "missing"} · {study.analysisPlanStatus ?? "not locked"}</strong></div>
        {canManage && <ResearchStudyLifecycleControls
          slug={study.slug}
          csrfToken={principal.csrfToken}
          studyStatus={study.status}
          instrumentStatus={study.instrumentStatus}
          analysisPlanStatus={study.analysisPlanStatus}
          latestReleaseVersion={study.latestReleaseVersion}
          latestReleasePublishedAt={study.latestReleasePublishedAt}
        />}
      </div>
    </section>;
  } else if (section === "evidence") {
    content = <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Evidence chain" title="The release must be reconstructable" note="Each stage remains separately versioned. No published result should exist without a traceable frame, sample, instrument, weights and analysis run." />
      <div className="analytics-workflow-grid">
        <article className="analytics-workflow-card"><span>01 · Frame</span><strong>Frozen target population</strong><small>Population snapshot, eligibility rules, stratum counts and content hash.</small></article>
        <article className="analytics-workflow-card"><span>02 · Sample</span><strong>Reproducible selection</strong><small>Algorithm version, random seed, inclusion probability and base weight for every selected unit.</small></article>
        <article className="analytics-workflow-card"><span>03 · Fieldwork</span><strong>Governed invitations</strong><small>Canonical invite identity, contact attempts, expiry, reminders and research consent.</small></article>
        <article className="analytics-workflow-card"><span>04 · Response</span><strong>Immutable completed response</strong><small>Questionnaire version, raw answers, experiment assignment and scoring version.</small></article>
        <article className="analytics-workflow-card"><span>05 · Analysis</span><strong>Locked plan + weights + code</strong><small>Pre-fieldwork analysis-plan hash, weighting evidence and code version bound to the analysis run.</small></article>
        <article className="analytics-workflow-card"><span>06 · Release</span><strong>Public reproducibility snapshot</strong><small>Methodology JSON, dataset hash, artifact hash and exact publication version.</small></article>
      </div>
    </section>;
  }

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel={"Research · " + study.title} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · {sectionMeta?.label ?? section}</div>
      <h1>{study.title}</h1>
      <p className="lead">{sectionMeta?.description}</p>
    </div></section>
    <ResearchSurveyAdminNav slug={study.slug} current={section} />
    {content}
  </main>;
}
