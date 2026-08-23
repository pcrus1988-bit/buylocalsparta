import { requireVendorSession } from "../../../../../lib/vendor-session";
import { respondToVendorReview } from "../../../../../lib/vendor-reviews-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    await respondToVendorReview(principal, {
      reviewId: typeof body.reviewId === "string" ? body.reviewId : "",
      body: typeof body.body === "string" ? body.body : ""
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_review_response_failed";
    const status = message === "VENDOR_AUTH_REQUIRED" ? 401 : message === "VENDOR_REVIEWS_FORBIDDEN" ? 403 : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
