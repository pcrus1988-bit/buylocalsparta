import { buildVendorOperatingContextFromSession } from "@buy-local-sparta/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { VendorWorkspaceHeader } from "../../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../../lib/vendor-dropshipping-access";
import { vendorDropshippingSupplierAnalytics } from "../../../../lib/vendor-dropshipping-analytics";
import { vendorDropshippingWorkspace } from "../../../../lib/vendor-dropshipping-service";
import { getVendorSession } from "../../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping analytics", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const euro = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0,0%";
const duration = (seconds: number) => seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

export default async function DropshippingAnalyticsPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const params = await searchParams;
  const requestedSupplier = first(params.supplier).trim().slice(0, 80) || null;
  const requestedDays = Number(first(params.days));
  const periodDays = [7, 30, 90].includes(requestedDays) ? requestedDays : 30;
  const operatingContext = buildVendorOperatingContextFromSession(principal);

  const workspace = await vendorDropshippingWorkspace(principal.vendorId ?? "", {
    supplierCode: requestedSupplier,
    page: 1,
    pageSize: 20
  });
  const selectedSupplier = workspace.selectedSupplier;
  const analytics = selectedSupplier
    ? await vendorDropshippingSupplierAnalytics(operatingContext, principal.vendorId ?? "", selectedSupplier.code, periodDays)
    : null;
  const totals = analytics?.totals;

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Analytics</h1>
        <p className="lead">Απόδοση ανά Dropshipping supplier με τα υπάρχοντα KONTA MOY analytics. Δεν δημιουργείται δεύτερο tracking σύστημα.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Dropshipping</Link>
          {[7, 30, 90].map((days) => <Link
            key={days}
            className={days === periodDays ? "button" : "button button-secondary"}
            href={`/vendor/dropshipping/analytics?days=${days}${selectedSupplier ? `&supplier=${encodeURIComponent(selectedSupplier.code)}` : ""}`}
          >{days} ημέρες</Link>)}
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Supplier" title="Επίλεξε προμηθευτή" note="Οι μετρήσεις περιορίζονται στα canonical προϊόντα που συνδέονται με τον επιλεγμένο supplier και στο συνδεδεμένο vendor." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {workspace.suppliers.map((supplier) => <Link
          key={supplier.id}
          className={supplier.id === selectedSupplier?.id ? "button" : "button button-secondary"}
          href={`/vendor/dropshipping/analytics?supplier=${encodeURIComponent(supplier.code)}&days=${periodDays}`}
        >{supplier.displayName}</Link>)}
        {!workspace.suppliers.length ? <span>Δεν υπάρχει Dropshipping supplier mapping.</span> : null}
      </div>
    </section>

    {selectedSupplier && totals ? <>
      <WorkspaceMetricStrip items={[
        { label: `Έσοδα ${periodDays}ημ.`, value: euro(totals.revenueMinor), tone: totals.revenueMinor ? "positive" : "default" },
        { label: "Επισκέπτες", value: totals.uniqueViewers },
        { label: "Product views", value: totals.pageViews },
        { label: "Impressions", value: totals.impressions },
        { label: "Add to cart", value: totals.addToCarts },
        { label: "Checkout starts", value: totals.checkoutStarts },
        { label: "Αγορές", value: totals.purchases, tone: totals.purchases ? "positive" : "default" },
        { label: "Conversion", value: pct(totals.purchases, totals.pageViews) }
      ]} />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow={selectedSupplier.displayName} title="Supplier performance" note={`${periodDays} ημέρες · ${selectedSupplier.totalProducts} supplier products · ${selectedSupplier.publishedProducts} δημοσιευμένα`} />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Μονάδες που πουλήθηκαν</strong><span>{totals.unitsSold}</span></div>
          <div className="workspace-compact-row"><strong>Engagement</strong><span>{duration(totals.engagedSeconds)}</span></div>
          <div className="workspace-compact-row"><strong>View → cart</strong><span>{pct(totals.addToCarts, totals.pageViews)}</span></div>
          <div className="workspace-compact-row"><strong>Checkout → purchase</strong><span>{pct(totals.purchases, totals.checkoutStarts)}</span></div>
        </div>
      </section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Top products" title="Προϊόντα με τη μεγαλύτερη απόδοση" note="Ταξινόμηση κατά έσοδα, αγορές και product views. Εμφανίζονται έως 20 προϊόντα." />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 14 }}>
          {analytics?.topProducts.map((product) => <article className="workspace-queue-card" key={product.canonicalVariantId}>
            <div className="workspace-queue-head"><div><strong>{product.productTitle}</strong><small>{product.categoryName}</small></div><span className="vendor-merchant-status">{euro(product.revenueMinor)}</span></div>
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Επισκέπτες</strong><span>{product.uniqueViewers}</span></div>
              <div className="workspace-compact-row"><strong>Product views</strong><span>{product.pageViews}</span></div>
              <div className="workspace-compact-row"><strong>Add to cart</strong><span>{product.addToCarts}</span></div>
              <div className="workspace-compact-row"><strong>Αγορές</strong><span>{product.purchases}</span><small>{product.unitsSold} μονάδες</small></div>
              <div className="workspace-compact-row"><strong>Conversion</strong><span>{pct(product.purchases, product.pageViews)}</span></div>
            </div>
          </article>)}
          {!analytics?.topProducts.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη analytics events.</strong><p>Οι μετρήσεις θα εμφανιστούν όταν υπάρξουν views, cart actions ή αγορές για προϊόντα του supplier.</p></article> : null}
        </div>
      </section>
    </> : null}
  </main>;
}
