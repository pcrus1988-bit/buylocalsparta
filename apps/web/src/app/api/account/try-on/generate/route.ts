import { requireAccountSession } from "../../../../../lib/account-session";
import { generateCustomerTryOnPreview } from "../../../../../lib/try-on-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) throw new Error("TRYON_PRODUCT_REQUIRED");
    const result = await generateCustomerTryOnPreview(principal.userId, productId);
    return Response.json(result, {
      status: result.status === "processing" ? 202 : 200,
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRYON_GENERATION_FAILED";
    const status = message === "AUTH_REQUIRED" ? 401
      : message === "TRYON_PROFILE_REQUIRED" ? 409
      : message === "TRYON_PRODUCT_NOT_FOUND" ? 404
      : message === "TRYON_PRODUCT_UNSUPPORTED" ? 422
      : message === "TRYON_RATE_LIMIT" ? 429
      : message === "TRYON_SERVICE_UNAVAILABLE" ? 503
      : 400;
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}
