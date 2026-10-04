import {
  buildSportFitRecommendation,
  parseSportFitAnswers,
  scoreSportFitProduct,
  sportFitCandidateSupportsRequestedActivity,
  sportFitFamilyKey,
  sportProductRole,
  sportProductTier,
  type SportAudience,
  type SportFitMatchProof,
  type SportFitProduct,
  type SportFitScoredProduct
} from "../../../../lib/sport-fit-engine";
import { getSportFitCatalog } from "../../../../lib/sport-fit-catalog";
import { availableStoredSportSizeGuideBrands, resolveStoredSportSize } from "../../../../lib/sport-fit-size-guide-server";
import { productionDatabaseConfigured } from "../../../../lib/postgres-runtime";
import { sportSizeGuideBrandKey } from "../../../../lib/sport-fit-brand";

const DEFAULT_KERASIOTIS_VENDOR_ID = "vendor_4d7b281c8b2541f685f1";
const UNIVERSE_AUDIENCES: readonly SportAudience[] = ["men", "women", "kids"];
const UNIVERSE_LIMIT = 96;

type UniverseProductPreview = Readonly<{
  id: string;
  familyId?: string;
  slug: string;
  title: string;
  brand?: string;
  categoryLabel?: string;
  previewImageSrc?: string;
  priceMinor: number;
  score?: number;
  technicalScore?: number;
  technicalCoverage?: number;
  matchedSize?: string;
  role?: string;
  reasons?: readonly string[];
  matchProofs?: readonly SportFitMatchProof[];
}>;

function safeVendorId(value: unknown): string {
  const candidate = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_KERASIOTIS_VENDOR_ID;
  if (!/^[A-Za-z0-9_-]{3,128}$/.test(candidate)) throw new Error("INVALID_VENDOR");
  return candidate;
}

function universePreview(product: SportFitProduct | SportFitScoredProduct): UniverseProductPreview {
  const scored = "score" in product ? product as SportFitScoredProduct : undefined;
  return {
    id: product.id,
    familyId: product.familyId,
    slug: product.slug,
    title: product.title,
    brand: product.brand,
    categoryLabel: product.categoryLabel,
    previewImageSrc: product.previewImageSrc,
    priceMinor: product.priceMinor,
    score: scored?.score,
    technicalScore: scored?.technicalScore,
    technicalCoverage: scored?.technicalCoverage,
    matchedSize: scored?.matchedSize,
    role: scored?.role,
    reasons: scored?.reasons,
    matchProofs: scored?.matchProofs
  };
}

function uniqueFamilies<T extends SportFitProduct>(products: readonly T[]): readonly T[] {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const product of products) {
    const key = sportFitFamilyKey(product);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(product);
  }
  return output;
}

function usableForRecommendation(product: SportFitProduct): boolean {
  return product.available
    && product.availableToSell > 0
    && product.priceMinor > 0
    && product.knowledge?.queueStatus !== "blocked"
    && product.knowledge?.status !== "conflict"
    && product.knowledge?.status !== "insufficient";
}

export async function GET(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json(
      {
        vendorId: DEFAULT_KERASIOTIS_VENDOR_ID,
        vendorName: "",
        candidateCount: 0,
        survivingCount: 0,
        secondaryCount: 0,
        universe: []
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  try {
    const vendorId = safeVendorId(new URL(request.url).searchParams.get("vendorId"));
    const snapshots = await Promise.all(
      UNIVERSE_AUDIENCES.map((audience) => getSportFitCatalog(vendorId, audience))
    );
    const byId = new Map<string, SportFitProduct>();
    for (const snapshot of snapshots) {
      for (const product of snapshot.products) {
        if (!byId.has(product.id)) byId.set(product.id, product);
      }
    }

    const allProducts = [...byId.values()].filter(usableForRecommendation);
    const families = uniqueFamilies(allProducts);
    const withImagesFirst = [...families].sort((left, right) =>
      Number(Boolean(right.previewImageSrc)) - Number(Boolean(left.previewImageSrc))
      || right.availableToSell - left.availableToSell
      || left.title.localeCompare(right.title, "el")
    );

    return Response.json(
      {
        vendorId,
        vendorName: snapshots.find((snapshot) => snapshot.vendorName)?.vendorName ?? "",
        candidateCount: families.length,
        survivingCount: families.length,
        secondaryCount: 0,
        universe: withImagesFirst.slice(0, UNIVERSE_LIMIT).map(universePreview)
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({
      level: "error",
      event: "sport_fit.universe_failed",
      message
    }));

    return Response.json(
      { error: message === "INVALID_VENDOR" ? "sport_fit_invalid_vendor" : "sport_fit_universe_unavailable" },
      { status: message === "INVALID_VENDOR" ? 400 : 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: Request) {
  if (!productionDatabaseConfigured()) {
    return Response.json(
      {
        vendorId: DEFAULT_KERASIOTIS_VENDOR_ID,
        vendorName: "",
        candidateCount: 0,
        survivingCount: 0,
        secondaryCount: 0,
        universe: [],
        recommendation: { finalistEvidenceMode: "heuristic_fallback", alternatives: [], kit: [], ranked: [] }
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const vendorId = safeVendorId(body.vendorId);
    const rawAnswers = body.answers && typeof body.answers === "object" && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : {};
    const previewAllAudiences = rawAnswers.audience === "all";
    const answers = parseSportFitAnswers(previewAllAudiences ? { ...rawAnswers, audience: "men" } : rawAnswers);
    const snapshots = previewAllAudiences
      ? await Promise.all(UNIVERSE_AUDIENCES.map((audience) => getSportFitCatalog(vendorId, audience)))
      : [await getSportFitCatalog(vendorId, answers.audience)];
    const mergedProducts = new Map<string, SportFitProduct>();
    for (const snapshot of snapshots) {
      for (const product of snapshot.products) {
        if (!mergedProducts.has(product.id)) mergedProducts.set(product.id, product);
      }
    }
    const catalog = {
      vendorId,
      vendorName: snapshots.find((snapshot) => snapshot.vendorName)?.vendorName ?? "",
      products: [...mergedProducts.values()]
    };

    const resolvedSizeGuides = answers.footLengthMm && !previewAllAudiences
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

    const scoredFamilies = uniqueFamilies(
      catalog.products
        .filter(usableForRecommendation)
        .filter((product) => sportFitCandidateSupportsRequestedActivity(product, resolvedAnswers))
        .map((product) => scoreSportFitProduct(product, resolvedAnswers))
        .sort((left, right) =>
          right.technicalScore - left.technicalScore
          || right.technicalCoverage - left.technicalCoverage
          || right.score - left.score
          || left.priceMinor - right.priceMinor
          || left.title.localeCompare(right.title, "el")
        )
    );
    const technicallyEligible = scoredFamilies.filter((product) => product.technicalEligible && product.score >= 20);
    const survivors = technicallyEligible.filter((product) => sportProductTier(product.role) === "primary");
    const secondarySurvivors = technicallyEligible.filter((product) => sportProductTier(product.role) === "secondary");

    return Response.json(
      {
        vendorId: catalog.vendorId,
        vendorName: catalog.vendorName,
        candidateCount: uniqueFamilies(catalog.products.filter(usableForRecommendation)).length,
        survivingCount: survivors.length,
        secondaryCount: secondarySurvivors.length,
        universe: survivors.slice(0, UNIVERSE_LIMIT).map(universePreview),
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
