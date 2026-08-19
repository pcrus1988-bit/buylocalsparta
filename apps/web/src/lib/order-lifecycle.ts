import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import type { PoolClient } from "pg";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const PICKUP_TTL_MS = 48 * 60 * 60 * 1000;

type PickupRow = Readonly<{
  pickup_public_id: string;
  fulfilment_uuid: string;
  fulfilment_id: string;
  vendor_uuid: string;
  vendor_id: string;
  vendor_name: string;
  status: string;
  ready_at: Date | null;
  window_ends_at: Date | null;
  collected_at: Date | null;
  pickup_code_hash: string;
  qr_token_hash: string;
}>;

export type CustomerPickupCredential = Readonly<{
  id: string;
  fulfilmentId: string;
  vendorName: string;
  status: "ready" | "collected" | "expired";
  readyAt: number;
  expiresAt: number;
  collectedAt?: number;
  shortCode: string;
  qrUrl: string;
}>;

export type VendorPickupPreview = Readonly<{
  orderId: string;
  vendorName: string;
  status: "ready" | "collected" | "expired";
  readyAt: number;
  expiresAt: number;
  collectedAt?: number;
  itemCount: number;
}>;

export async function syncConfirmedOrderLifecycle(orderId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    const orderResult = await client.query<{
      order_uuid: string;
      order_id: string;
      user_uuid: string | null;
      status: string;
      total_minor: number | string;
      fulfilment_preference: string;
    }>(`
      SELECT o.id::text AS order_uuid,o.public_id AS order_id,o.user_id::text AS user_uuid,
             o.status::text AS status,o.total_minor,o.fulfilment_preference::text AS fulfilment_preference
      FROM customer_orders o WHERE o.public_id=$1 FOR UPDATE
    `, [orderId]);
    if (!orderResult.rowCount) throw new Error("ORDER_NOT_FOUND");
    const order = orderResult.rows[0];
    if (!["confirmed", "partially_fulfilled", "fulfilled", "completed"].includes(order.status)) {
      await client.query("COMMIT");
      return;
    }

    const lines = await client.query<{
      quantity: number | string;
      title: string;
      vendor_uuid: string;
      vendor_id: string;
      vendor_name: string;
      fulfilment_uuid: string;
      fulfilment_id: string;
      fulfilment_status: string;
      mode: string;
    }>(`
      SELECT ol.quantity,
             COALESCE(ol.product_snapshot->>'title',cv.model,cv.slug,'Προϊόν') AS title,
             vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
             fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,fo.mode::text AS mode
      FROM order_lines ol
      JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
      JOIN vendor_businesses vb ON vb.id=ol.vendor_id
      JOIN fulfilment_order_lines fol ON fol.order_line_id=ol.id
      JOIN fulfilment_orders fo ON fo.id=fol.fulfilment_order_id
      WHERE ol.order_id=$1 AND fo.status<>'rejected'
      ORDER BY vb.trading_name,ol.created_at
    `, [order.order_uuid]);

    const orderLink = `${publicBaseUrl()}/account/orders/${encodeURIComponent(order.order_id)}`;
    if (order.user_uuid) {
      const customerText = [
        "Ευχαριστούμε για την παραγγελία σου στο KONTA MOY.",
        "",
        `Παραγγελία: ${order.order_id}`,
        `Σύνολο: ${euro(order.total_minor)}`,
        `Τρόπος παραλαβής: ${fulfilmentLabel(order.fulfilment_preference)}`,
        "",
        "Η πληρωμή έχει επιβεβαιωθεί και η παραγγελία έχει σταλεί στο κατάστημα για αποδοχή.",
        `Παρακολούθηση παραγγελίας: ${orderLink}`,
        "",
        "Θα λάβεις νέα ενημέρωση μόλις το κατάστημα αποδεχθεί και όταν η παραγγελία είναι έτοιμη.",
        "",
        "KONTA MOY · Buy Local Sparta"
      ].join("\n");
      await upsertNotification(client, {
        userUuid: order.user_uuid,
        channel: "in_app",
        eventType: "order.payment_confirmed",
        dedupeKey: `order:${order.order_id}:payment-confirmed:in_app`,
        title: "Η παραγγελία σου επιβεβαιώθηκε",
        body: `Ευχαριστούμε! Η παραγγελία ${order.order_id} πληρώθηκε και περιμένει την αποδοχή του καταστήματος.`,
        payload: { orderId: order.order_id },
        now
      });
      await upsertNotification(client, {
        userUuid: order.user_uuid,
        channel: "email",
        eventType: "order.payment_confirmed",
        dedupeKey: `order:${order.order_id}:payment-confirmed:email`,
        title: `Ευχαριστούμε για την παραγγελία σου · ${order.order_id}`,
        body: customerText,
        payload: { orderId: order.order_id },
        now
      });
    }

    const byVendor = new Map<string, typeof lines.rows>();
    for (const line of lines.rows) {
      const group = byVendor.get(line.vendor_uuid) ?? [];
      group.push(line);
      byVendor.set(line.vendor_uuid, group);
    }
    for (const [vendorUuid, vendorLines] of byVendor) {
      const first = vendorLines[0];
      const itemText = vendorLines.map((line) => `• ${Number(line.quantity)}× ${line.title}`).join("\n");
      const vendorText = [
        `Νέα πληρωμένη παραγγελία για το κατάστημα «${first.vendor_name}».`,
        "",
        `Παραγγελία: ${order.order_id}`,
        `Τρόπος εκπλήρωσης: ${fulfilmentLabel(first.mode)}`,
        "",
        itemText,
        "",
        "Χρειάζεται αποδοχή ή απόρριψη από το vendor workspace.",
        `Vendor workspace: ${publicBaseUrl()}/vendor#orders`,
        "",
        "KONTA MOY · Buy Local Sparta"
      ].join("\n");
      const payload = { orderId: order.order_id, fulfilmentId: first.fulfilment_id };
      await upsertNotification(client, {
        vendorUuid,
        channel: "in_app",
        eventType: "vendor.order_received",
        dedupeKey: `order:${order.order_id}:vendor:${first.vendor_id}:received:in_app`,
        title: "Νέα παραγγελία προς αποδοχή",
        body: `Η παραγγελία ${order.order_id} χρειάζεται ενέργεια.`,
        payload,
        now
      });
      await upsertNotification(client, {
        vendorUuid,
        channel: "email",
        eventType: "vendor.order_received",
        dedupeKey: `order:${order.order_id}:vendor:${first.vendor_id}:received:email`,
        title: `Νέα παραγγελία προς αποδοχή · ${order.order_id}`,
        body: vendorText,
        payload,
        now
      });
    }

    await insertTimelineOnce(client, {
      orderUuid: order.order_uuid,
      eventType: "order.confirmed",
      actorType: "system",
      message: "Η πληρωμή επιβεβαιώθηκε και η παραγγελία στάλθηκε στα καταστήματα για αποδοχή.",
      metadata: { orderId: order.order_id },
      now
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await drainQueuedEmails(now);
}

export async function syncVendorFulfilmentLifecycle(principal: SessionPrincipal, input: { fulfilmentId: string; action: string; now?: number }): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const vendorId = requiredVendorId(principal);
  const now = input.now ?? Date.now();
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query<{
      fulfilment_uuid: string;
      fulfilment_id: string;
      fulfilment_status: string;
      mode: string;
      vendor_uuid: string;
      vendor_id: string;
      vendor_name: string;
      order_uuid: string;
      order_id: string;
      order_status: string;
      user_uuid: string | null;
    }>(`
      SELECT fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,fo.mode::text AS mode,
             vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,
             o.id::text AS order_uuid,o.public_id AS order_id,o.status::text AS order_status,o.user_id::text AS user_uuid
      FROM fulfilment_orders fo
      JOIN vendor_businesses vb ON vb.id=fo.vendor_id
      JOIN customer_orders o ON o.id=fo.order_id
      WHERE fo.public_id=$1 AND vb.public_id=$2
      FOR UPDATE OF fo,o
    `, [input.fulfilmentId, vendorId]);
    if (!found.rowCount) throw new Error("Vendor fulfilment access denied");
    const row = found.rows[0];

    if (input.action === "accept") {
      await client.query(`
        UPDATE order_lines SET status='accepted'
        WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)
          AND status='awaiting_vendor'
      `, [row.fulfilment_uuid]);
      await insertTimelineOnce(client, {
        orderUuid: row.order_uuid,
        fulfilmentUuid: row.fulfilment_uuid,
        vendorUuid: row.vendor_uuid,
        eventType: "fulfilment.accepted",
        actorType: "vendor",
        actorPublicId: principal.userId,
        message: `${row.vendor_name}: η παραγγελία έγινε αποδεκτή και ετοιμάζεται.`,
        metadata: { fulfilmentId: row.fulfilment_id },
        now
      });
      if (row.user_uuid) {
        await notifyCustomerState(client, {
          userUuid: row.user_uuid,
          orderId: row.order_id,
          fulfilmentId: row.fulfilment_id,
          state: "accepted",
          title: "Το κατάστημα αποδέχθηκε την παραγγελία σου",
          inAppBody: `${row.vendor_name}: η παραγγελία σου ετοιμάζεται.`,
          emailBody: [
            `Το κατάστημα «${row.vendor_name}» αποδέχθηκε την παραγγελία ${row.order_id}.`,
            "",
            "Η παραγγελία σου ετοιμάζεται τώρα. Θα σε ενημερώσουμε ξανά όταν είναι έτοιμη για παραλαβή.",
            `Παρακολούθηση: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`,
            "",
            "KONTA MOY · Buy Local Sparta"
          ].join("\n"),
          now
        });
      }
    } else if (input.action === "ready") {
      await client.query(`
        UPDATE order_lines SET status='accepted'
        WHERE id IN (SELECT order_line_id FROM fulfilment_order_lines WHERE fulfilment_order_id=$1)
          AND status='awaiting_vendor'
      `, [row.fulfilment_uuid]);
      const pickup = await ensurePickupGroup(client, {
        fulfilmentUuid: row.fulfilment_uuid,
        fulfilmentId: row.fulfilment_id,
        vendorUuid: row.vendor_uuid,
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        fulfilmentStatus: row.fulfilment_status,
        now
      });
      await insertTimelineOnce(client, {
        orderUuid: row.order_uuid,
        fulfilmentUuid: row.fulfilment_uuid,
        vendorUuid: row.vendor_uuid,
        eventType: "pickup.ready",
        actorType: "vendor",
        actorPublicId: principal.userId,
        message: `${row.vendor_name}: η παραγγελία είναι έτοιμη για παραλαβή.`,
        metadata: { fulfilmentId: row.fulfilment_id, pickupId: pickup.pickup_public_id },
        now
      });
      if (row.user_uuid) {
        const code = pickupShortCode(pickup.pickup_public_id, row.fulfilment_id);
        await notifyCustomerState(client, {
          userUuid: row.user_uuid,
          orderId: row.order_id,
          fulfilmentId: row.fulfilment_id,
          state: "ready",
          title: "Η παραγγελία σου είναι έτοιμη για παραλαβή",
          inAppBody: `${row.vendor_name}: δείξε το QR παραλαβής ή τον κωδικό ${code} στο κατάστημα.`,
          emailBody: [
            `Η παραγγελία ${row.order_id} είναι έτοιμη στο «${row.vendor_name}».`,
            "",
            "Οδηγίες παραλαβής:",
            "1. Άνοιξε την παραγγελία σου από το KONTA MOY.",
            "2. Δείξε στο κατάστημα το QR παραλαβής που εμφανίζεται στην οθόνη.",
            `3. Εναλλακτικός 6ψήφιος κωδικός: ${code}`,
            "",
            `QR & στοιχεία παραλαβής: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`,
            "",
            "Το κατάστημα ολοκληρώνει την παραλαβή με ασφαλή σάρωση του QR.",
            "",
            "KONTA MOY · Buy Local Sparta"
          ].join("\n"),
          now
        });
      }
    } else if (input.action === "delivered") {
      await finalizeOrderFromFulfilments(client, row.order_uuid, now);
      await insertTimelineOnce(client, {
        orderUuid: row.order_uuid,
        fulfilmentUuid: row.fulfilment_uuid,
        vendorUuid: row.vendor_uuid,
        eventType: "fulfilment.delivered",
        actorType: "vendor",
        actorPublicId: principal.userId,
        message: `${row.vendor_name}: η παράδοση ολοκληρώθηκε.`,
        metadata: { fulfilmentId: row.fulfilment_id },
        now
      });
      if (row.user_uuid) {
        await notifyCustomerState(client, {
          userUuid: row.user_uuid,
          orderId: row.order_id,
          fulfilmentId: row.fulfilment_id,
          state: "delivered",
          title: "Η παράδοση ολοκληρώθηκε",
          inAppBody: `Η παραγγελία ${row.order_id} παραδόθηκε.`,
          emailBody: `Η παράδοση της παραγγελίας ${row.order_id} ολοκληρώθηκε.\n\nΕυχαριστούμε που αγόρασες τοπικά μέσω KONTA MOY.`,
          now
        });
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await drainQueuedEmails(now);
}

export async function customerPickupCredentials(principal: SessionPrincipal, orderId: string, now = Date.now()): Promise<readonly CustomerPickupCredential[]> {
  if (!productionDatabaseConfigured()) return [];
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let createdOrRepaired = false;
  try {
    await client.query("BEGIN");
    const result = await client.query<{
      order_uuid: string;
      user_uuid: string;
      fulfilment_uuid: string;
      fulfilment_id: string;
      fulfilment_status: string;
      vendor_uuid: string;
      vendor_id: string;
      vendor_name: string;
    }>(`
      SELECT o.id::text AS order_uuid,o.user_id::text AS user_uuid,
             fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,fo.status::text AS fulfilment_status,
             vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name
      FROM customer_orders o
      JOIN users u ON u.id=o.user_id
      JOIN fulfilment_orders fo ON fo.order_id=o.id AND fo.mode='pickup' AND fo.status<>'rejected'
      JOIN vendor_businesses vb ON vb.id=fo.vendor_id
      WHERE o.public_id=$1 AND u.public_id=$2
      ORDER BY fo.created_at
    `, [orderId, principal.userId]);
    const credentials: CustomerPickupCredential[] = [];
    for (const row of result.rows) {
      if (!["ready_for_handover", "handed_over", "delivered"].includes(row.fulfilment_status)) continue;
      const before = await client.query<{ pickup_public_id: string }>("SELECT public_id AS pickup_public_id FROM pickup_groups WHERE fulfilment_order_id=$1", [row.fulfilment_uuid]);
      const pickup = await ensurePickupGroup(client, {
        fulfilmentUuid: row.fulfilment_uuid,
        fulfilmentId: row.fulfilment_id,
        vendorUuid: row.vendor_uuid,
        vendorId: row.vendor_id,
        vendorName: row.vendor_name,
        fulfilmentStatus: row.fulfilment_status,
        now
      });
      if (!before.rowCount) createdOrRepaired = true;
      const readyAt = pickup.ready_at?.getTime() ?? now;
      const expiresAt = pickup.window_ends_at?.getTime() ?? readyAt + PICKUP_TTL_MS;
      const collectedAt = pickup.collected_at?.getTime();
      const status: CustomerPickupCredential["status"] = collectedAt ? "collected" : expiresAt <= now ? "expired" : "ready";
      const token = pickupToken(pickup.pickup_public_id, row.fulfilment_id);
      credentials.push({
        id: pickup.pickup_public_id,
        fulfilmentId: row.fulfilment_id,
        vendorName: row.vendor_name,
        status,
        readyAt,
        expiresAt,
        collectedAt,
        shortCode: pickupShortCode(pickup.pickup_public_id, row.fulfilment_id),
        qrUrl: `${publicBaseUrl()}/vendor/pickup/scan?token=${encodeURIComponent(token)}`
      });
      if (status === "ready") {
        const code = pickupShortCode(pickup.pickup_public_id, row.fulfilment_id);
        await notifyCustomerState(client, {
          userUuid: row.user_uuid,
          orderId,
          fulfilmentId: row.fulfilment_id,
          state: "ready",
          title: "Η παραγγελία σου είναι έτοιμη για παραλαβή",
          inAppBody: `${row.vendor_name}: δείξε το QR παραλαβής ή τον κωδικό ${code} στο κατάστημα.`,
          emailBody: [
            `Η παραγγελία ${orderId} είναι έτοιμη στο «${row.vendor_name}».`,
            "",
            "Άνοιξε την παραγγελία σου για να εμφανίσεις το QR παραλαβής και δείξ' το στο κατάστημα.",
            `Εναλλακτικός κωδικός: ${code}`,
            `QR & οδηγίες: ${publicBaseUrl()}/account/orders/${encodeURIComponent(orderId)}`,
            "",
            "KONTA MOY · Buy Local Sparta"
          ].join("\n"),
          now
        });
      }
    }
    await client.query("COMMIT");
    if (createdOrRepaired) await drainQueuedEmails(now);
    return credentials;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function repairCustomerOrderLifecycle(principal: SessionPrincipal, orderId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const runtime = getProductionPostgresRuntime();
  const owned = await runtime.nativePool.query<{ status: string }>(`
    SELECT o.status::text AS status FROM customer_orders o JOIN users u ON u.id=o.user_id
    WHERE o.public_id=$1 AND u.public_id=$2 LIMIT 1
  `, [orderId, principal.userId]);
  if (!owned.rowCount) return;
  if (["confirmed", "partially_fulfilled", "fulfilled", "completed"].includes(owned.rows[0].status)) {
    await syncConfirmedOrderLifecycle(orderId, now);
  }
}

export async function getVendorPickupScanPreview(principal: SessionPrincipal, token: string, now = Date.now()): Promise<VendorPickupPreview> {
  if (!productionDatabaseConfigured()) throw new Error("Pickup runtime is unavailable");
  const vendorId = requiredVendorId(principal);
  const pickupId = tokenPickupId(token);
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<PickupRow & { order_id: string; item_count: number | string }>(`
    SELECT pg.public_id AS pickup_public_id,fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,
           vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,fo.status::text AS status,
           pg.ready_at,pg.window_ends_at,pg.collected_at,pg.pickup_code_hash,pg.qr_token_hash,
           o.public_id AS order_id,COUNT(fol.order_line_id) AS item_count
    FROM pickup_groups pg
    JOIN fulfilment_orders fo ON fo.id=pg.fulfilment_order_id
    JOIN vendor_businesses vb ON vb.id=fo.vendor_id
    JOIN customer_orders o ON o.id=fo.order_id
    LEFT JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id
    WHERE pg.public_id=$1 AND vb.public_id=$2
    GROUP BY pg.id,fo.id,vb.id,o.id
  `, [pickupId, vendorId]);
  if (!result.rowCount) throw new Error("Το QR δεν αντιστοιχεί σε παραλαβή αυτού του καταστήματος.");
  const row = result.rows[0];
  assertPickupProof(row, token);
  const readyAt = row.ready_at?.getTime() ?? now;
  const expiresAt = row.window_ends_at?.getTime() ?? readyAt + PICKUP_TTL_MS;
  const collectedAt = row.collected_at?.getTime();
  return {
    orderId: row.order_id,
    vendorName: row.vendor_name,
    status: collectedAt ? "collected" : expiresAt <= now ? "expired" : "ready",
    readyAt,
    expiresAt,
    collectedAt,
    itemCount: Number(row.item_count)
  };
}

export async function collectVendorPickup(principal: SessionPrincipal, token: string, now = Date.now()): Promise<VendorPickupPreview> {
  if (!productionDatabaseConfigured()) throw new Error("Pickup runtime is unavailable");
  const vendorId = requiredVendorId(principal);
  const pickupId = tokenPickupId(token);
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let preview: VendorPickupPreview | undefined;
  try {
    await client.query("BEGIN");
    const result = await client.query<PickupRow & { order_uuid: string; order_id: string; user_uuid: string | null; item_count: number | string }>(`
      SELECT pg.public_id AS pickup_public_id,fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,
             vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,fo.status::text AS status,
             pg.ready_at,pg.window_ends_at,pg.collected_at,pg.pickup_code_hash,pg.qr_token_hash,
             o.id::text AS order_uuid,o.public_id AS order_id,o.user_id::text AS user_uuid,COUNT(fol.order_line_id) AS item_count
      FROM pickup_groups pg
      JOIN fulfilment_orders fo ON fo.id=pg.fulfilment_order_id
      JOIN vendor_businesses vb ON vb.id=fo.vendor_id
      JOIN customer_orders o ON o.id=fo.order_id
      LEFT JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id
      WHERE pg.public_id=$1 AND vb.public_id=$2
      GROUP BY pg.id,fo.id,vb.id,o.id
      FOR UPDATE OF pg,fo,o
    `, [pickupId, vendorId]);
    if (!result.rowCount) throw new Error("Το QR δεν αντιστοιχεί σε παραλαβή αυτού του καταστήματος.");
    const row = result.rows[0];
    assertPickupProof(row, token);
    const readyAt = row.ready_at?.getTime() ?? now;
    const expiresAt = row.window_ends_at?.getTime() ?? readyAt + PICKUP_TTL_MS;
    const alreadyCollected = row.collected_at?.getTime();
    if (!alreadyCollected && expiresAt <= now) throw new Error("Το QR παραλαβής έχει λήξει.");
    if (!alreadyCollected && row.status !== "ready_for_handover") throw new Error(`Η παραγγελία δεν είναι έτοιμη για παραλαβή (${row.status}).`);

    if (!alreadyCollected) {
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
      await finalizeOrderFromFulfilments(client, row.order_uuid, now);
      await insertTimelineOnce(client, {
        orderUuid: row.order_uuid,
        fulfilmentUuid: row.fulfilment_uuid,
        vendorUuid: row.vendor_uuid,
        eventType: "pickup.collected",
        actorType: "vendor",
        actorPublicId: principal.userId,
        message: `${row.vendor_name}: η παραλαβή ολοκληρώθηκε με επιβεβαιωμένο QR.`,
        metadata: { fulfilmentId: row.fulfilment_id, pickupId: row.pickup_public_id },
        now
      });
      if (row.user_uuid) {
        await notifyCustomerState(client, {
          userUuid: row.user_uuid,
          orderId: row.order_id,
          fulfilmentId: row.fulfilment_id,
          state: "collected",
          title: "Η παραλαβή ολοκληρώθηκε",
          inAppBody: `Η παραγγελία ${row.order_id} παραδόθηκε από το ${row.vendor_name}.`,
          emailBody: [
            `Η παραλαβή της παραγγελίας ${row.order_id} ολοκληρώθηκε επιτυχώς.`,
            "",
            `Κατάστημα: ${row.vendor_name}`,
            "Ευχαριστούμε που στηρίζεις την τοπική αγορά μέσω KONTA MOY.",
            "",
            `Η παραγγελία σου: ${publicBaseUrl()}/account/orders/${encodeURIComponent(row.order_id)}`
          ].join("\n"),
          now
        });
      }
    }

    const collectedAt = alreadyCollected ?? now;
    preview = {
      orderId: row.order_id,
      vendorName: row.vendor_name,
      status: "collected",
      readyAt,
      expiresAt,
      collectedAt,
      itemCount: Number(row.item_count)
    };
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
  await drainQueuedEmails(now);
  return preview!;
}

async function ensurePickupGroup(client: PoolClient, input: {
  fulfilmentUuid: string;
  fulfilmentId: string;
  vendorUuid: string;
  vendorId: string;
  vendorName: string;
  fulfilmentStatus: string;
  now: number;
}): Promise<PickupRow> {
  const existing = await client.query<PickupRow>(`
    SELECT pg.public_id AS pickup_public_id,fo.id::text AS fulfilment_uuid,fo.public_id AS fulfilment_id,
           vb.id::text AS vendor_uuid,vb.public_id AS vendor_id,vb.trading_name AS vendor_name,fo.status::text AS status,
           pg.ready_at,pg.window_ends_at,pg.collected_at,pg.pickup_code_hash,pg.qr_token_hash
    FROM pickup_groups pg JOIN fulfilment_orders fo ON fo.id=pg.fulfilment_order_id JOIN vendor_businesses vb ON vb.id=fo.vendor_id
    WHERE pg.fulfilment_order_id=$1 FOR UPDATE OF pg
  `, [input.fulfilmentUuid]);
  if (existing.rowCount) {
    const row = existing.rows[0];
    const token = pickupToken(row.pickup_public_id, input.fulfilmentId);
    const code = pickupShortCode(row.pickup_public_id, input.fulfilmentId);
    const readyAt = row.ready_at ?? new Date(input.now);
    const windowEndsAt = row.window_ends_at ?? new Date(readyAt.getTime() + PICKUP_TTL_MS);
    if (!row.collected_at && (row.qr_token_hash !== hashProof(token) || row.pickup_code_hash !== hashProof(code) || !row.ready_at || !row.window_ends_at)) {
      await client.query(`UPDATE pickup_groups SET pickup_code_hash=$2,qr_token_hash=$3,ready_at=COALESCE(ready_at,$4),window_starts_at=COALESCE(window_starts_at,$4),window_ends_at=COALESCE(window_ends_at,$5) WHERE fulfilment_order_id=$1`, [input.fulfilmentUuid, hashProof(code), hashProof(token), readyAt, windowEndsAt]);
      return { ...row, pickup_code_hash: hashProof(code), qr_token_hash: hashProof(token), ready_at: readyAt, window_ends_at: windowEndsAt };
    }
    return row;
  }
  const pickupPublicId = `pickup_${randomUUID().replaceAll("-", "")}`;
  const token = pickupToken(pickupPublicId, input.fulfilmentId);
  const code = pickupShortCode(pickupPublicId, input.fulfilmentId);
  const readyAt = new Date(input.now);
  const windowEndsAt = new Date(input.now + PICKUP_TTL_MS);
  await client.query(`
    INSERT INTO pickup_groups(id,public_id,fulfilment_order_id,pickup_code_hash,qr_token_hash,ready_at,window_starts_at,window_ends_at)
    VALUES($1,$2,$3,$4,$5,$6,$6,$7)
  `, [randomUUID(), pickupPublicId, input.fulfilmentUuid, hashProof(code), hashProof(token), readyAt, windowEndsAt]);
  return {
    pickup_public_id: pickupPublicId,
    fulfilment_uuid: input.fulfilmentUuid,
    fulfilment_id: input.fulfilmentId,
    vendor_uuid: input.vendorUuid,
    vendor_id: input.vendorId,
    vendor_name: input.vendorName,
    status: input.fulfilmentStatus,
    ready_at: readyAt,
    window_ends_at: windowEndsAt,
    collected_at: null,
    pickup_code_hash: hashProof(code),
    qr_token_hash: hashProof(token)
  };
}

async function notifyCustomerState(client: PoolClient, input: {
  userUuid: string;
  orderId: string;
  fulfilmentId: string;
  state: string;
  title: string;
  inAppBody: string;
  emailBody: string;
  now: number;
}) {
  const payload = { orderId: input.orderId, fulfilmentId: input.fulfilmentId };
  await upsertNotification(client, {
    userUuid: input.userUuid,
    channel: "in_app",
    eventType: `order.${input.state}`,
    dedupeKey: `order:${input.orderId}:fulfilment:${input.fulfilmentId}:${input.state}:in_app`,
    title: input.title,
    body: input.inAppBody,
    payload,
    now: input.now
  });
  await upsertNotification(client, {
    userUuid: input.userUuid,
    channel: "email",
    eventType: `order.${input.state}`,
    dedupeKey: `order:${input.orderId}:fulfilment:${input.fulfilmentId}:${input.state}:email`,
    title: `${input.title} · ${input.orderId}`,
    body: input.emailBody,
    payload,
    now: input.now
  });
}

async function upsertNotification(client: PoolClient, input: {
  userUuid?: string;
  vendorUuid?: string;
  channel: "in_app" | "email";
  eventType: string;
  dedupeKey: string;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  now: number;
}) {
  const existing = await client.query<{ id: string; status: string }>("SELECT id::text AS id,status FROM notifications WHERE dedupe_key=$1 LIMIT 1 FOR UPDATE", [input.dedupeKey]);
  if (existing.rowCount) {
    if (input.channel === "in_app") {
      await client.query("UPDATE notifications SET title=$2,body=$3,payload=$4::jsonb,status='sent',sent_at=COALESCE(sent_at,$5),failed_at=NULL,last_delivery_error=NULL WHERE id=$1", [existing.rows[0].id, input.title, input.body, JSON.stringify(input.payload), new Date(input.now)]);
    } else if (existing.rows[0].status === "queued") {
      await client.query("UPDATE notifications SET title=$2,body=$3,payload=$4::jsonb WHERE id=$1", [existing.rows[0].id, input.title, input.body, JSON.stringify(input.payload)]);
    }
    return;
  }
  await client.query(`
    INSERT INTO notifications(id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,sent_at,created_at)
    VALUES($1,$2,$3,$4,$5,'transactional',$6,'order-lifecycle-v1','el',$7,$8,$9::jsonb,$10,$11,$12,$12)
  `, [
    randomUUID(), `notification_${randomUUID().replaceAll("-", "")}`,
    input.userUuid ?? null, input.vendorUuid ?? null, input.channel, input.eventType,
    input.title, input.body, JSON.stringify(input.payload), input.channel === "in_app" ? "sent" : "queued",
    input.dedupeKey, input.channel === "in_app" ? new Date(input.now) : null
  ]);
}

async function insertTimelineOnce(client: PoolClient, input: {
  orderUuid: string;
  fulfilmentUuid?: string;
  vendorUuid?: string;
  eventType: string;
  actorType: string;
  actorPublicId?: string;
  message: string;
  metadata: Record<string, unknown>;
  now: number;
}) {
  const existing = await client.query("SELECT 1 FROM order_timeline_events WHERE order_id=$1 AND event_type=$2 AND fulfilment_order_id IS NOT DISTINCT FROM $3::uuid LIMIT 1", [input.orderUuid, input.eventType, input.fulfilmentUuid ?? null]);
  if (existing.rowCount) return;
  await client.query(`
    INSERT INTO order_timeline_events(id,public_id,order_id,fulfilment_order_id,vendor_id,event_type,actor_type,actor_public_id,customer_visible,message,metadata,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,true,$9,$10::jsonb,$11)
  `, [randomUUID(), `ote_${randomUUID().replaceAll("-", "")}`, input.orderUuid, input.fulfilmentUuid ?? null, input.vendorUuid ?? null, input.eventType, input.actorType, input.actorPublicId ?? null, input.message, JSON.stringify(input.metadata), new Date(input.now)]);
}

async function finalizeOrderFromFulfilments(client: PoolClient, orderUuid: string, now: number) {
  const result = await client.query<{ open_count: number | string }>(`
    SELECT COUNT(*) FILTER (WHERE status NOT IN ('handed_over','delivered','rejected','cancelled')) AS open_count
    FROM fulfilment_orders WHERE order_id=$1
  `, [orderUuid]);
  const open = Number(result.rows[0]?.open_count ?? 0);
  await client.query("UPDATE customer_orders SET status=$2::order_status,updated_at=$3 WHERE id=$1 AND status NOT IN ('cancelled','refunded')", [orderUuid, open === 0 ? "fulfilled" : "partially_fulfilled", new Date(now)]);
}

async function drainQueuedEmails(now: number) {
  try {
    const service = getProductionPostgresRuntime().notifications;
    if (service) await service.runOnce(now, 50);
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "order_lifecycle.notification_drain_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

function pickupSigningKey(): Buffer {
  const source = process.env.BLS_PICKUP_SIGNING_SECRET?.trim() || process.env.BLS_AUTH_SECRET?.trim();
  if (!source || source.length < 32) throw new Error("BLS_PICKUP_SIGNING_SECRET or BLS_AUTH_SECRET (32+ chars) is required for pickup QR signing");
  return createHmac("sha256", source).update("kontamou:pickup-signing:v1").digest();
}

function pickupToken(pickupId: string, fulfilmentId: string): string {
  const signature = createHmac("sha256", pickupSigningKey()).update(`qr|${pickupId}|${fulfilmentId}`).digest("base64url");
  return `${pickupId}.${signature}`;
}

function pickupShortCode(pickupId: string, fulfilmentId: string): string {
  const digest = createHmac("sha256", pickupSigningKey()).update(`code|${pickupId}|${fulfilmentId}`).digest();
  return String(digest.readUInt32BE(0) % 1_000_000).padStart(6, "0");
}

function hashProof(value: string): string { return createHash("sha256").update(value).digest("hex"); }

function assertPickupProof(row: Pick<PickupRow, "pickup_public_id" | "fulfilment_id" | "qr_token_hash">, token: string) {
  const expectedToken = pickupToken(row.pickup_public_id, row.fulfilment_id);
  const expectedHash = Buffer.from(hashProof(expectedToken));
  const suppliedHash = Buffer.from(hashProof(token));
  const storedHash = Buffer.from(row.qr_token_hash);
  if (expectedHash.length !== suppliedHash.length || storedHash.length !== suppliedHash.length || !timingSafeEqual(expectedHash, suppliedHash) || !timingSafeEqual(storedHash, suppliedHash)) {
    throw new Error("Μη έγκυρο QR παραλαβής.");
  }
}

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
  const value = process.env.BLS_PUBLIC_BASE_URL?.trim() || process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://kontamou.site";
  return value.replace(/\/$/, "");
}

function fulfilmentLabel(value: string): string {
  if (value === "pickup") return "Παραλαβή από το κατάστημα";
  if (value === "local_delivery") return "Τοπική παράδοση";
  if (value === "shipping") return "Αποστολή";
  return value;
}

function euro(value: number | string): string {
  const minor = Number(value);
  return new Intl.NumberFormat("el-GR", { style: "currency", currency: "EUR" }).format(minor / 100);
}
