import { syncSeoUrlRegistrySystem } from "../../../../lib/seo-url-registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await syncSeoUrlRegistrySystem();
    console.info(JSON.stringify({
      level: "info",
      event: "seo.url_registry_cron_run",
      synced: result.synced,
      deactivated: result.deactivated,
      generatedAt: result.generatedAt
    }));
    return Response.json({ ok: true, result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "seo_url_registry_cron_failed";
    console.error(JSON.stringify({ level: "error", event: "seo.url_registry_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
