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
    reportError = error instanceof Error ? error.message : "Vendor analytics are unavailable";
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
  const zeroResultSignals = data?.topZeroResultQueries.reduce((sum, query) => sum + query.zeroResults, 0) ?? 0;
  const demandClusters = (data?.topZeroResultQueries.length ?? 0) + (data?.categoryDemand.length ?? 0);

  return <main className="vendor-app admin-app admin-analytics-operations">
    <AdminWorkspaceHeader csrfToken={principal.csrfToken} />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div>
      <div className="eyebrow">Analytics · live marketplace performance</div>
      <h1>Marketplace Performance</h1>
      <p className="lead">Παρακολούθησε το aggregate funnel impression → view → cart → checkout → purchase, σύγκρινε vendors και κάνε product drill-down χωρίς customer-level δεδομένα.</p>
      <div className="hero-actions"><Link className="button button-secondary" href="/admin/demand">Demand Intelligence</Link><Link className="button button-secondary" href="/admin/reports">Saved & auditable reports</Link></div>
    </div></section>

    {report ? <WorkspaceMetricStrip items={[
      { label: "Active offers", value: report.summary.activeProducts, hint: `${report.summary.vendorCount} vendors in scope` },
      { label: "Impressions", value: report.summary.impressions, hint: `${report.summary.productViews} views · ${pct(report.summary.viewRate)} view rate` },
      { label: "Cart adds", value: report.summary.cartAdds, hint: `${report.summary.checkoutStarts} checkout starts · ${pct(report.summary.cartRate)} view→cart` },
      { label: "Attributed orders", value: report.summary.attributedOrders, hint: `${report.summary.revenue} · ${pct(report.summary.conversionRate)} view→order` }
    ]} /> : data ? <WorkspaceMetricStrip items={[
      { label: "Searches", value: data.searches },
      { label: "Search success", value: `${Math.round(data.searchSuccessRate * 100)}%` },
      { label: "Orders", value: data.authorisedOrders },
      { label: "GMV", value: data.gmv, hint: `AOV ${data.averageOrderValue} · CTR ${Math.round(data.searchClickThroughRate * 100)}%` }
    ]} /> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Analytics workflow" title="Use the right intelligence workspace" note="Live performance, unmet demand and durable reporting are separate jobs with different evidence boundaries." />
      <div className="analytics-workflow-grid">
        <Link className="analytics-workflow-card is-current" href="/admin/analytics"><span>Performance</span><strong>How the marketplace converts</strong><small>Live aggregate vendor/product funnel, category filters and CSV export of the current view.</small></Link>
        <Link className={`analytics-workflow-card${demandClusters ? " needs-attention" : ""}`} href="/admin/demand"><span>Demand</span><strong>What Sparta wants but cannot find</strong><small>{demandClusters ? `${demandClusters} current demand signal groups · ${zeroResultSignals} zero-result events in the market analytics window.` : "Privacy-thresholded Local Watch, Ask Local, search, Quick Add and saved-search signals."}</small></Link>
        <Link className="analytics-workflow-card" href="/admin/reports"><span>Reports</span><strong>What should be saved, repeated or delivered</strong><small>Declarative report definitions, generated PDFs, email delivery and retained audit history.</small></Link>
      </div>
    </section>

    <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Market pulse" title="Search & commerce health" note="These are aggregate health signals. Detailed acquisition gaps belong in Demand Intelligence." />
      {marketError ? <WorkspaceEmptyState title="Market pulse is temporarily unavailable." body={marketError} /> : data ? <div className="analytics-pulse-grid">
        <article className="analytics-pulse-card"><span>Discovery</span><strong>{data.searches} searches</strong><small>{Math.round(data.searchSuccessRate * 100)}% success · {Math.round(data.searchClickThroughRate * 100)}% search click-through.</small></article>
        <article className="analytics-pulse-card"><span>Commerce</span><strong>{data.authorisedOrders} authorised orders</strong><small>{data.gmv} GMV · {data.averageOrderValue} average order value.</small></article>
        <article className={`analytics-pulse-card${demandClusters ? " needs-attention" : ""}`}><span>Demand hand-off</span><strong>{demandClusters} signal groups</strong><small>{zeroResultSignals} zero-result events represented here. Open Demand Intelligence for ranked, privacy-qualified acquisition opportunities.</small><Link className="text-link" href="/admin/demand">Open Demand Intelligence →</Link></article>
      </div> : <WorkspaceEmptyState title="No market pulse is available yet." />}
    </div></section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Performance filters" title="Choose the live analysis scope" note="Date range έως 366 ημέρες. Parent category includes its descendants. This changes the current analysis only; use Reports for saved/repeatable definitions." />
      <form method="get" className="workspace-queue-card analytics-filter-card">
        <div className="analytics-filter-grid">
          <label><span className="eyebrow">From</span><input type="date" name="from" defaultValue={filters.from} /></label>
          <label><span className="eyebrow">To</span><input type="date" name="to" defaultValue={filters.to} /></label>
          <label><span className="eyebrow">Vendor</span><select name="vendor" defaultValue={filters.vendorId ?? ""}>
            <option value="">All vendors</option>
            {(report?.vendors ?? []).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
          </select></label>
          <label><span className="eyebrow">Category</span><select name="category" defaultValue={filters.categoryCode ?? ""}>
            <option value="">All categories</option>
            {(report?.categories ?? []).map((category) => <option key={category.code} value={category.code}>{`${"— ".repeat(category.depth)}${category.label}`}</option>)}
          </select></label>
        </div>
        <div className="workspace-action-bar">
          <span>{selectedVendor ? selectedVendor.name : "All vendors"} · {selectedCategory ? selectedCategory.label : "All categories"} · {filters.from} → {filters.to}</span>
          <div className="workspace-action-buttons">
            <button className="button" type="submit">Apply filters</button>
            {report ? <a className="button button-secondary" href={downloadHref(report)}>Export current CSV</a> : null}
            <Link className="text-link" href="/admin/analytics">Reset</Link>
          </div>
        </div>
      </form>
      {reportError ? <div className="workspace-queue-card analytics-error-card"><strong>Performance view could not be generated.</strong><p>{reportError}</p><Link className="text-link" href="/admin/reports">Open Reports →</Link></div> : null}
    </section>

    {report ? <section className="vendor-section section-tint"><div className="shell">
      <WorkspaceSectionHeading eyebrow="Performance view" title={selectedVendor ? selectedVendor.name : "Marketplace vendors"} note={`Aggregate performance · ${report.filters.from} έως ${report.filters.to} · refreshed ${new Date(report.generatedAt).toLocaleString("el-GR")}`} />
      {report.rows.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν vendors για τα επιλεγμένα φίλτρα." /> : <>
        <div className="admin-insight-table" role="table" aria-label="Vendor conversion overview">
          <div className="admin-insight-head" role="row"><span>Vendor</span><span>Orders</span><span>Revenue</span><span>Conversion</span></div>
          {report.rows.slice(0, 10).map((row) => <div className="admin-insight-row" role="row" key={`insight:${row.vendorId}`}>
            <span><strong>{row.vendorName}</strong><small>{row.productViews} product views</small></span>
            <span>{row.attributedOrders}</span><span>{row.revenue}</span>
            <progress max={1} value={row.conversionRate} aria-label={`${row.vendorName} conversion ${pct(row.conversionRate)}`} />
          </div>)}
        </div>
        <WorkspaceRecordDetails label={`Full vendor funnel · ${report.rows.length} vendors`}>
          <div className="analytics-table-shell"><table className="analytics-data-table">
            <thead><tr><th>Vendor</th><th>Products</th><th>Impressions</th><th>Views</th><th>Unique</th><th>Engaged</th><th>Cart</th><th>Checkout</th><th>Orders</th><th>Units</th><th>Revenue</th><th>Conversion</th></tr></thead>
            <tbody>{report.rows.map((row) => <tr key={row.vendorId}>
              <td><strong>{row.vendorName}</strong><small>{row.vendorId}</small></td>
              <td>{row.activeProducts}</td><td>{row.impressions}</td><td>{row.productViews}<small>{pct(row.viewRate)} from impressions</small></td><td>{row.uniqueViewers}</td><td>{row.engagedSeconds}s<small>{row.averageEngagedSeconds}s avg / viewer</small></td><td>{row.cartAdds}<small>{pct(row.cartRate)} view→cart</small></td><td>{row.checkoutStarts}</td><td>{row.attributedOrders}</td><td>{row.unitsSold}</td><td><strong>{row.revenue}</strong></td><td>{pct(row.conversionRate)}</td>
            </tr>)}</tbody>
          </table></div>
        </WorkspaceRecordDetails>
      </>}
    </div></section> : null}

    {report?.filters.vendorId ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Product drill-down" title={`${selectedVendor?.name ?? report.filters.vendorId} · products`} note="Same date/category scope. Engagement counts active, focused product-page time." />
      {report.products.length === 0 ? <WorkspaceEmptyState title="Δεν υπάρχουν ενεργά products για τα επιλεγμένα φίλτρα." /> : <>
        <div className="admin-insight-table" role="table" aria-label="Product conversion overview">
          <div className="admin-insight-head" role="row"><span>Product</span><span>Views</span><span>Orders</span><span>Conversion</span></div>
          {report.products.slice(0, 10).map((row) => <div className="admin-insight-row" role="row" key={`product-insight:${row.canonicalVariantId}`}>
            <span><strong>{row.productTitle}</strong><small>{row.categoryName}</small></span><span>{row.productViews}</span><span>{row.attributedOrders}</span><progress max={1} value={row.conversionRate} aria-label={`${row.productTitle} conversion ${pct(row.conversionRate)}`} />
          </div>)}
        </div>
        <WorkspaceRecordDetails label={`Full product funnel · ${report.products.length} products`}>
          <div className="analytics-table-shell"><table className="analytics-data-table">
            <thead><tr><th>Product</th><th>Category</th><th>Impressions</th><th>Views</th><th>Unique</th><th>Engagement</th><th>Cart</th><th>Checkout</th><th>Orders</th><th>Units</th><th>Revenue</th><th>Conversion</th></tr></thead>
            <tbody>{report.products.map((row) => <tr key={row.canonicalVariantId}>
              <td><strong>{row.productTitle}</strong><small>{row.canonicalVariantId}</small></td><td>{row.categoryName}<small>{row.categoryCode}</small></td><td>{row.impressions}</td><td>{row.productViews}</td><td>{row.uniqueViewers}</td><td>{row.engagedSeconds}s<small>{row.averageEngagedSeconds}s avg / viewer</small></td><td>{row.cartAdds}</td><td>{row.checkoutStarts}</td><td>{row.attributedOrders}</td><td>{row.unitsSold}</td><td><strong>{row.revenue}</strong></td><td>{pct(row.conversionRate)}</td>
            </tr>)}</tbody>
          </table></div>
        </WorkspaceRecordDetails>
      </>}
    </section> : null}

    <section className="shell vendor-section analytics-handoff-section">
      <WorkspaceSectionHeading eyebrow="Durable output" title="Need a board pack, recurring analysis or audit trail?" note="Analytics is intentionally live and exploratory. Reports owns saved definitions, comprehensive PDFs, delivery and retention history." />
      <div className="workspace-action-bar"><span>Keep ad-hoc exploration here; move repeatable or delivered analysis into the reporting engine.</span><div className="workspace-action-buttons"><Link className="button button-secondary" href="/admin/reports">Open Reports</Link><Link className="text-link" href="/admin/demand">Open Demand Intelligence</Link></div></div>
    </section>
  </main>;
}
