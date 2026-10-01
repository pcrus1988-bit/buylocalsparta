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

export const metadata: Metadata = { title: "Στατιστικά dropshipping", robots: { index: false, follow: false } };

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
        <div className="eyebrow">Κέντρο dropshipping</div>
        <h1>Στατιστικά</h1>
        <p className="lead">Δες ποιοι προμηθευτές και ποια προϊόντα φέρνουν επισκέψεις, καλάθια και αγορές στο κατάστημά σου.</p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          <Link className="button button-secondary" href="/vendor/dropshipping">← Προϊόντα</Link>
          {[7, 30, 90].map((days) => <Link
            key={days}
            className={days === periodDays ? "button" : "button button-secondary"}
            href={`/vendor/dropshipping/analytics?days=${days}${selectedSupplier ? `&supplier=${encodeURIComponent(selectedSupplier.code)}` : ""}`}
          >{days} ημέρες</Link>)}
        </div>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Προμηθευτής" title="Επίλεξε προμηθευτή" note="Επίλεξε τον προμηθευτή που θέλεις να εξετάσεις. Οι αριθμοί αφορούν μόνο τα προϊόντα του δικού σου καταστήματος." />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {workspace.suppliers.map((supplier) => <Link
          key={supplier.id}
          className={supplier.id === selectedSupplier?.id ? "button" : "button button-secondary"}
          href={`/vendor/dropshipping/analytics?supplier=${encodeURIComponent(supplier.code)}&days=${periodDays}`}
        >{supplier.displayName}</Link>)}
        {!workspace.suppliers.length ? <span>Δεν υπάρχει συνδεδεμένος προμηθευτής dropshipping.</span> : null}
      </div>
    </section>

    {selectedSupplier && totals ? <>
      <WorkspaceMetricStrip items={[
        { label: `Έσοδα ${periodDays}ημ.`, value: euro(totals.revenueMinor), tone: totals.revenueMinor ? "positive" : "default" },
        { label: "Επισκέπτες", value: totals.uniqueViewers },
        { label: "Προβολές προϊόντων", value: totals.pageViews },
        { label: "Εμφανίσεις", value: totals.impressions },
        { label: "Προσθήκες στο καλάθι", value: totals.addToCarts },
        { label: "Έναρξη ολοκλήρωσης αγοράς", value: totals.checkoutStarts },
        { label: "Αγορές", value: totals.purchases, tone: totals.purchases ? "positive" : "default" },
        { label: "Μετατροπή", value: pct(totals.purchases, totals.pageViews) }
      ]} />

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow={selectedSupplier.displayName} title="Απόδοση προμηθευτή" note={`${periodDays} ημέρες · ${selectedSupplier.totalProducts} προϊόντα προμηθευτή · ${selectedSupplier.publishedProducts} δημοσιευμένα`} />
        <div className="workspace-compact-list">
          <div className="workspace-compact-row"><strong>Μονάδες που πουλήθηκαν</strong><span>{totals.unitsSold}</span></div>
          <div className="workspace-compact-row"><strong>Χρόνος αλληλεπίδρασης</strong><span>{duration(totals.engagedSeconds)}</span></div>
          <div className="workspace-compact-row"><strong>Προβολή → καλάθι</strong><span>{pct(totals.addToCarts, totals.pageViews)}</span></div>
          <div className="workspace-compact-row"><strong>Ολοκλήρωση αγοράς → αγορά</strong><span>{pct(totals.purchases, totals.checkoutStarts)}</span></div>
        </div>
      </section>

      <section className="shell vendor-section">
        <WorkspaceSectionHeading eyebrow="Κορυφαία προϊόντα" title="Προϊόντα με τη μεγαλύτερη απόδοση" note="Ταξινόμηση κατά έσοδα, αγορές και προβολές προϊόντων. Εμφανίζονται έως 20 προϊόντα." />
        <div className="vendor-card-grid">
          {analytics?.topProducts.map((product) => <article className="workspace-queue-card" key={product.canonicalVariantId}>
            <div className="workspace-queue-head"><div><strong>{product.productTitle}</strong><small>{product.categoryName}</small></div><span className="vendor-merchant-status">{euro(product.revenueMinor)}</span></div>
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Επισκέπτες</strong><span>{product.uniqueViewers}</span></div>
              <div className="workspace-compact-row"><strong>Προβολές προϊόντων</strong><span>{product.pageViews}</span></div>
              <div className="workspace-compact-row"><strong>Προσθήκες στο καλάθι</strong><span>{product.addToCarts}</span></div>
              <div className="workspace-compact-row"><strong>Αγορές</strong><span>{product.purchases}</span><small>{product.unitsSold} μονάδες</small></div>
              <div className="workspace-compact-row"><strong>Μετατροπή</strong><span>{pct(product.purchases, product.pageViews)}</span></div>
            </div>
          </article>)}
          {!analytics?.topProducts.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχουν ακόμη δεδομένα απόδοσης.</strong><p>Οι μετρήσεις θα εμφανιστούν όταν υπάρξουν προβολές ή προσθήκες στο καλάθι ή αγορές για προϊόντα του προμηθευτή.</p></article> : null}
        </div>
      </section>
    </> : null}
  </main>;
}
