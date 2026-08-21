import { requireAccountSession } from "../../../../../lib/account-session";
import { configureCustomerSavedSearch, removeCustomerSavedSearch } from "../../../../../lib/customer-engagement-actions";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.alertsEnabled !== "boolean") throw new Error("Χρειάζεται έγκυρη επιλογή ειδοποιήσεων.");
    const search = await configureCustomerSavedSearch(principal, { searchId: id, alertsEnabled: body.alertsEnabled });
    return Response.json({ search });
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
