import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };

function locationLine(vendor: { address?: string; locality?: string; postcode?: string; distanceKm?: number }) {
  const place = [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "No location recorded";
  return vendor.distanceKm === undefined ? place : `${place} · ${vendor.distanceKm.toLocaleString("el-GR")} km`;
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
        <p className="lead">Every invited business now exposes its acquisition profile, contact and location data, category fit, online-shop verification, ΓΕΜΗ research, outreach priority, known e-commerce issues and the complete source evidence retained from the Sparta research workbook.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Vendor applications</Link>
          <Link className="button button-secondary" href="/admin/categories">Category governance</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
      <aside className={data.databaseConfigured ? undefined : "needs-attention"}>
        <span>Data source</span>
        <strong>{data.databaseConfigured ? "PostgreSQL + research evidence" : "Unavailable"}</strong>
        <p>{data.databaseConfigured ? "Live acquisition dossiers combine vendor, research profile, source records, location, verification and subscription data." : "Production database is not configured."}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">{metrics.map(([label, value]) => <div className={Number(value) > 0 ? "has-work" : undefined} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Acquisition queue</div><h2>Invited vendor dossiers</h2></div>
        <p className="section-note">Open any card for the full workbook-backed dossier. Merchant-provided onboarding data remains separate from public-source research until the business claims and verifies the profile.</p>
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
            <small>{vendor.legalName} · {vendor.id}{vendor.primaryCensusId === undefined ? "" : ` · Census #${vendor.primaryCensusId}`}</small>
          </div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="vendor-order-lines">
          <span>{vendor.majorBranch ?? "Unclassified"}{vendor.subBranch ? ` · ${vendor.subBranch}` : ""}</span>
          <span>{locationLine(vendor)}</span>
          <span>{vendor.phone ?? "No phone"} · {vendor.email ?? "No public email"}</span>
          <span>Outreach: {vendor.outreachPriority ?? "—"}{vendor.outreachScore === undefined ? "" : ` · score ${vendor.outreachScore}/10`}</span>
          <span>Online shop: {vendor.onlineShopActive ?? "Not verified"}{vendor.onlineShopUrl ? ` · ${vendor.onlineShopUrl}` : ""}</span>
          <span>Research sources: {vendor.researchSourceCount} · Verification evidence: {vendor.evidenceCount} · Verified checks: {vendor.verificationCount}</span>
          {vendor.latestIssueType || vendor.latestIssueSeverity ? <span>Known e-shop lead: {vendor.latestIssueSeverity ?? "—"} · {vendor.latestIssueType ?? "—"}</span> : null}
          <span>Commerce mode: {vendor.recommendedCommerceMode ?? "Awaiting classification"}</span>
        </div>
        <div className="vendor-order-foot">
          <span>{vendor.shortDescription ?? vendor.storefrontStatus ?? "Research record awaiting merchant-owned profile content."}</span>
          <div><Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open full dossier</Link></div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><div className="eyebrow">Workflow boundary</div><h2>Research is not onboarding</h2><p>Research records may contain public business evidence and contact details, but activation controls remain in the vendor application workflow. No business becomes public commerce inventory merely because it has a dossier.</p><Link className="text-link" href="/admin/vendors">Open application workflow →</Link></article>
        <article className="vendor-card-form"><div className="eyebrow">Data completeness</div><h2>Source rows remain intact</h2><p>The normalized profile accelerates filtering and outreach, while every original census, active-shop, ΓΕΜΗ and e-shop-audit row remains attached as source evidence and is visible inside the vendor detail page.</p></article>
      </div>
    </section>
  </main>;
}
