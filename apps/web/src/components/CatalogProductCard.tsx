import Link from "next/link";
import type { CatalogCard } from "../lib/catalog-view";
import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";
import type { PriceHighlightKind } from "../lib/public-price-presentation";
import { publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../lib/public-data-integrity";
import { productPublicPath } from "../lib/product-url";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";
import { publicPriceBadgeLabel, publicSavingsLabel } from "../lib/public-price-presentation";
import { BrandMarketplaceLink } from "./BrandMarketplaceLink";
import { LocalCommerceProof } from "./LocalCommerceProof";
import { CatalogProductCardClient, type CatalogProductCardClientProduct } from "./CatalogProductCardClient";
import styles from "./CatalogProductCard.module.css";

type CatalogProductCardSource = CatalogCard & Readonly<{
  previewImageSrc?: string;
  localProof?: LocalCommerceProofValue;
  supplierFulfilled?: boolean;
  priceHighlightKind?: PriceHighlightKind;
  msrpMinor?: number | null;
}>;

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

function demoBookCover(product: CatalogProductCardSource): string | undefined {
  if (product.mediaId || !product.id.startsWith("product_demo_book_") || !/^\d{13}$/.test(product.mpn ?? "")) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${product.mpn}-L.jpg?default=false`;
}

const formatEuroMinor = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function StaticPublicCatalogPrice({
  msrpMinor,
  retailPriceMinor,
  priceLabel,
  savingLabel,
  prominentSavings
}: {
  msrpMinor?: number;
  retailPriceMinor: number;
  priceLabel: string;
  savingLabel?: string;
  prominentSavings: boolean;
}) {
  return <div className="price">
    {msrpMinor !== undefined && !prominentSavings ? <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <s aria-label={`Προτεινόμενη λιανική ${formatEuroMinor(msrpMinor)}`} style={{ fontSize: "0.72em", opacity: 0.62, fontWeight: 500 }}>ΠΛΤ {formatEuroMinor(msrpMinor)}</s>
      {savingLabel ? <span aria-label={`Όφελος ${savingLabel}% σε σχέση με την προτεινόμενη λιανική`} style={{ fontSize: "0.62em", fontWeight: 800, whiteSpace: "nowrap" }}>−{savingLabel}% vs ΠΛΤ</span> : null}
    </div> : null}
    <span aria-label={`Τελική τιμή ${formatEuroMinor(retailPriceMinor)}`}>{priceLabel}</span>
  </div>;
}

/**
 * Catalogue-card server boundary.
 *
 * /shop now projects MSRP (including an explicit null when no public MSRP exists),
 * so those cards can render entirely on the server instead of hydrating 30 copies
 * of the full card component. Legacy callers that do not yet project MSRP retain
 * the old client fallback and its batched MSRP lookup.
 */
export function CatalogProductCard({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogProductCardSource;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const clientProduct: CatalogProductCardClientProduct = {
    id: product.id,
    slug: product.slug,
    title: product.title,
    priceMinor: product.priceMinor,
    price: product.price,
    categoryCode: product.categoryCode,
    departmentCode: product.departmentCode,
    categoryLabel: product.categoryLabel,
    mpn: product.mpn,
    brand: product.brand,
    brandLogoObjectKey: product.brandLogoObjectKey,
    vendorId: product.vendorId,
    vendorName: product.vendorName,
    mediaId: product.mediaId,
    mediaAlt: product.mediaAlt,
    available: product.available,
    previewImageSrc: product.previewImageSrc,
    localProof: product.localProof,
    supplierFulfilled: product.supplierFulfilled,
    priceHighlightKind: product.priceHighlightKind,
    msrpMinor: product.msrpMinor
  };

  const demoMode = Boolean(demoVendorId);
  const projectionKnown = product.msrpMinor !== undefined;
  const needsLegacyMsrpLookup = !projectionKnown
    && !demoMode
    && product.available
    && Boolean(product.vendorId)
    && Number.isSafeInteger(product.priceMinor)
    && product.priceMinor >= 0;

  if (needsLegacyMsrpLookup) {
    return <CatalogProductCardClient
      product={clientProduct}
      index={index}
      vendorContext={vendorContext}
      demoVendorId={demoVendorId}
    />;
  }

  const supplierFulfilled = product.supplierFulfilled === true;
  const publicPurchasable = product.available && product.priceMinor > 0 && Boolean(product.vendorId || vendorContext);
  if (!demoMode && !publicPurchasable) return null;

  const projectedMsrpMinor = typeof product.msrpMinor === "number" ? product.msrpMinor : undefined;
  const savingLabel = projectedMsrpMinor === undefined ? undefined : publicSavingsLabel(projectedMsrpMinor, product.priceMinor);
  const highlightKind = product.priceHighlightKind ?? "msrp-savings";
  const prominentSavings = Boolean(savingLabel && (supplierFulfilled || highlightKind === "sale"));
  const category = storefrontCategoryForCode(product.categoryCode, product.departmentCode);
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const vendorName = supplierFulfilled ? undefined : vendorContext?.name ?? product.vendorName;
  const externalDemoCover = demoBookCover(product);
  const directImageSrc = product.mediaId
    ? `/api/media/${encodeURIComponent(product.mediaId)}`
    : product.previewImageSrc ?? externalDemoCover;
  const governedSourceFallback = !directImageSrc;
  const imageSrc = directImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const externalImage = governedSourceFallback || imageSrc.startsWith("https://");
  const productHref = demoVendorId
    ? `/demo/vendor/${encodeURIComponent(demoVendorId)}/product/${encodeURIComponent(product.slug || product.id)}`
    : productPublicPath(product);
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
          loading={index === 0 ? "eager" : "lazy"}
          fetchPriority={index === 0 ? "high" : "auto"}
          decoding="async"
          referrerPolicy={externalImage ? "no-referrer" : undefined}
          style={catalogImageStyle}
        />
        {prominentSavings && savingLabel && projectedMsrpMinor !== undefined ? (
          <span
            aria-label={highlightKind === "sale" ? `ΠΛΤ ${formatEuroMinor(projectedMsrpMinor)}, SALE, όφελος ${savingLabel}%` : `ΠΛΤ ${formatEuroMinor(projectedMsrpMinor)}, όφελος ${savingLabel}%`}
            data-price-highlight-kind={highlightKind}
            style={{
              position: "absolute",
              zIndex: 3,
              top: 14,
              right: 14,
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 5
            }}
          >
            <s aria-hidden="true" style={{ color: "rgba(13, 43, 35, .62)", fontSize: ".7rem", fontWeight: 700, lineHeight: 1, whiteSpace: "nowrap" }}>ΠΛΤ {formatEuroMinor(projectedMsrpMinor)}</s>
            <span
              aria-hidden="true"
              style={{
                background: highlightKind === "sale" ? "var(--terracotta, #aa664f)" : "#111",
                color: "#fff",
                borderRadius: 999,
                padding: "9px 13px",
                fontWeight: 900,
                fontSize: ".92rem",
                lineHeight: 1,
                boxShadow: "0 8px 22px rgba(0,0,0,.12)"
              }}
            >
              {publicPriceBadgeLabel(highlightKind, savingLabel)}
            </span>
          </span>
        ) : null}
      </Link>
      <div className="product-body">
        <div className="eyebrow">{product.categoryLabel ?? category.label}</div>
        <div className={`catalog-card-title-stack ${styles.titleStack}`}>
          {product.brand ? <BrandMarketplaceLink
            brand={product.brand}
            logoObjectKey={product.brandLogoObjectKey}
            variant="card"
            href={productHref}
            ariaLabel={`Δες ${displayTitle}`}
            linkTitle={`Δες ${displayTitle}`}
          /> : null}
          <h3><Link href={productHref}>{displayTitle}</Link></h3>
        </div>
        <div className={`product-bottom ${styles.productBottom}`}>
          <StaticPublicCatalogPrice
            msrpMinor={projectedMsrpMinor}
            retailPriceMinor={product.priceMinor}
            priceLabel={priceLabel}
            savingLabel={savingLabel}
            prominentSavings={prominentSavings}
          />
        </div>
        {!supplierFulfilled && vendorName ? <p className="catalog-card-vendor">{vendorName}</p> : null}
        {!demoMode && !supplierFulfilled ? <LocalCommerceProof proof={product.localProof} compact /> : null}
      </div>
    </article>
  );
}
