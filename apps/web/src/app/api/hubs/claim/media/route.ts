import { getAccountSession } from "../../../../../lib/account-session";
import { assertCustomerCsrf } from "../../../../../lib/customer-state-runtime";
import { uploadOwnedHubClaimMedia } from "../../../../../lib/hub-claim-media-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const principal = await getAccountSession();
    if (!principal || !principal.roles.includes("customer")) return Response.json({ error: "Please sign in" }, { status: 401 });
    assertCustomerCsrf(principal, request.headers.get("x-csrf-token") ?? "");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > 4 * 1024 * 1024) {
      return Response.json({ error: "Please select a JPEG, PNG or WebP image up to 4 MB" }, { status: 400 });
    }
    await uploadOwnedHubClaimMedia(principal, {
      claimId: String(form.get("claimId") ?? ""),
      role: String(form.get("role") ?? ""),
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      altText: String(form.get("altText") ?? ""),
      rightsOwner: String(form.get("rightsOwner") ?? "")
    });
    return Response.json({ ok: true, status: "pending" }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Upload failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
