import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { AdminJsonForm } from "../../../components/AdminJsonForm";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminCategoryWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminCategoryWorkspace(principal); } catch { redirect("/admin"); }
  const standard = data.categories.filter((category) => category.commerceMode === "standard").length;
  const constrained = data.categories.length - standard;
  const adviceAllowed = data.categories.filter((category) => category.adviceAllowed !== false).length;

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={data.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Catalog · taxonomy governance</div><h1>Categories & Policies</h1><p className="lead">Κατηγορίες και commerce policies σε μία επιφάνεια. Ο ενεργός commerce mode είναι primary signal και το policy editor ανοίγει μόνο όταν χρειάζεται αλλαγή.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Categories", value: data.categories.length },
      { label: "Standard", value: standard },
      { label: "Constrained", value: constrained, tone: constrained ? "attention" : "default" },
      { label: "Advice allowed", value: adviceAllowed }
    ]} />

    <section className="shell vendor-section">
      <details className="workspace-tool-panel">
        <summary><span><strong>Category policy editor</strong><small>Create or update a commerce policy deliberately.</small></span></summary>
        <div className="workspace-tool-body"><AdminJsonForm endpoint="/api/admin/categories" csrfToken={data.csrfToken} label="Save policy" fields={[{ name: "categoryCode", label: "Category code" }, { name: "labelEl", label: "Greek label" }, { name: "commerceMode", label: "Commerce mode", type: "select", options: ["standard", "logistics_sensitive", "compatibility_sensitive", "regulated_mixed", "vehicles", "directory_only"] }]} /></div>
      </details>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Active policy" title="Category rules" note="Advice and counteroffer capabilities are shown as policy signals; full category codes stay in details." />
      {data.categories.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν category policies." /> : <div className="workspace-queue-list">{data.categories.map((category) => <article className="workspace-queue-card" key={category.categoryCode}>
        <div className="workspace-queue-head"><div><strong>{category.labelEl}</strong><small>{category.commerceMode}</small></div><span className="status-pill">{category.commerceMode}</span></div>
        <div className="workspace-queue-primary"><span>Advice {category.adviceAllowed !== false ? "on" : "off"}</span><span>Counteroffer {category.counterofferAllowed !== false ? "on" : "off"}</span></div>
        <WorkspaceRecordDetails label="Policy reference"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Category code</strong><span>{category.categoryCode}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </div></section>
  </main>;
}
