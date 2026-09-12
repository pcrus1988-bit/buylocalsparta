import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DropshippingProductControls } from "../../../components/DropshippingProductControls";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import { isDropshippingOnlyVendor } from "../../../lib/vendor-dropshipping-access";
import { vendorDropshippingWorkspace } from "../../../lib/vendor-dropshipping-service";
import { vendorProductAnalytics } from "../../../lib/vendor-product-analytics";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const euro = (minor: number | null) => minor == null ? "—" : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "—";
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0,0%";

export default async function VendorDropshippingPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const queryParams = await searchParams;
  const supplierCode = first(queryParams.supplier).trim().slice(0, 80) || null;
  const query = first(queryParams.q).trim().slice(0, 120);
  const requestedPage = Number(first(queryParams.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [workspace, analytics] = await Promise.all([
    vendorDropshippingWorkspace(principal.vendorId ?? "", { supplierCode, query, page, pageSize: 50 }),
    vendorProductAnalytics(principal.vendorId ?? "", { periodDays: 30 })
  ]);

  const totalSupplierProducts = workspace.suppliers.reduce((sum, supplier) => sum + supplier.totalProducts, 0);
  const totalPublished = workspace.suppliers.reduce((sum, supplier) => sum + supplier.publishedProducts, 0);
  const totalAvailable = workspace.suppliers.reduce((sum, supplier) => sum + supplier.availableProducts, 0);
  const totalMissingCost = workspace.suppliers.reduce((sum, supplier) => sum + Math.max(0, supplier.totalProducts - supplier.productsWithCost), 0);
  const t = analytics.totals;
  const pages = Math.max(1, Math.ceil(workspace.totalProducts / workspace.pageSize));
  const selectedCode = workspace.selectedSupplier?.code ?? "";

  return <main className="vendor-app">
    <VendorWorkspaceHeader />
    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div><div className="eyebrow">Dropshipping Control Centre</div><h1>Dropshipping</h1><p className="lead">Προμηθευτές, κατάλογος, τιμές, ορατότητα και απόδοση σε ένα σημείο. Οι τιμές αγοράς και τα supplier δεδομένα παραμένουν ιδιωτικά.</p></div>
    </section>

    <WorkspaceMetricStrip items={[
      { label: "Προμηθευτές", value: workspace.suppliers.length },
      { label: "Προϊόντα", value: totalSupplierProducts },
      { label: "Δημοσιευμένα", value: totalPublished, tone: totalPublished ? "positive" : "default" },
      { label: "Διαθέσιμα supplier", value: totalAvailable },
      { label: "Πωλήσεις 30ημ.", value: euro(t.revenueMinor), tone: t.revenueMinor ? "positive" : "default" },
      { label: "Product views 30ημ.", value: t.pageViews },
      { label: "Conversion", value: pct(t.purchases, t.pageViews) },
      { label: "Χωρίς buying price", value: totalMissingCost, tone: totalMissingCost ? "attention" : "positive" }
    ]} />

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Προμηθευτές" title="Κατάσταση feeds & καταλόγου" note="Η διαθεσιμότητα supplier είναι ξεχωριστή από το τοπικό απόθεμα και επανελέγχεται από το supplier integration." />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        {workspace.suppliers.map((supplier) => <article className="workspace-queue-card" key={supplier.id}>
          <div className="workspace-queue-head"><div><strong>{supplier.displayName}</strong><small>{supplier.code} · {supplier.providerKind}</small></div><span className="vendor-merchant-status">{supplier.active ? "Ενεργός" : "Ανενεργός"}</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Προϊόντα</strong><span>{supplier.totalProducts}</span></div>
            <div className="workspace-compact-row"><strong>Δημοσιευμένα</strong><span>{supplier.publishedProducts}</span></div>
            <div className="workspace-compact-row"><strong>Διαθέσιμα</strong><span>{supplier.availableProducts}</span><small>{supplier.outOfStockProducts} μη διαθέσιμα</small></div>
            <div className="workspace-compact-row"><strong>Buying price</strong><span>{supplier.productsWithCost}/{supplier.totalProducts}</span></div>
            <div className="workspace-compact-row"><strong>Health</strong><span>{supplier.lastHealthcheckOk === true ? "OK" : supplier.lastHealthcheckOk === false ? "Πρόβλημα" : "Άγνωστο"}</span><small>{date(supplier.lastHealthcheckAt)}</small></div>
            <div className="workspace-compact-row"><strong>Τελευταίο sync</strong><span>{date(supplier.lastCatalogueSyncAt)}</span></div>
          </div>
          <Link className="button button-secondary" style={{ marginTop: 12 }} href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.code)}`}>Άνοιγμα supplier</Link>
        </article>)}
        {!workspace.suppliers.length ? <article className="workspace-queue-card"><strong>Δεν υπάρχει ενεργός Dropshipping supplier.</strong><p>Το vendor account είναι κλειδωμένο σε Dropshipping, αλλά δεν βρέθηκε supplier mapping στη βάση.</p></article> : null}
      </div>
    </section>

    {workspace.selectedSupplier ? <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow={workspace.selectedSupplier.displayName} title="Προϊόντα supplier" note={`${workspace.totalProducts} αποτελέσματα · σελίδα ${workspace.page}/${pages}`} />
      <form method="get" className="workspace-queue-card" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10, alignItems: "end", marginBottom: 14 }}>
        <input type="hidden" name="supplier" value={selectedCode} />
        <label><small>Αναζήτηση τίτλου, brand, SKU, EAN</small><input name="q" defaultValue={workspace.query} placeholder="π.χ. Michael Kors, SKU, EAN" style={{ width: "100%" }} /></label>
        <button className="button" type="submit">Αναζήτηση</button>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {workspace.products.map((product) => <article className="workspace-queue-card" key={product.supplierOfferId}>
          <div className="workspace-queue-head"><div><strong>{product.title}</strong><small>{[product.brand, product.externalSku, product.ean].filter(Boolean).join(" · ") || product.canonicalVariantId}</small></div><span className="vendor-merchant-status">{product.visible ? "Public" : "Hidden"}</span></div>
          <div className="workspace-compact-list" style={{ marginTop: 12 }}>
            <div className="workspace-compact-row"><strong>Buying price</strong><span>{euro(product.supplierCostMinor)}</span><small>ιδιωτικό</small></div>
            <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>{euro(product.customerPriceMinor)}</span></div>
            <div className="workspace-compact-row"><strong>Markup</strong><span>{product.markupType === "percent" && product.markupValue != null ? `${product.markupValue}%` : product.markupType === "fixed" && product.markupValue != null ? `${product.markupValue}` : "—"}</span></div>
            <div className="workspace-compact-row"><strong>Έκπτωση</strong><span>{product.discountType === "percent" && product.discountValue != null ? `${product.discountValue}%` : product.discountType === "fixed" && product.discountValue != null ? `${product.discountValue}` : "—"}</span></div>
            <div className="workspace-compact-row"><strong>Supplier stock</strong><span>{product.cachedAvailable ? (product.cachedQuantity ?? "Διαθέσιμο") : "Μη διαθέσιμο"}</span><small>{date(product.availabilityCheckedAt)}</small></div>
          </div>
          <DropshippingProductControls offerId={product.offerId} supplierCostMinor={product.supplierCostMinor} visible={product.visible} markupValue={product.markupType === "percent" ? product.markupValue : null} discountValue={product.discountType === "percent" ? product.discountValue : null} msrpMinor={product.msrpMinor} showMsrp={product.showMsrp} />
        </article>)}
        {!workspace.products.length ? <article className="workspace-queue-card"><strong>Δεν βρέθηκαν προϊόντα.</strong><p>Άλλαξε τον όρο αναζήτησης ή έλεγξε το supplier sync.</p></article> : null}
      </div>

      {pages > 1 ? <nav aria-label="Σελιδοποίηση προϊόντων" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
        {workspace.page > 1 ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(selectedCode)}&q=${encodeURIComponent(workspace.query)}&page=${workspace.page - 1}`}>← Προηγούμενα</Link> : <span />}
        {workspace.page < pages ? <Link className="button button-secondary" href={`/vendor/dropshipping?supplier=${encodeURIComponent(selectedCode)}&q=${encodeURIComponent(workspace.query)}&page=${workspace.page + 1}`}>Επόμενα →</Link> : null}
      </nav> : null}
    </section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ασφάλεια" title="Dropshipping-only vendor" note="Αυτό το account δεν χρησιμοποιεί χειροκίνητο τοπικό απόθεμα. Η πρόσβαση στο συμβατικό catalogue θα ανακατευθύνεται εδώ και οι supplier τιμές αγοράς δεν δημοσιεύονται." />
    </section>
  </main>;
}
