import { resolveCatalogColor } from "@buy-local-sparta/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetailSections, type ProductDetailRow } from "../../../../../../components/ProductDetailSections";
import { ProductSuitability } from "../../../../../../components/ProductSuitability";
import { ProductVariantSelector } from "../../../../../../components/ProductVariantSelector";
import { SiteFooter } from "../../../../../../components/SiteFooter";
import { SiteHeader } from "../../../../../../components/SiteHeader";
import { getDemoProductParity, isDemoSuitabilityAttribute } from "../../../../../../lib/demo-product-parity";
import { getDemoStorefrontVendor, getDemoVendorCatalogProduct, getDemoVendorVariantOptions, type DemoTechnicalAttribute } from "../../../../../../lib/demo-storefront";
import { getDemoProductVariantPresentation } from "../../../../../../lib/public-product-variants";
import { isCompatibilityPresentationKey } from "../../../../../../lib/product-presentation-guards";
import { publicCatalogueTitleLabel } from "../../../../../../lib/public-data-integrity";
import { storefrontCategoryForCode } from "../../../../../../lib/storefront-taxonomy";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DEMO product · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};

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
  "vendor_sku",
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

function presentTechnicalAttribute(attribute: DemoTechnicalAttribute): DemoTechnicalAttribute | undefined {
  const key = normalizedTechnicalKey(attribute.key);
  const label = attribute.label.trim();
  const value = attribute.value.trim();
  if (!key || !value) return undefined;
  if (PRIVATE_TECHNICAL_ATTRIBUTE_KEYS.has(key)
    || isCompatibilityPresentationKey(key)
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

function publicTechnicalAttributes(attributes: readonly DemoTechnicalAttribute[]): readonly DemoTechnicalAttribute[] {
  const byKey = new Map<string, DemoTechnicalAttribute>();
  for (const attribute of attributes) {
    const presented = presentTechnicalAttribute(attribute);
    if (!presented || byKey.has(presented.key)) continue;
    byKey.set(presented.key, presented);
  }
  return [...byKey.values()];
}

function isPackagingAttribute(attribute: DemoTechnicalAttribute): boolean {
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

function productDisplayDescription(description: string | undefined, technicalAttributes: readonly DemoTechnicalAttribute[]): string | undefined {
  const canonical = description?.trim();
  if (!canonical) return undefined;
  const markerIndex = canonical.indexOf(GENERATED_TECHNICAL_DESCRIPTION_MARKER);
  if (markerIndex < 0) return canonical;
  const intro = publicCatalogueTitleLabel(canonical.slice(0, markerIndex).trim());
  const facts = technicalAttributes.slice(0, 6).map((attribute) => `${attribute.label}: ${attribute.value}`).join(" · ");
  return facts ? `${intro} Βασικά στοιχεία: ${facts}.`.trim() : intro || undefined;
}

export default async function DemoProductPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  const vendor = await getDemoStorefrontVendor(id);
  if (!vendor) notFound();
  const product = await getDemoVendorCatalogProduct(vendor, productId);
  if (!product) notFound();

  const siblings = await getDemoVendorVariantOptions(vendor, product);
  const [parity, variants] = await Promise.all([
    getDemoProductParity(vendor, product, siblings),
    getDemoProductVariantPresentation(product.id, vendor.uuid)
  ]);
  const category = storefrontCategoryForCode(product.categoryCode);
  const vendorHref = `/demo/vendor/${encodeURIComponent(vendor.id)}`;
  const displayTitle = publicCatalogueTitleLabel(product.title);
  const imageSrc = product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : product.previewImageSrc;
  const technicalAttributes = publicTechnicalAttributes(product.technicalAttributes);
  const packagingAttributes = technicalAttributes.filter(isPackagingAttribute);
  const displayColor = product.color ? resolveCatalogColor(product.color)?.displayNameEl ?? product.color : undefined;
  const meaningfulSizes = product.sizes.filter((size) => !isMeaninglessSize(size));
  const displayGtin = product.gtin ?? product.sourceGtin;
  const explicitTechnicalKeys = new Set([
    product.brand ? "brand" : "",
    product.model ? "model" : "",
    product.mpn ? "mpn" : "",
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
  const productTechnicalAttributes = technicalAttributes
    .filter((attribute) => !isPackagingAttribute(attribute))
    .filter((attribute) => !isDemoSuitabilityAttribute(attribute))
    .filter((attribute) => !explicitTechnicalKeys.has(attribute.key));
  const displayDescription = productDisplayDescription(product.description, technicalAttributes);
  const technicalRows = [
    product.brand ? { key: "brand", label: "Μάρκα", value: product.brand } : undefined,
    product.model ? { key: "model", label: "Μοντέλο", value: product.model } : undefined,
    product.mpn ? { key: "mpn", label: "Κωδικός κατασκευαστή", value: product.mpn } : undefined,
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

  return (
    <main>
      <div className="announcement">DEMO storefront · ίδια εμπειρία προϊόντος με το live κατάστημα, χωρίς αγορά ή πραγματικές εμπορικές ενέργειες.</div>
      <SiteHeader compact />

      <section className="shell product-detail">
        <div style={{ display: "grid", gap: 12, alignSelf: "start" }}>
          <div className={`product-detail-art ${category.artClass}`}>
            {!imageSrc ? <span className="detail-category">{category.name}</span> : null}
            {!imageSrc ? <span className="detail-symbol" aria-hidden="true">{category.symbol}</span> : null}
            {imageSrc ? <img src={imageSrc} alt={product.mediaAlt ?? displayTitle} loading="eager" fetchPriority="high" style={productImageStyle} /> : null}
            <span className="product-badge">DEMO · Προεπισκόπηση</span>
          </div>
        </div>

        <div className="product-detail-copy">
          <div className="eyebrow"><a href={`${vendorHref}#products`}>{product.categoryLabel ?? category.label}</a> · <a href={vendorHref}>{vendor.name}</a> · DEMO</div>
          <h1>{displayTitle}</h1>

          <ProductVariantSelector
            currentVariantId={product.id}
            title={variants.title}
            options={variants.options}
            varyingKeys={variants.varyingKeys}
            availabilityMode="preview"
            hrefForOption={(option) => `/demo/vendor/${encodeURIComponent(vendor.id)}/product/${encodeURIComponent(option.slug)}`}
          />

          <div className="purchase-card" style={{ marginTop: 18 }}>
            <div>
              <div className="eyebrow">Τιμή & διαθεσιμότητα · DEMO</div>
              <div className="detail-price">{product.price}</div>
              <strong>Προεπισκόπηση πριν την ενεργοποίηση</strong>
              <span>{product.priceBasis === "pending" ? "Η τελική τιμή και η πραγματική διαθεσιμότητα θα επιβεβαιωθούν πριν τη δημοσίευση." : "Η πραγματική διαθεσιμότητα θα ενεργοποιηθεί όταν το κατάστημα περάσει σε live λειτουργία."}</span>
            </div>
            <div className="purchase-actions">
              <button className="button" type="button" disabled aria-disabled="true">Προσθήκη στο καλάθι · DEMO</button>
              <button className="button button-secondary save-product-button" type="button" disabled aria-disabled="true">♡ Αποθήκευση · DEMO</button>
            </div>
          </div>

          <div className="vendor-card">
            <div><span className="vendor-avatar">{vendor.name.slice(0, 1)}</span></div>
            <div>
              <div className="eyebrow">Τοπικό κατάστημα · DEMO</div>
              <strong><a href={vendorHref}>{vendor.name}</a></strong>
              <p>Αυτή είναι η customer-facing εμπειρία που θα χρησιμοποιεί το κατάστημα μετά την ενεργοποίηση. Στο DEMO δεν δημιουργούνται παραγγελίες, δεσμεύσεις αποθέματος ή μηνύματα προς τον vendor.</p>
              <div className="vendor-actions"><button className="button button-secondary" type="button" disabled aria-disabled="true">Ζήτησε συμβουλή · DEMO</button></div>
            </div>
          </div>

          {displayDescription ? (
            <section style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--line)" }}>
              <div className="eyebrow">Περιγραφή προϊόντος</div>
              <p style={{ whiteSpace: "pre-line", marginTop: 10 }}>{displayDescription}</p>
            </section>
          ) : null}

          <ProductSuitability
            suitability={parity.suitability}
            mode="demo"
            hrefForProduct={(target) => `/demo/vendor/${encodeURIComponent(vendor.id)}/product/${encodeURIComponent(target.slug)}`}
          />

          <ProductDetailSections technicalRows={technicalRows} packagingRows={packagingRows} />

          {parity.manualUrl ? (
            <div className="vendor-card">
              <div><span className="vendor-avatar">PDF</span></div>
              <div>
                <div className="eyebrow">Εγχειρίδιο / οδηγίες</div>
                <strong>Επίσημο εγχειρίδιο προϊόντος</strong>
                <p>Άνοιξε το εγχειρίδιο του προϊόντος σε νέα καρτέλα.</p>
                <div className="vendor-actions"><a className="button button-secondary" href={parity.manualUrl} target="_blank" rel="noopener noreferrer">Άνοιγμα εγχειριδίου (PDF)</a></div>
              </div>
            </div>
          ) : null}

          <details style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
            <summary style={{ cursor: "pointer", fontWeight: 800 }}>Πώς θα λειτουργούν η τιμή και η επιλογή καταστήματος όταν ενεργοποιηθεί</summary>
            <div className="detail-assurances" style={{ marginTop: 12 }}>
              <div><strong>Ένα προϊόν, μία επιλογή κάθε φορά</strong><span>Στο live ΚΟΝΤΑ ΜΟΥ το ίδιο canonical προϊόν δεν εμφανίζεται ως λίστα ανταγωνιστικών καταστημάτων. Η πλατφόρμα κατανέμει ισότιμα την έκθεση μεταξύ επιλέξιμων vendors.</span></div>
              <div><strong>Πραγματική τιμή του καταστήματος</strong><span>Με την ενεργοποίηση, η τιμή και η διαθεσιμότητα προέρχονται από το επιλέξιμο offer του καταστήματος και το επιβεβαιωμένο απόθεμα.</span></div>
              <div><strong>Το DEMO δεν επηρεάζει το εμπόριο</strong><span>Η περιήγηση εδώ δεν δημιουργεί Fair Vendor assignment, παραγγελία, πληρωμή, κράτηση αποθέματος ή vendor notification.</span></div>
            </div>
          </details>

          <div style={{ marginTop: 20 }}><a className="text-link" href={`${vendorHref}#products`}>← Πίσω στα προϊόντα του {vendor.name}</a></div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
