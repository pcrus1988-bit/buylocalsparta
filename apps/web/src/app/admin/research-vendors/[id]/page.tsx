import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchVendorDossier, type ResearchSourceRecord } from "../../../../lib/research-vendors-runtime";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export const metadata: Metadata = { title: "Admin · Research Vendor Dossier", robots: { index: false, follow: false } };

const sourceLabels: Record<string, string> = {
  merchant_census: "Merchant census",
  active_online_shop: "Active online shop verification",
  gemi_sample: "ΓΕΜΗ sample research",
  eshop_issue: "E-shop issue lead"
};

function safeHttpUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function renderTextValue(value: unknown) {
  if (value === null || value === undefined || value === "") return <span>—</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  if (typeof value === "number") return <span>{value.toLocaleString("el-GR")}</span>;
  if (typeof value !== "string") return <span>{JSON.stringify(value)}</span>;

  const urls = value.split(";").map((part) => safeHttpUrl(part.trim())).filter((url): url is string => Boolean(url));
  if (urls.length > 0 && urls.length === value.split(";").length) {
    return <span>{urls.map((url, index) => <span key={url}>{index > 0 ? " · " : null}<a className="text-link" href={url} target="_blank" rel="noreferrer">Open source ↗</a></span>)}</span>;
  }
  return <span>{value}</span>;
}

function SourceCard({ source }: { source: ResearchSourceRecord }) {
  const entries = Object.entries(source.payload);
  return <article className="vendor-order">
    <div className="vendor-order-head">
      <div><strong>{sourceLabels[source.sourceType] ?? source.sourceType}</strong><small>{source.title} · {source.sourceKey}</small></div>
      <span className="status-pill">{source.checkedAt ?? "undated"}</span>
    </div>
    <div className="vendor-order-lines">
      <span>Link role: {source.linkRole}</span>
      {entries.length === 0 ? <span>No payload fields stored.</span> : entries.map(([key, value]) => <span key={key}><strong>{key}:</strong> {renderTextValue(value)}</span>)}
    </div>
  </article>;
}

export default async function ResearchVendorDossierPage({ params }: Props) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { id } = await params;
  const data = await researchVendorDossier(principal, decodeURIComponent(id));
  if (data.databaseConfigured && !data.vendor) notFound();

  if (!data.databaseConfigured || !data.vendor) {
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={data.csrfToken} />
      <section className="shell vendor-section">
        <article className="vendor-card-form needs-attention">
          <div className="eyebrow">Research dossier unavailable</div>
          <h1>Production database is not configured.</h1>
          <Link className="text-link" href="/admin/research-vendors">← Back to research vendors</Link>
        </article>
      </section>
    </main>;
  }

  const vendor = data.vendor;
  const onlineShopUrl = safeHttpUrl(vendor.onlineShopUrl);
  const directoryProfile = safeHttpUrl(vendor.directoryProfile);
  const profileEntries = Object.entries(vendor.profilePayload);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />

    <section className="shell vendor-hero vendor-hero-compact">
      <div>
        <div className="eyebrow">Invited vendor dossier · workbook-backed acquisition intelligence</div>
        <h1>{vendor.tradingName}</h1>
        <p className="lead">{vendor.legalName}{vendor.primaryCensusId === undefined ? "" : ` · Census #${vendor.primaryCensusId}`}. This page shows the complete stored research record while keeping research clearly separate from merchant-verified onboarding data.</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">← All research vendors</Link>
          <Link className="button" href="/admin/vendors">Formal application workflow</Link>
          {onlineShopUrl ? <a className="text-link" href={onlineShopUrl} target="_blank" rel="noreferrer">Open online shop ↗</a> : null}
        </div>
      </div>
      <aside>
        <span>Status</span>
        <strong>{vendor.status}</strong>
        <p>{vendor.outreachPriority ?? "No outreach priority"}{vendor.outreachScore === undefined ? "" : ` · score ${vendor.outreachScore}/10`}</p>
      </aside>
    </section>

    <section className="shell">
      <div className="vendor-kpis admin-kpis">
        <div className="has-work"><span>Research sources</span><strong>{vendor.researchSourceCount}</strong></div>
        <div className={vendor.evidenceCount > 0 ? "has-work" : undefined}><span>Verification evidence</span><strong>{vendor.evidenceCount}</strong></div>
        <div className={vendor.verificationCount > 0 ? "has-work" : undefined}><span>Verified checks</span><strong>{vendor.verificationCount}</strong></div>
        <div><span>Source kind</span><strong>{vendor.sourceKind ?? "—"}</strong></div>
        <div><span>Plan</span><strong>{vendor.planCode ?? "—"}</strong></div>
        <div><span>Subscription</span><strong>{vendor.subscriptionStatus ?? "—"}</strong></div>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form">
          <div className="eyebrow">Business & contact</div>
          <h2>Research identity</h2>
          <div className="vendor-order-lines">
            <span><strong>Trading name:</strong> {vendor.tradingName}</span>
            <span><strong>Legal / directory name:</strong> {vendor.legalName}</span>
            <span><strong>Address:</strong> {[vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "—"}</span>
            <span><strong>Distance:</strong> {vendor.distanceKm === undefined ? "—" : `${vendor.distanceKm.toLocaleString("el-GR")} km`}</span>
            <span><strong>Phone:</strong> {vendor.phone ?? "—"}</span>
            <span><strong>Email:</strong> {vendor.email ?? "—"}</span>
            <span><strong>Marketplace scope:</strong> {vendor.marketplaceScope ?? "—"}</span>
            <span><strong>Checked:</strong> {vendor.checkedAt ?? "—"}</span>
          </div>
        </article>

        <article className="vendor-card-form">
          <div className="eyebrow">Category & commerce fit</div>
          <h2>Acquisition profile</h2>
          <div className="vendor-order-lines">
            <span><strong>Major branch:</strong> {vendor.majorBranch ?? "—"}</span>
            <span><strong>Sub-branch:</strong> {vendor.subBranch ?? "—"}</span>
            <span><strong>Directory categories:</strong> {vendor.directoryCategories ?? "—"}</span>
            <span><strong>Regulation flag:</strong> {vendor.regulationFlag ?? "—"}</span>
            <span><strong>Storefront status:</strong> {vendor.storefrontStatus ?? "—"}</span>
            <span><strong>Recommended commerce mode:</strong> {vendor.recommendedCommerceMode ?? "—"}</span>
            <span><strong>Seller relationship:</strong> {vendor.sellerRelationship ?? "—"}</span>
          </div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form">
          <div className="eyebrow">Online commerce</div>
          <h2>E-shop status</h2>
          <div className="vendor-order-lines">
            <span><strong>Online shop active:</strong> {vendor.onlineShopActive ?? "Not verified"}</span>
            <span><strong>Domain:</strong> {onlineShopUrl ? <a className="text-link" href={onlineShopUrl} target="_blank" rel="noreferrer">{vendor.onlineShopUrl} ↗</a> : vendor.onlineShopUrl ?? "—"}</span>
            <span><strong>Latest issue severity:</strong> {vendor.latestIssueSeverity ?? "—"}</span>
            <span><strong>Latest issue type:</strong> {vendor.latestIssueType ?? "—"}</span>
          </div>
        </article>

        <article className="vendor-card-form">
          <div className="eyebrow">ΓΕΜΗ & verification</div>
          <h2>Candidate legal data</h2>
          <div className="vendor-order-lines">
            <span><strong>ΓΕΜΗ research:</strong> {vendor.gemiResearch ?? "—"}</span>
            <span><strong>Candidate legal name:</strong> {vendor.candidateLegalName ?? "—"}</span>
            <span><strong>Candidate ΓΕΜΗ:</strong> {vendor.candidateGemi ?? "—"}</span>
            <span><strong>Candidate VAT:</strong> {vendor.candidateVat ?? "—"}</span>
            <span><strong>Verified business ΓΕΜΗ:</strong> {vendor.gemiNumber ?? "—"}</span>
            <span><strong>Verified business VAT:</strong> {vendor.taxNumber ?? "—"}</span>
            <span><strong>Legal form:</strong> {vendor.legalForm ?? "—"}</span>
            <span><strong>Verification completed:</strong> {vendor.verificationCompletedAt ?? "—"}</span>
          </div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form">
        <div className="eyebrow">Next action</div>
        <h2>Outreach & verification guidance</h2>
        <p>{vendor.verificationAction ?? "No specific verification action recorded."}</p>
        <div className="hero-actions">
          {directoryProfile ? <a className="button button-secondary" href={directoryProfile} target="_blank" rel="noreferrer">Open directory profile ↗</a> : null}
          {vendor.listingSource ? <span className="section-note">Listing source retained in the raw research snapshot below.</span> : null}
        </div>
      </article>
    </section>

    <section className="shell vendor-section">
      <div className="section-heading">
        <div><div className="eyebrow">Complete evidence trail</div><h2>Workbook source records</h2></div>
        <p className="section-note">These cards expose every key/value pair stored from the original research rows. They are evidence for acquisition and verification, not merchant-approved public profile copy.</p>
      </div>
      <div className="vendor-order-list">
        {vendor.sources.length > 0 ? vendor.sources.map((source) => <SourceCard source={source} key={`${source.sourceType}:${source.sourceKey}`} />) : <article className="vendor-card-form"><p>No linked source records were found.</p></article>}
      </div>
    </section>

    <section className="shell vendor-section">
      <div className="vendor-two-col admin-summary">
        <article className="vendor-card-form">
          <div className="eyebrow">Normalized snapshot</div>
          <h2>Primary research payload</h2>
          <div className="vendor-order-lines">
            {profileEntries.length > 0 ? profileEntries.map(([key, value]) => <span key={key}><strong>{key}:</strong> {renderTextValue(value)}</span>) : <span>No normalized payload stored.</span>}
          </div>
        </article>
        <article className="vendor-card-form">
          <div className="eyebrow">Verification records</div>
          <h2>Research checks</h2>
          <div className="vendor-order-lines">
            {vendor.verifications.length > 0 ? vendor.verifications.map((verification, index) => <span key={`${verification.type}:${verification.checkedAt ?? index}`}><strong>{verification.type}:</strong> {verification.status}{verification.checkedAt ? ` · ${verification.checkedAt}` : ""}</span>) : <span>No research verification checks stored.</span>}
          </div>
        </article>
      </div>
    </section>

    <section className="shell vendor-section">
      <article className="vendor-card-form">
        <div className="eyebrow">Governance boundary</div>
        <h2>Research remains internal until claimed and verified</h2>
        <p>This dossier can guide outreach and onboarding, but public-source legal candidates, e-shop observations, contact data and issue notes must not be treated as merchant-approved storefront content. The formal vendor application and verification workflow remains the authority for activation.</p>
        <Link className="text-link" href="/admin/vendors">Continue to governed vendor onboarding →</Link>
      </article>
    </section>
  </main>;
}
