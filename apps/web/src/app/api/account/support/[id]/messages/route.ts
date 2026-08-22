import { requireAccountSession } from "../../../../../../lib/account-session";
import { replyCustomerSupportCase } from "../../../../../../lib/customer-support-runtime";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const { id } = await params;
    const cases = await replyCustomerSupportCase(principal, {
      caseId: id,
      message: String(body.message ?? ""),
      now: Date.now()
    });
    return Response.json({ cases }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Η απάντηση δεν αποθηκεύτηκε." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
