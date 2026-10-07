import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { ResearchStudyFieldworkControls } from "../../../../components/ResearchStudyFieldworkControls";
import { ResearchStudyFieldworkBalance } from "../../../../components/ResearchStudyFieldworkBalance";
import { ResearchStudyLifecycleControls } from "../../../../components/ResearchStudyLifecycleControls";
import { ResearchStudyQualityControls } from "../../../../components/ResearchStudyQualityControls";
import { ResearchStudyProtocolControls } from "../../../../components/ResearchStudyProtocolControls";
import { ResearchStudyOperationsPanel } from "../../../../components/ResearchStudyOperationsPanel";
import { ResearchStudySamplingControls } from "../../../../components/ResearchStudySamplingControls";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchQualityReviewQueue } from "../../../../lib/research-survey-quality";
import { researchDeliveryDelayQueue, researchFieldworkStrata, researchProtocolEvents, researchSurveyAdminOverview, researchSurveyOperationsOverview } from "../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Survey Control Center",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

function percentage(numerator: number, denominator: number): string {
  if (denominator <= 0) return "—";
  return new Intl.NumberFormat("el-GR", { maximumFractionDigits: 1 }).format((numerator / denominator) * 100) + "%";
}

export default async function ResearchSurveysAdminPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const overview = await researchSurveyAdminOverview(principal);
  const qualityQueues = new Map(
    await Promise.all(overview.studies.map(async (study) => [
      study.slug,
      await researchQualityReviewQueue(principal, study.slug)
    ] as const))
  );
  const fieldworkStrata = new Map(
    await Promise.all(overview.studies.map(async (study) => [
      study.slug,
      await researchFieldworkStrata(principal, study.slug)
    ] as const))
  );
  const protocolEvents = new Map(
    await Promise.all(overview.studies.map(async (study) => [
      study.slug,
      await researchProtocolEvents(principal, study.slug)
    ] as const))
  );
  const deliveryDelays = new Map(
    await Promise.all(overview.studies.map(async (study) => [
      study.slug,
      await researchDeliveryDelayQueue(principal, study.slug)
    ] as const))
  );
  const operations = new Map(
    await Promise.all(overview.studies.map(async (study) => [
      study.slug,
      await researchSurveyOperationsOverview(principal, study.slug)
    ] as const))
  );

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Surveys" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Survey Control Center</div>
      <h1>Survey Control Center</h1>
      <p className="lead">Choose a survey, review its live state and manage its sampling, fieldwork, email, quality, protocol, lifecycle and publication settings from one place.</p>
      <div className="hero-actions">
        <Link className="button button-secondary" href="/research/greek-retail-2026/methodology">Public methodology</Link>
        <Link className="button button-secondary" href="/research/greek-retail-2026/results">Public results</Link>
      </div>
    </div></section>

    {overview.databaseConfigured && overview.studies.length > 0 && <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Research"
        title="Surveys"
        note="Each survey has its own control center and settings below. Choose one to jump directly to it."
      />
      <div className="analytics-workflow-grid">
        {overview.studies.map((study) => <article className="analytics-workflow-card" key={study.id}>
          <span>{study.status.toUpperCase()}</span>
          <strong>{study.title}</strong>
          <small>{study.slug} · instrument {study.instrumentVersion ?? "—"} · {study.completed.toLocaleString("el-GR")} completed</small>
          <Link className="button button-secondary" href={"#survey-" + study.slug}>Open control center</Link>
        </article>)}
      </div>
    </section>}

    {!overview.databaseConfigured
      ? <section className="shell vendor-section"><WorkspaceEmptyState title="Research database is not available." body="The Research admin surface will activate when the production Research schema is available." /></section>
      : overview.studies.length === 0
        ? <section className="shell vendor-section"><WorkspaceEmptyState title="No research studies have been created." /></section>
        : overview.studies.map((study) => <div id={"survey-" + study.slug} key={study.id}>
          <WorkspaceMetricStrip items={[
            { label: "Population frame", value: study.framePopulation.toLocaleString("el-GR"), hint: String(study.frameCount) + " snapshot(s)" },
            { label: "Selected sample", value: study.sampleUnits.toLocaleString("el-GR"), hint: String(study.sampleDrawCount) + " draw(s)" },
            { label: "Contactable units", value: study.activeContacts.toLocaleString("el-GR"), hint: String(study.suppressedContacts) + " suppressed/invalid · " + String(study.bouncedContacts) + " bounced" },
            { label: "Invitations", value: study.invites.toLocaleString("el-GR"), hint: String(study.inviteBatches) + " batch(es) · " + String(study.sent) + " sent/opened/started" },
            { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: String(study.started) + " responses started" }
          ]} />
          <WorkspaceMetricStrip items={[
            { label: "Sent", value: study.sent.toLocaleString("el-GR"), hint: percentage(study.sent, study.sampleUnits) + " of selected sample" },
            { label: "Delivered", value: study.delivered.toLocaleString("el-GR"), hint: percentage(study.delivered, study.sent) + " of sent invitations" },
            { label: "Temporarily delayed", value: (study.invitationDelayed + study.reminderDelayed).toLocaleString("el-GR"), hint: String(study.invitationDelayed) + " initial · " + String(study.reminderDelayed) + " reminders · SES still retrying" },
            { label: "Opened", value: study.opened.toLocaleString("el-GR"), hint: percentage(study.opened, study.delivered || study.sent) + " of delivered" },
            { label: "Started", value: study.started.toLocaleString("el-GR"), hint: percentage(study.started, study.opened || study.sent) + " of opened" },
            { label: "Completed", value: study.completed.toLocaleString("el-GR"), hint: percentage(study.completed, study.sent) + " of sent · " + percentage(study.completed, study.started) + " of starts · " + String(study.withdrawn) + " withdrawn" }
          ]} />
          <WorkspaceMetricStrip items={[
            { label: "QA review", value: study.qualityReview.toLocaleString("el-GR"), hint: String(study.qualityExclude) + " excluded by reviewed rules" },
            { label: "Reward eligible", value: study.rewardEligible.toLocaleString("el-GR"), hint: String(study.rewardIssued) + " issued · " + String(study.rewardRedeemed) + " redeemed · " + String(study.rewardDeliveryDelayed) + " delayed · " + String(study.rewardDeliveryFailed) + " failed" },
            { label: "Results notices", value: study.resultsNotificationSent.toLocaleString("el-GR"), hint: String(study.resultsNotificationDelayed) + " delayed · " + String(study.resultsNotificationFailed) + " failed" },
            { label: "Analysis estimates", value: study.analysisEstimates.toLocaleString("el-GR"), hint: String(study.analysisRuns) + " analysis run(s)" },
            { label: "Evidence releases", value: study.releases, hint: "Versioned methodology + dataset/artifact hashes" }
          ]} />
          <section className="shell vendor-section">
            <WorkspaceSectionHeading
              eyebrow={"Survey · " + study.slug}
              title={study.title}
              note={"Instrument " + (study.instrumentVersion ?? "—")}
              action={<WorkspaceStatusBadge status={study.status} label={study.status} />}
            />
            <div className="workspace-queue-card" id={"survey-settings-" + study.slug}>
              <div className="workspace-action-bar">
                <span>
                  <strong>Survey settings</strong><br />
                  All controls below apply only to <strong>{study.title}</strong>. Use this navigation to move between the survey's configuration areas.
                </span>
                <WorkspaceStatusBadge status={study.status} label={study.status} />
              </div>
              <div className="workspace-action-buttons" style={{ flexWrap: "wrap" }}>
                <a className="button button-secondary" href={"#survey-sampling-" + study.slug}>Sampling</a>
                <a className="button button-secondary" href={"#survey-fieldwork-" + study.slug}>Email templates & fieldwork</a>
                <a className="button button-secondary" href={"#survey-contacts-" + study.slug}>Email contacts</a>
                <a className="button button-secondary" href={"#survey-invitations-" + study.slug}>Invitations</a>
                <a className="button button-secondary" href={"#survey-kad-" + study.slug}>ΚΑΔ</a>
                <a className="button button-secondary" href={"#survey-consent-" + study.slug}>Consent</a>
                <a className="button button-secondary" href={"#survey-delivery-" + study.slug}>Delivery</a>
                <a className="button button-secondary" href={"#survey-quality-" + study.slug}>Quality</a>
                <a className="button button-secondary" href={"#survey-protocol-" + study.slug}>Protocol</a>
                <a className="button button-secondary" href={"#survey-lifecycle-" + study.slug}>Lifecycle & publication</a>
                <a className="button button-secondary" href={"#survey-evidence-" + study.slug}>Evidence</a>
              </div>
            </div>
            <div className="workspace-queue-card">
              <div className="workspace-action-bar">
                <span>Instrument status</span>
                <WorkspaceStatusBadge status={study.instrumentStatus ?? "missing"} label={study.instrumentStatus ?? "missing"} />
              </div>
              <div className="workspace-action-bar">
                <span>Analysis plan</span>
                <strong>
                  {study.analysisPlanVersion ?? "missing"} · {study.analysisPlanStatus ?? "not locked"}
                  {study.analysisPlanSha256 ? " · " + study.analysisPlanSha256.slice(0, 12) + "…" : ""}
                </strong>
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

            {hasAdminPermission(principal, "research.manage") && <div id={"survey-sampling-" + study.slug}><ResearchStudySamplingControls
              slug={study.slug}
              csrfToken={principal.csrfToken}
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
            /></div>}

            <div id={"survey-balance-" + study.slug}>
              <ResearchStudyFieldworkBalance strata={fieldworkStrata.get(study.slug) ?? []} />
            </div>

            {hasAdminPermission(principal, "research.manage") && <div id={"survey-quality-" + study.slug}><ResearchStudyQualityControls
              slug={study.slug}
              csrfToken={principal.csrfToken}
              initialItems={qualityQueues.get(study.slug) ?? []}
            /></div>}

            {hasAdminPermission(principal, "research.manage") && <div id={"survey-fieldwork-" + study.slug}><ResearchStudyFieldworkControls
              slug={study.slug}
              studyTitle={study.title}
              csrfToken={principal.csrfToken}
              studyStatus={study.status}
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
            /></div>}

            <ResearchStudyOperationsPanel
              slug={study.slug}
              data={operations.get(study.slug) ?? {
                databaseConfigured: overview.databaseConfigured,
                studyFound: false,
                canViewContactValues: false,
                totalContacts: 0,
                templates: [],
                contacts: [],
                invitations: [],
                kadGroups: [],
                consents: []
              }}
            />

            <div id={"survey-delivery-" + study.slug}>
            {(deliveryDelays.get(study.slug)?.length ?? 0) > 0 && <div className="workspace-queue-card">
              <div className="workspace-action-bar">
                <span>
                  <strong>SES delivery delays</strong><br />
                  Temporary delivery problems. SES is still retrying; these addresses are not suppressed unless a later permanent bounce or complaint is received.
                </span>
                <WorkspaceStatusBadge status="warning" label={(deliveryDelays.get(study.slug)?.length ?? 0) + " active"} />
              </div>
              {(deliveryDelays.get(study.slug) ?? []).map((item) => <div className="workspace-action-bar" key={item.id}>
                <span>
                  <strong>{item.messageKind}</strong><br />
                  {item.delayType ?? "Undetermined"}
                  {item.smtpStatus ? " · SMTP " + item.smtpStatus : ""}
                  {item.diagnosticCode ? " · " + item.diagnosticCode : ""}
                </span>
                <small>
                  {item.expirationTime
                    ? "SES retries until " + new Date(item.expirationTime).toLocaleString("el-GR")
                    : item.occurredAt
                      ? "Reported " + new Date(item.occurredAt).toLocaleString("el-GR")
                      : "Temporary delay"}
                </small>
              </div>)}
            </div>}
            </div>

            {study.failedJobs > 0 && <div className="workspace-inline-note form-error">
              {study.failedJobs} research job(s) require review before relying on the evidence chain.
            </div>}

            {hasAdminPermission(principal, "research.manage") && <div id={"survey-protocol-" + study.slug}><ResearchStudyProtocolControls
              slug={study.slug}
              csrfToken={principal.csrfToken}
              studyStatus={study.status}
              events={protocolEvents.get(study.slug) ?? []}
            /></div>}

            {hasAdminPermission(principal, "research.manage") && <div id={"survey-lifecycle-" + study.slug}><ResearchStudyLifecycleControls
              slug={study.slug}
              csrfToken={principal.csrfToken}
              studyStatus={study.status}
              instrumentStatus={study.instrumentStatus}
              analysisPlanStatus={study.analysisPlanStatus}
              latestReleaseVersion={study.latestReleaseVersion}
              latestReleasePublishedAt={study.latestReleasePublishedAt}
            /></div>}

            <div id={"survey-evidence-" + study.slug}>
            <WorkspaceSectionHeading
              eyebrow="Evidence chain"
              title="The release must be reconstructable"
              note="Each stage remains separately versioned. No published result should exist without a traceable frame, sample, instrument, weights and analysis run."
            />
            <div className="analytics-workflow-grid">
              <article className="analytics-workflow-card"><span>01 · Frame</span><strong>Frozen target population</strong><small>G.E.MI. population snapshot, eligibility rules, stratum counts and content hash.</small></article>
              <article className="analytics-workflow-card"><span>02 · Sample</span><strong>Reproducible selection</strong><small>Algorithm version, random seed, inclusion probability and base weight for every selected unit.</small></article>
              <article className="analytics-workflow-card"><span>03 · Fieldwork</span><strong>Tokenized invitations + governed reminders</strong><small>One canonical invite/response identity, opaque SHA-256 token aliases for recontact, separate contact attempts and explicit research consent.</small></article>
              <article className="analytics-workflow-card"><span>04 · Evidence</span><strong>Immutable completed response</strong><small>Questionnaire version, raw answers, optional experiment assignment and scoring version.</small></article>
              <article className="analytics-workflow-card"><span>05 · Analysis</span><strong>Locked plan + weights + code</strong><small>Pre-fieldwork analysis-plan hash, base/non-response weights and code version bound to the same auditable analysis run.</small></article>
              <article className="analytics-workflow-card"><span>06 · Release</span><strong>Public reproducibility snapshot</strong><small>Methodology JSON, dataset hash, artifact hash and exact publication version.</small></article>
            </div>
            </div>
          </section>
        </div>)}
  </main>;
}
