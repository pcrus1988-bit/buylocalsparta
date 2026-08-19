import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { AdminVendorVisibilityToggle } from "../../../components/AdminVendorVisibilityToggle";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { vendorOnboardingWorkspace } from "../../../lib/admin-vendor-governance";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendors", robots: { index: false, follow: false } };

const stateLabel = (state: string) => ({
  verification_pending: "Σε επαλήθευση",
  catalog_onboarding: "Κατάλογος",
  test_ready: "Έτοιμο για test",
  active: "Ενεργό",
  restricted: "Περιορισμένο",
  suspended: "Σε αναστολή",
  closed: "Κλειστό",
  draft: "Draft"
}[state] ?? state.replaceAll("_", " "));

function agreementLabel(status?: string, ready?: boolean) {
  if (ready) return "Υπογεγραμμένη & ενεργή";
  if (!status) return "Δεν υπάρχει συμφωνία";
  return stateLabel(status);
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await vendorOnboardingWorkspace(principal);
  const verification = data.applications.filter((item) => item.state === "verification_pending").length;
  const onboarding = data.applications.filter((item) => ["catalog_onboarding", "test_ready"].includes(item.state)).length;
  const active = data.shops.filter((item) => item.status === "active").length;
  const visible = data.shops.filter((item) => item.status === "active" && item.publicDirectoryVisible).length;
  const documentationMissing = data.shops.filter((item) => item.status === "active" && !item.activationReady).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor onboarding & shop governance</div>
        <h1>Συνεργάτες, ενεργοποίηση & ορατότητα</h1>
        <p className="lead">Research, αίτηση, verification, εμπορική συμφωνία, ενεργοποίηση και δημόσια ορατότητα είναι πλέον ξεχωριστά αλλά συνδεδεμένα στάδια.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">Research queue</Link>
          <Link className="button button-secondary" href="/admin/finance/agreements">Συμφωνίες συνεργασίας</Link>
          <Link className="text-link" href="/admin/categories">Κατηγορίες →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Σε επαλήθευση", value: verification, tone: verification ? "attention" : "default", hint: "merchant-owned applications" },
      { label: "Onboarding", value: onboarding, hint: "catalog / test-ready" },
      { label: "Ενεργά shops", value: active, tone: active ? "positive" : "default", hint: `${visible} δημόσια ορατά` },
      { label: "Χωρίς ενεργή τεκμηρίωση", value: documentationMissing, tone: documentationMissing ? "attention" : "default", hint: "active shops needing agreement cleanup" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Onboarding queue" title="Αιτήσεις & απαιτούμενα βήματα" note="Research records με ίδιο ΑΦΜ συνδέονται με την αίτηση αντί να δημιουργούν διπλό vendor. Η ενεργοποίηση απαιτεί ενεργή υπογεγραμμένη συμφωνία με αναφορά εγγράφου." />
      {data.applications.length === 0 ? <WorkspaceEmptyState
        eyebrow="Καμία επίσημη αίτηση"
        title="Δεν υπάρχει ακόμη αίτηση για έλεγχο."
        body="Τα research prospects παραμένουν research μέχρι ο έμπορος να υποβάλει αίτηση ή να ξεκινήσει επίσημο onboarding."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Άνοιγμα research queue</Link>}
      /> : <div className="workspace-queue-list">{data.applications.map((application) => <article className="workspace-queue-card" key={application.id}>
        <div className="workspace-queue-head">
          <div>
            <strong>{application.tradingName}</strong>
            <small>{application.legalName} · {application.primaryCategory}</small>
            {application.researchLinked && <small>Συνδεδεμένο με research dossier</small>}
          </div>
          <span className="status-pill">{stateLabel(application.state)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{application.postcode}</span>
          <span>{application.requestedPlanCode}</span>
          {application.contactEmail && <span>{application.contactEmail}</span>}
          {application.vendorId && <span>Shop: {application.vendorId}</span>}
        </div>
        {application.verificationNotes && <p className="workspace-queue-summary">{application.verificationNotes}</p>}

        <WorkspaceRecordDetails label="Αίτηση, research & cooperation documentation">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Application ID</strong><span>{application.id}</span></div>
            <div className="workspace-compact-row"><strong>Tax number</strong><span>{application.taxNumber ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>Vendor record</strong><span>{application.vendorId ?? "Θα δημιουργηθεί μετά το verification"}</span></div>
            <div className="workspace-compact-row"><strong>Shop lifecycle</strong><span>{application.vendorStatus ? stateLabel(application.vendorStatus) : "Δεν έχει δημιουργηθεί ακόμη"}</span></div>
            <div className="workspace-compact-row"><strong>Cooperation agreement</strong><span>{agreementLabel(application.agreement?.status, application.activationReady)}</span></div>
            {application.agreement?.code && <div className="workspace-compact-row"><strong>Agreement code</strong><span>{application.agreement.code}</span></div>}
            {application.agreement?.signedAt && <div className="workspace-compact-row"><strong>Signed</strong><span>{new Date(application.agreement.signedAt).toLocaleDateString("el-GR")}</span></div>}
            {application.agreement?.sourceDocumentReference && <div className="workspace-compact-row"><strong>Document reference</strong><span>{application.agreement.sourceDocumentReference}</span></div>}
            <div className="workspace-compact-row"><strong>Shop story</strong><span>{application.shopStory ?? "Δεν έχει καταχωρηθεί ακόμη."}</span></div>
          </div>
        </WorkspaceRecordDetails>

        {application.vendorId && !application.activationReady && ["catalog_onboarding", "test_ready", "restricted", "suspended"].includes(application.state) && <p className="workspace-queue-summary">
          Απαιτείται ενεργή, υπογεγραμμένη συμφωνία συνεργασίας με document reference πριν από activation. <Link className="text-link" href="/admin/finance/agreements">Άνοιγμα συμφωνιών →</Link>
        </p>}

        <div className="workspace-action-bar">
          <span>Τρέχον στάδιο: <strong>{stateLabel(application.state)}</strong></span>
          <div className="workspace-action-buttons">
            {application.state === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason" />}
            {application.state === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
            {application.state === "test_ready" && application.activationReady && <AdminActionButton label="Activate shop" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Activation approval reason" />}
            {application.state === "active" && <AdminActionButton label="Suspend" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "suspended" }} reasonPrompt="Suspension reason" danger />}
            {application.state === "active" && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
            {application.state === "restricted" && <AdminActionButton label="Resume verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "verification_pending" }} reasonPrompt="Reason for returning to verification" />}
            {application.state === "restricted" && application.activationReady && <AdminActionButton label="Reactivate" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
            {application.state === "suspended" && application.activationReady && <AdminActionButton label="Reactivate" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
            {!['closed', 'active', 'restricted', 'suspended'].includes(application.state) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
          </div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Shop controls" title="Λειτουργία & δημόσια ορατότητα shops" note="Το lifecycle status και η δημόσια ορατότητα είναι ανεξάρτητα. Νέα ή επανενεργοποιημένα shops ξεκινούν κρυφά και δημοσιεύονται μόνο με ρητό toggle από admin." />
      {data.shops.length === 0 ? <WorkspaceEmptyState eyebrow="No operational shops" title="Δεν υπάρχουν ακόμη shop records εκτός research queue." body="Μετά το verification δημιουργείται το shop record ώστε να μπορούν να συνδεθούν συμφωνία και catalog onboarding πριν από activation." /> : <div className="workspace-queue-list">
        {data.shops.map((shop) => <article className="workspace-queue-card" key={shop.id}>
          <div className="workspace-queue-head">
            <div><strong>{shop.name}</strong><small>{shop.legalName} · {shop.id}</small></div>
            <span className="status-pill">{stateLabel(shop.status)}</span>
          </div>
          <div className="workspace-queue-primary">
            <span>Agreement: {agreementLabel(shop.agreement?.status, shop.activationReady)}</span>
            <span>{shop.applicationId ? `Application: ${shop.applicationId}` : "Legacy / research shop record"}</span>
            {shop.researchLinked && <span>Research-linked</span>}
          </div>
          <WorkspaceRecordDetails label="Cooperation & visibility status">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Lifecycle status</strong><span>{stateLabel(shop.status)}</span></div>
              <div className="workspace-compact-row"><strong>Public directory</strong><span>{shop.publicDirectoryVisible ? "Visible" : "Hidden"}</span></div>
              <div className="workspace-compact-row"><strong>Cooperation documentation</strong><span>{agreementLabel(shop.agreement?.status, shop.activationReady)}</span></div>
              {shop.agreement?.sourceDocumentReference && <div className="workspace-compact-row"><strong>Document reference</strong><span>{shop.agreement.sourceDocumentReference}</span></div>}
              {shop.visibilityReason && <div className="workspace-compact-row"><strong>Last visibility reason</strong><span>{shop.visibilityReason}</span></div>}
            </div>
          </WorkspaceRecordDetails>
          <div className="workspace-action-bar">
            <AdminVendorVisibilityToggle vendorId={shop.id} visible={shop.publicDirectoryVisible} enabled={shop.status === "active"} csrfToken={data.csrfToken} />
            <div className="workspace-action-buttons">
              {shop.status === "active" && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/shops/${shop.id}/status`} csrfToken={data.csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
              {shop.status === "active" && <AdminActionButton label="Suspend" endpoint={`/api/admin/vendors/shops/${shop.id}/status`} csrfToken={data.csrfToken} body={{ to: "suspended" }} reasonPrompt="Suspension reason" danger />}
              {shop.status === "restricted" && shop.activationReady && <AdminActionButton label="Reactivate" endpoint={`/api/admin/vendors/shops/${shop.id}/status`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
              {shop.status === "suspended" && shop.activationReady && <AdminActionButton label="Reactivate" endpoint={`/api/admin/vendors/shops/${shop.id}/status`} csrfToken={data.csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
              {["active", "restricted", "suspended"].includes(shop.status) && <AdminActionButton label="Close" endpoint={`/api/admin/vendors/shops/${shop.id}/status`} csrfToken={data.csrfToken} body={{ to: "closed" }} reasonPrompt="Closure reason" danger />}
            </div>
          </div>
          {shop.status === "active" && !shop.activationReady && <p className="workspace-queue-summary">Το shop είναι legacy-active αλλά δεν έχει πλήρη ενεργή cooperation documentation. Καταχώρησε/ενεργοποίησε συμφωνία πριν από οποιαδήποτε μελλοντική επανενεργοποίηση. <Link className="text-link" href="/admin/finance/agreements">Συμφωνίες →</Link></p>}
        </article>)}
      </div>}
    </section>
  </main>;
}
