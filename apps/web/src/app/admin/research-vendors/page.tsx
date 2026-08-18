import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };

function locationLine(vendor: { address?: string; locality?: string; postcode?: string }) {
  return [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "No location recorded";
}

function scoreLine(vendor: { outreachPriority?: string; outreachScore?: number }) {
  if (!vendor.outreachPriority && vendor.outreachScore === undefined) return "No outreach score";
  return [vendor.outreachPriority, vendor.outreachScore !== undefined ? `Score ${vendor.outreachScore}/10` : undefined].filter(Boolean).join(" · ");
}

function scopeLine(vendor: { marketplaceScope?: string; distanceKm?: number }) {
  if (!vendor.marketplaceScope && vendor.distanceKm === undefined) return "Scope not recorded";
  return [vendor.marketplaceScope, vendor.distanceKm !== undefined ? `${vendor.distanceKm} km` : undefined].filter(Boolean).join(" · ");
}

export default async function ResearchVendorsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await researchVendorsWorkspace(principal);
  const metrics = [
    ["Research prospects", data.summary.total],
    ["Invited", data.summary.invited],
    ["In onboarding", data.summary.inProgress],
    ["Evidence-backed", data.summary.withEvidence],
    ["Active partners", data.summary.active],
    ["Restricted / closed", data.summary.restricted]
  ] as const;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact">
      <div>
        <div className="eyebrow">Acquisition intelligence · research ≠ partnership</div>
        <h1>Research vendors</h1>
        <p className="lead">Every invited business now carries its complete acquisition dossier: census classification, outreach priority, location/contact data, online-shop evidence, GEMI research and storefront issue findings. These remain research records until the merchant completes governed onboarding and verification.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Vendor applications</Link>
          <Link className="button button-secondary" href="/admin/categories">Category governance</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
      <aside className={data.databaseConfigured ? undefined : "needs-attention"}>
        <span>Data source</span>
        <strong>{data.databaseConfigured ? "Live PostgreSQL" : "Unavailable"}</strong>
        <p>{data.databaseConfigured ? "351 research profiles with linked workbook source records and normalized storefront locations." : "Production database is not configured."}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">{metrics.map(([label, value]) => <div className={Number(value) > 0 ? "has-work" : undefined} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Acquisition queue</div><h2>Mapped businesses</h2></div>
        <p className="section-note">Open any card for the full source dossier. Next governed step remains owner contact/claim → application → verification → catalog onboarding → test-ready → activation.</p>
      </div>

      {data.vendors.length === 0 ? <article className="vendor-card-form">
        <div className="eyebrow">No imported research records</div>
        <h3>The acquisition queue is currently empty.</h3>
        <p>No fictional or demo businesses are substituted. Import or restore the verified Sparta research dataset to populate this queue.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/vendors">Review formal applications</Link></div>
      </article> : <div className="vendor-order-list">{data.vendors.map((vendor) => <article className="vendor-order" key={vendor.id}>
        <div className="vendor-order-head">
          <div>
            <strong>{vendor.tradingName}</strong>
            <small>{vendor.legalName || "Legal name pending verification"} · {vendor.id}</small>
          </div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="vendor-order-lines">
          <span>{vendor.majorBranch ?? "Unclassified"}{vendor.subBranch ? ` · ${vendor.subBranch}` : ""}</span>
          <span>{locationLine(vendor)}</span>
          <span>{vendor.phone ?? vendor.email ?? "No public contact recorded"}</span>
          <span>{scoreLine(vendor)}</span>
          <span>{scopeLine(vendor)}</span>
          <span>Workbook sources: {vendor.sourceCount} · E-shop findings: {vendor.issueCount} · Passed verification checks: {vendor.verificationCount}</span>
          <span>Online shop: {vendor.onlineShopActive ?? "Not verified"}{vendor.latestIssueSeverity ? ` · Latest issue: ${vendor.latestIssueSeverity}${vendor.latestIssueType ? ` / ${vendor.latestIssueType}` : ""}` : ""}</span>
        </div>
        <div className="vendor-order-foot">
          <span>{vendor.recommendedCommerceMode ?? vendor.shortDescription ?? "Research record awaiting merchant-owned profile content."}</span>
          <div className="hero-actions">
            <Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open research dossier</Link>
            <Link className="text-link" href="/admin/vendors">Governed onboarding →</Link>
          </div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><div className="eyebrow">Workflow boundary</div><h2>Research is not onboarding</h2><p>Research records contain public business evidence and contact details, but activation controls remain in the vendor application workflow. Candidate GEMI/VAT/legal-name fields stay visibly labelled as research unless a high-confidence source has been promoted into the core legal record.</p><Link className="text-link" href="/admin/vendors">Open application workflow →</Link></article>
        <article className="vendor-card-form"><div className="eyebrow">Evidence preservation</div><h2>Nothing from the workbook is hidden</h2><p>Each dossier exposes every linked source row and its original field/value payload, including checked dates and source role. Normalized profile fields are used for fast filtering while the original research evidence remains auditable.</p><Link className="text-link" href="/admin/matching">Open product matching →</Link></article>
      </div>
    </section>
  </main>;
}
