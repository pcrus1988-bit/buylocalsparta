import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminWorkspaceHeader } from "../../../components/AdminWorkspaceHeader";
import { WorkspaceEmptyState, WorkspaceMetricStrip, WorkspaceRecordDetails, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { adminMarketAnalyticsWorkspace } from "../../../lib/admin-governance-runtime";
import {
  adminVendorAnalyticsReport,
  normalizeAdminAnalyticsFilters,
  type AdminVendorAnalyticsReport
} from "../../../lib/admin-analytics-reporting";
import { getAdminSession } from "../../../lib/admin-session";

type PageProps = Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(value > 0 && value < 0.1 ? 1 : 0)}%`;
}

function downloadHref(report: AdminVendorAnalyticsReport): string {
  const params = new URLSearchParams({ from: report.filters.from, to: report.filters.to });
  if (report.filters.vendorId) params.set("vendor", report.filters.vendorId);
  if (report.filters.categoryCode) params.set("category", report.filters.categoryCode);
  return `/api/admin/analytics/report?${params.toString()}`;
}

const thStyle = { textAlign: "left", padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border, #ddd)" } as const;
const tdStyle = { padding: "10px 12px", whiteSpace: "nowrap", borderBottom: "1px solid var(--border, #eee)" } as const;

export default async function Page({ searchParams }: PageProps) {
  const principal = await getAdminSession();
  if (!principal) redirect("/admin/login");

  const raw = await searchParams;
  let report: AdminVendorAnalyticsReport | undefined;
  let reportError: string | undefined;
  let filters;
  try {
    filters = normalizeAdminAnalyticsFilters({
      from: first(raw.from),
      to: first(raw.to),
      vendorId: first(raw.vendor),
      categoryCode: first(raw.category)
    });
  } catch (error) {
    reportError = error instanceof Error ? error.message : "Invalid analytics filters";
    filters = normalizeAdminAnalyticsFilters({});
  }

  try {
    report = await adminVendorAnalyticsReport(principal, filters);
  } catch (error) {
    reportError = error instanceof Error ? error.message : "Vendor analytics report is unavailable";
  }

  let data: Awaited<ReturnType<typeof adminMarketAnalyticsWorkspace>> | undefined;
  let marketError: string | undefined;
  try {
    data = await adminMarketAnalyticsWorkspace(principal);
  } catch (error) {
    marketError = error instanceof Error ? error.message : "Market analytics are unavailable";
  }

  const selectedVendor = report?.vendors.find((vendor) => vendor.id === report.filters.vendorId);
  const selectedCategory = report?.categories.find((category) => category.code === report.filters.categoryCode);

  return <main className="vendor-app admin-app">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Market intelligence · vendor reporting</div>
      <h1>Analytics & Reports</h1>
      <p className="lead">Δημιούργησε, προέβαλε και κατέβασε reports ανά vendor, ημερομηνία και κατηγορία. Τα δεδομένα είναι aggregate και δεν εκθέτουν customer-level πληροφορίες.</p>
    </div></section>

    {report ? <WorkspaceMetricStrip items={[
      { label: "Vendors", value: report.summary.vendorCount, hint: `${report.summary.activeProducts} active offers` },
      { label: "Impressions", value: report.summary.impressions, hint: `${report.summary.productViews} views · ${pct(report.summary.viewRate)} view rate` },
      { label: "Cart adds", value: report.summary.cartAdds, hint: `${pct(report.summary.cartRate)} of product views` },
      { label: "Attributed orders", value: report.summary.attributedOrders, hint: `${report.summary.revenue} · ${pct(report.summary.conversionRate)} conversion` }
    ]} /> : data ? <WorkspaceMetricStrip items={[
      { label: "Searches", value: data.searches },
      { label: "Search success", value: `${Math.round(data.searchSuccessRate * 100)}%` },
      { label: "Orders", value: data.authorisedOrders },
      { label: "GMV", value: data.gmv, hint: `AOV ${data.averageOrderValue} · CTR ${Math.round(data.searchClickThroughRate * 100)}%` }
    ]} /> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Report builder" title="Vendor performance report" note="Date range: έως 366 ημέρες. Η επιλογή parent category συμπεριλαμβάνει αυτόματα τις υποκατηγορίες της." />
      <form method="get" className="workspace-queue-card" style={{ display: "grid", gap: 14 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <label><span className="eyebrow">From</span><input type="date" name="from" defaultValue={filters.from} style={{ width: "100%" }} /></label>
          <label><span className="eyebrow">To</span><input type="date" name="to" defaultValue={filters.to} style={{ width: "100%" }} /></label>
          <label><span className="eyebrow">Vendor</span><select name="vendor" defaultValue={filters.vendorId ?? ""} style={{ width: "100%" }}>
            <option value="">All vendors</option>
            {(report?.vendors ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select></label>
          <label><span className="eyebrow">Category</span><select name="category" defaultValue={filters.categoryCode ?? ""} style={{ width: "100%" }}>
            <option value="">All categories</option>
            {(report?.categories ?? []).map((category) => <option key={category.code} value={category.code}>{`${"— ".repeat(category.depth)}${category.label}`}</option>)}
          </select></label>
        </div>
        <div className="workspace-action-bar">
          <span>{selectedVendor ? selectedVendor.name : "All vendors"} · {selectedCategory ? selectedCategory.label : "All categories"} · {filters.from} → {filters.to}</span>
          <div className="workspace-action-buttons">
            <button className="button" type="submit">Create / view report</button>
            {report ? <a className="button button-secondary" href={downloadHref(report)}>Download CSV</a> : null}
            <Link className="text-link" href="/admin/analytics">Reset</Link>
          </div>
        </div>
      </form>
      {reportError ? <div className="workspace-queue-card" style={{ marginTop: 14 }}><strong>Report could not be generated.</strong><p>{reportError}</p></div> : null}
    </section>

    {report ? <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Generated report" title={selectedVendor ? selectedVendor.name : "All vendors"} note={`Generated ${new Date(report.generatedAt).toLocaleString("el-GR")} · ${report.filters.from} έως ${report.filters.to}`} />
      {report.rows.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν vendors για τα επιλεγμένα φίλτρα." /> : <div className="workspace-queue-card" style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", minWidth: 1260, borderCollapse: "collapse" }}>
          <thead><tr>
            <th style={thStyle}>Vendor</th><th style={thStyle}>Products</th><th style={thStyle}>Impressions</th><th style={thStyle}>Views</th><th style={thStyle}>Unique</th><th style={thStyle}>Engaged</th><th style={thStyle}>Cart</th><th style={thStyle}>Checkout</th><th style={thStyle}>Orders</th><th style={thStyle}>Units</th><th style={thStyle}>Revenue</th><th style={thStyle}>Conversion</th>
          </tr></thead>
          <tbody>{report.rows.map((row) => <tr key={row.vendorId}>
            <td style={tdStyle}><strong>{row.vendorName}</strong><br /><small>{row.vendorId}</small></td>
            <td style={tdStyle}>{row.activeProducts}</td><td style={tdStyle}>{row.impressions}</td><td style={tdStyle}>{row.productViews}<br /><small>{pct(row.viewRate)} from impressions</small></td><td style={tdStyle}>{row.uniqueViewers}</td><td style={tdStyle}>{row.engagedSeconds}s<br /><small>{row.averageEngagedSeconds}s avg / viewer</small></td><td style={tdStyle}>{row.cartAdds}<br /><small>{pct(row.cartRate)} view→cart</small></td><td style={tdStyle}>{row.checkoutStarts}</td><td style={tdStyle}>{row.attributedOrders}</td><td style={tdStyle}>{row.unitsSold}</td><td style={tdStyle}><strong>{row.revenue}</strong></td><td style={tdStyle}>{pct(row.conversionRate)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </div></section> : null}

    {report?.filters.vendorId ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Product funnel" title={`${selectedVendor?.name ?? report.filters.vendorId} · products`} note="Per-product breakdown for the same date/category filters. Engagement counts active, focused product-page time." />
      {report.products.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργά products για τα επιλεγμένα φίλτρα." /> : <div className="workspace-queue-card" style={{ overflowX: "auto", padding: 0 }}>
        <table style={{ width: "100%", minWidth: 1200, borderCollapse: "collapse" }}>
          <thead><tr><th style={thStyle}>Product</th><th style={thStyle}>Category</th><th style={thStyle}>Impressions</th><th style={thStyle}>Views</th><th style={thStyle}>Unique</th><th style={thStyle}>Engagement</th><th style={thStyle}>Cart</th><th style={thStyle}>Checkout</th><th style={thStyle}>Orders</th><th style={thStyle}>Units</th><th style={thStyle}>Revenue</th><th style={thStyle}>Conversion</th></tr></thead>
          <tbody>{report.products.map((row) => <tr key={row.canonicalVariantId}>
            <td style={tdStyle}><strong>{row.productTitle}</strong><br /><small>{row.canonicalVariantId}</small></td><td style={tdStyle}>{row.categoryName}<br /><small>{row.categoryCode}</small></td><td style={tdStyle}>{row.impressions}</td><td style={tdStyle}>{row.productViews}</td><td style={tdStyle}>{row.uniqueViewers}</td><td style={tdStyle}>{row.engagedSeconds}s<br /><small>{row.averageEngagedSeconds}s avg / viewer</small></td><td style={tdStyle}>{row.cartAdds}</td><td style={tdStyle}>{row.checkoutStarts}</td><td style={tdStyle}>{row.attributedOrders}</td><td style={tdStyle}>{row.unitsSold}</td><td style={tdStyle}><strong>{row.revenue}</strong></td><td style={tdStyle}>{pct(row.conversionRate)}</td>
          </tr>)}</tbody>
        </table>
      </div>}
    </section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Unmet demand" title="Zero-result searches" note="Οι συχνότερες αποτυχημένες αναζητήσεις είναι άμεσο input για acquisition και catalog coverage." />
      {marketError ? <WorkspaceEmptyState title="Market search analytics are temporarily unavailable." body={marketError} /> : !data || data.topZeroResultQueries.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν zero-result queries στο τρέχον window." /> : <div className="workspace-queue-list">{data.topZeroResultQueries.map((query) => <article className="workspace-queue-card" key={query.normalizedQuery}>
        <div className="workspace-queue-head"><div><strong>{query.query}</strong><small>{query.searches} total searches</small></div><span className="status-pill">{query.zeroResults} zero results</span></div>
        <WorkspaceRecordDetails label="Normalized demand key"><div className="workspace-compact-list"><div className="workspace-compact-row"><strong>Normalized query</strong><span>{query.normalizedQuery}</span></div></div></WorkspaceRecordDetails>
      </article>)}</div>}
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Category demand" title="Search → view → cart" note="Compact funnel signals ανά category code χωρίς customer-level analytics." />
      {!data || data.categoryDemand.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχει ακόμη category demand data." /> : <div className="workspace-queue-list">{data.categoryDemand.map((category) => <article className="workspace-queue-card" key={category.categoryCode}>
        <div className="workspace-queue-head"><div><strong>{category.categoryCode}</strong><small>Aggregate demand</small></div><span className="status-pill">{category.searches} searches</span></div>
        <div className="workspace-queue-primary"><span>{category.productViews} views</span><span>{category.cartAdds} cart adds</span></div>
      </article>)}</div>}
    </div></section>
  </main>;
}
