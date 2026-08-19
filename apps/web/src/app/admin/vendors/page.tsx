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
        <div className="eyebrow">Vendor lifecycle · application → verification → contract → catalog → test → activation → publication</div>
        <h1>Συνεργάτες & καταστήματα</h1>
        <p className="lead">Η αίτηση, η επιχειρησιακή ενεργοποίηση, η υπογεγραμμένη σύμβαση και η δημόσια προβολή είναι ξεχωριστές ελεγχόμενες καταστάσεις. Καμία νέα αίτηση δεν μπορεί να ενεργοποιηθεί χωρίς συνυπογεγραμμένο PDF, επαληθευμένο reference gov.gr και ολοκλήρωση catalog/test readiness.</p>
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
        title="Κατάστημα, σύμβαση & δημόσια προβολή"
        note="Το shop record δημιουργείται μετά την επιτυχή επαλήθευση ώστε να μπορεί να ολοκληρωθεί η σύμβαση πριν από την activation. Νέα activation ξεκινά πάντα hidden και απαιτεί ξεχωριστή publication απόφαση."
      />
      {!managed.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη· τα shop controls είναι απενεργοποιημένα.</div>}
      {managed.shops.length === 0 ? <WorkspaceEmptyState
        eyebrow="No managed shops"
        title="Δεν υπάρχουν ακόμη operational vendor records."
        body="Τα research prospects μένουν στο Research queue μέχρι να ολοκληρωθεί formal onboarding."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Research vendors</Link>}
      /> : <div className="workspace-queue-list">{managed.shops.map((shop) => {
        const applicationRequiresGovernedActivation = Boolean(shop.applicationState && shop.applicationState !== "active");
        const activationBlocked = !shop.operationalActive && (!shop.cooperationDocumented || applicationRequiresGovernedActivation);
        return <article className="workspace-queue-card" key={shop.id} id={`shop-${shop.id}`}>
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
            <span>Shop: <strong>{shop.operationalActive ? "ACTIVE" : "INACTIVE"}</strong> · Public directory: <strong>{shop.operationalActive && shop.publicDirectoryVisible ? "VISIBLE" : "HIDDEN"}</strong></span>
            <div className="workspace-action-buttons">
              <VendorToggleControl
                label="Shop active"
                checked={shop.operationalActive}
                endpoint={`/api/admin/vendors/${encodeURIComponent(shop.id)}/operational`}
                csrfToken={csrfToken}
                field="active"
                disabled={shop.status === "closed" || shop.researchVendor || activationBlocked}
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

          {applicationRequiresGovernedActivation && <div className="workspace-inline-note">Αυτό το shop συνδέεται με επίσημη αίτηση σε στάδιο {stateLabel(shop.applicationState ?? "")}. Η activation / reactivation γίνεται μόνο από την application queue ώστε να τηρείται το audit trail και τα onboarding gates.</div>}
          {!shop.operationalActive && !shop.cooperationDocumented && <div className="workspace-inline-note">Operational toggle blocked: ολοκλήρωσε το governed contract workflow και την τελική activation από την application queue.</div>}
          {shop.operationalActive && !shop.cooperationDocumented && <div className="workspace-inline-note">⚠ Legacy inconsistency: το shop είναι operationally active χωρίς πλήρες active/signed cooperation record. Απόκρυψέ το ή ολοκλήρωσε άμεσα τη σύμβαση. Νέα reactivation/publication μπλοκάρεται μέχρι να διορθωθεί.</div>}
          {!shop.operationalActive && shop.publicDirectoryVisible && <div className="workspace-inline-note">Το stored visibility toggle είναι ON, αλλά το shop παραμένει αποτελεσματικά κρυφό επειδή δεν είναι operationally active.</div>}

          <WorkspaceRecordDetails label="Cooperation documentation & commercial terms">
            {shop.agreement ? <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Agreement</strong><span>{shop.agreement.code} · v{shop.agreement.version} · {shop.agreement.status}</span><small>{shop.agreement.id}</small></div>
              <div className="workspace-compact-row"><strong>Signed / document</strong><span>{shop.agreement.signedAt ? new Date(shop.agreement.signedAt).toLocaleDateString("el-GR") : "Not signed"} · {shop.agreement.sourceDocumentReference ?? "No document reference"}</span></div>
              <div className="workspace-compact-row"><strong>Commercial terms</strong><span>{(shop.agreement.commissionRateBps / 100).toLocaleString("el-GR")} % commission · listing {euro(shop.agreement.listingFeeMinor)} · recurring {euro(shop.agreement.recurringFeeMinor)} {shop.agreement.recurringFeePeriod ?? ""}</span></div>
              <div className="workspace-compact-row"><strong>Validity</strong><span>{shop.agreement.startsAt ? new Date(shop.agreement.startsAt).toLocaleDateString("el-GR") : "—"} → {shop.agreement.endsAt ? new Date(shop.agreement.endsAt).toLocaleDateString("el-GR") : "open-ended"}</span></div>
            </div> : <p className="workspace-queue-summary">Δεν υπάρχει ακόμη cooperation agreement record για αυτό το shop.</p>}
            <details className="workspace-tool-panel" style={{ marginTop: 12 }}>
              <summary><span><strong>Contract workflow</strong><small>PDF → gov.gr signatures → signed PDF/reference → admin verification → final onboarding activation.</small></span></summary>
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
        </article>;
      })}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading
        eyebrow="Governed onboarding queue"
        title="Επίσημες αιτήσεις συνεργατών"
        note="Research records δεν θεωρούνται applications. Verification δημιουργεί το non-operational shop record → contract PDF/signatures/gov.gr verification → catalog onboarding → test-ready → atomic agreement + operational activation → explicit public publication."
      />
      {applications.applications.length === 0 ? <WorkspaceEmptyState
        eyebrow="Καμία επίσημη αίτηση"
        title="Δεν υπάρχει ακόμη αίτηση για έλεγχο."
        body="Τα research prospects παραμένουν ξεχωριστά μέχρι να δημιουργηθεί merchant-owned application record."
        action={<Link className="button button-secondary" href="/admin/research-vendors">Άνοιγμα research queue</Link>}
      /> : <div className="workspace-queue-list">{applications.applications.map((application) => {
        const shop = managed.shops.find((candidate) => candidate.applicationId === application.id || (application.vendorId && candidate.id === application.vendorId));
        const agreementReady = Boolean(shop?.cooperationDocumented || ["govgr_verified", "eligible_for_activation"].includes(shop?.agreement?.status ?? ""));
        const shopPrepared = Boolean(shop);
        return <article className="workspace-queue-card" key={application.id}>
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
          <WorkspaceRecordDetails label="Onboarding readiness">
            <div className="workspace-compact-list">
              <div className="workspace-compact-row"><strong>Current stage</strong><span>{stateLabel(application.state)}</span></div>
              <div className="workspace-compact-row"><strong>Shop record</strong><span>{shopPrepared ? `${shop?.id} · ${stateLabel(shop?.status ?? "")}` : "Not created yet"}</span></div>
              <div className="workspace-compact-row"><strong>Contract gate</strong><span>{agreementReady ? `Ready · ${shop?.agreement?.code ?? "documented"} · ${shop?.agreement?.status ?? "active"}` : "Requires signed PDF + verified gov.gr reference"}</span></div>
              <div className="workspace-compact-row"><strong>Public directory</strong><span>{shop?.publicDirectoryVisible ? "Visible" : "Hidden until explicit publication"}</span></div>
            </div>
          </WorkspaceRecordDetails>
          {application.state === "test_ready" && !agreementReady && <div className="workspace-inline-note">Η αίτηση είναι test-ready, αλλά η activation παραμένει μπλοκαρισμένη μέχρι να ολοκληρωθεί το signed PDF + gov.gr reference + admin verification στο Finance → Vendor agreements.</div>}
          <div className="workspace-action-bar">
            <span>Τρέχον στάδιο: <strong>{stateLabel(application.state)}</strong></span>
            <div className="workspace-action-buttons">
              {application.state === "verification_pending" && <AdminActionButton label="Pass verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Verification reason / evidence" />}
              {application.state === "catalog_onboarding" && <AdminActionButton label="Mark test ready" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "test_ready" }} reasonPrompt="Test-ready evidence" />}
              {application.state === "test_ready" && agreementReady && <AdminActionButton label="Activate shop (hidden)" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "active" }} reasonPrompt="Final activation approval reason" />}
              {application.state === "test_ready" && !agreementReady && <Link className="button button-secondary" href={shop ? `/admin/finance/agreements?vendorId=${encodeURIComponent(shop.id)}` : "/admin/finance/agreements"}>Complete contract workflow</Link>}
              {application.state === "restricted" && <AdminActionButton label="Return to verification" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "verification_pending" }} reasonPrompt="Reason for returning to verification" />}
              {application.state === "restricted" && <AdminActionButton label="Resume catalog" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "catalog_onboarding" }} reasonPrompt="Reason for resuming catalog onboarding" />}
              {application.state === "restricted" && agreementReady && <AdminActionButton label="Activate (hidden)" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "active" }} reasonPrompt="Final activation approval reason" />}
              {application.state === "suspended" && agreementReady && <AdminActionButton label="Reactivate (hidden)" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "active" }} reasonPrompt="Reactivation reason" />}
              {application.state === "suspended" && !agreementReady && shop && <Link className="button button-secondary" href={`/admin/finance/agreements?vendorId=${encodeURIComponent(shop.id)}`}>Restore contract gate</Link>}
              {application.state === "suspended" && <AdminActionButton label="Move to restricted" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
              {["verification_pending", "catalog_onboarding", "test_ready"].includes(application.state) && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
              {application.state === "active" && <AdminActionButton label="Restrict" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "restricted" }} reasonPrompt="Restriction reason" danger />}
              {application.state !== "closed" && <AdminActionButton label="Close" endpoint={`/api/admin/vendors/${application.id}/transition`} csrfToken={csrfToken} body={{ to: "closed" }} reasonPrompt="Permanent closure reason" danger />}
              {application.state !== "active" && <AdminActionButton label="Delete application" endpoint={`/api/admin/vendors/${application.id}/delete`} csrfToken={csrfToken} reasonPrompt="Reason for permanently deleting this application" extraPrompt={{ field: "confirmation", message: `Type ${application.id} to permanently delete the application and its application history from the database.` }} danger />}
            </div>
          </div>
          {application.state !== "active" && <div className="workspace-inline-note">Permanent delete removes the application row and its application-event history from PostgreSQL. {shop ? `The linked shop ${shop.id} is retained and remains managed separately.` : "No shop record is linked, so no vendor/shop data is affected."}</div>}
        </article>;
      })}</div>}
    </div></section>
  </main>;
}
