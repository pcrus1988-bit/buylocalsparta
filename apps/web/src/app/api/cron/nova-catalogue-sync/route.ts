import { runNovaCatalogueSyncSlice } from "../../../../lib/nova-catalogue-sync-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 90;

const CRON_SCHEDULE = "* * * * *";

export async function GET(request: Request) {
  if (!authorizedSchedulerRequest(request)) {
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

function authorizedSchedulerRequest(request: Request): boolean {
  const configuredSecret = process.env.CRON_SECRET?.trim();
  if (configuredSecret) return request.headers.get("authorization") === `Bearer ${configuredSecret}`;
  const userAgent = request.headers.get("user-agent")?.trim().toLowerCase();
  const schedule = request.headers.get("x-vercel-cron-schedule")?.trim();
  return userAgent === "vercel-cron/1.0" && schedule === CRON_SCHEDULE;
}

function noStore(): HeadersInit {
  return {
    "cache-control": "private, no-store, max-age=0",
    "x-robots-tag": "noindex, nofollow, noarchive, nosnippet"
  };
}
