import { formatMoney, money, normalizeSearchText, offerStockIsFresh, type AssignmentContext, type SellableVariant } from "@buy-local-sparta/core";
import { offers, runtime, variants, vendors } from "./demo-runtime";
import { canonicalIsPubliclyAllowed } from "./vendor-operations-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
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
type PublicAssignmentReason = Extract<AssignmentContext["reason"], "search_card" | "product_view" | "recommendation_card">;
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

function postgresEnabled(): boolean { return Boolean(process.env.DATABASE_URL?.trim()); }
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

export async function getCanonicalProductSummary(id: string): Promise<Readonly<{ id: string; title: string; price: string; priceMinor: number }> | undefined> {
  if (postgresEnabled()) {
    const product = (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).find((entry) => entry.id === id);
    return product ? { id: product.id, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)) } : undefined;
  }
  const variant = variants.find((entry) => entry.id === id);
  if (!variant || !canonicalIsPubliclyAllowed(variant.id)) return undefined;
  return { id: variant.id, title: variant.title, price: formatMoney(variant.platformPrice), priceMinor: variant.platformPrice.minor };
}

export async function getCatalogCards(visitorKey: string, postcode = "23100", query = "", category = ""): Promise<readonly CatalogCard[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (postgresEnabled()) {
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
  const visibleVariants = variants
    .filter((variant) => canonicalIsPubliclyAllowed(variant.id))
    .filter((variant) => categoryCodeMatches(variant.categoryCode, category))
    .filter((variant) => !normalizedQuery || normalizeSearchText(variant.title).includes(normalizedQuery));
  return visibleVariants.map((variant) => resolvePublicCard(variant, visitorKey, postcode, "search_card"));
}

export async function getCatalogCard(id: string, visitorKey: string, postcode = "23100"): Promise<CatalogCard | undefined> {
  if (postgresEnabled()) {
    const record = await getProductionPostgresRuntime().customerCommerce.publicAssignedCanonical({ canonicalVariantId: id, visitorKey, postcode, reason: "product_view" });
    if (!record) return undefined;
    return (await enrichDatabaseRecords([record]))[0];
  }
  const variant = variants.find((entry) => entry.id === id);
  if (!variant || !canonicalIsPubliclyAllowed(variant.id)) return undefined;
  return resolvePublicCard(variant, visitorKey, postcode, "product_view");
}

export async function getPublicVendor(vendorId: string): Promise<PublicVendorView | undefined> {
  if (postgresEnabled()) return getProductionPostgresRuntime().customerCommerce.publicVendorProfile(vendorId);
  const vendor = vendors.find((entry) => entry.id === vendorId);
  return vendor ? { id: vendor.id, name: vendor.name, adviser: vendor.adviser } : undefined;
}

export async function getVendorCatalogCards(vendorId: string): Promise<readonly CatalogCard[]> {
  if (postgresEnabled()) {
    const records = await getProductionPostgresRuntime().customerCommerce.publicVendorCanonicals(vendorId);
    return enrichDatabaseRecords(records);
  }
  const vendor = vendors.find((entry) => entry.id === vendorId);
  if (!vendor) return [];
  const now = Date.now();
  return variants.filter((variant) => canonicalIsPubliclyAllowed(variant.id)).flatMap((variant) => {
    const vendorOffers = (offers[variant.id] ?? []).filter((offer) => offer.vendorId === vendorId).map((offer) => ({ ...offer, availableToSell: runtime.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now) }));
    if (vendorOffers.length === 0) return [];
    const eligible = vendorOffers.filter((offer) => runtime.fairness.evaluateEligibility(offer).eligible);
    const availableToSell = eligible.length ? Math.max(...eligible.map((offer) => offer.availableToSell)) : 0;
    return [{ id: variant.id, title: variant.title, categoryCode: variant.categoryCode ?? "other", price: formatMoney(variant.platformPrice), priceMinor: variant.platformPrice.minor, vendorId: vendor.id, vendorName: vendor.name, adviser: vendor.adviser, availableToSell, available: availableToSell > 0 }];
  });
}

function resolvePublicCard(variant: SellableVariant, visitorKey: string, postcode: string, reason: PublicAssignmentReason): CatalogCard {
  if (!canonicalIsPubliclyAllowed(variant.id)) throw new Error("Canonical product is not publicly available");
  const now = Date.now();
  const runtimeOffers = (offers[variant.id] ?? []).map((offer) => ({ ...offer, availableToSell: runtime.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now) }));
  const eligibleOffers = runtimeOffers.filter((offer) => runtime.fairness.evaluateEligibility(offer).eligible);
  const base = { id: variant.id, title: variant.title, categoryCode: variant.categoryCode ?? "other", price: formatMoney(variant.platformPrice), priceMinor: variant.platformPrice.minor };
  if (eligibleOffers.length === 0) return { ...base, availableToSell: 0, available: false };
  const assignment = runtime.fairness.select({ marketId: variant.marketId, canonicalVariantId: variant.id, visitorKey, postcode, desiredFulfilment: "pickup", now, reason }, runtimeOffers);
  const vendor = vendors.find((entry) => entry.id === assignment.vendorId);
  if (!vendor) throw new Error(`Assigned vendor ${assignment.vendorId} is missing from public vendor projection`);
  const availableToSell = runtime.inventory.availableToSell(assignment.offerId);
  return { ...base, vendorId: vendor.id, vendorName: vendor.name, adviser: vendor.adviser, availableToSell, available: availableToSell > 0 };
}

export async function getCanonicalAvailability(id: string, postcode = "23100"): Promise<Readonly<{ available: boolean; availableToSell: number }> | undefined> {
  if (postgresEnabled()) {
    const result = await getProductionPostgresRuntime().customerCommerce.publicCanonicalAvailability(id, { postcode });
    return result ? { available: result.available, availableToSell: result.availableToSell } : undefined;
  }
  const variant = variants.find((entry) => entry.id === id);
  if (!variant || !canonicalIsPubliclyAllowed(id)) return undefined;
  const now = Date.now();
  const eligible = (offers[id] ?? []).map((offer) => ({ ...offer, availableToSell: runtime.inventory.availableToSell(offer.offerId), stockFresh: offerStockIsFresh(offer, now) })).filter((offer) => runtime.fairness.evaluateEligibility(offer).eligible);
  return { available: eligible.length > 0, availableToSell: eligible.length ? Math.max(...eligible.map((offer) => offer.availableToSell)) : 0 };
}

export async function getPublicCatalogProducts(): Promise<readonly Readonly<{ id: string; title: string; priceMinor: number; price: string; categoryCode: string }>[] > {
  if (postgresEnabled()) return (await getProductionPostgresRuntime().customerCommerce.publicCanonicals()).map((product) => ({ id: product.id, title: product.title, priceMinor: product.priceMinor, price: formatMoney(money(product.priceMinor)), categoryCode: product.categoryCode }));
  return variants.filter((variant) => canonicalIsPubliclyAllowed(variant.id)).map((variant) => ({ id: variant.id, title: variant.title, priceMinor: variant.platformPrice.minor, price: formatMoney(variant.platformPrice), categoryCode: variant.categoryCode ?? "other" }));
}
