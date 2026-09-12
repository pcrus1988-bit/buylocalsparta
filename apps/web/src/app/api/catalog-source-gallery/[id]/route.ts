import { getPublicCatalogSourceGallery } from "../../../../lib/public-catalog-source-gallery";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const { id } = await context.params;
  const canonicalVariantId = id.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(canonicalVariantId)) {
    return Response.json({ images: [] }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  const gallery = await getPublicCatalogSourceGallery(canonicalVariantId);
  return Response.json({
    images: gallery.map((image) => ({
      id: `source-${image.index}`,
      index: image.index,
      position: image.position,
      src: `/api/catalog-source-image/${encodeURIComponent(canonicalVariantId)}?index=${image.index}`,
      alt: image.altText ?? ""
    }))
  }, {
    headers: { "cache-control": "public, max-age=300, s-maxage=300, stale-while-revalidate=3600" }
  });
}
