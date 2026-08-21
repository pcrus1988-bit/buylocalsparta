import { requireAdminSession } from "../../../../../lib/admin-session";
import {
  adminAccessibilityAssessmentAction,
  adminAccessibilityAuditSnapshot,
  adminAccessibilityReportAction
} from "../../../../../lib/accessibility-governance";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "accessibility.manage" });
    const body = await request.json() as Record<string, unknown>;
    const kind = String(body.kind ?? "");

    if (kind === "assessment") {
      return Response.json(await adminAccessibilityAssessmentAction(principal, {
        criterionId: String(body.criterionId ?? ""),
        scope: String(body.scope ?? ""),
        status: String(body.status ?? ""),
        evidence: String(body.evidence ?? ""),
        method: String(body.method ?? "manual")
      }));
    }

    if (kind === "audit") {
      return Response.json(await adminAccessibilityAuditSnapshot(principal, {
        scope: String(body.scope ?? "all"),
        method: String(body.method ?? "mixed"),
        summary: String(body.summary ?? "")
      }));
    }

    if (kind === "report") {
      return Response.json(await adminAccessibilityReportAction(principal, {
        reportPublicId: String(body.reportPublicId ?? ""),
        status: String(body.status ?? ""),
        resolution: String(body.resolution ?? "")
      }));
    }

    throw new Error("Unsupported accessibility action");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "accessibility_action_failed" }, { status: 400 });
  }
}
