import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading, WorkspaceStatusBadge } from "../../../../components/WorkspacePagePrimitives";
import { hasAdminPermission } from "../../../../lib/admin-runtime";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchMarketingContactDirectory, researchSurveyAdminOverview, type ResearchMarketingConsentStatus } from "../../../../lib/research-survey-runtime";

export const metadata: Metadata = {
  title: "Admin · Research Marketing Consent",
  robots: { index: false, follow: false }
};

export const dynamic = "force-dynamic";

function one(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusLabel(status: ResearchMarketingConsentStatus): string {
  if (status === "opted_in") return "Opted in";
  if (status === "opted_out") return "Opted out";
  return "No decision";
}

export default async function ResearchMarketingContactsPage({ searchParams }: {
  searchParams: Promise<{
    study?: string | string[];
    status?: string | string[];
    q?: string | string[];
  }>;
}) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  if (!hasAdminPermission(principal, "research.privacy.manage")) redirect("/admin/research/surveys");

  const overview = await researchSurveyAdminOverview(principal);
  if (!overview.databaseConfigured) {
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research Marketing Consent" />
      <section className="shell vendor-section">
        <WorkspaceEmptyState title="Research database is not available." />
      </section>
    </main>;
  }

  const query = await searchParams;
  const requestedStudy = one(query.study);
  const studySlug = overview.studies.some((study) => study.slug === requestedStudy)
    ? requestedStudy
    : overview.studies[0]?.slug ?? "";
  const requestedStatus = one(query.status);
  const status: ResearchMarketingConsentStatus | "all" =
    requestedStatus === "opted_in" || requestedStatus === "opted_out" || requestedStatus === "no_decision"
      ? requestedStatus
      : "all";
  const search = one(query.q).trim();

  const directory = studySlug
    ? await researchMarketingContactDirectory(principal, { studySlug, status, query: search, limit: 2000 })
    : undefined;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} entityLabel="Research Marketing Consent" />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Research · privacy-controlled contacts</div>
      <h1>Marketing consent by company & email</h1>
      <p className="lead">Commercial email consent is tracked independently for each company/email pair. Survey participation never counts as marketing consent.</p>
      <div className="hero-actions">
        <Link className="button button-secondary" href="/admin/research/surveys">Survey Control Center</Link>
        {studySlug && <a className="button button-secondary" href={"/api/admin/research/contacts/export?study=" + encodeURIComponent(studySlug)}>
          Export opted-in CSV
        </a>}
      </div>
    </div></section>

    {!directory
      ? <section className="shell vendor-section"><WorkspaceEmptyState title="No research studies have been created." /></section>
      : <>
        <WorkspaceMetricStrip items={[
          { label: "Email contacts", value: directory.summary.totalContacts.toLocaleString("el-GR"), hint: "company + email pairs" },
          { label: "Marketing opted in", value: directory.summary.optedIn.toLocaleString("el-GR"), hint: "explicit current consent" },
          { label: "Marketing opted out", value: directory.summary.optedOut.toLocaleString("el-GR"), hint: "explicit withdrawal / refusal" },
          { label: "No decision", value: directory.summary.noDecision.toLocaleString("el-GR"), hint: "must not receive marketing" },
          { label: "Current filter", value: directory.summary.matching.toLocaleString("el-GR"), hint: directory.summary.returned < directory.summary.matching ? "showing first " + directory.summary.returned : "all matching contacts" }
        ]} />

        <section className="shell vendor-section">
          <WorkspaceSectionHeading
            eyebrow="Consent directory"
            title="Company and email-level status"
            note="Only Research Privacy roles can view raw email identities. The CSV export is hard-filtered to current explicit opt-ins."
          />

          <form method="get" className="workspace-queue-card">
            <div className="workspace-action-bar">
              <label>
                <strong>Study</strong><br />
                <select name="study" defaultValue={studySlug}>
                  {overview.studies.map((study) => <option key={study.slug} value={study.slug}>{study.title}</option>)}
                </select>
              </label>
              <label>
                <strong>Marketing status</strong><br />
                <select name="status" defaultValue={status}>
                  <option value="all">All</option>
                  <option value="opted_in">Opted in</option>
                  <option value="opted_out">Opted out</option>
                  <option value="no_decision">No decision</option>
                </select>
              </label>
              <label style={{ flex: 1 }}>
                <strong>Company or email</strong><br />
                <input name="q" type="search" defaultValue={search} placeholder="Search company or email" />
              </label>
              <button className="button button-secondary" type="submit">Apply filters</button>
            </div>
          </form>

          {directory.contacts.length === 0
            ? <WorkspaceEmptyState title="No contacts match this filter." />
            : <div className="workspace-queue-card">
              {directory.contacts.map((contact) => <div
                className="workspace-action-bar"
                key={contact.companyName + "|" + contact.email}
              >
                <span style={{ minWidth: 0 }}>
                  <strong>{contact.companyName}</strong><br />
                  <span>{contact.email}</span><br />
                  <small>
                    Company coverage: {contact.companyOptedInContacts} of {contact.companyTotalContacts} email contact(s) opted in
                    {" · Research contact: " + contact.researchContactStatus}
                  </small>
                </span>
                <span style={{ textAlign: "right" }}>
                  <WorkspaceStatusBadge
                    status={contact.marketingStatus === "opted_in" ? "active" : contact.marketingStatus === "opted_out" ? "warning" : "draft"}
                    label={statusLabel(contact.marketingStatus)}
                  /><br />
                  <small>
                    {contact.consentRecordedAt ? new Date(contact.consentRecordedAt).toLocaleString("el-GR") : "No consent event"}
                    {contact.consentVersion ? " · " + contact.consentVersion : ""}
                  </small>
                </span>
              </div>)}
            </div>}
        </section>
      </>}
  </main>;
}
