import { getProductionPostgresRuntime } from "../../../../lib/postgres-runtime";
import { postgresStorefrontSearchSignal } from "../../../../lib/postgres-storefront-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q")?.trim() || "").slice(0, 120);
  if (!query) return Response.json({ suggestions: [], hasResults: null, provider: "postgres" });

  try {
    const production = getProductionPostgresRuntime();
    if (process.env.BLS_SEARCH_ENABLED === "true" && production.search) {
      try {
        const [suggestions, hits] = await Promise.all([
          production.search.autocomplete({ marketId: "sparta", q: query, limit: 8 }),
          production.search.search({ marketId: "sparta", q: query, type: "product", limit: 1 })
        ]);
        return Response.json(
          { suggestions, hasResults: hits.length > 0, provider: "meilisearch" },
          { headers: { "Cache-Control": "private, max-age=10" } }
        );
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "storefront.search_accelerator_degraded",
          message: error instanceof Error ? error.message : String(error)
        }));
      }
    }

    const fallback = await postgresStorefrontSearchSignal(query, 8);
    return Response.json(
      { suggestions: fallback.suggestions, hasResults: fallback.hasResults, provider: fallback.provider },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search unavailable" },
      { status: 503 }
    );
  }
}
