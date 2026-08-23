import { requireVendorSession } from "../../../../lib/vendor-session";
import { vendorReviewsWorkspace } from "../../../../lib/vendor-reviews-runtime";

export async function GET() {
  try {
    const principal = await requireVendorSession();
    const reviews = await vendorReviewsWorkspace(principal);
    return Response.json({ reviews, csrfToken: principal.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_reviews_failed";
    const status = message === "VENDOR_AUTH_REQUIRED" ? 401 : message === "VENDOR_REVIEWS_FORBIDDEN" ? 403 : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
