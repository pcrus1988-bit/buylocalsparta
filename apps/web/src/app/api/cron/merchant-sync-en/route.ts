import { syncGoogleMerchantEnglishFallback } from "../../../../lib/google-merchant-sync-en";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return Response.json(
      { ok: true, status: "skipped", reason: "production_only" },
      { headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const sync = await syncGoogleMerchantEnglishFallback();
    const failed = sync.status === "partial";
    const payload = {
      event: "merchant.english_fallback_sync_run",
      status: sync.status,
      shard: sync.shard,
      shardCount: sync.shardCount,
      dataSource: sync.dataSource,
      candidates: sync.candidates,
      submitted: sync.submitted,
      unchanged: sync.unchanged,
      skippedNoImage: sync.skippedNoImage,
      deleted: sync.deleted,
      failed: sync.failed,
      errors: sync.errors
    };
    if (failed) console.error(JSON.stringify({ level: "error", ...payload }));
    else console.info(JSON.stringify({ level: "info", ...payload }));

    return Response.json(
      { ok: !failed, sync },
      { status: failed ? 502 : 200, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_merchant_english_sync_failed";
    console.error(JSON.stringify({ level: "error", event: "merchant.english_fallback_sync_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
