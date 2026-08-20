import { readHomepageHeroImage } from "../../../../lib/homepage-hero-runtime";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const image = await readHomepageHeroImage(id);
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(new Uint8Array(image.bytes), {
      headers: {
        "content-type": image.contentType,
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
        ...(image.etag ? { etag: image.etag } : {})
      }
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
