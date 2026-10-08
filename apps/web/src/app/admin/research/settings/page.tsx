import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchSurveyEmailConfiguration } from "../../../../lib/research-survey-mail";
import { sesMailConfigFromEnv } from "../../../../lib/admin-mail-ses";

export const metadata: Metadata = {
  title: "Admin · Global Research Settings",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

export default async function ResearchGlobalSettingsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.read")) redirect("/admin");

  const mail = researchSurveyEmailConfiguration();
  const snsConfigured = Boolean(process.env.BLS_RESEARCH_SES_SNS_TOPIC_ARN?.trim());
  const simulationEnabled = process.env.BLS_RESEARCH_SIMULATION_EMAIL_ENABLED === "true";
  let sesCredentialsConfigured = true;
  try {
    sesMailConfigFromEnv();
  } catch {
    sesCredentialsConfigured = false;
  }
  const simulationReady = simulationEnabled && sesCredentialsConfigured;
  const liveReady = mail.enabled && sesCredentialsConfigured && Boolean(mail.configurationSetName) && snsConfigured;

  return <main className="vendor-app admin-app admin-research-settings">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research · Global settings" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · Global</div>
      <h1>Global Research settings</h1>
      <p className="lead">These settings apply to the Research system as a whole. Survey title, questions, evaluation, sampling and fieldwork stay inside each individual survey.</p>
      <div className="hero-actions">
        <Link className="button" href="/admin/research/surveys">Open surveys</Link>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="System-wide"
        title="Delivery & communication infrastructure"
        note="These values are shared across surveys. Sensitive credentials are never shown here."
      />
      <div className="research-settings-grid">
        <article className="research-settings-card">
          <span>Research email delivery</span>
          <strong>{liveReady ? "Enabled" : mail.enabled ? "Incomplete configuration" : "Disabled"}</strong>
          <WorkspaceStatusBadge status={liveReady ? "active" : "warning"} label={liveReady ? "Active" : "Off"} />
          <small>Live Research delivery requires its own separate gate, working credentials, an SES configuration set and an SNS event topic. This is not enabled by Simulation.</small>
        </article>
        <article className="research-settings-card">
          <span>One-recipient simulation email</span>
          <strong>{simulationReady ? "SES test send configured" : "Not yet configured"}</strong>
          <WorkspaceStatusBadge status={simulationReady ? "active" : "warning"} label={simulationReady ? "Enabled" : "Off"} />
          <small>Independent of live delivery. Requires explicit approval per test email. Sending is still subject to AWS identity, account and DNS readiness.</small>
        </article>
        <article className="research-settings-card">
          <span>Sender</span>
          <strong>{mail.from}</strong>
          <small>Reply-to: {mail.replyTo}</small>
        </article>
        <article className="research-settings-card">
          <span>SES event tracking</span>
          <strong>{mail.configurationSetName ? "Configuration set named in environment" : "Configuration set missing"}</strong>
          <small>{snsConfigured ? "SNS topic ARN supplied; AWS topic subscription and event publishing must also be verified." : "SNS event topic is not configured."}</small>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Global safeguards"
        title="Rules that every survey inherits"
        note="These controls are intentionally not duplicated in individual survey settings."
      />
      <div className="research-settings-grid">
        <article className="research-settings-card">
          <span>Bulk email safety</span>
          <strong>Two-step confirmation</strong>
          <small>New bulk invitation and participant-email batches require explicit operator confirmation of survey, purpose and recipient count.</small>
        </article>
        <article className="research-settings-card">
          <span>Suppression</span>
          <strong>Cross-survey opt-out protection</strong>
          <small>Bounces, complaints and future-Research opt-outs are enforced before later Research delivery.</small>
        </article>
        <article className="research-settings-card">
          <span>Privacy</span>
          <strong>Restricted personal-data access</strong>
          <small>Plain email access is permission-gated and audited. Public Research never exposes contact data or raw respondent identities.</small>
        </article>
        <article className="research-settings-card">
          <span>Scientific governance</span>
          <strong>Versioned evidence</strong>
          <small>Locked questionnaires, analysis plans, samples and releases remain immutable. Changes are made through new versions.</small>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Boundary"
        title="What does not belong here"
        note="Keeping this boundary explicit prevents global configuration from being confused with survey design."
      />
      <div className="workspace-inline-note">
        Survey-specific title and methodology, deadline, questionnaire, answer options, evaluation rules, sample design, email copy, invitations, consent, quality review and publication state are edited from that survey's own workspace.
      </div>
    </section>
  </main>;
}
