import { getCanonicalAvailability, getCanonicalProductSummary } from "../../../../../lib/catalog-view";
import { requireAccountSession } from "../../../../../lib/account-session";
import { removeCustomerProduct, saveCustomerProduct } from "../../../../../lib/customer-state-runtime";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const product = await getCanonicalProductSummary(id);
    if (!product) return Response.json({ error: "Product not found" }, { status: 404 });
    const now = Date.now();
    const availability = await getCanonicalAvailability(id);
    const result = await saveCustomerProduct({ userId: principal.userId, canonicalVariantId: id, available: availability?.available ?? false, priceMinor: product.priceMinor, now });
    return Response.json({ saved: result.saved }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "save_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const removed = await removeCustomerProduct({ userId: principal.userId, canonicalVariantId: id });
    return Response.json({ removed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "remove_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
