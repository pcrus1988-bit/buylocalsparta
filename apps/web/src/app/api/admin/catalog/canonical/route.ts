import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminMatchingWorkspace } from "../../../../../lib/admin-runtime";
import { adminCreateCanonicalIdentity } from "../../../../../lib/admin-canonical-identity-runtime";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, {
      csrf: true,
      permission: "catalog.write"
    });
    const body = await request.json() as Record<string, unknown>;
    await adminCreateCanonicalIdentity(principal, {
      submissionId: typeof body.submissionId === "string" ? body.submissionId : "",
      titleEl: typeof body.titleEl === "string" ? body.titleEl : undefined,
      reason: typeof body.reason === "string" ? body.reason : ""
    });
    return Response.json(await adminMatchingWorkspace(principal));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "canonical_create_failed" },
      { status: 400 }
    );
  }
}
