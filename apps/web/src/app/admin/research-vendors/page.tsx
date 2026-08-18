import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../lib/admin-session";
import { researchVendorsWorkspace } from "../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendors", robots: { index: false, follow: false } };

function locationLine(vendor: { address?: string; locality?: string; postcode?: string }) {
  return [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "Location available in source dossier where imported";
}

export default async function ResearchVendorsPage() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await researchVendorsWorkspace(principal);
  const metrics = [
    ["Research prospects", data.summary.total],
    ["Invited", data.summary.invited],
    ["Priority A", data.summary.priorityA],
    ["Online-shop leads", data.summary.online],
    ["Evidence-backed", data.summary.withEvidence],
    ["Active partners", data.summary.active]
  ] as const;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact">
      <div>
        <div className="eyebrow">Acquisition intelligence · research ≠ partnership</div>
        <h1>Research vendors</h1>
        <p className="lead">Complete invited-vendor acquisition database sourced from the Sparta research workbook. Open any business to review its census, outreach, ΓΕΜΗ candidate research, online-shop evidence, dated issue audits and complete linked source rows.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Vendor applications</Link>
          <Link className="button button-secondary" href="/admin/categories">Category governance</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
      <aside className={data.databaseConfigured ? undefined : "needs-attention"}>
        <span>Data source</span>
        <strong>{data.databaseConfigured ? "PostgreSQL dossiers" : "Unavailable"}</strong>
        <p>{data.databaseConfigured ? "Operational vendor lifecycle stays separate from public-source acquisition research." : "Production database is not configured."}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">{metrics.map(([label, value]) => <div className={Number(value) > 0 ? "has-work" : undefined} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form needs-attention">
        <div className="eyebrow">Research-use boundary</div>
        <p>Workbook information is a dated public-source baseline. Directory, ΓΕΜΗ, online-shop and website-health observations must be reconfirmed before merchant outreach, contracting or activation. Research data never upgrades a business to an active partner.</p>
      </article>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Acquisition queue</div><h2>Mapped businesses</h2></div>
        <p className="section-note">Open a dossier → contact/claim → formal application → verification → catalog onboarding → test-ready → activation.</p>
      </div>

      {data.vendors.length === 0 ? <article className="vendor-card-form">
        <div className="eyebrow">No imported research records</div>
        <h3>The acquisition queue is currently empty.</h3>
        <p>No fictional or demo businesses are substituted.</p>
      </article> : <div className="vendor-order-list">{data.vendors.map((vendor) => <article className="vendor-order" key={vendor.id}>
        <div className="vendor-order-head">
          <div><strong>{vendor.tradingName}</strong><small>{vendor.legalName} · {vendor.censusId ? `Census ${vendor.censusId} · ` : ""}{vendor.id}</small></div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="vendor-order-lines">
          <span>{[vendor.majorBranch,vendor.subBranch].filter(Boolean).join(" · ") || "Research classification pending import"}</span>
          <span>{[vendor.scope,vendor.distanceKm == null ? undefined : `${vendor.distanceKm} km`].filter(Boolean).join(" · ") || locationLine(vendor)}</span>
          <span>{vendor.phone ?? "No phone loaded"} · {vendor.email ?? "No email loaded"}</span>
          <span>Outreach: {vendor.outreachPriority ?? "—"}{vendor.outreachScore == null ? "" : ` · score ${vendor.outreachScore}`}</span>
          <span>Online: {vendor.onlineShopStatus ?? "—"} · ΓΕΜΗ: {vendor.gemiResearch ?? "—"}</span>
          <span>Source rows: {vendor.sourceRecordCount} · Verification evidence: {vendor.evidenceCount}</span>
          {(vendor.latestIssueSeverity || vendor.latestIssueType) && <span>Website audit: {vendor.latestIssueSeverity ?? "—"} · {vendor.latestIssueType ?? "—"}</span>}
        </div>
        <div className="vendor-order-foot">
          <span>{vendor.regulationFlag ?? vendor.shortDescription ?? "Invited research prospect."}</span>
          <div className="hero-actions">
            <Link className="button button-secondary" href={`/admin/research-vendors/${encodeURIComponent(vendor.id)}`}>Open full research card</Link>
            <Link className="text-link" href="/admin/vendors">Application workflow →</Link>
          </div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><div className="eyebrow">Workflow boundary</div><h2>Research is not onboarding</h2><p>Research records may contain public business evidence and contact details, but activation controls remain in the vendor application workflow.</p><Link className="text-link" href="/admin/vendors">Open application workflow →</Link></article>
        <article className="vendor-card-form"><div className="eyebrow">Catalog readiness</div><h2>Products remain separately governed</h2><p>Products still require category assignment, canonical matching, offer approval, inventory freshness and publication gates.</p><Link className="text-link" href="/admin/matching">Open product matching →</Link></article>
      </div>
    </section>
  </main>;
}
