import { runSymphonyaCatalogueMaterializationSlice } from "../../../../lib/symphonya-catalogue-materializer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 55;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  const authorized = Boolean(cronSecret) && request.headers.get("authorization") === `Bearer ${cronSecret}`;

  if (!authorized) {
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  const previousBatchSize = process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE;
  process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE = "5";

  try {
    const materialization = await runSymphonyaCatalogueMaterializationSlice();
    return Response.json({ ok: true, materialization }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "symphonya_materialization_failed";
    console.error(JSON.stringify({
      level: "error",
      event: "symphonya.materialization_cron_failed",
      message,
      at: new Date().toISOString()
    }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  } finally {
    if (previousBatchSize === undefined) delete process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE;
    else process.env.BLS_SYMPHONYA_MATERIALIZATION_BATCH_SIZE = previousBatchSize;
  }
}
