import { reconcileGoogleMerchantStatus } from "../../../../lib/google-merchant-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return Response.json({ ok: true, status: "skipped", reason: "production_only" }, { headers: { "cache-control": "no-store" } });
  }
  try {
    const reconciliation = await reconcileGoogleMerchantStatus();
    console.info(JSON.stringify({ level: "info", event: "merchant.status_reconciliation", ...reconciliation }));
    return Response.json({ ok: true, reconciliation }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_merchant_status_failed";
    console.error(JSON.stringify({ level: "error", event: "merchant.status_reconciliation_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
