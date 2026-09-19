import { getColorFinderProducts } from "../../../../lib/color-finder-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await getColorFinderProducts();
    return Response.json(
      { products, degraded: products.length === 0 },
      {
        headers: {
          "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600"
        }
      }
    );
  } catch (error) {
    console.warn(JSON.stringify({
      level: "warn",
      event: "color_finder.catalogue_endpoint_degraded",
      message: error instanceof Error ? error.message : String(error)
    }));

    return Response.json(
      { products: [], degraded: true },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
        }
      }
    );
  }
}
