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
import { ProductVariantSelector } from "../../../components/ProductVariantSelector";
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
import { getPublicProductVariantOptions } from "../../../lib/public-product-variants";
import { approvedCatalogImageGallery } from "../../../lib/public-product-media-gallery";
import { publicCatalogHasOfferPrice, publicCatalogPriceLabel, publicCatalogueTitleLabel } from "../../../lib/public-data-integrity";

type ProductPageProps = Readonly<{ params: Promise<{ id: string }> }>;

const productImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  padding: "18px",
  background: "#fff",
  zIndex: 1
} as const;

const thumbnailImageStyle = {
  objectFit: "contain"
} as const;

const PRIVATE_SOURCE_ATTRIBUTE_KEYS = new Set([
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
  "crawler_source"
]);

const GENERATED_TECHNICAL_DESCRIPTION_MARKER = "Κύρια διακριτικά/τεχνικά χαρακτηριστικά:";

function publicTechnicalAttributes(attributes: readonly PublicTechnicalAttribute[]): readonly PublicTechnicalAttribute[] {
  return attributes.filter((attribute) => {
    const key = attribute.key.trim().toLowerCase();
    return !PRIVATE_SOURCE_ATTRIBUTE_KEYS.has(key)
      && !key.startsWith("source_")
      && !key.startsWith("catalog_source_")
      && !key.startsWith("crawl_source_");
  });
}

function isPackagingAttribute(attribute: PublicTechnicalAttribute): boolean {
  const key = attribute.key.trim().toLowerCase();
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

function productSeoDescription(product: { title: string; description?: string }): string {
  const description = product.description?.replace(/\s+/g, " ").trim()
    || `${product.title} στο ΚΟΝΤΑ ΜΟΥ Sparta — τοπική διαθεσιμότητα, πραγματική συμβουλή και ασφαλής ενιαία εμπειρία αγοράς.`;
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
  const detail = await getPublicProductDetail(product.id);
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const technicalAttributes = publicTechnicalAttributes(detail?.technicalAttributes ?? []);
  const displayDescription = productDisplayDescription({
    canonicalDescription: product.description,
    sourceDescription: detail?.description,
    technicalAttributes
  });
  const quality = productIndexEligibility(product);
  const description = productSeoDescription({ title: displayTitle, description: displayDescription });
  const reference: SeoEntityReference = { kind: "product", id: product.id };
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: displayTitle,
      description,
      canonicalPath: productPublicPath(product),
      openGraphImage: product.mediaId
        ? `/api/media/${encodeURIComponent(product.mediaId)}`
        : detail?.sourceImageUrl
          ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
          : undefined
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
  const product = readOnlyCrawler
    ? await getCrawlerCatalogCard(summary.id)
    : await getCatalogCard(summary.id, await getVisitorKey());
  if (!product) notFound();

  const displayTitle = publicCatalogueTitleLabel(product.title);
  const [detail, approvedGallery, variantOptions] = await Promise.all([
    getPublicProductDetail(product.id),
    approvedCatalogImageGallery({ canonicalVariantId: product.id, preferredVendorId: product.vendorId }),
    getPublicProductVariantOptions(product.id)
  ]);
  const mediaGallery = approvedGallery.length
    ? approvedGallery
    : product.mediaId
      ? [{ canonicalVariantId: product.id, mediaId: product.mediaId, altText: product.mediaAlt }]
      : [];
  const primaryImage = mediaGallery[0];
  const supplierImageSrc = primaryImage || !detail?.sourceImageUrl
    ? undefined
    : `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
  const hasProductImage = Boolean(primaryImage || supplierImageSrc);
  const technicalAttributes = publicTechnicalAttributes(detail?.technicalAttributes ?? []);
  const packagingAttributes = technicalAttributes.filter(isPackagingAttribute);
  const productTechnicalAttributes = technicalAttributes.filter((attribute) => !isPackagingAttribute(attribute));
  const displayDescription = productDisplayDescription({
    canonicalDescription: product.description,
    sourceDescription: detail?.description,
    technicalAttributes
  });
  const displayBrand = product.brand ?? detail?.brand;
  const displayGtin = product.gtin ?? detail?.sourceGtin;
  const displayPrice = publicCatalogPriceLabel(product);
  const displayColor = product.color ? resolveCatalogColor(product.color)?.displayNameEl ?? product.color : undefined;
  const supplierCode = detail?.supplierCode && detail.supplierCode !== product.mpn ? detail.supplierCode : undefined;
  const technicalRows = [
    displayBrand ? { key: "brand", label: "Μάρκα", value: displayBrand } : undefined,
    detail?.model ? { key: "model", label: "Μοντέλο", value: detail.model } : undefined,
    product.mpn ? { key: "mpn", label: "Κωδικός κατασκευαστή", value: product.mpn } : undefined,
    supplierCode ? { key: "supplier-code", label: "Κωδικός προμηθευτή", value: supplierCode } : undefined,
    displayGtin ? { key: "gtin", label: "GTIN / EAN", value: displayGtin } : undefined,
    product.categoryLabel ? { key: "category", label: "Κατηγορία", value: product.categoryLabel } : undefined,
    displayColor ? { key: "color", label: "Χρώμα", value: displayColor } : undefined,
    product.sizes.length ? { key: "size", label: "Μέγεθος", value: product.sizes.join(" · ") } : undefined,
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
    availableAtOrFrom: product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined
  };
  const structuredOfferData = publicCatalogHasOfferPrice(product) ? offerData : undefined;
  const structuredImages = mediaGallery.length
    ? mediaGallery.map((image) => `${origin}/api/media/${encodeURIComponent(image.mediaId)}`)
    : supplierImageSrc ? [`${origin}${supplierImageSrc}`] : undefined;
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
        description: productSeoDescription({ title: displayTitle, description: displayDescription }),
        sku: product.mpn ?? supplierCode,
        mpn: product.mpn,
        ...gtinSchema(product.gtin),
        ...(!product.gtin ? gtinSchema(detail?.sourceGtin) : {}),
        brand: displayBrand ? { "@type": "Brand", name: displayBrand } : undefined,
        image: structuredImages,
        category: product.categoryLabel ?? category.label,
        color: displayColor ?? product.color,
        size: product.sizes.length ? product.sizes.join(", ") : undefined,
        additionalProperty: technicalAttributes.length ? technicalAttributes.map((attribute) => ({ "@type": "PropertyValue", name: attribute.label, value: attribute.value })) : undefined,
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
          <div className={`product-detail-art ${category.artClass}`}>
            {!hasProductImage ? <span className="detail-category">{category.name}</span> : null}
            {!hasProductImage ? <span className="detail-symbol" aria-hidden="true">{category.symbol}</span> : null}
            {primaryImage ? <Image src={`/api/media/${encodeURIComponent(primaryImage.mediaId)}`} alt={primaryImage.altText ?? displayTitle} fill sizes="(max-width: 900px) 100vw, 48vw" priority style={productImageStyle} /> : supplierImageSrc ? <img src={supplierImageSrc} alt={displayTitle} loading="eager" fetchPriority="high" style={productImageStyle} /> : null}
            <span className="product-badge">{product.available ? "Διαθέσιμο σήμερα" : "Προσωρινά μη διαθέσιμο"}</span>
          </div>
          {mediaGallery.length > 1 ? (
            <div aria-label="Επιπλέον φωτογραφίες προϊόντος" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {mediaGallery.slice(1).map((image) => (
                <div key={image.mediaId} style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 14, background: "var(--white)" }}>
                  <Image src={`/api/media/${encodeURIComponent(image.mediaId)}`} alt={image.altText ?? displayTitle} fill sizes="(max-width: 620px) 22vw, 11vw" style={thumbnailImageStyle} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`/category/${category.slug}`}>{category.label}</a>{product.categoryLabel ? <> · <a href={`/shop?category=${category.slug}&subcategory=${encodeURIComponent(product.categoryCode)}`}>{product.categoryLabel}</a></> : null} · Sparta 23100</div>
          <h1>{displayTitle}</h1>

          <ProductVariantSelector currentVariantId={product.id} title={variantSelectorTitle} options={variantOptions} varyingKeys={varyingVariantKeys} />

          <div className="purchase-card" style={{ marginTop: 18 }}>
            <div>
              <div className="eyebrow">Τιμή & διαθεσιμότητα</div>
              <div className="detail-price">{displayPrice}</div>
              <strong>{product.available ? `${product.availableToSell} τεμ. διαθέσιμα` : "Προσωρινά μη διαθέσιμο"}</strong>
              <span>{product.available ? "Η επιλογή αυτή μπορεί να προστεθεί άμεσα στο καλάθι." : "Η αγορά ενεργοποιείται ξανά μόλις υπάρξει επιλέξιμο τοπικό απόθεμα."}</span>
            </div>
            <div className="purchase-actions">
              {readOnlyCrawler ? <button className="button" type="button" disabled={!product.available}>{product.available ? "Προσθήκη στο καλάθι" : "Μη διαθέσιμο"}</button> : <><AddToCartButton product={{ id: product.id, title: displayTitle, priceMinor: product.priceMinor, price: product.price, available: product.available }} /><ProductAccountActions productId={product.id} /></>}
            </div>
          </div>

          {product.vendorId && product.vendorName && product.adviser ? <div className="vendor-card"><div><span className="vendor-avatar">{product.adviser.slice(0,1)}</span></div><div><div className="eyebrow">Διαθέσιμο από τοπικό κατάστημα</div><strong><a href={`/vendor/${product.vendorId}`}>{product.vendorName}</a></strong><p>{product.adviser} είναι ο άνθρωπός σου για συμβατότητα, χρήση, διαθεσιμότητα ή επιλογή της σωστής παραλλαγής.</p><div className="vendor-actions"><a className="button button-secondary" href={`/ask-local?product=${encodeURIComponent(product.id)}&vendor=${encodeURIComponent(product.vendorId)}`}>Ζήτησε συμβουλή</a></div></div></div> : product.vendorId && product.vendorName ? <div className="vendor-card"><div><span className="vendor-avatar">{product.vendorName.slice(0,1)}</span></div><div><div className="eyebrow">Διαθέσιμο από τοπικό κατάστημα</div><strong><a href={`/vendor/${product.vendorId}`}>{product.vendorName}</a></strong><p>Η εμφανιζόμενη τιμή και διαθεσιμότητα αντιστοιχούν στο επιλεγμένο τοπικό offer.</p></div></div> : <div className="vendor-card"><div><span className="vendor-avatar">?</span></div><div><div className="eyebrow">Προσωρινά χωρίς διαθέσιμο offer</div><strong>Δεν υπάρχει επιλέξιμο τοπικό κατάστημα αυτή τη στιγμή.</strong><p>Μπορείς να χρησιμοποιήσεις το Ask Local για να περιγράψεις τι χρειάζεσαι.</p><div className="vendor-actions"><a className="button button-secondary" href="/ask-local">Ask Local</a></div></div></div>}

          {displayDescription ? (
            <section style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              <div className="eyebrow">Περιγραφή προϊόντος</div>
              <p style={{ whiteSpace: "pre-line", marginTop: 10 }}>{displayDescription}</p>
            </section>
          ) : null}

          <ProductDetailSections technicalRows={technicalRows} packagingRows={packagingRows} />

          {detail?.manualUrl ? <div className="vendor-card"><div><span className="vendor-avatar">PDF</span></div><div><div className="eyebrow">Εγχειρίδιο / οδηγίες</div><strong>Επίσημο εγχειρίδιο προϊόντος</strong><p>Άνοιξε το εγχειρίδιο του προϊόντος σε νέα καρτέλα.</p><div className="vendor-actions"><a className="button button-secondary" href={detail.manualUrl} target="_blank" rel="noopener noreferrer">Άνοιγμα εγχειριδίου (PDF)</a></div></div></div> : null}

          <details style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>Πώς λειτουργούν η τιμή και η επιλογή καταστήματος</summary>
            <div className="detail-assurances" style={{ marginTop: 12 }}>
              <div><strong>Ένα προϊόν, μία επιλογή κάθε φορά</strong><span>Το ίδιο προϊόν δεν εμφανίζεται ως λίστα ανταγωνιστικών καταστημάτων. Η πλατφόρμα κατανέμει ισότιμα την έκθεση μεταξύ επιλέξιμων τοπικών vendors.</span></div>
              <div><strong>Η τιμή είναι του καταστήματος</strong><span>Για διαθέσιμα προϊόντα η τιμή που βλέπει ο πελάτης είναι η τελική τιμή του συγκεκριμένου offer, χωρίς product markup από το ΚΟΝΤΑ ΜΟΥ.</span></div>
              <div><strong>Σταθερή ανάθεση</strong><span>Για πραγματικό πελάτη, όσο το offer παραμένει επιλέξιμο, κρατάμε το ίδιο κατάστημα και την ίδια τιμή σε αναζήτηση, προϊόν και καλάθι.</span></div>
            </div>
          </details>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
