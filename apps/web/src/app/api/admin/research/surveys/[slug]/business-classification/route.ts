import { recordAdminAudit } from "../../../../../../../lib/admin-runtime";
import { requireAdminSession } from "../../../../../../../lib/admin-session";
import { canonicalizeResearchBusiness } from "../../../../../../../lib/research-business-classification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const principal = await requireAdminSession(request, {
      csrf: true,
      permission: "research.design.manage"
    });
    const { slug: rawSlug } = await context.params;
    const slug = decodeURIComponent(rawSlug);
    const body = await request.json() as Record<string, unknown>;

    const result = await canonicalizeResearchBusiness(principal, {
      slug,
      frameUnitId: String(body.frameUnitId ?? ""),
      categoryCode: String(body.categoryCode ?? ""),
      note: typeof body.note === "string" ? body.note : undefined,
      rememberAlias: body.rememberAlias !== false
    });

    await recordAdminAudit(
      principal,
      "research.business_classification.confirmed",
      "research_frame_unit",
      result.frameUnitId,
      "Canonicalize respondent business activity",
      {
        studySlug: slug,
        categoryCode: result.categoryCode,
        aliasRemembered: result.aliasRemembered
      }
    );

    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "RESEARCH_BUSINESS_CLASSIFICATION_FAILED";
    return Response.json({ error: message }, {
      status: message === "ADMIN_AUTH_REQUIRED" ? 401
        : message.includes("NOT_FOUND") ? 404
          : 400,
      headers: { "Cache-Control": "no-store" }
    });
  }
}
