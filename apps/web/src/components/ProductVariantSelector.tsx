import type { PublicProductVariantOption } from "../lib/public-product-variants";
import styles from "./ProductVariantSelector.module.css";

type ProductVariantSelectorProps = Readonly<{
  currentVariantId: string;
  title: string;
  options: readonly PublicProductVariantOption[];
  varyingKeys: ReadonlySet<string>;
  hrefForOption?: (option: PublicProductVariantOption) => string;
  availabilityMode?: "live" | "preview";
}>;

function visibleAttributes(option: PublicProductVariantOption, varyingKeys: ReadonlySet<string>) {
  const varying = option.attributes.filter((attribute) => varyingKeys.has(attribute.key));
  return varying.length ? varying : option.attributes;
}

function optionDisplayName(option: PublicProductVariantOption, varyingKeys: ReadonlySet<string>): string {
  const attributes = visibleAttributes(option, varyingKeys);
  if (!attributes.length) return "Παραλλαγή";
  return attributes.map((attribute) => attribute.value).join(" · ");
}

function optionColor(option: PublicProductVariantOption, varyingKeys: ReadonlySet<string>) {
  return visibleAttributes(option, varyingKeys).find((attribute) => attribute.kind === "color")?.color;
}

function swatchStyle(color: NonNullable<ReturnType<typeof optionColor>>) {
  if (color.swatchKind === "transparent") {
    return {
      backgroundColor: "#fff",
      backgroundImage: "linear-gradient(45deg,#ddd 25%,transparent 25%),linear-gradient(-45deg,#ddd 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#ddd 75%),linear-gradient(-45deg,transparent 75%,#ddd 75%)",
      backgroundSize: "8px 8px",
      backgroundPosition: "0 0,0 4px,4px -4px,-4px 0"
    };
  }
  if (color.swatchKind === "multicolor") {
    return { background: "linear-gradient(90deg,#d52b2b,#f2c230,#388a55,#2f6da8,#68478d)" };
  }
  return { backgroundColor: color.hex };
}

export function ProductVariantSelector({
  currentVariantId,
  title,
  options,
  varyingKeys,
  hrefForOption = (option) => `/product/${encodeURIComponent(option.slug)}`,
  availabilityMode = "live"
}: ProductVariantSelectorProps) {
  if (options.length <= 1) return null;

  return (
    <section className={styles.section} aria-label="Υποχρεωτική επιλογή παραλλαγής">
      <div className={styles.heading}>
        <strong>{title}</strong>
        <span aria-hidden="true">*</span>
      </div>
      <div className={styles.grid}>
        {options.map((option) => {
          const selected = option.canonicalVariantId === currentVariantId;
          const label = optionDisplayName(option, varyingKeys);
          const color = optionColor(option, varyingKeys);
          const unavailable = availabilityMode === "live" && !option.available;
          const className = [styles.option, selected ? styles.selected : "", unavailable ? styles.unavailable : "", option.imageSrc ? styles.withImage : ""]
            .filter(Boolean)
            .join(" ");
          const accessibilityLabel = `${label}${selected ? ", επιλεγμένο" : ""}${unavailable ? ", μη διαθέσιμο" : ""}`;

          return (
            <a
              key={option.canonicalVariantId}
              href={hrefForOption(option)}
              className={className}
              aria-current={selected ? "page" : undefined}
              aria-label={accessibilityLabel}
            >
              {option.imageSrc ? (
                <span className={styles.imageFrame}>
                  <img src={option.imageSrc} alt={option.imageAlt ?? label} loading={selected ? "eager" : "lazy"} />
                </span>
              ) : null}

              <span className={styles.optionBody}>
                {color ? <span className={styles.swatch} style={swatchStyle(color)} aria-hidden="true" /> : null}
                <span className={styles.label}>{label}</span>
                {selected ? <span className={styles.check} aria-hidden="true">✓</span> : null}
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
