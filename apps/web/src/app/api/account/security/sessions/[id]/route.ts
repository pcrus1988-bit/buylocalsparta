import { requireAccountSession } from "../../../../../../lib/account-session";
import { revokeOtherCustomerSession } from "../../../../../../lib/customer-session-management";

type Context = Readonly<{ params: Promise<{ id: string }> }>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(request: Request, { params }: Context) {
  try {
    const principal = await requireAccountSession(request, true);
    const { id } = await params;
    const result = await revokeOtherCustomerSession(principal, id);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const auth = error instanceof Error && error.message === "AUTH_REQUIRED";
    return Response.json({ error: auth ? "Απαιτείται σύνδεση." : error instanceof Error ? error.message : "Η συνεδρία δεν αποσυνδέθηκε." }, { status: auth ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
