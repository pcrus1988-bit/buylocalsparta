import { requireDailySession } from "../../../../lib/daily-session";
import { quickAddLookup, saveCanonicalToVendorShop } from "../../../../lib/quickadd-service";

export async function GET(request: Request) {
  try {
    const principal = await requireDailySession(request, false);
    const url = new URL(request.url);
    return Response.json(await quickAddLookup(principal, {
      gtin: url.searchParams.get("gtin") ?? undefined,
      q: url.searchParams.get("q") ?? undefined,
      limit: 6
    }));
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
      vendorSku: typeof body.vendorSku === "string" ? body.vendorSku : undefined,
      customerPriceMinor: Number(body.customerPriceMinor),
      onHand: Number(body.onHand),
      safetyStock: Number(body.safetyStock ?? 0),
      visible: body.visible !== false,
      adviceAvailable: body.adviceAvailable !== false
    });
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "quickadd_save_failed" }, { status: 400 });
  }
}
