import { getPublicProductVariantOptions } from "../../../../lib/public-product-variants";

function requestedId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized || normalized.length > 128) return undefined;
  return normalized;
}

export async function GET(request: Request) {
  const id = requestedId(new URL(request.url).searchParams.get("id"));
  if (!id) {
    return Response.json({ error: "invalid_variant" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const options = await getPublicProductVariantOptions(id);
    return Response.json(
      { options },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (error) {
    console.error(JSON.stringify({
      level: "warn",
      event: "sport_fit.product_options_failed",
      canonicalVariantId: id,
      message: error instanceof Error ? error.message : String(error)
    }));
    return Response.json(
      { error: "sport_fit_product_options_unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } }
    );
  }
}
