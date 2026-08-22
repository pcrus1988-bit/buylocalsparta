import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { updateSeoCrawlIssue } from "../../../../../../../lib/seo-crawl-history";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "content.write" });
    const body = await request.json() as { issueId?: unknown; action?: unknown; reason?: unknown };
    const action = body.action;
    if (action !== "ignore" && action !== "resolve" && action !== "reopen") throw new Error("Unsupported SEO issue action.");
    const result = await updateSeoCrawlIssue(principal, {
      issueId: String(body.issueId ?? ""),
      action,
      reason: body.reason
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "seo_issue_action_failed" }, { status: 400 });
  }
}