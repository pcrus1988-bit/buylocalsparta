import { requireAccountSession } from "../../../lib/account-session";
import { getTodayFlashSale, recordFlashSwipe, startFlashSale } from "../../../lib/flash-sale-runtime";

type FlashSaleBody = Readonly<{ action?: unknown; itemId?: unknown; decision?: unknown }>;

const NO_STORE_HEADERS = { "cache-control": "private, no-store, max-age=0" } as const;

function completedCookie(expiresAt: string, saleDate: string): string {
  const expires = new Date(expiresAt);
  return [
    `km_flash_played=${encodeURIComponent(saleDate)}`,
    "Path=/",
    `Expires=${expires.toUTCString()}`,
    "SameSite=Lax",
    "Secure"
  ].join("; ");
}

export async function GET() {
  try {
    const principal = await requireAccountSession();
    const state = await getTodayFlashSale(principal.userId);
    return Response.json({ state: state ?? null }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : "FLASH_SALE_FAILED";
    return Response.json(
      { error: message },
      { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: NO_STORE_HEADERS }
    );
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as FlashSaleBody;
    const action = typeof body.action === "string" ? body.action : "";

    let state;
    if (action === "start") {
      state = await startFlashSale(principal.userId);
    } else if (action === "swipe") {
      const itemId = typeof body.itemId === "string" ? body.itemId.trim() : "";
      const decision = body.decision === "selected" || body.decision === "skipped" ? body.decision : undefined;
      if (!itemId || !decision) throw new Error("FLASH_SALE_INVALID_SWIPE");
      state = await recordFlashSwipe(principal.userId, itemId, decision);
    } else {
      throw new Error("FLASH_SALE_INVALID_ACTION");
    }

    const response = Response.json({ state }, { headers: NO_STORE_HEADERS });
    if (state.status === "completed") response.headers.append("set-cookie", completedCookie(state.expiresAt, state.saleDate));
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "FLASH_SALE_FAILED";
    return Response.json(
      { error: message },
      { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: NO_STORE_HEADERS }
    );
  }
}
