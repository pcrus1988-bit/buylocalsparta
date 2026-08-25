import { requireAdminSession } from "../../../../../lib/admin-session";
import { adminProductLifecycleState, archiveAdminProduct, permanentlyDeleteAdminProduct, reactivateAdminProduct } from "../../../../../lib/product-lifecycle";

export async function GET(request: Request) {
  try {
    const principal = await requireAdminSession(request, { permission: "catalog.read" });
    const submissionId = new URL(request.url).searchParams.get("submissionId")?.trim() ?? "";
    if (!submissionId) throw new Error("Product submission is required");
    return Response.json(await adminProductLifecycleState(principal, submissionId));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "product_lifecycle_state_failed" }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const submissionId = typeof body.submissionId === "string" ? body.submissionId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!submissionId) throw new Error("Product submission is required");

    if (action === "archive") return Response.json(await archiveAdminProduct(principal, submissionId, reason));
    if (action === "reactivate") return Response.json(await reactivateAdminProduct(principal, submissionId, reason));
    if (action === "delete") return Response.json(await permanentlyDeleteAdminProduct(principal, submissionId, reason, body.acknowledged === true));
    throw new Error("Unsupported product lifecycle action");
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "product_lifecycle_failed" }, { status: 400 });
  }
}
