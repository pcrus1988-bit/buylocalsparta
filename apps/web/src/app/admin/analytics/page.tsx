import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMarketAnalyticsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminMarketAnalyticsWorkspace(principal); } catch { redirect("/admin"); }

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Market intelligence</div><h1>Analytics</h1><p className="lead">Privacy-minimised demand signals με zero-result demand και category performance σε scannable, action-oriented μορφή.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Searches", value: data.searches },
      { label: "Search success", value: `${Math.round(data.searchSuccessRate * 100)}%` },
      { label: "Orders", value: data.authorisedOrders },
      { label: "GMV", value: data.gmv, hint: `AOV ${data.averageOrderValue} · CTR ${Math.round(data.searchClickThroughRate * 100)}%` }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Unmet demand" title="Zero-result searches" note="Οι συχνότερες αποτυχημένες αναζητήσεις είναι άμεσο input για acquisition και catalog coverage." />
      {data.topZeroResultQueries.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν zero-result queries στο τρέχον window." /> : <div className="workspace-queue-list">{data.topZeroResultQueries.map((query) => <article className="workspace-queue-card" key={query.normalizedQuery}>
        <div className="workspace-queue-head"><div><strong>{query.query}</strong><small>{query.searches} total searches</small></div><span className="status-pill">{query.zeroResults} zero results</span></div>
        <WorkspaceRecordDetails label="Normalized demand key"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Normalized query</strong><span>{query.normalizedQuery}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Category demand" title="Search → view → cart" note="Compact funnel signals ανά category code χωρίς customer-level analytics." />
      {data.categoryDemand.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη category demand data." /> : <div className="workspace-queue-list">{data.categoryDemand.map((category) => <article className="workspace-queue-card" key={category.categoryCode}>
        <div className="workspace-queue-head"><div><strong>{category.categoryCode}</strong><small>Aggregate demand</small></div><span className="status-pill">{category.searches} searches</span></div>
        <div className="workspace-queue-primary"><span>{category.productViews} views</span><span>{category.cartAdds} cart adds</span></div>
      </article>)}</div>}
    </div></section>
  </main>;
}
