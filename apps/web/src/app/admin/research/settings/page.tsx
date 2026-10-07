import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchSurveyEmailConfiguration } from "../../../../lib/research-survey-mail";

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
          <strong>{mail.enabled ? "Enabled" : "Disabled"}</strong>
          <WorkspaceStatusBadge status={mail.enabled ? "active" : "warning"} label={mail.enabled ? "Active" : "Off"} />
          <small>The global delivery gate must be enabled before any survey can send Research email.</small>
        </article>
        <article className="research-settings-card">
          <span>Sender</span>
          <strong>{mail.from}</strong>
          <small>Reply-to: {mail.replyTo}</small>
        </article>
        <article className="research-settings-card">
          <span>SES event tracking</span>
          <strong>{mail.configurationSetName ? "Configuration set ready" : "Configuration set missing"}</strong>
          <small>{snsConfigured ? "Bounce, complaint and delivery event endpoint configured." : "SNS event topic is not configured."}</small>
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
