import type { SqlRow } from "@buy-local-sparta/core";
import type { PublicTechnicalAttribute } from "./public-product-detail";
import { getPublicProductDetail } from "./public-product-detail";
import { approvedCatalogImageGallery } from "./public-product-media-gallery";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicSuitabilityKind = "model" | "brand" | "platform";

export type PublicSuitabilityItem = Readonly<{
  kind: PublicSuitabilityKind;
  value: string;
}>;

export type PublicSuitableProduct = Readonly<{
  canonicalVariantId: string;
  slug: string;
  title: string;
  matchedFor: string;
  imageSrc?: string;
  imageAlt?: string;
}>;

export type PublicProductSuitability = Readonly<{
  items: readonly PublicSuitabilityItem[];
  products: readonly PublicSuitableProduct[];
}>;

type SuitableProductRow = SqlRow & {
  canonical_public_id: string;
  slug: string;
  model: string | null;
  mpn: string | null;
  gtin: string | null;
  title: string;
};

const MODEL_KEYS = new Set([
  "compatible_models",
  "compatible_model",
  "suitable_for",
  "suitable_for_model",
  "suitable_for_models",
  "supported_models",
  "works_with",
  "works_with_models",
  "designed_for",
  "καταλληλο_για",
  "συμβατα_μοντελα"
]);

const BRAND_KEYS = new Set([
  "compatible_brands",
  "compatible_brand",
  "suitable_for_brands",
  "supported_brands",
  "συμβατες_μαρκες"
]);

const PLATFORM_KEYS = new Set([
  "compatible_platforms",
  "compatible_platform",
  "suitable_for_platforms",
  "supported_platforms",
  "συμβατες_πλατφορμες"
]);

const COMPATIBILITY_META_KEYS = new Set([
  "compatibility_type",
  "compatibility",
  "compatibility_note",
  "compatibility_notes"
]);

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
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function attributeKind(attribute: PublicTechnicalAttribute): PublicSuitabilityKind | "meta" | undefined {
  const key = normalizedKey(attribute.key);
  if (MODEL_KEYS.has(key)) return "model";
  if (BRAND_KEYS.has(key)) return "brand";
  if (PLATFORM_KEYS.has(key)) return "platform";
  if (COMPATIBILITY_META_KEYS.has(key)) return "meta";
  return undefined;
}

export function isPublicSuitabilityAttribute(attribute: PublicTechnicalAttribute): boolean {
  return Boolean(attributeKind(attribute));
}

function splitCompatibilityValues(value: string): readonly string[] {
  return value
    .split(/\s*[;,|\n]\s*|\s+·\s+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function collectItems(attributes: readonly PublicTechnicalAttribute[]): readonly PublicSuitabilityItem[] {
  const byIdentity = new Map<string, PublicSuitabilityItem>();
  for (const attribute of attributes) {
    const kind = attributeKind(attribute);
    if (!kind || kind === "meta") continue;
    for (const value of splitCompatibilityValues(attribute.value)) {
      const identity = `${kind}:${normalizedValue(value)}`;
      if (!identity.endsWith(":")) byIdentity.set(identity, { kind, value });
    }
  }
  return [...byIdentity.values()];
}

function identifierTokens(references: readonly string[]): readonly string[] {
  const tokens = new Set<string>();
  for (const reference of references) {
    const raw = reference.trim();
    if (!raw) continue;
    const compactReference = raw.replace(/\s+/g, "").toLocaleLowerCase("en");
    if (/^[\p{L}\p{N}._/-]{4,}$/u.test(compactReference) && /\d/u.test(compactReference)) tokens.add(compactReference);

    for (const match of raw.matchAll(/[\p{L}\p{N}][\p{L}\p{N}._/-]{2,}/gu)) {
      const token = match[0].replace(/^[._/-]+|[._/-]+$/g, "").toLocaleLowerCase("en");
      if (!token || !/\d/u.test(token)) continue;
      if (/^\d+$/u.test(token) && token.length < 6) continue;
      if (token.length >= 4) tokens.add(token);
    }
  }
  return [...tokens].slice(0, 40);
}

function matchReference(row: SuitableProductRow, references: readonly string[], tokens: ReadonlySet<string>): string | undefined {
  const candidateIdentifiers = [row.model, row.mpn, row.gtin]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim().toLocaleLowerCase("en"));

  for (const identifier of candidateIdentifiers) {
    if (tokens.has(identifier)) {
      return references.find((reference) => normalizedValue(reference).includes(normalizedValue(identifier))) ?? identifier;
    }
  }

  const normalizedTitle = normalizedValue(row.title);
  const normalizedModel = normalizedValue(row.model ?? "");
  const normalizedMpn = normalizedValue(row.mpn ?? "");
  for (const reference of references) {
    const normalizedReference = normalizedValue(reference);
    if (normalizedReference.length < 4) continue;
    if (normalizedModel.length >= 4 && normalizedReference.includes(normalizedModel)) return reference;
    if (normalizedMpn.length >= 4 && normalizedReference.includes(normalizedMpn)) return reference;
    if (normalizedReference.length >= 6 && normalizedTitle.includes(normalizedReference)) return reference;
  }
  return undefined;
}

async function linkedSuitableProducts(
  currentCanonicalVariantId: string,
  references: readonly string[]
): Promise<readonly PublicSuitableProduct[]> {
  if (!references.length || !productionDatabaseConfigured()) return [];
  const identifierList = identifierTokens(references);
  if (!identifierList.length) return [];
  const identifierSet = new Set(identifierList);

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<SuitableProductRow>(`
      SELECT cv.public_id AS canonical_public_id,
             cv.slug,
             cv.model,
             cv.mpn,
             cv.gtin,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS title
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND cv.public_id<>$1
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND EXISTS (
          SELECT 1
          FROM vendor_offers vo
          JOIN vendor_businesses v ON v.id=vo.vendor_id
          WHERE vo.canonical_variant_id=cv.id
            AND vo.status='approved'
            AND v.status='active'
        )
        AND (
          lower(COALESCE(cv.model,''))=ANY($2::text[])
          OR lower(COALESCE(cv.mpn,''))=ANY($2::text[])
          OR lower(COALESCE(cv.gtin,''))=ANY($2::text[])
        )
      ORDER BY COALESCE(el.title,en.title,cv.model,cv.slug),cv.public_id
      LIMIT 24
    `, [currentCanonicalVariantId, identifierList]);

    const matched = result.rows
      .map((row) => ({ row, matchedFor: matchReference(row, references, identifierSet) }))
      .filter((entry): entry is { row: SuitableProductRow; matchedFor: string } => Boolean(entry.matchedFor))
      .slice(0, 6);

    return Promise.all(matched.map(async ({ row, matchedFor }) => {
      const canonicalVariantId = String(row.canonical_public_id);
      const [gallery, detail] = await Promise.all([
        approvedCatalogImageGallery({ canonicalVariantId }, 1),
        getPublicProductDetail(canonicalVariantId)
      ]);
      const primaryImage = gallery[0];
      return {
        canonicalVariantId,
        slug: String(row.slug),
        title: String(row.title),
        matchedFor,
        imageSrc: primaryImage
          ? `/api/media/${encodeURIComponent(primaryImage.mediaId)}`
          : detail?.sourceImageUrl
            ? `/api/catalog-source-image/${encodeURIComponent(canonicalVariantId)}`
            : undefined,
        imageAlt: primaryImage?.altText ?? String(row.title)
      };
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_suitability_links_failed",
      canonicalVariantId: currentCanonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
}

export async function getPublicProductSuitability(
  canonicalVariantId: string,
  attributes: readonly PublicTechnicalAttribute[]
): Promise<PublicProductSuitability | undefined> {
  const items = collectItems(attributes);
  if (!items.length) return undefined;
  const modelReferences = items.filter((item) => item.kind === "model").map((item) => item.value);
  const products = await linkedSuitableProducts(canonicalVariantId, modelReferences);
  return { items, products };
}
