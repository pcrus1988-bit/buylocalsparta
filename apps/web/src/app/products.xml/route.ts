import { getCrawlerCatalogCards } from "../../lib/crawler-catalog";
import { getPublicProductSeoInventory } from "../../lib/catalog-view";
import { productPublicPath } from "../../lib/product-url";
import { publicCatalogueCardDescription, publicCatalogueTitleLabel } from "../../lib/public-data-integrity";
import { findSeoEntityOverride, resolveSeoEntityControl, type SeoEntityReference } from "../../lib/seo-entity-policy";
import { getSeoEntityOverridesSnapshot } from "../../lib/seo-entity-overrides";
import { getSeoGlobalSettingsSnapshot } from "../../lib/seo-settings";
import { productIndexEligibility } from "../../lib/seo-visibility-policy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SPARTA_POSTCODE = "23100";
const INVALID_XML_10_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu;

function cleanXmlText(value: string): string {
  return value.replace(INVALID_XML_10_CONTROL, "").trim();
}

function escapeXml(value: string): string {
  return cleanXmlText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function optionalTag(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? `    <${name}>${escapeXml(normalized)}</${name}>\n` : "";
}

function publicImageUrl(
  input: Readonly<{ id: string; mediaId?: string; sourceImageAvailable?: boolean }>,
  origin: string
): string | undefined {
  if (input.mediaId) {
    return new URL(`/api/media/${encodeURIComponent(input.mediaId)}`, `${origin}/`).toString();
  }
  if (input.sourceImageAvailable) {
    return new URL(`/api/catalog-source-image/${encodeURIComponent(input.id)}`, `${origin}/`).toString();
  }
  return undefined;
}

type ExportProduct = Readonly<{
  id: string;
  title: string;
  description?: string;
  link?: string;
  imageLink?: string;
  price?: string;
  currencyCode?: string;
  brand?: string;
  productType?: string;
}>;

function productXml(product: ExportProduct): string {
  return [
    "  <product>",
    `    <id>${escapeXml(product.id)}</id>`,
    `    <title>${escapeXml(product.title)}</title>`,
    optionalTag("description", product.description).trimEnd(),
    optionalTag("link", product.link).trimEnd(),
    optionalTag("image_link", product.imageLink).trimEnd(),
    optionalTag("price", product.price).trimEnd(),
    optionalTag("currency_code", product.currencyCode).trimEnd(),
    optionalTag("brand", product.brand).trimEnd(),
    optionalTag("product_type", product.productType).trimEnd(),
    "  </product>"
  ].filter(Boolean).join("\n");
}

function buildProductsXml(products: readonly ExportProduct[]): string {
  const items = products
    .slice()
    .sort((left, right) => left.id.localeCompare(right.id))
    .map(productXml)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<products>\n${items ? `${items}\n` : ""}</products>\n`;
}

function xmlResponse(xml: string, itemCount: number): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="kontamou-products.xml"',
      "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
      "X-Robots-Tag": "noindex, follow",
      "X-Kontamou-Product-Items": String(itemCount),
      "X-Content-Type-Options": "nosniff"
    }
  });
}

export async function GET(): Promise<Response> {
  try {
    const [{ settings }, overrides, inventory] = await Promise.all([
      getSeoGlobalSettingsSnapshot(),
      getSeoEntityOverridesSnapshot(),
      getPublicProductSeoInventory()
    ]);
    const origin = settings.canonicalOrigin.replace(/\/$/, "");

    if (!settings.indexingEnabled) {
      return xmlResponse(buildProductsXml([]), 0);
    }

    if (!inventory.mediaProjectionAvailable) {
      throw new Error("Public product media projection is unavailable");
    }

    const cards = await getCrawlerCatalogCards(SPARTA_POSTCODE);
    const recordById = new Map(inventory.products.map((product) => [product.id, product]));
    const products: ExportProduct[] = [];

    for (const card of cards) {
      const record = recordById.get(card.id);
      if (!record || !card.available || !Number.isSafeInteger(card.priceMinor) || card.priceMinor <= 0) {
        continue;
      }

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

      const title = publicCatalogueTitleLabel(record.title);
      if (!title) continue;

      const imageLink = publicImageUrl(card, origin);
      const description = publicCatalogueCardDescription(record.description ?? "") || undefined;

      products.push({
        id: record.id,
        title,
        description,
        link: new URL(override?.canonicalPath ?? productPublicPath(record), `${origin}/`).toString(),
        imageLink,
        price: (card.priceMinor / 100).toFixed(2),
        currencyCode: "EUR",
        brand: record.brand?.trim() || undefined,
        productType: (record.categoryLabel ?? record.categoryCode)?.trim() || undefined
      });
    }

    return xmlResponse(buildProductsXml(products), products.length);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "products_xml.export_failed",
      message: error instanceof Error ? error.message : String(error)
    }));

    return new Response("Product XML temporarily unavailable.\n", {
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
