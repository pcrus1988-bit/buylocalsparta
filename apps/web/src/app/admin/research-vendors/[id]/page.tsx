import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { getAdminSession } from "../../../../lib/admin-session";
import { researchVendorDossier, type ResearchSourceRecord } from "../../../../lib/research-vendors-runtime";
import { promoteResearchVendorToApplications } from "../../applications/actions";

type Props = Readonly<{ params: Promise<{ id: string }> }>;

export const metadata: Metadata = { title: "Admin · Research Vendor Dossier", robots: { index: false, follow: false } };

const PRE_LIVE = new Set(["application_started", "verification_pending", "catalog_onboarding", "test_ready"]);

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

  const parts = value.split(";");
  const urls = parts.map((part) => safeHttpUrl(part.trim())).filter((url): url is string => Boolean(url));
  if (urls.length > 0 && urls.length === parts.length) {
    return <span>{urls.map((url, index) => <span key={url}>{index > 0 ? " · " : null}<a className="text-link" href={url} target="_blank" rel="noreferrer">Open source ↗</a></span>)}</span>;
  }
  return <span>{value}</span>;
}

function DetailRow({ label, children, hint }: Readonly<{ label: string; children: React.ReactNode; hint?: string }>) {
  return <div className="workspace-compact-row"><strong>{label}</strong><span>{children}</span>{hint && <small>{hint}</small>}</div>;
}

function SourceCard({ source }: { source: ResearchSourceRecord }) {
  const entries = Object.entries(source.payload);
  return <details className="workspace-tool-panel">
    <summary><span><strong>{sourceLabels[source.sourceType] ?? source.sourceType}</strong><small>{source.title} · {source.checkedAt ?? "undated"}</small></span></summary>
    <div className="workspace-tool-body">
      <div className="workspace-queue-primary"><span>{source.linkRole}</span><span>{entries.length} stored fields</span></div>
      <WorkspaceRecordDetails label="Source key & raw workbook fields">
        <div className="workspace-compact-list">
          <DetailRow label="Source key">{source.sourceKey}</DetailRow>
          {entries.length === 0 ? <DetailRow label="Payload">No payload fields stored.</DetailRow> : entries.map(([key, value]) => <DetailRow label={key} key={key}>{renderTextValue(value)}</DetailRow>)}
        </div>
      </WorkspaceRecordDetails>
    </div>
  </details>;
}

export default async function ResearchVendorDossierPage({ params }: Props) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const { id } = await params;
  const data = await researchVendorDossier(principal, decodeURIComponent(id));
  if (data.databaseConfigured && !data.vendor) notFound();

  if (!data.databaseConfigured || !data.vendor) {
    return <main className="vendor-app admin-app">
      <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel="Vendor dossier" />
      <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Research dossier unavailable</div><h1>Vendor dossier</h1><p className="lead">The production database is not configured, so no fallback dossier is generated.</p></div></section>
      <section className="shell vendor-section"><WorkspaceEmptyState title="Production research data is unavailable." body="Research records remain database-backed and are never replaced with demo vendor data." action={<Link className="button button-secondary" href="/admin/research-vendors">← Research vendors</Link>} /></section>
    </main>;
  }

  const vendor = data.vendor;
  const onlineShopUrl = safeHttpUrl(vendor.onlineShopUrl);
  const directoryProfile = safeHttpUrl(vendor.directoryProfile);
  const profileEntries = Object.entries(vendor.profilePayload);
  const location = [vendor.address, vendor.locality, vendor.postcode].filter(Boolean).join(" · ") || "—";
  const commerceSignals = [vendor.recommendedCommerceMode, vendor.onlineShopActive, vendor.storefrontStatus].filter(Boolean);
  const inApplications = PRE_LIVE.has(vendor.status);

  const applicationAction = vendor.status === "invited"
    ? <form action={promoteResearchVendorToApplications}>
        <input type="hidden" name="csrfToken" value={data.csrfToken} />
        <input type="hidden" name="vendorId" value={vendor.id} />
        <input type="hidden" name="reason" value="Promote research prospect to Applications" />
        <button className="button" type="submit">Move to Applications</button>
      </form>
    : inApplications
      ? <Link className="button" href={`/admin/applications#vendor-${encodeURIComponent(vendor.id)}`}>Open in Applications</Link>
      : <Link className="button button-secondary" href="/admin/vendors">Partner record</Link>;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} entityLabel={vendor.tradingName} />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Invited vendor dossier · acquisition research</div>
        <h1>{vendor.tradingName}</h1>
        <p className="lead">{vendor.legalName}{vendor.majorBranch ? ` · ${vendor.majorBranch}` : ""}{vendor.subBranch ? ` / ${vendor.subBranch}` : ""}</p>
        <div className="hero-actions">
          <Link className="button button-secondary" href="/admin/research-vendors">← Research queue</Link>
          {applicationAction}
          {onlineShopUrl && <a className="text-link" href={onlineShopUrl} target="_blank" rel="noreferrer">Online shop ↗</a>}
        </div>
      </div>
      <aside>
        <span>Acquisition status</span>
        <strong>{vendor.status}</strong>
        <p>{vendor.outreachPriority ?? "No outreach priority"}{vendor.outreachScore === undefined ? "" : ` · ${vendor.outreachScore}/10`}</p>
      </aside>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Research sources", value: vendor.researchSourceCount },
      { label: "Evidence", value: vendor.evidenceCount, tone: vendor.evidenceCount ? "positive" : "default" },
      { label: "Verified checks", value: vendor.verificationCount, tone: vendor.verificationCount ? "positive" : "default" },
      { label: "Outreach score", value: vendor.outreachScore === undefined ? "—" : `${vendor.outreachScore}/10`, tone: vendor.outreachPriority ? "attention" : "default", hint: vendor.outreachPriority ?? vendor.sourceKind ?? undefined }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="At a glance" title="Research profile" note="Merchant-verified onboarding remains authoritative. This section is acquisition intelligence only." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Business & contact</strong><small>{location}</small></div><span className="status-pill">{vendor.marketplaceScope ?? "scope pending"}</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <DetailRow label="Legal / directory name">{vendor.legalName}</DetailRow>
            <DetailRow label="Phone">{vendor.phone ?? "—"}</DetailRow>
            <DetailRow label="Email">{vendor.email ?? "—"}</DetailRow>
            <DetailRow label="Distance">{vendor.distanceKm === undefined ? "—" : `${vendor.distanceKm.toLocaleString("el-GR")} km`}</DetailRow>
          </div>
          <WorkspaceRecordDetails label="Census, source & timestamp references">
            <div className="workspace-compact-list">
              <DetailRow label="Primary census ID">{vendor.primaryCensusId ?? "—"}</DetailRow>
              <DetailRow label="Source kind">{vendor.sourceKind ?? "—"}</DetailRow>
              <DetailRow label="Checked">{vendor.checkedAt ?? "—"}</DetailRow>
              <DetailRow label="Marketplace scope">{vendor.marketplaceScope ?? "—"}</DetailRow>
            </div>
          </WorkspaceRecordDetails>
        </article>

        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Commerce fit</strong><small>{commerceSignals.join(" · ") || "Awaiting classification"}</small></div><span className="status-pill">{vendor.recommendedCommerceMode ?? "unclassified"}</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <DetailRow label="Major branch">{vendor.majorBranch ?? "—"}</DetailRow>
            <DetailRow label="Sub-branch">{vendor.subBranch ?? "—"}</DetailRow>
            <DetailRow label="Online shop">{vendor.onlineShopActive ?? "Not verified"}</DetailRow>
            <DetailRow label="Seller relationship">{vendor.sellerRelationship ?? "—"}</DetailRow>
          </div>
          <WorkspaceRecordDetails label="Category & regulation detail">
            <div className="workspace-compact-list">
              <DetailRow label="Directory categories">{vendor.directoryCategories ?? "—"}</DetailRow>
              <DetailRow label="Regulation flag">{vendor.regulationFlag ?? "—"}</DetailRow>
              <DetailRow label="Storefront status">{vendor.storefrontStatus ?? "—"}</DetailRow>
              <DetailRow label="Recommended commerce mode">{vendor.recommendedCommerceMode ?? "—"}</DetailRow>
            </div>
          </WorkspaceRecordDetails>
        </article>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Next action" title="Outreach & verification" note="Lead with the evidence needed for the next contact; open legal and e-shop details only when required." />
      <article className="workspace-queue-card">
        <div className="workspace-queue-head"><div><strong>{vendor.verificationAction ?? "No specific verification action recorded."}</strong><small>{vendor.outreachPriority ?? "No outreach priority"}{vendor.outreachScore === undefined ? "" : ` · score ${vendor.outreachScore}/10`}</small></div><span className="status-pill">{vendor.status}</span></div>
        <div className="workspace-action-bar">
          <span>Research → Applications → DEMO / verification → onboarding → activation.</span>
          <div className="workspace-action-buttons">{directoryProfile && <a className="button button-secondary" href={directoryProfile} target="_blank" rel="noreferrer">Directory profile ↗</a>}{onlineShopUrl && <a className="button button-secondary" href={onlineShopUrl} target="_blank" rel="noreferrer">Online shop ↗</a>}{applicationAction}</div>
        </div>
      </article>

      <div className="workspace-dual-grid" style={{ marginTop: 12 }}>
        <details className="workspace-tool-panel">
          <summary><span><strong>E-shop evidence</strong><small>{vendor.onlineShopActive ?? "Not verified"}{vendor.latestIssueSeverity ? ` · ${vendor.latestIssueSeverity}` : ""}</small></span></summary>
          <div className="workspace-tool-body"><div className="workspace-compact-list"><DetailRow label="Domain">{onlineShopUrl ? <a className="text-link" href={onlineShopUrl} target="_blank" rel="noreferrer">{vendor.onlineShopUrl} ↗</a> : vendor.onlineShopUrl ?? "—"}</DetailRow><DetailRow label="Latest issue severity">{vendor.latestIssueSeverity ?? "—"}</DetailRow><DetailRow label="Latest issue type">{vendor.latestIssueType ?? "—"}</DetailRow></div></div>
        </details>
        <details className="workspace-tool-panel">
          <summary><span><strong>ΓΕΜΗ & legal candidate</strong><small>{vendor.gemiResearch ?? "No ΓΕΜΗ research status"}</small></span></summary>
          <div className="workspace-tool-body"><div className="workspace-compact-list"><DetailRow label="Candidate legal name">{vendor.candidateLegalName ?? "—"}</DetailRow><DetailRow label="Candidate ΓΕΜΗ">{vendor.candidateGemi ?? "—"}</DetailRow><DetailRow label="Candidate VAT">{vendor.candidateVat ?? "—"}</DetailRow><DetailRow label="Verified ΓΕΜΗ">{vendor.gemiNumber ?? "—"}</DetailRow><DetailRow label="Verified VAT">{vendor.taxNumber ?? "—"}</DetailRow><DetailRow label="Legal form">{vendor.legalForm ?? "—"}</DetailRow><DetailRow label="Verification completed">{vendor.verificationCompletedAt ?? "—"}</DetailRow></div></div>
        </details>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Evidence trail" title="Workbook source records" note="Every stored source remains available, but raw key/value data is collapsed until an investigation needs it." />
      {vendor.sources.length > 0 ? <div className="workspace-queue-list">{vendor.sources.map((source) => <SourceCard source={source} key={`${source.sourceType}:${source.sourceKey}`} />)}</div> : <WorkspaceEmptyState title="No linked source records were found." />}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Deep evidence" title="Normalized payload & research checks" note="Low-level research data stays available without dominating the dossier." />
      <div className="workspace-dual-grid">
        <details className="workspace-tool-panel">
          <summary><span><strong>Primary research payload</strong><small>{profileEntries.length} normalized fields</small></span></summary>
          <div className="workspace-tool-body">{profileEntries.length > 0 ? <div className="workspace-compact-list">{profileEntries.map(([key, value]) => <DetailRow label={key} key={key}>{renderTextValue(value)}</DetailRow>)}</div> : <p className="workspace-queue-summary">No normalized payload stored.</p>}</div>
        </details>
        <details className="workspace-tool-panel">
          <summary><span><strong>Research verification checks</strong><small>{vendor.verifications.length} records</small></span></summary>
          <div className="workspace-tool-body">{vendor.verifications.length > 0 ? <div className="workspace-compact-list">{vendor.verifications.map((verification, index) => <DetailRow label={verification.type} key={`${verification.type}:${verification.checkedAt ?? index}`} hint={verification.checkedAt}>{verification.status}</DetailRow>)}</div> : <p className="workspace-queue-summary">No research verification checks stored.</p>}</div>
        </details>
      </div>
    </div></section>

    <section className="shell vendor-section">
      <div className="workspace-inline-note">This dossier is internal acquisition intelligence. Public-source legal candidates, e-shop observations, contact data and issue notes are not merchant-approved storefront content. Moving the prospect to Applications does not activate commerce; it only enables governed follow-up, DEMO and catalogue preparation.</div>
      <div className="workspace-form-actions">{applicationAction}</div>
    </section>
  </main>;
}