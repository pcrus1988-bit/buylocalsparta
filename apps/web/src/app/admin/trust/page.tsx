import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminTrustWorkspace, hasAdminPermission } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";
import { adminVendorProfileMediaAssignments } from "../../../lib/vendor-profile-media-service";

export const metadata: Metadata = { title: "Admin · Trust", robots: { index: false, follow: false } };

const ROLE_LABELS = { logo: "Logo", storefront: "Storefront", team: "People / team", gallery: "Gallery" } as const;

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const [data, profileAssignments] = await Promise.all([adminTrustWorkspace(principal), adminVendorProfileMediaAssignments(principal)]);
  const profileByMedia = new Map(profileAssignments.map((assignment) => [assignment.mediaId, assignment]));
  const pendingScan = data.assets.filter((asset) => asset.scanStatus === "pending").length;
  const mediaReview = data.assets.filter((asset) => asset.scanStatus === "clean" && (asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved")).length;
  const profilePublication = profileAssignments.filter((assignment) => assignment.publicationStatus === "draft" && assignment.scanStatus === "clean" && assignment.rightsStatus === "approved" && assignment.moderationStatus === "approved").length;
  const complianceQueue = data.documents.filter((document) => document.status === "pending");
  const complianceHistory = data.documents.filter((document) => document.status !== "pending");
  const mediaQueue = data.assets.filter((asset) => {
    const profile = profileByMedia.get(asset.id);
    const approved = asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
    return asset.scanStatus === "pending"
      || (asset.scanStatus === "clean" && (asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved"))
      || Boolean(profile && approved && profile.publicationStatus === "draft");
  });
  const mediaQueueIds = new Set(mediaQueue.map((asset) => asset.id));
  const mediaHistory = data.assets.filter((asset) => !mediaQueueIds.has(asset.id));
  const trustAttention = mediaQueue.length + complianceQueue.length;

  const governanceLanes = [
    { href: "/admin/recalls", label: "Product Safety", eyebrow: "Urgent safety", note: "Open notices, recalls, affected customers and explicit restore decisions.", visible: hasAdminPermission(principal, "returns.read") },
    { href: "/admin/reviews", label: "Reviews", eyebrow: "Marketplace content", note: "Verified-review moderation and vendor report resolution.", visible: hasAdminPermission(principal, "reviews.read") },
    { href: "/admin/privacy", label: "Privacy", eyebrow: "GDPR", note: "Data-subject requests, retention, ROPA and provider governance.", visible: hasAdminPermission(principal, "privacy.read") },
    { href: "/admin/accessibility", label: "Accessibility", eyebrow: "WCAG 2.2 AA", note: "Evidence-backed assessments, remediation findings and barrier reports.", visible: hasAdminPermission(principal, "accessibility.read") },
    { href: "/admin/fairness", label: "Fairness", eyebrow: "Exposure governance", note: "Vendor appeals and assignment/exposure evidence.", visible: hasAdminPermission(principal, "fairness.read") }
  ].filter((lane) => lane.visible);

  const renderMediaAsset = (asset: (typeof data.assets)[number]) => {
    const profile = profileByMedia.get(asset.id);
    const approved = asset.scanStatus === "clean" && asset.rightsStatus === "approved" && asset.moderationStatus === "approved";
    return <article className="workspace-queue-card" key={asset.id}>
      <div className="workspace-queue-head"><div><strong>{asset.originalFilename}</strong><small>{asset.contentType} · {(asset.byteSize / 1024).toFixed(1)} KB{profile ? ` · ${ROLE_LABELS[profile.role]}` : ""}</small></div><span className="status-pill">{profile?.publicationStatus ?? asset.moderationStatus}</span></div>
      <div className="workspace-queue-primary"><span>Scan {asset.scanStatus}</span><span>Rights {asset.rightsStatus}</span><span>Moderation {asset.moderationStatus}</span>{profile && <span>Publication {profile.publicationStatus}</span>}</div>
      <WorkspaceRecordDetails label="Vendor, product & asset references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Asset ID</strong><span>{asset.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{asset.vendorId ?? "platform"}</span></div><div className="workspace-compact-row"><strong>{profile ? "Storefront role" : "Canonical variant"}</strong><span>{profile ? ROLE_LABELS[profile.role] : (asset.canonicalVariantId ?? "—")}</span></div></div></WorkspaceRecordDetails>
      <div className="workspace-action-bar"><span>{asset.scanStatus === "pending" ? "Scan must complete before approval." : profile && approved ? "The file is safe and approved; publication controls whether it is visible on the public vendor page." : "Apply only the next valid trust decision."}</span><div className="workspace-action-buttons">
        {asset.scanStatus === "pending" && data.automatedMalwareScan && <span className="status-pill">Automated scan queued</span>}
        {asset.scanStatus === "pending" && !data.automatedMalwareScan && <AdminActionButton label="Record clean scan" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "scan_clean" }} />}
        {asset.scanStatus === "clean" && (asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved") && <AdminActionButton label="Approve rights & moderation" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "approve" }} />}
        {profile && approved && profile.publicationStatus !== "published" && <AdminActionButton label="Publish to storefront" endpoint="/api/admin/trust/vendor-profile-media" csrfToken={data.csrfToken} body={{ assignmentId: profile.id, action: "publish" }} />}
        {profile && profile.publicationStatus === "published" && <AdminActionButton label="Unpublish" endpoint="/api/admin/trust/vendor-profile-media" csrfToken={data.csrfToken} body={{ assignmentId: profile.id, action: "unpublish" }} />}
        <AdminActionButton label="Reject" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "reject" }} reasonPrompt="Rejection reason" danger />
      </div></div>
    </article>;
  };

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Trust & governance</div><h1>Trust operations</h1><p className="lead">Το Trust εκτελεί media rights/moderation, storefront media publication και compliance verification. Product Safety, Reviews, Privacy, Accessibility και Fairness παραμένουν ξεχωριστά governed workspaces και ανοίγουν από εδώ όταν χρειάζονται δράση.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Needs trust review", value: trustAttention, tone: trustAttention ? "attention" : "positive", hint: `${mediaQueue.length} media · ${complianceQueue.length} compliance` },
      { label: "Scan pending", value: pendingScan, tone: pendingScan ? "attention" : "default" },
      { label: "Rights / moderation", value: mediaReview, tone: mediaReview ? "attention" : "default" },
      { label: "Storefront publish", value: profilePublication, tone: profilePublication ? "attention" : "default" },
      { label: "Compliance pending", value: complianceQueue.length, tone: complianceQueue.length ? "attention" : "default" }
    ]} />

    {governanceLanes.length > 0 && <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Governance routing" title="Open the specialist workspace" note="Trust surfaces the governance domains; each specialist workspace remains the single place that executes its own decisions." />
      <div className="trust-governance-grid">{governanceLanes.map((lane) => <Link className="trust-governance-card" href={lane.href} key={lane.href}><small>{lane.eyebrow}</small><strong>{lane.label}</strong><span>{lane.note}</span><b>Open →</b></Link>)}</div>
    </section>}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Media review" title={`Needs action · ${mediaQueue.length}`} note={data.automatedMalwareScan ? "Action queue only: scan → rights/moderation → storefront publication. Already-decided media stays in history below." : "Action queue only: record clean scan → rights/moderation → storefront publication. Already-decided media stays in history below."} />
      {mediaQueue.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει media που χρειάζεται trust action." body={data.assets.length ? "Reviewed/published media remains available in history below." : "Δεν έχει υποβληθεί vendor media."} /> : <div className="workspace-queue-list">{mediaQueue.map(renderMediaAsset)}</div>}
      {mediaHistory.length > 0 && <details className="workspace-record-details trust-history"><summary>Media history · {mediaHistory.length}</summary><div className="trust-history-body"><div className="workspace-inline-note">Approved, rejected or already-published assets stay available for evidence and exceptional unpublish/reject actions without crowding the daily queue.</div><div className="workspace-queue-list">{mediaHistory.map(renderMediaAsset)}</div></div></details>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Compliance" title={`Verification queue · ${complianceQueue.length}`} note="Pending compliance decisions are primary. Verified/rejected documents remain as evidence history; verification stays independent from media publication." />
      {complianceQueue.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν compliance documents που χρειάζονται review." body={data.documents.length ? "Previous decisions remain in compliance history below." : undefined} /> : <div className="workspace-queue-list">{complianceQueue.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.type}</strong><small>{document.issuer ?? "Issuer not specified"}</small></div><span className="status-pill">{document.status}</span></div>
        <WorkspaceRecordDetails label="Document & product references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{document.vendorId ?? "platform"}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{document.canonicalVariantId}</span><small>{document.identifier ?? "no identifier"}</small></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>Verification remains independent from media publication.</span><div className="workspace-action-buttons"><AdminActionButton label="Verify" endpoint="/api/admin/trust/compliance" csrfToken={data.csrfToken} body={{ documentId: document.id, decision: "verified" }} /><AdminActionButton label="Reject" endpoint="/api/admin/trust/compliance" csrfToken={data.csrfToken} body={{ documentId: document.id, decision: "rejected" }} reasonPrompt="Compliance rejection reason" danger /></div></div>
      </article>)}</div>}
      {complianceHistory.length > 0 && <details className="workspace-record-details trust-history"><summary>Compliance history · {complianceHistory.length}</summary><div className="trust-history-body"><div className="workspace-compact-list">{complianceHistory.map((document) => <div className="workspace-compact-row" key={document.id}><strong>{document.type}</strong><span>{document.status}</span><small>{document.issuer ?? "Issuer not specified"} · {document.canonicalVariantId}</small></div>)}</div></div></details>}
    </div></section>
  </main>;
}
