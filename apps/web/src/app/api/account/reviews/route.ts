import { requireAccountSession } from "../../../../lib/account-session";
import { createCustomerReview, customerReviewWorkspace, type CustomerReviewSourceKind } from "../../../../lib/customer-reviews-runtime";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const workspace = await customerReviewWorkspace(principal);
    return Response.json({ ...workspace, csrfToken: principal.csrfToken }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "reviews_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const review = await createCustomerReview(principal, {
      sourceKind: typeof body.sourceKind === "string" ? body.sourceKind as CustomerReviewSourceKind : "order_line",
      sourceId: typeof body.sourceId === "string" ? body.sourceId : "",
      rating: typeof body.rating === "number" ? body.rating : Number(body.rating),
      body: typeof body.body === "string" ? body.body : undefined
    });
    return Response.json({ review }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "reviews_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
