import { getStorefrontSearchSuggestions } from "../../../../lib/storefront-search-suggestions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = (url.searchParams.get("q")?.trim() || "").slice(0, 120);
  if (!query) return Response.json({ items: [], suggestions: [], hasResults: null, provider: "postgres" });

  try {
    const result = await getStorefrontSearchSuggestions(query, 12);
    return Response.json(
      {
        items: result.items,
        suggestions: result.items.filter((item) => item.kind === "query" || item.kind === "product").map((item) => item.label).slice(0, 8),
        hasResults: result.hasResults,
        provider: "postgres"
      },
      { headers: { "Cache-Control": "private, max-age=10" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Search unavailable" },
      { status: 503 }
    );
  }
}