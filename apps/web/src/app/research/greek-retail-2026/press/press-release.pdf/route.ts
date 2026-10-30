import { getPublishedGreekRetailResults } from "../../../../../lib/research-survey-release";
import { publicResultPoints } from "../../../../../lib/research-public-results-data";
import { pressKitHighlights } from "../../../../../lib/research-press-kit";
import { renderResearchPressReleasePdf } from "../../../../../lib/research-press-kit-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const published = await getPublishedGreekRetailResults("greek-retail-2026");
    if (!published) return new Response("Publication not available", { status: 404, headers: { "Cache-Control": "no-store" } });
    const figures = pressKitHighlights(publicResultPoints(published.estimates));
    if (!figures.length) return new Response("No approved public figures available", { status: 404, headers: { "Cache-Control": "no-store" } });
    const pdf = await renderResearchPressReleasePdf(figures, published.publishedAt);
    return new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="KONTA-MOY-Greek-Retail-2026-Press-Release.pdf"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    } });
  } catch (error) {
    console.error("research_press_kit_pdf_unavailable", error instanceof Error ? error.name : "UnknownError");
    return new Response("Press kit temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
