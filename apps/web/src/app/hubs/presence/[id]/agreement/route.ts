import { getAccountSession } from "../../../../../lib/account-session";
import { renderDirectoryPlanAgreementPdf } from "../../../../../lib/hub-directory-agreement";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const principal = await getAccountSession();
  if (!principal) return Response.json({ error: "SIGN_IN_REQUIRED" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    const { id } = await context.params;
    const pdf = await renderDirectoryPlanAgreementPdf(id, principal, "presence");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="KONTA-MOY-PRESENCE-TERMS.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch {
    return Response.json({ error: "PRESENCE_AGREEMENT_NOT_ELIGIBLE" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
}
