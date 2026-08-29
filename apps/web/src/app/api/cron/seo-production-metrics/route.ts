import { syncSeoProductionMetrics } from "../../../../lib/seo-production-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const sync = await syncSeoProductionMetrics();
    const hasProviderError = sync.providers.some((provider) => provider.status === "error");
    const logPayload = {
      event: "seo.production_metrics_run",
      status: sync.status,
      retentionStart: sync.retentionStart,
      providers: sync.providers.map((provider) => ({
        provider: provider.provider,
        status: provider.status,
        recentStart: provider.recentStart,
        recentEnd: provider.recentEnd,
        recentRows: provider.recentRows,
        backfillRows: provider.backfillRows,
        backfillChunks: provider.backfillChunks,
        backfillComplete: provider.backfillComplete,
        reason: provider.reason,
        error: provider.error
      }))
    };
    if (hasProviderError) {
      console.error(JSON.stringify({ level: "error", ...logPayload }));
    } else {
      console.info(JSON.stringify({ level: "info", ...logPayload }));
    }
    return Response.json(
      { ok: !hasProviderError, sync },
      {
        status: hasProviderError ? 502 : 200,
        headers: { "cache-control": "no-store" }
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "seo_production_metrics_sync_failed";
    console.error(JSON.stringify({ level: "error", event: "seo.production_metrics_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
