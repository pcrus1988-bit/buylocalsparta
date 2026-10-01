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
const integer = (value: number) => new Intl.NumberFormat("el-GR").format(value);

export default async function VendorDropshippingPage({ searchParams }: { searchParams: SearchParams }) {
  const principal = await getVendorSession();
  if (!principal) redirect("/vendor/login");
  if (!await isDropshippingOnlyVendor(principal.vendorId)) redirect("/vendor");

  const params = await searchParams;
  const supplierCode = first(params.supplier).trim().slice(0, 80);
  const query = first(params.q).trim().slice(0, 120);
  const vendorId = principal.vendorId ?? "";

  // Lightweight supplier metadata + distinct source-product counts only.
  // Product rows are never loaded until the vendor performs a bounded search.
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
        <div className="eyebrow">Κέντρο dropshipping</div>
        <h1>Dropshipping</h1>
        <p className="lead">
          Ο κατάλογος δεν φορτώνεται αυτόματα. Επίλεξε προμηθευτή και αναζήτησε μόνο τα προϊόντα που χρειάζεσαι.
        </p>
      </div>
    </section>

    <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow="Προμηθευτές"
        title="Επίλεξε προμηθευτή"
        note="Φορτώνονται μόνο τα βασικά στοιχεία και ο συνολικός αριθμός προϊόντων. Τα προϊόντα ανακτώνται αποκλειστικά μέσω αναζήτησης."
      />
      <div className="vendor-card-grid">
        {suppliers.map((supplier) => <article className="workspace-queue-card" key={supplier.id}>
          <div className="workspace-queue-head">
            <div>
              <strong>{supplier.displayName}</strong>
              <small>Συνδεδεμένος προμηθευτής</small>
            </div>
            <span className="vendor-merchant-status">{supplier.active ? "Ενεργός" : "Ανενεργός"}</span>
          </div>
          <div className="workspace-compact-list" style={{ marginTop: 12, marginBottom: 12 }}>
            <div className="workspace-compact-row">
              <strong>Προϊόντα</strong>
              <span>{integer(supplier.productCount)}</span>
              <small>μοναδικά προϊόντα πηγής</small>
            </div>
          </div>
          <p style={{ marginTop: 0, marginBottom: 12 }}>
            Τα προϊόντα φορτώνονται μόνο όταν τα αναζητάς — όχι ολόκληρος ο κατάλογος εκ των προτέρων.
          </p>
          <Link
            className={selectedSupplier?.code === supplier.code ? "button" : "button button-secondary"}
            href={`/vendor/dropshipping?supplier=${encodeURIComponent(supplier.code)}`}
          >
            {selectedSupplier?.code === supplier.code ? "Επιλεγμένος" : "Επιλογή"}
          </Link>
        </article>)}
        {!suppliers.length ? <article className="workspace-queue-card">
          <strong>Δεν υπάρχει προμηθευτής dropshipping.</strong>
          <p>Δεν βρέθηκε σύνδεση προμηθευτή για αυτό το κατάστημα.</p>
        </article> : null}
      </div>
    </section>

    {selectedSupplier ? <section className="shell vendor-section">
      <WorkspaceSectionHeading
        eyebrow={selectedSupplier.displayName}
        title="Αναζήτηση προϊόντων"
        note={`Μόνο αναζήτηση · ${integer(selectedSupplier.productCount)} προϊόντα πηγής · έως 40 αποτελέσματα ανά αναζήτηση · ελάχιστο 3 χαρακτήρες`}
      />

      <DropshippingSupplierDefaultsControls
        supplierCode={selectedSupplier.code}
        defaults={selectedSupplier.defaults}
      />

      <form method="get" className="workspace-queue-card" style={{ marginTop: 14, marginBottom: 14 }}>
        <input type="hidden" name="supplier" value={selectedSupplier.code} />
        <div className="vendor-dropshipping-search-row" style={{ display: "grid", gridTemplateColumns: "minmax(220px,1fr) auto", gap: 10, alignItems: "end" }}>
          <label>
            <small>Τίτλος, μάρκα, SKU, EAN ή κωδικός προμηθευτή</small>
            <input
              name="q"
              defaultValue={query}
              autoComplete="off"
              placeholder="π.χ. Burberry, 520..., SKU..."
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
        <p>Αυτό αποτρέπει ακούσιες, πολύ μεγάλες αναζητήσεις στον κατάλογο του προμηθευτή.</p>
      </article> : null}

      {searchActive ? <>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 12 }}>
          <strong>{products.length} αποτελέσματα</strong>
          <small>Εμφανίζονται έως 40 αποτελέσματα. Κάνε πιο συγκεκριμένη αναζήτηση αν χρειάζεται.</small>
        </div>

        <div className="vendor-card-grid">
          {products.map((product) => <article className="workspace-queue-card" key={product.sourceProductId}>
            <div className="workspace-queue-head">
              <div>
                <strong>{product.title}</strong>
                <small>{[product.brand, product.externalSku, product.ean].filter(Boolean).join(" · ") || `Προϊόν προμηθευτή ${product.sourceProductKey}`}</small>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                {product.pricingFlag === "OVERPRICED" ? <span className="vendor-merchant-status">ΥΨΗΛΗ ΤΙΜΗ</span> : null}
                {product.offerId
                  ? <span className="vendor-merchant-status">{product.published ? "Δημοσιευμένο" : "Μη δημοσιευμένο"}</span>
                  : <span className="vendor-merchant-status">Κατάλογος πηγής</span>}
              </div>
            </div>

            <div className="workspace-compact-list" style={{ marginTop: 12 }}>
              <div className="workspace-compact-row"><strong>Τιμή αγοράς</strong><span>{euro(product.supplierCostMinor)}</span><small>ιδιωτικό</small></div>
              <div className="workspace-compact-row"><strong>Τελική τιμή</strong><span>{euro(product.customerPriceMinor)}</span><small>{product.offerId ? "Προσφορά ΚΟΝΤΑ ΜΟΥ" : "Δεν έχει δημιουργηθεί προσφορά"}</small></div>
              <div className="workspace-compact-row">
                <strong>Απόθεμα προμηθευτή</strong>
                <span>{product.cachedAvailable ? "Διαθέσιμο" : "Μη διαθέσιμο"}</span>
                <small>{product.cachedQuantity == null ? "Ποσότητα άγνωστη" : `Ποσότητα ${product.cachedQuantity}`} · έλεγχος {date(product.availabilityCheckedAt)}</small>
              </div>
              <div className="workspace-compact-row">
                <strong>Κωδικός προϊόντος προμηθευτή</strong>
                <span>{product.sourceProductKey}</span>
                <small>{product.priceState ? `Κατάσταση τιμής: ${product.priceState}` : "Κατάλογος προμηθευτή"}</small>
              </div>
            </div>

            {product.offerId ? <DropshippingProductControls
              offerId={product.offerId}
              supplierCostMinor={product.supplierCostMinor}
              visible={product.visible}
              markupValue={product.markupValue}
              discountValue={product.discountValue}
              msrpMinor={product.msrpMinor}
              showMsrp={product.showMsrp}
            /> : <div className="workspace-compact-row" style={{ marginTop: 12 }}>
              <strong>Έτοιμο αποτέλεσμα αναζήτησης</strong>
              <small>Το προϊόν υπάρχει στον κατάλογο του προμηθευτή αλλά δεν έχει δημιουργηθεί ακόμη προσφορά καταστήματος.</small>
            </div>}
          </article>)}
        </div>

        {!products.length ? <article className="workspace-queue-card">
          <strong>Δεν βρέθηκαν προϊόντα.</strong>
          <p>Δοκίμασε τίτλο, μάρκα, SKU, EAN ή κωδικό προϊόντος προμηθευτή με διαφορετική γραφή.</p>
        </article> : null}
      </> : null}
    </section> : <section className="shell vendor-section">
      <article className="workspace-queue-card">
        <strong>Επίλεξε προμηθευτή για αναζήτηση.</strong>
        <p>Η επιλογή προμηθευτή από μόνη της δεν φορτώνει προϊόντα.</p>
      </article>
    </section>}
  </main>;
}
