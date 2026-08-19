import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${field}`);
  return value;
}
function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}

export async function routeAuthorizedReturnToVendor(returnId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    const vendors = await tx.query<SqlRow>(`
      SELECT COUNT(DISTINCT ol.vendor_id)::int AS vendor_count,MIN(ol.vendor_id::text) AS vendor_uuid,MIN(vb.trading_name) AS vendor_name
      FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id JOIN vendor_businesses vb ON vb.id=ol.vendor_id
      WHERE r.public_id=$1`, [returnId]);
    if (!vendors.rowCount || integer(vendors.rows[0].vendor_count ?? 0, "vendor_count") !== 1) return;
    const vendorUuid = text(vendors.rows[0].vendor_uuid, "vendor_uuid");
    const vendorName = text(vendors.rows[0].vendor_name, "vendor_name");
    await tx.query(`UPDATE returns SET destination_type='vendor',destination_vendor_id=$2,
      destination_instructions=$3,updated_at=$4 WHERE public_id=$1 AND status='in_transit'`, [
      returnId, vendorUuid, `Παράδωσε το προϊόν στο συνεργαζόμενο κατάστημα ${vendorName} με τον κωδικό RMA. Το κατάστημα θα επιβεβαιώσει την παραλαβή και την κατάσταση του προϊόντος.`, new Date(now)
    ]);
  }, { isolation: "serializable" });
}

export async function vendorReturnIntakeAction(principal: SessionPrincipal, input: { returnId: string; action: "receive" | "inspect_sellable" | "inspect_blocked"; reason?: string; now?: number }): Promise<void> {
  if (!productionDatabaseConfigured()) throw new Error("Vendor return intake requires PostgreSQL runtime");
  if (!principal.vendorId) throw new Error("Vendor context is required");
  const now = input.now ?? Date.now();
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT r.id::text AS return_uuid,r.public_id,r.status::text,r.destination_type,r.destination_vendor_id::text AS destination_vendor_uuid,
             vb.id::text AS vendor_uuid,u.id::text AS actor_uuid
      FROM returns r JOIN vendor_businesses vb ON vb.public_id=$2 JOIN users u ON u.public_id=$3
      WHERE r.public_id=$1 AND r.destination_vendor_id=vb.id
        AND EXISTS(SELECT 1 FROM return_lines rl JOIN order_lines ol ON ol.id=rl.order_line_id WHERE rl.return_id=r.id AND ol.vendor_id=vb.id)
      FOR UPDATE OF r`, [input.returnId, principal.vendorId, principal.userId]);
    if (!found.rowCount) throw new Error("Vendor return access denied");
    const row = found.rows[0];
    if (text(row.destination_type, "destination_type") !== "vendor") throw new Error("This return is not routed to the vendor");
    const returnUuid = text(row.return_uuid, "return_uuid");
    const actorUuid = text(row.actor_uuid, "actor_uuid");
    const current = text(row.status, "return.status");

    if (input.action === "receive") {
      if (current !== "in_transit") throw new Error(`Return cannot be received from ${current}`);
      await tx.query(`UPDATE returns SET status='received',updated_at=$2 WHERE id=$1`, [returnUuid, new Date(now)]);
      await tx.query(`INSERT INTO return_custody_events(id,public_id,return_id,from_party,to_party,actor_user_id,actor_public_id,note,occurred_at)
        VALUES($1,$2,$3,'customer','vendor',$4,$5,$6,$7)`, [randomUUID(), `custody_${randomUUID().replaceAll("-", "").slice(0, 24)}`, returnUuid, actorUuid, principal.userId, input.reason?.trim() || "Vendor confirmed physical receipt", new Date(now)]);
      return;
    }

    if (current !== "received") throw new Error(`Return cannot be inspected from ${current}`);
    const disposition = input.action === "inspect_sellable" ? "sellable" : "blocked";
    const findings = input.reason?.trim() || (disposition === "sellable" ? "Vendor inspection: product is sellable" : "Vendor inspection: product must remain blocked");
    await tx.query(`UPDATE returns SET status='inspected',inspection_findings=$2,updated_at=$3 WHERE id=$1`, [returnUuid, findings, new Date(now)]);
    await tx.query(`UPDATE return_lines SET inspection_result=$2::jsonb WHERE return_id=$1`, [returnUuid, JSON.stringify({ disposition, inspectedAt: now, actorId: principal.userId, source: "vendor" })]);
  }, { isolation: "serializable" });
}

export async function reconcileRefundedReturnInventory(returnId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    const rows = await tx.query<SqlRow>(`
      SELECT r.id::text AS return_uuid,r.public_id,r.status::text,rl.quantity,rl.inspection_result,ol.assigned_offer_id::text AS offer_uuid
      FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
      WHERE r.public_id=$1 FOR UPDATE OF r`, [returnId]);
    if (!rows.rowCount || text(rows.rows[0].status, "return.status") !== "refunded") return;
    for (const row of rows.rows) {
      const inspection = typeof row.inspection_result === "string" ? JSON.parse(row.inspection_result) as Record<string, unknown> : (row.inspection_result ?? {}) as Record<string, unknown>;
      if (inspection.disposition !== "sellable") continue;
      const offerUuid = text(row.offer_uuid, "offer_uuid");
      const quantity = integer(row.quantity, "return.quantity");
      const movement = await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,metadata,created_at)
        SELECT $1,$2,$3,'return_restock',$4,'return_refund',$5::jsonb,$6
        WHERE NOT EXISTS(SELECT 1 FROM inventory_movements WHERE offer_id=$3 AND movement_type='return_restock' AND metadata->>'returnId'=$7)`, [
        randomUUID(), `im_${randomUUID().replaceAll("-", "").slice(0, 24)}`, offerUuid, quantity, JSON.stringify({ returnId, returnUuid: text(row.return_uuid, "return_uuid") }), new Date(now), returnId
      ]);
      if (movement.rowCount) await tx.query(`UPDATE inventory_balances SET on_hand=on_hand+$2,updated_at=$3 WHERE offer_id=$1`, [offerUuid, quantity, new Date(now)]);
    }
  }, { isolation: "serializable" });
}
