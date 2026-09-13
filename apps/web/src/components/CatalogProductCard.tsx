import type { CatalogCard } from "../lib/catalog-view";
import type { LocalCommerceProof as LocalCommerceProofValue } from "../lib/local-commerce-proof";
import type { PriceHighlightKind } from "../lib/public-price-presentation";
import { CatalogProductCardClient, type CatalogProductCardClientProduct } from "./CatalogProductCardClient";

type CatalogProductCardSource = CatalogCard & Readonly<{
  previewImageSrc?: string;
  localProof?: LocalCommerceProofValue;
  supplierFulfilled?: boolean;
  priceHighlightKind?: PriceHighlightKind;
  msrpMinor?: number | null;
}>;

/**
 * Server boundary for catalogue cards.
 *
 * Product/detail enrichment contains fields the card never renders (descriptions,
 * GTINs, composition, sizes, etc.). Project only the visual fields across the
 * client boundary so a 30-card /shop response does not serialize the whole
 * catalogue payload into the RSC hydration stream.
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

  return <CatalogProductCardClient
    product={clientProduct}
    index={index}
    vendorContext={vendorContext}
    demoVendorId={demoVendorId}
  />;
}
