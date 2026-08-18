import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminFairnessWorkspace } from "../../../lib/admin-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export const metadata: Metadata = { title: "Admin · Fairness", robots: { index: false, follow: false } };

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const data = await adminFairnessWorkspace(principal);
  const open = data.appeals.filter((appeal) => appeal.status === "open").length;
  const underReview = data.appeals.filter((appeal) => appeal.status === "under_review").length;
  const resolved = data.appeals.filter((appeal) => appeal.status === "resolved").length;
  const supplierRows = data.snapshots.reduce((sum, snapshot) => sum + snapshot.snapshot.length, 0);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Fair Vendor Exposure</div><h1>Fairness</h1><p className="lead">Δες appeals ως governance queue και άνοιξε exposure evidence μόνο όταν χρειάζεται investigation.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Variant snapshots", value: data.snapshots.length },
      { label: "Supplier evidence rows", value: supplierRows },
      { label: "Open appeals", value: open, tone: open ? "attention" : "default" },
      { label: "Under review", value: underReview, tone: underReview ? "attention" : resolved ? "positive" : "default", hint: `${resolved} resolved` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Appeals" title="Governance queue" note="Appeal outcomes και paid promotion δεν αλλάζουν σιωπηρά τα assignment weights." />
      {data.appeals.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν fairness appeals." /> : <div className="workspace-queue-list">{data.appeals.map((appeal) => <article className="workspace-queue-card" key={appeal.id}>
        <div className="workspace-queue-head"><div><strong>{appeal.reason}</strong><small>{appeal.canonicalVariantId ?? "Market-level appeal"}</small></div><span className="status-pill">{appeal.status}</span></div>
        {appeal.resolution && <p className="workspace-queue-summary">{appeal.resolution}</p>}
        <WorkspaceRecordDetails label="Vendor & appeal references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Appeal ID</strong><span>{appeal.id}</span></div><div className="workspace-compact-row"><strong>Vendor</strong><span>{appeal.vendorId}</span></div>{appeal.canonicalVariantId && <div className="workspace-compact-row"><strong>Canonical variant</strong><span>{appeal.canonicalVariantId}</span></div>}</div></WorkspaceRecordDetails>
        {["open", "under_review"].includes(appeal.status) && <div className="workspace-action-bar"><span>{appeal.resolution ?? "Awaiting platform review"}</span><div className="workspace-action-buttons">{appeal.status === "open" && <AdminActionButton label="Start review" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "under_review" }} />}<AdminActionButton label="Resolve" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "resolved" }} reasonPrompt="Resolution" /><AdminActionButton label="Reject" endpoint="/api/admin/fairness/appeal" csrfToken={data.csrfToken} body={{ appealId: appeal.id, status: "rejected" }} reasonPrompt="Rejection resolution" danger /></div></div>}
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Exposure evidence" title="Assignment snapshots" note="Deficit values and per-vendor exposure counts are deliberately collapsed until an investigation needs them." />
      {data.snapshots.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν fairness snapshots." /> : <div className="workspace-queue-list">{data.snapshots.map((variant) => <article className="workspace-queue-card" key={variant.id}>
        <div className="workspace-queue-head"><div><strong>{variant.title}</strong><small>{variant.snapshot.length} eligible suppliers</small></div><span className="status-pill">evidence</span></div>
        <WorkspaceRecordDetails label="Supplier deficit & exposure evidence"><div className="workspace-compact-list">{variant.snapshot.map((row) => <div className="workspace-compact-row" key={row.vendorId}><strong>{row.vendorId}</strong><span>Deficit {row.deficit.toFixed(3)}</span><small>{row.qualifiedExposures} qualified exposures</small></div>)}</div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>
  </main>;
}
