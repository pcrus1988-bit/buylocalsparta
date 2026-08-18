import Link from "next/link";
import type { VendorCatalogCategoryControl, VendorManagedCatalogProduct } from "../lib/vendor-catalog-control-service";

type Metrics = Readonly<{ totalProducts:number; visibleProducts:number; hiddenProducts:number; lowStockProducts:number; outOfStockProducts:number; categoryCount:number; availableUnits:number }>;

export function VendorCatalogDashboardOverview({ metrics, products, categories }: { metrics: Metrics; products: readonly VendorManagedCatalogProduct[]; categories: readonly VendorCatalogCategoryControl[] }) {
  const stockAttention = products.filter((item) => item.availableToSell <= 0 || (item.availableToSell > 0 && item.availableToSell <= Math.max(2,item.safetyStock))).sort((a,b) => a.availableToSell-b.availableToSell).slice(0,5);
  const hiddenCategories = categories.filter((item) => !item.effectiveVisible);
  return <section className="shell vendor-section" id="catalog-control-overview">
    <div className="section-heading dashboard-section-heading"><div><div className="eyebrow">Catalogue control</div><h2>Κατάστημα & απόθεμα</h2></div><p className="section-note">Άμεση εικόνα για ορατότητα, κατηγορίες και stock.</p></div>
    <div className="vendor-kpis dashboard-kpis-refined" aria-label="Catalogue metrics">
      <div><span>Σύνολο προϊόντων</span><strong>{metrics.totalProducts}</strong></div>
      <div><span>Ορατά στο shop</span><strong>{metrics.visibleProducts}</strong></div>
      <div className={metrics.hiddenProducts ? "has-work" : undefined}><span>Κρυφά</span><strong>{metrics.hiddenProducts}</strong></div>
      <div className={(metrics.lowStockProducts + metrics.outOfStockProducts) ? "has-work" : undefined}><span>Stock attention</span><strong>{metrics.lowStockProducts + metrics.outOfStockProducts}</strong></div>
    </div>
    <div className="finance-panel dashboard-finance-panel" style={{ marginTop: 16 }}>
      <div><div className="eyebrow">Shop visibility</div><h2>{metrics.categoryCount} κατηγορίες</h2><p>{hiddenCategories.length ? `${hiddenCategories.length} κατηγορίες/κλάδοι είναι κρυφοί από το κατάστημά σου.` : "Όλες οι κατηγορίες του καταστήματος είναι ενεργές."}</p><Link className="button" href="/vendor/catalog">Διαχείριση προϊόντων</Link></div>
      <div className="fairness-note"><strong>{stockAttention.length ? "Χρειάζεται έλεγχος stock" : "Το stock είναι υπό έλεγχο"}</strong>{stockAttention.length ? <div className="workspace-compact-list" style={{ marginTop: 10 }}>{stockAttention.map((item) => <div className="workspace-compact-row" key={item.offerId}><strong>{item.title}</strong><span>{item.availableToSell} διαθέσιμα</span><small>{item.categoryName}</small></div>)}</div> : <p>{metrics.availableUnits} διαθέσιμες μονάδες συνολικά.</p>}</div>
    </div>
  </section>;
}
