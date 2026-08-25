import { requireDailySession } from "../../../../lib/daily-session";
import { quickAddLookup, saveCanonicalToVendorShop } from "../../../../lib/quickadd-service";
import { recordQuickAddDemandSignal } from "../../../../lib/quickadd-demand-signal";
import { setVendorProductDeliveryEligibility } from "../../../../lib/vendor-delivery-eligibility-service";

function quickAddDeliveryOverride(request: Request): boolean | undefined {
  const cookie = request.headers.get("cookie") ?? "";
  const value = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("bls_quickadd_delivery="))?.split("=")[1];
  if (value === "delivery") return true;
  if (value === "pickup") return false;
  return undefined;
}

export async function GET(request: Request) {
  try {
    const principal = await requireDailySession(request, false);
    const url = new URL(request.url);
    const gtin = url.searchParams.get("gtin") ?? undefined;
    const q = url.searchParams.get("q") ?? undefined;
    const result = await quickAddLookup(principal, { gtin, q, limit: 6 });
    const matches = result.matches.map((match) => ({
      ...match,
      imageUrl: match.imageUrl?.startsWith("https://")
        ? `/api/daily/quickadd/image/${encodeURIComponent(match.canonicalVariantId)}`
        : match.imageUrl
    }));
    const best = matches[0];
    await recordQuickAddDemandSignal(principal, {
      source: "daily",
      gtin,
      q,
      matched: Boolean(best),
      canonicalVariantId: best?.canonicalVariantId,
      categoryCode: best?.categoryCode
    });
    return Response.json({ ...result, matches });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "quickadd_lookup_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireDailySession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const result = await saveCanonicalToVendorShop(principal, {
      canonicalVariantId: typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : "",
      gtin: typeof body.gtin === "string" ? body.gtin : undefined,
      vendorSku: typeof body.vendorSku === "string" ? body.vendorSku : undefined,
      customerPriceMinor: Number(body.customerPriceMinor),
      onHand: Number(body.onHand),
      safetyStock: Number(body.safetyStock ?? 0),
      visible: body.visible !== false,
      adviceAvailable: body.adviceAvailable !== false
    });
    const deliveryEligible = quickAddDeliveryOverride(request);
    if (deliveryEligible !== undefined) {
      await setVendorProductDeliveryEligibility(principal, { offerId: result.offerId, deliveryEligible, source: "quickadd" });
    }
    return Response.json({ ...result, deliveryEligible });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "quickadd_save_failed" }, { status: 400 });
  }
}
