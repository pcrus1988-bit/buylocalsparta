import { requireAdminSession } from "../../../../lib/admin-session";
import { listAdminMailbox, type AdminMailboxFolder } from "../../../../lib/admin-mail-store";

const FOLDERS = new Set<AdminMailboxFolder>(["inbox", "sent", "archive", "trash"]);

export async function GET(request: Request) {
  try {
    await requireAdminSession(request, { permission: "notifications.manage" });
    const url = new URL(request.url);
    const rawFolder = url.searchParams.get("folder") || "inbox";
    if (!FOLDERS.has(rawFolder as AdminMailboxFolder)) throw new Error("Invalid mailbox folder");
    const q = url.searchParams.get("q")?.trim() || undefined;
    const limitRaw = Number(url.searchParams.get("limit") || "60");
    const limit = Number.isSafeInteger(limitRaw) ? limitRaw : 60;
    const result = await listAdminMailbox({ folder: rawFolder as AdminMailboxFolder, q, limit });
    return Response.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "admin_mail_list_failed" }, { status: 400 });
  }
}
