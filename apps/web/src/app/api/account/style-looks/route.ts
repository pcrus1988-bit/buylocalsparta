import { requireAccountSession } from "../../../../lib/account-session";
import { createCustomerStyleLook, listCustomerStyleLooks } from "../../../../lib/style-builder-runtime";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json({ looks: await listCustomerStyleLooks(principal.userId) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "style_looks_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const look = await createCustomerStyleLook({
      userPublicId: principal.userId,
      name: body.name,
      audience: body.audience,
      source: body.source,
      profile: body.profile,
      composition: body.composition
    });
    return Response.json({ look }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "style_look_save_failed";
    return Response.json({ error: message }, { status: message === "AUTH_REQUIRED" ? 401 : 400 });
  }
}
