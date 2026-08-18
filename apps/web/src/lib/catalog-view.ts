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
  const records = assigned.flatMap((record) => record ? [record] : []);
  return enrichDatabaseRecords(records);
}

export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  if (!await canonicalIsPubliclyAllowed(id)) return undefined;
  const record = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({ canonicalVariantId: id, visitorKey, postcode, reason: "product_view" });
  if (!record) return undefined;
  return (await enrichDatabaseRecords([record]))[0];
}

export async function getPublicVendor(vendorId: string): Promise<PublicVendorView | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  return getProductionPostgresRuntime().customerCommerce.publicVendorProfile(vendorId);
}

export async function getVendorCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (!productionDatabaseConfigured()) return [];
  const records = await getProductionPostgresRuntime().customerCommerce.publicVendorCanonicals(vendorId);
  return enrichDatabaseRecords(records);
}

export async function getCanonicalAvailability(id: string, postcode = "23100"): Promise<Readonly<{ available: boolean; availableToSell: number }> | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const result = await getProductionPostgresRuntime().customerCommerce.publicCanonicalAvailability(id, { postcode });
  return result ? { available: result.available, availableToSell: result.availableToSell } : undefined;
}

export async function getPublicCatalogProducts(): Promise<readonly Readonly<{ id: string; title: string; priceMinor: number; price: string; categoryCode: string }>[] > {
  if (!productionDatabaseConfigured()) return [];
  return (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).map((product) => ({ id: product.id, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)), categoryCode: product.categoryCode }));
}