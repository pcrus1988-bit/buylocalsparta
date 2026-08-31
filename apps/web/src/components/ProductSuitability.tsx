import type { PublicProductSuitability, PublicSuitableProduct, PublicSuitabilityKind } from "../lib/public-product-suitability";
import styles from "./ProductSuitability.module.css";

type ProductSuitabilityProps = Readonly<{
  suitability?: PublicProductSuitability;
  hrefForProduct?: (product: PublicSuitableProduct) => string;
  mode?: "live" | "demo";
}>;

const KIND_LABELS: Readonly<Record<PublicSuitabilityKind, string>> = {
  model: "Μοντέλα",
  brand: "Μάρκες",
  platform: "Πλατφόρμες"
};

export function ProductSuitability({
  suitability,
  hrefForProduct = (product) => `/product/${encodeURIComponent(product.slug)}`,
  mode = "live"
}: ProductSuitabilityProps) {
  if (!suitability?.items.length) return null;

  const groups = (["model", "brand", "platform"] as const)
    .map((kind) => ({ kind, values: suitability.items.filter((item) => item.kind === kind).map((item) => item.value) }))
    .filter((group) => group.values.length);

  return (
    <section className={styles.section} aria-labelledby="product-suitability-title">
      <div className={styles.eyebrow}>Συμβατότητα</div>
      <h2 id="product-suitability-title" className={styles.title}>Κατάλληλο για</h2>

      <div className={styles.groups}>
        {groups.map((group) => (
          <div className={styles.group} key={group.kind}>
            <strong>{KIND_LABELS[group.kind]}</strong>
            <div className={styles.chips}>
              {group.values.map((value) => <span className={styles.chip} key={`${group.kind}-${value}`}>{value}</span>)}
            </div>
          </div>
        ))}
      </div>

      {suitability.products.length ? (
        <div className={styles.linkedProducts}>
          <div className={styles.linkedHeading}>
            <strong>{mode === "demo" ? "Τα αντίστοιχα προϊόντα υπάρχουν σε αυτό το DEMO κατάστημα" : "Τα αντίστοιχα προϊόντα υπάρχουν στο ΚΟΝΤΑ ΜΟΥ"}</strong>
            <span>{mode === "demo"
              ? "Άνοιξέ τα απευθείας για να δεις την εικόνα, τα χαρακτηριστικά και πώς θα συνδέονται μέσα στο ενεργό κατάστημα."
              : "Άνοιξέ τα απευθείας για να ελέγξεις εικόνα, διαθεσιμότητα και επιλογές αγοράς."}</span>
          </div>
          <div className={styles.productGrid}>
            {suitability.products.map((product) => (
              <a className={styles.productCard} href={hrefForProduct(product)} key={product.canonicalVariantId}>
                <span className={styles.productImage}>
                  {product.imageSrc
                    ? <img src={product.imageSrc} alt={product.imageAlt ?? product.title} loading="lazy" />
                    : <span className={styles.placeholder} aria-hidden="true">↗</span>}
                </span>
                <span className={styles.productCopy}>
                  <small>Ταιριάζει με: {product.matchedFor}</small>
                  <strong>{product.title}</strong>
                  <span className={styles.productLink}>{mode === "demo" ? "Δες στο DEMO →" : "Δες το προϊόν →"}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
