import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { AdminActionButton } from "../../../components/AdminActionButton";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminRecallWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page({ searchParams }: { searchParams: Promise<{ productQ?: string }> }) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  const params = await searchParams;
  const productQuery = params.productQ?.trim().slice(0, 120) || undefined;
  let data;
  try { data = await adminRecallWorkspace(principal, { productQuery, productLimit: 60 }); } catch { redirect("/admin"); }
  const open = data.notices.filter((notice) => notice.status === "open").length;
  const resolved = data.notices.filter((notice) => notice.status !== "open").length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Trust & Safety</div><h1>Product Safety</h1><p className="lead">Safety queue, affected customers και searchable canonical-product selection χωρίς να φορτώνεται ολόκληρος ο κατάλογος στο browser.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Safety notices", value: data.notices.length },
      { label: "Open", value: open, tone: open ? "attention" : "positive" },
      { label: "Resolved", value: resolved },
      { label: "Affected customers", value: data.affected.length, tone: data.affected.length ? "attention" : "default" }
    ]} />

    <section className="shell vendor-section">
      <details className="workspace-tool-panel" open={Boolean(productQuery)}>
        <summary><span><strong>Open new safety notice</strong><small>Search the canonical catalogue first; only the top 60 matching products are loaded.</small></span></summary>
        <div className="workspace-tool-body">
          <form method="get" className="admin-directory-filters">
            <label><span>Find canonical product</span><input name="productQ" defaultValue={params.productQ ?? ""} maxLength={120} placeholder="Title, model, slug or canonical ID…" /></label>
            <div><button className="button button-secondary" type="submit">Search products</button>{productQuery ? <Link className="text-link" href="/admin/recalls">Clear</Link> : null}</div>
          </form>
          <div className="workspace-inline-note">{data.productFilteredTotal.toLocaleString("el-GR")} matching products · showing up to {data.products.length}.</div>
          {data.products.length ? <AdminJsonForm endpoint="/api/admin/recalls" csrfToken={data.csrfToken} label="Open notice" fields={[
            { name: "canonicalVariantId", label: "Canonical product", type: "select", options: data.products.map((product) => ({ value: product.id, label: `${product.title} · ${product.id}` })) },
            { name: "severity", label: "Severity", type: "select", options: ["low", "medium", "high", "critical"] },
            { name: "details", label: "Safety / recall details" }
          ]} /> : <WorkspaceEmptyState title="Δεν βρέθηκε canonical product." body="Δοκίμασε τίτλο, μοντέλο, slug ή canonical ID." />}
        </div>
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
