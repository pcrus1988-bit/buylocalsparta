import { resolveCatalogColor, type SqlRow } from "@buy-local-sparta/core";
import type { PublicProductVariantAttribute, PublicProductVariantKind, PublicProductVariantOption } from "./public-product-variants";
import type { PublicProductSuitability, PublicSuitableProduct, PublicSuitabilityItem, PublicSuitabilityKind } from "./public-product-suitability";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { getDemoVendorCatalogProduct, type DemoCatalogProduct, type DemoStorefrontVendor, type DemoTechnicalAttribute } from "./demo-storefront";

type DemoClaimRow = SqlRow & {
  target_kind: string;
  target_reference: string | null;
  platform_name: string | null;
  linked_public_id: string | null;
  linked_slug: string | null;
  linked_model: string | null;
  linked_title: string | null;
};

type DemoManualRow = SqlRow & {
  source_website: string | null;
  normalized_payload: unknown;
  raw_payload: unknown;
};

type DemoReferenceProductRow = SqlRow & {
  public_id: string;
  slug: string;
  model: string | null;
  mpn: string | null;
  gtin: string | null;
  title: string;
};

export type DemoProductParity = Readonly<{
  variantOptions: readonly PublicProductVariantOption[];
  varyingVariantKeys: ReadonlySet<string>;
  variantSelectorTitle: string;
  suitability?: PublicProductSuitability;
  manualUrl?: string;
}>;

const VARIANT_DIMENSIONS: Readonly<Record<string, Readonly<{ label: string; kind: PublicProductVariantKind }>>> = {
  color: { label: "Χρώμα", kind: "color" },
  colour: { label: "Χρώμα", kind: "color" },
  size: { label: "Μέγεθος", kind: "size" },
  sizes: { label: "Μέγεθος", kind: "size" },
  capacity: { label: "Χωρητικότητα", kind: "capacity" },
  capacity_l: { label: "Χωρητικότητα", kind: "capacity" },
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
  voltage: { label: "Τάση", kind: "voltage" },
  voltage_v: { label: "Τάση", kind: "voltage" },
  voltage_family: { label: "Τάση", kind: "voltage" },
  pack_qty: { label: "Ποσότητα", kind: "quantity" },
  quantity: { label: "Ποσότητα", kind: "quantity" },
  style: { label: "Στυλ", kind: "style" },
  pattern: { label: "Σχέδιο", kind: "style" },
  finish: { label: "Φινίρισμα", kind: "style" }
};

const SUITABILITY_KEYS: Readonly<Record<string, PublicSuitabilityKind | "meta">> = {
  compatible_models: "model",
  compatible_model: "model",
  suitable_for: "model",
  suitable_for_model: "model",
  suitable_for_models: "model",
  supported_models: "model",
  works_with: "model",
  works_with_models: "model",
  designed_for: "model",
  καταλληλο_για: "model",
  συμβατα_μοντελα: "model",
  compatible_brands: "brand",
  compatible_brand: "brand",
  suitable_for_brands: "brand",
  supported_brands: "brand",
  συμβατες_μαρκες: "brand",
  compatible_platforms: "platform",
  compatible_platform: "platform",
  suitable_for_platforms: "platform",
  supported_platforms: "platform",
  συμβατες_πλατφορμες: "platform",
  compatibility_type: "meta",
  compatibility: "meta",
  compatibility_note: "meta",
  compatibility_notes: "meta"
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

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function splitValues(value: string): readonly string[] {
  return value
    .split(/\s*[;,|\n]\s*|\s+·\s+/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function colorAttribute(value: string): PublicProductVariantAttribute {
  const resolved = resolveCatalogColor(value);
  if (!resolved) return { key: "color", label: "Χρώμα", value, kind: "color" };
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = resolved;
  return { key: "color", label: "Χρώμα", value: resolved.displayNameEl, kind: "color", color: publicColor };
}

function demoVariantAttributes(product: DemoCatalogProduct): readonly PublicProductVariantAttribute[] {
  const attributes: PublicProductVariantAttribute[] = [];
  if (product.color?.trim()) attributes.push(colorAttribute(product.color.trim()));
  const meaningfulSizes = product.sizes.filter((size) => !/^(?:o\/?s|os|one\s*size|one-size)$/i.test(size.trim()));
  if (meaningfulSizes.length) attributes.push({ key: "size", label: "Μέγεθος", value: meaningfulSizes.join(" · "), kind: "size" });

  for (const attribute of product.technicalAttributes) {
    const key = normalizedKey(attribute.key);
    const dimension = VARIANT_DIMENSIONS[key];
    if (!dimension || !attribute.value.trim()) continue;
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

function demoVariantOptions(current: DemoCatalogProduct, siblings: readonly DemoCatalogProduct[]): readonly PublicProductVariantOption[] {
  const products = [current, ...siblings.filter((candidate) => candidate.id !== current.id)];
  return products.map((candidate) => ({
    canonicalVariantId: candidate.id,
    slug: candidate.slug,
    attributes: demoVariantAttributes(candidate),
    // DEMO variants are previews. Do not claim real stock availability before activation.
    available: true,
    fromPriceMinor: candidate.priceMinor > 0 ? candidate.priceMinor : undefined,
    imageSrc: candidate.mediaId
      ? `/api/media/${encodeURIComponent(candidate.mediaId)}`
      : candidate.previewImageSrc,
    imageAlt: candidate.mediaAlt ?? candidate.title
  }));
}

function variantPresentation(options: readonly PublicProductVariantOption[]): Readonly<{ varyingKeys: ReadonlySet<string>; title: string }> {
  const values = new Map<string, Set<string>>();
  for (const option of options) {
    for (const attribute of option.attributes) {
      const group = values.get(attribute.kind) ?? new Set<string>();
      group.add(attribute.value);
      values.set(attribute.kind, group);
    }
  }
  const varyingKinds = new Set([...values.entries()].filter(([, group]) => group.size > 1).map(([kind]) => kind));
  const varyingKeys = new Set(options.flatMap((option) => option.attributes.filter((attribute) => varyingKinds.has(attribute.kind)).map((attribute) => attribute.key)));
  const labels = [...new Set(options.flatMap((option) => option.attributes.filter((attribute) => varyingKinds.has(attribute.kind)).map((attribute) => attribute.label)))];
  return { varyingKeys, title: labels.length === 1 ? labels[0] : "Επιλογή παραλλαγής" };
}

export function isDemoSuitabilityAttribute(attribute: DemoTechnicalAttribute): boolean {
  return Boolean(SUITABILITY_KEYS[normalizedKey(attribute.key)]);
}

function suitabilityItemsFromAttributes(attributes: readonly DemoTechnicalAttribute[]): readonly PublicSuitabilityItem[] {
  const items = new Map<string, PublicSuitabilityItem>();
  for (const attribute of attributes) {
    const kind = SUITABILITY_KEYS[normalizedKey(attribute.key)];
    if (!kind || kind === "meta") continue;
    for (const value of splitValues(attribute.value)) {
      const identity = `${kind}:${normalizedValue(value)}`;
      items.set(identity, { kind, value });
    }
  }
  return [...items.values()];
}

function safeSameSourceUrl(sourceWebsite: string | null, candidate: unknown): string | undefined {
  if (!sourceWebsite || typeof candidate !== "string" || !candidate.trim()) return undefined;
  try {
    const source = new URL(sourceWebsite);
    const asset = new URL(candidate.trim(), source);
    const host = (value: string) => value.toLowerCase().replace(/^www\./, "");
    if (asset.protocol !== "https:" || host(asset.hostname) !== host(source.hostname)) return undefined;
    return asset.toString();
  } catch {
    return undefined;
  }
}

async function demoManualUrl(canonicalVariantId: string): Promise<string | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<DemoManualRow>(`
      SELECT source.website AS source_website,
             latest.normalized_payload,
             latest.raw_payload
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id AND m.code='sparta'
      JOIN catalog_source_product_links csl ON csl.canonical_variant_id=cv.id AND csl.link_status='approved'
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
      JOIN LATERAL (
        SELECT candidate.normalized_payload,candidate.raw_payload
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id
          AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE cv.public_id=$1
        AND cv.suppressed=false
        AND cv.recalled=false
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    `, [canonicalVariantId]);
    const row = result.rows[0];
    if (!row) return undefined;
    const normalized = objectValue(row.normalized_payload);
    const raw = objectValue(row.raw_payload);
    return safeSameSourceUrl(row.source_website, normalized.manualUrl ?? normalized.manual_url ?? raw.manual_url);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "demo_storefront.manual_projection_failed", canonicalVariantId, message: error instanceof Error ? error.message : String(error) }));
    return undefined;
  }
}

function mergeSuitabilityItems(...groups: readonly (readonly PublicSuitabilityItem[])[]): readonly PublicSuitabilityItem[] {
  const items = new Map<string, PublicSuitabilityItem>();
  for (const group of groups) {
    for (const item of group) items.set(`${item.kind}:${normalizedValue(item.value)}`, item);
  }
  return [...items.values()];
}

function identifierTokens(references: readonly string[]): readonly string[] {
  const tokens = new Set<string>();
  for (const reference of references) {
    const raw = reference.trim();
    if (!raw) continue;
    const compact = raw.replace(/\s+/g, "").toLocaleLowerCase("en");
    if (/^[\p{L}\p{N}._/-]{4,}$/u.test(compact) && /\d/u.test(compact)) tokens.add(compact);
    for (const match of raw.matchAll(/[\p{L}\p{N}][\p{L}\p{N}._/-]{2,}/gu)) {
      const token = match[0].replace(/^[._/-]+|[._/-]+$/g, "").toLocaleLowerCase("en");
      if (!token || !/\d/u.test(token) || (/^\d+$/u.test(token) && token.length < 6)) continue;
      if (token.length >= 4) tokens.add(token);
    }
  }
  return [...tokens].slice(0, 60);
}

async function governedDemoSuitability(vendor: DemoStorefrontVendor, product: DemoCatalogProduct): Promise<PublicProductSuitability | undefined> {
  const attributeItems = suitabilityItemsFromAttributes(product.technicalAttributes);
  if (!productionDatabaseConfigured()) return attributeItems.length ? { items: attributeItems, products: [] } : undefined;

  try {
    const result = await getProductionPostgresRuntime().sqlPool.query<DemoClaimRow>(`
      SELECT pcc.target_kind,
             pcc.target_reference,
             platform.name AS platform_name,
             linked.public_id AS linked_public_id,
             linked.slug AS linked_slug,
             linked.model AS linked_model,
             COALESCE(linked_el.title,linked_en.title,linked.model,linked.slug) AS linked_title
      FROM canonical_variants subject
      JOIN markets market ON market.id=subject.market_id AND market.code='sparta'
      JOIN product_compatibility_claims pcc ON pcc.subject_canonical_variant_id=subject.id
      LEFT JOIN compatibility_platforms platform ON platform.id=pcc.target_platform_id
      LEFT JOIN LATERAL (
        SELECT target.*
        FROM canonical_variants target
        JOIN vendor_offers target_offer ON target_offer.canonical_variant_id=target.id
        WHERE target_offer.vendor_id=$2::uuid
          AND target_offer.status IN ('draft','pending_review','approved')
          AND target.id<>subject.id
          AND target.suppressed=false
          AND target.recalled=false
          AND (
            (pcc.target_kind='canonical_variant' AND target.id=pcc.target_canonical_variant_id)
            OR (pcc.target_kind='product_family' AND target.family_id=pcc.target_product_family_id)
            OR (pcc.target_kind='external_model' AND (
              lower(COALESCE(target.model,''))=lower(COALESCE(pcc.target_reference,''))
              OR lower(COALESCE(target.mpn,''))=lower(COALESCE(pcc.target_reference,''))
              OR lower(COALESCE(target.gtin,''))=lower(COALESCE(pcc.target_reference,''))
            ))
          )
        ORDER BY CASE target_offer.status WHEN 'approved' THEN 1 WHEN 'pending_review' THEN 2 ELSE 3 END,
                 target_offer.updated_at DESC,target.public_id
        LIMIT 1
      ) linked ON true
      LEFT JOIN product_translations linked_el ON linked_el.canonical_variant_id=linked.id AND linked_el.locale='el'
      LEFT JOIN product_translations linked_en ON linked_en.canonical_variant_id=linked.id AND linked_en.locale='en'
      WHERE subject.public_id=$1
        AND subject.suppressed=false
        AND subject.recalled=false
        AND pcc.review_status IN ('candidate','verified')
        AND pcc.relationship_type IN ('compatible_with','fits','uses_platform')
        AND (
          pcc.review_status='verified'
          OR (pcc.evidence_level='explicit' AND pcc.confidence>=0.90 AND COALESCE(pcc.evidence->>'basis','') ILIKE '%explicit%')
          OR (pcc.evidence_level='platform' AND pcc.confidence>=0.90)
        )
      ORDER BY CASE pcc.target_kind WHEN 'canonical_variant' THEN 0 WHEN 'product_family' THEN 1 WHEN 'external_model' THEN 2 WHEN 'platform' THEN 3 ELSE 4 END,
               pcc.confidence DESC,pcc.id
      LIMIT 80
    `, [product.id, vendor.uuid]);

    const claimItems: PublicSuitabilityItem[] = [];
    const linked = new Map<string, Readonly<{ id: string; matchedFor: string }>>();
    for (const row of result.rows) {
      if (row.target_kind === "platform") {
        const value = row.platform_name?.trim() || row.target_reference?.trim();
        if (value) claimItems.push({ kind: "platform", value });
      } else {
        const value = row.target_reference?.trim() || row.linked_model?.trim() || row.linked_title?.trim();
        if (value) claimItems.push({ kind: "model", value });
      }
      if (row.linked_public_id) {
        linked.set(row.linked_public_id, { id: row.linked_public_id, matchedFor: row.target_reference?.trim() || row.linked_model?.trim() || row.linked_title?.trim() || "Συμβατό προϊόν" });
      }
    }

    const items = mergeSuitabilityItems(claimItems, attributeItems);
    const modelReferences = items.filter((item) => item.kind === "model").map((item) => item.value);
    const tokens = identifierTokens(modelReferences);
    if (tokens.length && linked.size < 6) {
      const references = await getProductionPostgresRuntime().sqlPool.query<DemoReferenceProductRow>(`
        SELECT DISTINCT ON (cv.id)
               cv.public_id,cv.slug,cv.model,cv.mpn,cv.gtin,
               COALESCE(el.title,en.title,cv.model,cv.slug) AS title
        FROM vendor_offers vo
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
        WHERE vo.vendor_id=$1::uuid
          AND vo.status IN ('draft','pending_review','approved')
          AND cv.public_id<>$2
          AND cv.suppressed=false
          AND cv.recalled=false
          AND (
            lower(COALESCE(cv.model,''))=ANY($3::text[])
            OR lower(COALESCE(cv.mpn,''))=ANY($3::text[])
            OR lower(COALESCE(cv.gtin,''))=ANY($3::text[])
          )
        ORDER BY cv.id,CASE vo.status WHEN 'approved' THEN 1 WHEN 'pending_review' THEN 2 ELSE 3 END,vo.updated_at DESC
        LIMIT 24
      `, [vendor.uuid, product.id, tokens]);
      for (const row of references.rows) {
        if (linked.size >= 6) break;
        const identifiers = [row.model,row.mpn,row.gtin].filter((value): value is string => Boolean(value?.trim()));
        const matchedFor = modelReferences.find((reference) => identifiers.some((identifier) => normalizedValue(reference).includes(normalizedValue(identifier))))
          ?? identifiers[0]
          ?? row.title;
        linked.set(row.public_id, { id: row.public_id, matchedFor });
      }
    }

    const products: PublicSuitableProduct[] = [];
    for (const entry of [...linked.values()].slice(0, 6)) {
      const target = await getDemoVendorCatalogProduct(vendor, entry.id);
      if (!target) continue;
      products.push({
        canonicalVariantId: target.id,
        slug: target.slug,
        title: target.title,
        matchedFor: entry.matchedFor,
        imageSrc: target.mediaId ? `/api/media/${encodeURIComponent(target.mediaId)}` : target.previewImageSrc,
        imageAlt: target.mediaAlt ?? target.title
      });
    }

    return items.length ? { items, products } : undefined;
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "demo_storefront.suitability_projection_failed", vendorId: vendor.id, canonicalVariantId: product.id, message: error instanceof Error ? error.message : String(error) }));
    return attributeItems.length ? { items: attributeItems, products: [] } : undefined;
  }
}

export async function getDemoProductParity(
  vendor: DemoStorefrontVendor,
  product: DemoCatalogProduct,
  siblings: readonly DemoCatalogProduct[]
): Promise<DemoProductParity> {
  const variantOptions = demoVariantOptions(product, siblings);
  const presentation = variantPresentation(variantOptions);
  const [suitability, manualUrl] = await Promise.all([
    governedDemoSuitability(vendor, product),
    demoManualUrl(product.id)
  ]);
  return {
    variantOptions,
    varyingVariantKeys: presentation.varyingKeys,
    variantSelectorTitle: presentation.title,
    suitability,
    manualUrl
  };
}
