import type { PublicProductSuitability, PublicSuitableProduct, PublicSuitabilityKind } from "../lib/public-product-suitability";
import { relationshipGroupsFromSuitability, type PublicRelationshipProduct } from "../lib/product-relationship-groups";
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
  const relationshipGroups = relationshipGroupsFromSuitability(suitability);
  if (!suitability?.items.length && !relationshipGroups.length) return null;

  const groups = (["model", "brand", "platform"] as const)
    .map((kind) => ({ kind, values: suitability?.items.filter((item) => item.kind === kind).map((item) => item.value) ?? [] }))
    .filter((group) => group.values.length);

  const productContent = (product: PublicSuitableProduct | PublicRelationshipProduct, relationshipLabel?: string) => (
    <>
      <span className={styles.productImage}>
        {product.imageSrc
          ? <img src={product.imageSrc} alt={product.imageAlt ?? product.title} loading="lazy" />
          : <span className={styles.placeholder} aria-hidden="true">↗</span>}
      </span>
      <span className={styles.productCopy}>
        <small>{relationshipLabel ?? `Ταιριάζει με: ${product.matchedFor}`}</small>
        <strong>{product.title}</strong>
        <span className={styles.productLink}>{"isCurrent" in product && product.isCurrent
          ? "Αυτό βλέπεις τώρα"
          : mode === "demo" ? "Δες στο DEMO →" : "Δες το προϊόν →"}</span>
      </span>
    </>
  );

  return (
    <section className={styles.section} aria-labelledby="product-suitability-title">
      <div className={styles.eyebrow}>Συμβατότητα</div>
      <h2 id="product-suitability-title" className={styles.title}>Κατάλληλο για</h2>

      {groups.length ? (
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
      ) : null}

      {relationshipGroups.map((group) => (
        <div className={styles.linkedProducts} key={group.key}>
          <div className={styles.linkedHeading}>
            <strong>{group.title}</strong>
            <span>{group.description}</span>
          </div>
          <div className={styles.productGrid}>
            {group.products.map((product) => product.isCurrent ? (
              <div
                className={`${styles.productCard} ${styles.currentProductCard}`}
                aria-current="page"
                key={`${group.key}-${product.canonicalVariantId}`}
              >
                {productContent(product, product.relationshipLabel)}
              </div>
            ) : (
              <a
                className={styles.productCard}
                href={hrefForProduct(product)}
                key={`${group.key}-${product.canonicalVariantId}`}
              >
                {productContent(product, product.relationshipLabel)}
              </a>
            ))}
          </div>
        </div>
      ))}

      {suitability?.products.length ? (
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
                {productContent(product)}
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
