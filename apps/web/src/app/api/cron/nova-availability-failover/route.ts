import { runNovaAvailabilityRefreshSlice } from "../../../../lib/nova-availability-refresh-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const configured = Number(process.env.BLS_NOVA_AVAILABILITY_FAILOVER_PAGES_PER_RUN || 10);
    const maxPages = Number.isSafeInteger(configured) && configured > 0
      ? Math.min(configured, 20)
      : 10;
    const result = await runNovaAvailabilityRefreshSlice(maxPages);
    return Response.json(
      { ok: true, ...result },
      { headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "nova_availability_failover_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "nova.availability_vercel_failover_failed",
      at: new Date().toISOString(),
      message
    }));
    return Response.json(
      { error: message },
      { status: 500, headers: { "cache-control": "no-store" } }
    );
  }
}
