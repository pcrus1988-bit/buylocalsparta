import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchVendorDetailWorkspace } from "../../../../lib/research-vendor-detail-runtime";

export const metadata: Metadata = { title: "Admin · Research Vendor Dossier", robots: { index: false, follow: false } };

function urlValue(value: unknown) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}
function displayValue(value: unknown) {
  if (value == null || value === "") return <span>—</span>;
  if (urlValue(value)) return <a className="text-link" href={String(value)} target="_blank" rel="noreferrer">{String(value)}</a>;
  if (Array.isArray(value)) return <span>{value.map(String).join(" · ") || "—"}</span>;
  if (typeof value === "object") return <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: 0 }}>{JSON.stringify(value, null, 2)}</pre>;
  return <span>{String(value)}</span>;
}
function fact(label: string, value: unknown) {
  return <div><dt>{label}</dt><dd>{displayValue(value)}</dd></div>;
}
function sourceLabel(type: string) {
  const labels: Record<string,string> = {
    merchant_census: "Merchant Census",
    gemi_sample: "ΓΕΜΗ Sample",
    active_online_shop: "Active Online Shops",
    eshop_issue: "E-shop Issues & Leads"
  };
  return labels[type] ?? type.replaceAll("_", " ");
}

export default async function ResearchVendorDossierPage({ params }: { params: Promise<{ vendorId: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { vendorId } = await params;
  const data = await researchVendorDetailWorkspace(principal, decodeURIComponent(vendorId));
  if (!data) notFound();
  const v = data.vendor;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact">
      <div>
        <div className="eyebrow">Invited vendor dossier · research ≠ merchant verification</div>
        <h1>{v.tradingName}</h1>
        <p className="lead">{v.legalName} · {v.id}</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">← Research vendors</Link>
          <Link className="button" href="/admin/vendors">Vendor applications</Link>
          <Link className="text-link" href="/admin/categories">Category governance →</Link>
        </div>
      </div>
      <aside>
        <span>Lifecycle</span>
        <strong>{v.status}</strong>
        <p>Claim: {v.claimStatus ?? "—"} · Onboarding: {v.onboardingStatus ?? "—"}</p>
      </aside>
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form needs-attention">
        <div className="eyebrow">Research-use boundary</div>
        <h2>Public-source baseline — reconfirm before outreach or contract</h2>
        <p>This dossier preserves dated public-source research from 14 August 2026. A directory listing, ΓΕΜΗ candidate match, online-shop observation or storefront issue is not proof of a current partnership, open outlet, verified legal identity or permanent website condition. Recheck relevant facts with the merchant before relying on them operationally.</p>
      </article>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading"><div><div className="eyebrow">At a glance</div><h2>Acquisition profile</h2></div></div>
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><h3>Classification</h3><dl>
          {fact("Census ID", v.censusId)}{fact("Source kind", v.sourceKind)}{fact("Major branch", v.majorBranch)}{fact("Sub-branch", v.subBranch)}
          {fact("Scope", v.scope)}{fact("Distance km", v.distanceKm)}{fact("Regulation", v.regulationFlag)}
        </dl></article>
        <article className="vendor-card-form"><h3>Outreach</h3><dl>
          {fact("Priority", v.outreachPriority)}{fact("Score", v.outreachScore)}{fact("Recommended commerce mode", v.recommendedCommerceMode)}
          {fact("Storefront status", v.storefrontStatus)}{fact("Verification action", v.verificationAction)}
        </dl></article>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form"><div className="eyebrow">Contact & discovery</div><h2>Research contact data</h2><dl>
          {fact("Telephone", v.phone)}{fact("Email", v.email)}{fact("Directory categories", v.directoryCategories)}
          {fact("Listing source", v.listingSource)}{fact("Directory profile", v.directoryProfile)}{fact("Checked", v.checkedAt)}
        </dl></article>
        <article className="vendor-card-form"><div className="eyebrow">E-commerce</div><h2>Online shop</h2><dl>
          {fact("Online shop status", v.onlineShopStatus)}{fact("Online shop URL", v.onlineShopUrl)}
          {fact("Latest issue severity", v.latestIssueSeverity)}{fact("Latest issue type", v.latestIssueType)}
        </dl></article>
      </div>
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form">
        <div className="eyebrow">ΓΕΜΗ public-record research</div><h2>Candidate identity — not merchant verified</h2>
        <dl>{fact("Research outcome", v.gemiResearch)}{fact("Candidate legal name", v.candidateLegalName)}{fact("Candidate ΓΕΜΗ", v.candidateGemi)}{fact("Candidate VAT", v.candidateVat)}</dl>
        <p className="section-note">Candidate matches are research leads only. Contracting identity must be confirmed with the merchant and authoritative records.</p>
      </article>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Complete evidence trail</div><h2>Workbook source records ({data.sources.length})</h2></div>
        <p className="section-note">Every stored field from each linked source row is rendered below. Issue-audit observations are dated leads, not a public blacklist.</p>
      </div>
      {data.sources.length === 0 ? <article className="vendor-card-form"><h3>No source row imported yet</h3><p>The vendor core record exists, but its workbook dossier has not yet been linked to the canonical research source tables.</p></article> :
        <div className="vendor-order-list">{data.sources.map(source => <article className="vendor-order" key={source.id}>
          <div className="vendor-order-head"><div><strong>{sourceLabel(source.type)}</strong><small>{source.key} · {source.title}</small></div><span className="status-pill">{source.checkedAt ?? "undated"}</span></div>
          <div className="vendor-order-lines"><span>Link role: {source.role}</span></div>
          <dl className="vendor-card-form" style={{ marginTop: "1rem" }}>{Object.entries(source.payload).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl>
        </article>)}</div>}
    </section>

    {Object.keys(v.sourcePayload).length > 0 && <section className="shell vendor-section">
      <article className="vendor-card-form"><div className="eyebrow">Normalized source projection</div><h2>Stored profile payload</h2><dl>{Object.entries(v.sourcePayload).map(([key,value]) => <div key={key}><dt>{key}</dt><dd>{displayValue(value)}</dd></div>)}</dl></article>
    </section>}
  </main>;
}
