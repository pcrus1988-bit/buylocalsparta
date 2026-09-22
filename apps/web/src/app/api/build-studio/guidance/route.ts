import { buildCustomerGuide, calculateBuildQuantity, resolveBuildProjectGuidance } from "../../../../lib/build-guidance-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type GuidanceRequest = Readonly<{
  scenarioKey?: unknown;
  facts?: unknown;
  manufacturerProductId?: unknown;
  areaM2?: unknown;
  guidanceConflict?: unknown;
}>;

function requestInput(body: GuidanceRequest) {
  if (typeof body.scenarioKey !== "string") throw new Error("scenarioKey is required");
  if (body.facts !== undefined && (!body.facts || Array.isArray(body.facts) || typeof body.facts !== "object")) {
    throw new Error("facts must be an object");
  }
  if (body.manufacturerProductId !== undefined && body.manufacturerProductId !== null && typeof body.manufacturerProductId !== "string") {
    throw new Error("manufacturerProductId must be a UUID string or null");
  }
  return {
    scenarioKey: body.scenarioKey,
    facts: body.facts as Readonly<Record<string, unknown>> | undefined,
    manufacturerProductId: body.manufacturerProductId as string | null | undefined,
    areaM2: body.areaM2 == null ? undefined : Number(body.areaM2),
    guidanceConflict: body.guidanceConflict === true
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as GuidanceRequest;
    const input = requestInput(body);
    if (input.areaM2 !== undefined && (!Number.isFinite(input.areaM2) || input.areaM2 <= 0 || input.areaM2 > 100000)) {
      throw new Error("areaM2 is invalid");
    }
    const guidance = await resolveBuildProjectGuidance(input);
    const quantityEstimate = input.areaM2 !== undefined
      ? calculateBuildQuantity(guidance, input.areaM2)
      : undefined;

    const status = guidance.status === "scenario_not_found" ? 404 : 200;
    return Response.json(
      { guidance, customerGuide: buildCustomerGuide(guidance), quantityEstimate },
      {
        status,
        headers: {
          "Cache-Control": "private, no-store, max-age=0",
          "X-Content-Type-Options": "nosniff"
        }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidation = /required|invalid|must be|too large/i.test(message);
    if (!isValidation) {
      console.error(JSON.stringify({
        level: "error",
        event: "build_studio.guidance_failed",
        message
      }));
    }
    return Response.json(
      {
        error: isValidation ? "invalid_guidance_request" : "guidance_unavailable",
        message: isValidation ? message : "Η τεχνική καθοδήγηση δεν είναι προσωρινά διαθέσιμη."
      },
      {
        status: isValidation ? 400 : 503,
        headers: { "Cache-Control": "private, no-store, max-age=0" }
      }
    );
  }
}
