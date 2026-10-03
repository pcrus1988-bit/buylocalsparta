"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";
import { requestCatalogMsrp } from "../lib/catalog-msrp-client";
import { publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../lib/public-data-integrity";
import { productPublicPath } from "../lib/product-url";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";
import { publicPriceBadgeLabel, publicSavingsLabel, type PriceHighlightKind } from "../lib/public-price-presentation";
import { BrandMarketplaceLink } from "./BrandMarketplaceLink";
import { LocalCommerceProof } from "./LocalCommerceProof";
import styles from "./CatalogProductCard.module.css";

const OPTIMIZED_SUPPLIER_IMAGE_HOSTS = new Set([
  "brandsgateway-img.s3.fr-par.scw.cloud",
  "cdn.symphonya.eu"
]);

function optimizedSupplierImage(src: string): boolean {
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMIZED_SUPPLIER_IMAGE_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}


export type CatalogProductCardClientProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  priceMinor: number;
  price: string;
  categoryCode: string;
  departmentCode?: string;
  categoryLabel?: string;
  mpn?: string;
  brand?: string;
  brandLogoObjectKey?: string;
  vendorId?: string;
  vendorName?: string;
  mediaId?: string;
  mediaAlt?: string;
  available: boolean;
  previewImageSrc?: string;
  localProof?: LocalCommerceProofValue;
  supplierFulfilled?: boolean;
  priceHighlightKind?: PriceHighlightKind;
  msrpMinor?: number | null;
}>;

function demoBookCover(product: CatalogProductCardClientProduct): string | undefined {
  if (product.mediaId || !product.id.startsWith("product_demo_book_") || !/^\d{13}$/.test(product.mpn ?? "")) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${product.mpn}-L.jpg?default=false`;
}

const formatEuroMinor = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function usePublicCatalogMsrp(product: CatalogProductCardClientProduct, demoMode: boolean, projectionKnown: boolean): number | undefined {
  const [msrpMinor, setMsrpMinor] = useState<number | undefined>();

  useEffect(() => {
    setMsrpMinor(undefined);
    if (projectionKnown || demoMode || !product.available || !product.vendorId || !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) return;

    let active = true;
    void requestCatalogMsrp({
      productId: product.id,
      vendorId: product.vendorId,
      retailPriceMinor: product.priceMinor
    }).then((value) => {
      if (active) setMsrpMinor(value);
    });

    return () => {
      active = false;
    };
  }, [demoMode, product.available, product.id, product.priceMinor, product.vendorId, projectionKnown]);

  return msrpMinor;
}

function PublicCatalogPrice({
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
  return <div className={`price ${styles.priceText}`}>
    {msrpMinor !== undefined && !prominentSavings ? <div className={styles.msrpRow}>
      <s aria-label={`Προτεινόμενη λιανική ${formatEuroMinor(msrpMinor)}`} className={styles.msrpInline}>ΠΛΤ {formatEuroMinor(msrpMinor)}</s>
      {savingLabel ? <span aria-label={`Όφελος ${savingLabel}% σε σχέση με την προτεινόμενη λιανική`} className={styles.inlineSavings}>−{savingLabel}% vs ΠΛΤ</span> : null}
    </div> : null}
    <span aria-label={`Τελική τιμή ${formatEuroMinor(retailPriceMinor)}`}>{priceLabel}</span>
  </div>;
}

export function CatalogProductCardClient({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogProductCardClientProduct;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const demoMode = Boolean(demoVendorId);
  const projectedMsrpMinor = typeof product.msrpMinor === "number" ? product.msrpMinor : undefined;
  const fallbackMsrpMinor = usePublicCatalogMsrp(product, demoMode, product.msrpMinor !== undefined);
  const msrpMinor = projectedMsrpMinor ?? fallbackMsrpMinor;
  const savingLabel = msrpMinor === undefined ? undefined : publicSavingsLabel(msrpMinor, product.priceMinor);
  const supplierFulfilled = product.supplierFulfilled === true;
  const highlightKind = product.priceHighlightKind ?? "msrp-savings";
  const prominentSavings = Boolean(savingLabel && (supplierFulfilled || highlightKind === "sale"));
  const publicPurchasable = product.available && product.priceMinor > 0 && Boolean(product.vendorId || vendorContext);

  if (!demoMode && !publicPurchasable) return null;

  const category = storefrontCategoryForCode(product.categoryCode, product.departmentCode);
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const vendorName = supplierFulfilled ? undefined : vendorContext?.name ?? product.vendorName;
  const externalDemoCover = demoBookCover(product);
  const directImageSrc = product.mediaId
    ? `/api/media/${encodeURIComponent(product.mediaId)}`
    : product.previewImageSrc ?? externalDemoCover;
  const governedSourceFallback = !directImageSrc;
  const imageSrc = directImageSrc ?? `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const externalImage = governedSourceFallback || Boolean(imageSrc.startsWith("https://"));
  const kerasiotisExternalImage = imageSrc.startsWith("https://www.e-kerasiotis.gr/");
  const useOptimizedImage = Boolean(product.mediaId) || optimizedSupplierImage(imageSrc);
  const eagerImage = index === 0;
  const productHref = demoVendorId
    ? `/demo/vendor/${encodeURIComponent(demoVendorId)}/product/${encodeURIComponent(product.slug || product.id)}`
    : productPublicPath(product);
  const priceLabel = publicCatalogPriceLabel(product);

  return (
    <article className={`product-card ${styles.visualCard}`}>
      <Link href={productHref} prefetch={false} className={`product-art ${category.artClass} ${styles.visualArt}`} aria-label={`Δες ${displayTitle}`}>
        {governedSourceFallback ? <span className="art-category">{category.name}</span> : null}
        {governedSourceFallback ? <span className="art-symbol" aria-hidden="true">{category.symbol}</span> : null}
        {governedSourceFallback ? <span className="art-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
        {useOptimizedImage ? <Image
          src={imageSrc}
          alt={product.mediaAlt ?? displayTitle}
          width={320}
          height={320}
          quality={70}
          priority={eagerImage}
          decoding="async"
          referrerPolicy="no-referrer"
          className={styles.catalogImage}
        /> : <img
          src={imageSrc}
          alt={product.mediaAlt ?? displayTitle}
          loading={eagerImage ? "eager" : "lazy"}
          fetchPriority={index === 0 ? "high" : "auto"}
          decoding="async"
          referrerPolicy={kerasiotisExternalImage ? "strict-origin-when-cross-origin" : externalImage ? "no-referrer" : undefined}
          className={styles.catalogImage}
        />}
        {prominentSavings && savingLabel && msrpMinor !== undefined ? (
          <span
            aria-label={highlightKind === "sale" ? `ΠΛΤ ${formatEuroMinor(msrpMinor)}, SALE, όφελος ${savingLabel}%` : `ΠΛΤ ${formatEuroMinor(msrpMinor)}, όφελος ${savingLabel}%`}
            data-price-highlight-kind={highlightKind}
            className={styles.savingsBadge}
          >
            <s aria-hidden="true" className={styles.savingsMsrp}>ΠΛΤ {formatEuroMinor(msrpMinor)}</s>
            <span
              aria-hidden="true"
              className={`${styles.savingsPill}${highlightKind === "sale" ? ` ${styles.salePill}` : ""}`}
            >
              {publicPriceBadgeLabel(highlightKind, savingLabel)}
            </span>
          </span>
        ) : null}
      </Link>
      <div className={`product-body ${styles.visualBody}`}>
        <div className={`eyebrow ${styles.categoryPill}`}>{product.categoryLabel ?? category.label}</div>
        <div className={`catalog-card-title-stack ${styles.titleStack}`}>
          {product.brand ? <BrandMarketplaceLink
            brand={product.brand}
            logoObjectKey={product.brandLogoObjectKey}
            variant="card"
            href={productHref}
            ariaLabel={`Δες ${displayTitle}`}
            linkTitle={`Δες ${displayTitle}`}
            prefetch={false}
          /> : null}
          <h3><Link href={productHref} prefetch={false}>{displayTitle}</Link></h3>
        </div>
        <div className={`product-bottom ${styles.productBottom}`}>
          <PublicCatalogPrice msrpMinor={msrpMinor} retailPriceMinor={product.priceMinor} priceLabel={priceLabel} savingLabel={savingLabel} prominentSavings={prominentSavings} />
        </div>
        {!supplierFulfilled && vendorName ? <p className={`catalog-card-vendor ${styles.vendorLine}`}>{vendorName}</p> : null}
        {!demoMode && !supplierFulfilled ? <div className={styles.localProof}><LocalCommerceProof proof={product.localProof} compact /></div> : null}
      </div>

    </article>
  );
}
