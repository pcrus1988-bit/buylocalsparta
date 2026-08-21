import { requireAccountSession } from "../../../../../lib/account-session";
import { configureCustomerSavedSearchAlerts, removeCustomerSavedSearch, updateCustomerSavedSearch } from "../../../../../lib/customer-saved-search-actions";

const availability = (value: unknown): "any" | "in_stock" => value === "in_stock" || value === "pickup_today" ? "in_stock" : "any";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;

    if (body.action === "alerts") {
      if (typeof body.alertsEnabled !== "boolean") throw new Error("Χρειάζεται έγκυρη επιλογή ειδοποιήσεων.");
      const search = await configureCustomerSavedSearchAlerts(principal, { searchId: id, alertsEnabled: body.alertsEnabled });
      return Response.json({ search });
    }

    if (body.action === "edit") {
      if (typeof body.name !== "string" || typeof body.q !== "string") throw new Error("Χρειάζονται έγκυρα στοιχεία αναζήτησης.");
      const categoryCode = typeof body.categoryCode === "string" ? body.categoryCode.trim().slice(0, 100) || undefined : undefined;
      const search = await updateCustomerSavedSearch(principal, {
        searchId: id,
        name: body.name,
        query: { q: body.q, categoryCode, availability: availability(body.availability) }
      });
      return Response.json({ search });
    }

    throw new Error("Μη έγκυρη ενέργεια αποθηκευμένης αναζήτησης.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "saved_search_update_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    await removeCustomerSavedSearch(principal, id);
    return Response.json({ removed: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "saved_search_delete_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
