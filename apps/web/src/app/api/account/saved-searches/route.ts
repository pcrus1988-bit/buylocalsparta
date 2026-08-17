import { currentSavedSearchMatches } from "../../../../lib/account-runtime";
import { requireAccountSession } from "../../../../lib/account-session";
import { createCustomerSavedSearch } from "../../../../lib/customer-state-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { q?: unknown; categoryCode?: unknown; availability?: unknown; name?: unknown };
    const q = typeof body.q === "string" ? body.q.trim().slice(0, 160) : "";
    const categoryCode = typeof body.categoryCode === "string" ? body.categoryCode.trim().slice(0, 100) || undefined : undefined;
    const availability = body.availability === "in_stock" || body.availability === "pickup_today" ? body.availability : "any";
    const query = { q, categoryCode, availability } as const;
    const saved = await createCustomerSavedSearch({
      userId: principal.userId,
      marketId: "sparta",
      name: typeof body.name === "string" ? body.name : undefined,
      query,
      alertsEnabled: true,
      currentCanonicalVariantIds: await currentSavedSearchMatches(query),
      now: Date.now()
    });
    return Response.json({ saved }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "saved_search_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
