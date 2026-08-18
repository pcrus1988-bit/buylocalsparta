import { createHash } from "node:crypto";
import { formatMoney, money, normalizeSearchText } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { approvedCatalogImages, type ApprovedCatalogImage } from "./public-media-service";
import { categoryCodeMatches } from "./storefront-taxonomy";

export type CatalogCard = Readonly<{
  id: string;
  title: string;
  price: string;
  priceMinor: number;
  categoryCode: string;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
  mediaId?: string;
  mediaAlt?: string;
  availableToSell: number;
  available: boolean;
}>;

export type PublicVendorView = Readonly<{ id: string; name: string; adviser?: string }>;
type DatabaseCatalogRecord = Readonly<{
  id: string;
  title: string;
  categoryCode: string;
  priceMinor: number;
  available?: boolean;
  availableToSell?: number;
  vendorId?: string;
  vendorName?: string;
  adviser?: string;
}>;

function fromDb(record: DatabaseCatalogRecord, image?: ApprovedCatalogImage): CatalogCard {
  return {
    id: record.id,
    title: record.title,
    categoryCode: record.categoryCode,
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

async function enrichDatabaseRecords(records: readonly DatabaseCatalogRecord[]): Promise<readonly CatalogCard[]> {
  if (records.length === 0) return [];
  try {
    const images = await approvedCatalogImages(records.map((record) => ({ canonicalVariantId: record.id, preferredVendorId: record.vendorId })));
    const imageByCanonical = new Map(images.map((image) => [image.canonicalVariantId, image]));
    return records.map((record) => fromDb(record, imageByCanonical.get(record.id)));
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "storefront.public_media_projection_failed", message: error instanceof Error ? error.message : String(error) }));
    return records.map((record) => fromDb(record));
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
export async function getCanonicalProductSummary(id: string): Promise<Readonly<{ id: string; title: string; price: string; priceMinor: number }> | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const product = (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).find((entry) => entry.id === id);
  return product ? { id: product.id, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)) } : undefined;
}

export async function getCatalogCards(visitorKey: string, postcode = "23100", query = "", category = ""): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const normalizedQuery = normalizeSearchText(query);
  const production = getProductionPostgresRuntime();
  const commerce = production.customerCommerce;
  const canonicals = (await commerce.publicCanonicals()).filter((product) => categoryCodeMatches(product.categoryCode, category));
  let canonicalIds: readonly string[];
  if (normalizedQuery && process.env.BLS_SEARCH_ENABLED === "true") {
    if (!production.search) throw new Error("Production search is enabled but the Meilisearch runtime is unavailable");
    const hits = await production.search.search({ marketId: "sparta", q: query, type: "product", limit: 100 });
    const allowedIds = new Set(canonicals.map((product) => product.id));
    canonicalIds = hits.map((hit) => hit.document.id).filter((id) => allowedIds.has(id));
  } else {
    canonicalIds = canonicals.filter((product) => !normalizedQuery || normalizeSearchText(product.title).includes(normalizedQuery)).map((product) => product.id);
  }
  const assigned = await Promise.all(canonicalIds.map((canonicalVariantId) => commerce.publicAssignedCanonical({ canonicalVariantId, visitorKey, postcode, reason: "search_card" })));
  const priced = await Promise.all(assigned.flatMap((record) => record ? [record] : []).map((record) => withStorefrontDisplayPrice(record, visitorKey, postcode)));
  return enrichDatabaseRecords(priced.flatMap((record) => record ? [record] : []));
}

export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  if (!await canonicalIsPubliclyAllowed(id)) return undefined;
  const record = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({ canonicalVariantId: id, visitorKey, postcode, reason: "product_view" });
  if (!record) return undefined;
  const priced = await withStorefrontDisplayPrice(record, visitorKey, postcode);
  if (!priced) return undefined;
  return (await enrichDatabaseRecords([priced]))[0];
}

export async function getPublicVendor(vendorId: string): Promise<PublicVendorView | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.publicVendorProfile(vendorId);
}

export async function getVendorCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const records = await getProductionPostgresRuntime().customerCommerce.publicVendorCanonicals(vendorId);
  const priced = await Promise.all(records.map((record) => withVendorOfferPrice(record, vendorId)));
  return enrichDatabaseRecords(priced.flatMap((record) => record ? [record] : []));
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
export async function getPublicCatalogProducts(): Promise<readonly Readonly<{ id: string; title: string; priceMinor: number; price: string; categoryCode: string }>[] > {
  if (!productionDatabaseConfigured()) return [];
  return (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).map((product) => ({ id: product.id, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)), categoryCode: product.categoryCode }));
}
