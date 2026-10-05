import { requireAccountSession } from "../../../../lib/account-session";
import { generateCustomerTryOn } from "../../../../lib/try-on-runtime";
import { consumeCustomerTryOnRateLimit } from "../../../../lib/customer-state-runtime";

export const maxDuration = 60;

function statusFor(message: string): number {
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "TRY_ON_NOT_CONFIGURED") return 503;
  if (message === "TRY_ON_TIMEOUT") return 504;
  if (message === "TRY_ON_PRODUCT_NOT_FOUND") return 404;
  if (message === "TRY_ON_PRODUCT_UNSUPPORTED" || message === "TRY_ON_PRODUCT_IMAGE_REQUIRED") return 422;
  if (message === "TRY_ON_IMAGE_TOO_LARGE" || message === "INVALID_TRY_ON_IMAGE") return 400;
  return 502;
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const rateLimit = await consumeCustomerTryOnRateLimit({ userId: principal.userId, now: Date.now() });
    if (!rateLimit.allowed) {
      const retryAfterSeconds = Math.max(1, Math.ceil(rateLimit.retryAfterMs / 1000));
      return Response.json({
        error: "TRY_ON_RATE_LIMITED",
        retryAfterMs: rateLimit.retryAfterMs
      }, {
        status: 429,
        headers: {
          "Cache-Control": "no-store, private",
          "Retry-After": String(retryAfterSeconds)
        }
      });
    }
    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) return Response.json({ error: "TRY_ON_PRODUCT_REQUIRED" }, { status: 400 });
    const result = await generateCustomerTryOn({
      userPublicId: principal.userId,
      productId,
      modelImageDataUrl: body.modelImageDataUrl
    });
    return Response.json({ result }, { headers: { "Cache-Control": "no-store, private" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_FAILED";
    return Response.json({ error: message }, {
      status: statusFor(message),
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
