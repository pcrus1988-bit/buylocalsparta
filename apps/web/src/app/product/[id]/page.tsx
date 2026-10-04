import { resolveCatalogColor } from "@buy-local-sparta/core";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { getCatalogCard, getPublicProductSeoSummary } from "../../../lib/catalog-view";
import { getVisitorKey } from "../../../lib/visitor";
import { AddToCartButton } from "../../../components/AddToCartButton";
import { ProductAnalyticsTracker } from "../../../components/ProductAnalyticsTracker";
import { SiteHeader } from "../../../components/SiteHeader";
import { ProductAccountActions } from "../../../components/ProductAccountActions";
import { ProductDetailSections, type ProductDetailRow } from "../../../components/ProductDetailSections";
import { ProductSuitability } from "../../../components/ProductSuitability";
import { SportFitProductIntelligence } from "../../../components/SportFitProductIntelligence";
import { ProductVariantSelector } from "../../../components/ProductVariantSelector";
import { ProductVendorHumanCard } from "../../../components/ProductVendorHumanCard";
import { PublicPriceComparison } from "../../../components/PublicPriceComparison";
import { ProductBrandTitle } from "../../../components/ProductBrandTitle";
import { storefrontCategoryForCode } from "../../../lib/storefront-taxonomy";
import { SiteFooter } from "../../../components/SiteFooter";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { buildGovernedSeoMetadata } from "../../../lib/seo-metadata";
import { productPublicPath } from "../../../lib/product-url";
import { productIndexEligibility } from "../../../lib/seo-visibility-policy";
import { getCrawlerCatalogCard } from "../../../lib/crawler-catalog";
import { isReadOnlyPublicCrawlerRequest } from "../../../lib/request-audience";
import { getPublicProductDetail, type PublicTechnicalAttribute } from "../../../lib/public-product-detail";
import { getPublicProductSuitability, isPublicSuitabilityAttribute } from "../../../lib/public-product-suitability";
import { getPublicProductVariantOptions } from "../../../lib/public-product-variants";
import { approvedCatalogImageGallery } from "../../../lib/public-product-media-gallery";
import { isCompatibilityPresentationKey, plausibleProductManualUrl } from "../../../lib/product-presentation-guards";
import { publicCatalogHasOfferPrice, publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../../../lib/public-data-integrity";
import { getPublicDropshipPresentation } from "../../../lib/public-dropship-presentation";

type ProductPageProps = Readonly<{ params: Promise<{ id: string }> }>;

const productImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "cover",
  objectPosition: "center",
  padding: 0,
  background: "transparent",
  transform: "scale(1.09)",
  transformOrigin: "center",
  zIndex: 1
} as const;

const thumbnailImageStyle = {
  objectFit: "cover",
  objectPosition: "center",
  transform: "scale(1.09)",
  transformOrigin: "center"
} as const;

function ProductColorIndicator({ value }: { value?: string }) {
  const source = value?.trim();
  if (!source) return null;
  const resolved = resolveCatalogColor(source);
  const label = resolved?.displayNameEl ?? source;
  const swatchStyle = resolved?.swatchKind === "multicolor"
    ? { background: "conic-gradient(#D52B2B, #F2C230, #388A55, #2F6DA8, #68478D, #D52B2B)" }
    : resolved?.swatchKind === "transparent"
      ? {
          background: "linear-gradient(45deg, #ffffff 25%, #d7d7d2 25% 50%, #ffffff 50% 75%, #d7d7d2 75%)",
          backgroundSize: "8px 8px"
        }
      : { background: resolved?.hex ?? "transparent" };

  return (
    <div
      aria-label={`Χρώμα ${label}`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        width: "fit-content",
        marginTop: 12,
        padding: "8px 12px",
        border: "1px solid var(--line)",
        borderRadius: 999
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 22,
          height: 22,
          flex: "0 0 22px",
          borderRadius: "50%",
          border: "1px solid rgba(0,0,0,.18)",
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,.45)",
          ...swatchStyle
        }}
      />
      <span style={{ display: "grid", lineHeight: 1.15 }}>
        <small style={{ color: "var(--ink-soft)", fontSize: 11 }}>Χρώμα</small>
        <strong style={{ fontSize: 14 }}>{label}</strong>
      </span>
    </div>
  );
}

const PRIVATE_TECHNICAL_ATTRIBUTE_KEYS = new Set([
  "source",
  "source_id",
  "source_code",
  "source_name",
  "source_slug",
  "source_key",
  "source_domain",
  "source_website",
  "source_product_key",
  "catalog_source",
  "catalog_source_id",
  "catalog_source_code",
  "catalog_source_name",
  "crawler_source",
  "variant_code",
  "variant_label",
  "supplier_code",
  "supplier_sku",
  "supplier_product_code",
  "supplier_content",
  "suppliercontent",
  "supplier_id",
  "external_product_id",
  "externalproductid",
  "external_variant_id",
  "externalvariantid",
  "external_sku",
  "externalsku",
  "image_url",
  "imageurl",
  "image_count",
  "imagecount",
  "categories",
  "feature_keys",
  "dimensions_source_text",
  "technical_details_text",
  "raw_payload",
  "normalized_payload",
  "source_payload"
]);

const GENERATED_TECHNICAL_DESCRIPTION_MARKER = "Κύρια διακριτικά/τεχνικά χαρακτηριστικά:";

function normalizedTechnicalKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function withUnit(value: string, unit: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return new RegExp(`(?:^|\\s)${unit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i").test(trimmed)
    ? trimmed
    : `${trimmed} ${unit}`;
}

function isMeaninglessSize(value: string): boolean {
  return /^(?:o\/?s|os|one\s*size|one-size)$/i.test(value.trim());
}

function presentTechnicalAttribute(attribute: PublicTechnicalAttribute): PublicTechnicalAttribute | undefined {
  const key = normalizedTechnicalKey(attribute.key);
  const label = attribute.label.trim();
  const value = attribute.value.trim();
  if (!key || !value) return undefined;
  if (PRIVATE_TECHNICAL_ATTRIBUTE_KEYS.has(key)
    || key.startsWith("source_")
    || key.startsWith("catalog_source_")
    || key.startsWith("crawl_source_")
    || key.startsWith("raw_")
    || key.startsWith("import_")
    || key.startsWith("ingestion_")
    || key.endsWith("_source_text")) return undefined;

  if (key === "weight_g" || key === "weightg") return { ...attribute, key: "weight_g", label: "Βάρος", value: withUnit(value, "g") };
  if (key === "capacity_l" || key === "capacityl") return { ...attribute, key: "capacity_l", label: "Χωρητικότητα", value: withUnit(value, "L") };
  if (key === "color" || key === "colour" || key === "χρωμα") {
    return { ...attribute, key: "color", label: "Χρώμα", value: resolveCatalogColor(value)?.displayNameEl ?? value };
  }
  if (key === "size" || key === "sizes" || key === "μεγεθος") {
    if (isMeaninglessSize(value)) return undefined;
    return { ...attribute, key: "size", label: "Μέγεθος", value };
  }
  return { ...attribute, key, label: label || attribute.key, value };
}

function publicTechnicalAttributes(attributes: readonly PublicTechnicalAttribute[]): readonly PublicTechnicalAttribute[] {
  const byKey = new Map<string, PublicTechnicalAttribute>();
  for (const attribute of attributes) {
    const presented = presentTechnicalAttribute(attribute);
    if (!presented || byKey.has(presented.key)) continue;
    byKey.set(presented.key, presented);
  }
  return [...byKey.values()];
}

function customerTechnicalAttributes(attributes: readonly PublicTechnicalAttribute[]): readonly PublicTechnicalAttribute[] {
  return attributes.filter((attribute) => !isCompatibilityPresentationKey(attribute.key));
}

function isLikelySportFootwear(product: Readonly<{ title: string; categoryCode?: string; categoryLabel?: string }>): boolean {
  const text = [product.title, product.categoryCode, product.categoryLabel]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("el-GR");
  return /(running|sneaker|shoe|footwear|boot|trainer|hiking|trail|basketball|tennis|padel|volleyball|handball|badminton|football|soccer|παπουτσ|υποδημ)/iu.test(text);
}

function isPackagingAttribute(attribute: PublicTechnicalAttribute): boolean {
  const key = normalizedTechnicalKey(attribute.key);
  const label = attribute.label.trim().toLocaleLowerCase("el");
  return key === "pack_qty"
    || key.startsWith("package_")
    || key.startsWith("packaging_")
    || key.includes("carton")
    || key.includes("package")
    || key.includes("packaging")
    || label.includes("συσκευασ")
    || label.includes("κιβώτι");
}

function productDisplayDescription(input: Readonly<{
  canonicalDescription?: string;
  sourceDescription?: string;
  technicalAttributes: readonly PublicTechnicalAttribute[];
}>): string | undefined {
  const canonical = input.canonicalDescription?.trim();
  if (!canonical) return input.sourceDescription?.trim() || undefined;
  const markerIndex = canonical.indexOf(GENERATED_TECHNICAL_DESCRIPTION_MARKER);
  if (markerIndex < 0) return canonical;

  const intro = publicCatalogueTitleLabel(canonical.slice(0, markerIndex).trim());
  const facts = input.technicalAttributes
    .slice(0, 6)
    .map((attribute) => `${attribute.label}: ${attribute.value}`)
    .join(" · ");
  if (facts) return `${intro} Βασικά στοιχεία: ${facts}.`.trim();
  return intro || input.sourceDescription?.trim() || undefined;
}

function productSeoDescription(product: { title: string; description?: string; supplierFulfilled?: boolean }): string {
  const fallback = product.supplierFulfilled
    ? `${product.title} στο ΚΟΝΤΑ ΜΟΥ — διαθεσιμότητα συνεργαζόμενου προμηθευτή και ασφαλής ενιαία εμπειρία αγοράς.`
    : `${product.title} στο ΚΟΝΤΑ ΜΟΥ Sparta — τοπική διαθεσιμότητα, πραγματική συμβουλή και ασφαλής ενιαία εμπειρία αγοράς.`;
  const description = product.description?.replace(/\s+/g, " ").trim() || fallback;
  return description.length <= 160 ? description : `${description.slice(0, 157).trimEnd()}…`;
}

function gtinSchema(gtin: string | undefined): Record<string, string> {
  if (!gtin || !/^\d+$/.test(gtin)) return {};
  if (gtin.length === 8) return { gtin8: gtin };
  if (gtin.length === 12) return { gtin12: gtin };
  if (gtin.length === 13) return { gtin13: gtin };
  if (gtin.length === 14) return { gtin14: gtin };
  return {};
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const [product, { settings }, overrides] = await Promise.all([
    getPublicProductSeoSummary(id),
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot()
  ]);
  if (!product) return { title: "Προϊόν" };
  const metadataCrawler = await isReadOnlyPublicCrawlerRequest();
  if (metadataCrawler) {
    const crawlerDetail = product.sourceImageAvailable ? await getPublicProductDetail(product.id) : undefined;
    const displayTitle = publicCatalogueTitleLabel(product.title);
    const quality = productIndexEligibility(product);
    const description = productSeoDescription({ title: displayTitle, description: product.description });
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    return buildGovernedSeoMetadata({
      reference,
      settings,
      override: findSeoEntityOverride(overrides.entries, reference),
      defaults: {
        title: displayTitle,
        description,
        canonicalPath: productPublicPath(product),
        keywords: [displayTitle, product.brand, product.categoryLabel],
        openGraphImage: product.mediaId
          ? `/api/media/${encodeURIComponent(product.mediaId)}`
          : crawlerDetail?.sourceImageUrl
            ?? (product.sourceImageAvailable
              ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
              : undefined)
      },
      entityEligible: quality.blockingReasons.length === 0,
      defaultIndexAllowed: quality.eligible
    });
  }
  const [detail, dropshipPresentation] = await Promise.all([
    getPublicProductDetail(product.id),
    getPublicDropshipPresentation(product.id, null)
  ]);
  const isDropship = Boolean(dropshipPresentation);
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const technicalAttributes = publicTechnicalAttributes(detail?.technicalAttributes ?? []);
  const metadataTechnicalAttributes = dropshipPresentation?.fields.technicalAttributes === false
    ? []
    : customerTechnicalAttributes(technicalAttributes).filter((attribute) => {
        const key = normalizedTechnicalKey(attribute.key);
        if (dropshipPresentation?.fields.model === false && key === "model") return false;
        if (dropshipPresentation?.fields.mpn === false && (key === "mpn" || key === "manufacturer_code")) return false;
        if (dropshipPresentation?.fields.gtin === false && (key === "gtin" || key === "ean" || key === "barcode")) return false;
        return true;
      });
  const displayDescription = productDisplayDescription({
    canonicalDescription: product.description,
    sourceDescription: detail?.description,
    technicalAttributes: metadataTechnicalAttributes
  });
  const quality = productIndexEligibility(product);
  const description = productSeoDescription({ title: displayTitle, description: displayDescription, supplierFulfilled: isDropship });
  const reference: SeoEntityReference = { kind: "product", id: product.id };
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: displayTitle,
      description,
      canonicalPath: productPublicPath(product),
      keywords: [
        displayTitle,
        isDropship ? undefined : `${displayTitle} Σπάρτη`,
        product.brand,
        product.categoryLabel,
        product.categoryLabel && !isDropship ? `${product.categoryLabel} Σπάρτη` : undefined
      ],
      openGraphImage: product.mediaId
        ? `/api/media/${encodeURIComponent(product.mediaId)}`
        : detail?.sourceImageUrl
          ?? (product.sourceImageAvailable
            ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
            : undefined)
    },
    entityEligible: quality.blockingReasons.length === 0,
    defaultIndexAllowed: quality.eligible
  });
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id: routeKey } = await params;
  const summary = await getPublicProductSeoSummary(routeKey);
  if (!summary) notFound();
  if (routeKey !== summary.slug) permanentRedirect(productPublicPath(summary));

  const readOnlyCrawler = await isReadOnlyPublicCrawlerRequest();
  const [{ settings }, overrides] = await Promise.all([getSeoGlobalSettingsSnapshot(), getSeoEntityOverridesSnapshot()]);
  const crawlerProduct = readOnlyCrawler
    ? await getCrawlerCatalogCard(summary.id).catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "seo.product_crawler_projection_degraded",
          productId: summary.id,
          message: error instanceof Error ? error.message : String(error)
        }));
        return undefined;
      })
    : undefined;
  const product = readOnlyCrawler
    ? crawlerProduct ?? {
        id: summary.id,
        slug: summary.slug,
        title: summary.title,
        price: summary.price,
        priceMinor: summary.priceMinor,
        categoryCode: summary.categoryCode,
        departmentCode: summary.departmentCode,
        categoryLabel: summary.categoryLabel,
        gtin: summary.gtin,
        mpn: summary.mpn,
        description: summary.description,
        brand: summary.brand,
        color: summary.color,
        sizes: summary.sizes,
        mediaId: summary.mediaId,
        mediaAlt: summary.mediaAlt,
        sourceImageAvailable: summary.sourceImageAvailable,
        availableToSell: 0,
        available: false
      }
    : await getCatalogCard(summary.id, await getVisitorKey());
  if (!product) notFound();

  const displayTitle = publicCatalogueTitleLabel(product.title);

  if (readOnlyCrawler) {
    const category = storefrontCategoryForCode(product.categoryCode, product.departmentCode);
    const reference: SeoEntityReference = { kind: "product", id: product.id };
    const override = findSeoEntityOverride(overrides.entries, reference);
    const quality = productIndexEligibility(summary);
    const seoControl = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: quality.blockingReasons.length === 0,
      defaultIndexAllowed: quality.eligible,
      defaultSchemaAllowed: true,
      override
    });
    const origin = settings.canonicalOrigin;
    const productUrl = new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString();
    const categoryUrl = `${origin}/category/${category.slug}`;
    const displayPrice = publicCatalogPriceLabel(product);
    const crawlerDetail = summary.sourceImageAvailable ? await getPublicProductDetail(product.id) : undefined;
    const crawlerImageUrl = product.mediaId
      ? `${origin}/api/media/${encodeURIComponent(product.mediaId)}`
      : crawlerDetail?.sourceImageUrl
        ?? (summary.sourceImageAvailable
          ? `${origin}/api/catalog-source-image/${encodeURIComponent(product.id)}`
          : undefined);
    const crawlerStructuredData = {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Product",
          "@id": `${productUrl}#product`,
          url: productUrl,
          name: displayTitle,
          description: productSeoDescription({ title: displayTitle, description: product.description }),
          brand: product.brand ? { "@type": "Brand", name: product.brand } : undefined,
          image: crawlerImageUrl ? [crawlerImageUrl] : undefined,
          category: product.categoryLabel ?? category.label,
          itemCondition: "https://schema.org/NewCondition",
          offers: publicCatalogHasOfferPrice(product) ? {
            "@type": "Offer",
            url: productUrl,
            priceCurrency: "EUR",
            price: (product.priceMinor / 100).toFixed(2),
            availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
            seller: { "@type": "Organization", "@id": `${origin}/#organization`, name: "ΚΟΝΤΑ ΜΟΥ", url: origin }
          } : undefined
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Αρχική", item: origin },
            { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl },
            { "@type": "ListItem", position: 3, name: displayTitle, item: productUrl }
          ]
        }
      ]
    };
    return (
      <main>
        {seoControl.schemaAllowed ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(crawlerStructuredData).replaceAll("<", "\\u003c") }} /> : null}
        <div className="announcement">ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου</div>
        <SiteHeader compact />
        <section className="shell product-detail">
          <div className={`product-detail-art ${crawlerImageUrl ? "product-detail-art--media " : ""}${category.artClass}`}>
            {crawlerImageUrl ? <img src={crawlerImageUrl} alt={product.mediaAlt ?? displayTitle} loading="eager" fetchPriority="high" style={productImageStyle} /> : <>
              <span className="detail-category">{category.name}</span>
              <span className="detail-symbol" aria-hidden="true">{category.symbol}</span>
            </>}
            <span className="product-badge">{product.available ? "Διαθέσιμο" : "Προσωρινά μη διαθέσιμο"}</span>
          </div>
          <div className="product-detail-copy">
            <div className="eyebrow"><a href={`/category/${category.slug}`}>{category.label}</a></div>
            <ProductBrandTitle title={displayTitle} brand={product.brand} logoObjectKey={product.brandLogoObjectKey} />
            <ProductColorIndicator value={product.color} />
            <div className="purchase-card" style={{ marginTop: 18 }}>
              <div>
                <div className="eyebrow">Τιμή & διαθεσιμότητα</div>
                <strong>{publicCatalogHasOfferPrice(product) ? displayPrice : "Τιμή μη διαθέσιμη"}</strong>
                <span>{product.available ? "Διαθέσιμο για αγορά." : "Προσωρινά μη διαθέσιμο."}</span>
              </div>
            </div>
            {product.description ? <section style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              <div className="eyebrow">Περιγραφή προϊόντος</div>
              <p style={{ whiteSpace: "pre-line", marginTop: 10 }}>{product.description}</p>
            </section> : null}
          </div>
        </section>
        <SiteFooter />
      </main>
    );
  }

  const [detail, approvedGallery, variantOptions, dropshipPresentation] = await Promise.all([
    getPublicProductDetail(product.id),
    approvedCatalogImageGallery({ canonicalVariantId: product.id, preferredVendorId: product.vendorId }),
    getPublicProductVariantOptions(product.id),
    getPublicDropshipPresentation(product.id, product.vendorId)
  ]);
  const isDropship = Boolean(dropshipPresentation);
  const publicFields = dropshipPresentation?.fields;
  const mediaGallery = approvedGallery.length
    ? approvedGallery
    : product.mediaId
      ? [{ canonicalVariantId: product.id, mediaId: product.mediaId, altText: product.mediaAlt }]
      : [];
  const primaryImage = mediaGallery[0];
  const sourceImageGallery = primaryImage ? [] : detail?.sourceImageUrls ?? [];
  // Prefer trusted approved source URLs directly when media is source-hosted
  // instead of forcing every product view through a database-backed image proxy.
  const supplierImageSrc = primaryImage
    ? undefined
    : product.previewImageSrc
      ?? sourceImageGallery[0]
      ?? (summary.sourceImageAvailable
        ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
        : undefined);
  const hasProductImage = Boolean(primaryImage || supplierImageSrc);
  const cartImageUrl = primaryImage ? `/api/media/${encodeURIComponent(primaryImage.mediaId)}` : supplierImageSrc;
  const technicalAttributes = publicTechnicalAttributes(detail?.technicalAttributes ?? []);
  const suitability = await getPublicProductSuitability(product.id, technicalAttributes);
  const storefrontTechnicalAttributes = publicFields?.technicalAttributes === false
    ? []
    : customerTechnicalAttributes(technicalAttributes).filter((attribute) => {
        const key = normalizedTechnicalKey(attribute.key);
        if (publicFields?.model === false && key === "model") return false;
        if (publicFields?.mpn === false && (key === "mpn" || key === "manufacturer_code")) return false;
        if (publicFields?.gtin === false && (key === "gtin" || key === "ean" || key === "barcode")) return false;
        return true;
      });
  const packagingAttributes = storefrontTechnicalAttributes.filter(isPackagingAttribute);
  const displayBrand = product.brand ?? detail?.brand;
  const displayModel = publicFields?.model === false ? undefined : detail?.model;
  const displayMpn = publicFields?.mpn === false ? undefined : product.mpn;
  const displayGtin = publicFields?.gtin === false ? undefined : product.gtin ?? detail?.sourceGtin;
  const legacySupplierCode = detail?.supplierCode && detail.supplierCode !== product.mpn ? detail.supplierCode : undefined;
  const displaySupplierSku = dropshipPresentation
    ? undefined
    : legacySupplierCode;
  const displayPrice = publicCatalogPriceLabel(product);
  const displayColor = product.color ? resolveCatalogColor(product.color)?.displayNameEl ?? product.color : undefined;
  const meaningfulSizes = product.sizes.filter((size) => !isMeaninglessSize(size));
  const explicitTechnicalKeys = new Set([
    displayBrand ? "brand" : "",
    displayModel ? "model" : "",
    displayMpn ? "mpn" : "",
    displayGtin ? "gtin" : "",
    displayGtin ? "ean" : "",
    displayGtin ? "barcode" : "",
    product.categoryLabel ? "category" : "",
    displayColor ? "color" : "",
    meaningfulSizes.length ? "size" : "",
    product.fit ? "fit" : "",
    product.composition ? "composition" : "",
    product.madeIn ? "made_in" : ""
  ].filter(Boolean));
  const productTechnicalAttributes = storefrontTechnicalAttributes
    .filter((attribute) => !isPackagingAttribute(attribute))
    .filter((attribute) => !isPublicSuitabilityAttribute(attribute))
    .filter((attribute) => !explicitTechnicalKeys.has(attribute.key));
  const displayDescription = productDisplayDescription({
    canonicalDescription: product.description,
    sourceDescription: detail?.description,
    technicalAttributes: storefrontTechnicalAttributes
  });
  const manualUrl = plausibleProductManualUrl(detail?.manualUrl);
  const technicalRows = [
    displayBrand ? { key: "brand", label: "Μάρκα", value: displayBrand } : undefined,
    displayModel ? { key: "model", label: "Μοντέλο", value: displayModel } : undefined,
    displayMpn ? { key: "mpn", label: "Κωδικός κατασκευαστή", value: displayMpn } : undefined,
    displayGtin ? { key: "gtin", label: "GTIN / EAN", value: displayGtin } : undefined,
    product.categoryLabel ? { key: "category", label: "Κατηγορία", value: product.categoryLabel } : undefined,
    displayColor ? { key: "color", label: "Χρώμα", value: displayColor } : undefined,
    meaningfulSizes.length ? { key: "size", label: "Μέγεθος", value: meaningfulSizes.join(" · ") } : undefined,
    product.fit ? { key: "fit", label: "Εφαρμογή", value: product.fit } : undefined,
    product.composition ? { key: "composition", label: "Σύνθεση", value: product.composition } : undefined,
    product.madeIn ? { key: "made-in", label: "Κατασκευή", value: product.madeIn === "Greece" ? "Ελλάδα" : product.madeIn } : undefined,
    ...productTechnicalAttributes.map((attribute) => ({ key: `technical-${attribute.key}`, label: attribute.label, value: attribute.value }))
  ].filter((row): row is ProductDetailRow => Boolean(row));
  const packagingRows: ProductDetailRow[] = packagingAttributes.map((attribute) => ({
    key: `packaging-${attribute.key}`,
    label: attribute.label,
    value: attribute.value
  }));

  const variantValues = new Map<string, Set<string>>();
  for (const option of variantOptions) {
    for (const attribute of option.attributes) {
      const values = variantValues.get(attribute.kind) ?? new Set<string>();
      values.add(attribute.value);
      variantValues.set(attribute.kind, values);
    }
  }
  const varyingVariantKinds = new Set([...variantValues.entries()].filter(([, values]) => values.size > 1).map(([kind]) => kind));
  const varyingVariantKeys = new Set(variantOptions.flatMap((option) => option.attributes.filter((attribute) => varyingVariantKinds.has(attribute.kind)).map((attribute) => attribute.key)));
  const variantDimensionLabels = [...new Set(variantOptions.flatMap((option) => option.attributes.filter((attribute) => varyingVariantKinds.has(attribute.kind)).map((attribute) => attribute.label)))];
  const variantSelectorTitle = variantDimensionLabels.length === 1 ? variantDimensionLabels[0] : "Επιλογή παραλλαγής";

  const reference: SeoEntityReference = { kind: "product", id: product.id };
  const override = findSeoEntityOverride(overrides.entries, reference);
  const quality = productIndexEligibility(summary);
  const seoControl = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible: quality.blockingReasons.length === 0, defaultIndexAllowed: quality.eligible, defaultSchemaAllowed: true, override });
  const category = storefrontCategoryForCode(product.categoryCode, product.departmentCode);
  const origin = settings.canonicalOrigin;
  const productUrl = new URL(override?.canonicalPath ?? productPublicPath(product), `${origin}/`).toString();
  const categoryUrl = `${origin}/category/${category.slug}`;
  const sellerOfRecord = {
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: "ΚΟΝΤΑ ΜΟΥ",
    legalName: "SP BUSINESS LAB – ΠΟΛΙΑΚΟΦ ΣΤΑΝΙΣΛΑΒ",
    url: origin
  } as const;
  const offerData = {
    "@type": "Offer",
    url: productUrl,
    priceCurrency: "EUR",
    price: (product.priceMinor / 100).toFixed(2),
    availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    seller: { "@id": `${origin}/#organization` },
    availableAtOrFrom: !isDropship && product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined
  };
  const structuredOfferData = publicCatalogHasOfferPrice(product) ? offerData : undefined;
  const structuredImages = mediaGallery.length
    ? mediaGallery.map((image) => `${origin}/api/media/${encodeURIComponent(image.mediaId)}`)
    : sourceImageGallery.length
      ? sourceImageGallery.map((src) => new URL(src, `${origin}/`).toString())
      : supplierImageSrc ? [new URL(supplierImageSrc, `${origin}/`).toString()] : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      sellerOfRecord,
      {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        url: productUrl,
        mainEntityOfPage: productUrl,
        name: displayTitle,
        description: productSeoDescription({ title: displayTitle, description: displayDescription, supplierFulfilled: isDropship }),
        sku: displayMpn ?? displaySupplierSku,
        mpn: displayMpn,
        ...gtinSchema(displayGtin),
        brand: displayBrand ? { "@type": "Brand", name: displayBrand } : undefined,
        image: structuredImages,
        category: product.categoryLabel ?? category.label,
        color: displayColor ?? product.color,
        size: meaningfulSizes.length ? meaningfulSizes.join(", ") : undefined,
        additionalProperty: storefrontTechnicalAttributes.length ? storefrontTechnicalAttributes.map((attribute) => ({ "@type": "PropertyValue", name: attribute.label, value: attribute.value })) : undefined,
        itemCondition: "https://schema.org/NewCondition",
        offers: structuredOfferData
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: origin },
          { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl },
          { "@type": "ListItem", position: 3, name: displayTitle, item: productUrl }
        ]
      }
    ]
  };

  return (
    <main>
      {!readOnlyCrawler ? <ProductAnalyticsTracker canonicalVariantId={product.id} /> : null}
      {seoControl.schemaAllowed ? <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }} /> : null}
      <div className="announcement">ΚΟΝΤΑ ΜΟΥ: Η Σπάρτη δίπλα σου</div>
      <SiteHeader compact />

      <section className="shell product-detail">
        <div style={{ display: "grid", gap: 12, alignSelf: "start" }}>
          <div className={`product-detail-art ${hasProductImage ? "product-detail-art--media " : ""}${category.artClass}`}>
            {!hasProductImage ? <span className="detail-category">{category.name}</span> : null}
            {!hasProductImage ? <span className="detail-symbol" aria-hidden="true">{category.symbol}</span> : null}
            {primaryImage ? <Image src={`/api/media/${encodeURIComponent(primaryImage.mediaId)}`} alt={primaryImage.altText ?? displayTitle} fill sizes="(max-width: 900px) 100vw, 48vw" priority style={productImageStyle} /> : supplierImageSrc ? <img src={supplierImageSrc} alt={displayTitle} loading="eager" fetchPriority="high" style={productImageStyle} /> : null}
            <span className="product-badge">{product.available ? (isDropship ? "Διαθέσιμο για αποστολή" : "Σε τοπικό απόθεμα") : "Προσωρινά μη διαθέσιμο"}</span>
          </div>
          {mediaGallery.length > 1 ? (
            <div aria-label="Επιπλέον φωτογραφίες προϊόντος" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {mediaGallery.slice(1).map((image) => (
                <div key={image.mediaId} style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 14, background: "var(--white)" }}>
                  <Image src={`/api/media/${encodeURIComponent(image.mediaId)}`} alt={image.altText ?? displayTitle} fill sizes="(max-width: 620px) 22vw, 11vw" style={thumbnailImageStyle} />
                </div>
              ))}
            </div>
          ) : sourceImageGallery.length > 1 ? (
            <div aria-label="Επιπλέον φωτογραφίες προϊόντος" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {sourceImageGallery.slice(1).map((src, index) => (
                <div key={src} style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 14, background: "var(--white)" }}>
                  <img src={src} alt={`${displayTitle} · ${index + 2}`} loading="lazy" decoding="async" referrerPolicy="no-referrer" style={{ width: "100%", height: "100%", ...thumbnailImageStyle }} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`/category/${category.slug}`}>{category.label}</a>{product.categoryLabel ? <> · <a href={`/shop?category=${category.slug}&subcategory=${encodeURIComponent(product.categoryCode)}`}>{product.categoryLabel}</a></> : null}{isDropship ? " · Αποστολή πανελλαδικά" : " · Sparta 23100"}</div>
          <ProductBrandTitle title={displayTitle} brand={displayBrand} logoObjectKey={product.brandLogoObjectKey} />

          <ProductVariantSelector currentVariantId={product.id} title={variantSelectorTitle} options={variantOptions} varyingKeys={varyingVariantKeys} />
          <ProductColorIndicator value={product.color} />

          {isLikelySportFootwear(product) ? (
            <SportFitProductIntelligence
              productId={product.id}
              vendorId={product.vendorId}
              title={displayTitle}
              brand={displayBrand}
              imageSrc={cartImageUrl}
              sizes={meaningfulSizes}
              availableToSell={product.availableToSell}
            />
          ) : null}

          <div className="purchase-card" style={{ marginTop: 18 }}>
            <div>
              <div className="eyebrow">Τιμή & διαθεσιμότητα</div>
              <PublicPriceComparison productId={product.id} vendorId={product.vendorId} retailPriceMinor={product.priceMinor} retailLabel={displayPrice} comparisonEnabled={!readOnlyCrawler} />
              <strong>{product.available ? `${product.availableToSell} τεμ. διαθέσιμα` : "Προσωρινά μη διαθέσιμο"}</strong>
            </div>
            <div className="purchase-actions">
              {readOnlyCrawler ? <button className="button" type="button" disabled={!product.available}>{product.available ? "Προσθήκη στο καλάθι" : "Μη διαθέσιμο"}</button> : <><AddToCartButton product={{
                id: product.id,
                title: displayTitle,
                priceMinor: product.priceMinor,
                price: product.price,
                available: product.available,
                imageUrl: cartImageUrl,
                imageAlt: primaryImage?.altText ?? displayTitle,
                sku: displayMpn ?? displaySupplierSku,
                gtin: displayGtin,
                color: displayColor,
                size: meaningfulSizes.length === 1 ? meaningfulSizes[0] : undefined
              }} /><ProductAccountActions productId={product.id} /></>}
            </div>
          </div>

          {displayDescription ? (
            <section className="product-description-compact">
              <div className="eyebrow">Περιγραφή προϊόντος</div>
              <p>{displayDescription}</p>
            </section>
          ) : null}

          {!isDropship ? <ProductVendorHumanCard productId={product.id} vendorId={product.vendorId} vendorName={product.vendorName} adviser={product.adviser} /> : null}

          <ProductSuitability suitability={suitability} />

          <ProductDetailSections technicalRows={technicalRows} packagingRows={packagingRows} />

          {manualUrl ? <div className="vendor-card"><div><span className="vendor-avatar">PDF</span></div><div><div className="eyebrow">Εγχειρίδιο / οδηγίες</div><strong>Επίσημο εγχειρίδιο προϊόντος</strong><p>Άνοιξε το εγχειρίδιο του προϊόντος σε νέα καρτέλα.</p><div className="vendor-actions"><a className="button button-secondary" href={manualUrl} target="_blank" rel="noopener noreferrer">Άνοιγμα εγχειριδίου (PDF)</a></div></div></div> : null}

          {!isDropship ? <details style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>Πώς λειτουργούν η τιμή και η επιλογή καταστήματος</summary>
            <div className="detail-assurances" style={{ marginTop: 12 }}>
              <div><strong>Ένα προϊόν, μία επιλογή κάθε φορά</strong><span>Το ίδιο προϊόν δεν εμφανίζεται ως λίστα ανταγωνιστικών καταστημάτων. Η πλατφόρμα κατανέμει ισότιμα την έκθεση μεταξύ επιλέξιμων τοπικών vendors.</span></div>
              <div><strong>Η τιμή είναι του καταστήματος</strong><span>Για διαθέσιμα προϊόντα η τιμή που βλέπει ο πελάτης είναι η τελική τιμή του συγκεκριμένου offer, χωρίς product markup από το ΚΟΝΤΑ ΜΟΥ.</span></div>
              <div><strong>Σταθερή ανάθεση</strong><span>Για πραγματικό πελάτη, όσο το offer παραμένει επιλέξιμο, κρατάμε το ίδιο κατάστημα και την ίδια τιμή σε αναζήτηση, προϊόν και καλάθι.</span></div>
            </div>
          </details> : null}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
