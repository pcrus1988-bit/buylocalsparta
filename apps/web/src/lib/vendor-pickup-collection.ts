import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import type { PoolClient } from "pg";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import type { VendorPickupPreview } from "./order-lifecycle";

const PICKUP_TTL_MS = 48 * 60 * 60 * 1000;

export async function collectVendorPickup(principal: SessionPrincipal, token: string, now = Date.now()): Promise<VendorPickupPreview> {
  if (!productionDatabaseConfigured()) throw new Error("Pickup runtime is unavailable");
  const vendorId = requiredVendorId(principal);
  const pickupId = tokenPickupId(token);
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let resultPreview: VendorPickupPreview | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      pickup_public_id: string;
      fulfilment_uuid: string;
      fulfilment_id: string;
      fulfilment_status: string;
      vendor_uuid: string;
      vendor_name: string;
      order_uuid: string;
      order_id: string;
      user_uuid: string | null;
      ready_at: Date | null;
      window_ends_at: Date | null;
      collected_at: Date | null;
      qr_token_hash: string;
      item_count: number | string;
    }>(`
      SELECT pg.public_id AS pickup_public_id,
             fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,
             vb.id::text AS vendor_uuid,vb.trading_name AS vendor_name,
             o.id::text AS order_uuid,o.public_id AS order_id,o.user_id::text AS user_uuid,
             pg.ready_at,pg.window_ends_at,pg.collected_at,pg.qr_token_hash,
             (SELECT COUNT(*) FROM fulfilment_order_lines fol WHERE fol.fulfilment_order_id=fo.id) AS item_count
      FROM pickup_groups pg
      JOIN fulfilment_orders fo ON fo.id=pg.fulfilment_order_id
      JOIN vendor_businesses vb ON vb.id=fo.vendor_id
      JOIN customer_orders o ON o.id=fo.order_id
      WHERE pg.public_id=$1 AND vb.public_id=$2
      FOR UPDATE OF pg,fo,o
    `, [pickupId, vendorId]);
    if (!result.rowCount) throw new Error("Το QR δεν αντιστοιχεί σε παραλαβή αυτού του καταστήματος.");
    const row = result.rows[0];
    assertPickupProof(row.pickup_public_id, row.fulfilment_id, row.qr_token_hash, token);

    const readyAt = row.ready_at?.getTime() ?? now;
    const expiresAt = row.window_ends_at?.getTime() ?? readyAt + PICKUP_TTL_MS;
    const existingCollectedAt = row.collected_at?.getTime();
    if (!existingCollectedAt && expiresAt <= now) throw new Error("Το QR παραλαβής έχει λήξει.");
    if (!existingCollectedAt && row.fulfilment_status !== "ready_for_handover") throw new Error("Η παραγγελία δεν βρίσκεται σε κατάσταση έτοιμη για παραλαβή.");

    if (!existingCollectedAt) {
      await client.query(`
        UPDATE pickup_groups
        SET collected_at=$2,collected_by=(SELECT id FROM users WHERE public_id=$3 LIMIT 1)
        WHERE public_id=$1 AND collected_at IS NULL
      `, [row.pickup_public_id, new Date(now), principal.userId]);
      await client.query("UPDATE fulfilment_orders SET status='handed_over',delivered_at=COALESCE(delivered_at,$2),updated_at=$2 WHERE id=$1", [row.fulfilment_uuid, new Date(now)]);
      await client.query(`
        UPDATE order_lines SET status='fulfilled',fulfilled_quantity=quantity,fulfilled_at=COALESCE(fulfilled_at,$2)
        WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)
      `, [row.fulfilment_uuid, new Date(now)]);
      await finalizeOrder(client, row.order_uuid, now);
      await insertTimelineOnce(client, row, principal.userId, now);
      if (row.user_uuid) await notifyCustomer(client, row, now);
    }

    resultPreview = {
      orderId: row.order_id,
      vendorName: row.vendor_name,
      status: "collected",
      readyAt,
      expiresAt,
      collectedAt: existingCollectedAt ?? now,
      itemCount: Number(row.item_count)
    };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  try { await runtime.notifications?.runOnce(now, 50); }
  catch (error) { console.error(JSON.stringify({ level: "error", event: "pickup.notification_drain_failed", message: error instanceof Error ? error.message : String(error) })); }
  return resultPreview!;
}

async function finalizeOrder(client: PoolClient, orderUuid: string, now: number) {
  const pending = await client.query<{ open_count: number | string }>(`
    SELECT COUNT(*) FILTER (WHERE status NOT IN ('handed_over','delivered','rejected','cancelled')) AS open_count
    FROM fulfilment_orders WHERE order_id=$1
  `, [orderUuid]);
  const nextStatus = Number(pending.rows[0]?.open_count ?? 0) === 0 ? "fulfilled" : "partially_fulfilled";
  await client.query("UPDATE customer_orders SET status=$2::order_status,updated_at=$3 WHERE id=$1 AND status NOT IN ('cancelled','refunded')", [orderUuid, nextStatus, new Date(now)]);
}

async function insertTimelineOnce(client: PoolClient, row: { order_uuid: string; fulfilment_uuid: string; vendor_uuid: string; vendor_name: string; fulfilment_id: string; pickup_public_id: string }, actorPublicId: string, now: number) {
  const prior = await client.query("SELECT 1 FROM order_timeline_events WHERE order_id=$1 AND fulfilment_order_id=$2 AND event_type='pickup.collected' LIMIT 1", [row.order_uuid, row.fulfilment_uuid]);
  if (prior.rowCount) return;
  await client.query(`
    INSERT INTO order_timeline_events(id,public_id,order_id,fulfilment_order_id,vendor_id,event_type,actor_type,actor_public_id,customer_visible,message,metadata,created_at)
    VALUES($1,$2,$3,$4,$5,'pickup.collected','vendor',$6,true,$7,$8::jsonb,$9)
  `, [randomUUID(), `ote_${randomUUID().replaceAll("-", "")}`, row.order_uuid, row.fulfilment_uuid, row.vendor_uuid, actorPublicId, `${row.vendor_name}: η παραλαβή ολοκληρώθηκε με επιβεβαιωμένο QR.`, JSON.stringify({ fulfilmentId: row.fulfilment_id, pickupId: row.pickup_public_id }), new Date(now)]);
}

async function notifyCustomer(client: PoolClient, row: { user_uuid: string | null; order_id: string; fulfilment_id: string; vendor_name: string }, now: number) {
  if (!row.user_uuid) return;
  const payload = JSON.stringify({ orderId: row.order_id, fulfilmentId: row.fulfilment_id });
  await insertNotification(client, {
    userUuid: row.user_uuid,
    channel: "in_app",
    eventType: "order.collected",
    dedupeKey: `order:${row.order_id}:fulfilment:${row.fulfilment_id}:collected:in_app`,
    title: "Η παραλαβή ολοκληρώθηκε",
    body: `Η παραγγελία ${row.order_id} παραδόθηκε από το ${row.vendor_name}.`,
    payload,
    now
  });
  await insertNotification(client, {
    userUuid: row.user_uuid,
    channel: "email",
    eventType: "order.collected",
    dedupeKey: `order:${row.order_id}:fulfilment:${row.fulfilment_id}:collected:email`,
    title: `Η παραλαβή ολοκληρώθηκε · ${row.order_id}`,
    body: `Η παραλαβή της παραγγελίας ${row.order_id} ολοκληρώθηκε επιτυχώς.\n\nΚατάστημα: ${row.vendor_name}\nΕυχαριστούμε που στηρίζεις την τοπική αγορά μέσω KONTA MOY.\n\nΗ παραγγελία σου: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`,
    payload,
    now
  });
}

async function insertNotification(client: PoolClient, input: { userUuid: string; channel: "in_app" | "email"; eventType: string; dedupeKey: string; title: string; body: string; payload: string; now: number }) {
  const existing = await client.query<{ id: string; status: string }>("SELECT id::text AS id,status FROM notifications WHERE dedupe_key=$1 LIMIT 1 FOR UPDATE", [input.dedupeKey]);
  if (existing.rowCount) {
    if (input.channel === "in_app") await client.query("UPDATE notifications SET status='sent',sent_at=COALESCE(sent_at,$2),title=$3,body=$4,payload=$5::jsonb WHERE id=$1", [existing.rows[0].id, new Date(input.now), input.title, input.body, input.payload]);
    return;
  }
  await client.query(`
    INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,sent_at,created_at)
    VALUES($1,$2,$3,$4,'transactional',$5,'pickup-v1','el',$6,$7,$8::jsonb,$9,$10,$11,$11)
  `, [randomUUID(), `notification_${randomUUID().replaceAll("-", "")}`, input.userUuid, input.channel, input.eventType, input.title, input.body, input.payload, input.channel === "in_app" ? "sent" : "queued", input.dedupeKey, input.channel === "in_app" ? new Date(input.now) : null]);
}

function assertPickupProof(pickupId: string, fulfilmentId: string, storedHashText: string, token: string) {
  const expected = Buffer.from(hashProof(pickupToken(pickupId, fulfilmentId)), "hex");
  const supplied = Buffer.from(hashProof(token), "hex");
  const stored = Buffer.from(storedHashText, "hex");
  if (expected.length !== supplied.length || stored.length !== supplied.length || !timingSafeEqual(expected, supplied) || !timingSafeEqual(stored, supplied)) throw new Error("Μη έγκυρο QR παραλαβής.");
}

function pickupToken(pickupId: string, fulfilmentId: string): string {
  const signature = createHmac("sha256", pickupSigningKey()).update(`qr|${pickupId}|${fulfilmentId}`).digest("base64url");
  return `${pickupId}.${signature}`;
}

function pickupSigningKey(): Buffer {
  const source = process.env.BLS_PICKUP_SIGNING_SECRET?.trim() || process.env.BLS_AUTH_SECRET?.trim();
  if (!source || source.length < 32) throw new Error("Pickup signing secret is not configured");
  return createHmac("sha256", source).update("kontamou:pickup-signing:v1").digest();
}

function hashProof(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function tokenPickupId(token: string): string {
  const value = token.trim();
  const dot = value.indexOf(".");
  if (dot < 8 || value.length > 300) throw new Error("Μη έγκυρο QR παραλαβής.");
  const pickupId = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  if (!/^pickup_[a-f0-9]{32}$/.test(pickupId) || !/^[A-Za-z0-9_-]{40,60}$/.test(signature)) throw new Error("Μη έγκυρο QR παραλαβής.");
  return pickupId;
}

function requiredVendorId(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function publicBaseUrl(): string {
  return (process.env.BLS_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site").replace(/\/$/, "");
}
