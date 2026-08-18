import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchVendorDetail, type ResearchVendorSourceRecord } from "../../../../lib/research-vendors-runtime";

export const metadata: Metadata = { title: "Admin · Vendor Research Dossier", robots: { index: false, follow: false } };

type PageProps = {
  params: Promise<{ vendorId: string }>;
};

const sourceLabels: Record<string, string> = {
  merchant_census: "Merchant census",
  gemi_sample: "GEMI research sample",
  active_online_shop: "Active online-shop research",
  eshop_issue: "E-shop issue / lead"
};

function valueText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value, null, 2);
}

function urlParts(value: unknown): string[] | null {
  if (typeof value !== "string") return null;
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((part) => /^https?:\/\//i.test(part)) ? parts : null;
}

function EvidenceValue({ value }: { value: unknown }) {
  const links = urlParts(value);
  if (links) {
    return <span>{links.map((url, index) => <span key={url}>{index > 0 ? " · " : ""}<a className="text-link" href={url} target="_blank" rel="noreferrer">{url}</a></span>)}</span>;
  }
  if (value && typeof value === "object") return <pre>{valueText(value)}</pre>;
  return <span>{valueText(value)}</span>;
}

function fact(label: string, value: unknown) {
  return <div key={label}><span>{label}</span><strong>{valueText(value)}</strong></div>;
}

function SourceCard({ source }: { source: ResearchVendorSourceRecord }) {
  return <article className="vendor-card-form">
    <div className="vendor-order-head">
      <div>
        <div className="eyebrow">{sourceLabels[source.sourceType] ?? source.sourceType}</div>
        <h3>{source.title}</h3>
        <small>{source.sourceKey} · role: {source.linkRole}</small>
      </div>
      <span className="status-pill">{source.checkedAt ?? "No checked date"}</span>
    </div>
    <div className="vendor-order-list">
      {Object.entries(source.payload).map(([key, value]) => <div className="vendor-order" key={`${source.id}-${key}`}>
        <div className="vendor-order-head">
          <strong>{key}</strong>
        </div>
        <div className="vendor-order-lines"><EvidenceValue value={value} /></div>
      </div>)}
    </div>
  </article>;
}

export default async function ResearchVendorDetailPage({ params }: PageProps) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { vendorId } = await params;
  const vendor = await researchVendorDetail(principal, decodeURIComponent(vendorId));
  if (!vendor) notFound();

  const classificationFacts = [
    ["Source kind", vendor.sourceKind],
    ["Census ID", vendor.primaryCensusId],
    ["Major branch", vendor.majorBranch],
    ["Sub-branch", vendor.subBranch],
    ["Marketplace scope", vendor.marketplaceScope],
    ["Distance from Sparta", vendor.distanceKm !== undefined ? `${vendor.distanceKm} km` : undefined],
    ["Directory categories", vendor.directoryCategories],
    ["Storefront status", vendor.storefrontStatus],
    ["Research checked", vendor.checkedAt]
  ] as const;

  const outreachFacts = [
    ["Outreach priority", vendor.outreachPriority],
    ["Outreach score", vendor.outreachScore !== undefined ? `${vendor.outreachScore}/10` : undefined],
    ["Regulation flag", vendor.regulationFlag],
    ["Recommended commerce mode", vendor.recommendedCommerceMode],
    ["Verification action", vendor.verificationAction]
  ] as const;

  const legalFacts = [
    ["Core legal name", vendor.legalName],
    ["Core legal form", vendor.legalForm],
    ["Core GEMI", vendor.gemiNumber],
    ["Core VAT / tax number", vendor.taxNumber],
    ["Research match status", vendor.gemiResearch],
    ["Candidate legal name", vendor.candidateLegalName],
    ["Candidate GEMI", vendor.candidateGemi],
    ["Candidate VAT", vendor.candidateVat]
  ] as const;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact">
      <div>
        <div className="eyebrow">Invited vendor dossier · research ≠ merchant verification</div>
        <h1>{vendor.tradingName}</h1>
        <p className="lead">{vendor.shortDescription ?? "Complete acquisition research assembled from the Sparta marketplace workbook and retained with source-level evidence."}</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">← All research vendors</Link>
          <Link className="button" href="/admin/vendors">Governed onboarding</Link>
          {vendor.onlineShopUrl ? <a className="text-link" href={vendor.onlineShopUrl} target="_blank" rel="noreferrer">Open online shop →</a> : null}
        </div>
      </div>
      <aside>
        <span>Research identity</span>
        <strong>{vendor.id}</strong>
        <p>Status: {vendor.status} · {vendor.sourceCount} linked workbook source{vendor.sourceCount === 1 ? "" : "s"} · {vendor.locations.length} storefront location{vendor.locations.length === 1 ? "" : "s"}.</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">
        <div className="has-work"><span>Workbook sources</span><strong>{vendor.sourceCount}</strong></div>
        <div className={vendor.issueCount > 0 ? "has-work" : undefined}><span>E-shop findings</span><strong>{vendor.issueCount}</strong></div>
        <div><span>Locations</span><strong>{vendor.locations.length}</strong></div>
        <div><span>Verification checks passed</span><strong>{vendor.verificationCount}</strong></div>
        <div><span>Outreach score</span><strong>{vendor.outreachScore ?? "—"}</strong></div>
        <div><span>Online shop</span><strong>{vendor.onlineShopUrl ? "Known" : "Not recorded"}</strong></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Business intelligence</div><h2>Classification & market fit</h2></div>
        <p className="section-note">Normalized fields make the acquisition database filterable; source rows below preserve the workbook verbatim.</p>
      </div>
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form">
          <h3>Classification</h3>
          <div className="vendor-kpis admin-kpis">{classificationFacts.map(([label, value]) => fact(label, value))}</div>
        </article>
        <article className="vendor-card-form">
          <h3>Outreach & commerce recommendation</h3>
          <div className="vendor-kpis admin-kpis">{outreachFacts.map(([label, value]) => fact(label, value))}</div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Contact & footprint</div><h2>Storefront locations</h2></div>
        <p className="section-note">Primary contact: {vendor.primaryPhone ?? vendor.phone ?? "—"} · {vendor.primaryEmail ?? vendor.email ?? "—"}</p>
      </div>
      <div className="vendor-order-list">{vendor.locations.map((location) => <article className="vendor-order" key={location.id}>
        <div className="vendor-order-head">
          <div><strong>{location.name}</strong><small>{location.id}</small></div>
          <span className="status-pill">{location.isPrimary ? "Primary" : "Additional"}</span>
        </div>
        <div className="vendor-order-lines">
          <span>{location.address} · {location.locality} · {location.postcode}</span>
          <span>{location.phone ?? "No phone"} · {location.email ?? "No public email"}</span>
          <span>{location.active ? "Active research location" : "Inactive location"}</span>
        </div>
      </article>)}</div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Legal research boundary</div><h2>Core legal fields vs research candidates</h2></div>
        <p className="section-note">Candidate fields are research leads only. Core legal fields may only be used operationally after the appropriate verification workflow.</p>
      </div>
      <article className="vendor-card-form">
        <div className="vendor-kpis admin-kpis">{legalFacts.map(([label, value]) => fact(label, value))}</div>
      </article>
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form">
          <div className="eyebrow">Online presence</div>
          <h2>{vendor.onlineShopActive ?? "Online shop not verified"}</h2>
          <p>{vendor.onlineShopUrl ? <a className="text-link" href={vendor.onlineShopUrl} target="_blank" rel="noreferrer">{vendor.onlineShopUrl}</a> : "No domain is stored in the research profile."}</p>
          <p>Latest issue: {vendor.latestIssueSeverity ? `${vendor.latestIssueSeverity}${vendor.latestIssueType ? ` · ${vendor.latestIssueType}` : ""}` : "No issue record linked."}</p>
        </article>
        <article className="vendor-card-form">
          <div className="eyebrow">Directory evidence</div>
          <h2>External research references</h2>
          <p><strong>Profile:</strong> {vendor.directoryProfile ? <a className="text-link" href={vendor.directoryProfile} target="_blank" rel="noreferrer">{vendor.directoryProfile}</a> : "—"}</p>
          <p><strong>Listing source:</strong> <EvidenceValue value={vendor.listingSource} /></p>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Source-level audit trail</div><h2>Complete workbook evidence</h2></div>
        <p className="section-note">Every field from every workbook row linked to this invited vendor is rendered below, including null/blank fields, evidence URLs and checked dates.</p>
      </div>
      {vendor.sources.length === 0 ? <article className="vendor-card-form"><p>No linked source evidence was found.</p></article> : <div className="vendor-order-list">{vendor.sources.map((source) => <SourceCard source={source} key={source.id} />)}</div>}
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form">
        <div className="eyebrow">Workflow boundary</div>
        <h2>Research data does not activate a merchant</h2>
        <p>This dossier supports acquisition and verification work. Publication, product selling, payments and fulfilment remain gated by the formal vendor workflow and merchant-authorised data.</p>
        <div className="hero-actions">
          <Link className="button" href="/admin/vendors">Continue governed onboarding</Link>
          <Link className="button button-secondary" href="/admin/research-vendors">Back to research queue</Link>
        </div>
      </article>
    </section>
  </main>;
}
