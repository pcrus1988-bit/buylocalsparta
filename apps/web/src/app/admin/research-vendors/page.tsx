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
        <p className="lead">Businesses discovered through the Sparta research dataset live here before they enter the formal application and activation workflow. A research record is never treated as an approved partner merely because it exists in the database.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Vendor applications</Link>
          <Link className="button button-secondary" href="/admin/categories">Category governance</Link>
          <Link className="text-link" href="/shops">Public directory →</Link>
        </div>
      </div>
      <aside className={data.databaseConfigured ? undefined : "needs-attention"}>
        <span>Data source</span>
        <strong>{data.databaseConfigured ? "PostgreSQL" : "Unavailable"}</strong>
        <p>{data.databaseConfigured ? "Read-only acquisition view from vendor, location, profile, subscription and verification tables." : "Production database is not configured."}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">{metrics.map(([label, value]) => <div className={Number(value) > 0 ? "has-work" : undefined} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Acquisition queue</div><h2>Mapped businesses</h2></div>
        <p className="section-note">Next governed step: owner contact/claim → formal application → verification → catalog onboarding → test-ready → activation.</p>
      </div>

      {data.vendors.length === 0 ? <article className="vendor-card-form">
        <div className="eyebrow">No imported research records</div>
        <h3>The acquisition queue is currently empty.</h3>
        <p>No fictional or demo businesses are substituted. Import or restore the verified Sparta research dataset to populate this queue.</p>
        <div className="hero-actions"><Link className="button button-secondary" href="/admin/vendors">Review formal applications</Link></div>
      </article> : <div className="vendor-order-list">{data.vendors.map((vendor) => <article className="vendor-order" key={vendor.id}>
        <div className="vendor-order-head">
          <div><strong>{vendor.tradingName}</strong><small>{vendor.legalName} · {vendor.id}</small></div>
          <span className="status-pill">{vendor.status}</span>
        </div>
        <div className="vendor-order-lines">
          <span>{locationLine(vendor)}</span>
          <span>{vendor.phone ?? "No phone"} · {vendor.email ?? "No public email"}</span>
          <span>Evidence: {vendor.evidenceCount} · Verified: {vendor.verificationCount}</span>
          <span>Plan: {vendor.planCode ?? "—"} · Subscription: {vendor.subscriptionStatus ?? "—"}</span>
        </div>
        <div className="vendor-order-foot">
          <span>{vendor.shortDescription ?? "Research record awaiting merchant-owned profile content."}</span>
          <div><Link className="text-link" href="/admin/vendors">Continue through governed application →</Link></div>
        </div>
      </article>)}</div>}
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><div className="eyebrow">Workflow boundary</div><h2>Research is not onboarding</h2><p>Research records may contain public business evidence and contact details, but activation controls remain in the vendor application workflow. No business becomes public commerce inventory from this screen.</p><Link className="text-link" href="/admin/vendors">Open application workflow →</Link></article>
        <article className="vendor-card-form"><div className="eyebrow">Catalog readiness</div><h2>Products remain separately governed</h2><p>After merchant onboarding, products still require category assignment, canonical matching, offer approval, inventory freshness and publication gates.</p><Link className="text-link" href="/admin/matching">Open product matching →</Link></article>
      </div>
    </section>
  </main>;
}
