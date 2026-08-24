import { requireAdminSession } from "../../../../lib/admin-session";
import { issueGiftCard } from "../../../../lib/gift-card-service";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true });
    if (!principal.roles.includes("super_admin")) return Response.json({ error: "ADMIN_PERMISSION_REQUIRED" }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const result = await issueGiftCard(principal, {
      valueMinor: Number(body.valueMinor),
      recipientName: typeof body.recipientName === "string" ? body.recipientName : undefined,
      recipientEmail: typeof body.recipientEmail === "string" ? body.recipientEmail : undefined,
      message: typeof body.message === "string" ? body.message : undefined
    });
    return Response.json({ result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gift_card_issue_failed";
    return Response.json({ error: message }, { status: message === "ADMIN_AUTH_REQUIRED" ? 401 : 400 });
  }
}
