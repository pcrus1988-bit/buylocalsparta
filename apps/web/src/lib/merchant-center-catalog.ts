import { getCrawlerCatalogCards } from "./crawler-catalog";
import { getPublicProductSeoInventory } from "./catalog-view";
import { validMerchantCenterGtin, type MerchantCenterFeedProduct } from "./merchant-center-feed";
import { productPublicPath } from "./product-url";
import { publicCatalogueCardDescription, publicCatalogueTitleLabel } from "./public-data-integrity";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "./seo-entity-policy";
import { getSeoEntityOverridesSnapshot } from "./seo-entity-overrides";
import { getSeoGlobalSettingsSnapshot } from "./seo-settings";
import { productIndexEligibility } from "./seo-visibility-policy";

export const MERCHANT_CENTER_POSTCODE = "23100";
export const MERCHANT_CENTER_FEED_PATH = "/merchant-center/products.xml";
export const MERCHANT_CENTER_FEED_DESCRIPTION = "Ενεργά, δημόσια και άμεσα διαθέσιμα προϊόντα του ΚΟΝΤΑ ΜΟΥ για Google Merchant Center και δωρεάν καταχωρίσεις προϊόντων.";

export type MerchantCenterReadinessState =
  | "eligible"
  | "quality_hold"
  | "governance_hold"
  | "unavailable"
  | "missing_price"
  | "missing_image"
  | "missing_description";

export type MerchantCenterReadinessRow = Readonly<{
  id: string;
  title: string;
  link: string;
  state: MerchantCenterReadinessState;
  reasons: readonly string[];
  warnings: readonly string[];
  priceMinor?: number;
  brand?: string;
  gtin?: string;
  mpn?: string;
  vendorName?: string;
}>;

export type MerchantCenterCatalogueProjection = Readonly<{
  generatedAt: string;
  origin: string;
  siteName: string;
  feedUrl: string;
  indexingEnabled: boolean;
  feedOperational: boolean;
  operationalError?: string;
  products: readonly MerchantCenterFeedProduct[];
  rows: readonly MerchantCenterReadinessRow[];
  metrics: Readonly<{
    totalPublic: number;
    qualityEligible: number;
    governedIndexAllowed: number;
    feedEligible: number;
    qualityHeld: number;
    governanceHeld: number;
    unavailable: number;
    missingPrice: number;
    missingImage: number;
    missingDescription: number;
    validGtin: number;
    invalidGtin: number;
    noPublicIdentifiers: number;
  }>;
}>;

function publicImageUrl(input: Readonly<{ id: string; mediaId?: string; sourceImageAvailable?: boolean }>, origin: string): string | undefined {
  if (input.mediaId) return new URL(`/api/media/${encodeURIComponent(input.mediaId)}`, `${origin}/`).toString();
  if (input.sourceImageAvailable) return new URL(`/api/catalog-source-image/${encodeURIComponent(input.id)}`, `${origin}/`).toString();
  return undefined;
}

/**
 * Single Merchant Center read model used by both the public RSS source and Admin
 * diagnostics. It deliberately reuses the crawler offer preview, so feed price and
 * availability stay aligned with what a search crawler sees without consuming the
 * customer fairness rotation.
 */
export async function getMerchantCenterCatalogueProjection(): Promise<MerchantCenterCatalogueProjection> {
  const [{ settings }, overrides, inventory] = await Promise.all([
    getSeoGlobalSettingsSnapshot(),
    getSeoEntityOverridesSnapshot(),
    getPublicProductSeoInventory()
  ]);
  const origin = settings.canonicalOrigin.replace(/\/$/, "");
  const feedUrl = new URL(MERCHANT_CENTER_FEED_PATH, `${origin}/`).toString();
  const baseMetrics = {
    totalPublic: inventory.products.length,
    qualityEligible: 0,
    governedIndexAllowed: 0,
    feedEligible: 0,
    qualityHeld: 0,
    governanceHeld: 0,
    unavailable: 0,
    missingPrice: 0,
    missingImage: 0,
    missingDescription: 0,
    validGtin: 0,
    invalidGtin: 0,
    noPublicIdentifiers: 0
  };

  if (!settings.indexingEnabled) {
    const rows = inventory.products.map((record): MerchantCenterReadinessRow => ({
      id: record.id,
      title: publicCatalogueTitleLabel(record.title),
      link: new URL(productPublicPath(record), `${origin}/`).toString(),
      state: "governance_hold",
      reasons: ["Global search indexing is disabled; Merchant Center source is intentionally empty."],
      warnings: [],
      brand: record.brand,
      gtin: record.gtin,
      mpn: record.mpn
    }));
    return {
      generatedAt: new Date().toISOString(), origin, siteName: settings.siteName, feedUrl,
      indexingEnabled: false, feedOperational: true, products: [], rows,
      metrics: { ...baseMetrics, governanceHeld: rows.length }
    };
  }

  if (!inventory.mediaProjectionAvailable) {
    return {
      generatedAt: new Date().toISOString(), origin, siteName: settings.siteName, feedUrl,
      indexingEnabled: true,
      feedOperational: false,
      operationalError: "Public product media projection is unavailable; the feed must return 503 rather than a misleading empty catalogue.",
      products: [],
      rows: [],
      metrics: baseMetrics
    };
  }

  const cards = await getCrawlerCatalogCards(MERCHANT_CENTER_POSTCODE);
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const products: MerchantCenterFeedProduct[] = [];
  const rows: MerchantCenterReadinessRow[] = [];
  const metrics = { ...baseMetrics };

  for (const record of inventory.products) {
    const quality = productIndexEligibility(record);
    if (quality.eligible) metrics.qualityEligible += 1;

    const reference: SeoEntityReference = { kind: "product", id: record.id };
    const override = findSeoEntityOverride(overrides.entries, reference);
    const control = resolveSeoEntityControl({
      settings,
      kind: reference.kind,
      entityEligible: quality.blockingReasons.length === 0,
      defaultIndexAllowed: quality.eligible,
      override
    });
    if (control.indexAllowed) metrics.governedIndexAllowed += 1;

    const link = new URL(override?.canonicalPath ?? productPublicPath(record), `${origin}/`).toString();
    const card = cardById.get(record.id);
    const imageLink = publicImageUrl(record, origin);
    const description = publicCatalogueCardDescription(record.description ?? "");
    const validGtin = validMerchantCenterGtin(record.gtin);
    const warnings: string[] = [];
    if (record.gtin && !validGtin) {
      warnings.push("GTIN exists in the catalogue but fails supported length/check-digit validation, so it is omitted from the feed.");
      metrics.invalidGtin += 1;
    } else if (validGtin) {
      metrics.validGtin += 1;
    }
    if (!record.gtin && !record.mpn && !record.brand) {
      warnings.push("No public GTIN, MPN or brand is available. No identifier_exists claim is manufactured.");
      metrics.noPublicIdentifiers += 1;
    }

    let state: MerchantCenterReadinessState;
    let reasons: string[];
    if (!quality.eligible) {
      state = "quality_hold";
      reasons = quality.blockingReasons.length
        ? [...quality.blockingReasons]
        : [`Product quality score ${quality.score}/${quality.minimumScore} is below the indexing threshold.`];
      metrics.qualityHeld += 1;
    } else if (!control.indexAllowed) {
      state = "governance_hold";
      reasons = ["Governed SEO policy or an entity override prevents indexing and Merchant Center promotion."];
      metrics.governanceHeld += 1;
    } else if (!card?.available) {
      state = "unavailable";
      reasons = ["No currently eligible live pickup offer after stock freshness, vendor/location and fulfilment-capacity checks."];
      metrics.unavailable += 1;
    } else if (!Number.isSafeInteger(card.priceMinor) || card.priceMinor <= 0) {
      state = "missing_price";
      reasons = ["No positive current customer selling price is available from the crawler commerce projection."];
      metrics.missingPrice += 1;
    } else if (!imageLink) {
      state = "missing_image";
      reasons = ["No approved public product image or trusted source-image projection is available."];
      metrics.missingImage += 1;
    } else if (!description) {
      state = "missing_description";
      reasons = ["No safe public product description is available for the Merchant Center source."];
      metrics.missingDescription += 1;
    } else {
      state = "eligible";
      reasons = ["Index-governed, in stock, positive live price, public image and public description are all available."];
      metrics.feedEligible += 1;
      products.push({
        id: record.id,
        title: publicCatalogueTitleLabel(record.title),
        description,
        link,
        imageLink,
        priceMinor: card.priceMinor,
        availability: "in_stock",
        brand: record.brand,
        gtin: record.gtin,
        mpn: record.mpn,
        productType: record.categoryLabel ?? record.categoryCode
      });
    }

    rows.push({
      id: record.id,
      title: publicCatalogueTitleLabel(record.title),
      link,
      state,
      reasons,
      warnings,
      priceMinor: card?.priceMinor,
      brand: record.brand,
      gtin: record.gtin,
      mpn: record.mpn,
      vendorName: card?.vendorName
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    origin,
    siteName: settings.siteName,
    feedUrl,
    indexingEnabled: true,
    feedOperational: true,
    products,
    rows,
    metrics
  };
}
