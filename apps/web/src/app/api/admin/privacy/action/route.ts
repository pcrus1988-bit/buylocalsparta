import { requireAdminSession } from "../../../../../lib/admin-session";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireAdminSession(request, { csrf: true, permission: "privacy.manage" });
    return Response.json(
      {
        error: "legacy_privacy_action_disabled",
        message: "Use the governed GDPR execute/review/respond workflow in /admin/privacy."
      },
      { status: 410, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "privacy_action_failed" },
      { status: 400, headers: { "cache-control": "no-store" } }
    );
  }
}
