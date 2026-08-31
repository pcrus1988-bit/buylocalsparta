import type { ProductRelatedOptionGroup } from "../lib/product-related-options";
import styles from "./ProductRelatedOptions.module.css";

type ProductRelatedOptionsProps = Readonly<{
  groups: readonly ProductRelatedOptionGroup[];
  mode?: "live" | "demo";
  hrefForProduct?: (product: ProductRelatedOptionGroup["products"][number]) => string;
}>;

export function ProductRelatedOptions({
  groups,
  mode = "live",
  hrefForProduct = (product) => `/product/${encodeURIComponent(product.slug)}`,
}: ProductRelatedOptionsProps) {
  if (!groups.length) return null;

  return (
    <section className={styles.section} aria-labelledby="product-related-options-title">
      <div className={styles.eyebrow}>Σχετικές επιλογές</div>
      <h2 id="product-related-options-title" className={styles.title}>Ίδιο είδος, άλλες επιλογές</h2>

      {groups.map((group) => (
        <div className={styles.group} key={group.key}>
          <div className={styles.groupHeading}>
            <strong>{group.title}</strong>
            <span>{group.description}</span>
          </div>
          <div className={styles.grid}>
            {group.products.map((product) => (
              <a
                className={styles.card}
                href={hrefForProduct(product)}
                key={`${group.key}-${product.canonicalVariantId}`}
              >
                <span className={styles.imageFrame}>
                  {product.imageSrc
                    ? <img src={product.imageSrc} alt={product.imageAlt ?? product.title} loading="lazy" />
                    : <span className={styles.placeholder} aria-hidden="true">↗</span>}
                </span>
                <span className={styles.copy}>
                  <small>{product.choiceLabel}</small>
                  <strong>{product.title}</strong>
                  <span className={styles.link}>{mode === "demo" ? "Δες στο DEMO →" : "Δες το προϊόν →"}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
