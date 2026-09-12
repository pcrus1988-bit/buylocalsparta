import { runNovaCanonicalMediaSlice } from "../../../../lib/nova-canonical-media-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.BLS_MEDIA_PIPELINE_ENABLED !== "true") {
    return Response.json({
      ok: true,
      enabled: false,
      reason: "media_pipeline_disabled",
      candidates: 0,
      imported: 0,
      skipped: 0,
      failed: 0
    }, { headers: { "cache-control": "no-store" } });
  }

  try {
    const configured = Number(process.env.BLS_NOVA_MEDIA_CRON_PRODUCTS || 4);
    const maxProducts = Number.isSafeInteger(configured) && configured > 0 ? configured : 4;
    const result = await runNovaCanonicalMediaSlice(maxProducts);
    return Response.json({ ok: true, enabled: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "nova_canonical_media_failed";
    console.error(JSON.stringify({ level: "error", event: "nova.canonical_media_cron_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}
