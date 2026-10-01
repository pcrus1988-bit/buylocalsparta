import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../lib/postgres-runtime";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const SITE_ORIGIN = "https://kontamou.site";
const INVALID_XML_10_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu;

type SnapshotRow = Readonly<{
  canonical_variant_id: string;
  id: string;
  title: string;
  description: string | null;
  link: string | null;
  source_image_link: string | null;
  amount_micros: string | null;
  currency_code: string | null;
  brand: string | null;
  product_type: string | null;
}>;

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

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#(?:39|x27);/giu, "'")
    .replace(/&#(\d+);/gu, (_match, digits: string) => {
      const codePoint = Number(digits);
      return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    })
    .replace(/&#x([0-9a-f]+);/giu, (_match, digits: string) => {
      const codePoint = Number.parseInt(digits, 16);
      return Number.isSafeInteger(codePoint) && codePoint > 0 && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : "";
    });
}

function plainDescription(value: string | null): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = decodeHtmlEntities(
    value
      .replace(/<br\s*\/?>/giu, "\n")
      .replace(/<\/(?:p|div|li|tr|h[1-6])>/giu, "\n")
      .replace(/<[^>]*>/gu, " ")
  )
    .replace(/[ \t]+/gu, " ")
    .replace(/\s*\n\s*/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();

  return normalized || undefined;
}

function optionalTag(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  return normalized ? `    <${name}>${escapeXml(normalized)}</${name}>\n` : "";
}

function priceFromMicros(raw: string | null): string | undefined {
  const normalized = raw?.trim();
  if (!normalized || !/^\d+$/u.test(normalized)) return undefined;
  const micros = Number(normalized);
  if (!Number.isFinite(micros) || micros <= 0) return undefined;
  return (micros / 1_000_000).toFixed(2);
}

function safeKontamouLink(raw: string | null): string | undefined {
  const normalized = raw?.trim();
  if (!normalized) return undefined;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:" || (url.hostname !== "kontamou.site" && url.hostname !== "www.kontamou.site")) {
      return undefined;
    }
    return url.toString();
  } catch {
    return undefined;
  }
}

function rowXml(row: SnapshotRow): string {
  const price = priceFromMicros(row.amount_micros);
  const imageLink = row.source_image_link?.trim()
    ? `${SITE_ORIGIN}/api/catalog-source-image/${encodeURIComponent(row.canonical_variant_id)}`
    : undefined;

  return [
    "  <product>",
    `    <id>${escapeXml(row.id)}</id>`,
    `    <title>${escapeXml(row.title)}</title>`,
    optionalTag("description", plainDescription(row.description)).trimEnd(),
    optionalTag("link", safeKontamouLink(row.link)).trimEnd(),
    optionalTag("image_link", imageLink).trimEnd(),
    optionalTag("price", price).trimEnd(),
    optionalTag("currency_code", price ? (row.currency_code?.trim().toUpperCase() || "EUR") : undefined).trimEnd(),
    optionalTag("brand", row.brand?.trim() || undefined).trimEnd(),
    optionalTag("product_type", row.product_type?.trim() || undefined).trimEnd(),
    "  </product>"
  ].filter(Boolean).join("\n");
}

async function loadProducts(): Promise<readonly SnapshotRow[]> {
  if (!productionDatabaseConfigured()) {
    throw new Error("Production database is not configured");
  }

  const result = await getProductionPostgresRuntime().nativePool.query<SnapshotRow>(`
    SELECT DISTINCT ON (mps.canonical_variant_id)
      mps.canonical_variant_id::text,
      mps.canonical_variant_id::text AS id,
      btrim(mps.last_submitted_payload #>> '{productAttributes,title}') AS title,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,description}'), '') AS description,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,link}'), '') AS link,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,imageLink}'), '') AS source_image_link,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,price,amountMicros}'), '') AS amount_micros,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,price,currencyCode}'), '') AS currency_code,
      NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,brand}'), '') AS brand,
      COALESCE(
        NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,productType}'), ''),
        NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,productTypes,0}'), ''),
        NULLIF(btrim(rm.category_code), '')
      ) AS product_type
    FROM public.merchant_product_sync mps
    LEFT JOIN public.storefront_catalog_read_model rm
      ON rm.canonical_variant_id = mps.canonical_variant_id
    WHERE mps.sync_status = 'synced'
      AND mps.canonical_variant_id IS NOT NULL
      AND mps.feed_label = 'GR'
      AND mps.last_submitted_payload IS NOT NULL
      AND NULLIF(btrim(mps.last_submitted_payload #>> '{productAttributes,title}'), '') IS NOT NULL
      AND COALESCE(mps.last_submitted_payload #>> '{productAttributes,availability}', 'IN_STOCK') = 'IN_STOCK'
    ORDER BY
      mps.canonical_variant_id,
      CASE mps.content_language WHEN 'el' THEN 0 WHEN 'en' THEN 1 ELSE 2 END,
      mps.last_success_at DESC NULLS LAST,
      mps.updated_at DESC
  `);

  return result.rows;
}

export async function GET(): Promise<Response> {
  try {
    const rows = await loadProducts();
    const encoder = new TextEncoder();

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('<?xml version="1.0" encoding="UTF-8"?>\n<products>\n'));
        for (const row of rows) {
          controller.enqueue(encoder.encode(rowXml(row) + "\n"));
        }
        controller.enqueue(encoder.encode("</products>\n"));
        controller.close();
      }
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": 'attachment; filename="kontamou-products.xml"',
        "Cache-Control": "public, max-age=0, s-maxage=300, stale-while-revalidate=900",
        "X-Robots-Tag": "noindex, follow",
        "X-Kontamou-Product-Items": String(rows.length),
        "X-Content-Type-Options": "nosniff"
      }
    });
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
