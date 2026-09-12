import { createHash } from "node:crypto";
import { formatMoney, money, normalizeSearchText, searchTextRelevance } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages, type ApprovedCatalogImage } from "./public-media-service";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { matchesCatalogAttributeFilters, type CatalogAttributeFilters } from "./catalog-attribute-filter";
import { isPublicCatalogueTitle } from "./public-data-integrity";
import { categoryCodeMatches } from "./storefront-taxonomy";
import { getPublicProductDetail, getPublicProductDetails } from "./public-product-detail";
import { loadCatalogDepartmentCodes } from "./catalog-category-department";
import { getPublishedDropshipCatalogCards } from "./published-dropship-storefront";

export type CatalogCard = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  departmentCode?: string;
  categoryLabel?: string;
  gtin?: string;
  mpn?: string;
  description?: string;
  brand?: string;
  brandLogoObjectKey?: string;
  color?: string;
  sizes: readonly string[];
  fit?: string;
  composition?: string;
  madeIn?: string;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
  mediaId?: string;
  mediaAlt?: string;
  sourceImageAvailable?: boolean;
  availableToSell: number;
  available: boolean;
}>;

export type PublicCatalogProduct = Readonly<{
  id: string;
  slug: string;
  title: string;
  priceMinor: number;
  price: string;
  categoryCode: string;
  departmentCode?: string;
}>;

export type PublicProductSeoRecord = PublicCatalogProduct & Readonly<{
  description?: string;
  brand?: string;
  gtin?: string;
  mpn?: string;
  categoryLabel?: string;
  color?: string;
  sizes: readonly string[];
  mediaId?: string;
  mediaAlt?: string;
  sourceImageAvailable: boolean;
  offerAvailable: boolean;
  duplicateTitleCount: number;
}>;

export type PublicProductSeoInventory = Readonly<{
  products: readonly PublicProductSeoRecord[];
  mediaProjectionAvailable: boolean;
}>;

export type CatalogFilters = Readonly<{
  subcategory?: string;
  brand?: string;
  color?: string;
  size?: string;
}>;

export type CatalogFacetOption = Readonly<{ value: string; label: string }>;
export type CatalogFacets = Readonly<{
  subcategories: readonly CatalogFacetOption[];
  brands: readonly CatalogFacetOption[];
  colors: readonly CatalogFacetOption[];
  sizes: readonly CatalogFacetOption[];
}>;

export type PublicVendorView = Readonly<{ id: string; name: string; adviser?: string }>;
type DatabaseCatalogRecord = Readonly<{
  id: string;
  slug: string;
  title: string;
  categoryCode: string;
  departmentCode?: string;
  priceMinor: number;
  available?: boolean;
  availableToSell?: number;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}>;

type PublicOfferAvailabilityRow = Readonly<{ canonical_public_id: string }>;
type AssignedPriceRow = Readonly<{
  canonical_public_id: string;
  vendor_public_id: string;
  customer_price_minor: number | string;
}>;
type VendorOfferPriceRow = Readonly<{
  canonical_public_id: string;
  customer_price_minor: number | string;
}>;

const CATALOG_ASSIGNMENT_CONCURRENCY = 6;

/**
 * Stable search-admission signal: a public canonical must have at least one
 * approved, priced sellable offer. Local offers use fresh inventory balances;
 * API-authoritative dropshipping offers use their fresh supplier availability
 * cache. Capacity throttles are intentionally excluded because a temporarily busy
 * shop must not make a useful product URL flap in and out of Google's index.
 */
async function loadPublicOfferAvailability(
  canonicalVariantIds: readonly string[],
  now = Date.now()
): Promise<ReadonlySet<string>> {
  const ids = [...new Set(canonicalVariantIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0 || !productionDatabaseConfigured()) return new Set();
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<PublicOfferAvailabilityRow>(`
      SELECT DISTINCT eligible.canonical_public_id
      FROM (
        SELECT cv.public_id AS canonical_public_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN inventory_balances ib ON ib.offer_id=vo.id
        WHERE cv.public_id=ANY($1::text[])
          AND m.code='sparta'
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
          AND ib.stock_confirmed_at + make_interval(secs=>ib.freshness_ttl_seconds)>$2

        UNION

        SELECT cv.public_id AS canonical_public_id
        FROM canonical_variants cv
        JOIN markets m ON m.id=cv.market_id
        JOIN vendor_offers vo ON vo.canonical_variant_id=cv.id
        JOIN vendor_businesses v ON v.id=vo.vendor_id
        JOIN vendor_locations l ON l.id=vo.location_id
        JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
        JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
        WHERE cv.public_id=ANY($1::text[])
          AND m.code='sparta'
          AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
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
          AND dso.availability_expires_at>$2
          AND bls_private.vendor_category_effectively_visible(vo.vendor_id,cv.category_id)
          AND (vo.cost_ceiling_minor IS NULL OR vo.supplier_unit_price_minor<=vo.cost_ceiling_minor)
      ) eligible
    `, [ids, new Date(now)]);
    return new Set(result.rows.map((row) => String(row.canonical_public_id)));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "seo.product_offer_inventory_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Set();
  }
}

function fromDb(record: DatabaseCatalogRecord, image?: ApprovedCatalogImage, metadata?: CatalogMetadata): CatalogCard {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    categoryCode: record.categoryCode,
    departmentCode: record.departmentCode,
    categoryLabel: metadata?.categoryLabel,
    gtin: metadata?.gtin,
    mpn: metadata?.mpn,
    description: metadata?.description,
    brand: metadata?.brand,
    brandLogoObjectKey: metadata?.brandLogoObjectKey,
    color: metadata?.color,
    sizes: metadata?.sizes ?? [],
    fit: metadata?.fit,
    composition: metadata?.composition,
    madeIn: metadata?.madeIn,
    priceMinor: record.priceMinor,
    price: formatMoney(money(record.priceMinor)),
    available: record.available ?? false,
    availableToSell: record.availableToSell ?? 0,
    vendorId: record.vendorId,
    vendorName: record.vendorName,
    adviser: record.adviser,
    mediaId: image?.mediaId,
    mediaAlt: image?.altText
  };
}

function hashVisitor(visitorKey: string): string {
  return createHash("sha256").update(visitorKey).digest("hex");
}

function safeMinor(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${field} from PostgreSQL`);
  return parsed;
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function sameFilterValue(left: string | undefined, right: string | undefined): boolean {
  if (!right) return true;
  return normalizeSearchText(left ?? "") === normalizeSearchText(right);
}

function matchesCatalogFilters(record: DatabaseCatalogRecord, metadata: CatalogMetadata | undefined, filters: CatalogFilters): boolean {
  if (filters.subcategory && record.categoryCode !== filters.subcategory) return false;
  if (!sameFilterValue(metadata?.brand, filters.brand)) return false;
  if (!sameFilterValue(metadata?.color, filters.color)) return false;
  if (filters.size && !(metadata?.sizes ?? []).some((size) => sameFilterValue(size, filters.size))) return false;
  return true;
}

function matchesCatalogQuery(record: DatabaseCatalogRecord, metadata: CatalogMetadata | undefined, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return searchTextRelevance(normalizedQuery, [
    record.title,
    metadata?.description,
    metadata?.brand,
    metadata?.color,
    metadata?.mpn,
    metadata?.gtin,
    metadata?.categoryLabel,
    ...(metadata?.sizes ?? []),
    metadata?.fit,
    metadata?.composition,
    metadata?.madeIn
  ]) > 0;
}

function facetOptions(values: Iterable<string>): readonly CatalogFacetOption[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "el")).map((value) => ({ value, label: value }));
}

function customerVisibleCanonicals<T extends Readonly<{ title: string }>>(products: readonly T[]): readonly T[] {
  return products.filter((product) => isPublicCatalogueTitle(product.title));
}

function purchasablePublicCard(product: CatalogCard): boolean {
  return product.available && product.availableToSell > 0 && product.priceMinor > 0 && Boolean(product.vendorId);
}

function mergePublishedDropshipCards(
  localProducts: readonly CatalogCard[],
  dropshipProducts: readonly CatalogCard[]
): readonly CatalogCard[] {
  if (dropshipProducts.length === 0) return localProducts;
  const byCanonical = new Map(localProducts.map((product) => [product.id, product] as const));
  for (const dropshipProduct of dropshipProducts) {
    const existing = byCanonical.get(dropshipProduct.id);
    if (!existing || !purchasablePublicCard(existing)) byCanonical.set(dropshipProduct.id, dropshipProduct);
  }
  return [...byCanonical.values()];
}

/**
 * Resolve the exact offer that the fairness engine persisted for this visitor.
 * Available products must always use the assigned offer price. Canonical/reference
 * prices are only shown when the product is explicitly non-purchasable.
 */
async function withStickyAssignedOfferPrice(record: DatabaseCatalogRecord, visitorKey: string, postcode: string): Promise<DatabaseCatalogRecord | undefined> {
  if (!record.available || !record.vendorId) return undefined;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query(`
    SELECT vo.customer_price_minor
    FROM sticky_assignments sa
    JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=sa.offer_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    WHERE cv.public_id=$1
      AND sa.visitor_hash=$2
      AND sa.postcode_scope=$3
      AND sa.released_at IS NULL
      AND sa.expires_at>now()
      AND vo.status='approved'
      AND v.public_id=$4
    ORDER BY sa.locked_at DESC
    LIMIT 1
  `, [record.id, hashVisitor(visitorKey), postcode, record.vendorId]);
  if (!result.rowCount) throw new Error(`Assigned vendor offer price is missing for canonical ${record.id}`);
  return { ...record, priceMinor: safeMinor(result.rows[0]?.customer_price_minor, "customer_price_minor") };
}

async function withStickyAssignedOfferPrices(
  records: readonly DatabaseCatalogRecord[],
  visitorKey: string,
  postcode: string
): Promise<readonly DatabaseCatalogRecord[]> {
  if (records.length === 0) return [];
  const ids = [...new Set(records.filter((record) => record.available && record.vendorId).map((record) => record.id))];
  if (ids.length === 0) {
    return records.map((record) => record.available
      ? { ...record, available: false, availableToSell: 0, vendorId: undefined, vendorName: undefined, adviser: undefined }
      : record);
  }

  const result = await getProductionPostgresRuntime().nativePool.query<AssignedPriceRow>(`
    SELECT DISTINCT ON (cv.public_id)
      cv.public_id AS canonical_public_id,
      v.public_id AS vendor_public_id,
      vo.customer_price_minor
    FROM sticky_assignments sa
    JOIN canonical_variants cv ON cv.id=sa.canonical_variant_id
    JOIN vendor_offers vo ON vo.id=sa.offer_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    WHERE cv.public_id=ANY($1::text[])
      AND sa.visitor_hash=$2
      AND sa.postcode_scope=$3
      AND sa.released_at IS NULL
      AND sa.expires_at>now()
      AND vo.status='approved'
    ORDER BY cv.public_id,sa.locked_at DESC
  `, [ids, hashVisitor(visitorKey), postcode]);

  const byCanonical = new Map(result.rows.map((row) => [row.canonical_public_id, row] as const));
  let degraded = 0;
  const projected = records.map((record) => {
    if (!record.available) return record;
    const row = byCanonical.get(record.id);
    if (!record.vendorId || !row || row.vendor_public_id !== record.vendorId) {
      degraded += 1;
      return { ...record, available: false, availableToSell: 0, vendorId: undefined, vendorName: undefined, adviser: undefined };
    }
    return { ...record, priceMinor: safeMinor(row.customer_price_minor, "customer_price_minor") };
  });
  if (degraded > 0) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_price_bulk_degraded",
      canonicalCount: degraded
    }));
  }
  return projected;
}

/**
 * Storefront discovery should include active canonicals even before a sellable offer
 * exists. In that state the card is rendered as unavailable and its canonical price
 * is informational only; cart/checkout remain disabled until an assigned approved
 * offer with fresh inventory exists.
 */
async function withStorefrontDisplayPrice(record: DatabaseCatalogRecord, visitorKey: string, postcode: string): Promise<DatabaseCatalogRecord | undefined> {
  if (!record.available) return record;
  return withStickyAssignedOfferPrice(record, visitorKey, postcode);
}

async function withVendorOfferPrices(records: readonly DatabaseCatalogRecord[], vendorId: string): Promise<readonly DatabaseCatalogRecord[]> {
  if (records.length === 0) return [];
  const ids = [...new Set(records.map((record) => record.id))];
  const result = await getProductionPostgresRuntime().nativePool.query<VendorOfferPriceRow>(`
    SELECT DISTINCT ON (cv.public_id)
      cv.public_id AS canonical_public_id,
      vo.customer_price_minor
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE cv.public_id=ANY($1::text[])
      AND v.public_id=$2
      AND vo.status='approved'
      AND l.active=true
    ORDER BY cv.public_id,ib.stock_confirmed_at DESC NULLS LAST,vo.updated_at DESC,vo.public_id
  `, [ids, vendorId]);
  const byCanonical = new Map(result.rows.map((row) => [row.canonical_public_id, row.customer_price_minor] as const));
  return records.flatMap((record) => {
    const price = byCanonical.get(record.id);
    return price === undefined ? [] : [{ ...record, priceMinor: safeMinor(price, "customer_price_minor") }];
  });
}

async function enrichDatabaseRecords(records: readonly DatabaseCatalogRecord[], providedMetadata?: ReadonlyMap<string, CatalogMetadata>): Promise<readonly CatalogCard[]> {
  if (records.length === 0) return [];
  const metadata = providedMetadata ?? await loadCatalogMetadata(records.map((record) => record.id));
  try {
    const images = await approvedCatalogImages(records.map((record) => ({ canonicalVariantId: record.id, preferredVendorId: record.vendorId })));
    const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
    return records.map((record) => fromDb(record, imageByCanonical.get(record.id), metadata.get(record.id)));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "storefront.public_media_projection_failed", message: error instanceof Error ? error.message : String(error) }));
    return records.map((record) => fromDb(record, undefined, metadata.get(record.id)));
  }
}

/**
 * Authoritative public-admission check used before a direct fairness assignment.
 * Reuse the request-local public catalogue snapshot rather than issuing a second
 * full canonical query from the product-detail path.
 */
async function canonicalIsPubliclyAllowed(canonicalVariantId: string): Promise<boolean> {
  if (!productionDatabaseConfigured()) return false;
  return (await getPublicCatalogProducts()).some((product) => product.id === canonicalVariantId);
}

/**
 * Metadata-only helper retained for internal callers. Customer-facing purchasable
 * surfaces still resolve their price from an assigned vendor offer.
 */
export const getCanonicalProductSummary = cache(async (routeKey: string): Promise<Readonly<{ id: string; slug: string; title: string; price: string; priceMinor: number; categoryCode: string; departmentCode?: string }> | undefined> => {
  const products = await getPublicCatalogProducts();
  const product = products.find((entry) => entry.id === routeKey) ?? products.find((entry) => entry.slug === routeKey);
  return product ? { id: product.id, slug: product.slug, title: product.title, priceMinor: product.priceMinor, price: product.price, categoryCode: product.categoryCode, departmentCode: product.departmentCode } : undefined;
});

export const getPublicProductSeoSummary = cache(async (routeKey: string) => {
  const product = await getCanonicalProductSummary(routeKey);
  if (!product) return undefined;
  const [metadata, detail, availableOfferIds] = await Promise.all([
    loadCatalogMetadata([product.id]).then((entries) => entries.get(product.id)),
    getPublicProductDetail(product.id),
    loadPublicOfferAvailability([product.id])
  ]);
  const titleKey = product.title.trim().toLocaleLowerCase("el");
  const duplicateTitleCount = (await getPublicCatalogProducts()).filter((entry) => entry.title.trim().toLocaleLowerCase("el") === titleKey).length;
  let image: ApprovedCatalogImage | undefined;
  try {
    image = (await approvedCatalogImages([{ canonicalVariantId: product.id }]))[0];
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "seo.product_media_projection_failed", canonicalVariantId: product.id, message: error instanceof Error ? error.message : String(error) }));
  }
  return {
    ...product,
    description: metadata?.description ?? detail?.description,
    brand: metadata?.brand ?? detail?.brand,
    gtin: metadata?.gtin ?? detail?.sourceGtin,
    mpn: metadata?.mpn,
    categoryLabel: metadata?.categoryLabel,
    color: metadata?.color,
    sizes: metadata?.sizes ?? [],
    mediaId: image?.mediaId,
    mediaAlt: image?.altText,
    sourceImageAvailable: Boolean(detail?.sourceImageUrl),
    offerAvailable: availableOfferIds.has(product.id),
    duplicateTitleCount
  } as const;
});

export async function getCatalogFacets(category = "", query = ""): Promise<CatalogFacets> {
  if (!productionDatabaseConfigured()) return { subcategories: [], brands: [], colors: [], sizes: [] };
  const normalizedQuery = normalizeSearchText(query);
  const rawCanonicals = customerVisibleCanonicals(await getProductionPostgresRuntime().customerCommerce.publicCanonicals());
  const departmentCodes = await loadCatalogDepartmentCodes(rawCanonicals.map((product) => product.id));
  const canonicals = rawCanonicals
    .map((product) => ({ ...product, departmentCode: departmentCodes.get(product.id) }))
    .filter((product) => categoryCodeMatches(product.categoryCode, category, product.departmentCode));
  const metadata = await loadCatalogMetadata(canonicals.map((product) => product.id));
  const visible = canonicals.filter((product) => matchesCatalogQuery(product, metadata.get(product.id), normalizedQuery));
  const subcategoryMap = new Map<string, string>();
  const brands: string[] = [];
  const colors: string[] = [];
  const sizes: string[] = [];
  for (const product of visible) {
    const details = metadata.get(product.id);
    subcategoryMap.set(product.categoryCode, details?.categoryLabel ?? product.categoryCode);
    if (details?.brand) brands.push(details.brand);
    if (details?.color) colors.push(details.color);
    sizes.push(...(details?.sizes ?? []));
  }
  return {
    subcategories: [...subcategoryMap.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "el")),
    brands: facetOptions(brands),
    colors: facetOptions(colors),
    sizes: facetOptions(sizes)
  };
}

export async function getCatalogCards(
  visitorKey: string,
  postcode = "23100",
  query = "",
  category = "",
  filters: CatalogFilters = {},
  attributeFilters: CatalogAttributeFilters = {}
): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const normalizedQuery = normalizeSearchText(query);
  const production = getProductionPostgresRuntime();
  const commerce = production.customerCommerce;
  const rawCanonicals = customerVisibleCanonicals(await commerce.publicCanonicals());
  const departmentCodes = await loadCatalogDepartmentCodes(rawCanonicals.map((product) => product.id));
  const canonicals = rawCanonicals
    .map((product) => ({ ...product, departmentCode: departmentCodes.get(product.id) }))
    .filter((product) => categoryCodeMatches(product.categoryCode, category, product.departmentCode));
  const metadata = await loadCatalogMetadata(canonicals.map((product) => product.id));
  const canonicalById = new Map(canonicals.map((product) => [product.id, product]));
  let canonicalIds: readonly string[];
  if (normalizedQuery && process.env.BLS_SEARCH_ENABLED === "true") {
    if (!production.search) throw new Error("Production search is enabled but the Meilisearch runtime is unavailable");
    const hits = await production.search.search({ marketId: "sparta", q: query, type: "product", limit: 100, attributeFilters });
    const allowedIds = new Set(canonicals.map((product) => product.id));
    canonicalIds = hits
      .map((hit) => hit.document.id)
      .filter((id) => allowedIds.has(id))
      .filter((id) => matchesCatalogAttributeFilters(metadata.get(id)?.attributes, attributeFilters));
  } else {
    canonicalIds = canonicals
      .filter((product) => matchesCatalogQuery(product, metadata.get(product.id), normalizedQuery))
      .filter((product) => matchesCatalogAttributeFilters(metadata.get(product.id)?.attributes, attributeFilters))
      .map((product) => product.id);
  }
  canonicalIds = canonicalIds.filter((id) => {
    const product = canonicalById.get(id);
    return product ? matchesCatalogFilters(product, metadata.get(id), filters) : false;
  });

  const assignedResults = await mapWithConcurrency(canonicalIds, CATALOG_ASSIGNMENT_CONCURRENCY, async (canonicalVariantId) => {
    try {
      const record = await commerce.publicAssignedCanonical({ canonicalVariantId, visitorKey, postcode, reason: "search_card" });
      return record ? { ...record, departmentCode: canonicalById.get(canonicalVariantId)?.departmentCode } : undefined;
    } catch (error) {
      const fallback = canonicalById.get(canonicalVariantId);
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.catalog_assignment_degraded",
        canonicalVariantId,
        message: error instanceof Error ? error.message : String(error)
      }));
      return fallback ? { ...fallback, available: false, availableToSell: 0 } : undefined;
    }
  });
  const assigned = assignedResults.flatMap((record) => record ? [record] : []);

  let priced: readonly DatabaseCatalogRecord[];
  try {
    priced = await withStickyAssignedOfferPrices(assigned, visitorKey, postcode);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "storefront.catalog_price_bulk_failed",
      canonicalCount: assigned.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    priced = assigned.map((record) => record.available
      ? { ...record, available: false, availableToSell: 0, vendorId: undefined, vendorName: undefined, adviser: undefined }
      : record);
  }

  const localProducts = await enrichDatabaseRecords(priced, metadata);
  const dropshipProducts = await getPublishedDropshipCatalogCards(query, category, filters, attributeFilters);
  return mergePublishedDropshipCards(localProducts, dropshipProducts);
}

export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  if (!await canonicalIsPubliclyAllowed(id)) return undefined;
  const record = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({ canonicalVariantId: id, visitorKey, postcode, reason: "product_view" });
  if (!record || !isPublicCatalogueTitle(record.title)) return undefined;
  const priced = await withStorefrontDisplayPrice(record, visitorKey, postcode);
  if (!priced) return undefined;
  const [metadata, departmentCodes] = await Promise.all([
    loadCatalogMetadata([id]),
    loadCatalogDepartmentCodes([id])
  ]);
  const localProduct = (await enrichDatabaseRecords([{ ...priced, departmentCode: departmentCodes.get(id) }], metadata))[0];
  if (localProduct && purchasablePublicCard(localProduct)) return localProduct;
  const dropshipProduct = (await getPublishedDropshipCatalogCards("", "", {}, {}, undefined, id))[0];
  return dropshipProduct ?? localProduct;
}

export async function getPublicVendor(vendorId: string): Promise<PublicVendorView | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.publicVendorProfile(vendorId);
}

export async function getVendorCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const [rawRecords, dropshipProducts] = await Promise.all([
    getProductionPostgresRuntime().customerCommerce.publicVendorCanonicals(vendorId),
    getPublishedDropshipCatalogCards("", "", {}, {}, vendorId)
  ]);
  const records = customerVisibleCanonicals(rawRecords);
  const availableRecords = await withVendorOfferPrices(records, vendorId);
  const [metadata, departmentCodes] = await Promise.all([
    loadCatalogMetadata(availableRecords.map((record) => record.id)),
    loadCatalogDepartmentCodes(availableRecords.map((record) => record.id))
  ]);
  const localProducts = await enrichDatabaseRecords(availableRecords.map((record) => ({ ...record, departmentCode: departmentCodes.get(record.id) })), metadata);
  return mergePublishedDropshipCards(localProducts, dropshipProducts);
}

export async function getCanonicalAvailability(id: string, postcode = "23100"): Promise<Readonly<{ available: boolean; availableToSell: number }> | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().customerCommerce.publicCanonicalAvailability(id, { postcode });
  if (result && isPublicCatalogueTitle(result.product.title) && result.available) {
    return { available: true, availableToSell: result.availableToSell };
  }
  const dropshipProduct = (await getPublishedDropshipCatalogCards("", "", {}, {}, undefined, id))[0];
  if (dropshipProduct) return { available: true, availableToSell: dropshipProduct.availableToSell };
  return result && isPublicCatalogueTitle(result.product.title) ? { available: false, availableToSell: 0 } : undefined;
}

/**
 * Internal/non-personalized projection only. Do not use this helper as the price
 * source for a purchasable customer flow; live prices come from assigned offers.
 */
async function readPublicCatalogProducts(): Promise<readonly PublicCatalogProduct[]> {
  if (!productionDatabaseConfigured()) return [];
  const canonicals = customerVisibleCanonicals(await getProductionPostgresRuntime().customerCommerce.publicCanonicals());
  const departmentCodes = await loadCatalogDepartmentCodes(canonicals.map((product) => product.id));
  return canonicals.map((product) => ({
    id: product.id,
    slug: product.slug,
    title: product.title,
    priceMinor: product.priceMinor,
    price: formatMoney(money(product.priceMinor)),
    categoryCode: product.categoryCode,
    departmentCode: departmentCodes.get(product.id)
  }));
}

export const getPublicCatalogProducts = cache(readPublicCatalogProducts);

async function readPublicProductSeoInventory(): Promise<PublicProductSeoInventory> {
  const products = await getPublicCatalogProducts();
  if (products.length === 0) return { products: [], mediaProjectionAvailable: true };
  const productIds = products.map((product) => product.id);
  const [metadata, publicDetails, availableOfferIds] = await Promise.all([
    loadCatalogMetadata(productIds),
    getPublicProductDetails(productIds),
    loadPublicOfferAvailability(productIds)
  ]);
  const titleCounts = new Map<string, number>();
  for (const product of products) {
    const key = product.title.trim().toLocaleLowerCase("el");
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  }

  const images: ApprovedCatalogImage[] = [];
  let mediaProjectionAvailable = true;
  try {
    for (let index = 0; index < products.length; index += 250) {
      images.push(...await approvedCatalogImages(products.slice(index, index + 250).map((product) => ({ canonicalVariantId: product.id }))));
    }
  } catch (error) {
    mediaProjectionAvailable = false;
    console.error(JSON.stringify({ level: "error", event: "seo.product_media_inventory_failed", message: error instanceof Error ? error.message : String(error) }));
  }
  const imageByProduct = new Map(images.map((image) => [image.canonicalVariantId, image]));

  return {
    mediaProjectionAvailable,
    products: products.map((product) => {
      const details = metadata.get(product.id);
      const sourceDetail = publicDetails.get(product.id);
      const image = imageByProduct.get(product.id);
      return {
        ...product,
        description: details?.description ?? sourceDetail?.description,
        brand: details?.brand ?? sourceDetail?.brand,
        gtin: details?.gtin ?? sourceDetail?.sourceGtin,
        mpn: details?.mpn,
        categoryLabel: details?.categoryLabel,
        color: details?.color,
        sizes: details?.sizes ?? [],
        mediaId: image?.mediaId,
        mediaAlt: image?.altText,
        sourceImageAvailable: Boolean(sourceDetail?.sourceImageUrl),
        offerAvailable: availableOfferIds.has(product.id),
        duplicateTitleCount: titleCounts.get(product.title.trim().toLocaleLowerCase("el")) ?? 1
      };
    })
  };
}

export const getPublicProductSeoInventory = cache(readPublicProductSeoInventory);
