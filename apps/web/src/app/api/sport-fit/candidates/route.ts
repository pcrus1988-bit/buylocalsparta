import { buildSportFitRecommendation, parseSportFitAnswers, sportProductRole } from "../../../../lib/sport-fit-engine";
import { getSportFitCatalog } from "../../../../lib/sport-fit-catalog";
import { availableStoredSportSizeGuideBrands, resolveStoredSportSize } from "../../../../lib/sport-fit-size-guide-server";
import { productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { sportSizeGuideBrandKey } from "../../../../lib/sport-fit-brand";
import { SPORT_FIT_RULESET_VERSION } from "../../../../lib/sport-fit-rules";

const DEFAULT_KERASIOTIS_VENDOR_ID = "vendor_4d7b281c8b2541f685f1";

function safeVendorId(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_KERASIOTIS_VENDOR_ID;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(candidate)) throw new Error("INVALID_VENDOR");
  return candidate;
}

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json(
      { vendorId: DEFAULT_KERASIOTIS_VENDOR_ID, vendorName: "", candidateCount: 0, recommendation: { rulesetVersion: SPORT_FIT_RULESET_VERSION, alternatives: [], kit: [], ranked: [] } },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const vendorId = safeVendorId(body.vendorId);
    const answers = parseSportFitAnswers(body.answers);
    const catalog = await getSportFitCatalog(vendorId, answers.audience);

    const resolvedSizeGuides = answers.footLengthMm
      ? await (async () => {
          const activeGuideBrands = await availableStoredSportSizeGuideBrands("footwear");
          const guideBrandByKey = new Map(activeGuideBrands.map((brand) => [sportSizeGuideBrandKey(brand), brand] as const));
          const catalogBrandByKey = new Map<string,string>();

          for (const product of catalog.products) {
            if (sportProductRole(product) !== "footwear" || !product.brand) continue;
            const key = sportSizeGuideBrandKey(product.brand);
            if (key && guideBrandByKey.has(key) && !catalogBrandByKey.has(key)) {
              catalogBrandByKey.set(key, guideBrandByKey.get(key)!);
            }
          }

          return Promise.all([...catalogBrandByKey.entries()].map(async ([key, brand]) => ({
            brandKey: key,
            guide: await resolveStoredSportSize({
              brand,
              productRole: "footwear",
              locale: "el",
              measurementMm: answers.footLengthMm!,
              sizeSystem: "EU",
              audience: answers.audience
            })
          })));
        })()
      : [];

    const brandSizeHints = Object.fromEntries(
      resolvedSizeGuides.flatMap(({ brandKey: key, guide }) =>
        guide && !guide.outOfRange && guide.sizeLabels.length ? [[key, guide.sizeLabels] as const] : []
      )
    );

    const resolvedAnswers = Object.keys(brandSizeHints).length
      ? { ...answers, brandSizeHints }
      : answers;
    const recommendation = buildSportFitRecommendation(catalog.products, resolvedAnswers);
    const primaryBrandKey = sportSizeGuideBrandKey(recommendation.primary?.brand);
    const primarySizeGuide = resolvedSizeGuides.find(({ brandKey: key }) => key === primaryBrandKey)?.guide;

    return Response.json(
      {
        vendorId: catalog.vendorId,
        vendorName: catalog.vendorName,
        candidateCount: catalog.products.length,
        sizeGuide: primarySizeGuide,
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
