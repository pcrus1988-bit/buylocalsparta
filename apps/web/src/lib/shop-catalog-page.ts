import { createHash } from "node:crypto";
import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";
import { loadCatalogMetadata } from "./catalog-metadata";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";

const ASSIGNMENT_BATCH_SIZE = 6;
const MAX_PAGE_SIZE = 36;

type CandidateRow = Readonly<{
  canonical_public_id: string | null;
  department_code: string | null;
  total_count: number | string;
}>;

type StickyPriceRow = Readonly<{
  canonical_public_id: string;
  vendor_public_id: string;
  customer_price_minor: number | string;
  msrp_minor: number | string | null;
}>;

type ShopCatalogCard = CatalogCard & Readonly<{
  msrpMinor: number | null;
}>;

export type ShopCatalogPage = Readonly<{
  products: readonly ShopCatalogCard[];
  total: number;
  hasMore: boolean;
}>;

export type ShopCatalogPageInput = Readonly<{
  visitorKey: string;
  postcode?: string;
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

function safeInt(value: unknown): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

function visitorHash(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
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

async function assignCanonicalsInBatches(
  canonicalIds: readonly string[],
  visitorKey: string,
  postcode: string
) {
  const commerce = getProductionPostgresRuntime().customerCommerce;
  const assigned: Awaited<ReturnType<typeof commerce.publicAssignedCanonical>>[] = [];

  // Fairness mutates sticky/rotation state. Six concurrent assignments remove the
  // old serial N+1 waterfall without opening an unbounded connection burst.
  for (let index = 0; index < canonicalIds.length; index += ASSIGNMENT_BATCH_SIZE) {
    const batch = canonicalIds.slice(index, index + ASSIGNMENT_BATCH_SIZE);
    assigned.push(...await Promise.all(batch.map((canonicalVariantId) =>
      commerce.publicAssignedCanonical({
        canonicalVariantId,
        visitorKey,
        postcode,
        reason: "search_card"
      }).catch((error) => {
        console.error(JSON.stringify({
          level: "error",
          event: "storefront.catalog_assignment_degraded",
          canonicalVariantId,
          message: error instanceof Error ? error.message : String(error)
        }));
        return undefined;
      })
    )));
  }

  return assigned.flatMap((record) => record?.available && record.vendorId ? [record] : []);
}

async function loadStickyPrices(
  canonicalIds: readonly string[],
  visitorKey: string,
  postcode: string
): Promise<ReadonlyMap<string, StickyPriceRow>> {
  if (!canonicalIds.length) return new Map();
  const result = await getProductionPostgresRuntime().nativePool.query<StickyPriceRow>(`
    SELECT DISTINCT ON (cv.public_id)
      cv.public_id AS canonical_public_id,
      v.public_id AS vendor_public_id,
      vo.customer_price_minor,
      CASE
        WHEN vo.msrp_minor IS NOT NULL
          AND vo.msrp_minor>vo.customer_price_minor
          AND (
            vo.show_msrp=true
            OR EXISTS (
              SELECT 1
              FROM dropship_supplier_offers dso
              JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
              WHERE dso.vendor_offer_id=vo.id
                AND dso.active=true
                AND ds.active=true
            )
          )
          THEN vo.msrp_minor
        ELSE NULL
      END AS msrp_minor
    FROM sticky_assignments sa
    JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=sa.offer_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    WHERE cv.public_id=ANY($1::text[])
      AND COALESCE(cv.commerce_channel,'normal')='normal'
      AND sa.visitor_hash=$2
      AND sa.postcode_scope=$3
      AND sa.released_at IS NULL
      AND sa.expires_at>now()
      AND vo.status='approved'
      AND vo.customer_price_minor>0
      AND v.status='active'
    ORDER BY cv.public_id,sa.locked_at DESC
  `, [canonicalIds, visitorHash(visitorKey), postcode]);
  return new Map(result.rows.map((row) => [row.canonical_public_id, row] as const));
}

/**
 * Fast customer-facing local catalogue page.
 *
 * PostgreSQL performs category/query/brand/color/size/fit/price admission and
 * returns only a 30-ish candidate window. Only that window reaches metadata,
 * fairness, media and React. Personalized fairness remains outside shared caches.
 */
export async function getShopCatalogPage(input: ShopCatalogPageInput): Promise<ShopCatalogPage> {
  if (!productionDatabaseConfigured() || !input.visitorKey) return { products: [], total: 0, hasMore: false };

  const postcode = input.postcode ?? "23100";
  const limit = Math.max(1, Math.min(MAX_PAGE_SIZE, input.limit ?? 30));
  const offset = Math.max(0, input.offset ?? 0);
  const filters = input.filters ?? {};
  const attributeFilters = input.attributeFilters ?? {};
  const extraCandidates = Object.keys(attributeFilters).length ? 6 : 1;
  const candidateLimit = Math.min(MAX_PAGE_SIZE, limit + extraCandidates);
  const prefixes = categoryPrefixes(input.category ?? "");
  const query = (input.query ?? "").trim();

  const result = await getProductionPostgresRuntime().nativePool.query<CandidateRow>(`
    WITH RECURSIVE category_tree AS (
      SELECT c.id,c.parent_id,c.code,c.code AS department_code
      FROM categories c
      JOIN markets m ON m.id=c.market_id
      WHERE m.code='sparta' AND c.parent_id IS NULL
      UNION ALL
      SELECT child.id,child.parent_id,child.code,parent.department_code
      FROM categories child
      JOIN category_tree parent ON child.parent_id=parent.id
    ), search_matches AS MATERIALIZED (
      SELECT pt.canonical_variant_id
      FROM product_translations pt
      WHERE $7::text<>''
        AND to_tsvector('simple',COALESCE(pt.title,'')) @@ plainto_tsquery('simple',$7)
      UNION
      SELECT cv.id
      FROM canonical_variants cv
      WHERE $7::text<>''
        AND to_tsvector(
          'simple',
          COALESCE(cv.model,'') || ' ' || COALESCE(cv.slug,'') || ' ' ||
          COALESCE(cv.gtin,'') || ' ' || COALESCE(cv.mpn,'')
        ) @@ plainto_tsquery('simple',$7)
      UNION
      SELECT cv.id
      FROM brands b
      JOIN canonical_variants cv ON cv.brand_id=b.id
      WHERE $7::text<>''
        AND to_tsvector('simple',COALESCE(b.name,'')) @@ plainto_tsquery('simple',$7)
      UNION
      SELECT cv.id
      FROM brands b
      JOIN product_families pf ON pf.brand_id=b.id
      JOIN canonical_variants cv ON cv.family_id=pf.id AND cv.brand_id IS NULL
      WHERE $7::text<>''
        AND to_tsvector('simple',COALESCE(b.name,'')) @@ plainto_tsquery('simple',$7)
      UNION
      SELECT cv.id
      FROM categories c
      JOIN canonical_variants cv ON cv.category_id=c.id
      WHERE $7::text<>''
        AND to_tsvector('simple',COALESCE(c.code,'')) @@ plainto_tsquery('simple',$7)
    ), candidates AS (
      SELECT
        cv.public_id AS canonical_public_id,
        tree.department_code,
        cv.created_at,
        MIN(vo.customer_price_minor) AS sort_price_minor
      FROM canonical_variants cv
      JOIN markets m ON m.id=cv.market_id
      JOIN categories c ON c.id=cv.category_id
      JOIN category_tree tree ON tree.id=cv.category_id
      LEFT JOIN product_families pf ON pf.id=cv.family_id
      LEFT JOIN brands b ON b.id=COALESCE(cv.brand_id,pf.brand_id)
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
      JOIN vendor_businesses v ON v.id=vo.vendor_id
      JOIN vendor_locations l ON l.id=vo.location_id
      JOIN inventory_balances ib ON ib.offer_id=vo.id
      WHERE m.code='sparta'
        AND COALESCE(cv.commerce_channel,'normal')='normal'
        AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
        AND vo.status='approved'
        AND vo.merchant_visible=true
        AND vo.merchant_pause_active=false
        AND vo.customer_price_minor>0
        AND v.status='active'
        AND l.active=true
        AND 'pickup'::fulfilment_mode=ANY(vo.fulfilment_modes)
        AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
        AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
        AND GREATEST(0,ib.on_hand-ib.active_reservations-ib.safety_stock-ib.blocked)>=1
        AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>now()
        AND (
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
        AND ($4::text='' OR lower(COALESCE(el.specifications->>'color',en.specifications->>'color',cv.variant_attributes->>'color',''))=lower($4))
        AND ($5::text='' OR COALESCE(el.specifications->'sizes',en.specifications->'sizes','[]'::jsonb) ? $5 OR COALESCE(cv.variant_attributes->'sizes_observed','[]'::jsonb) ? $5)
        AND ($6::text='' OR lower(COALESCE(el.specifications->>'fit',en.specifications->>'fit',''))=lower($6))
        AND (
          $7::text='' OR
          cv.id IN (SELECT canonical_variant_id FROM search_matches)
          OR COALESCE(cv.gtin,'')=$7
          OR lower(COALESCE(cv.mpn,''))=lower($7)
        )
      GROUP BY cv.id,cv.public_id,tree.department_code
      HAVING ($8::bigint IS NULL OR MIN(vo.customer_price_minor)>=$8)
         AND ($9::bigint IS NULL OR MIN(vo.customer_price_minor)<=$9)
    ), ordered AS (
      SELECT canonical_public_id,department_code,sort_price_minor,created_at
      FROM candidates
      ORDER BY
        CASE WHEN $10='price-asc' THEN sort_price_minor END ASC,
        CASE WHEN $10='price-desc' THEN sort_price_minor END DESC,
        CASE WHEN $10 NOT IN ('price-asc','price-desc') THEN created_at END DESC,
        canonical_public_id
      LIMIT $11 OFFSET $12
    ), totals AS (
      SELECT COUNT(*) AS total_count FROM candidates
    )
    SELECT ordered.canonical_public_id,ordered.department_code,totals.total_count
    FROM totals
    LEFT JOIN ordered ON true
  `, [
    prefixes,
    filters.subcategory ?? "",
    filters.brand ?? "",
    filters.color ?? "",
    filters.size ?? "",
    filters.fit ?? "",
    query,
    input.minPriceMinor ?? null,
    input.maxPriceMinor ?? null,
    input.sort ?? "",
    candidateLimit,
    offset
  ]);

  const total = result.rows.length ? safeInt(result.rows[0].total_count) : 0;
  const candidateRows = result.rows.filter((row): row is CandidateRow & Readonly<{ canonical_public_id: string }> => Boolean(row.canonical_public_id));
  if (!candidateRows.length) return { products: [], total, hasMore: offset < total };

  const candidateIds = candidateRows.map((row) => row.canonical_public_id);
  const metadata = await loadCatalogMetadata(candidateIds);
  const filteredIds = candidateIds
    .filter((id) => matchesCatalogAttributeFilters(metadata.get(id)?.attributes, attributeFilters))
    .slice(0, limit);
  if (!filteredIds.length) return { products: [], total, hasMore: offset + candidateLimit < total };

  const assigned = await assignCanonicalsInBatches(filteredIds, input.visitorKey, postcode);
  if (!assigned.length) return { products: [], total, hasMore: offset + candidateLimit < total };

  const assignedIds = assigned.map((record) => record.id);
  const [stickyPrices, images] = await Promise.all([
    loadStickyPrices(assignedIds, input.visitorKey, postcode),
    approvedCatalogImages(assigned.map((record) => ({ canonicalVariantId: record.id, preferredVendorId: record.vendorId }))).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.public_media_projection_failed",
        message: error instanceof Error ? error.message : String(error)
      }));
      return [];
    })
  ]);
  const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image] as const));
  const departmentByCanonical = new Map(candidateRows.map((row) => [row.canonical_public_id, row.department_code ?? undefined] as const));

  const products: ShopCatalogCard[] = assigned.flatMap((record) => {
    const priceRow = stickyPrices.get(record.id);
    if (!priceRow || priceRow.vendor_public_id !== record.vendorId) return [];
    const priceMinor = safeInt(priceRow.customer_price_minor);
    if (priceMinor <= 0) return [];
    const projectedMsrpMinor = safeInt(priceRow.msrp_minor);
    const details = metadata.get(record.id);
    const image = imageByCanonical.get(record.id);
    return [{
      id: record.id,
      slug: record.slug,
      title: record.title,
      priceMinor,
      price: formatMoney(money(priceMinor)),
      categoryCode: record.categoryCode,
      departmentCode: departmentByCanonical.get(record.id),
      categoryLabel: details?.categoryLabel,
      gtin: details?.gtin,
      mpn: details?.mpn,
      description: details?.description,
      brand: details?.brand,
      brandLogoObjectKey: details?.brandLogoObjectKey,
      color: details?.color,
      sizes: details?.sizes ?? [],
      fit: details?.fit,
      composition: details?.composition,
      madeIn: details?.madeIn,
      vendorId: record.vendorId,
      vendorName: record.vendorName,
      adviser: record.adviser,
      mediaId: image?.mediaId,
      mediaAlt: image?.altText,
      available: true,
      availableToSell: record.availableToSell,
      msrpMinor: projectedMsrpMinor > priceMinor ? projectedMsrpMinor : null
    }];
  });

  return {
    products,
    total,
    hasMore: offset + candidateLimit < total || candidateRows.length > limit
  };
}
