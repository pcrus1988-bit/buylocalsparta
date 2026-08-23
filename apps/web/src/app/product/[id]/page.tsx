import type { Metadata } from "next";
import Image from "next/image";
import { notFound, permanentRedirect } from "next/navigation";
import { getCatalogCard, getPublicProductSeoSummary } from "../../../lib/catalog-view";
import { getVisitorKey } from "../../../lib/visitor";
import { AddToCartButton } from "../../../components/AddToCartButton";
import { ProductAnalyticsTracker } from "../../../components/ProductAnalyticsTracker";
import { SiteHeader } from "../../../components/SiteHeader";
import { ProductAccountActions } from "../../../components/ProductAccountActions";
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
import { getPublicProductDetail } from "../../../lib/public-product-detail";
import { approvedCatalogImageGallery } from "../../../lib/public-product-media-gallery";
import { publicCatalogHasOfferPrice, publicCatalogPriceLabel } from "../../../lib/public-data-integrity";

type ProductPageProps = Readonly<{ params: Promise<{ id: string }> }>;

const productImageStyle = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
  zIndex: 1
} as const;

const thumbnailImageStyle = {
  objectFit: "contain"
} as const;

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
  const quality = productIndexEligibility(product);
  const description = productSeoDescription({ ...product, description: product.description ?? detail?.description });
  const reference: SeoEntityReference = { kind: "product", id: product.id };
  return buildGovernedSeoMetadata({
    reference,
    settings,
    override: findSeoEntityOverride(overrides.entries, reference),
    defaults: {
      title: product.title,
      description,
      canonicalPath: productPublicPath(product),
      openGraphImage: product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : undefined
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

  const [detail, approvedGallery] = await Promise.all([
    getPublicProductDetail(product.id),
    approvedCatalogImageGallery({ canonicalVariantId: product.id, preferredVendorId: product.vendorId })
  ]);
  const mediaGallery = approvedGallery.length
    ? approvedGallery
    : product.mediaId
      ? [{ canonicalVariantId: product.id, mediaId: product.mediaId, altText: product.mediaAlt }]
      : [];
  const primaryImage = mediaGallery[0];
  const displayDescription = product.description ?? detail?.description;
  const displayBrand = product.brand ?? detail?.brand;
  const displayGtin = product.gtin ?? detail?.sourceGtin;
  const displayPrice = publicCatalogPriceLabel(product);
  const supplierCode = detail?.supplierCode && detail.supplierCode !== product.mpn ? detail.supplierCode : undefined;
  const technicalAttributes = detail?.technicalAttributes ?? [];

  const reference: SeoEntityReference = { kind: "product", id: product.id };
  const override = findSeoEntityOverride(overrides.entries, reference);
  const quality = productIndexEligibility(summary);
  const seoControl = resolveSeoEntityControl({ settings, kind: reference.kind, entityEligible: quality.blockingReasons.length === 0, defaultIndexAllowed: quality.eligible, defaultSchemaAllowed: true, override });
  const category = storefrontCategoryForCode(product.categoryCode);
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
  const offerData = publicCatalogHasOfferPrice(product) ? {
    "@type": "Offer",
    url: productUrl,
    priceCurrency: "EUR",
    price: (product.priceMinor / 100).toFixed(2),
    availability: product.available ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    seller: { "@id": `${origin}/#organization` },
    availableAtOrFrom: product.vendorId && product.vendorName ? { "@type": "LocalBusiness", "@id": `${origin}/vendor/${encodeURIComponent(product.vendorId)}#business`, name: product.vendorName, url: `${origin}/vendor/${encodeURIComponent(product.vendorId)}` } : undefined
  } : undefined;
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      sellerOfRecord,
      {
        "@type": "Product",
        "@id": `${productUrl}#product`,
        url: productUrl,
        mainEntityOfPage: productUrl,
        name: product.title,
        description: productSeoDescription({ title: product.title, description: displayDescription }),
        sku: product.mpn ?? supplierCode,
        mpn: product.mpn,
        ...gtinSchema(product.gtin),
        ...(!product.gtin ? gtinSchema(detail?.sourceGtin) : {}),
        brand: displayBrand ? { "@type": "Brand", name: displayBrand } : undefined,
        image: mediaGallery.length ? mediaGallery.map((image) => `${origin}/api/media/${encodeURIComponent(image.mediaId)}`) : undefined,
        category: product.categoryLabel ?? category.label,
        color: product.color,
        size: product.sizes.length ? product.sizes.join(", ") : undefined,
        additionalProperty: technicalAttributes.length ? technicalAttributes.map((attribute) => ({ "@type": "PropertyValue", name: attribute.label, value: attribute.value })) : undefined,
        itemCondition: "https://schema.org/NewCondition",
        offers: offerData
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Αρχική", item: origin },
          { "@type": "ListItem", position: 2, name: category.label, item: categoryUrl },
          { "@type": "ListItem", position: 3, name: product.title, item: productUrl }
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
            <span className="detail-category">{category.name}</span>
            <span className="detail-symbol" aria-hidden="true">{category.symbol}</span>
            {primaryImage ? <Image src={`/api/media/${encodeURIComponent(primaryImage.mediaId)}`} alt={primaryImage.altText ?? product.title} fill sizes="(max-width: 900px) 100vw, 48vw" priority style={productImageStyle} /> : null}
            <span className="product-badge">{product.available ? "Διαθέσιμο σήμερα" : "Προσωρινά μη διαθέσιμο"}</span>
          </div>
          {mediaGallery.length > 1 ? (
            <div aria-label="Επιπλέον φωτογραφίες προϊόντος" style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 8 }}>
              {mediaGallery.slice(1).map((image) => (
                <div key={image.mediaId} style={{ position: "relative", aspectRatio: "1 / 1", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 14, background: "var(--white)" }}>
                  <Image src={`/api/media/${encodeURIComponent(image.mediaId)}`} alt={image.altText ?? product.title} fill sizes="(max-width: 620px) 22vw, 11vw" style={thumbnailImageStyle} />
                </div>
              ))}
            </div>
          ) : null}
        </div>

        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`/category/${category.slug}`}>{category.label}</a>{product.categoryLabel ? <> · <a href={`/shop?category=${category.slug}&subcategory=${encodeURIComponent(product.categoryCode)}`}>{product.categoryLabel}</a></> : null} · Sparta 23100</div>
          <h1>{product.title}</h1>
          <div className="detail-price">{displayPrice}</div>
          <p className="lead compact">{product.available ? "Η τιμή και η διαθεσιμότητα προέρχονται από ένα πραγματικά επιλέξιμο τοπικό offer. Το ΚΟΝΤΑ ΜΟΥ δεν προσθέτει προσαύξηση στην τιμή προϊόντος." : "Ενδεικτική τιμή καταλόγου από την τελευταία καταγεγραμμένη πηγή. Η αγορά θα ενεργοποιηθεί μόνο όταν υπάρχει εγκεκριμένο τοπικό offer με επιβεβαιωμένο stock."}</p>

          {displayDescription ? <div className="vendor-card"><div><span className="vendor-avatar">i</span></div><div><div className="eyebrow">Περιγραφή προϊόντος</div><p style={{ whiteSpace: "pre-line" }}>{displayDescription}</p></div></div> : null}

          <div className="eyebrow">Στοιχεία προϊόντος</div>
          <div className="detail-assurances">
            {displayBrand ? <div><strong>Μάρκα</strong><span>{displayBrand}</span></div> : null}
            {detail?.model ? <div><strong>Μοντέλο</strong><span>{detail.model}</span></div> : null}
            {product.mpn ? <div><strong>Κωδικός κατασκευαστή</strong><span>{product.mpn}</span></div> : null}
            {supplierCode ? <div><strong>Κωδικός προμηθευτή</strong><span>{supplierCode}</span></div> : null}
            {displayGtin ? <div><strong>GTIN / EAN</strong><span>{displayGtin}</span></div> : null}
            {product.categoryLabel ? <div><strong>Κατηγορία</strong><span>{product.categoryLabel}</span></div> : null}
            {product.color ? <div><strong>Χρώμα</strong><span>{product.color}</span></div> : null}
            {product.sizes.length ? <div><strong>Μεγέθη</strong><span>{product.sizes.join(" · ")}</span></div> : null}
            {product.fit ? <div><strong>Εφαρμογή</strong><span>{product.fit}</span></div> : null}
            {product.composition ? <div><strong>Σύνθεση</strong><span>{product.composition}</span></div> : null}
            {product.madeIn ? <div><strong>Κατασκευή</strong><span>{product.madeIn === "Greece" ? "Ελλάδα" : product.madeIn}</span></div> : null}
          </div>

          {technicalAttributes.length ? <><div className="eyebrow" style={{ marginTop: 24 }}>Τεχνικά χαρακτηριστικά</div><div className="detail-assurances">{technicalAttributes.map((attribute) => <div key={attribute.key}><strong>{attribute.label}</strong><span>{attribute.value}</span></div>)}</div></> : null}

          {product.vendorId && product.vendorName && product.adviser ? <div className="vendor-card"><div><span className="vendor-avatar">{product.adviser.slice(0,1)}</span></div><div><div className="eyebrow">Ο άνθρωπός σου για αυτό το προϊόν</div><strong><a href={`/vendor/${product.vendorId}`}>{product.adviser} · {product.vendorName}</a></strong><p>Ρώτησε για συμβατότητα, χρήση, διαθεσιμότητα ή ποια επιλογή ταιριάζει καλύτερα στις ανάγκες σου.</p><div className="vendor-actions"><a className="button" href={`/ask-local?product=${encodeURIComponent(product.id)}&vendor=${encodeURIComponent(product.vendorId)}`}>Ζήτησε συμβουλή</a><a className="button button-secondary" href="/how-it-works">Πώς λειτουργεί</a></div></div></div> : product.vendorId && product.vendorName ? <div className="vendor-card"><div><span className="vendor-avatar">{product.vendorName.slice(0,1)}</span></div><div><div className="eyebrow">Τοπικό κατάστημα</div><strong><a href={`/vendor/${product.vendorId}`}>{product.vendorName}</a></strong><p>Η εμφανιζόμενη τιμή και διαθεσιμότητα προέρχονται από αυτό το κατάστημα.</p></div></div> : <div className="vendor-card"><div><span className="vendor-avatar">?</span></div><div><div className="eyebrow">Προσωρινά χωρίς διαθέσιμο offer</div><strong>Δεν υπάρχει επιλέξιμο τοπικό κατάστημα αυτή τη στιγμή.</strong><p>Μπορείς να χρησιμοποιήσεις το Ask Local για να περιγράψεις τι χρειάζεσαι.</p><div className="vendor-actions"><a className="button" href="/ask-local">Ask Local</a></div></div></div>}
          <div className="purchase-card"><div><strong>{product.availableToSell} τεμ. διαθέσιμα</strong><span>Η τιμή και το stock προέρχονται από επιλέξιμο τοπικό offer. Για πραγματικό πελάτη, το checkout συνεχίζει να χρησιμοποιεί την κανονική σταθερή Fair Vendor Assignment.</span></div><div className="purchase-actions">{readOnlyCrawler ? <button className="button" type="button" disabled={!product.available}>{product.available ? "Προσθήκη στο καλάθι" : "Μη διαθέσιμο"}</button> : <><AddToCartButton product={product} /><ProductAccountActions productId={product.id} /></>}</div></div>
          <div className="detail-assurances"><div><strong>Ένα προϊόν, μία επιλογή κάθε φορά</strong><span>Το ίδιο προϊόν δεν εμφανίζεται ως λίστα ανταγωνιστικών καταστημάτων. Η πλατφόρμα κατανέμει ισότιμα την έκθεση μεταξύ επιλέξιμων τοπικών vendors.</span></div><div><strong>Η τιμή είναι του καταστήματος</strong><span>Για διαθέσιμα προϊόντα η τιμή που βλέπει ο πελάτης είναι η τελική τιμή του συγκεκριμένου offer, χωρίς product markup από το ΚΟΝΤΑ ΜΟΥ.</span></div><div><strong>Σταθερή ανάθεση</strong><span>Για πραγματικό πελάτη, όσο το offer παραμένει επιλέξιμο, κρατάμε το ίδιο κατάστημα και την ίδια τιμή σε αναζήτηση, προϊόν και καλάθι.</span></div></div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
