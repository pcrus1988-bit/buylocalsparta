import { syncGoogleMerchantCatalogue } from "../../../../lib/google-merchant-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== "production") {
    return Response.json({ ok: true, status: "skipped", reason: "production_only" }, { headers: { "cache-control": "no-store" } });
  }

  // Workload Identity Federation cannot run without the token injected by
  // Vercel. Treat a missing token as an environment/configuration condition,
  // not as an application failure: avoid doing catalogue/DB preparation work
  // for a job that cannot submit anything to Google Merchant.
  if (!process.env.VERCEL_OIDC_TOKEN?.trim()) {
    console.warn(JSON.stringify({ level: "warn", event: "merchant.catalogue_sync_skipped", reason: "oidc_token_unavailable" }));
    return Response.json(
      { ok: true, status: "skipped", reason: "oidc_token_unavailable" },
      { headers: { "cache-control": "no-store" } }
    );
  }

  try {
    const sync = await syncGoogleMerchantCatalogue();
    const failed = sync.status === "partial";
    const payload = {
      event: "merchant.catalogue_sync_run",
      status: sync.status,
      shard: sync.shard,
      shardCount: sync.shardCount,
      candidates: sync.candidates,
      submitted: sync.submitted,
      skippedNoImage: sync.skippedNoImage,
      failed: sync.failed,
      cleanupExamined: sync.cleanupExamined,
      cleanupDeleted: sync.cleanupDeleted,
      cleanupFailed: sync.cleanupFailed,
      errors: sync.errors
    };
    if (failed) console.error(JSON.stringify({ level: "error", ...payload }));
    else console.info(JSON.stringify({ level: "info", ...payload }));

    return Response.json(
      { ok: !failed, sync },
      { status: failed ? 502 : 200, headers: { "cache-control": "no-store" } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "google_merchant_sync_failed";
    console.error(JSON.stringify({ level: "error", event: "merchant.catalogue_sync_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
