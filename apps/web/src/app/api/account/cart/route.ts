import { getAccountSession, requireAccountSession } from "../../../../lib/account-session";
import { persistentCustomerCart, syncPersistentCustomerCart } from "../../../../lib/customer-commerce-runtime";

export async function GET() {
  try {
    const principal = await getAccountSession();
    if (!principal) return Response.json({ authenticated: false, cart: null }, { status: 200 });
    const cart = await persistentCustomerCart(principal);
    return Response.json({ authenticated: true, persistent: cart !== undefined, csrfToken: cart ? principal.csrfToken : undefined, cart });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "cart_load_failed" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as { items?: unknown };
    if (!Array.isArray(body.items) || body.items.length > 100) throw new Error("Invalid cart items");
    const items = body.items.map((raw) => {
      const item = raw as { canonicalVariantId?: unknown; quantity?: unknown };
      if (typeof item.canonicalVariantId !== "string" || !item.canonicalVariantId.trim()) throw new Error("Invalid cart product id");
      const quantity = Number(item.quantity);
      if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 99) throw new Error("Invalid cart quantity");
      return { canonicalVariantId: item.canonicalVariantId, quantity };
    });
    return Response.json({ cart: await syncPersistentCustomerCart(principal, items) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "cart_sync_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
