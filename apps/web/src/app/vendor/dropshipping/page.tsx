import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DropshippingProductControls } from "../../../components/DropshippingProductControls";
import { DropshippingSupplierDefaultsControls } from "../../../components/DropshippingSupplierDefaultsControls";
import { VendorWorkspaceHeader } from "../../../components/VendorWorkspaceHeader";
import { WorkspaceSectionHeading } from "../../../components/WorkspacePagePrimitives";
import {
  listDropshippingSearchSuppliers,
  searchDropshippingProducts
} from "../../../lib/vendor-dropshipping-search-service";
import { isDropshippingOnlyVendor } from "../../../lib/vendor-dropshipping-access";
import { getVendorSession } from "../../../lib/vendor-session";

export const metadata: Metadata = {
  title: "Dropshipping",
  robots: { index: false, follow: false }
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] ?? "" : value ?? "";
const euro = (minor: number | null) => minor == null
  ? "—"
  : new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("el-GR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Athens" }).format(new Date(value))
  : "—";

export default async function VendorDropshippingPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const params = await searchParams;
  const supplierCode = first(params.supplier).trim().slice(0, 80);
  const query = first(params.q).trim().slice(0, 120);
  const vendorId = principal.vendorId ?? "";

  // Deliberately lightweight: this query reads supplier configuration only and
  // never joins or aggregates catalogue rows.
  const suppliers = await listDropshippingSearchSuppliers(vendorId);
  const selectedSupplier = supplierCode
    ? suppliers.find((supplier) => supplier.code === supplierCode) ?? null
    : null;

  // Catalogue access is search-only. No supplier products are queried for an
  // empty/short search, even when a supplier is selected.
  const searchActive = Boolean(selectedSupplier && query.length >= 3);
  const products = searchActive && selectedSupplier
    ? await searchDropshippingProducts(vendorId, selectedSupplier.code, query, 40)
    : [];

  return <main className="vendor-app">
    <VendorWorkspaceHeader />

    <section className="shell vendor-hero vendor-hero-compact dashboard-hero-refined">
      <div>
        <div className="eyebrow">Dropshipping Control Centre</div>
        <h1>Dropshipping</h1>
        <p className="lead">
          Ο κατάλογος δεν φορτώνεται αυτόματα. Επίλεξε προμηθευτή και αναζήτησε μόνο τα προϊόντα που χρειάζεσαι.
        </p>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Προμηθευτές"
        title="Επίλεξε supplier"
        note="Η σελίδα φορτώνει μόνο τη λίστα προμηθευτών. Κανένα προϊόν δεν ανακτάται μέχρι να κάνεις αναζήτηση."
      />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(250px,1fr))", gap: 14 }}>
        {suppliers.map((supplier) => <article className="workspace-queue-card" key={supplier.id}>
          <div className="workspace-queue-head">
            <div>
              <strong>{supplier.displayName}</strong>
              <small>{supplier.code} · {supplier.providerKind}</small>
            </div>
            <span className="vendor-merchant-status">{supplier.active ? "Ενεργός" : "Ανενεργός"}</span>
          </div>
          <p style={{ marginTop: 12, marginBottom: 12 }}>
            Προϊόντα διαθέσιμα μόνο μέσω αναζήτησης — χωρίς preload καταλόγου.
          </p>
          <Link
            className={selectedSupplier?.code === supplier.code ? "button" : "button button-secondary"}
            href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.code)}`}
          >
            {selectedSupplier?.code === supplier.code ? "Επιλεγμένος" : "Άνοιγμα supplier"}
          </Link>
        </article>)}
        {!suppliers.length ? <article className="workspace-queue-card">
          <strong>Δεν υπάρχει Dropshipping supplier.</strong>
          <p>Δεν βρέθηκε supplier mapping για αυτό το vendor account.</p>
        </article> : null}
      </div>
    </section>

    {selectedSupplier ? <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow={selectedSupplier.displayName}
        title="Αναζήτηση προϊόντων"
        note="Search-only mode · έως 40 αποτελέσματα ανά αναζήτηση · ελάχιστο 3 χαρακτήρες"
      />

      <DropshippingSupplierDefaultsControls
        supplierCode={selectedSupplier.code}
        defaults={selectedSupplier.defaults}
      />

      <form method="get" className="workspace-queue-card" style={{ marginTop: 14, marginBottom: 14 }}>
        <input type="hidden" name="supplier" value={selectedSupplier.code} />
        <div style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10, alignItems: "end" }}>
          <label>
            <small>Τίτλος, brand, SKU, EAN ή supplier product ID</small>
            <input
              name="q"
              defaultValue={query}
              autoComplete="off"
              placeholder="π.χ. Michael Kors, 520..., SKU..."
              style={{ width: "100%" }}
            />
          </label>
          <button className="button" type="submit">Αναζήτηση</button>
        </div>
      </form>

      {!query ? <article className="workspace-queue-card">
        <strong>Δεν έχει φορτωθεί κανένα προϊόν.</strong>
        <p>Χρησιμοποίησε την αναζήτηση για να ανακτηθούν μόνο τα προϊόντα που χρειάζεσαι.</p>
      </article> : null}

      {query && query.length < 3 ? <article className="workspace-queue-card">
        <strong>Χρειάζονται τουλάχιστον 3 χαρακτήρες.</strong>
        <p>Αυτό αποτρέπει ακούσιες, πολύ μεγάλες αναζητήσεις στον supplier κατάλογο.</p>
      </article> : null}

      {searchActive ? <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <strong>{products.length} αποτελέσματα</strong>
          <small>Εμφανίζονται έως 40 αποτελέσματα. Κάνε πιο συγκεκριμένη αναζήτηση αν χρειάζεται.</small>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 14 }}>
          {products.map((product) => <article className="workspace-queue-card" key={product.supplierOfferId}>
            <div className="workspace-queue-head">
              <div>
                <strong>{product.title}</strong>
                <small>{[product.brand, product.externalSku, product.ean].filter(Boolean).join(" · ") || product.canonicalVariantId}</small>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {product.pricingFlag === "OVERPRICED" ? <span className="vendor-merchant-status">OVERPRICED</span> : null}
                <span className="vendor-merchant-status">{product.published ? "Published" : "Unpublished"}</span>
              </div>
            </div>

            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Buying price</strong><span>{euro(product.supplierCostMinor)}</span><small>ιδιωτικό</small></div>
              <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>{euro(product.customerPriceMinor)}</span></div>
              <div className="workspace-compact-row">
                <strong>Supplier stock</strong>
                <span>{product.cachedAvailable ? "Διαθέσιμο" : "Μη διαθέσιμο"}</span>
                <small>{product.cachedQuantity == null ? "Ποσότητα άγνωστη" : `Qty ${product.cachedQuantity}`} · checked {date(product.availabilityCheckedAt)}</small>
              </div>
            </div>

            <DropshippingProductControls
              offerId={product.offerId}
              supplierCostMinor={product.supplierCostMinor}
              visible={product.visible}
              markupValue={product.markupValue}
              discountValue={product.discountValue}
              msrpMinor={product.msrpMinor}
              showMsrp={product.showMsrp}
            />
          </article>)}
        </div>

        {!products.length ? <article className="workspace-queue-card">
          <strong>Δεν βρέθηκαν προϊόντα.</strong>
          <p>Δοκίμασε τίτλο, brand, SKU ή EAN με διαφορετική γραφή.</p>
        </article> : null}
      </> : null}
    </section> : <section className="shell vendor-section">
      <article className="workspace-queue-card">
        <strong>Επίλεξε supplier για αναζήτηση.</strong>
        <p>Η επιλογή supplier από μόνη της δεν φορτώνει προϊόντα.</p>
      </article>
    </section>}
  </main>;
}
