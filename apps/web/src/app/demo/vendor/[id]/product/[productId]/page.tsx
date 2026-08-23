import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteFooter } from "../../../../../../components/SiteFooter";
import { SiteHeader } from "../../../../../../components/SiteHeader";
import { getDemoStorefrontVendor, getDemoVendorCatalogProduct, getDemoVendorVariantOptions } from "../../../../../../lib/demo-storefront";
import { storefrontCategoryForCode } from "../../../../../../lib/storefront-taxonomy";
import styles from "./DemoProduct.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "DEMO product · KONTA MOY",
  robots: { index: false, follow: false, nocache: true }
};

export default async function DemoProductPage({ params }: { params: Promise<{ id: string; productId: string }> }) {
  const { id, productId } = await params;
  const vendor = await getDemoStorefrontVendor(id);
  if (!vendor) notFound();
  const product = await getDemoVendorCatalogProduct(vendor, productId);
  if (!product) notFound();

  const variants = await getDemoVendorVariantOptions(vendor, product);
  const category = storefrontCategoryForCode(product.categoryCode);
  const vendorHref = `/demo/vendor/${encodeURIComponent(vendor.id)}`;
  const imageSrc = product.mediaId
    ? `/api/media/${encodeURIComponent(product.mediaId)}`
    : product.previewImageSrc;
  const externalImage = Boolean(imageSrc?.startsWith("https://"));
  const highlights = product.technicalAttributes.slice(0, 6);
  const identitySpecs = [
    product.brand ? { label: "Μάρκα", value: product.brand } : undefined,
    product.model ? { label: "Μοντέλο", value: product.model } : undefined,
    product.supplierCode ? { label: "Κωδικός προμηθευτή", value: product.supplierCode } : undefined,
    product.vendorSku ? { label: "SKU καταστήματος", value: product.vendorSku } : undefined,
    product.gtin ? { label: "GTIN / EAN", value: product.gtin } : product.sourceGtin ? { label: "GTIN / EAN πηγής", value: product.sourceGtin } : undefined,
    { label: "Κατηγορία", value: product.categoryLabel ?? category.label },
    product.color ? { label: "Χρώμα", value: product.color } : undefined,
    product.sizes.length ? { label: "Μεγέθη / επιλογές", value: product.sizes.join(" · ") } : undefined,
    product.fit ? { label: "Εφαρμογή", value: product.fit } : undefined,
    product.composition ? { label: "Σύνθεση", value: product.composition } : undefined,
    product.madeIn ? { label: "Κατασκευή", value: product.madeIn === "Greece" ? "Ελλάδα" : product.madeIn } : undefined
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry));

  return (
    <main className={styles.page}>
      <div className={styles.demoBar}>DEMO · Πραγματική προεπισκόπηση προϊόντος — η αγορά παραμένει απενεργοποιημένη</div>
      <SiteHeader compact />

      <div className={styles.shell}>
        <nav className={styles.breadcrumbs} aria-label="Breadcrumb">
          <a href={vendorHref}>{vendor.name}</a>
          <span aria-hidden="true">/</span>
          <a href={`${vendorHref}#products`}>{product.categoryLabel ?? category.label}</a>
          <span aria-hidden="true">/</span>
          <span>{product.model ?? product.title}</span>
        </nav>

        <section className={styles.hero}>
          <div className={styles.mediaColumn}>
            <div className={styles.imageCard}>
              {imageSrc ? (
                <img className={styles.productImage} src={imageSrc} alt={product.mediaAlt ?? product.title} loading="eager" decoding="async" referrerPolicy={externalImage ? "no-referrer" : undefined} />
              ) : (
                <div className={styles.placeholder}>
                  <div><strong>{product.brand ?? vendor.name}</strong><span>Η εικόνα προϊόντος δεν έχει ακόμη συνδεθεί με την προεπισκόπηση.</span></div>
                </div>
              )}
              <span className={styles.demoBadge}>DEMO · Προεπισκόπηση</span>
            </div>
            <div className={styles.mediaMeta}>
              <span>{product.brand ?? "Προϊόν"}{product.model ? ` · ${product.model}` : ""}</span>
              {product.sourceUrl ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">Πηγή προϊόντος ↗</a> : null}
            </div>
          </div>

          <div className={styles.summary}>
            <div className={styles.kicker}>{product.categoryLabel ?? category.label} · {vendor.name}</div>
            <h1 className={styles.title}>{product.title}</h1>

            <div className={styles.identity} aria-label="Ταυτότητα προϊόντος">
              {product.brand ? <span>{product.brand}</span> : null}
              {product.model ? <span>Model {product.model}</span> : null}
              {product.supplierCode ? <span>Κωδ. {product.supplierCode}</span> : null}
              {product.variantGroupSize > 1 ? <span>{product.variantGroupSize} παραλλαγές οικογένειας</span> : null}
            </div>

            <div className={styles.priceBlock}>
              <div className={styles.price}>{product.price}</div>
              {product.priceNote ? <p className={styles.priceNote}>{product.priceNote}</p> : null}
            </div>

            {highlights.length ? (
              <div className={styles.highlights} aria-label="Βασικά χαρακτηριστικά">
                {highlights.map((attribute) => (
                  <div className={styles.highlight} key={attribute.key}>
                    <span>{attribute.label}</span>
                    <strong>{attribute.value}</strong>
                  </div>
                ))}
              </div>
            ) : null}

            <div className={styles.demoNotice}>
              <div className={styles.demoNoticeIcon} aria-hidden="true">i</div>
              <div>
                <strong>Προεπισκόπηση πριν την ενεργοποίηση</strong>
                <p>Βλέπεις την εικόνα, τα χαρακτηριστικά, τις παραλλαγές και την διαθέσιμη τιμολογιακή ένδειξη όπως θα παρουσιαστούν στο κατάστημα. Σε DEMO δεν δημιουργείται καλάθι, παραγγελία, πληρωμή ή δέσμευση αποθέματος.</p>
              </div>
            </div>
            <button className={styles.purchaseButton} type="button" disabled aria-disabled="true">Αγορά απενεργοποιημένη σε DEMO</button>
          </div>
        </section>
      </div>

      <section className={styles.body}>
        <div className={styles.shell}>
          <div className={styles.contentGrid}>
            <div>
              <div className={styles.sectionEyebrow}>Περιγραφή</div>
              <h2 className={styles.sectionTitle}>Για το προϊόν</h2>
              <p className={styles.description}>{product.description ?? "Η αναλυτική περιγραφή θα συμπληρωθεί πριν από τη δημόσια ενεργοποίηση του προϊόντος."}</p>

              <div className={styles.vendorSection}>
                <div className={styles.sectionEyebrow}>Τοπικό κατάστημα</div>
                <div className={styles.vendorCard}>
                  <div className={styles.vendorAvatar}>{vendor.name.slice(0, 1)}</div>
                  <div>
                    <strong><a href={vendorHref}>{vendor.name}</a></strong>
                    <p>Το προϊόν έχει ήδη συνδεθεί με αυτό το κατάστημα για την προεπισκόπηση. Η εμπορική ενεργοποίηση γίνεται ξεχωριστά μετά την ολοκλήρωση του onboarding.</p>
                  </div>
                </div>
                <a className={styles.backLink} href={`${vendorHref}#products`}>← Πίσω στα προϊόντα του καταστήματος</a>
              </div>
            </div>

            <div>
              <div className={styles.sectionEyebrow}>Τεχνικά στοιχεία</div>
              <h2 className={styles.sectionTitle}>Χαρακτηριστικά & ταυτότητα</h2>
              <dl className={styles.specGrid}>
                {identitySpecs.map((entry) => (
                  <div className={styles.spec} key={`identity-${entry.label}`}><dt>{entry.label}</dt><dd>{entry.value}</dd></div>
                ))}
                {product.technicalAttributes.map((attribute) => (
                  <div className={styles.spec} key={`technical-${attribute.key}`}><dt>{attribute.label}</dt><dd>{attribute.value}</dd></div>
                ))}
              </dl>

              {variants.length ? (
                <div className={styles.variants}>
                  <div className={styles.sectionEyebrow}>Παραλλαγές</div>
                  <h2 className={styles.sectionTitle}>Άλλες επιλογές της ίδιας οικογένειας</h2>
                  <div className={styles.variantGrid}>
                    {variants.map((variant) => (
                      <a className={styles.variantCard} href={`/demo/vendor/${encodeURIComponent(vendor.id)}/product/${encodeURIComponent(variant.slug || variant.id)}`} key={variant.id}>
                        <span>{variant.brand ?? product.brand ?? "Παραλλαγή"}</span>
                        <strong>{variant.model ?? variant.title}</strong>
                        {variant.technicalAttributes[0] ? <span>{variant.technicalAttributes[0].label}: {variant.technicalAttributes[0].value}</span> : null}
                        <b>{variant.price}</b>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={styles.sourceSection}>
                <div className={styles.sourceMeta}>
                  {product.sourceLastResearched ? <span>Τελευταία έρευνα πηγής: {product.sourceLastResearched}</span> : null}
                  {product.sourceUrl ? <a href={product.sourceUrl} target="_blank" rel="noreferrer">Επίσημη σελίδα πηγής ↗</a> : null}
                  <span>DEMO · noindex · χωρίς εμπορικές ενέργειες</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
