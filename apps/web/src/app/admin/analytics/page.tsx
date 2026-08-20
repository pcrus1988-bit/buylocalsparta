import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMarketAnalyticsWorkspace } from "../../../lib/admin-governance-runtime";
import { getAdminSession } from "../../../lib/admin-session";

export default async function Page() {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");
  let data;
  try { data = await adminMarketAnalyticsWorkspace(principal); } catch { redirect("/admin"); }
  const maxZero = Math.max(1, ...data.topZeroResultQueries.map((item) => item.zeroResults));
  const maxCategorySearches = Math.max(1, ...data.categoryDemand.map((item) => item.searches));

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Insights · market intelligence</div><h1>Analytics</h1><p className="lead">Demand, search quality και category funnel signals σε scan-first μορφή. Για auditable exports και saved analysis χρησιμοποίησε Reports.</p><div className="hero-actions"><Link className="text-link" href="/admin/reports">Open Reports →</Link></div></div></section>
    <WorkspaceMetricStrip items={[
      { label: "Searches", value: data.searches },
      { label: "Search success", value: `${Math.round(data.searchSuccessRate * 100)}%` },
      { label: "Orders", value: data.authorisedOrders },
      { label: "GMV", value: data.gmv, hint: `AOV ${data.averageOrderValue} · CTR ${Math.round(data.searchClickThroughRate * 100)}%` }
    ]} />

    <section className="shell vendor-section"><WorkspaceSectionHeading eyebrow="Unmet demand" title="Zero-result searches" note="Οι συχνότερες αποτυχημένες αναζητήσεις είναι άμεσο input για acquisition και catalogue coverage." />{data.topZeroResultQueries.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν zero-result queries στο τρέχον window." /> : <div className="admin-insight-table"><div className="admin-insight-head"><span>Query</span><span>Zero results</span><span>Total searches</span><span>Demand</span></div>{data.topZeroResultQueries.map((query) => <div className="admin-insight-row" key={query.normalizedQuery}><span><strong>{query.query}</strong><small>{query.normalizedQuery}</small></span><span><strong>{query.zeroResults}</strong></span><span>{query.searches}</span><progress max={maxZero} value={query.zeroResults} aria-label={`${query.zeroResults} zero-result searches`} /></div>)}</div>}</section>

    <section className="vendor-section section-tint"><div className="shell"><WorkspaceSectionHeading eyebrow="Category demand" title="Search → view → cart" note="Aggregate funnel signals ανά category code χωρίς customer-level analytics." />{data.categoryDemand.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη category demand data." /> : <div className="admin-insight-table admin-category-insights"><div className="admin-insight-head"><span>Category</span><span>Searches</span><span>Views</span><span>Cart adds</span><span>Demand</span></div>{data.categoryDemand.map((category) => <div className="admin-insight-row" key={category.categoryCode}><span><strong>{category.categoryCode}</strong></span><span>{category.searches}</span><span>{category.productViews}</span><span>{category.cartAdds}</span><progress max={maxCategorySearches} value={category.searches} aria-label={`${category.searches} category searches`} /></div>)}</div>}</div></section>
  </main>;
}
