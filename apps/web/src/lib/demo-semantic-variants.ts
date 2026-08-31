import { resolveCatalogColor } from "@buy-local-sparta/core";
import type { PublicProductVariantAttribute, PublicProductVariantKind, PublicProductVariantOption } from "./public-product-variants";
import type { DemoCatalogProduct, DemoTechnicalAttribute } from "./demo-storefront";

export type DemoSemanticVariantPresentation = Readonly<{
  options: readonly PublicProductVariantOption[];
  varyingKeys: ReadonlySet<string>;
  title: string;
}>;

const SAFE_SOURCE_VARIANT_DIMENSIONS: Readonly<Record<string, Readonly<{ label: string; kind: PublicProductVariantKind }>>> = {
  color: { label: "Χρώμα", kind: "color" },
  colour: { label: "Χρώμα", kind: "color" },
  size: { label: "Μέγεθος", kind: "size" },
  sizes: { label: "Μέγεθος", kind: "size" },
  capacity: { label: "Χωρητικότητα", kind: "capacity" },
  capacity_l: { label: "Χωρητικότητα", kind: "capacity" },
  battery_capacity_ah: { label: "Χωρητικότητα", kind: "capacity" },
  volume: { label: "Χωρητικότητα", kind: "capacity" },
  material: { label: "Υλικό", kind: "material" },
  length: { label: "Μήκος", kind: "length" },
  length_m: { label: "Μήκος", kind: "length" },
  length_cm: { label: "Μήκος", kind: "length" },
  length_mm: { label: "Μήκος", kind: "length" },
  width: { label: "Πλάτος", kind: "width" },
  width_cm: { label: "Πλάτος", kind: "width" },
  width_mm: { label: "Πλάτος", kind: "width" },
  height: { label: "Ύψος", kind: "height" },
  height_cm: { label: "Ύψος", kind: "height" },
  height_mm: { label: "Ύψος", kind: "height" },
  diameter: { label: "Διάμετρος", kind: "diameter" },
  diameter_mm: { label: "Διάμετρος", kind: "diameter" },
  pack_qty: { label: "Ποσότητα", kind: "quantity" },
  quantity: { label: "Ποσότητα", kind: "quantity" },
  style: { label: "Στυλ", kind: "style" },
  pattern: { label: "Σχέδιο", kind: "style" },
  finish: { label: "Φινίρισμα", kind: "style" }
};

function normalizedKey(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedValue(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el")
    .replace(/[^\p{L}\p{N}._/-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isMeaninglessSize(value: string): boolean {
  return /^(?:o\/?s|os|one\s*size|one-size)$/i.test(value.trim());
}

function isCompatibilityDrivenAttribute(attribute: DemoTechnicalAttribute): boolean {
  const key = normalizedKey(attribute.key);
  return key === "platform"
    || key.startsWith("compatib")
    || key.startsWith("compatible_")
    || key.startsWith("compatibility_")
    || key.startsWith("suitable_for")
    || key.startsWith("supported_")
    || key.startsWith("works_with")
    || key.startsWith("designed_for")
    || key.startsWith("explicit_fitment")
    || key.startsWith("explicit_compatible")
    || key.startsWith("external_compatible")
    || key.startsWith("platform_compatible")
    || key.includes("καταλληλο_για")
    || key.includes("συμβατ");
}

function titleLooksFitmentDriven(title: string): boolean {
  return /(?:\bγια\b|\bfor\b)\s+(?:[\p{L}]{1,8}\s*)?[A-ZΑ-Ω]{1,8}[- ]?\d{3,6}/iu.test(title);
}

function sourceFamilyIsCompatibilityDriven(products: readonly DemoCatalogProduct[]): boolean {
  return products.some((product) => product.technicalAttributes.some(isCompatibilityDrivenAttribute) || titleLooksFitmentDriven(product.title));
}

function colorAttribute(value: string): PublicProductVariantAttribute {
  const resolved = resolveCatalogColor(value);
  if (!resolved) return { key: "color", label: "Χρώμα", value, kind: "color" };
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = resolved;
  return { key: "color", label: "Χρώμα", value: resolved.displayNameEl, kind: "color", color: publicColor };
}

function socketSizeFromTitle(title: string): string | undefined {
  const size = title.match(/\bNo\.?\s*(\d+(?:[.,]\d+)?)\s*mm\b/i)?.[1]?.replace(",", ".");
  if (!size) return undefined;
  const drive = title.match(/\b(\d\s*\/\s*\d)\s*(?:\"|″)/u)?.[1]?.replace(/\s+/g, "");
  return drive ? `${drive}″ · ${size} mm` : `${size} mm`;
}

function variantAttributes(product: DemoCatalogProduct): readonly PublicProductVariantAttribute[] {
  const attributes: PublicProductVariantAttribute[] = [];
  const socketSize = socketSizeFromTitle(product.title);
  if (socketSize) attributes.push({ key: "size", label: "Μέγεθος", value: socketSize, kind: "size" });

  if (product.color?.trim()) attributes.push(colorAttribute(product.color.trim()));
  const meaningfulSizes = product.sizes.filter((size) => !isMeaninglessSize(size));
  if (!socketSize && meaningfulSizes.length) {
    attributes.push({ key: "size", label: "Μέγεθος", value: meaningfulSizes.join(" · "), kind: "size" });
  }

  for (const attribute of product.technicalAttributes) {
    const key = normalizedKey(attribute.key);
    const dimension = SAFE_SOURCE_VARIANT_DIMENSIONS[key];
    if (!dimension || !attribute.value.trim()) continue;
    // Socket ranges historically received unreliable parsed length_mm values. The
    // explicit No.Xmm title is the safer sellable dimension for those families.
    if (socketSize && (dimension.kind === "size" || dimension.kind === "length")) continue;
    if (dimension.kind === "color" && attributes.some((entry) => entry.kind === "color")) continue;
    if (dimension.kind === "size" && attributes.some((entry) => entry.kind === "size")) continue;
    attributes.push(dimension.kind === "color"
      ? colorAttribute(attribute.value.trim())
      : { key, label: dimension.label, value: attribute.value.trim(), kind: dimension.kind });
  }

  const seen = new Set<string>();
  return attributes.filter((attribute) => {
    const identity = `${attribute.kind}:${normalizedValue(attribute.value)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  }).slice(0, 5);
}

function presentation(options: readonly PublicProductVariantOption[]): DemoSemanticVariantPresentation {
  const values = new Map<string, Set<string>>();
  for (const option of options) {
    for (const attribute of option.attributes) {
      const group = values.get(attribute.kind) ?? new Set<string>();
      group.add(normalizedValue(attribute.value));
      values.set(attribute.kind, group);
    }
  }
  const varyingKinds = new Set([...values.entries()].filter(([, group]) => group.size > 1).map(([kind]) => kind));
  const varyingKeys = new Set(options.flatMap((option) => option.attributes.filter((attribute) => varyingKinds.has(attribute.kind)).map((attribute) => attribute.key)));
  const labels = [...new Set(options.flatMap((option) => option.attributes.filter((attribute) => varyingKinds.has(attribute.kind)).map((attribute) => attribute.label)))];
  return { options, varyingKeys, title: labels.length === 1 ? labels[0] : "Επιλογή παραλλαγής" };
}

function emptyPresentation(): DemoSemanticVariantPresentation {
  return { options: [], varyingKeys: new Set<string>(), title: "Επιλογή παραλλαγής" };
}

export function getDemoSemanticSourceVariantPresentation(
  current: DemoCatalogProduct,
  sourceSiblings: readonly DemoCatalogProduct[]
): DemoSemanticVariantPresentation {
  if (!current.variantFamilyId || sourceSiblings.length === 0) return emptyPresentation();

  const products = [current, ...sourceSiblings]
    .filter((product, index, all) => all.findIndex((candidate) => candidate.id === product.id) === index)
    .filter((product) => product.variantFamilyId === current.variantFamilyId)
    .filter((product) => product.categoryCode === current.categoryCode)
    .filter((product) => !current.brand || !product.brand || normalizedValue(product.brand) === normalizedValue(current.brand));

  if (products.length < 2 || sourceFamilyIsCompatibilityDriven(products)) return emptyPresentation();

  const options: PublicProductVariantOption[] = products.slice(0, 24).map((product) => ({
    canonicalVariantId: product.id,
    slug: product.slug,
    attributes: variantAttributes(product),
    available: true,
    fromPriceMinor: product.priceMinor > 0 ? product.priceMinor : undefined,
    imageSrc: product.mediaId ? `/api/media/${encodeURIComponent(product.mediaId)}` : product.previewImageSrc,
    imageAlt: product.mediaAlt ?? product.title
  }));

  const result = presentation(options);
  // Source-family metadata is only a fallback. Require an actual sellable dimension;
  // shared voltage or a source grouping by itself is never enough to create variants.
  return result.varyingKeys.size > 0 ? result : emptyPresentation();
}

export function stripCompatibilityFactsFromDescription(description: string | undefined): string | undefined {
  const value = description?.trim();
  if (!value) return undefined;
  const marker = "Βασικά στοιχεία:";
  const markerIndex = value.indexOf(marker);
  if (markerIndex < 0) return value;

  const intro = value.slice(0, markerIndex).trim();
  const tail = value.slice(markerIndex + marker.length).trim().replace(/\.$/, "");
  const facts = tail
    .split(/\s+·\s+/u)
    .map((fact) => fact.trim())
    .filter(Boolean)
    .filter((fact) => {
      const key = normalizedKey(fact.split(":", 1)[0] ?? "");
      return key !== "platform"
        && !key.startsWith("compatib")
        && !key.startsWith("suitable_for")
        && !key.startsWith("explicit_fitment")
        && !key.includes("συμβατ")
        && !key.includes("καταλληλο");
    });

  if (!facts.length) return intro || undefined;
  return `${intro}${intro ? " " : ""}${marker} ${facts.join(" · ")}.`.trim();
}
