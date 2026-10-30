import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../../lib/research-public-results-data";
import { pressKitHighlights, PRESS_KIT_RESULTS } from "../../../../../lib/research-press-kit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function field(value: string | number): string {
  return '"' + String(value).replaceAll('"', '""') + '"';
}

export async function GET() {
  try {
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if (!published) return new Response("Not published", { status: 404, headers: { "Cache-Control": "no-store" } });
    const figures = pressKitHighlights(publicResultPoints(published.estimates));
    if (!figures.length) return new Response("No public figures", { status: 404, headers: { "Cache-Control": "no-store" } });
    const rows = [
      ["Δείκτης", "Ποσοστό", "Βάση n", "Ερώτηση", "Επεξήγηση", "Πηγή", "Έκδοση δημοσίευσης"],
      ...figures.map(item => [
        item.title, item.formatted, String(item.n), item.question, item.insight,
        "https://kontamou.site" + PRESS_KIT_RESULTS, published.releaseVersion
      ])
    ];
    const output = "\uFEFF" + rows.map(row => row.map(field).join(",")).join("\r\n") + "\r\n";
    return new Response(output, { headers: {
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
