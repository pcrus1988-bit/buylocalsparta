import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";
import { loadCatalogMetadata } from "./catalog-metadata";
import { projectDropshipFamilies } from "./dropship-family-projection";
import { parseDropshipPresentationConfig, resolveDropshipPublicFields } from "./dropship-presentation-policy";
import { getPublicCatalogSourcePrimaryImages } from "./public-catalog-source-gallery";
import { approvedCatalogImages } from "./public-media-service";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

const MAX_PAGE_SIZE = 36;

type PublishedDropshipFamilyRow = Readonly<{
  supplier_id: string;
  external_product_id: string;
  total_families: number | string;
}>;

type PublishedDropshipPageRow = Readonly<{
  canonical_public_id: string;
  family_id: string | null;
  supplier_id: string;
  external_product_id: string;
  offer_public_id: string;
  slug: string;
  title: string;
  category_code: string;
  department_code: string | null;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
  cached_quantity: number | string | null;
  vendor_public_id: string;
  vendor_name: string;
  vendor_presentation: unknown;
  is_match: boolean;
  sort_ordinal: number | string;
}>;

type ShopDropshipCard = CatalogCard & Readonly<{
  supplierFulfilled: true;
  previewImageSrc?: string;
  msrpMinor: number | null;
}>;

export type PublishedDropshipCatalogPage = Readonly<{
  products: readonly ShopDropshipCard[];
  total: number;
  hasMore: boolean;
}>;

export type PublishedDropshipCatalogPageInput = Readonly<{
  query?: string;
  category?: string;
  filters?: CatalogFilters & Readonly<{ fit?: string }>;
  attributeFilters?: CatalogAttributeFilters;
  minPriceMinor?: number;
  maxPriceMinor?: number;
  sort?: string;
  limit?: number;
  offset?: number;
}>;

function safeMinor(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function safeQuantity(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 1;
}

function safeCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeCategory(value: string): string {
  return value.trim().toLowerCase().replaceAll("_", "-");
}

function categoryPrefixes(category: string): readonly string[] {
  const normalized = normalizeCategory(category);
  if (!normalized) return [];
  const governed = storefrontCategoryBySlug(normalized);
  return governed ? governed.aliases.map(normalizeCategory) : [normalized];
}

const HIDDEN_CATEGORY_CLOSURE_SQL = `
  hidden_categories(vendor_id,category_id) AS (
    SELECT vendor_id,category_id
    FROM vendor_category_visibility
    WHERE visible=false
    UNION
    SELECT hidden.vendor_id,child.id
    FROM hidden_categories hidden
    JOIN categories child ON child.parent_id=hidden.category_id
  )
`;

/**
 * Select only source-family keys first, then hydrate variants for that small page.
 *
 * The previous query joined translations, brands and taxonomy across the whole
 * canonical catalogue before PostgreSQL could use the active dropship window. At
 * ~50k canonicals this produced multi-second/timeout plans. Discovery now starts
 * from the ~current supplier offers, computes vendor category exclusions once,
 * pages source families, and only then enriches the selected family keys.
 */
export async function getPublishedDropshipCatalogPage(
  input: PublishedDropshipCatalogPageInput = {}
): Promise<PublishedDropshipCatalogPage> {
  if (!productionDatabaseConfigured()) return { products: [], total: 0, hasMore: false };

  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, input.limit ?? 30));
  const offset = Math.max(0, input.offset ?? 0);
  const filters = input.filters ?? {};
  const attributeFilters = input.attributeFilters ?? {};
  const prefixes = categoryPrefixes(input.category ?? "");
  const query = (input.query ?? "").trim();
  const sort = input.sort ?? "";
  const pool = getProductionPostgresRuntime().nativePool;
  const hasSqlFilters = Boolean(
    prefixes.length ||
    filters.subcategory ||
    filters.brand ||
    filters.color ||
    filters.size ||
    filters.fit ||
    query ||
    input.minPriceMinor !== undefined ||
    input.maxPriceMinor !== undefined
  );

  const familyWindow = hasSqlFilters
    ? await pool.query<PublishedDropshipFamilyRow>(`
      WITH RECURSIVE category_tree AS MATERIALIZED (
        SELECT c.id,c.parent_id,c.code,c.code AS department_code
        FROM categories c
        JOIN markets m ON m.id=c.market_id
        WHERE m.code='sparta' AND c.parent_id IS NULL
        UNION ALL
        SELECT child.id,child.parent_id,child.code,parent.department_code
        FROM categories child
        JOIN category_tree parent ON child.parent_id=parent.id
      ),
      ${HIDDEN_CATEGORY_CLOSURE_SQL},
      eligible AS MATERIALIZED (
        SELECT
          cv.id AS canonical_id,
          cv.family_id,
          cv.brand_id,
          cv.category_id,
          cv.model,
          cv.slug,
          cv.gtin,
          cv.mpn,
          cv.variant_attributes,
          cv.created_at,
          dso.supplier_id,
          dso.external_product_id,
          vo.customer_price_minor,
          vo.vendor_id
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        WHERE m.code='sparta'
          AND dso.active=true
          AND dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_categories hidden
            WHERE hidden.vendor_id=vo.vendor_id
              AND hidden.category_id=cv.category_id
          )
      ), matching_children AS (
        SELECT
          eligible.supplier_id,
          eligible.external_product_id,
          eligible.created_at,
          eligible.customer_price_minor
        FROM eligible
        JOIN categories c ON c.id=eligible.category_id
        JOIN category_tree tree ON tree.id=eligible.category_id
        LEFT JOIN product_families family ON family.id=eligible.family_id
        LEFT JOIN brands b ON b.id=COALESCE(eligible.brand_id,family.brand_id)
        LEFT JOIN product_translations el ON el.canonical_variant_id=eligible.canonical_id AND el.locale='el'
        LEFT JOIN product_translations en ON en.canonical_variant_id=eligible.canonical_id AND en.locale='en'
        WHERE (
            cardinality($1::text[])=0 OR EXISTS (
              SELECT 1 FROM unnest($1::text[]) prefix
              WHERE lower(c.code)=prefix
                 OR lower(c.code) LIKE prefix||'-%'
                 OR lower(tree.department_code)=prefix
                 OR lower(tree.department_code) LIKE prefix||'-%'
            )
          )
          AND ($2::text='' OR c.code=$2)
          AND ($3::text='' OR lower(COALESCE(b.name,''))=lower($3))
          AND ($4::text='' OR lower(COALESCE(el.specifications->>'color',en.specifications->>'color',eligible.variant_attributes->>'color',''))=lower($4))
          AND ($5::text='' OR COALESCE(el.specifications->'sizes',en.specifications->'sizes','[]'::jsonb) ? $5 OR COALESCE(eligible.variant_attributes->'sizes_observed','[]'::jsonb) ? $5)
          AND ($6::text='' OR lower(COALESCE(el.specifications->>'fit',en.specifications->>'fit',''))=lower($6))
          AND ($7::bigint IS NULL OR eligible.customer_price_minor>=$7)
          AND ($8::bigint IS NULL OR eligible.customer_price_minor<=$8)
          AND (
            $9::text='' OR
            to_tsvector('simple',concat_ws(' ',
              COALESCE(el.title,en.title,eligible.model,eligible.slug),
              COALESCE(el.description,en.description,''),
              COALESCE(b.name,''),
              COALESCE(eligible.gtin,''),
              COALESCE(eligible.mpn,''),
              c.code
            )) @@ plainto_tsquery('simple',$9)
            OR COALESCE(eligible.gtin,'')=$9
            OR lower(COALESCE(eligible.mpn,''))=lower($9)
          )
      ), matching_families AS (
        SELECT
          supplier_id,
          external_product_id,
          MAX(created_at) AS newest_at,
          MIN(customer_price_minor) AS sort_price_minor
        FROM matching_children
        GROUP BY supplier_id,external_product_id
      )
      SELECT
        supplier_id::text,
        external_product_id,
        COUNT(*) OVER() AS total_families
      FROM matching_families
      ORDER BY
        CASE WHEN $10='price-asc' THEN sort_price_minor END ASC,
        CASE WHEN $10='price-desc' THEN sort_price_minor END DESC,
        CASE WHEN $10 NOT IN ('price-asc','price-desc') THEN newest_at END DESC,
        supplier_id,
        external_product_id
      LIMIT $11 OFFSET $12
    `, [
      prefixes,
      filters.subcategory ?? "",
      filters.brand ?? "",
      filters.color ?? "",
      filters.size ?? "",
      filters.fit ?? "",
      input.minPriceMinor ?? null,
      input.maxPriceMinor ?? null,
      query,
      sort,
      limit,
      offset
    ])
    : await pool.query<PublishedDropshipFamilyRow>(`
      WITH RECURSIVE
      ${HIDDEN_CATEGORY_CLOSURE_SQL},
      matching_children AS (
        SELECT
          dso.supplier_id,
          dso.external_product_id,
          cv.created_at,
          vo.customer_price_minor
        FROM dropship_supplier_offers dso
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
        JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        WHERE m.code='sparta'
          AND dso.active=true
          AND dso.cached_available=true
          AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
          AND dso.availability_expires_at IS NOT NULL
          AND dso.availability_expires_at>now()
          AND ds.active=true
          AND ds.api_authoritative_availability=true
          AND COALESCE(cv.commerce_channel,'normal')='normal'
          AND cv.active=true
          AND cv.suppressed=false
          AND cv.recalled=false
          AND vo.status='approved'
          AND vo.merchant_visible=true
          AND vo.merchant_pause_active=false
          AND vo.customer_price_minor>0
          AND v.status='active'
          AND l.active=true
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
          AND NOT EXISTS (
            SELECT 1
            FROM hidden_categories hidden
            WHERE hidden.vendor_id=vo.vendor_id
              AND hidden.category_id=cv.category_id
          )
      ), matching_families AS (
        SELECT
          supplier_id,
          external_product_id,
          MAX(created_at) AS newest_at,
          MIN(customer_price_minor) AS sort_price_minor
        FROM matching_children
        GROUP BY supplier_id,external_product_id
      )
      SELECT
        supplier_id::text,
        external_product_id,
        COUNT(*) OVER() AS total_families
      FROM matching_families
      ORDER BY
        CASE WHEN $1='price-asc' THEN sort_price_minor END ASC,
        CASE WHEN $1='price-desc' THEN sort_price_minor END DESC,
        CASE WHEN $1 NOT IN ('price-asc','price-desc') THEN newest_at END DESC,
        supplier_id,
        external_product_id
      LIMIT $2 OFFSET $3
    `, [sort, limit, offset]);

  if (!familyWindow.rows.length) return { products: [], total: 0, hasMore: false };
  const total = safeCount(familyWindow.rows[0].total_families);
  const supplierIds = familyWindow.rows.map((row) => row.supplier_id);
  const externalProductIds = familyWindow.rows.map((row) => row.external_product_id);

  const result = await pool.query<PublishedDropshipPageRow>(`
    WITH RECURSIVE category_tree AS MATERIALIZED (
      SELECT c.id,c.parent_id,c.code,c.code AS department_code
      FROM categories c
      JOIN markets m ON m.id=c.market_id
      WHERE m.code='sparta' AND c.parent_id IS NULL
      UNION ALL
      SELECT child.id,child.parent_id,child.code,parent.department_code
      FROM categories child
      JOIN category_tree parent ON child.parent_id=parent.id
    ),
    ${HIDDEN_CATEGORY_CLOSURE_SQL},
    selected_families AS (
      SELECT supplier_id,external_product_id,ordinality
      FROM unnest($1::uuid[],$2::text[]) WITH ORDINALITY
        AS selected(supplier_id,external_product_id,ordinality)
    ), base AS (
      SELECT DISTINCT ON (cv.id)
        selected.ordinality AS sort_ordinal,
        cv.public_id AS canonical_public_id,
        cv.family_id::text AS family_id,
        dso.supplier_id::text AS supplier_id,
        dso.external_product_id,
        vo.public_id AS offer_public_id,
        cv.slug,
        COALESCE(el.title,en.title,cv.model,cv.slug) AS title,
        COALESCE(el.description,en.description,'') AS description,
        c.code AS category_code,
        tree.department_code,
        b.name AS brand_name,
        COALESCE(el.specifications,en.specifications,'{}'::jsonb) AS specifications,
        cv.variant_attributes,
        cv.gtin,
        cv.mpn,
        vo.customer_price_minor,
        vo.msrp_minor,
        dso.cached_quantity,
        v.public_id AS vendor_public_id,
        v.trading_name AS vendor_name,
        ds.configuration->'vendorPresentation' AS vendor_presentation,
        dso.availability_checked_at,
        vo.updated_at
      FROM selected_families selected
      JOIN dropship_supplier_offers dso
        ON dso.supplier_id=selected.supplier_id
       AND dso.external_product_id=selected.external_product_id
      JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
      JOIN vendor_offers vo ON vo.id=dso.vendor_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN category_tree tree ON tree.id=cv.category_id
      LEFT JOIN product_families family ON family.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,family.brand_id)
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true
        AND cv.suppressed=false
        AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND dso.active=true
        AND ds.active=true
        AND ds.api_authoritative_availability=true
        AND dso.cached_available=true
        AND (dso.cached_quantity IS NULL OR dso.cached_quantity>=1)
        AND dso.availability_expires_at IS NOT NULL
        AND dso.availability_expires_at>now()
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND NOT EXISTS (
          SELECT 1
          FROM hidden_categories hidden
          WHERE hidden.vendor_id=vo.vendor_id
            AND hidden.category_id=cv.category_id
        )
      ORDER BY cv.id,vo.customer_price_minor ASC,dso.availability_checked_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
    )
    SELECT
      canonical_public_id,
      family_id,
      supplier_id,
      external_product_id,
      offer_public_id,
      slug,
      title,
      category_code,
      department_code,
      customer_price_minor,
      msrp_minor,
      cached_quantity,
      vendor_public_id,
      vendor_name,
      vendor_presentation,
      sort_ordinal,
      (
        (cardinality($3::text[])=0 OR EXISTS (
          SELECT 1 FROM unnest($3::text[]) prefix
          WHERE lower(category_code)=prefix
             OR lower(category_code) LIKE prefix||'-%'
             OR lower(department_code)=prefix
             OR lower(department_code) LIKE prefix||'-%'
        ))
        AND ($4::text='' OR category_code=$4)
        AND ($5::text='' OR lower(COALESCE(brand_name,''))=lower($5))
        AND ($6::text='' OR lower(COALESCE(specifications->>'color',variant_attributes->>'color',''))=lower($6))
        AND ($7::text='' OR COALESCE(specifications->'sizes','[]'::jsonb) ? $7 OR COALESCE(variant_attributes->'sizes_observed','[]'::jsonb) ? $7)
        AND ($8::text='' OR lower(COALESCE(specifications->>'fit',''))=lower($8))
        AND ($9::bigint IS NULL OR customer_price_minor>=$9)
        AND ($10::bigint IS NULL OR customer_price_minor<=$10)
        AND (
          $11::text='' OR
          to_tsvector('simple',concat_ws(' ',title,description,COALESCE(brand_name,''),COALESCE(gtin,''),COALESCE(mpn,''),category_code)) @@ plainto_tsquery('simple',$11)
          OR COALESCE(gtin,'')=$11
          OR lower(COALESCE(mpn,''))=lower($11)
        )
      ) AS is_match
    FROM base
    ORDER BY sort_ordinal,customer_price_minor,canonical_public_id
  `, [
    supplierIds,
    externalProductIds,
    prefixes,
    filters.subcategory ?? "",
    filters.brand ?? "",
    filters.color ?? "",
    filters.size ?? "",
    filters.fit ?? "",
    input.minPriceMinor ?? null,
    input.maxPriceMinor ?? null,
    query
  ]);

  const base = result.rows.flatMap((row) => {
    const priceMinor = safeMinor(row.customer_price_minor);
    if (!priceMinor || !isPublicCatalogueTitle(row.title)) return [];
    const msrpMinor = safeMinor(row.msrp_minor);
    const presentation = resolveDropshipPublicFields(
      parseDropshipPresentationConfig(row.vendor_presentation),
      row.offer_public_id
    );
    return [{
      id: row.canonical_public_id,
      familyId: row.family_id,
      supplierId: row.supplier_id,
      externalProductId: row.external_product_id,
      slug: row.slug,
      title: row.title,
      categoryCode: row.category_code,
      departmentCode: row.department_code ?? undefined,
      priceMinor,
      msrpMinor: msrpMinor !== undefined && msrpMinor > priceMinor ? msrpMinor : null,
      available: true,
      availableToSell: safeQuantity(row.cached_quantity),
      vendorId: row.vendor_public_id,
      vendorName: row.vendor_name,
      publicFields: presentation.fields,
      matchedBySql: row.is_match
    }];
  });
  if (!base.length) return { products: [], total, hasMore: offset + limit < total };

  const ids = base.map((record) => record.id);
  const metadata = await loadCatalogMetadata(ids);
  const matchingIds = new Set(base.flatMap((record) => {
    if (!record.matchedBySql) return [];
    if (Object.keys(attributeFilters).length === 0) return [record.id];
    if (record.publicFields.technicalAttributes === false) return [];
    return matchesCatalogAttributeFilters(metadata.get(record.id)?.attributes, attributeFilters) ? [record.id] : [];
  }));
  if (!matchingIds.size) return { products: [], total, hasMore: offset + limit < total };

  // Preserve the bounded SQL page and overlay only already-validated V4 display
  // copy from metadata; no commercial or availability state is changed here.
  const enriched = base.map((record) => {
    const details = metadata.get(record.id);
    return {
      ...record,
      title: details?.title ?? record.title,
      sizes: details?.sizes ?? []
    };
  });
  const projections = projectDropshipFamilies(enriched, matchingIds);
  const representatives = projections.map((projection) => projection.representative);
  const imageRequests = representatives.map((record) => ({
    canonicalVariantId: record.id,
    preferredVendorId: record.vendorId
  }));

  const [images, sourcePrimaryImages] = await Promise.all([
    approvedCatalogImages(imageRequests).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.dropship_public_media_projection_failed",
        message: error instanceof Error ? error.message : String(error)
      }));
      return [];
    }),
    getPublicCatalogSourcePrimaryImages(imageRequests)
  ]);
  const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image] as const));

  const products: ShopDropshipCard[] = projections.map((projection) => {
    const record = projection.representative;
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    const sourceImage = sourcePrimaryImages.get(record.id);
    const technicalAttributesVisible = record.publicFields.technicalAttributes !== false;
    return {
      id: record.id,
      slug: record.slug,
      title: record.title,
      priceMinor: record.priceMinor,
      price: formatMoney(money(record.priceMinor)),
      categoryCode: record.categoryCode,
      departmentCode: record.departmentCode,
      categoryLabel: details?.categoryLabel,
      gtin: record.publicFields.gtin === false ? undefined : details?.gtin,
      mpn: record.publicFields.mpn === false ? undefined : details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: projection.sizes,
      fit: technicalAttributesVisible ? details?.fit : undefined,
      composition: technicalAttributesVisible ? details?.composition : undefined,
      madeIn: technicalAttributesVisible ? details?.madeIn : undefined,
      vendorId: record.vendorId,
      vendorName: record.vendorName,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText ?? sourceImage?.altText,
      previewImageSrc: image?.mediaId ? undefined : sourceImage?.src,
      available: true,
      availableToSell: projection.availableToSell,
      supplierFulfilled: true,
      msrpMinor: record.msrpMinor
    };
  });

  return { products, total, hasMore: offset + limit < total };
}
