import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminRecallWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminRecallWorkspace(principal); } catch { redirect("/admin"); }
  const open = data.notices.filter((notice) => notice.status === "open").length;
  const resolved = data.notices.filter((notice) => notice.status !== "open").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Trust & Safety</div><h1>Product Safety</h1><p className="lead">Open safety notices και recalls παραμένουν visually urgent· creation και technical product references είναι deliberate secondary actions.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Safety notices", value: data.notices.length },
      { label: "Open", value: open, tone: open ? "attention" : "positive" },
      { label: "Resolved", value: resolved },
      { label: "Affected customers", value: data.affected.length, tone: data.affected.length ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <details className="workspace-tool-panel">
        <summary><span><strong>Open new safety notice</strong><small>Safety action · choose canonical product, severity and details.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/recalls" csrfToken={data.csrfToken} label="Open notice" fields={[{ name: "canonicalVariantId", label: "Canonical product", type: "select", options: data.products.map((product) => product.id) }, { name: "severity", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"] }, { name: "details", label: "Safety / recall details" }]} /></div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Safety notices" title="Product safety queue" note="Resolve + restore remains explicit; an open safety notice never disappears behind passive content." />
      {data.notices.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν product safety notices." /> : <div className="workspace-queue-list">{data.notices.map((notice) => <article className="workspace-queue-card" key={notice.id}>
        <div className="workspace-queue-head"><div><strong>{notice.type}</strong><small>{notice.details}</small></div><span className="status-pill">{notice.status}</span></div>
        <WorkspaceRecordDetails label="Product & notice references"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Canonical variant</strong><span>{notice.canonicalVariantId}</span></div><div className="workspace-compact-row"><strong>Notice ID</strong><span>{notice.id}</span></div></div></WorkspaceRecordDetails>
        {notice.status === "open" && <div className="workspace-action-bar"><span>Product remains governed by the active notice.</span><div className="workspace-action-buttons"><AdminActionButton label="Resolve + restore" endpoint="/api/admin/recalls/action" csrfToken={data.csrfToken} body={{ noticeId: notice.id, restoreProduct: true }} reasonPrompt="Resolution" /></div></div>}
      </article>)}</div>}
    </div></section>
  </main>;
}
