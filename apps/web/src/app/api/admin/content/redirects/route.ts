import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminCreateContentRedirect } from "../../../../../lib/admin-content-editor";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { fromPath?: unknown; toPath?: unknown; statusCode?: unknown };
    const statusCode = Number(body.statusCode ?? 301);
    const result = await adminCreateContentRedirect(principal, {
      fromPath: String(body.fromPath ?? ""),
      toPath: String(body.toPath ?? ""),
      statusCode: statusCode as 301 | 302 | 307 | 308
    });
    return Response.json({ result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "redirect_create_failed" }, { status: 400 });
  }
}
