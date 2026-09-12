import { runNovaCanonicalMediaSlice } from "../../../../lib/nova-canonical-media-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runNovaCanonicalMediaSlice(4);
    return Response.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "nova_canonical_media_failed";
    console.error(JSON.stringify({ level: "error", event: "nova.canonical_media_cron_failed", message }));
    return Response.json({ error: message }, { status: 500 });
  }
}
