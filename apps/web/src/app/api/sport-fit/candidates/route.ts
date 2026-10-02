import { buildSportFitRecommendation, parseSportFitAnswers } from "../../../../lib/sport-fit-engine";
import { getSportFitCatalog } from "../../../../lib/sport-fit-catalog";
import { productionDatabaseConfigured } from "../../../../lib/postgres-runtime";

const DEFAULT_KERASIOTIS_VENDOR_ID = "vendor_4d7b281c8b2541f685f1";

function safeVendorId(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_KERASIOTIS_VENDOR_ID;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(candidate)) throw new Error("INVALID_VENDOR");
  return candidate;
}

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json(
      { vendorId: DEFAULT_KERASIOTIS_VENDOR_ID, vendorName: "", candidateCount: 0, recommendation: { alternatives: [], kit: [], ranked: [] } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const vendorId = safeVendorId(body.vendorId);
    const answers = parseSportFitAnswers(body.answers);
    const catalog = await getSportFitCatalog(vendorId, answers.audience);
    const recommendation = buildSportFitRecommendation(catalog.products, answers);

    return Response.json(
      {
        vendorId: catalog.vendorId,
        vendorName: catalog.vendorName,
        candidateCount: catalog.products.length,
        recommendation
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      event: "sport_fit.candidates_failed",
      message
    }));

    return Response.json(
      { error: message === "INVALID_VENDOR" ? "sport_fit_invalid_vendor" : "sport_fit_candidates_unavailable" },
      { status: message === "INVALID_VENDOR" ? 400 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
