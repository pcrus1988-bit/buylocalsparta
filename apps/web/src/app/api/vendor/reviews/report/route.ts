import { requireVendorSession } from "../../../../../lib/vendor-session";
import { reportVendorReview, type VendorReviewReportReason } from "../../../../../lib/vendor-reviews-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireVendorSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    await reportVendorReview(principal, {
      reviewId: typeof body.reviewId === "string" ? body.reviewId : "",
      reason: typeof body.reason === "string" ? body.reason as VendorReviewReportReason : "other",
      details: typeof body.details === "string" ? body.details : ""
    });
    return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "vendor_review_report_failed";
    const status = message === "VENDOR_AUTH_REQUIRED" ? 401 : message === "VENDOR_REVIEWS_FORBIDDEN" ? 403 : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
