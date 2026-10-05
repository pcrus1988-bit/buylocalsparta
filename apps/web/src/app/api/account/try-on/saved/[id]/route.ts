import { requireAccountSession } from "../../../../../../lib/account-session";
import { deleteCustomerSavedTryOn } from "../../../../../../lib/try-on-runtime";

type RouteProps = Readonly<{ params: Promise<{ id: string }> }>;

export async function DELETE(request: Request, { params }: RouteProps) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const removed = await deleteCustomerSavedTryOn(principal.userId, id);
    return Response.json({ removed }, {
      status: removed ? 200 : 404,
      headers: { "Cache-Control": "no-store, private" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "TRY_ON_DELETE_FAILED";
    return Response.json({ error: message }, {
      status: message === "AUTH_REQUIRED" ? 401 : 400,
      headers: { "Cache-Control": "no-store, private" }
    });
  }
}
