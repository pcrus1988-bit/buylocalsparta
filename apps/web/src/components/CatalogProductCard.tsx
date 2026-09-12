"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

const formatEuroMinor = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function savingsPercent(msrpMinor: number, retailPriceMinor: number): number | undefined {
  if (!Number.isSafeInteger(msrpMinor) || !Number.isSafeInteger(retailPriceMinor) || msrpMinor <= retailPriceMinor || retailPriceMinor < 0) return undefined;
  return Math.round(((msrpMinor - retailPriceMinor) / msrpMinor) * 1000) / 10;
}

function PublicCatalogPrice({ product, demoMode, priceLabel }: { product: CatalogCardWithPreview; demoMode: boolean; priceLabel: string }) {
  const [msrpMinor, setMsrpMinor] = useState<number | undefined>();

  useEffect(() => {
    setMsrpMinor(undefined);
    if (demoMode || !product.available || !product.vendorId || !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      productId: product.id,
      vendorId: product.vendorId,
      retailPriceMinor: String(product.priceMinor)
    });

    void fetch(`/api/catalog/msrp?${params.toString()}`, {
      method: "GET",
      credentials: "same-origin",
      signal: controller.signal,
      headers: { accept: "application/json" }
    })
      .then(async (response) => {
        if (!response.ok) return undefined;
        const payload = await response.json() as { msrpMinor?: unknown };
        const value = Number(payload.msrpMinor);
        return Number.isSafeInteger(value) && value > product.priceMinor ? value : undefined;
      })
      .then((value) => {
        if (!controller.signal.aborted) setMsrpMinor(value);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted && !(error instanceof DOMException && error.name === "AbortError")) setMsrpMinor(undefined);
      });

    return () => controller.abort();
  }, [demoMode, product.available, product.id, product.priceMinor, product.vendorId]);

  const saving = msrpMinor === undefined ? undefined : savingsPercent(msrpMinor, product.priceMinor);

  return <div className="price">
    {msrpMinor !== undefined ? <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <s aria-label={`Προτεινόμενη λιανική ${formatEuroMinor(msrpMinor)}`} style={{ fontSize: "0.72em", opacity: 0.62, fontWeight: 500 }}>{formatEuroMinor(msrpMinor)}</s>
      {saving !== undefined ? <span aria-label={`Όφελος ${saving}%`} style={{ fontSize: "0.62em", fontWeight: 800, whiteSpace: "nowrap" }}>−{saving.toLocaleString("el-GR", { maximumFractionDigits: 1 })}%</span> : null}
    </div> : null}
    <span>{priceLabel}</span>
  </div>;
}

export function CatalogProductCard({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogCardWithPreview;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const demoMode = Boolean(demoVendorId);
  const publicPurchasable = product.available && product.priceMinor > 0 && Boolean(product.vendorId || vendorContext);

  // Standard customer shopping surfaces must never render a misleading card for a
  // canonical that has no positive selling price or no eligible fulfilment vendor.
  // Deliberate DEMO previews stay visible, while unavailable product detail routes
  // can still communicate their state separately when intentionally linked.
  if (!demoMode && !publicPurchasable) return null;

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
          <PublicCatalogPrice product={product} demoMode={demoMode} priceLabel={priceLabel} />
          <Link className="round-add" href={productHref} aria-label={`Δες ${displayTitle}`}>→</Link>
        </div>
        <p className={`catalog-card-availability${product.available ? " is-available" : ""}`}>{availabilityLabel(product, demoMode)}</p>
        {vendorName ? <p className="catalog-card-vendor">{vendorName}</p> : null}
        {!demoMode ? <LocalCommerceProof proof={product.localProof} compact /> : null}
      </div>
    </article>
  );
}
