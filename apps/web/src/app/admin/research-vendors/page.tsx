import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };

function locationLine(vendor: { address?: string; locality?: string; postcode?: string }) {
  return [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "Δεν έχει καταχωρηθεί τοποθεσία";
}

export default async function ResearchVendorsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await researchVendorsWorkspace(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Acquisition intelligence</div>
        <h1>Research vendors</h1>
        <p className="lead">Χαρτογραφημένες επιχειρήσεις πριν από owner claim, επίσημη αίτηση και activation.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Αιτήσεις συνεργατών</Link>
          <Link className="button button-secondary" href="/admin/categories">Κατηγορίες</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Prospects", value: data.summary.total },
      { label: "Invited", value: data.summary.invited, tone: data.summary.invited ? "attention" : "default" },
      { label: "Σε onboarding", value: data.summary.inProgress },
      { label: "Με τεκμηρίωση", value: data.summary.withEvidence, tone: data.summary.withEvidence ? "positive" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Acquisition queue" title="Χαρτογραφημένες επιχειρήσεις" note="Research record ≠ εγκεκριμένος συνεργάτης. Η ενεργοποίηση γίνεται αποκλειστικά από το governed application workflow." />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη αυτή τη στιγμή. Η σελίδα δεν δημιουργεί fallback ή fictional records.</div>}
      {data.vendors.length === 0 ? <WorkspaceEmptyState
        eyebrow="Δεν υπάρχουν imported records"
        title="Το acquisition queue είναι κενό."
        body="Δεν αντικαθίστανται τα verified research δεδομένα με demo επιχειρήσεις."
        action={<Link className="button button-secondary" href="/admin/vendors">Έλεγχος επίσημων αιτήσεων</Link>}
      /> : <div className="workspace-queue-list">{data.vendors.map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
        <div className="workspace-queue-head">
          <div><strong>{vendor.tradingName}</strong><small>{locationLine(vendor)}</small></div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>Evidence {vendor.evidenceCount}</span>
          <span>Verified {vendor.verificationCount}</span>
          {vendor.planCode && <span>{vendor.planCode}</span>}
          {vendor.subscriptionStatus && <span>{vendor.subscriptionStatus}</span>}
        </div>
        <p className="workspace-queue-summary">{vendor.shortDescription ?? "Research record που περιμένει merchant-owned profile content."}</p>
        <WorkspaceRecordDetails label="Επικοινωνία, νομικά στοιχεία & evidence">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Νομική ονομασία</strong><span>{vendor.legalName}</span><small>{vendor.id}</small></div>
            <div className="workspace-compact-row"><strong>Επικοινωνία</strong><span>{vendor.phone ?? "Δεν υπάρχει τηλέφωνο"} · {vendor.email ?? "Δεν υπάρχει δημόσιο email"}</span></div>
            <div className="workspace-compact-row"><strong>Τοποθεσία</strong><span>{locationLine(vendor)}</span></div>
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Επόμενο βήμα: owner contact / claim → application.</span>
          <div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/vendors">Application workflow</Link></div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-dual-grid">
        <details className="workspace-tool-panel"><summary><span><strong>Γιατί το research μένει ξεχωριστό</strong><small>Acquisition evidence χωρίς vendor privileges.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Δημόσια business evidence και contact details μπορούν να υπάρχουν εδώ, αλλά δεν δημιουργούν vendor access, προϊόντα ή ενεργό commerce profile.</p></div></details>
        <details className="workspace-tool-panel"><summary><span><strong>Catalog readiness</strong><small>Activation δεν σημαίνει αυτόματη δημοσίευση προϊόντων.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Μετά το onboarding, category assignment, canonical matching, offer approval και inventory freshness παραμένουν ξεχωριστά publication gates.</p><div className="workspace-form-actions"><Link className="text-link" href="/admin/matching">Product Matching Centre →</Link></div></div></details>
      </div>
    </section>
  </main>;
}
