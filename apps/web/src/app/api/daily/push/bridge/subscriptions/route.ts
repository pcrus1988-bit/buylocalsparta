import { createHash, randomUUID } from "node:crypto";
import { verifyDailyPushBridgeToken } from "../../../../../../../lib/daily-push-bridge";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "../../../../../../../lib/postgres-runtime";

export const runtime = "nodejs";

function endpointHash(endpoint: string): string { return createHash("sha256").update(endpoint).digest("hex"); }

export async function POST(request: Request) {
  try {
    if (!productionDatabaseConfigured()) throw new Error("Daily push runtime is unavailable");
    const body = await request.json() as {
      token?: unknown;
      endpoint?: unknown;
      keys?: { p256dh?: unknown; auth?: unknown };
    };
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const endpoint = typeof body.endpoint === "string" ? body.endpoint.trim() : "";
    const p256dh = typeof body.keys?.p256dh === "string" ? body.keys.p256dh.trim() : "";
    const auth = typeof body.keys?.auth === "string" ? body.keys.auth.trim() : "";
    const identity = verifyDailyPushBridgeToken(token);

    let url: URL;
    try { url = new URL(endpoint); } catch { throw new Error("Invalid push endpoint"); }
    if (url.protocol !== "https:") throw new Error("Push endpoint must use HTTPS");
    if (!p256dh || p256dh.length > 512) throw new Error("Invalid push p256dh key");
    if (!auth || auth.length > 256) throw new Error("Invalid push auth key");

    const db = getProductionPostgresRuntime().nativePool;
    const result = await db.query(`INSERT INTO vendor_daily_push_subscriptions(
        id,public_id,vendor_id,user_id,endpoint,endpoint_hash,p256dh,auth_secret,active,failure_count,user_agent,created_at,updated_at)
      VALUES($1,$2,(SELECT id FROM vendor_businesses WHERE public_id=$3),(SELECT id FROM users WHERE public_id=$4),$5,$6,$7,$8,true,0,$9,now(),now())
      ON CONFLICT (vendor_id,user_id,endpoint_hash) DO UPDATE SET endpoint=EXCLUDED.endpoint,p256dh=EXCLUDED.p256dh,auth_secret=EXCLUDED.auth_secret,
        active=true,failure_count=0,user_agent=EXCLUDED.user_agent,updated_at=now()
      RETURNING public_id`, [
      randomUUID(),
      `daily_push_${randomUUID().replaceAll("-", "")}`,
      identity.vendorId,
      identity.userId,
      endpoint,
      endpointHash(endpoint),
      p256dh,
      auth,
      `bridge:${(request.headers.get("user-agent") ?? "unknown").slice(0, 480)}`
    ]);
    if (!result.rowCount) throw new Error("Unable to register this device for Daily push");
    return Response.json({ ok: true, id: String(result.rows[0].public_id) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "daily_push_bridge_failed" }, { status: 400 });
  }
}
