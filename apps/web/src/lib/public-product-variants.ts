import { resolveCatalogColor, type ResolvedCatalogColor, type SqlRow } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type PublicProductVariantKind = "color" | "size" | "capacity" | "material" | "length" | "width" | "height" | "diameter" | "voltage" | "quantity" | "style" | "other";

export type PublicProductVariantColor = Readonly<Pick<ResolvedCatalogColor,
  "key" | "displayNameEl" | "displayNameEn" | "hex" | "ralApprox" | "rgb" | "hsl" | "cmyk" | "swatchKind"
>>;

export type PublicProductVariantAttribute = Readonly<{
  key: string;
  label: string;
  value: string;
  kind: PublicProductVariantKind;
  color?: PublicProductVariantColor;
}>;

export type PublicProductVariantOption = Readonly<{
  canonicalVariantId: string;
  slug: string;
  attributes: readonly PublicProductVariantAttribute[];
  available: boolean;
  fromPriceMinor?: number;
  imageSrc?: string;
  imageAlt?: string;
}>;

export type PublicProductVariantPresentation = Readonly<{
  options: readonly PublicProductVariantOption[];
  varyingKeys: ReadonlySet<string>;
  title: string;
}>;

type VariantScope = Readonly<
  | { mode: "live" }
  | { mode: "demo"; vendorId: string }
>;

type ProductOptionContextRow = SqlRow & {
  canonical_uuid: string;
  family_id: string | null;
  market_id: string;
  category_id: string;
  brand_id: string | null;
  product_type_id: string | null;
  source_id: string | null;
  source_variant_family_id: string | null;
};

type GovernedAxisRow = SqlRow & {
  attribute_id: string;
  attribute_code: string;
  data_type: string;
  unit: string | null;
  group_code: string | null;
  label_el: string;
  variant_axis_order: number | null;
};

type VariantOptionRow = SqlRow & {
  canonical_uuid: string;
  canonical_public_id: string;
  slug: string;
  variant_attributes: unknown;
  from_price_minor: string | number | null;
  available: boolean;
  media_public_id: string | null;
  media_alt_text: string | null;
  source_image_candidate: string | null;
  source_website: string | null;
};

type CanonicalEvidenceRow = SqlRow & {
  canonical_variant_id: string;
  attribute_id: string;
  value_label: string | null;
  value_code: string | null;
  text_value: string | null;
  number_value: string | number | null;
  boolean_value: boolean | null;
  dimension_value: unknown;
};

type SourceEvidenceRow = SqlRow & {
  canonical_variant_id: string;
  attribute_id: string;
  value_label: string | null;
  value_code: string | null;
  normalized_value: unknown;
  raw_value: unknown;
};

type GovernedAxis = Readonly<{
  id: string;
  code: string;
  dataType: string;
  unit?: string;
  groupCode?: string;
  label: string;
  kind: PublicProductVariantKind;
  order: number;
}>;

const COMPATIBILITY_ATTRIBUTE_PATTERN = /(?:^|_)(?:compatib|compatible|compatibility|suitable_for|supported_models?|works_with|fitment|platform_compatible)(?:_|$)/u;

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
    .replace(/[^\p{L}\p{N}.,+/%-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function scalarValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    const result = String(value).trim();
    return result || undefined;
  }
  if (typeof value === "boolean") return value ? "Ναι" : "Όχι";
  if (Array.isArray(value)) {
    const values = value.map(scalarValue).filter((entry): entry is string => Boolean(entry));
    return values.length ? [...new Set(values)].join(" · ") : undefined;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of ["label", "text", "value", "amount", "number", "normalizedValue"]) {
      const result = scalarValue(record[key]);
      if (result) return result;
    }
  }
  return undefined;
}

function camelCaseKey(code: string): string {
  return code.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());
}

function variantKindForAxis(code: string, label: string, groupCode?: string): PublicProductVariantKind {
  const semantic = normalizedKey(`${code}_${label}_${groupCode ?? ""}`);
  if (semantic.includes("temperature")) return "other";
  if (semantic.includes("colour") || semantic.includes("color") || semantic.includes("shade")) return "color";
  if (semantic.includes("diameter") || semantic.includes("διαμετρ")) return "diameter";
  if (semantic.includes("width") || semantic.includes("πλατ")) return "width";
  if (semantic.includes("height") || semantic.includes("drop") || semantic.includes("υψ")) return "height";
  if (semantic.includes("length") || semantic.includes("μηκ")) return "length";
  if (semantic.includes("size") || semantic.includes("μεγεθ")) return "size";
  if (semantic.includes("capacity") || semantic.includes("volume") || semantic.includes("χωρητικ") || semantic.includes("ογκο")) return "capacity";
  if (semantic.includes("material") || semantic.includes("composition") || semantic.includes("υλικο") || semantic.includes("συνθεση")) return "material";
  if (semantic.includes("voltage") || semantic.includes("ταση")) return "voltage";
  if (semantic.includes("quantity") || semantic.includes("count") || semantic.includes("pack_qty") || semantic.includes("ποσοτ")) return "quantity";
  if (semantic.includes("style") || semantic.includes("pattern") || semantic.includes("finish") || semantic.includes("ruling") || semantic.includes("σχεδ")) return "style";
  return "other";
}

function presentedAxisLabel(code: string, label: string, kind: PublicProductVariantKind): string {
  const normalizedCode = normalizedKey(code);
  if (kind === "color" && (normalizedCode === "manufacturer_colour" || normalizedCode === "manufacturer_color" || normalizedCode === "colour" || normalizedCode === "color")) return "Χρώμα";
  return label.trim() || code;
}

function directAliasKeys(axis: GovernedAxis): readonly string[] {
  const keys = new Set<string>([axis.code, camelCaseKey(axis.code)]);
  if (axis.kind === "color") ["color", "colour", "color_name", "colour_name"].forEach((key) => keys.add(key));
  if (axis.kind === "size") ["size", "sizes"].forEach((key) => keys.add(key));
  if (axis.kind === "capacity") ["capacity", "volume"].forEach((key) => keys.add(key));
  if (axis.kind === "material") ["material"].forEach((key) => keys.add(key));
  if (axis.kind === "length") ["length"].forEach((key) => keys.add(key));
  if (axis.kind === "width") ["width"].forEach((key) => keys.add(key));
  if (axis.kind === "height") ["height"].forEach((key) => keys.add(key));
  if (axis.kind === "diameter") ["diameter"].forEach((key) => keys.add(key));
  if (axis.kind === "voltage") ["voltage"].forEach((key) => keys.add(key));
  if (axis.kind === "quantity") ["quantity", "pack_qty", "packQuantity"].forEach((key) => keys.add(key));
  if (axis.code === "manufacturer_variant") ["variant_label", "variantLabel"].forEach((key) => keys.add(key));
  return [...keys];
}

function directVariantValue(attributes: unknown, axis: GovernedAxis): string | undefined {
  const record = objectValue(attributes);
  if (!Object.keys(record).length) return undefined;
  const normalizedEntries = new Map(Object.entries(record).map(([key, value]) => [normalizedKey(key), value]));
  for (const key of directAliasKeys(axis)) {
    const value = normalizedEntries.get(normalizedKey(key));
    const displayed = scalarValue(value);
    if (displayed) return displayed;
  }
  return undefined;
}

function localizedUnit(unit: string): string {
  const normalized = unit.trim().toLocaleLowerCase("en");
  if (normalized === "items" || normalized === "item" || normalized === "pcs" || normalized === "pieces") return "τεμ.";
  if (normalized === "sheets" || normalized === "sheet") return "φύλλα";
  return unit.trim();
}

function withUnit(value: string, unit?: string): string {
  const trimmed = value.trim();
  if (!trimmed || !unit) return trimmed;
  const displayUnit = localizedUnit(unit);
  const escaped = displayUnit.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`(?:^|\\s)${escaped}$`, "i").test(trimmed)) return trimmed;
  return `${trimmed} ${displayUnit}`;
}

function colorAttribute(axis: GovernedAxis, value: string): PublicProductVariantAttribute {
  const resolved = resolveCatalogColor(value);
  if (!resolved) return { key: axis.code, label: axis.label, value, kind: "color" };
  const { sourceValue: _sourceValue, matchedAlias: _matchedAlias, ...publicColor } = resolved;
  return {
    key: axis.code,
    label: axis.label,
    value: resolved.displayNameEl,
    kind: "color",
    color: publicColor
  };
}

function variantAttribute(axis: GovernedAxis, rawValue: string): PublicProductVariantAttribute {
  const value = withUnit(rawValue, axis.unit);
  return axis.kind === "color"
    ? colorAttribute(axis, rawValue)
    : { key: axis.code, label: axis.label, value, kind: axis.kind };
}

function safePriceMinor(value: string | number | null): number | undefined {
  if (value === null) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function safeSameSourceImage(sourceWebsite: string | null, sourceImage: string | null): boolean {
  if (!sourceWebsite || !sourceImage) return false;
  try {
    const source = new URL(sourceWebsite);
    const image = new URL(sourceImage, source);
    const normalizeHost = (host: string) => host.toLowerCase().replace(/^www\./, "");
    return image.protocol === "https:" && normalizeHost(image.hostname) === normalizeHost(source.hostname);
  } catch {
    return false;
  }
}

function variantImage(row: VariantOptionRow): Pick<PublicProductVariantOption, "imageSrc" | "imageAlt"> {
  if (row.media_public_id) {
    return {
      imageSrc: `/api/media/${encodeURIComponent(String(row.media_public_id))}`,
      imageAlt: row.media_alt_text?.trim() || undefined
    };
  }
  if (safeSameSourceImage(row.source_website, row.source_image_candidate)) {
    return { imageSrc: `/api/catalog-source-image/${encodeURIComponent(String(row.canonical_public_id))}` };
  }
  return {};
}

async function productOptionContext(canonicalVariantId: string, allowInactive: boolean): Promise<ProductOptionContextRow | undefined> {
  const result = await getProductionPostgresRuntime().nativePool.query<ProductOptionContextRow>(`
    SELECT cv.id::text AS canonical_uuid,
           cv.family_id::text AS family_id,
           cv.market_id::text AS market_id,
           cv.category_id::text AS category_id,
           cv.brand_id::text AS brand_id,
           COALESCE(pf.product_type_id::text,source_type.product_type_id,category_default.product_type_id) AS product_type_id,
           source_family.source_id,
           source_family.variant_family_id AS source_variant_family_id
    FROM canonical_variants cv
    JOIN markets market ON market.id=cv.market_id AND market.code='sparta'
    LEFT JOIN product_families pf ON pf.id=cv.family_id
    LEFT JOIN LATERAL (
      SELECT linked.source_id::text AS source_id,
             COALESCE(
               NULLIF(latest.normalized_payload->>'variantFamilyId',''),
               NULLIF(latest.raw_payload->>'variant_family_id',''),
               NULLIF(linked.normalized_payload->>'variantFamilyId',''),
               NULLIF(linked.raw_payload->>'variant_family_id','')
             ) AS variant_family_id
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN LATERAL (
        SELECT candidate.normalized_payload,candidate.raw_payload
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id
          AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE csl.canonical_variant_id=cv.id
        AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) source_family ON true
    LEFT JOIN LATERAL (
      SELECT mr.product_type_id::text AS product_type_id
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_source_attribute_mapping_rules mr
        ON mr.source_id=linked.source_id
       AND mr.status='approved'
       AND (
         (mr.scope_kind='taxonomy_node' AND mr.scope_key=linked.source_taxonomy_node_id::text)
         OR
         (mr.scope_kind='source_category' AND mr.scope_key=COALESCE(
           NULLIF(btrim(linked.source_identity->>'categoryId'),''),
           NULLIF(btrim(linked.source_identity->>'category_id'),''),
           NULLIF(btrim(linked.normalized_payload->>'sourceCategoryId'),'')
         ))
       )
      JOIN product_types source_pt ON source_pt.id=mr.product_type_id AND source_pt.status='active'
      WHERE csl.canonical_variant_id=cv.id
        AND csl.link_status='approved'
      GROUP BY mr.product_type_id
      ORDER BY count(*) DESC,max(mr.reviewed_at) DESC NULLS LAST,mr.product_type_id
      LIMIT 1
    ) source_type ON true
    LEFT JOIN LATERAL (
      SELECT cpt.product_type_id::text AS product_type_id
      FROM category_product_types cpt
      JOIN product_types default_pt ON default_pt.id=cpt.product_type_id AND default_pt.status='active'
      WHERE cpt.category_id=cv.category_id
        AND cpt.is_default=true
      ORDER BY cpt.sort_order,cpt.product_type_id
      LIMIT 1
    ) category_default ON true
    WHERE cv.public_id=$1
      AND ($2::boolean OR cv.active=true)
      AND cv.suppressed=false
      AND cv.recalled=false
    LIMIT 1
  `, [canonicalVariantId, allowInactive]);
  return result.rows[0];
}

async function governedAxes(productTypeId: string): Promise<readonly GovernedAxis[]> {
  const result = await getProductionPostgresRuntime().nativePool.query<GovernedAxisRow>(`
    SELECT ad.id::text AS attribute_id,
           ad.code AS attribute_code,
           ad.data_type,
           COALESCE(pta.unit_override,ad.unit) AS unit,
           ad.group_code AS group_code,
           COALESCE(NULLIF(at.label,''),ad.code) AS label_el,
           pta.variant_axis_order
    FROM product_type_attributes pta
    JOIN product_types pt ON pt.id=pta.product_type_id AND pt.status='active'
    JOIN attribute_definitions ad ON ad.id=pta.attribute_id AND ad.active=true
    LEFT JOIN attribute_translations at ON at.attribute_id=ad.id AND upper(at.locale)='EL'
    WHERE pta.product_type_id=$1::uuid
      AND pta.variant_defining=true
      AND pta.customer_visible=true
      AND pta.value_level='variant'
    ORDER BY pta.variant_axis_order NULLS LAST,pta.sort_order,ad.code
  `, [productTypeId]);

  return result.rows
    .filter((row) => !COMPATIBILITY_ATTRIBUTE_PATTERN.test(normalizedKey(row.attribute_code)))
    .map((row, index) => {
      const kind = variantKindForAxis(row.attribute_code, row.label_el, row.group_code ?? undefined);
      return {
        id: row.attribute_id,
        code: row.attribute_code,
        dataType: row.data_type,
        unit: row.unit ?? undefined,
        groupCode: row.group_code ?? undefined,
        label: presentedAxisLabel(row.attribute_code, row.label_el, kind),
        kind,
        order: row.variant_axis_order ?? 10_000 + index
      } satisfies GovernedAxis;
    });
}

async function candidateRows(context: ProductOptionContextRow, scope: VariantScope): Promise<readonly VariantOptionRow[]> {
  const demoMode = scope.mode === "demo";
  const demoVendorId = scope.mode === "demo" ? scope.vendorId : null;
  const result = await getProductionPostgresRuntime().nativePool.query<VariantOptionRow>(`
    SELECT sibling.id::text AS canonical_uuid,
           sibling.public_id AS canonical_public_id,
           sibling.slug,
           sibling.variant_attributes,
           CASE WHEN $8::boolean THEN demo_offer.from_price_minor ELSE eligible.from_price_minor END AS from_price_minor,
           CASE WHEN $8::boolean THEN true ELSE (eligible.from_price_minor IS NOT NULL) END AS available,
           governed_media.media_public_id,
           governed_media.media_alt_text,
           source_image.source_image_candidate,
           source_image.source_website
    FROM canonical_variants sibling
    LEFT JOIN LATERAL (
      SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor
      FROM vendor_offers vo
      WHERE $8::boolean
        AND vo.canonical_variant_id=sibling.id
        AND vo.vendor_id=$9::uuid
        AND vo.status IN ('draft','pending_review','approved')
        AND vo.customer_price_minor>0
    ) demo_offer ON true
    LEFT JOIN LATERAL (
      SELECT MIN(vo.customer_price_minor)::bigint AS from_price_minor
      FROM vendor_offers vo
      JOIN vendor_businesses vendor ON vendor.id=vo.vendor_id
      JOIN vendor_locations location ON location.id=vo.location_id
      JOIN inventory_balances inventory ON inventory.offer_id=vo.id
      WHERE NOT $8::boolean
        AND vo.canonical_variant_id=sibling.id
        AND vo.status='approved'
        AND vo.customer_price_minor>0
        AND vendor.status='active'
        AND location.active=true
        AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,inventory.on_hand-inventory.active_reservations-inventory.safety_stock-inventory.blocked)>=1
        AND inventory.stock_confirmed_at + make_interval(secs=>inventory.freshness_ttl_seconds)>now()
    ) eligible ON true
    LEFT JOIN LATERAL (
      SELECT media.public_id AS media_public_id,media.alt_text AS media_alt_text
      FROM product_media media
      WHERE media.canonical_variant_id=sibling.id
        AND media.kind='image'
        AND media.scan_status='clean'
        AND media.rights_status='approved'
        AND media.moderation_status='approved'
        AND media.object_key IS NOT NULL
        AND media.content_type IN ('image/jpeg','image/png','image/webp')
      ORDER BY CASE WHEN media.vendor_id IS NULL THEN 0 ELSE 1 END,
               media.reviewed_at DESC NULLS LAST,media.created_at DESC,media.public_id
      LIMIT 1
    ) governed_media ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(latest.source_image_url,latest.normalized_payload->>'imageUrl',latest.raw_payload->>'image_url') AS source_image_candidate,
             source.website AS source_website
      FROM catalog_source_product_links csl
      JOIN catalog_source_products linked ON linked.id=csl.source_product_id
      JOIN catalog_sources source ON source.id=linked.source_id AND source.active=true
      JOIN LATERAL (
        SELECT candidate.*
        FROM catalog_source_products candidate
        JOIN catalog_source_snapshots snapshot ON snapshot.id=candidate.snapshot_id
        WHERE candidate.source_id=linked.source_id
          AND candidate.source_product_key=linked.source_product_key
        ORDER BY snapshot.observed_at DESC NULLS LAST,candidate.created_at DESC,candidate.id DESC
        LIMIT 1
      ) latest ON true
      WHERE csl.canonical_variant_id=sibling.id
        AND csl.link_status='approved'
      ORDER BY csl.confidence DESC,csl.updated_at DESC,csl.id DESC
      LIMIT 1
    ) source_image ON true
    WHERE sibling.market_id=$3::uuid
      AND sibling.category_id=$4::uuid
      AND ($5::uuid IS NULL OR sibling.brand_id=$5::uuid)
      AND sibling.suppressed=false
      AND sibling.recalled=false
      AND (
        ($2::uuid IS NOT NULL AND sibling.family_id=$2::uuid)
        OR
        ($6::uuid IS NOT NULL AND $7::text IS NOT NULL AND EXISTS (
          SELECT 1
          FROM catalog_source_product_links family_link
          JOIN catalog_source_products family_product ON family_product.id=family_link.source_product_id
          WHERE family_link.canonical_variant_id=sibling.id
            AND family_link.link_status='approved'
            AND family_product.source_id=$6::uuid
            AND COALESCE(
              NULLIF(family_product.normalized_payload->>'variantFamilyId',''),
              NULLIF(family_product.raw_payload->>'variant_family_id','')
            )=$7::text
        ))
      )
      AND (
        (NOT $8::boolean AND sibling.active=true)
        OR
        ($8::boolean AND EXISTS (
          SELECT 1 FROM vendor_offers preview_offer
          WHERE preview_offer.canonical_variant_id=sibling.id
            AND preview_offer.vendor_id=$9::uuid
            AND preview_offer.status IN ('draft','pending_review','approved')
        ))
      )
    ORDER BY CASE WHEN sibling.id=$1::uuid THEN 0 ELSE 1 END,sibling.slug
    LIMIT 100
  `, [
    context.canonical_uuid,
    context.family_id,
    context.market_id,
    context.category_id,
    context.brand_id,
    context.source_id,
    context.source_variant_family_id,
    demoMode,
    demoVendorId
  ]);
  return result.rows;
}

async function evidenceRows(candidateIds: readonly string[], axes: readonly GovernedAxis[]): Promise<Readonly<{
  canonical: readonly CanonicalEvidenceRow[];
  source: readonly SourceEvidenceRow[];
}>> {
  if (!candidateIds.length || !axes.length) return { canonical: [], source: [] };
  const axisIds = axes.map((axis) => axis.id);
  const [canonical, source] = await Promise.all([
    getProductionPostgresRuntime().nativePool.query<CanonicalEvidenceRow>(`
      SELECT cvav.canonical_variant_id::text AS canonical_variant_id,
             cvav.attribute_id::text AS attribute_id,
             COALESCE(NULLIF(avt.label,''),av.code) AS value_label,
             av.code AS value_code,
             cvav.text_value,
             cvav.number_value,
             cvav.boolean_value,
             cvav.dimension_value
      FROM canonical_variant_attribute_values cvav
      LEFT JOIN attribute_values av ON av.id=cvav.attribute_value_id AND av.active=true
      LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE cvav.canonical_variant_id=ANY($1::uuid[])
        AND cvav.attribute_id=ANY($2::uuid[])
      ORDER BY cvav.canonical_variant_id,cvav.attribute_id,cvav.position
    `, [candidateIds, axisIds]),
    getProductionPostgresRuntime().nativePool.query<SourceEvidenceRow>(`
      SELECT DISTINCT ON (csl.canonical_variant_id,obs.attribute_id)
             csl.canonical_variant_id::text AS canonical_variant_id,
             obs.attribute_id::text AS attribute_id,
             COALESCE(NULLIF(avt.label,''),av.code) AS value_label,
             av.code AS value_code,
             obs.normalized_value,
             obs.raw_value
      FROM catalog_source_product_links csl
      JOIN catalog_source_products source_product ON source_product.id=csl.source_product_id
      JOIN catalog_source_attribute_observations obs ON obs.source_product_id=source_product.id
      LEFT JOIN attribute_values av ON av.id=obs.attribute_value_id AND av.active=true
      LEFT JOIN attribute_value_translations avt ON avt.attribute_value_id=av.id AND upper(avt.locale)='EL'
      WHERE csl.canonical_variant_id=ANY($1::uuid[])
        AND csl.link_status='approved'
        AND obs.attribute_id=ANY($2::uuid[])
        AND (
          obs.mapping_status='mapped'
          OR
          (obs.mapping_status='review_required' AND EXISTS (
            SELECT 1
            FROM catalog_source_attribute_mapping_rules rule
            WHERE rule.source_id=source_product.source_id
              AND rule.source_attribute_key=obs.source_attribute_key
              AND rule.attribute_id=obs.attribute_id
              AND rule.status='approved'
              AND (
                (rule.scope_kind='taxonomy_node' AND rule.scope_key=source_product.source_taxonomy_node_id::text)
                OR
                (rule.scope_kind='source_category' AND rule.scope_key=COALESCE(
                  NULLIF(btrim(source_product.source_identity->>'categoryId'),''),
                  NULLIF(btrim(source_product.source_identity->>'category_id'),''),
                  NULLIF(btrim(source_product.normalized_payload->>'sourceCategoryId'),'')
                ))
              )
          ))
        )
      ORDER BY csl.canonical_variant_id,obs.attribute_id,
               CASE obs.mapping_status WHEN 'mapped' THEN 0 ELSE 1 END,
               obs.confidence DESC,csl.confidence DESC,source_product.created_at DESC,obs.created_at DESC
    `, [candidateIds, axisIds])
  ]);
  return { canonical: canonical.rows, source: source.rows };
}

function canonicalEvidenceValue(row: CanonicalEvidenceRow): string | undefined {
  return row.value_label?.trim()
    || row.value_code?.trim()
    || row.text_value?.trim()
    || scalarValue(row.number_value)
    || (row.boolean_value === null ? undefined : scalarValue(row.boolean_value))
    || scalarValue(row.dimension_value);
}

function sourceEvidenceValue(row: SourceEvidenceRow): string | undefined {
  return row.value_label?.trim()
    || row.value_code?.trim()
    || scalarValue(row.normalized_value)
    || scalarValue(row.raw_value);
}

function evidenceMap<T extends { canonical_variant_id: string; attribute_id: string }>(
  rows: readonly T[],
  valueFor: (row: T) => string | undefined
): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const row of rows) {
    const value = valueFor(row);
    const identity = `${row.canonical_variant_id}:${row.attribute_id}`;
    if (value && !values.has(identity)) values.set(identity, value);
  }
  return values;
}

function buildOptions(
  rows: readonly VariantOptionRow[],
  axes: readonly GovernedAxis[],
  canonicalEvidence: ReadonlyMap<string, string>,
  sourceEvidence: ReadonlyMap<string, string>
): readonly PublicProductVariantOption[] {
  return rows.map((row) => {
    const attributes = axes
      .map((axis) => {
        const evidenceKey = `${row.canonical_uuid}:${axis.id}`;
        const value = canonicalEvidence.get(evidenceKey)
          ?? sourceEvidence.get(evidenceKey)
          ?? directVariantValue(row.variant_attributes, axis);
        return value ? variantAttribute(axis, value) : undefined;
      })
      .filter((attribute): attribute is PublicProductVariantAttribute => Boolean(attribute));
    return {
      canonicalVariantId: String(row.canonical_public_id),
      slug: String(row.slug),
      attributes,
      available: Boolean(row.available),
      fromPriceMinor: safePriceMinor(row.from_price_minor),
      ...variantImage(row)
    } satisfies PublicProductVariantOption;
  });
}

export function productVariantPresentation(options: readonly PublicProductVariantOption[]): PublicProductVariantPresentation {
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
  const meaningfulOptions = options.filter((option) => option.attributes.some((attribute) => varyingKeys.has(attribute.key)));
  if (meaningfulOptions.length < 2 || varyingKeys.size === 0) {
    return { options: [], varyingKeys: new Set<string>(), title: "Επιλογή παραλλαγής" };
  }
  const labels = [...varyingKeys].map((key) => labelByKey.get(key)).filter((label): label is string => Boolean(label));
  return {
    options: meaningfulOptions,
    varyingKeys,
    title: labels.length === 1 ? labels[0] : "Επιλογή παραλλαγής"
  };
}

async function governedProductVariantPresentation(canonicalVariantId: string, scope: VariantScope): Promise<PublicProductVariantPresentation> {
  const canonicalId = canonicalVariantId.trim();
  if (!canonicalId || !productionDatabaseConfigured()) return productVariantPresentation([]);
  try {
    const context = await productOptionContext(canonicalId, scope.mode === "demo");
    if (!context?.product_type_id) return productVariantPresentation([]);
    const axes = await governedAxes(context.product_type_id);
    if (!axes.length) return productVariantPresentation([]);
    const rows = await candidateRows(context, scope);
    if (rows.length < 2) return productVariantPresentation([]);
    const evidence = await evidenceRows(rows.map((row) => row.canonical_uuid), axes);
    const options = buildOptions(
      rows,
      axes,
      evidenceMap(evidence.canonical, canonicalEvidenceValue),
      evidenceMap(evidence.source, sourceEvidenceValue)
    );
    const presentation = productVariantPresentation(options);
    if (!presentation.options.some((option) => option.canonicalVariantId === canonicalId)) return productVariantPresentation([]);
    return presentation;
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.governed_product_variant_options_failed",
      canonicalVariantId: canonicalId,
      mode: scope.mode,
      message: error instanceof Error ? error.message : String(error)
    }));
    return productVariantPresentation([]);
  }
}

const getCachedPublicProductVariantPresentation = cache(async (canonicalVariantId: string) => governedProductVariantPresentation(canonicalVariantId, { mode: "live" }));

export async function getPublicProductVariantPresentation(canonicalVariantId: string): Promise<PublicProductVariantPresentation> {
  return getCachedPublicProductVariantPresentation(canonicalVariantId.trim());
}

export async function getPublicProductVariantOptions(canonicalVariantId: string): Promise<readonly PublicProductVariantOption[]> {
  return (await getPublicProductVariantPresentation(canonicalVariantId)).options;
}

export async function getDemoProductVariantPresentation(canonicalVariantId: string, vendorId: string): Promise<PublicProductVariantPresentation> {
  const canonicalId = canonicalVariantId.trim();
  const vendor = vendorId.trim();
  if (!canonicalId || !vendor) return productVariantPresentation([]);
  return governedProductVariantPresentation(canonicalId, { mode: "demo", vendorId: vendor });
}
