import { getColorFinderProducts } from "../../../../lib/color-finder-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const categoryCode = url.searchParams.get("category")?.trim() || undefined;
  const vendorPublicId = url.searchParams.get("vendor")?.trim() || undefined;

  try {
    const products = await getColorFinderProducts({ categoryCode, vendorPublicId });
    return Response.json(
      {
        products,
        degraded: products.length === 0,
        scope: {
          category: categoryCode ?? "nail-care-colour",
          vendor: vendorPublicId ?? null
        }
      },
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
      categoryCode: categoryCode ?? "nail-care-colour",
      vendorPublicId: vendorPublicId ?? null,
      message: error instanceof Error ? error.message : String(error)
    }));

    return Response.json(
      {
        products: [],
        degraded: true,
        scope: {
          category: categoryCode ?? "nail-care-colour",
          vendor: vendorPublicId ?? null
        }
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120"
        }
      }
    );
  }
}
