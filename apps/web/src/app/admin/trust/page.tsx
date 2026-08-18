import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminTrustWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Trust", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminTrustWorkspace(principal);
  const pendingScan = data.assets.filter((asset) => asset.scanStatus === "pending").length;
  const mediaReview = data.assets.filter((asset) => asset.scanStatus === "clean" && (asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved")).length;
  const compliancePending = data.documents.filter((document) => document.status === "pending").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Trust & safety</div><h1>Media & compliance</h1><p className="lead">Δούλεψε τις πραγματικές review queues με τη σωστή σειρά: scan → rights/moderation → compliance verification.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Media", value: data.assets.length },
      { label: "Scan pending", value: pendingScan, tone: pendingScan ? "attention" : "default" },
      { label: "Rights / moderation", value: mediaReview, tone: mediaReview ? "attention" : "default" },
      { label: "Compliance pending", value: compliancePending, tone: compliancePending ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Media review" title="Media queue" note={data.automatedMalwareScan ? "Automated malware scanning is enabled; pending scans do not need a manual clean action." : "Manual clean-scan recording is available before rights/moderation approval."} />
      {data.assets.length === 0 ? <WorkspaceEmptyState title="Δεν έχει υποβληθεί vendor media." /> : <div className="workspace-queue-list">{data.assets.map((asset) => <article className="workspace-queue-card" key={asset.id}>
        <div className="workspace-queue-head"><div><strong>{asset.originalFilename}</strong><small>{asset.contentType} · {(asset.byteSize / 1024).toFixed(1)} KB</small></div><span className="status-pill">{asset.moderationStatus}</span></div>
        <div className="workspace-queue-primary"><span>Scan {asset.scanStatus}</span><span>Rights {asset.rightsStatus}</span><span>Moderation {asset.moderationStatus}</span></div>
        <WorkspaceRecordDetails label="Vendor, product & asset references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Asset ID</strong><span>{asset.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{asset.vendorId ?? "platform"}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{asset.canonicalVariantId}</span></div></div></WorkspaceRecordDetails>
        <div className="workspace-action-bar"><span>{asset.scanStatus === "pending" ? "Scan must complete before publication approval." : "Apply only the next valid trust decision."}</span><div className="workspace-action-buttons">
          {asset.scanStatus === "pending" && data.automatedMalwareScan && <span className="status-pill">Automated scan queued</span>}
          {asset.scanStatus === "pending" && !data.automatedMalwareScan && <AdminActionButton label="Record clean scan" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "scan_clean" }} />}
          {asset.scanStatus === "clean" && (asset.rightsStatus !== "approved" || asset.moderationStatus !== "approved") && <AdminActionButton label="Approve rights & moderation" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "approve" }} />}
          <AdminActionButton label="Reject" endpoint="/api/admin/trust/media" csrfToken={data.csrfToken} body={{ assetId: asset.id, action: "reject" }} reasonPrompt="Rejection reason" danger />
        </div></div>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Compliance" title="Verification queue" note="Τα product/document identifiers είναι secondary detail· η pending decision είναι το primary task." />
      {data.documents.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν compliance documents για review." /> : <div className="workspace-queue-list">{data.documents.map((document) => <article className="workspace-queue-card" key={document.id}>
        <div className="workspace-queue-head"><div><strong>{document.type}</strong><small>{document.issuer ?? "Issuer not specified"}</small></div><span className="status-pill">{document.status}</span></div>
        <WorkspaceRecordDetails label="Document & product references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Document ID</strong><span>{document.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{document.vendorId ?? "platform"}</span></div><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{document.canonicalVariantId}</span><small>{document.identifier ?? "no identifier"}</small></div></div></WorkspaceRecordDetails>
        {document.status === "pending" && <div className="workspace-action-bar"><span>Verification remains independent from media publication.</span><div className="workspace-action-buttons"><AdminActionButton label="Verify" endpoint="/api/admin/trust/compliance" csrfToken={data.csrfToken} body={{ documentId: document.id, decision: "verified" }} /><AdminActionButton label="Reject" endpoint="/api/admin/trust/compliance" csrfToken={data.csrfToken} body={{ documentId: document.id, decision: "rejected" }} reasonPrompt="Compliance rejection reason" danger /></div></div>}
      </article>)}</div>}
    </div></section>
  </main>;
}
