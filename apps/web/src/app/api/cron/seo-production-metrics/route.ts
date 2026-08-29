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
    if (hasProviderError) {
      console.error(JSON.stringify({ level: "error", event: "seo.production_metrics_partial_failure", sync }));
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
