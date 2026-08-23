import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../../../components/SiteFooter";
import { SiteHeader } from "../../../../../../components/SiteHeader";
import { getDemoStorefrontVendor, getDemoVendorCatalogProduct } from "../../../../../../lib/demo-storefront";
import { storefrontCategoryForCode } from "../../../../../../lib/storefront-taxonomy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DEMO product · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};

const productImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  zIndex: 1
} as const;

export default async function DemoProductPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  const vendor = await getDemoStorefrontVendor(id);
  if (!vendor) notFound();
  const product = await getDemoVendorCatalogProduct(vendor, productId);
  if (!product) notFound();
  const category = storefrontCategoryForCode(product.categoryCode);
  const vendorHref = `/demo/vendor/${encodeURIComponent(vendor.id)}`;

  return (
    <main>
      <div className="announcement">DEMO product page · ίδια product-detail εμπειρία χωρίς καλάθι, checkout ή πραγματική διαθεσιμότητα.</div>
      <SiteHeader compact />

      <section className="shell product-detail">
        <div className={`product-detail-art ${category.artClass}`}>
          <span className="detail-category">{category.name}</span>
          <span className="detail-symbol" aria-hidden="true">{category.symbol}</span>
          {product.mediaId ? <Image src={`/api/media/${encodeURIComponent(product.mediaId)}`} alt={product.mediaAlt ?? product.title} fill sizes="(max-width: 900px) 100vw, 48vw" priority style={productImageStyle} /> : null}
          <span className="product-badge">DEMO · Προεπισκόπηση</span>
        </div>

        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`${vendorHref}#products`}>{product.categoryLabel ?? category.label}</a> · {vendor.name} · DEMO</div>
          <h1>{product.title}</h1>
          <div className="detail-price">{product.price}</div>
          <p className="lead compact">Η σελίδα χρησιμοποιεί το ίδιο customer-facing product-detail layout με τα ενεργά προϊόντα. Η τιμή είναι μόνο προεπισκόπηση και δεν δημιουργείται παραγγελία, πληρωμή, stock reservation ή fairness assignment.</p>

          {product.description ? <div className="vendor-card"><div><span className="vendor-avatar">i</span></div><div><div className="eyebrow">Περιγραφή προϊόντος</div><p>{product.description}</p></div></div> : null}

          <div className="eyebrow">Χαρακτηριστικά</div>
          <div className="detail-assurances">
            {product.brand ? <div><strong>Μάρκα</strong><span>{product.brand}</span></div> : null}
            {product.mpn ? <div><strong>Κωδικός προϊόντος</strong><span>{product.mpn}</span></div> : null}
            {product.vendorSku ? <div><strong>SKU καταστήματος</strong><span>{product.vendorSku}</span></div> : null}
            {product.gtin ? <div><strong>GTIN / EAN</strong><span>{product.gtin}</span></div> : null}
            {product.categoryLabel ? <div><strong>Κατηγορία</strong><span>{product.categoryLabel}</span></div> : null}
            {product.color ? <div><strong>Χρώμα</strong><span>{product.color}</span></div> : null}
            {product.sizes.length ? <div><strong>Μεγέθη / παραλλαγές</strong><span>{product.sizes.join(" · ")}</span></div> : null}
            {product.fit ? <div><strong>Εφαρμογή</strong><span>{product.fit}</span></div> : null}
            {product.composition ? <div><strong>Σύνθεση</strong><span>{product.composition}</span></div> : null}
            {product.madeIn ? <div><strong>Κατασκευή</strong><span>{product.madeIn === "Greece" ? "Ελλάδα" : product.madeIn}</span></div> : null}
            <div><strong>Κατάσταση offer</strong><span>{product.offerStatus.replaceAll("_", " ")} · DEMO only</span></div>
          </div>

          <div className="vendor-card">
            <div><span className="vendor-avatar">{vendor.name.slice(0, 1)}</span></div>
            <div>
              <div className="eyebrow">Κατάστημα προεπισκόπησης</div>
              <strong><a href={vendorHref}>{vendor.name}</a></strong>
              <p>Το προϊόν παρουσιάζεται μέσα στο συγκεκριμένο prospect vendor, ακριβώς όπως θα συνδέεται με το κατάστημα μετά την ολοκλήρωση onboarding και publication review.</p>
              <div className="vendor-actions"><a className="button button-secondary" href={`${vendorHref}#products`}>← Πίσω στα προϊόντα</a></div>
            </div>
          </div>

          <div className="purchase-card">
            <div>
              <strong>DEMO · αγορά απενεργοποιημένη</strong>
              <span>{product.priceMinor > 0 ? "Υπάρχει τιμή παρουσίασης, αλλά δεν είναι ενεργό marketplace offer μέχρι να ολοκληρωθούν verification, approval και activation." : "Η τιμή δεν έχει ακόμη επιβεβαιωθεί. Η προεπισκόπηση παραμένει διαθέσιμη χωρίς να εμφανίζει πλασματική τιμή €0,00."}</span>
            </div>
            <div className="purchase-actions"><button className="button" type="button" disabled aria-disabled="true">Μη διαθέσιμο για αγορά σε DEMO</button></div>
          </div>

          <div className="detail-assurances">
            <div><strong>Καμία παραγγελία</strong><span>Δεν δημιουργείται cart ή checkout.</span></div>
            <div><strong>Καμία δέσμευση</strong><span>Δεν μεταβάλλεται απόθεμα ή fairness state.</span></div>
            <div><strong>Πραγματικό UX</strong><span>Η δομή προσομοιώνει την τελική product page.</span></div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
