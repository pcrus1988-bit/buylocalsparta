import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";

export const metadata: Metadata = {
  title: "Research · Admin handbook",
  robots: { index: false, follow: false }
};

const TOPICS = [
  {
    heading: "0. Isolated workflow simulation (before Pilot)",
    description: "Open Workflow simulation inside your survey. This is a separate safe rehearsal, not Pilot and not official fieldwork. The sample form tests mechanics only; it is not the full official instrument.",
    checks: ["Run a no-email preview to check link opening and expiry.", "Optionally send exactly one manually approved real SES email to an inbox you control.", "Check whether you actually received it; SES acceptance alone is not delivery proof.", "Submit the sample test answers, copy the receipt and verify it in Admin.", "Send and manually confirm the separate Admin test notice. Reset the simulation when finished.", "For genuine question branching, consent, opt-out and duplicate prevention, additionally test a real limited Pilot invitation."]
  },
  {
    heading: "1. Study design",
    description: "Start in the survey workspace. Set the population, scope, methodology, closing time in Europe/Athens, and publication destination. Edit the questionnaire, including any primary-activity question needed for later ΚΑΔ canonicalization. Define analysis measures before any data are collected.",
    checks: ["Preview every question on mobile and desktop.", "Verify routing, required answers, consent language and the privacy FAQ.", "Lock the questionnaire and preregistered evaluation plan before starting the Pilot."]
  },
  {
    heading: "2. The Pilot — a real-world process test",
    description: "The Pilot tests comprehension, questionnaire flow, invitations, deliverability, opt-outs, response quality and the complete operational process. It is not the main statistical study. Pilot participants belong to a separate fieldwork phase and are held out of the main sample.",
    checks: ["Build a frozen population frame and use a small, explicitly designated Pilot draw.", "Review the Pilot email template, recipient count, purpose and recipients; send only after explicit confirmation.", "Check links, expiry, consent, bounce handling, suppression and survey completion end-to-end.", "Record issues and corrections in the Protocol. Review Pilot responses for diagnostic purposes only.", "Close out Pilot activity before opening the main phase. Never merge Pilot responses into published main estimates."]
  },
  {
    heading: "3. Main-study launch",
    description: "Move to main fieldwork only after the Pilot has been assessed, pending Pilot jobs have ended and the frozen frame and locked evaluation plan are ready. Draw the main probability sample after Pilot closeout, so the exposed Pilot units can be excluded.",
    checks: ["Review frame date, strata, ΚΑΔ coverage, contactability and suppression status.", "Confirm desired completions, expected response rate and sample seed.", "Test the final email, privacy details, opt-out, invitation deadline and Athens-time closing date.", "Double-confirm the survey, purpose, exact recipient count and batch before sending.", "Monitor live fieldwork balance, contacts, delivery delays, bounced addresses, opt-outs and reminders."]
  },
  {
    heading: "4. Closing, analysis and publication",
    description: "After the official deadline, stop collection and preserve the evidence chain. Complete response-quality review and work through the preregistered analysis. Any analysis added later must be explicitly identified as exploratory.",
    checks: ["Check incomplete and failed jobs, data-quality exclusions and unresolved deviations.", "Verify denominators, strata, confidence/uncertainty and publication-safe aggregation.", "Review results and explanatory limitations; use a controlled release rather than publishing raw participant records.", "Confirm the released results and the public methodology page."]
  }
] as const;

export default async function ResearchHandbookPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Handbook" />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Research · Εγχειρίδιο διαχειριστή</div>
        <h1>Admin handbook</h1>
        <p className="lead">From a safe Pilot to a defensible published study. Use the guided workflow within each survey for the live status and the exact next action.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/research/surveys">Choose a study</Link>
          <Link className="button button-secondary" href="/admin/research/settings">Global settings</Link>
        </div>
      </div>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Start here" title="Pilot versus official study" note="The Pilot tests the research process; the main study provides the publishable sample." />
      <div className="analytics-workflow-grid">
        <article className="analytics-workflow-card">
          <span>REHEARSAL · SIMULATION</span>
          <strong>Test without touching study records</strong>
          <small>Optional one-mail SES check, encrypted 30-minute link, sample answer submission and Admin notification test. No frame, invitations or Research response rows created.</small>
        </article>
        <article className="analytics-workflow-card">
          <span>TEST · PILOT</span>
          <strong>Validate before launching</strong>
          <small>Small diagnostic sample, real invitation links and potentially real emails. Pilot data are not to be counted as main-study responses or published as representative estimates.</small>
        </article>
        <article className="analytics-workflow-card">
          <span>RESEARCH · MAIN STUDY</span>
          <strong>Collect evidence after sign-off</strong>
          <small>Separate frozen probability sample, audited recruitment and quality checks, controlled evaluation and publication.</small>
        </article>
      </div>
      <div className="workspace-inline-note" style={{ marginTop: 14 }}>
        <strong>Important:</strong> Pilot does not mean a fake or sandbox email send. Use a clearly limited Pilot batch and honor consent, privacy, deadlines, suppression and bounce rules exactly as in the main survey.
      </div>
    </section>
    {TOPICS.map((topic) => <section className="shell vendor-section" key={topic.heading}>
      <div className="workspace-queue-card">
        <h2 style={{ marginTop: 0 }}>{topic.heading}</h2>
        <p>{topic.description}</p>
        <strong>Operator checklist</strong>
        <ul>{topic.checks.map((check) => <li key={check}>{check}</li>)}</ul>
      </div>
    </section>)}
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Safety" title="Before every irreversible action" note="A visual workflow is guidance; server permission and lifecycle guards remain authoritative." />
      <div className="analytics-workflow-grid">
        <article className="analytics-workflow-card"><strong>Sending invitations</strong><small>Check survey, phase (Pilot/Main), purpose, actual recipients, suppressed addresses, template, expiry and duplicate sends. Do not bypass the two-stage confirmation.</small></article>
        <article className="analytics-workflow-card"><strong>Switching phases</strong><small>Do not open main fieldwork with Pilot jobs still running or without closing the Pilot. Record what changed and why before locking the final design.</small></article>
        <article className="analytics-workflow-card"><strong>Publishing results</strong><small>Only approved aggregates and methodological context may be public. Never show recipient emails, invitation tokens, identifiable responses or internal protocol identifiers.</small></article>
        <article className="analytics-workflow-card"><strong>If something fails</strong><small>Stop the affected action. Inspect Delivery, Quality, Jobs and Protocol; preserve the error and evidence. Never repeatedly press Send to resolve a timeout.</small></article>
      </div>
    </section>
    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Navigation" title="Where to do what" />
      <div className="workspace-queue-card">
        <p><strong>Global Research settings:</strong> shared infrastructure and organization-wide defaults, not survey-specific design.</p>
        <p><strong>Survey settings / Questions / Evaluation:</strong> the instrument and preregistration for one study.</p>
        <p><strong>Sampling / Contacts / ΚΑΔ:</strong> study frame, sectors, available recipients, phase-specific sample draw.</p>
        <p><strong>Workflow simulation:</strong> independent single-mailbox rehearsal with no survey response data written.</p>
        <p><strong>Email &amp; fieldwork / Invitations / Delivery:</strong> approved templates, controlled sends, link expiry, reminders, bounces, opt-outs.</p>
        <p><strong>Quality / Protocol / Lifecycle / Evidence:</strong> exclusions, amendments, controlled study transitions and audit trail.</p>
      </div>
    </section>
  </main>;
}
