import { requireDailySession } from "../../../../../lib/daily-session";
import { vendorCreatePurchasableAskLocalOffer } from "../../../../../lib/ask-local-lifecycle-service";
import { vendorAdviceWorkspace } from "../../../../../lib/vendor-backoffice-service";

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const requestId = typeof body.requestId === "string" ? body.requestId.trim() : "";
    const priceMinor = Number(body.priceMinor);
    const fulfilmentPromise = typeof body.fulfilmentPromise === "string" ? body.fulfilmentPromise : "";
    const expiresAt = Number(body.expiresAt);
    const canonicalVariantId = typeof body.canonicalVariantId === "string" ? body.canonicalVariantId.trim() : undefined;
    if (!requestId) throw new Error("Ask Local request is required.");
    await vendorCreatePurchasableAskLocalOffer(principal, { requestId, priceMinor, fulfilmentPromise, expiresAt, canonicalVariantId });
    return Response.json(await vendorAdviceWorkspace(principal), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "ask_local_offer_failed" }, { status: 400 });
  }
}
