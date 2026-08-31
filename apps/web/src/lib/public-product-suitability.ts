import type { SqlRow } from "@buy-local-sparta/core";
import type { PublicTechnicalAttribute } from "./public-product-detail";
import { getPublicProductDetail } from "./public-product-detail";
import { approvedCatalogImageGallery } from "./public-product-media-gallery";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { isCompatibilityPresentationKey } from "./product-presentation-guards";

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

type CompatibilityClaimRow = SqlRow & {
  target_kind: string;
  target_reference: string | null;
  relationship_type: string;
  platform_name: string | null;
  linked_public_id: string | null;
  linked_slug: string | null;
  linked_model: string | null;
  linked_mpn: string | null;
  linked_gtin: string | null;
  linked_title: string | null;
};

type ClaimProjection = Readonly<{
  items: readonly PublicSuitabilityItem[];
  directProducts: readonly { row: SuitableProductRow; matchedFor: string }[];
}>;

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
  "explicit_fitment_models",
  "explicit_compatible_models",
  "explicit_compatible_models_all",
  "explicit_compatible_models_validated",
  "external_compatible_models",
  "platform_compatible_models",
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
  "compatibility_notes",
  "compatibility_confidence",
  "compatibility_claims_json",
  "compatibility_relationship_json",
  "compatibility_interface_json",
  "compatibility_evidence_url",
  "compatibility_evidence_basis",
  "compatibility_discrepancy_flags",
  "unresolved_compatibility_tokens"
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
  return Boolean(attributeKind(attribute)) || isCompatibilityPresentationKey(attribute.key);
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

function mergeItems(...groups: readonly (readonly PublicSuitabilityItem[])[]): readonly PublicSuitabilityItem[] {
  const byIdentity = new Map<string, PublicSuitabilityItem>();
  for (const group of groups) {
    for (const item of group) {
      const identity = `${item.kind}:${normalizedValue(item.value)}`;
      if (!identity.endsWith(":")) byIdentity.set(identity, item);
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
  return [...tokens].slice(0, 60);
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

async function governedClaimProjection(canonicalVariantId: string): Promise<ClaimProjection> {
  if (!productionDatabaseConfigured()) return { items: [], directProducts: [] };

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<CompatibilityClaimRow>(`
      SELECT pcc.target_kind,
             pcc.target_reference,
             pcc.relationship_type,
             platform.name AS platform_name,
             linked.public_id AS linked_public_id,
             linked.slug AS linked_slug,
             linked.model AS linked_model,
             linked.mpn AS linked_mpn,
             linked.gtin AS linked_gtin,
             COALESCE(linked_el.title,linked_en.title,linked.model,linked.slug) AS linked_title
      FROM canonical_variants subject
      JOIN markets market ON market.id=subject.market_id AND market.code='sparta'
      JOIN product_compatibility_claims pcc ON pcc.subject_canonical_variant_id=subject.id
      LEFT JOIN compatibility_platforms platform ON platform.id=pcc.target_platform_id
      LEFT JOIN LATERAL (
        SELECT target.*
        FROM canonical_variants target
        JOIN markets target_market ON target_market.id=target.market_id AND target_market.code='sparta'
        WHERE target.id<>subject.id
          AND target.active=true
          AND target.suppressed=false
          AND target.recalled=false
          AND (
            (pcc.target_kind='canonical_variant' AND target.id=pcc.target_canonical_variant_id)
            OR (pcc.target_kind='product_family' AND target.family_id=pcc.target_product_family_id)
          )
        ORDER BY target.public_id
        LIMIT 1
      ) linked ON true
      LEFT JOIN product_translations linked_el ON linked_el.canonical_variant_id=linked.id AND linked_el.locale='el'
      LEFT JOIN product_translations linked_en ON linked_en.canonical_variant_id=linked.id AND linked_en.locale='en'
      WHERE subject.public_id=$1
        AND subject.active=true
        AND subject.suppressed=false
        AND subject.recalled=false
        AND pcc.review_status IN ('candidate','verified')
        AND pcc.relationship_type IN ('compatible_with','fits','uses_platform')
        AND (
          pcc.review_status='verified'
          OR (
            pcc.evidence_level='explicit'
            AND pcc.confidence>=0.90
            AND COALESCE(pcc.evidence->>'basis','') ILIKE '%explicit%'
          )
          OR (
            pcc.evidence_level='platform'
            AND pcc.confidence>=0.90
          )
        )
      ORDER BY CASE pcc.target_kind WHEN 'canonical_variant' THEN 0 WHEN 'product_family' THEN 1 WHEN 'external_model' THEN 2 WHEN 'platform' THEN 3 ELSE 4 END,
               pcc.confidence DESC,
               pcc.target_reference NULLS LAST,
               pcc.id
      LIMIT 80
    `, [canonicalVariantId]);

    const items: PublicSuitabilityItem[] = [];
    const directProducts: { row: SuitableProductRow; matchedFor: string }[] = [];
    for (const claim of result.rows) {
      if (claim.target_kind === "platform") {
        const value = claim.platform_name?.trim() || claim.target_reference?.trim();
        if (value) items.push({ kind: "platform", value });
        continue;
      }

      if (claim.target_kind === "external_model") {
        const value = claim.target_reference?.trim();
        if (value) items.push({ kind: "model", value });
        continue;
      }

      if ((claim.target_kind === "canonical_variant" || claim.target_kind === "product_family") && claim.linked_public_id && claim.linked_slug && claim.linked_title) {
        const matchedFor = claim.linked_model?.trim() || claim.linked_title.trim();
        items.push({ kind: "model", value: matchedFor });
        directProducts.push({
          row: {
            canonical_public_id: claim.linked_public_id,
            slug: claim.linked_slug,
            model: claim.linked_model,
            mpn: claim.linked_mpn,
            gtin: claim.linked_gtin,
            title: claim.linked_title
          },
          matchedFor
        });
      }
    }

    return { items: mergeItems(items), directProducts };
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_compatibility_claims_failed",
      canonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return { items: [], directProducts: [] };
  }
}

async function matchedProductsForReferences(
  currentCanonicalVariantId: string,
  references: readonly string[]
): Promise<readonly { row: SuitableProductRow; matchedFor: string }[]> {
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
        AND (
          lower(COALESCE(cv.model,''))=ANY($2::text[])
          OR lower(COALESCE(cv.mpn,''))=ANY($2::text[])
          OR lower(COALESCE(cv.gtin,''))=ANY($2::text[])
        )
      ORDER BY COALESCE(el.title,en.title,cv.model,cv.slug),cv.public_id
      LIMIT 32
    `, [currentCanonicalVariantId, identifierList]);

    return result.rows
      .map((row) => ({ row, matchedFor: matchReference(row, references, identifierSet) }))
      .filter((entry): entry is { row: SuitableProductRow; matchedFor: string } => Boolean(entry.matchedFor));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.product_suitability_reference_match_failed",
      canonicalVariantId: currentCanonicalVariantId,
      message: error instanceof Error ? error.message : String(error)
    }));
    return [];
  }
}

async function hydrateProducts(
  matches: readonly { row: SuitableProductRow; matchedFor: string }[]
): Promise<readonly PublicSuitableProduct[]> {
  const unique = new Map<string, { row: SuitableProductRow; matchedFor: string }>();
  for (const match of matches) {
    const id = String(match.row.canonical_public_id);
    if (!unique.has(id)) unique.set(id, match);
    if (unique.size >= 6) break;
  }

  return Promise.all([...unique.values()].map(async ({ row, matchedFor }) => {
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
}

export async function getPublicProductSuitability(
  canonicalVariantId: string,
  attributes: readonly PublicTechnicalAttribute[]
): Promise<PublicProductSuitability | undefined> {
  const attributeItems = collectItems(attributes);
  const claims = await governedClaimProjection(canonicalVariantId);
  const items = mergeItems(claims.items, attributeItems);
  if (!items.length) return undefined;

  const modelReferences = items.filter((item) => item.kind === "model").map((item) => item.value);
  const referenceProducts = await matchedProductsForReferences(canonicalVariantId, modelReferences);
  const products = await hydrateProducts([...claims.directProducts, ...referenceProducts]);
  return { items, products };
}
