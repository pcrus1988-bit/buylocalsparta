import Link from "next/link";
import type { CatalogCard } from "../lib/catalog-view";
import { publicCatalogPriceLabel } from "../lib/public-data-integrity";
import { productPublicPath } from "../lib/product-url";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";

const catalogImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  padding: "18px",
  background: "#fff",
  zIndex: 1
} as const;

type CatalogCardWithPreview = CatalogCard & Readonly<{ previewImageSrc?: string }>;

function demoBookCover(product: CatalogCard): string | undefined {
  if (product.mediaId || !product.id.startsWith("product_demo_book_") || !/^\d{13}$/.test(product.mpn ?? "")) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${product.mpn}-L.jpg?default=false`;
}

export function CatalogProductCard({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogCardWithPreview;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const category = storefrontCategoryForCode(product.categoryCode);
  const vendorName = vendorContext?.name ?? product.vendorName;
  const adviser = vendorContext?.adviser ?? product.adviser;
  const vendorHref = !vendorContext && product.vendorId ? `/vendor/${product.vendorId}` : undefined;
  const externalDemoCover = demoBookCover(product);
  const directImageSrc = product.mediaId
    ? `/api/media/${encodeURIComponent(product.mediaId)}`
    : product.previewImageSrc ?? externalDemoCover;
  const governedSourceFallback = !directImageSrc;
  const imageSrc = directImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const externalImage = governedSourceFallback || Boolean(imageSrc.startsWith("https://"));
  const productHref = demoVendorId
    ? `/demo/vendor/${encodeURIComponent(demoVendorId)}/product/${encodeURIComponent(product.slug || product.id)}`
    : productPublicPath(product);
  const demoMode = Boolean(demoVendorId);
  const priceLabel = publicCatalogPriceLabel(product);

  return (
    <article className="product-card">
      <Link href={productHref} className={`product-art ${category.artClass}`} aria-label={`Δες ${product.title}`}>
        {governedSourceFallback ? <span className="art-category">{category.name}</span> : null}
        {governedSourceFallback ? <span className="art-symbol" aria-hidden="true">{category.symbol}</span> : null}
        {governedSourceFallback ? <span className="art-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
        <img
          src={imageSrc}
          alt={product.mediaAlt ?? product.title}
          loading="lazy"
          decoding="async"
          referrerPolicy={externalImage ? "no-referrer" : undefined}
          style={governedSourceFallback ? { ...catalogImageStyle, background: "transparent" } : catalogImageStyle}
        />
        <span className="product-badge">{demoMode ? "DEMO · Προεπισκόπηση" : product.available ? "Διαθέσιμο σήμερα" : "Προσωρινά μη διαθέσιμο"}</span>
      </Link>
      <div className="product-body">
        <div className="eyebrow">{product.categoryLabel ?? category.label}{product.mpn ? ` · Κωδ. ${product.mpn}` : ""}</div>
        <h3><Link href={productHref}>{product.title}</Link></h3>
        {product.description ? <p className="partner">{product.description}</p> : null}
        {demoMode && vendorName ? (
          <p className="partner">Προεπισκόπηση καταλόγου από <strong>{vendorName}</strong>. Η αγορά παραμένει απενεργοποιημένη σε DEMO.</p>
        ) : vendorName && adviser ? (
          <p className="partner">Συμβουλή & παραλαβή από <strong>{vendorHref ? <a href={vendorHref}>{vendorName}</a> : vendorName}</strong> · Ρώτησε {adviser}.</p>
        ) : vendorName ? (
          <p className="partner">Εξυπηρέτηση από <strong>{vendorHref ? <a href={vendorHref}>{vendorName}</a> : vendorName}</strong>.</p>
        ) : (
          <p className="partner">Δεν υπάρχει αυτή τη στιγμή επιλέξιμος τοπικός συνεργάτης εκπλήρωσης.</p>
        )}
        <div className="product-bottom"><div className="price">{priceLabel}</div><Link className="round-add" href={productHref} aria-label={`Δες ${product.title}`}>→</Link></div>
      </div>
    </article>
  );
}
