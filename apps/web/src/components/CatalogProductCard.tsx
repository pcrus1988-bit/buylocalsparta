"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CatalogCard } from "../lib/catalog-view";
import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";
import { publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../lib/public-data-integrity";
import { productPublicPath } from "../lib/product-url";
import { storefrontCategoryForCode } from "../lib/storefront-taxonomy";
import { publicBrandLogoUrl } from "../lib/brand-logo";
import { publicPriceBadgeLabel, publicSavingsLabel, type PriceHighlightKind } from "../lib/public-price-presentation";
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

type CatalogCardWithPreview = CatalogCard & Readonly<{
  previewImageSrc?: string;
  localProof?: LocalCommerceProofValue;
  supplierFulfilled?: boolean;
  /**
   * Reserved for an explicit promotional state. Being below MSRP alone remains
   * `msrp-savings` and must never silently turn into a SALE claim.
   */
  priceHighlightKind?: PriceHighlightKind;
}>;

function demoBookCover(product: CatalogCard): string | undefined {
  if (product.mediaId || !product.id.startsWith("product_demo_book_") || !/^\d{13}$/.test(product.mpn ?? "")) return undefined;
  return `https://covers.openlibrary.org/b/isbn/${product.mpn}-L.jpg?default=false`;
}

function availabilityLabel(product: CatalogCardWithPreview, demoMode: boolean): string {
  if (demoMode) return "Προεπισκόπηση · η αγορά είναι απενεργοποιημένη";
  if (product.supplierFulfilled) return product.available ? "Διαθέσιμο για αποστολή" : "Προσωρινά μη διαθέσιμο";
  if (product.localProof?.stockConfirmedToday) return "Σε τοπικό απόθεμα · επιβεβαιωμένο σήμερα";
  if (product.localProof?.freshLocalStock) return "Σε τοπικό απόθεμα";
  if (product.available) return "Διαθέσιμο από τοπικό κατάστημα";
  return "Προσωρινά μη διαθέσιμο";
}

const formatEuroMinor = (minor: number) => new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);

function usePublicCatalogMsrp(product: CatalogCardWithPreview, demoMode: boolean, active: boolean): number | undefined {
  const [msrpMinor, setMsrpMinor] = useState<number | undefined>();

  useEffect(() => {
    setMsrpMinor(undefined);
    if (!active || demoMode || !product.available || !product.vendorId || !Number.isSafeInteger(product.priceMinor) || product.priceMinor < 0) return;

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
  }, [active, demoMode, product.available, product.id, product.priceMinor, product.vendorId]);

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
  return <div className="price">
    {msrpMinor !== undefined ? <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
      <s aria-label={`Προτεινόμενη λιανική ${formatEuroMinor(msrpMinor)}`} style={{ fontSize: "0.72em", opacity: 0.62, fontWeight: 500 }}>ΠΛΤ {formatEuroMinor(msrpMinor)}</s>
      {!prominentSavings && savingLabel ? <span aria-label={`Όφελος ${savingLabel}% σε σχέση με την προτεινόμενη λιανική`} style={{ fontSize: "0.62em", fontWeight: 800, whiteSpace: "nowrap" }}>−{savingLabel}% vs ΠΛΤ</span> : null}
    </div> : null}
    <span aria-label={`Τελική τιμή ${formatEuroMinor(retailPriceMinor)}`}>{priceLabel}</span>
  </div>;
}

export function CatalogProductCard({ product, index = 0, vendorContext, demoVendorId }: {
  product: CatalogCardWithPreview;
  index?: number;
  vendorContext?: Readonly<{ name: string; adviser?: string }>;
  demoVendorId?: string;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const demoMode = Boolean(demoVendorId);

  useEffect(() => {
    if (nearViewport) return;
    const node = cardRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      setNearViewport(true);
      observer.disconnect();
    }, { rootMargin: "320px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [nearViewport]);

  const msrpMinor = usePublicCatalogMsrp(product, demoMode, nearViewport);
  const savingLabel = msrpMinor === undefined ? undefined : publicSavingsLabel(msrpMinor, product.priceMinor);
  const supplierFulfilled = product.supplierFulfilled === true;
  const highlightKind = product.priceHighlightKind ?? "msrp-savings";
  const prominentSavings = Boolean(savingLabel && (supplierFulfilled || highlightKind === "sale"));
  const publicPurchasable = product.available && product.priceMinor > 0 && Boolean(product.vendorId || vendorContext);

  // Standard customer shopping surfaces must never render a misleading card for a
  // canonical that has no positive selling price or no eligible fulfilment vendor.
  // Deliberate DEMO previews stay visible, while unavailable product detail routes
  // can still communicate their state separately when intentionally linked.
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
  const firstPartyImage = imageSrc.startsWith("/");
  const externalImage = governedSourceFallback || Boolean(imageSrc.startsWith("https://"));
  const productHref = demoVendorId
    ? `/demo/vendor/${encodeURIComponent(demoVendorId)}/product/${encodeURIComponent(product.slug || product.id)}`
    : productPublicPath(product);
  const priceLabel = publicCatalogPriceLabel(product);
  const brandLogoUrl = publicBrandLogoUrl(product.brandLogoObjectKey);

  return (
    <article className="product-card" ref={cardRef}>
      <Link href={productHref} className={`product-art ${category.artClass}`} aria-label={`Δες ${displayTitle}`}>
        {governedSourceFallback ? <span className="art-category">{category.name}</span> : null}
        {governedSourceFallback ? <span className="art-symbol" aria-hidden="true">{category.symbol}</span> : null}
        {governedSourceFallback ? <span className="art-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span> : null}
        {firstPartyImage ? (
          <Image
            src={imageSrc}
            alt={product.mediaAlt ?? displayTitle}
            fill
            sizes="(max-width: 620px) 50vw, (max-width: 1180px) 33vw, 280px"
            loading="lazy"
            style={catalogImageStyle}
          />
        ) : (
          <img
            src={imageSrc}
            alt={product.mediaAlt ?? displayTitle}
            loading="lazy"
            decoding="async"
            referrerPolicy={externalImage ? "no-referrer" : undefined}
            style={catalogImageStyle}
          />
        )}
        {prominentSavings && savingLabel ? (
          <span
            aria-label={highlightKind === "sale" ? `SALE, όφελος ${savingLabel}% έναντι ΠΛΤ` : `Όφελος ${savingLabel}% έναντι ΠΛΤ`}
            data-price-highlight-kind={highlightKind}
            style={{
              position: "absolute",
              zIndex: 3,
              top: 18,
              right: 18,
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
        ) : null}
      </Link>
      <div className="product-body">
        <div className="eyebrow">{product.categoryLabel ?? category.label}</div>
        {product.brand ? <div className="catalog-card-brand">
          {brandLogoUrl ? <img src={brandLogoUrl} alt="" aria-hidden="true" loading="lazy" decoding="async" onError={(event) => { event.currentTarget.hidden = true; }} /> : null}
          <span>{product.brand}</span>
        </div> : null}
        <h3><Link href={productHref}>{displayTitle}</Link></h3>
        <div className="product-bottom">
          <PublicCatalogPrice msrpMinor={msrpMinor} retailPriceMinor={product.priceMinor} priceLabel={priceLabel} savingLabel={savingLabel} prominentSavings={prominentSavings} />
          <Link className="round-add" href={productHref} aria-label={`Δες ${displayTitle}`}>→</Link>
        </div>
        <p className={`catalog-card-availability${product.available ? " is-available" : ""}`}>{availabilityLabel(product, demoMode)}</p>
        {supplierFulfilled ? <p className="catalog-card-vendor">Αποστολή μέσω συνεργαζόμενου προμηθευτή</p> : vendorName ? <p className="catalog-card-vendor">{vendorName}</p> : null}
        {!demoMode && !supplierFulfilled ? <LocalCommerceProof proof={product.localProof} compact /> : null}
      </div>
    </article>
  );
}
