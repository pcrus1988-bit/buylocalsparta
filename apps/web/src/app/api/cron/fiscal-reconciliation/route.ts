import { runCustomerFiscalReconciliationSweep } from "../../../../lib/customer-fiscal-reconciliation-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VERCEL_CRON_USER_AGENT = "vercel-cron/1.0";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";

  // Preferred production authentication: when CRON_SECRET is configured Vercel sends it
  // automatically as a Bearer token and no fallback is accepted.
  //
  // This project currently has no CRON_SECRET in Vercel. Until one is configured, allow only
  // Vercel's documented cron User-Agent. The route accepts no caller-controlled parameters and
  // the underlying sweep is bounded, idempotent, throttled and protected by a DB advisory lock.
  const authorized = secret
    ? authorization === `Bearer ${secret}`
    : userAgent === VERCEL_CRON_USER_AGENT;

  if (!authorized) {
    console.warn(JSON.stringify({
      level: "warning",
      event: "customer_tax.reconciliation_cron_unauthorized",
      secretConfigured: Boolean(secret),
      vercelCronUserAgent: userAgent === VERCEL_CRON_USER_AGENT
    }));
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const fiscal = await runCustomerFiscalReconciliationSweep(Date.now());
    console.info(JSON.stringify({
      level: "info",
      event: "customer_tax.reconciliation_cron_completed",
      authMode: secret ? "bearer" : "vercel_cron_user_agent",
      ...fiscal
    }));
    return Response.json({ ok: true, fiscal }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AADE reconciliation cron failed";
    console.error(JSON.stringify({ level: "error", event: "customer_tax.reconciliation_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
