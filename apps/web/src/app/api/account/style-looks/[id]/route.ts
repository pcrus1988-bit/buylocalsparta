import { requireAccountSession } from "../../../../../lib/account-session";
import { deleteCustomerStyleLook, getCustomerStyleLook, updateCustomerStyleLook } from "../../../../../lib/style-builder-runtime";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(_request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession();
    const { id } = await params;
    const look = await getCustomerStyleLook(principal.userId, id);
    if (!look) return Response.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "no-store" } });
    return Response.json({ look }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "style_look_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const body = await request.json() as Record<string, unknown>;
    const look = await updateCustomerStyleLook({
      userPublicId: principal.userId,
      lookId: id,
      name: body.name,
      profile: body.profile,
      composition: body.composition,
      shareEnabled: body.shareEnabled
    });
    return Response.json({ look }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "style_look_update_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const removed = await deleteCustomerStyleLook(principal.userId, id);
    return Response.json({ removed }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "style_look_delete_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
