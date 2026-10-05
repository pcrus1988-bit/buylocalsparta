import { requireAccountSession } from "../../../../../lib/account-session";
import { listCustomerSavedTryOns, saveCustomerTryOn } from "../../../../../lib/try-on-runtime";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json(
      { tryOns: await listCustomerSavedTryOns(principal.userId) },
      { headers: { "Cache-Control": "no-store, private" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_LIST_FAILED";
    return Response.json({ error: message }, {
      status: message === "AUTH_REQUIRED" ? 401 : 400,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!productId) return Response.json({ error: "TRY_ON_PRODUCT_REQUIRED" }, { status: 400 });
    const saved = await saveCustomerTryOn({
      userPublicId: principal.userId,
      productId,
      predictionId: body.predictionId,
      imageDataUrl: body.imageDataUrl,
      saveToken: body.saveToken
    });
    return Response.json({ saved }, {
      status: 201,
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_SAVE_FAILED";
    const status = message === "AUTH_REQUIRED" ? 401
      : message === "TRY_ON_STORAGE_NOT_CONFIGURED" ? 503
        : message === "TRY_ON_ACCOUNT_OR_PRODUCT_NOT_FOUND" ? 404
        : message === "TRY_ON_SAVE_TOKEN_EXPIRED" ? 410
          : 400;
    return Response.json({ error: message }, {
      status,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
