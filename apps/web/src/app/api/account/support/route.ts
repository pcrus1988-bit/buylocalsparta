import { requireAccountSession } from "../../../../lib/account-session";
import {
  createCustomerSupportCase,
  customerSupportCases,
  CUSTOMER_SUPPORT_CONTEXT_TYPES,
  type CustomerSupportContextType
} from "../../../../lib/customer-support-runtime";
import { CUSTOMER_SUPPORT_CATEGORIES, type CustomerSupportCategory } from "../../../../lib/admin-customer-support";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const principal = await requireAccountSession();
    return Response.json({ cases: await customerSupportCases(principal) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Η υποστήριξη δεν φορτώθηκε." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  try {
    const principal = await requireAccountSession(request, true);
    const body = await request.json() as Record<string, unknown>;
    const category = String(body.category ?? "") as CustomerSupportCategory;
    if (!CUSTOMER_SUPPORT_CATEGORIES.includes(category)) throw new Error("Η κατηγορία υποστήριξης δεν είναι έγκυρη.");
    const contextTypeRaw = typeof body.contextType === "string" ? body.contextType : "";
    const contextType = contextTypeRaw ? contextTypeRaw as CustomerSupportContextType : undefined;
    if (contextType && !CUSTOMER_SUPPORT_CONTEXT_TYPES.includes(contextType)) throw new Error("Το πλαίσιο υποστήριξης δεν είναι έγκυρο.");
    const cases = await createCustomerSupportCase(principal, {
      subject: String(body.subject ?? ""),
      category,
      message: String(body.message ?? ""),
      contextType,
      contextId: typeof body.contextId === "string" ? body.contextId : undefined,
      now: Date.now()
    });
    return Response.json({ cases }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Το αίτημα υποστήριξης δεν δημιουργήθηκε." }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
