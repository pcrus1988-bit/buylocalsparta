import {
  consumePublicGemiLookupLimit,
  normalizeGreekAfm,
  resolveGemiCompanyByAfm
} from "../../../../lib/gemi-runtime";
import { resolveExpansionHubForGemiCompany } from "../../../../lib/hub-location-resolution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const visitorKey = request.headers.get("x-bls-visitor")?.trim();
  if (!visitorKey || !/^[A-Za-z0-9_-]{16,128}$/.test(visitorKey)) {
    return Response.json({ code: "visitor_required", error: "Trusted visitor identity is required" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const body = await request.json() as Record<string, unknown>;
    const taxNumber = normalizeGreekAfm(typeof body.afm === "string" ? body.afm : "");
    const now = Date.now();
    const limit = await consumePublicGemiLookupLimit(visitorKey, now);
    if (!limit.allowed) {
      return Response.json(
        { code: "rate_limited", error: "Έγιναν πολλές αναζητήσεις Γ.Ε.ΜΗ. από αυτή τη συσκευή. Δοκιμάστε ξανά σε λίγο.", retryAfterMs: limit.retryAfterMs },
        { status: 429, headers: { "retry-after": String(Math.ceil(limit.retryAfterMs / 1000)), "Cache-Control": "no-store" } }
      );
    }

    const result = await resolveGemiCompanyByAfm(taxNumber, now);
    if (result.lookupStatus === "not_found") {
      return Response.json(
        { code: "company_not_found", error: "Δεν βρέθηκε επιχείρηση στο Γ.Ε.ΜΗ. με αυτό το ΑΦΜ." },
        { status: 404, headers: { "Cache-Control": "no-store" } }
      );
    }
    if (result.lookupStatus === "unavailable") {
      return Response.json(
        { code: "gemi_unavailable", error: result.message },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    const company = publicCompany(result);
    const resolution = await resolveExpansionHubForGemiCompany(result);
    if (resolution.status === "unresolved") {
      return Response.json(
        {
          code: "hub_unresolved",
          error: resolution.message,
          company,
          resolution: {
            status: resolution.status,
            reason: resolution.reason,
            sourcePostcode: resolution.sourcePostcode
          }
        },
        { status: 422, headers: { "Cache-Control": "no-store" } }
      );
    }

    return Response.json({
      status: "matched",
      company,
      hub: {
        id: resolution.hub.id,
        slug: resolution.hub.slug,
        nameEl: resolution.hub.nameEl,
        regionEl: resolution.hub.regionEl,
        isLive: resolution.hub.isLive,
        isSpartaLegacy: resolution.hub.isSpartaLegacy
      },
      resolution: {
        status: resolution.status,
        method: resolution.method,
        sourcePostcode: resolution.sourcePostcode,
        distanceKm: resolution.distanceKm
      },
      redirectTo: resolution.hub.isSpartaLegacy ? "/join/apply" : undefined
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Μη έγκυρο ΑΦΜ.";
    if (message.startsWith("Το ΑΦΜ")) {
      return Response.json({ code: "invalid_afm", error: message }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error(JSON.stringify({
      level: "error",
      event: "hub.company_resolution_failed",
      message,
      errorName: error instanceof Error ? error.name : "UnknownError"
    }));
    return Response.json(
      { code: "hub_resolution_failed", error: "Δεν ήταν δυνατή η επαλήθευση της επιχείρησης και του HUB αυτή τη στιγμή." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function publicCompany(result: Extract<Awaited<ReturnType<typeof resolveGemiCompanyByAfm>>, { lookupStatus: "matched" }>) {
  return {
    afm: result.taxNumber,
    gemiNumber: result.gemiNumber,
    legalName: result.legalName,
    tradingName: result.tradingName,
    companyStatus: result.companyStatus,
    legalType: result.legalType,
    address: result.addressLine1,
    city: result.city,
    municipality: result.municipality,
    prefecture: result.prefecture,
    postcode: result.postcode,
    email: result.email,
    phone: result.phone,
    url: result.url,
    checkedAt: result.checkedAt
  };
}
