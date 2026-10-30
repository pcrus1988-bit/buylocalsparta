import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../../lib/research-public-results-data";
import { pressKitHighlights, pressKitFactsCsv } from "../../../../../lib/research-press-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if (!published) return new Response("Not published", { status: 404, headers: { "Cache-Control": "no-store" } });
    const figures = pressKitHighlights(publicResultPoints(published.estimates));
    if (!figures.length) return new Response("No public figures", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(pressKitFactsCsv(figures, published.releaseVersion), { headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="KONTA-MOY-Greek-Retail-2026-Facts.csv"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) {
    console.error("research_press_kit_csv_unavailable", error instanceof Error ? error.name : "UnknownError");
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
