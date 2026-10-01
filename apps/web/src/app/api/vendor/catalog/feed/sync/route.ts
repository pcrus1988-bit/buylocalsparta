import { isDropshippingOnlyVendor } from "../../../../../../lib/vendor-dropshipping-access";
import { syncVendorProductFeed } from "../../../../../../lib/vendor-product-feed-service";
import { requireVendorCapability } from "../../../../../../lib/vendor-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const { principal } = await requireVendorCapability("catalogue.import", request, true);
    if (await isDropshippingOnlyVendor(principal.vendorId)) throw new Error("Η εισαγωγή XML είναι απενεργοποιημένη για dropshipping-only vendor.");
    const body = await request.json() as { feedId?: unknown };
    if (typeof body.feedId !== "string" || !body.feedId.trim()) throw new Error("Λείπει το XML feed.");
    return Response.json(await syncVendorProductFeed(principal, body.feedId.trim(), "manual"));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_feed_sync_failed" }, { status: 400 });
  }
}
