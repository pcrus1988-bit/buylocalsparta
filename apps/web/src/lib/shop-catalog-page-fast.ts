import { createHash } from "node:crypto";
import { formatMoney, money } from "@buy-local-sparta/core";
import type { CatalogCard, CatalogFilters } from "./catalog-view";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";
import { loadCatalogMetadata } from "./catalog-metadata";
import { approvedCatalogImages } from "./public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { storefrontCategoryBySlug } from "./storefront-taxonomy";
import { getLocalStorefrontReadModelWindow } from "./storefront-read-model";

const ASSIGNMENT_BATCH_SIZE = 6;
const MAX_PAGE_SIZE = 36;

type CandidateRow = Readonly<{
  canonical_public_id: string;
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
  filters?: CatalogFilters & Readonly<{ fit?: string; subcategories?: readonly string[] }>;
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
 * Customer-facing local catalogue page backed by the precomputed discovery model.
 * Only the page-sized candidate window reaches metadata, fairness, media and React.
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

  const candidateRows = await getLocalStorefrontReadModelWindow({
    prefixes,
    query,
    filters,
    minPriceMinor: input.minPriceMinor,
    maxPriceMinor: input.maxPriceMinor,
    sort: input.sort,
    limit: candidateLimit,
    offset
  }) as readonly CandidateRow[];

  const total = candidateRows.length ? safeInt(candidateRows[0].total_count) : 0;
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