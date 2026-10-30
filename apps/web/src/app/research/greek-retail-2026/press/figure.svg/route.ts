import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../../lib/research-public-results-data";
import { pressKitHighlights } from "../../../../../lib/research-press-kit";
import { pressKitFigureSvg } from "../../../../../lib/research-press-kit-graphic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const metric = new URL(request.url).searchParams.get("metric") ?? "";
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if (!published) return new Response("Not published", { status: 404, headers: { "Cache-Control": "no-store" } });
    const item = pressKitHighlights(publicResultPoints(published.estimates)).find(row => row.key === metric);
    if (!item) return new Response("Graphic unavailable", { status: 404, headers: { "Cache-Control": "no-store" } });
    return new Response(pressKitFigureSvg(item), { headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Content-Disposition": 'attachment; filename="KONTA-MOY-Research-2026-figure.svg"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) {
    console.error("research_press_kit_svg_unavailable", error instanceof Error ? error.name : "UnknownError");
    return new Response("Unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
