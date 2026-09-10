import { runNovaCatalogueSyncSlice } from "../../../../lib/nova-catalogue-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

export async function GET(request: Request) {
  const authorization = schedulerAuthorization(request);
  if (authorization === "misconfigured") {
    console.error(JSON.stringify({ level: "error", event: "nova.catalogue_sync_cron_misconfigured" }));
    return Response.json({ error: "scheduler_misconfigured" }, { status: 503, headers: noStore() });
  }
  if (authorization === "unauthorized") {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: noStore() });
  }

  try {
    const result = await runNovaCatalogueSyncSlice();
    console.log(JSON.stringify({ level: "info", event: "nova.catalogue_sync_slice", ...result }));
    return Response.json({ ok: true, ...result }, { headers: noStore() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ level: "error", event: "nova.catalogue_sync_failed", message }));
    return Response.json({ ok: false, error: "nova_catalogue_sync_failed" }, { status: 500, headers: noStore() });
  }
}

function schedulerAuthorization(request: Request): "authorized" | "unauthorized" | "misconfigured" {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (!configuredSecret) return "misconfigured";
  return request.headers.get("authorization") === `Bearer ${configuredSecret}` ? "authorized" : "unauthorized";
}

function noStore(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
  };
}
