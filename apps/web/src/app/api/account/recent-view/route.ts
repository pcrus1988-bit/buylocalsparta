import { requireAccountSession } from "../../../../lib/account-session";
import { recordCustomerView } from "../../../../lib/customer-state-runtime";
import { getCanonicalProductSummary } from "../../../../lib/catalog-view";
import { customerBrowserRecentlyViewed } from "../../../../lib/customer-account-browser-view";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { canonicalVariantId?: unknown };
    const canonicalVariantId = typeof body.canonicalVariantId === "string" ? body.canonicalVariantId : "";
    if (!(await getCanonicalProductSummary(canonicalVariantId))) return Response.json({ error: "Product not found" }, { status: 404 });
    const viewed = await recordCustomerView({ userId: principal.userId, canonicalVariantId, now: Date.now() });
    return Response.json({ viewed: viewed ? customerBrowserRecentlyViewed(viewed) : undefined });
  } catch (error) {
    const message = error instanceof Error ? error.message : "recent_view_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
