import { requireAccountSession } from "../../../../../lib/account-session";
import { claimGiftCard } from "../../../../../lib/gift-card-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { code?: unknown };
    const card = await claimGiftCard(principal, typeof body.code === "string" ? body.code : "");
    return Response.json({ card });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gift_card_claim_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
