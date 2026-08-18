import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorAnalyticsWorkspace } from "../../../lib/vendor-backoffice-service";
import { vendorProductFunnel30d } from "../../../lib/vendor-product-analytics";

export const metadata: Metadata = { title: "Vendor Analytics", robots: { index: false, follow: false } };

function percent(numerator: number, denominator: number): string {
  return denominator > 0 ? `${((numerator / denominator) * 100).toFixed(1)}%` : "—";
}

function duration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function euro(minor: number): string {
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}

export default async function VendorAnalyticsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const [report, productFunnel] = await Promise.all([
    vendorAnalyticsWorkspace(principal),
    vendorProductFunnel30d(principal.vendorId!)
  ]);
  const measured = productFunnel.reduce((sum, row) => ({
    impressions: sum.impressions + row.impressions,
    pageViews: sum.pageViews + row.pageViews,
    uniqueViewers: sum.uniqueViewers + row.uniqueViewers,
    engagedSeconds: sum.engagedSeconds + row.engagedSeconds,
    addToCarts: sum.addToCarts + row.addToCarts,
    checkoutStarts: sum.checkoutStarts + row.checkoutStarts,
    purchases: sum.purchases + row.purchases,
    unitsSold: sum.unitsSold + row.unitsSold,
    revenueMinor: sum.revenueMinor + row.revenueMinor
  }), { impressions: 0, pageViews: 0, uniqueViewers: 0, engagedSeconds: 0, addToCarts: 0, checkoutStarts: 0, purchases: 0, unitsSold: 0, revenueMinor: 0 });

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined"><div><div className="eyebrow">Performance · 30 days</div><h1>Analytics</h1><p className="lead">Μόνο supplier-scoped aggregates για το δικό σου κατάστημα. Δεν εμφανίζονται competitor ή customer-level δεδομένα.</p></div></section>

    <WorkspaceMetricStrip items={[
      { label: "Product views", value: report.productViews },
      { label: "Attributed orders", value: report.attributedOrders },
      { label: "Attributed units", value: report.attributedUnits },
      { label: "Retail sales", value: report.attributedRetailSales }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Measured product funnel" title="Fairness → attention → cart → sale" note="First-party, privacy-preserving events tied to the exact Fairness assignment. Engagement counts only while the product page is visible, focused and active." />
      <WorkspaceMetricStrip items={[
        { label: "Fair impressions", value: measured.impressions },
        { label: "Page views", value: measured.pageViews },
        { label: "Avg. engaged", value: measured.pageViews ? duration(Math.round(measured.engagedSeconds / measured.pageViews)) : "—" },
        { label: "Cart adds", value: measured.addToCarts },
        { label: "Purchases", value: measured.purchases },
        { label: "Revenue", value: euro(measured.revenueMinor) }
      ]} />

      <article className="workspace-queue-card" style={{ marginTop: 18, overflowX: "auto" }}>
        <div className="workspace-queue-head"><div><strong>Απόδοση ανά προϊόν</strong><small>Τελευταίες 30 ημέρες · έως 100 προϊόντα</small></div></div>
        {productFunnel.length ? <table style={{ width: "100%", minWidth: 1080, marginTop: 14, borderCollapse: "collapse" }}>
          <thead><tr>
            <th align="left">Προϊόν</th><th>Impressions</th><th>Views</th><th>Unique</th><th>Avg. time</th><th>Cart</th><th>Checkout</th><th>Sales</th><th>Units</th><th>Revenue</th><th>View→Sale</th>
          </tr></thead>
          <tbody>{productFunnel.map((row) => <tr key={row.canonicalVariantId}>
            <td><strong><a href={`/product/${encodeURIComponent(row.canonicalVariantId)}`}>{row.productTitle}</a></strong></td>
            <td align="center">{row.impressions}</td>
            <td align="center">{row.pageViews}<small style={{ display: "block" }}>{percent(row.pageViews, row.impressions)} of impressions</small></td>
            <td align="center">{row.uniqueViewers}</td>
            <td align="center">{row.pageViews ? duration(Math.round(row.engagedSeconds / row.pageViews)) : "—"}</td>
            <td align="center">{row.addToCarts}<small style={{ display: "block" }}>{percent(row.addToCarts, row.pageViews)} of views</small></td>
            <td align="center">{row.checkoutStarts}</td>
            <td align="center"><strong>{row.purchases}</strong></td>
            <td align="center">{row.unitsSold}</td>
            <td align="right">{euro(row.revenueMinor)}</td>
            <td align="center"><strong>{percent(row.purchases, row.pageViews)}</strong></td>
          </tr>)}</tbody>
        </table> : <p style={{ marginTop: 14 }}>Δεν υπάρχουν ακόμη μετρήσιμα προϊόντα στο παράθυρο των 30 ημερών.</p>}
      </article>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Performance funnels" title="Από ενδιαφέρον σε αγορά" note="Τα analytics είναι read-only και δεν αλλάζουν Fair Vendor Exposure." />
      <div className="workspace-dual-grid">
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Commerce funnel</strong><small>Marketplace discovery → cart → attributed sale</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Qualified impressions</strong><span>{report.qualifiedImpressions}</span></div>
            <div className="workspace-compact-row"><strong>Product views</strong><span>{report.productViews}</span></div>
            <div className="workspace-compact-row"><strong>Cart adds</strong><span>{report.cartAdds}</span></div>
            <div className="workspace-compact-row"><strong>Attributed orders</strong><span>{report.attributedOrders}</span><small>{report.attributedUnits} units</small></div>
          </div>
        </article>
        <article className="workspace-queue-card">
          <div className="workspace-queue-head"><div><strong>Advice & Ask Local</strong><small>Human support interactions and private offers</small></div></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Advice starts</strong><span>{report.adviceStarts}</span></div>
            <div className="workspace-compact-row"><strong>Appointments</strong><span>{report.appointmentsBooked}</span></div>
            <div className="workspace-compact-row"><strong>Ask Local requests</strong><span>{report.counterofferRequests}</span></div>
            <div className="workspace-compact-row"><strong>Private offers</strong><span>{report.counterofferOffers}</span><small>{report.counterofferAccepted} accepted</small></div>
          </div>
        </article>
      </div>
    </section>
  </main>;
}
