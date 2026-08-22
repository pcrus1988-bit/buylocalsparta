import { createHash } from "node:crypto";
import { formatMoney, money, normalizeSearchText } from "@buy-local-sparta/core";
import { cache } from "react";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages, type ApprovedCatalogImage } from "./public-media-service";
import { loadCatalogMetadata, type CatalogMetadata } from "./catalog-metadata";
import { categoryCodeMatches } from "./storefront-taxonomy";

export type CatalogCard = Readonly<{
  id: string;
  slug: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  categoryLabel?: string;
  gtin?: string;
  mpn?: string;
  description?: string;
  brand?: string;
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
  priceMinor: number;
  available?: boolean;
  availableToSell?: number;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}>;

function fromDb(record: DatabaseCatalogRecord, image?: ApprovedCatalogImage, metadata?: CatalogMetadata): CatalogCard {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    categoryCode: record.categoryCode,
    categoryLabel: metadata?.categoryLabel,
    gtin: metadata?.gtin,
    mpn: metadata?.mpn,
    description: metadata?.description,
    brand: metadata?.brand,
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
  return [record.title, metadata?.description, metadata?.brand, metadata?.color, metadata?.mpn, metadata?.categoryLabel]
    .some((value) => normalizeSearchText(value ?? "").includes(normalizedQuery));
}

function facetOptions(values: Iterable<string>): readonly CatalogFacetOption[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "el")).map((value) => ({ value, label: value }));
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

async function withVendorOfferPrice(record: DatabaseCatalogRecord, vendorId: string): Promise<DatabaseCatalogRecord | undefined> {
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query(`
    SELECT vo.customer_price_minor
    FROM vendor_offers vo
    JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
    JOIN vendor_businesses v ON v.id=vo.vendor_id
    JOIN vendor_locations l ON l.id=vo.location_id
    LEFT JOIN inventory_balances ib ON ib.offer_id=vo.id
    WHERE cv.public_id=$1
      AND v.public_id=$2
      AND vo.status='approved'
      AND l.active=true
    ORDER BY ib.stock_confirmed_at DESC NULLS LAST, vo.updated_at DESC, vo.public_id
    LIMIT 1
  `, [record.id, vendorId]);
  if (!result.rowCount) return undefined;
  return { ...record, priceMinor: safeMinor(result.rows[0]?.customer_price_minor, "customer_price_minor") };
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
 * `publicCanonicals()` is itself filtered in PostgreSQL to active, non-suppressed,
 * non-recalled canonicals, so compliance/recall holds cannot reach assignment.
 */
async function canonicalIsPubliclyAllowed(canonicalVariantId: string): Promise<boolean> {
  if (!productionDatabaseConfigured()) return false;
  return (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).some((product) => product.id === canonicalVariantId);
}

/**
 * Metadata-only helper retained for internal callers. Customer-facing purchasable
 * surfaces still resolve their price from an assigned vendor offer.
 */
export const getCanonicalProductSummary = cache(async (routeKey: string): Promise<Readonly<{ id: string; slug: string; title: string; price: string; priceMinor: number; categoryCode: string }> | undefined> => {
  const products = await getPublicCatalogProducts();
  const product = products.find((entry) => entry.id === routeKey) ?? products.find((entry) => entry.slug === routeKey);
  return product ? { id: product.id, slug: product.slug, title: product.title, priceMinor: product.priceMinor, price: product.price, categoryCode: product.categoryCode } : undefined;
});

export const getPublicProductSeoSummary = cache(async (routeKey: string) => {
  const product = await getCanonicalProductSummary(routeKey);
  if (!product) return undefined;
  const metadata = (await loadCatalogMetadata([product.id])).get(product.id);
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
    description: metadata?.description,
    brand: metadata?.brand,
    gtin: metadata?.gtin,
    mpn: metadata?.mpn,
    categoryLabel: metadata?.categoryLabel,
    color: metadata?.color,
    sizes: metadata?.sizes ?? [],
    mediaId: image?.mediaId,
    mediaAlt: image?.altText,
    duplicateTitleCount
  } as const;
});

export async function getCatalogFacets(category = "", query = ""): Promise<CatalogFacets> {
  if (!productionDatabaseConfigured()) return { subcategories: [], brands: [], colors: [], sizes: [] };
  const normalizedQuery = normalizeSearchText(query);
  const canonicals = (await getProductionPostgresRuntime().customerCommerce.publicCanonicals())
    .filter((product) => categoryCodeMatches(product.categoryCode, category));
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

export async function getCatalogCards(visitorKey: string, postcode = "23100", query = "", category = "", filters: CatalogFilters = {}): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const normalizedQuery = normalizeSearchText(query);
  const production = getProductionPostgresRuntime();
  const commerce = production.customerCommerce;
  const canonicals = (await commerce.publicCanonicals()).filter((product) => categoryCodeMatches(product.categoryCode, category));
  const metadata = await loadCatalogMetadata(canonicals.map((product) => product.id));
  const canonicalById = new Map(canonicals.map((product) => [product.id, product]));
  let canonicalIds: readonly string[];
  if (normalizedQuery && process.env.BLS_SEARCH_ENABLED === "true") {
    if (!production.search) throw new Error("Production search is enabled but the Meilisearch runtime is unavailable");
    const hits = await production.search.search({ marketId: "sparta", q: query, type: "product", limit: 100 });
    const allowedIds = new Set(canonicals.map((product) => product.id));
    canonicalIds = hits.map((hit) => hit.document.id).filter((id) => allowedIds.has(id));
  } else {
    canonicalIds = canonicals.filter((product) => matchesCatalogQuery(product, metadata.get(product.id), normalizedQuery)).map((product) => product.id);
  }
  canonicalIds = canonicalIds.filter((id) => {
    const product = canonicalById.get(id);
    return product ? matchesCatalogFilters(product, metadata.get(id), filters) : false;
  });

  // Fairness assignment writes sticky/rotation state. Running one serializable
  // transaction per product in Promise.all can deadlock on overlapping vendor rows
  // and can exhaust the serverless PostgreSQL pool. Keep discovery deterministic and
  // bounded by assigning sequentially. If one assignment is temporarily contended,
  // render that canonical as unavailable rather than failing the entire storefront.
  const assigned: DatabaseCatalogRecord[] = [];
  for (const canonicalVariantId of canonicalIds) {
    try {
      const record = await commerce.publicAssignedCanonical({ canonicalVariantId, visitorKey, postcode, reason: "search_card" });
      if (record) assigned.push(record);
    } catch (error) {
      const fallback = canonicalById.get(canonicalVariantId);
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.catalog_assignment_degraded",
        canonicalVariantId,
        message: error instanceof Error ? error.message : String(error)
      }));
      if (fallback) assigned.push({ ...fallback, available: false, availableToSell: 0 });
    }
  }

  const priced: DatabaseCatalogRecord[] = [];
  for (const record of assigned) {
    try {
      const display = await withStorefrontDisplayPrice(record, visitorKey, postcode);
      if (display) priced.push(display);
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "storefront.catalog_price_degraded",
        canonicalVariantId: record.id,
        message: error instanceof Error ? error.message : String(error)
      }));
      priced.push({ ...record, available: false, availableToSell: 0, vendorId: undefined, vendorName: undefined, adviser: undefined });
    }
  }
  return enrichDatabaseRecords(priced, metadata);
}

export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  if (!await canonicalIsPubliclyAllowed(id)) return undefined;
  const record = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({ canonicalVariantId: id, visitorKey, postcode, reason: "product_view" });
  if (!record) return undefined;
  const priced = await withStorefrontDisplayPrice(record, visitorKey, postcode);
  if (!priced) return undefined;
  const metadata = await loadCatalogMetadata([id]);
  return (await enrichDatabaseRecords([priced], metadata))[0];
}

export async function getPublicVendor(vendorId: string): Promise<PublicVendorView | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.publicVendorProfile(vendorId);
}

export async function getVendorCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const records = await getProductionPostgresRuntime().customerCommerce.publicVendorCanonicals(vendorId);
  const priced = await Promise.all(records.map((record) => withVendorOfferPrice(record, vendorId)));
  const availableRecords = priced.flatMap((record) => record ? [record] : []);
  const metadata = await loadCatalogMetadata(availableRecords.map((record) => record.id));
  return enrichDatabaseRecords(availableRecords, metadata);
}

export async function getCanonicalAvailability(id: string, postcode = "23100"): Promise<Readonly<{ available: boolean; availableToSell: number }> | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().customerCommerce.publicCanonicalAvailability(id, { postcode });
  return result ? { available: result.available, availableToSell: result.availableToSell } : undefined;
}

/**
 * Internal/non-personalized projection only. Do not use this helper as the price
 * source for a purchasable customer flow; live prices come from assigned offers.
 */
async function readPublicCatalogProducts(): Promise<readonly PublicCatalogProduct[]> {
  if (!productionDatabaseConfigured()) return [];
  return (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).map((product) => ({ id: product.id, slug: product.slug, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)), categoryCode: product.categoryCode }));
}

export const getPublicCatalogProducts = cache(readPublicCatalogProducts);

async function readPublicProductSeoInventory(): Promise<PublicProductSeoInventory> {
  const products = await getPublicCatalogProducts();
  if (products.length === 0) return { products: [], mediaProjectionAvailable: true };
  const metadata = await loadCatalogMetadata(products.map((product) => product.id));
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
      const image = imageByProduct.get(product.id);
      return {
        ...product,
        description: details?.description,
        brand: details?.brand,
        gtin: details?.gtin,
        mpn: details?.mpn,
        categoryLabel: details?.categoryLabel,
        color: details?.color,
        sizes: details?.sizes ?? [],
        mediaId: image?.mediaId,
        mediaAlt: image?.altText,
        duplicateTitleCount: titleCounts.get(product.title.trim().toLocaleLowerCase("el")) ?? 1
      };
    })
  };
}

export const getPublicProductSeoInventory = cache(readPublicProductSeoInventory);
