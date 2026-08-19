import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { VendorAgreementForm } from "../../../components/VendorAgreementForm";
import { VendorToggleControl } from "../../../components/VendorToggleControl";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminVendorsWorkspace } from "../../../lib/admin-runtime";
import { adminVendorShopsWorkspace } from "../../../lib/vendor-admin-controls";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Vendors", robots: { index: false, follow: false } };

const stateLabel = (state: string) => ({
  invited: "Invited / research",
  application_started: "Αίτηση ξεκίνησε",
  verification_pending: "Σε επαλήθευση",
  catalog_onboarding: "Κατάλογος",
  test_ready: "Έτοιμο για test",
  active: "Ενεργό",
  restricted: "Περιορισμένο",
  suspended: "Απενεργοποιημένο",
  closed: "Κλειστό",
  draft: "Draft"
}[state] ?? state.replaceAll("_", " "));

function euro(minor?: number) {
  if (minor === undefined) return "—";
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [applications, managed] = await Promise.all([
    adminVendorsWorkspace(principal),
    adminVendorShopsWorkspace(principal)
  ]);
  const csrfToken = applications.csrfToken;
  const activeShops = managed.shops.filter((shop) => shop.operationalActive).length;
  const visibleShops = managed.shops.filter((shop) => shop.operationalActive && shop.publicDirectoryVisible).length;
  const documentedShops = managed.shops.filter((shop) => shop.cooperationDocumented).length;
  const pendingApplications = applications.applications.filter((item) => item.state !== "active" && item.state !== "closed").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Vendor lifecycle · onboarding → cooperation → operations → visibility</div>
        <h1>Συνεργάτες & καταστήματα</h1>
        <p className="lead">Η αίτηση, η επιχειρησιακή ενεργοποίηση, η σύμβαση συνεργασίας και η δημόσια προβολή είναι πλέον ξεχωριστές και ελεγχόμενες καταστάσεις.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/research-vendors">Research queue</Link><Link className="text-link" href="/shops">Public directory →</Link></div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Operationally active", value: activeShops, tone: activeShops ? "positive" : "default", hint: "μπορούν να λειτουργούν ως shops" },
      { label: "Publicly visible", value: visibleShops, tone: visibleShops ? "positive" : "default", hint: "active + directory toggle ON" },
      { label: "Cooperation documented", value: documentedShops, tone: documentedShops === activeShops && activeShops ? "positive" : "attention", hint: `${managed.shops.length - documentedShops} χωρίς πλήρη active signed record` },
      { label: "Pending applications", value: pendingApplications, tone: pendingApplications ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Shop operations"
        title="Ενεργοποίηση, σύμβαση & δημόσια προβολή"
        note="Operational active και Public directory visibility είναι ανεξάρτητα. Η δημόσια ενεργοποίηση απαιτεί active signed cooperation record με document reference."
      />
      {!managed.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· τα shop controls είναι απενεργοποιημένα.</div>}
      {managed.shops.length === 0 ? <WorkspaceEmptyState
        eyebrow="No managed shops"
        title="Δεν υπάρχουν ακόμη operational vendor records."
        body="Τα research prospects μένουν στο Research queue μέχρι να ολοκληρωθεί formal onboarding."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Research vendors</Link>}
      /> : <div className="workspace-queue-list">{managed.shops.map((shop) => <article className="workspace-queue-card" key={shop.id}>
        <div className="workspace-queue-head">
          <div><strong>{shop.tradingName}</strong><small>{shop.legalName} · {shop.id}</small></div>
          <span className="status-pill">{stateLabel(shop.status)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{shop.activeLocationCount}/{shop.locationCount} active locations</span>
          <span>{shop.approvedOfferCount} approved offers</span>
          <span>{shop.applicationId ? `Application ${shop.applicationState ?? "linked"}` : "No linked application"}</span>
          <span>{shop.agreementCount} cooperation records</span>
        </div>

        <div className="workspace-action-bar">
          <span>
            Shop: <strong>{shop.operationalActive ? "ACTIVE" : "INACTIVE"}</strong> · Public directory: <strong>{shop.operationalActive && shop.publicDirectoryVisible ? "VISIBLE" : "HIDDEN"}</strong>
          </span>
          <div className="workspace-action-buttons">
            <VendorToggleControl
              label="Shop active"
              checked={shop.operationalActive}
              endpoint={`/api/admin/vendors/${encodeURIComponent(shop.id)}/operational`}
              csrfToken={csrfToken}
              field="active"
              disabled={shop.status === "closed" || shop.researchVendor}
              reasonPrompt={shop.operationalActive ? "Reason for deactivating/suspending this shop" : "Reason for reactivating this shop"}
            />
            <VendorToggleControl
              label="Public visibility"
              checked={shop.publicDirectoryVisible}
              endpoint={`/api/admin/vendors/${encodeURIComponent(shop.id)}/visibility`}
              csrfToken={csrfToken}
              field="visible"
              disabled={!shop.operationalActive && !shop.publicDirectoryVisible}
            />
          </div>
        </div>

        {shop.operationalActive && !shop.cooperationDocumented && <div className="workspace-inline-note">⚠ Το shop είναι operationally active αλλά δεν υπάρχει πλήρες active/signed cooperation record με document reference. Νέα δημοσίευση μετά από hide θα μπλοκάρεται μέχρι να καταχωρηθεί η τεκμηρίωση.</div>}
        {!shop.operationalActive && shop.publicDirectoryVisible && <div className="workspace-inline-note">Το stored visibility toggle είναι ON, αλλά το shop παραμένει αποτελεσματικά κρυφό επειδή δεν είναι operationally active.</div>}

        <WorkspaceRecordDetails label="Cooperation documentation & commercial terms">
          {shop.agreement ? <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Agreement</strong><span>{shop.agreement.code} · v{shop.agreement.version} · {shop.agreement.status}</span><small>{shop.agreement.id}</small></div>
            <div className="workspace-compact-row"><strong>Signed / document</strong><span>{shop.agreement.signedAt ? new Date(shop.agreement.signedAt).toLocaleDateString("el-GR") : "Not signed"} · {shop.agreement.sourceDocumentReference ?? "No document reference"}</span></div>
            <div className="workspace-compact-row"><strong>Commercial terms</strong><span>{(shop.agreement.commissionRateBps / 100).toLocaleString("el-GR")} % commission · listing {euro(shop.agreement.listingFeeMinor)} · recurring {euro(shop.agreement.recurringFeeMinor)} {shop.agreement.recurringFeePeriod ?? ""}</span></div>
            <div className="workspace-compact-row"><strong>Validity</strong><span>{shop.agreement.startsAt ? new Date(shop.agreement.startsAt).toLocaleDateString("el-GR") : "—"} → {shop.agreement.endsAt ? new Date(shop.agreement.endsAt).toLocaleDateString("el-GR") : "open-ended"}</span></div>
          </div> : <p className="workspace-queue-summary">Δεν υπάρχει ακόμη cooperation agreement record για αυτό το shop.</p>}
          <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
            <summary><span><strong>Record / update cooperation agreement</strong><small>Κάθε υποβολή δημιουργεί νέα versioned εγγραφή και audit trail.</small></span></summary>
            <VendorAgreementForm vendorId={shop.id} csrfToken={csrfToken} defaults={shop.agreement ? {
              code: shop.agreement.code,
              commissionRateBps: shop.agreement.commissionRateBps,
              listingFeeMinor: shop.agreement.listingFeeMinor,
              recurringFeeMinor: shop.agreement.recurringFeeMinor,
              recurringFeePeriod: shop.agreement.recurringFeePeriod,
              sourceDocumentReference: shop.agreement.sourceDocumentReference
            } : undefined} />
          </details>
        </WorkspaceRecordDetails>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading
        eyebrow="Governed onboarding queue"
        title="Επίσημες αιτήσεις συνεργατών"
        note="Research records δεν θεωρούνται applications. Verification → catalog onboarding → test-ready → operational activation. Νέα activation ξεκινά hidden μέχρι explicit public publication."
      />
      {applications.applications.length === 0 ? <WorkspaceEmptyState
        eyebrow="Καμία επίσημη αίτηση"
        title="Δεν υπάρχει ακόμη αίτηση για έλεγχο."
        body="Τα research prospects παραμένουν ξεχωριστά μέχρι να δημιουργηθεί merchant-owned application record."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Άνοιγμα research queue</Link>}
      /> : <div className="workspace-queue-list">{applications.applications.map((application) => <article className="workspace-queue-card" key={application.id}>
        <div className="workspace-queue-head">
          <div><strong>{application.tradingName}</strong><small>{application.legalName} · {application.primaryCategory}</small></div>
          <span className="status-pill">{stateLabel(application.state)}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{application.postcode}</span>
          <span>{application.requestedPlanCode}</span>
          {application.contactEmail && <span>{application.contactEmail}</span>}
          {application.vendorId && <span>Shop {application.vendorId}</span>}
        </div>
        {application.verificationNotes && <p className="workspace-queue-summary">{application.verificationNotes}</p>}
        <WorkspaceRecordDetails label="Application evidence">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Application ID</strong><span>{application.id}</span></div>
            <div className="workspace-compact-row"><strong>Tax number</strong><span>{application.taxNumber ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>ΓΕΜΗ</strong><span>{application.gemiNumber ?? "—"}</span></div>
            <div className="workspace-compact-row"><strong>Shop story</strong><span>{application.shopStory ?? "Δεν έχει καταχωρηθεί ακόμη."}</span></div>
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Τρέχον στάδιο: <strong>{stateLabel(application.state)}</strong></span>
          <div className="workspace-action-buttons">
            {application.state === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason" />}
            {application.state === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
            {application.state === "test_ready" && <AdminActionButton label="Activate shop (hidden)" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "active" }} reasonPrompt="Activation approval reason" />}
            {!['closed', 'active', 'suspended'].includes(application.state) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
          </div>
        </div>
      </article>)}</div>}
    </div></section>
  </main>;
}
