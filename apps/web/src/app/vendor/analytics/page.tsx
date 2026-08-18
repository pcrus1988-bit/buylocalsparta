import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { getVendorSession } from "../../../lib/vendor-session";
import { vendorAnalyticsWorkspace } from "../../../lib/vendor-backoffice-service";

export const metadata: Metadata = { title: "Vendor Analytics", robots: { index: false, follow: false } };

export default async function VendorAnalyticsPage() {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  const report = await vendorAnalyticsWorkspace(principal);

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
