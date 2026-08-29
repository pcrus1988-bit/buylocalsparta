import { getCrawlerCatalogCards } from "../../../lib/crawler-catalog";
import { getPublicProductSeoInventory } from "../../../lib/catalog-view";
import { buildMerchantCenterRss, type MerchantCenterFeedProduct } from "../../../lib/merchant-center-feed";
import { productPublicPath } from "../../../lib/product-url";
import { publicCatalogueCardDescription, publicCatalogueTitleLabel } from "../../../lib/public-data-integrity";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../../lib/seo-entity-policy";
import { getSeoEntityOverridesSnapshot } from "../../../lib/seo-entity-overrides";
import { getSeoGlobalSettingsSnapshot } from "../../../lib/seo-settings";
import { productIndexEligibility } from "../../../lib/seo-visibility-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPARTA_POSTCODE = "23100";
const FEED_DESCRIPTION = "Ενεργά, δημόσια και άμεσα διαθέσιμα προϊόντα του ΚΟΝΤΑ ΜΟΥ για Google Merchant Center και δωρεάν καταχωρίσεις προϊόντων.";

function publicImageUrl(input: Readonly<{ id: string; mediaId?: string; sourceImageAvailable?: boolean }>, origin: string): string | undefined {
  if (input.mediaId) return new URL(`/api/media/${encodeURIComponent(input.mediaId)}`, `${origin}/`).toString();
  if (input.sourceImageAvailable) return new URL(`/api/catalog-source-image/${encodeURIComponent(input.id)}`, `${origin}/`).toString();
  return undefined;
}

function xmlResponse(xml: string, itemCount: number): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      "X-Robots-Tag": "noindex, follow",
      "X-Kontamou-Merchant-Items": String(itemCount)
    }
  });
}

/**
 * Primary Google Merchant Center RSS 2.0 data source.
 *
 * Feed admission intentionally reuses the public SEO quality gate and the crawler
 * commerce projection. That keeps Merchant Center price/availability aligned with
 * the offer that Google sees on the product landing page, without consuming vendor
 * fairness state or exposing a supplier as the seller of record.
 */
export async function GET(): Promise<Response> {
  try {
    const [{ settings }, overrides, inventory] = await Promise.all([
      getSeoGlobalSettingsSnapshot(),
      getSeoEntityOverridesSnapshot(),
      getPublicProductSeoInventory()
    ]);
    const origin = settings.canonicalOrigin.replace(/\/$/, "");

    if (!settings.indexingEnabled) {
      return xmlResponse(buildMerchantCenterRss({
        title: `${settings.siteName} · Merchant Center`,
        link: origin,
        description: FEED_DESCRIPTION,
        products: []
      }), 0);
    }

    // An image-projection outage must never masquerade as a legitimate empty feed:
    // removing products from an RSS source removes them from Merchant Center.
    if (!inventory.mediaProjectionAvailable) throw new Error("Public product media projection is unavailable");

    const cards = await getCrawlerCatalogCards(SPARTA_POSTCODE);
    const recordById = new Map(inventory.products.map((product) => [product.id, product]));
    const products: MerchantCenterFeedProduct[] = [];

    for (const card of cards) {
      const record = recordById.get(card.id);
      if (!record || !card.available || !Number.isSafeInteger(card.priceMinor) || card.priceMinor <= 0) continue;

      const quality = productIndexEligibility(record);
      const reference: SeoEntityReference = { kind: "product", id: record.id };
      const override = findSeoEntityOverride(overrides.entries, reference);
      const control = resolveSeoEntityControl({
        settings,
        kind: reference.kind,
        entityEligible: quality.blockingReasons.length === 0,
        defaultIndexAllowed: quality.eligible,
        override
      });
      if (!control.indexAllowed) continue;

      const imageLink = publicImageUrl(card, origin);
      if (!imageLink) continue;
      const description = publicCatalogueCardDescription(record.description ?? "");
      if (!description) continue;

      products.push({
        id: record.id,
        title: publicCatalogueTitleLabel(record.title),
        description,
        link: new URL(override?.canonicalPath ?? productPublicPath(record), `${origin}/`).toString(),
        imageLink,
        priceMinor: card.priceMinor,
        availability: "in_stock",
        brand: record.brand,
        gtin: record.gtin,
        mpn: record.mpn,
        productType: record.categoryLabel ?? record.categoryCode
      });
    }

    return xmlResponse(buildMerchantCenterRss({
      title: `${settings.siteName} · Merchant Center`,
      link: origin,
      description: FEED_DESCRIPTION,
      products
    }), products.length);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "merchant_center.product_feed_failed",
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Response("Merchant Center product feed temporarily unavailable.\n", {
      status: 503,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Robots-Tag": "noindex, nofollow"
      }
    });
  }
}
