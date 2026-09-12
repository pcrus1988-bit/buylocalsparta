import { buildVendorOperatingContextFromSession } from "@buy-local-sparta/core";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DropshippingProductControls } from "../../../components/DropshippingProductControls";
import { DropshippingSupplierDefaultsControls } from "../../../components/DropshippingSupplierDefaultsControls";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceMetricStrip, WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import {
  calculateNovaBrandsGatewayRecommendation,
  isNovaBrandsGatewaySupplier
} from "../../../lib/nova-brandsgateway-pricing";
import { isDropshippingOnlyVendor } from "../../../lib/vendor-dropshipping-access";
import {
  vendorDropshippingFilteredWorkspace,
  type DropshippingProductFilters
} from "../../../lib/vendor-dropshipping-filter-service";
import { vendorProductAnalytics } from "../../../lib/vendor-product-analytics";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = { title: "Dropshipping", robots: { index: false, follow: false } };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const euro = (minor: number | null) => minor == null ? "—" : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
const date = (value: string | null) => value ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value)) : "—";
const pct = (n: number, d: number) => d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "0,0%";
const numberParam = (value: string | string[] | undefined) => {
  const raw = first(value).trim();
  return raw === "" ? null : raw;
};

function productUrl(supplier: string, query: string, filters: DropshippingProductFilters, page: number): string {
  const params = new URLSearchParams();
  params.set("supplier", supplier);
  if (query) params.set("q", query);
  if (filters.categoryId) params.set("category", filters.categoryId);
  if (filters.subcategoryId) params.set("subcategory", filters.subcategoryId);
  if (filters.brandId) params.set("brand", filters.brandId);
  if (filters.size) params.set("size", filters.size);
  if (filters.color) params.set("color", filters.color);
  if (filters.publication !== "all") params.set("publication", filters.publication);
  if (filters.availability !== "all") params.set("availability", filters.availability);
  if (filters.cost !== "all") params.set("cost", filters.cost);
  if (filters.markup !== "all") params.set("markup", filters.markup);
  if (filters.discount !== "all") params.set("discount", filters.discount);
  if (filters.markupMin != null) params.set("markupMin", String(filters.markupMin));
  if (filters.markupMax != null) params.set("markupMax", String(filters.markupMax));
  if (filters.discountMin != null) params.set("discountMin", String(filters.discountMin));
  if (filters.discountMax != null) params.set("discountMax", String(filters.discountMax));
  if (page > 1) params.set("page", String(page));
  return `/vendor/dropshipping?${params.toString()}`;
}

function activeFilterCount(filters: DropshippingProductFilters): number {
  return [
    Boolean(filters.categoryId),
    Boolean(filters.subcategoryId),
    Boolean(filters.brandId),
    Boolean(filters.size),
    Boolean(filters.color),
    filters.publication !== "all",
    filters.availability !== "all",
    filters.cost !== "all",
    filters.markup !== "all",
    filters.discount !== "all",
    filters.markupMin != null || filters.markupMax != null,
    filters.discountMin != null || filters.discountMax != null
  ].filter(Boolean).length;
}

export default async function VendorDropshippingPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");
  const operatingContext = buildVendorOperatingContextFromSession(principal);

  const queryParams = await searchParams;
  const supplierCode = first(queryParams.supplier).trim().slice(0, 80) || null;
  const query = first(queryParams.q).trim().slice(0, 120);
  const requestedPage = Number(first(queryParams.page));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const [workspace, analytics] = await Promise.all([
    vendorDropshippingFilteredWorkspace(principal.vendorId ?? "", {
      supplierCode,
      query,
      page,
      pageSize: 50,
      filters: {
        categoryId: first(queryParams.category),
        subcategoryId: first(queryParams.subcategory),
        brandId: first(queryParams.brand),
        size: first(queryParams.size),
        color: first(queryParams.color),
        publication: first(queryParams.publication),
        availability: first(queryParams.availability),
        cost: first(queryParams.cost),
        markup: first(queryParams.markup),
        discount: first(queryParams.discount),
        markupMin: numberParam(queryParams.markupMin),
        markupMax: numberParam(queryParams.markupMax),
        discountMin: numberParam(queryParams.discountMin),
        discountMax: numberParam(queryParams.discountMax)
      }
    }),
    vendorProductAnalytics(operatingContext, { periodDays: 30 })
  ]);

  const totalSupplierProducts = workspace.suppliers.reduce((sum, supplier) => sum + supplier.totalProducts, 0);
  const totalPublished = workspace.suppliers.reduce((sum, supplier) => sum + supplier.publishedProducts, 0);
  const totalAvailable = workspace.suppliers.reduce((sum, supplier) => sum + supplier.availableProducts, 0);
  const totalMissingCost = workspace.suppliers.reduce((sum, supplier) => sum + Math.max(0, supplier.totalProducts - supplier.productsWithCost), 0);
  const t = analytics.totals;
  const pages = Math.max(1, Math.ceil(workspace.totalProducts / workspace.pageSize));
  const selectedCode = workspace.selectedSupplier?.code ?? "";
  const novaBrandsGatewaySelected = isNovaBrandsGatewaySupplier(workspace.selectedSupplier);
  const filterCount = activeFilterCount(workspace.filters);
  const categoryLabels = new Map(workspace.filterOptions.categories.map((option) => [option.value, option.label]));
  const clearFiltersHref = productUrl(selectedCode, workspace.query, {
    ...workspace.filters,
    categoryId: "",
    subcategoryId: "",
    brandId: "",
    size: "",
    color: "",
    publication: "all",
    availability: "all",
    cost: "all",
    markup: "all",
    discount: "all",
    markupMin: null,
    markupMax: null,
    discountMin: null,
    discountMax: null
  }, 1);

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
      <DropshippingSupplierDefaultsControls supplierCode={selectedCode} defaults={workspace.selectedSupplier.defaults} />

      <form method="get" className="workspace-queue-card" style={{ marginBottom: 14 }}>
        <input type="hidden" name="supplier" value={selectedCode} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10, alignItems: "end" }}>
          <label><small>Αναζήτηση τίτλου, brand, SKU, EAN, κατηγορίας ή variant</small><input name="q" defaultValue={workspace.query} placeholder="π.χ. Michael Kors, SKU, EAN" style={{ width: "100%" }} /></label>
          <button className="button" type="submit">Αναζήτηση / φίλτρα</button>
        </div>

        <details open={filterCount > 0} style={{ marginTop: 14 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700 }}>
            Φίλτρα προϊόντων{filterCount ? ` · ${filterCount} ενεργά` : ""}
          </summary>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: 10, marginTop: 12 }}>
            <label><small>Κατηγορία</small><select name="category" defaultValue={workspace.filters.categoryId} style={{ width: "100%" }}>
              <option value="">Όλες</option>
              {workspace.filterOptions.categories.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select></label>

            <label><small>Υποκατηγορία</small><select name="subcategory" defaultValue={workspace.filters.subcategoryId} style={{ width: "100%" }}>
              <option value="">Όλες</option>
              {workspace.filterOptions.subcategories.map((option) => <option key={option.value} value={option.value}>
                {option.parentValue && categoryLabels.get(option.parentValue) ? `${categoryLabels.get(option.parentValue)} › ` : ""}{option.label} ({option.count})
              </option>)}
            </select></label>

            <label><small>Brand</small><select name="brand" defaultValue={workspace.filters.brandId} style={{ width: "100%" }}>
              <option value="">Όλα</option>
              {workspace.filterOptions.brands.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select></label>

            <label><small>Size</small><select name="size" defaultValue={workspace.filters.size} style={{ width: "100%" }}>
              <option value="">Όλα</option>
              {workspace.filterOptions.sizes.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select></label>

            <label><small>Χρώμα</small><select name="color" defaultValue={workspace.filters.color} style={{ width: "100%" }}>
              <option value="">Όλα</option>
              {workspace.filterOptions.colors.map((option) => <option key={option.value} value={option.value}>{option.label} ({option.count})</option>)}
            </select></label>

            <label><small>Δημοσίευση</small><select name="publication" defaultValue={workspace.filters.publication} style={{ width: "100%" }}>
              <option value="all">Όλα</option>
              <option value="published">Published</option>
              <option value="unpublished">Unpublished</option>
            </select></label>

            <label><small>Supplier stock</small><select name="availability" defaultValue={workspace.filters.availability} style={{ width: "100%" }}>
              <option value="all">Όλα</option>
              <option value="available">Διαθέσιμα</option>
              <option value="out_of_stock">Out of stock</option>
            </select></label>

            <label><small>Buying price</small><select name="cost" defaultValue={workspace.filters.cost} style={{ width: "100%" }}>
              <option value="all">Όλα</option>
              <option value="with_cost">Με buying price</option>
              <option value="missing_cost">Χωρίς buying price</option>
            </select></label>

            <label><small>Markup</small><select name="markup" defaultValue={workspace.filters.markup} style={{ width: "100%" }}>
              <option value="all">Όλα</option>
              <option value="with">Με markup</option>
              <option value="without">Χωρίς markup</option>
              <option value="percent">% markup</option>
              <option value="fixed">Fixed markup</option>
            </select></label>

            <label><small>Discount</small><select name="discount" defaultValue={workspace.filters.discount} style={{ width: "100%" }}>
              <option value="all">Όλα</option>
              <option value="with">Με discount</option>
              <option value="without">Χωρίς discount</option>
              <option value="percent">% discount</option>
              <option value="fixed">Fixed discount</option>
            </select></label>

            <label><small>Markup % από</small><input name="markupMin" type="number" min="0" max="1000" step="0.01" defaultValue={workspace.filters.markupMin ?? ""} style={{ width: "100%" }} /></label>
            <label><small>Markup % έως</small><input name="markupMax" type="number" min="0" max="1000" step="0.01" defaultValue={workspace.filters.markupMax ?? ""} style={{ width: "100%" }} /></label>
            <label><small>Discount % από</small><input name="discountMin" type="number" min="0" max="100" step="0.01" defaultValue={workspace.filters.discountMin ?? ""} style={{ width: "100%" }} /></label>
            <label><small>Discount % έως</small><input name="discountMax" type="number" min="0" max="100" step="0.01" defaultValue={workspace.filters.discountMax ?? ""} style={{ width: "100%" }} /></label>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
            <button className="button" type="submit">Εφαρμογή φίλτρων</button>
            {filterCount ? <Link className="button button-secondary" href={clearFiltersHref}>Καθαρισμός φίλτρων</Link> : null}
          </div>
        </details>
      </form>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
        {workspace.products.map((product) => {
          const recommendation = novaBrandsGatewaySelected
            ? calculateNovaBrandsGatewayRecommendation({
                supplierCostMinor: product.supplierCostMinor,
                msrpMinor: product.msrpMinor,
                category: product.category,
                subcategory: product.subcategory
              })
            : null;
          const useRecommendedPricingDefault = Boolean(
            recommendation?.recommendedSellingPriceMinor != null
            && recommendation.recommendedMarkupPercent != null
            && product.markupType == null
            && product.discountType == null
          );

          return <article className="workspace-queue-card" key={product.supplierOfferId}>
            <div className="workspace-queue-head"><div><strong>{product.title}</strong><small>{[product.brand, product.externalSku, product.ean].filter(Boolean).join(" · ") || product.canonicalVariantId}</small></div><span className="vendor-merchant-status">{product.published ? "Published" : "Unpublished"}</span></div>
            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              {(product.category || product.subcategory) ? <div className="workspace-compact-row"><strong>Κατηγορία</strong><span>{[product.category, product.subcategory].filter(Boolean).join(" › ")}</span></div> : null}
              {(product.size || product.color) ? <div className="workspace-compact-row"><strong>Variant</strong><span>{[product.size && `Size ${product.size}`, product.color].filter(Boolean).join(" · ")}</span></div> : null}
              <div className="workspace-compact-row"><strong>Buying price</strong><span>{euro(product.supplierCostMinor)}</span><small>ιδιωτικό</small></div>
              <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>{euro(product.customerPriceMinor)}</span><small>αποθηκευμένη</small></div>
              <div className="workspace-compact-row"><strong>Markup</strong><span>{product.markupType === "percent" && product.markupValue != null ? `${product.markupValue}%` : product.markupType === "fixed" && product.markupValue != null ? `${product.markupValue}` : "—"}</span></div>
              <div className="workspace-compact-row"><strong>Έκπτωση</strong><span>{product.discountType === "percent" && product.discountValue != null ? `${product.discountValue}%` : product.discountType === "fixed" && product.discountValue != null ? `${product.discountValue}` : "—"}</span></div>
              <div className="workspace-compact-row"><strong>Supplier stock</strong><span>{product.cachedAvailable ? (product.cachedQuantity ?? "Διαθέσιμο") : "Μη διαθέσιμο"}</span><small>{date(product.availabilityCheckedAt)}</small></div>
            </div>
            <DropshippingProductControls
              offerId={product.offerId}
              supplierCostMinor={product.supplierCostMinor}
              visible={product.visible}
              markupValue={product.markupType === "percent" ? product.markupValue : null}
              discountValue={product.discountType === "percent" ? product.discountValue : null}
              msrpMinor={product.msrpMinor}
              showMsrp={product.showMsrp}
              recommendation={recommendation}
              useRecommendedPricingDefault={useRecommendedPricingDefault}
            />
          </article>;
        })}
        {!workspace.products.length ? <article className="workspace-queue-card"><strong>Δεν βρέθηκαν προϊόντα.</strong><p>Άλλαξε τον όρο αναζήτησης ή τα φίλτρα προϊόντων.</p></article> : null}
      </div>

      {pages > 1 ? <nav aria-label="Σελιδοποίηση προϊόντων" style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 16 }}>
        {workspace.page > 1 ? <Link className="button button-secondary" href={productUrl(selectedCode, workspace.query, workspace.filters, workspace.page - 1)}>← Προηγούμενα</Link> : <span />}
        {workspace.page < pages ? <Link className="button button-secondary" href={productUrl(selectedCode, workspace.query, workspace.filters, workspace.page + 1)}>Επόμενα →</Link> : null}
      </nav> : null}
    </section> : null}

    <section className="shell vendor-section">
      <WorkspaceSectionHeading eyebrow="Ασφάλεια" title="Dropshipping-only vendor" note="Αυτό το account δεν χρησιμοποιεί χειροκίνητο τοπικό απόθεμα. Η πρόσβαση στο συμβατικό catalogue θα ανακατευθύνεται εδώ και οι supplier τιμές αγοράς δεν δημοσιεύονται." />
    </section>
  </main>;
}
