import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { destroyResearchLinkage, setResearchLinkageRetention } from "../../../../../../../lib/research-survey-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "research.privacy.manage" });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    const body = await request.json() as Record<string, unknown>;

    if (body.action === "set_retention_until") {
      const result = await setResearchLinkageRetention(principal, {
        slug,
        retainUntil: String(body.retainUntil ?? "")
      });
      await recordAdminAudit(
        principal,
        "research.privacy.retention_set",
        "research_study",
        slug,
        "Set explicit research linkage retention deadline",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    if (body.action === "destroy_linkage") {
      const result = await destroyResearchLinkage(principal, {
        slug,
        reason: String(body.reason ?? "")
      });
      await recordAdminAudit(
        principal,
        "research.privacy.linkage_destroyed",
        "research_study",
        slug,
        "Irreversibly destroy contact/company/response linkage after retention",
        result
      );
      return Response.json(result, { headers: { "Cache-Control": "no-store" } });
    }

    return Response.json({ error: "RESEARCH_PRIVACY_ACTION_INVALID" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_PRIVACY_ACTION_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401 : message.includes("NOT_FOUND") ? 404 : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
