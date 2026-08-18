import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminVendorsWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendors", robots: { index: false, follow: false } };

const stateLabel = (state: string) => ({
  verification_pending: "Σε επαλήθευση",
  catalog_onboarding: "Κατάλογος",
  test_ready: "Έτοιμο για test",
  active: "Ενεργό",
  restricted: "Περιορισμένο",
  closed: "Κλειστό",
  draft: "Draft"
}[state] ?? state.replaceAll("_", " "));

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminVendorsWorkspace(principal);
  const verification = data.applications.filter((item) => item.state === "verification_pending").length;
  const onboarding = data.applications.filter((item) => ["catalog_onboarding", "test_ready"].includes(item.state)).length;
  const active = data.applications.filter((item) => item.state === "active").length;
  const restricted = data.applications.filter((item) => ["restricted", "closed"].includes(item.state)).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor onboarding</div>
        <h1>Αιτήσεις συνεργατών</h1>
        <p className="lead">Έλεγξε την επόμενη απαιτούμενη ενέργεια και προχώρησε μόνο μέσα από τα επιτρεπτά στάδια.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/research-vendors">Research queue</Link><Link className="text-link" href="/admin/categories">Κατηγορίες →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Σε επαλήθευση", value: verification, tone: verification ? "attention" : "default", hint: "χρειάζονται KYB έλεγχο" },
      { label: "Onboarding", value: onboarding, hint: "catalog / test-ready" },
      { label: "Ενεργοί", value: active, tone: active ? "positive" : "default" },
      { label: "Restricted / closed", value: restricted }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Onboarding queue" title="Επόμενες ενέργειες" note="Κάθε αλλαγή κατάστασης καταγράφεται και δεν παρακάμπτει verification, catalog onboarding ή test-ready." />
      {data.applications.length === 0 ? <WorkspaceEmptyState
        eyebrow="Καμία επίσημη αίτηση"
        title="Δεν υπάρχει ακόμη αίτηση για έλεγχο."
        body="Τα research prospects παραμένουν ξεχωριστά μέχρι να δημιουργηθεί merchant-owned application record."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Άνοιγμα research queue</Link>}
      /> : <div className="workspace-queue-list">{data.applications.map((application) => <article className="workspace-queue-card" key={application.id}>
        <div className="workspace-queue-head">
          <div><strong>{application.tradingName}</strong><small>{application.legalName} · {application.primaryCategory}</small></div>
          <span className="status-pill">{stateLabel(application.state)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{application.postcode}</span>
          <span>{application.requestedPlanCode}</span>
          {application.contactEmail && <span>{application.contactEmail}</span>}
        </div>
        {application.verificationNotes && <p className="workspace-queue-summary">{application.verificationNotes}</p>}
        <WorkspaceRecordDetails label="Στοιχεία αίτησης & τεκμηρίωση">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Application ID</strong><span>{application.id}</span></div>
            <div className="workspace-compact-row"><strong>Tax number</strong><span>{application.taxNumber ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>Shop story</strong><span>{application.shopStory ?? "Δεν έχει καταχωρηθεί ακόμη."}</span></div>
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Τρέχον στάδιο: <strong>{stateLabel(application.state)}</strong></span>
          <div className="workspace-action-buttons">
            {application.state === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason" />}
            {application.state === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
            {application.state === "test_ready" && <AdminActionButton label="Activate" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Activation approval reason" />}
            {!['closed', 'active'].includes(application.state) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
          </div>
        </div>
      </article>)}</div>}
    </section>
  </main>;
}
