import { getPublicCatalogProducts } from "../../../../lib/catalog-view";
import { loadCatalogMetadata } from "../../../../lib/catalog-metadata";
import { getPublicProductDetails } from "../../../../lib/public-product-detail";
import { approvedCatalogImages, type ApprovedCatalogImage } from "../../../../lib/public-media-service";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

const MAX_CART_ITEMS = 100;

type PartnerFulfilmentRow = Readonly<{ canonical_public_id: string }>;

async function requestedIds(request: Request): Promise<readonly string[]> {
  try {
    const body = await request.json() as { ids?: unknown };
    if (!Array.isArray(body.ids)) return [];
    return [...new Set(body.ids
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value) => value.length > 0 && value.length <= 128))]
      .slice(0, MAX_CART_ITEMS);
  } catch {
    return [];
  }
}

function clipped(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

async function supplierExclusiveProductIds(ids: readonly string[]): Promise<ReadonlySet<string>> {
  if (!ids.length || !productionDatabaseConfigured()) return new Set();
  try {
    const result = await getProductionPostgresRuntime().nativePool.query<PartnerFulfilmentRow>(`
      SELECT cv.public_id AS canonical_public_id
      FROM canonical_variants cv
      WHERE cv.public_id=ANY($1::text[])
        AND EXISTS (
          SELECT 1
          FROM vendor_offers vo
          JOIN dropship_supplier_offers dso ON dso.vendor_offer_id=vo.id
          JOIN dropship_suppliers ds ON ds.id=dso.supplier_id
          WHERE vo.canonical_variant_id=cv.id
            AND vo.status='approved'
            AND vo.merchant_visible=true
            AND vo.merchant_pause_active=false
            AND dso.active=true
            AND ds.active=true
        )
        AND NOT EXISTS (
          SELECT 1
          FROM vendor_offers local_vo
          WHERE local_vo.canonical_variant_id=cv.id
            AND local_vo.status='approved'
            AND local_vo.merchant_visible=true
            AND local_vo.merchant_pause_active=false
            AND NOT EXISTS (
              SELECT 1
              FROM dropship_supplier_offers local_dso
              WHERE local_dso.vendor_offer_id=local_vo.id
                AND local_dso.active=true
            )
        )
    `, [ids]);
    return new Set(result.rows.map((row) => String(row.canonical_public_id)));
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "cart.fulfilment_classification_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return new Set();
  }
}

export async function POST(request: Request) {
  const ids = await requestedIds(request);
  if (ids.length === 0) return Response.json({ items: [] });

  try {
    const requested = new Set(ids);
    const products = (await getPublicCatalogProducts()).filter((product) => requested.has(product.id));
    const productIds = products.map((product) => product.id);
    if (productIds.length === 0) return Response.json({ items: [] });

    const [metadata, publicDetails, supplierExclusiveIds] = await Promise.all([
      loadCatalogMetadata(productIds),
      getPublicProductDetails(productIds),
      supplierExclusiveProductIds(productIds)
    ]);

    let images: readonly ApprovedCatalogImage[] = [];
    try {
      images = await approvedCatalogImages(productIds.map((canonicalVariantId) => ({ canonicalVariantId })));
    } catch (error) {
      console.error(JSON.stringify({
        level: "warn",
        event: "cart.product_media_batch_failed",
        canonicalVariantCount: productIds.length,
        message: error instanceof Error ? error.message : String(error)
      }));
    }
    const imageByProduct = new Map(images.map((image) => [image.canonicalVariantId, image]));

    return Response.json({
      items: products.map((product) => {
        const details = metadata.get(product.id);
        const publicDetail = publicDetails.get(product.id);
        const image = imageByProduct.get(product.id);
        return {
          canonicalVariantId: product.id,
          imageUrl: image?.mediaId
            ? `/api/media/${encodeURIComponent(image.mediaId)}`
            : publicDetail?.sourceImageUrl
              ? `/api/catalog-source-image/${encodeURIComponent(product.id)}`
              : undefined,
          imageAlt: clipped(image?.altText ?? product.title, 500),
          sku: clipped(details?.mpn, 160),
          gtin: clipped(details?.gtin ?? publicDetail?.sourceGtin, 64),
          color: clipped(details?.color, 160),
          size: clipped(details?.sizes.length ? details.sizes.join(", ") : undefined, 240),
          fulfilmentKind: supplierExclusiveIds.has(product.id) ? "partner" : "local"
        };
      })
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "cart.product_details_batch_failed",
      canonicalVariantCount: ids.length,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json({ items: [] });
  }
}
