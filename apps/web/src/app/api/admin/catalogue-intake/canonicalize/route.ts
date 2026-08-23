import { adminCanonicalizeAiProductImportRun } from "../../../../../lib/admin-ai-product-import";
import { requireAdminSession } from "../../../../../lib/admin-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "catalog.write" });
    const body = await request.json() as { runId?: string; vendorId?: string; locationId?: string };
    const result = await adminCanonicalizeAiProductImportRun(principal, {
      runId: String(body.runId ?? ""),
      vendorId: String(body.vendorId ?? ""),
      locationId: String(body.locationId ?? "")
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "product_import_canonicalization_failed" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}
