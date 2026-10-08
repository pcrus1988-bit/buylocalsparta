import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { researchSurveyAdminFastOverview } from "../../../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Research · Guided study workflow",
  robots: { index: false, follow: false }
};
export const dynamic = "force-dynamic";

type Phase = "pilot" | "main";
type Study = NonNullable<Awaited<ReturnType<typeof researchSurveyAdminFastOverview>>["study"]>;
type GuideStep = Readonly<{ title: string; description: string; href: string; verified?: boolean; evidence?: string; caution?: string }>;

function guideSteps(study: Study, root: string, phase: Phase): GuideStep[] {
  const planLocked = study.analysisPlanStatus === "locked";
  const instrumentLocked = study.instrumentStatus === "locked" || study.instrumentStatus === "fielding";
  const pilotStarted = Boolean(study.pilotStartedAt);
  const pilotClosed = Boolean(study.pilotEndedAt);
  const mainStarted = Boolean(study.fieldworkStartsAt);
  const closed = ["closed","analysis","published","archived"].includes(study.status);
  const analysis = ["analysis","published","archived"].includes(study.status);
  if (phase === "pilot") return [
    { title: "Set the study scope and closing date", description: "Confirm who is eligible, the research objective, the public methodology and the deadline in Europe/Athens.", href: root + "/settings" },
    { title: "Review and lock the questionnaire", description: "Test wording, required fields, branching, mobile completion and the primary business activity question. Lock only after review.", href: root + "/questions", verified: instrumentLocked, evidence: study.instrumentVersion ? "Instrument " + study.instrumentVersion : undefined },
    { title: "Lock the evaluation plan", description: "Preregister the intended indicators and standard breakdowns before exposing any participants.", href: root + "/evaluation", verified: planLocked, evidence: study.analysisPlanVersion ? "Plan " + study.analysisPlanVersion : undefined },
    { title: "Freeze the frame and inspect contacts", description: "Verify ΚΑΔ classification, coverage, active emails and opt-outs. A snapshot count is not a substitute for confirming it is frozen.", href: root + "/sampling", verified: study.frameStatus === "frozen", evidence: study.framePopulation ? study.framePopulation.toLocaleString("el-GR") + " in latest frame" : undefined },
    { title: "Open Pilot mode", description: "Only after questionnaire and evaluation locks. Pilot is a diagnostic phase, not a public-results launch.", href: root + "/lifecycle", verified: pilotStarted },
    { title: "Draw a Pilot-only sample", description: "Use the Pilot sampling mode and a small diagnostic target. Never reuse this draw as the main probability sample.", href: root + "/sampling", verified: study.status === "pilot" && study.sampleUnits > 0 && ["locked", "fielded"].includes(study.sampleStatus ?? "") && study.samplePhase === "pilot", evidence: study.status === "pilot" ? study.sampleUnits.toLocaleString("el-GR") + " selected in Pilot phase" : undefined },
    { title: "Inspect template, recipients and double-confirm sending", description: "Treat Pilot as a real email campaign. Check purpose, limited recipient count, unsubscribe, privacy notice and deadline.", href: root + "/fieldwork", evidence: study.status === "pilot" ? study.invites.toLocaleString("el-GR") + " Pilot invitations" : undefined, caution: "Sending emails has real external effects even during Pilot." },
    { title: "Rehearse email, link, submission and Admin notices", description: "Use the isolated simulator with your own mailbox first. It validates the test-only email and submission pipeline without touching Pilot data. Separately test actual Pilot questionnaire branching, consent and opt-outs with genuine Pilot invites.", href: root + "/simulation" },
    { title: "Review quality and document findings", description: "Record confusing questions, failed jobs, delivery problems, required revisions and corrections. Pilot responses are diagnostic, not main estimates.", href: root + "/quality" },
    { title: "Close Pilot and approve the final design", description: "Check the Protocol and close out all Pilot send/sample jobs before transitioning to main fieldwork. Verify the holdout is respected.", href: root + "/lifecycle", verified: pilotClosed, caution: "Main sampling must take place after closing the Pilot." }
  ];
  return [
    { title: "Sign off the Pilot", description: "Confirm the Pilot has closed and all important findings were resolved. If no Pilot was run, record that exception explicitly in the Protocol.", href: root + "/protocol", verified: pilotClosed, caution: "A direct Draft → Main transition may be technically possible; the guided process requires explicit Pilot review." },
    { title: "Check locked instrument, evaluation and frozen frame", description: "Verify the final questionnaire, preregistration and frozen frame have the correct wave and version.", href: root + "/evaluation", verified: instrumentLocked && planLocked && study.frameStatus === "frozen", evidence: study.framePopulation ? study.framePopulation.toLocaleString("el-GR") + " frame units (freeze status requires review)" : undefined },
    { title: "Open main fieldwork", description: "Use Lifecycle only after Pilot closeout, no running Pilot jobs and the required study approvals.", href: root + "/lifecycle", verified: mainStarted, caution: "Transitioning ends the Pilot; do not do this to test a button." },
    { title: "Draw the separate main sample", description: "Use Sampling in MAIN mode after Pilot closeout. Review strata, target completions, response assumptions, random seed and Pilot holdouts.", href: root + "/sampling", verified: mainStarted && study.sampleUnits > 0 && study.samplePhase === "main" && ["locked", "fielded"].includes(study.sampleStatus ?? ""), evidence: mainStarted ? study.sampleUnits.toLocaleString("el-GR") + " current main-phase units" : undefined },
    { title: "Verify contactability, suppression and ΚΑΔ", description: "Review the recipient list, bounced addresses, opt-outs, missing activity categories and the frozen sampling frame.", href: root + "/contacts" },
    { title: "Approve final invitation content and sending batch", description: "Confirm the study name, purpose, live template, exact selected recipient count, link expiration, legal information and both send confirmations.", href: root + "/fieldwork", evidence: mainStarted ? study.invites.toLocaleString("el-GR") + " main-phase invitations" : undefined, caution: "Never retry a timed-out send without first checking Invitations and Jobs." },
    { title: "Monitor progress, reminders and deliverability", description: "Monitor strata, response rates, opt-outs, bounces and DELIVERY_DELAY. Reminders must follow the study schedule and suppression list.", href: root + "/balance", evidence: mainStarted ? study.completed.toLocaleString("el-GR") + " current main-phase completions" : undefined },
    { title: "Resolve exclusions and protocol deviations", description: "Review suspicious responses, record any exclusions or method changes, and retain provenance.", href: root + "/quality" },
    { title: "Close the survey at its Athens-time deadline", description: "Stop participation and ensure active invitation links expire. Check that outstanding jobs are handled.", href: root + "/lifecycle", verified: closed },
    { title: "Run and verify the preregistered evaluation", description: "Check denominators, missing values, strata, uncertainty, data quality and difference between pre-planned and exploratory outputs.", href: root + "/evaluation", verified: analysis },
    { title: "Approve and publish the aggregate release", description: "Review the final evidence, suppression-safe public tables and methodology. Publication is a separate controlled action.", href: root + "/lifecycle", verified: study.status === "published" || study.status === "archived", caution: "Never publish personal contact details, individual replies or invitation tokens." }
  ];
}

async function LiveWorkflow({ principal, slug, phase }: { principal: SessionPrincipal; slug: string; phase: Phase }) {
  let overview: Awaited<ReturnType<typeof researchSurveyAdminFastOverview>>;
  try {
    overview = await researchSurveyAdminFastOverview(principal, slug);
  } catch {
    return <section className="shell vendor-section" role="status"><div className="workspace-inline-note form-error">
      Live Research status cannot be verified at the moment. The guide is available in the handbook, but no step can be marked complete until the database responds.
    </div></section>;
  }
  if (!overview.databaseConfigured || !overview.study) return <section className="shell vendor-section">
    <div className="workspace-inline-note form-error">This study or its production Research schema is unavailable. No readiness checks can be verified.</div>
  </section>;
  const study = overview.study;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const steps = guideSteps(study, root, phase);
  const confirmed = steps.filter((step) => step.verified === true).length;
  const hasFailedJobs = study.failedJobs > 0;
  return <>
    <section className="shell vendor-section">
      <div className="workspace-action-bar" style={{ alignItems: "flex-start", gap: 12 }}>
        <span><strong>{study.title}</strong><br />
          Live phase: {study.status} · {confirmed} of {steps.length} steps have automatically verifiable evidence.
          Other steps require a human review; they are never auto-marked complete.
        </span>
        <Link className="button button-secondary" href={root}>Survey overview</Link>
      </div>
      {hasFailedJobs && <div className="workspace-inline-note form-error" style={{ marginTop: 12 }}>
        {study.failedJobs} failed Research job(s). Investigate jobs and evidence before any phase change or release.
      </div>}
      {phase === "pilot" && <div className="workspace-inline-note" style={{ marginTop: 12 }}>
        <strong>Test only:</strong> the Pilot validates the process and uses a separate sample. Pilot answers are not part of main-study statistics. Invitations are real external emails if you send them.
      </div>}
      {phase === "main" && !study.pilotEndedAt && <div className="workspace-inline-note form-error" style={{ marginTop: 12 }}>
        Pilot closeout has not been verified. Do not launch the official recruitment campaign without documented exception review.
      </div>}
    </section>
    <section className="shell vendor-section" aria-label={phase === "pilot" ? "Pilot workflow steps" : "Main-study workflow steps"}>
      <WorkspaceSectionHeading eyebrow={phase === "pilot" ? "Pilot · Test workflow" : "Main · Official research"} title="Follow the steps in order"
        note="Each step takes you to the correct operational page. Readiness is deliberately conservative: unchecked does not necessarily mean failed; complete the manual review before continuing." />
      <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 }}>
        {steps.map((step, index) => <li className="workspace-queue-card" key={step.title}>
          <div className="workspace-action-bar" style={{ alignItems: "flex-start", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flex: 1, alignItems: "flex-start" }}>
              <span aria-hidden="true" style={{ flexShrink: 0, fontWeight: 700, fontSize: 20 }}>{index + 1}.</span>
              <div>
                <strong>{step.title}</strong>
                <p style={{ margin: "7px 0" }}>{step.description}</p>
                {step.evidence && <small>Observed: {step.evidence}</small>}
                {step.caution && <p className="workspace-inline-note" style={{ margin: "8px 0 0" }}>{step.caution}</p>}
              </div>
            </div>
            <span aria-label={step.verified ? "Verified" : "Manual verification needed"} style={{ fontWeight: 600 }}>
              {step.verified ? "✓ Verified" : "○ Review"}
            </span>
          </div>
          <div className="workspace-action-buttons" style={{ marginTop: 12 }}>
            <Link className="button button-secondary" href={step.href}>Open this step →</Link>
          </div>
        </li>)}
      </ol>
    </section>
  </>;
}

export default async function ResearchSurveyWorkflowPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ phase?: string }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  const phase: Phase = (await searchParams).phase === "main" ? "main" : "pilot";
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Guided workflow" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Guided workflow</div>
      <h1>{phase === "pilot" ? "Pilot — safe test run" : "Official study — guided launch"}</h1>
      <p className="lead">One decision at a time. Continue only after reviewing the step and its evidence.</p>
      <div className="hero-actions">
        <Link className={phase === "pilot" ? "button" : "button button-secondary"} aria-current={phase === "pilot" ? "page" : undefined} href={root + "/workflow?phase=pilot"}>Pilot guide</Link>
        <Link className={phase === "main" ? "button" : "button button-secondary"} aria-current={phase === "main" ? "page" : undefined} href={root + "/workflow?phase=main"}>Main-study guide</Link>
        <Link className="button button-secondary" href="/admin/research/handbook">Admin handbook</Link>
      </div>
    </div></section>
    <Suspense fallback={<section className="shell vendor-section" role="status">
      <div className="workspace-inline-note">The guided actions are visible after the lightweight study status check. The handbook remains available independently.</div>
    </section>}>
      <LiveWorkflow principal={principal} slug={slug} phase={phase} />
    </Suspense>
  </main>;
}
