import { reconcileVendorAgreementLifecycle } from "../../../../lib/vendor-agreement-lifecycle";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await reconcileVendorAgreementLifecycle();
    return Response.json({ ok: true, ...result });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "vendor_agreement_lifecycle_failed" },
      { status: 500 }
    );
  }
}
