import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };

function locationLine(vendor: { address?: string; locality?: string; postcode?: string; distanceKm?: number }) {
  const place = [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "Δεν έχει καταχωρηθεί τοποθεσία";
  return vendor.distanceKm === undefined ? place : `${place} · ${vendor.distanceKm.toLocaleString("el-GR")} km`;
}

export default async function ResearchVendorsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await researchVendorsWorkspace(principal);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Acquisition intelligence · research ≠ partnership</div>
        <h1>Research vendors</h1>
        <p className="lead">Workbook-backed acquisition dossiers πριν από owner claim, επίσημη αίτηση και activation.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Αιτήσεις συνεργατών</Link>
          <Link className="button button-secondary" href="/admin/categories">Κατηγορίες</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Prospects", value: data.summary.total },
      { label: "Invited", value: data.summary.invited, tone: data.summary.invited ? "attention" : "default" },
      { label: "Σε onboarding", value: data.summary.inProgress },
      { label: "Active partners", value: data.summary.active, tone: data.summary.active ? "positive" : "default", hint: `${data.summary.withEvidence} evidence-backed · ${data.summary.restricted} restricted/closed` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Acquisition queue" title="Invited vendor dossiers" note="Άνοιξε το πλήρες dossier για workbook evidence. Merchant-provided onboarding data παραμένει ξεχωριστό μέχρι claim και verification." />
      {!data.databaseConfigured && <div className="workspace-inline-note">Η production βάση δεν είναι διαθέσιμη. Δεν δημιουργούνται fallback ή fictional research records.</div>}
      {data.vendors.length === 0 ? <WorkspaceEmptyState
        eyebrow="Δεν υπάρχουν imported records"
        title="Το acquisition queue είναι κενό."
        body="Δεν αντικαθίστανται τα verified research δεδομένα με demo επιχειρήσεις."
        action={<Link className="button button-secondary" href="/admin/vendors">Έλεγχος επίσημων αιτήσεων</Link>}
      /> : <div className="workspace-queue-list">{data.vendors.map((vendor) => <article className="workspace-queue-card" key={vendor.id}>
        <div className="workspace-queue-head">
          <div><strong>{vendor.tradingName}</strong><small>{vendor.majorBranch ?? "Unclassified"}{vendor.subBranch ? ` · ${vendor.subBranch}` : ""} · {locationLine(vendor)}</small></div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="workspace-queue-primary">
          <span>{vendor.evidenceCount} evidence</span>
          <span>{vendor.verificationCount} verified</span>
          <span>{vendor.researchSourceCount} source rows</span>
          {vendor.outreachPriority && <span>Outreach {vendor.outreachPriority}{vendor.outreachScore === undefined ? "" : ` · ${vendor.outreachScore}/10`}</span>}
          {vendor.onlineShopActive && <span>Online shop {vendor.onlineShopActive}</span>}
        </div>
        <p className="workspace-queue-summary">{vendor.shortDescription ?? vendor.storefrontStatus ?? "Research record που περιμένει merchant-owned profile content."}</p>
        <WorkspaceRecordDetails label="Contact, commerce fit & research evidence">
          <div className="workspace-compact-list">
            <div className="workspace-compact-row"><strong>Νομική ονομασία</strong><span>{vendor.legalName}</span><small>{vendor.id}{vendor.primaryCensusId === undefined ? "" : ` · Census #${vendor.primaryCensusId}`}</small></div>
            <div className="workspace-compact-row"><strong>Επικοινωνία</strong><span>{vendor.phone ?? "Δεν υπάρχει τηλέφωνο"} · {vendor.email ?? "Δεν υπάρχει δημόσιο email"}</span></div>
            <div className="workspace-compact-row"><strong>Τοποθεσία</strong><span>{locationLine(vendor)}</span></div>
            <div className="workspace-compact-row"><strong>Commerce mode</strong><span>{vendor.recommendedCommerceMode ?? "Awaiting classification"}</span></div>
            {vendor.onlineShopUrl && <div className="workspace-compact-row"><strong>Online shop</strong><span>{vendor.onlineShopUrl}</span></div>}
            {(vendor.latestIssueType || vendor.latestIssueSeverity) && <div className="workspace-compact-row"><strong>Known e-shop lead</strong><span>{vendor.latestIssueSeverity ?? "—"} · {vendor.latestIssueType ?? "—"}</span></div>}
          </div>
        </WorkspaceRecordDetails>
        <div className="workspace-action-bar">
          <span>Research dossier → owner contact / claim → formal application.</span>
          <div className="workspace-action-buttons"><Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open full dossier</Link><Link className="button button-secondary" href="/admin/vendors">Application workflow</Link></div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="workspace-dual-grid">
        <details className="workspace-tool-panel"><summary><span><strong>Research is not onboarding</strong><small>Public-source acquisition evidence χωρίς vendor privileges.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Το normalized profile βοηθά filtering/outreach, αλλά κάθε census, active-shop, ΓΕΜΗ και e-shop-audit source row παραμένει attached στο πλήρες dossier. Activation controls παραμένουν στο application workflow.</p></div></details>
        <details className="workspace-tool-panel"><summary><span><strong>Catalog readiness</strong><small>Activation δεν σημαίνει αυτόματη δημοσίευση προϊόντων.</small></span></summary><div className="workspace-tool-body"><p className="workspace-inline-note">Category assignment, canonical matching, offer approval και inventory freshness παραμένουν ξεχωριστά publication gates.</p><div className="workspace-form-actions"><Link className="text-link" href="/admin/matching">Product Matching Centre →</Link></div></div></details>
      </div>
    </section>
  </main>;
}
