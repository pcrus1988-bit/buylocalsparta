import { normalizeSearchText } from "@buy-local-sparta/core";
import { loadCatalogMetadata } from "../../../../lib/catalog-metadata";
import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fallbackHasResults(query: string): Promise<boolean> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return false;

  const commerce = getProductionPostgresRuntime().customerCommerce;
  const canonicals = await commerce.publicCanonicals();
  const metadata = await loadCatalogMetadata(canonicals.map((product) => product.id));

  return canonicals.some((product) => {
    const details = metadata.get(product.id);
    return [product.title, details?.description, details?.brand, details?.color, details?.mpn, details?.categoryLabel]
      .some((value) => normalizeSearchText(value ?? "").includes(normalizedQuery));
  });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q")?.trim() || "").slice(0, 120);
  if (!query) return Response.json({ suggestions: [], hasResults: null });

  try {
    const production = getProductionPostgresRuntime();
    if (process.env.BLS_SEARCH_ENABLED !== "true") {
      return Response.json(
        { suggestions: [], hasResults: await fallbackHasResults(query) },
        { headers: { "Cache-Control": "private, max-age=10" } }
      );
    }

    const search = production.search;
    if (!search) throw new Error("Search runtime unavailable");
    const [suggestions, hits] = await Promise.all([
      search.autocomplete({ marketId: "sparta", q: query, limit: 8 }),
      search.search({ marketId: "sparta", q: query, type: "product", limit: 1 })
    ]);

    return Response.json(
      { suggestions, hasResults: hits.length > 0 },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search unavailable" },
      { status: 503 }
    );
  }
}
