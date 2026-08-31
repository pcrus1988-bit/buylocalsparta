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

function normalizedValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/\s+/g, " ")
    .trim();
}

function governedPresentation(options: readonly PublicProductVariantOption[]) {
  const valuesByKey = new Map<string, Set<string>>();
  const labelByKey = new Map<string, string>();
  for (const option of options) {
    for (const attribute of option.attributes) {
      const values = valuesByKey.get(attribute.key) ?? new Set<string>();
      values.add(normalizedValue(attribute.value));
      valuesByKey.set(attribute.key, values);
      labelByKey.set(attribute.key, attribute.label);
    }
  }
  const varyingKeys = new Set([...valuesByKey.entries()]
    .filter(([, values]) => values.size > 1)
    .map(([key]) => key));
  const labels = [...varyingKeys]
    .map((key) => labelByKey.get(key))
    .filter((label): label is string => Boolean(label));
  return {
    varyingKeys,
    title: labels.length === 1 ? labels[0] : "Επιλογή παραλλαγής"
  };
}

function visibleAttributes(option: PublicProductVariantOption, varyingKeys: ReadonlySet<string>) {
  return option.attributes.filter((attribute) => varyingKeys.has(attribute.key));
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

export function ProductVariantSelector(props: ProductVariantSelectorProps) {
  const {
    currentVariantId,
    options,
    hrefForOption = (option) => `/product/${encodeURIComponent(option.slug)}`,
    availabilityMode = "live"
  } = props;
  if (options.length <= 1) return null;

  // Re-derive the visible axes from canonical attribute keys at the component
  // boundary. This is intentionally independent of legacy callers that used to
  // group attributes by coarse UI kind (for example two different "size" axes).
  const presentation = governedPresentation(options);
  if (presentation.varyingKeys.size === 0) return null;

  return (
    <section className={styles.section} aria-label="Υποχρεωτική επιλογή παραλλαγής">
      <div className={styles.heading}>
        <strong>{presentation.title}</strong>
        <span aria-hidden="true">*</span>
      </div>
      <div className={styles.grid}>
        {options.map((option) => {
          const selected = option.canonicalVariantId === currentVariantId;
          const label = optionDisplayName(option, presentation.varyingKeys);
          const color = optionColor(option, presentation.varyingKeys);
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
                {!option.imageSrc && color ? <span className={styles.swatch} style={swatchStyle(color)} aria-hidden="true" /> : null}
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
