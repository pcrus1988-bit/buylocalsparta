import type { PublicProductAlternativePresentation } from "../lib/public-product-family-choices";
import styles from "./ProductAlternativeSelector.module.css";

type ProductAlternativeSelectorProps = Readonly<{
  presentation: PublicProductAlternativePresentation;
  hrefForOption?: (option: PublicProductAlternativePresentation["options"][number]) => string;
  availabilityMode?: "live" | "preview";
}>;

function optionLabel(option: PublicProductAlternativePresentation["options"][number]): string {
  return option.attributes.map((attribute) => attribute.value).join(" · ");
}

export function ProductAlternativeSelector({
  presentation,
  hrefForOption = (option) => `/product/${encodeURIComponent(option.slug)}`,
  availabilityMode = "live"
}: ProductAlternativeSelectorProps) {
  if (!presentation.options.length) return null;

  return (
    <section className={styles.section} aria-label="Σχετικές επιλογές του ίδιου προϊόντος">
      <div className={styles.heading}>
        <strong>{presentation.title}</strong>
        <span>Ίδια βασική σειρά, διαφορετικό χαρακτηριστικό</span>
      </div>
      <div className={styles.grid}>
        {presentation.options.map((option) => {
          const label = optionLabel(option);
          const unavailable = availabilityMode === "live" && !option.available;
          return (
            <a
              key={option.canonicalVariantId}
              href={hrefForOption(option)}
              className={[styles.option, unavailable ? styles.unavailable : ""].filter(Boolean).join(" ")}
              aria-label={`${label}${unavailable ? ", προσωρινά μη διαθέσιμο" : ""}`}
            >
              {option.imageSrc ? (
                <span className={styles.imageFrame}>
                  <img src={option.imageSrc} alt={option.imageAlt ?? label} loading="lazy" />
                </span>
              ) : null}
              <span className={styles.body}>
                <span className={styles.value}>{label}</span>
                <span className={styles.meta}>
                  {option.attributes.map((attribute) => attribute.label).join(" · ")}
                </span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
