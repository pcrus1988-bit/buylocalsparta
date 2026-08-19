import { requireAdminSession } from "../../../../../../lib/admin-session";
import { recordAdminVendorAgreement } from "../../../../../../lib/vendor-admin-controls";

const statuses = new Set(["draft", "active", "suspended", "expired", "terminated"]);
const periods = new Set(["month", "year", "term"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const principal = await requireAdminSession(request, { csrf: true, permission: "vendor.manage" });
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    if (typeof body.agreementCode !== "string") throw new Error("Agreement code is required");
    if (typeof body.status !== "string" || !statuses.has(body.status)) throw new Error("Invalid agreement status");
    if (typeof body.commissionRateBps !== "number") throw new Error("Commission rate is required");
    if (typeof body.reason !== "string") throw new Error("Agreement audit reason is required");
    if (body.recurringFeePeriod !== undefined && (typeof body.recurringFeePeriod !== "string" || !periods.has(body.recurringFeePeriod))) throw new Error("Invalid recurring fee period");

    const result = await recordAdminVendorAgreement(principal, {
      vendorId: id,
      agreementCode: body.agreementCode,
      status: body.status as "draft" | "active" | "suspended" | "expired" | "terminated",
      sourceDocumentReference: typeof body.sourceDocumentReference === "string" ? body.sourceDocumentReference : undefined,
      commissionRateBps: body.commissionRateBps,
      listingFeeMinor: typeof body.listingFeeMinor === "number" ? body.listingFeeMinor : undefined,
      recurringFeeMinor: typeof body.recurringFeeMinor === "number" ? body.recurringFeeMinor : undefined,
      recurringFeePeriod: body.recurringFeePeriod as "month" | "year" | "term" | undefined,
      startsAt: typeof body.startsAt === "string" ? body.startsAt : undefined,
      endsAt: typeof body.endsAt === "string" ? body.endsAt : undefined,
      reason: body.reason
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "vendor_agreement_failed" }, { status: 400 });
  }
}
