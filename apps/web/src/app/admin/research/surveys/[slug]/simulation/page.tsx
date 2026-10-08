import type { Metadata } from "next";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../../../components/AdminWorkspaceHeader";
import { ResearchSurveyAdminNav } from "../../../../../../components/ResearchSurveyAdminNav";
import { ResearchWorkflowSimulator } from "../../../../../../components/ResearchWorkflowSimulator";
import { ResearchSurveySimulationView } from "../../../../../../components/ResearchSurveySimulationView";
import { hasAdminPermission } from "../../../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../../../lib/admin-session";
import { validSimulationSlug } from "../../../../../../lib/research-workflow-simulation";
import { listResearchSimulationStudies, loadResearchSimulationContext } from "../../../../../../lib/research-survey-simulation-preview";

export const metadata: Metadata = {
  title: "Research · Workflow & Survey Simulation",
  robots: { index: false, follow: false, noarchive: true }
};
export const dynamic = "force-dynamic";

async function SurveyMode({ principal, slug, requested }: {
  principal: SessionPrincipal; slug: string; requested?: string;
}) {
  const root = "/admin/research/surveys/" + encodeURIComponent(slug) + "/simulation";
  let studies: Awaited<ReturnType<typeof listResearchSimulationStudies>>;
  try { studies = await listResearchSimulationStudies(principal); }
  catch { return <section className="shell vendor-section" role="alert">Unable to load the Research survey list. Please retry.</section>; }
  if (!studies.length) return <section className="shell vendor-section">No surveys are available for preview.</section>;
  const selected = studies.find((study) => study.slug === requested)
    ?? studies.find((study) => study.slug === slug) ?? studies[0]!;
  let context: Awaited<ReturnType<typeof loadResearchSimulationContext>>;
  try { context = await loadResearchSimulationContext(principal, selected.slug); }
  catch { return <section className="shell vendor-section" role="alert">The questionnaire could not be loaded. Please retry.</section>; }
  const surveyUrl = root + "?mode=survey&survey=" + encodeURIComponent(selected.slug);
  return <>
    <section className="shell vendor-section">
      <h2>Choose a survey to simulate</h2>
      <p>Explore the actual saved questionnaire before the Pilot. The preview reproduces the participant flow, including consent, question controls and completion.</p>
      <form action={root} method="GET" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
        <input type="hidden" name="mode" value="survey" />
        <label style={{ display: "grid", gap: 8, flex: "1 1 280px" }}>
          <strong>Survey</strong>
          <select name="survey" className="input" defaultValue={selected.slug} aria-label="Choose a survey">
            {studies.map((study) => <option key={study.slug} value={study.slug}>
              {study.title} · {study.instrumentVersion ? "Instrument " + study.instrumentVersion : "No instrument"} · {study.status}
            </option>)}
          </select>
        </label>
        <button className="button" type="submit">Preview selected survey</button>
      </form>
      {context && context.questions.length > 0 && <div className="workspace-action-buttons" style={{ marginTop: 16 }}>
        <Link prefetch={false} className="button button-secondary" target="_blank" rel="noopener noreferrer"
          href={"/admin/research/surveys/" + encodeURIComponent(slug) + "/simulation/preview?survey=" + encodeURIComponent(selected.slug)}>
          Open full-screen participant preview ↗</Link>
        <Link prefetch={false} className="button button-secondary"
          href={"/admin/research/surveys/" + encodeURIComponent(selected.slug) + "/questions"}>Edit questionnaire</Link>
      </div>}
      <div className="workspace-inline-note" style={{ marginTop: 14 }}>
        <strong>Simulation only.</strong> No real participant, invitation, response, contact, consent or email is created.
        Experimental cards, where available, show illustrative—not participant-assigned—options.
      </div>
    </section>
    {!context || !context.questions.length
      ? <section className="shell vendor-section">This survey has no active instrument with questions. Open its Questions page to configure it first.</section>
      : <section aria-label="Real questionnaire preview">
          <ResearchSurveySimulationView context={context} returnHref={surveyUrl} />
        </section>}
  </>;
}

export default async function ResearchSimulationAdminPage({ params, searchParams }: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ mode?: string | string[]; survey?: string | string[] }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");
  const { slug } = await params;
  if (!validSimulationSlug(slug)) redirect("/admin/research/surveys");
  const query = await searchParams;
  const mode = query.mode === "survey" ? "survey" : "workflow";
  const requested = typeof query.survey === "string" && validSimulationSlug(query.survey) ? query.survey : undefined;
  const root = "/admin/research/surveys/" + encodeURIComponent(slug);
  const simulationRoot = root + "/simulation";
  const canSend = hasAdminPermission(principal, "research.manage");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Simulation" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Before the Pilot</div>
      <h1>Simulation Environment</h1>
      <p className="lead">Choose either a delivery workflow check or a full, participant-facing preview of any survey. Neither starts the Pilot.</p>
      <div className="hero-actions">
        <Link prefetch={false} className="button button-secondary" href={root}>Survey overview</Link>
        <Link prefetch={false} className="button button-secondary" href={root + "/workflow?phase=pilot"}>Pilot guide</Link>
      </div>
    </div></section>
    <ResearchSurveyAdminNav slug={slug} current="simulation" />
    <section className="shell vendor-section">
      <h2>Choose your simulation</h2>
      <div className="analytics-workflow-grid">
        <article className="analytics-workflow-card">
          <span>1 · Email and link testing</span><strong>Simulation workflow check</strong>
          <small>Test inbox delivery, a private link, sample submissions and Admin notifications.</small>
          <Link prefetch={false} className={mode === "workflow" ? "button" : "button button-secondary"}
            aria-current={mode === "workflow" ? "page" : undefined}
            href={simulationRoot + "?mode=workflow"}>Choose workflow check</Link>
        </article>
        <article className="analytics-workflow-card">
          <span>2 · Actual questionnaire preview</span><strong>Simulate a survey</strong>
          <small>Choose a survey and see its real participant consent, questions, navigation and final screen.</small>
          <Link prefetch={false} className={mode === "survey" ? "button" : "button button-secondary"}
            aria-current={mode === "survey" ? "page" : undefined}
            href={simulationRoot + "?mode=survey"}>Choose survey preview</Link>
        </article>
      </div>
    </section>
    {mode === "workflow"
      ? canSend
        ? <ResearchWorkflowSimulator slug={slug} csrfToken={principal.csrfToken} />
        : <section className="shell vendor-section">Sending real test emails requires Research management permission. Survey preview is available with Research read permission.</section>
      : <Suspense fallback={<section className="shell vendor-section" role="status">Loading only the selected study and its questions…</section>}>
          <SurveyMode principal={principal} slug={slug} requested={requested} />
        </Suspense>}
  </main>;
}
