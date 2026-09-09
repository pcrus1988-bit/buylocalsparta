import Link from "next/link";
import type { CatalogCard } from "../lib/catalog-view";
import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";
import { publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../lib/public-data-integrity";
import { productPublicPath } from "../lib/product-url";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";
import { LocalCommerceProof } from "./LocalCommerceProof";

const catalogImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  padding: "16px",
  background: "#fff",
  zIndex: 1
} as const;

type CatalogCardWithPreview = CatalogCard & Readonly<{ previewImageSrc?: string; localProof?: LocalCommerceProofValue }>;

function demoBookCover(product: CatalogCard): string | undefined {
  if (product.mediaId || !product.id.startsWith("product_demo_book_") || !/^\d{13}$/.test(product.mpn ?? "")) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${product.mpn}-L.jpg?default=false`;
}

function availabilityLabel(product: CatalogCardWithPreview, demoMode: boolean): string {
  if (demoMode) return "Προεπισκόπηση · η αγορά είναι απενεργοποιημένη";
  if (product.localProof?.stockConfirmedToday) return "Σε τοπικό απόθεμα · επιβεβαιωμένο σήμερα";
  if (product.localProof?.freshLocalStock) return "Σε τοπικό απόθεμα";
  if (product.available) return "Διαθέσιμο από τοπικό κατάστημα";
  return "Προσωρινά μη διαθέσιμο";
}

export function CatalogProductCard({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogCardWithPreview;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const category = storefrontCategoryForCode(product.categoryCode, product.departmentCode);
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const vendorName = vendorContext?.name ?? product.vendorName;
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
      <Link href={productHref} className={`product-art ${category.artClass}`} aria-label={`Δες ${displayTitle}`}>
        {governedSourceFallback ? <span className="art-category">{category.name}</span> : null}
        {governedSourceFallback ? <span className="art-symbol" aria-hidden="true">{category.symbol}</span> : null}
        {governedSourceFallback ? <span className="art-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
        <img
          src={imageSrc}
          alt={product.mediaAlt ?? displayTitle}
          loading="lazy"
          decoding="async"
          referrerPolicy={externalImage ? "no-referrer" : undefined}
          style={catalogImageStyle}
        />
      </Link>
      <div className="product-body">
        <div className="eyebrow">{product.categoryLabel ?? category.label}</div>
        <h3><Link href={productHref}>{displayTitle}</Link></h3>
        <div className="product-bottom">
          <div className="price">{priceLabel}</div>
          <Link className="round-add" href={productHref} aria-label={`Δες ${displayTitle}`}>→</Link>
        </div>
        <p className={`catalog-card-availability${product.available ? " is-available" : ""}`}>{availabilityLabel(product, demoMode)}</p>
        {vendorName ? <p className="catalog-card-vendor">{vendorName}</p> : null}
        {!demoMode ? <LocalCommerceProof proof={product.localProof} compact /> : null}
      </div>
    </article>
  );
}
