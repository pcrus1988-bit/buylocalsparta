import { requireAccountSession } from "../../../../lib/account-session";
import { customerTryOnGenerationConfigured } from "../../../../lib/try-on-config";
import { generateCustomerTryOn } from "../../../../lib/try-on-runtime";
import { releaseCustomerTryOnMonthlyGeneration, reserveCustomerTryOnGeneration } from "../../../../lib/customer-state-runtime";
import type { CustomerTryOnMonthlyQuota } from "../../../../lib/try-on-quota";

export const maxDuration = 60;

type GenerationGuard = Readonly<{
  allowed: boolean;
  reason?: "burst" | "monthly";
  retryAfterMs: number;
  quota: CustomerTryOnMonthlyQuota;
}>;

function statusFor(message: string): number {
  if (message === "AUTH_REQUIRED") return 401;
  if (message === "TRY_ON_NOT_CONFIGURED") return 503;
  if (message === "TRY_ON_TIMEOUT") return 504;
  if (message === "TRY_ON_PRODUCT_NOT_FOUND" || message === "TRY_ON_ACCOUNT_NOT_FOUND") return 404;
  if (message === "TRY_ON_RATE_LIMITED" || message === "TRY_ON_MONTHLY_LIMIT_REACHED") return 429;
  if (message === "TRY_ON_PRODUCT_IMAGE_LOAD_FAILED") return 503;
  if (
    message === "TRY_ON_PRODUCT_UNSUPPORTED"
    || message === "TRY_ON_PRODUCT_IMAGE_REQUIRED"
    || message === "TRY_ON_MODEL_IMAGE_LOAD_FAILED"
    || message === "TRY_ON_POSE_REQUIRED"
    || message === "TRY_ON_CONTENT_BLOCKED"
    || message === "TRY_ON_INPUT_INVALID"
  ) return 422;
  if (message === "TRY_ON_IMAGE_TOO_LARGE" || message === "INVALID_TRY_ON_IMAGE") return 400;
  if (message === "TRY_ON_PROVIDER_BUSY" || message === "TRY_ON_CREDITS_UNAVAILABLE") return 503;
  return 502;
}

export async function POST(request: Request) {
  let guard: GenerationGuard | undefined;
  try {
    const principal = await requireAccountSession(request, true);
    if (!customerTryOnGenerationConfigured()) {
      return Response.json({ error: "TRY_ON_NOT_CONFIGURED" }, {
        status: 503,
        headers: { "Cache-Control": "no-store, private" }
      });
    }

    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) return Response.json({ error: "TRY_ON_PRODUCT_REQUIRED" }, { status: 400 });

    const result = await generateCustomerTryOn({
      userPublicId: principal.userId,
      productId,
      modelImageDataUrl: body.modelImageDataUrl,
      signal: request.signal,
      beforeProviderRun: async () => {
        guard = await reserveCustomerTryOnGeneration({ userId: principal.userId, now: Date.now() });
        if (!guard.allowed) {
          throw new Error(guard.reason === "monthly" ? "TRY_ON_MONTHLY_LIMIT_REACHED" : "TRY_ON_RATE_LIMITED");
        }
      },
      onProviderFailure: async () => {
        if (!guard?.allowed) return;
        guard = {
          ...guard,
          quota: await releaseCustomerTryOnMonthlyGeneration({ userId: principal.userId, now: Date.now() })
        };
      }
    });

    return Response.json({ result, quota: guard?.quota }, {
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_FAILED";
    const headers: Record<string, string> = { "Cache-Control": "no-store, private" };
    if (guard && !guard.allowed) {
      headers["Retry-After"] = String(Math.max(1, Math.ceil(guard.retryAfterMs / 1000)));
    }
    return Response.json({
      error: message,
      ...(guard?.quota ? { quota: guard.quota } : {}),
      ...(guard && !guard.allowed ? { retryAfterMs: guard.retryAfterMs } : {})
    }, {
      status: statusFor(message),
      headers
    });
  }
}
