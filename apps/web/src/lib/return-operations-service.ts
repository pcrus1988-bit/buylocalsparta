import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function text(value: unknown, field: string): string {
  if (typeof value !== "string" || !value) throw new Error(`Invalid ${field}`);
  return value;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}
function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Invalid ${field}`);
  return parsed;
}
function proportionalAllocation(totalMinor: number, quantity: number, totalQuantity: number): number {
  if (quantity <= 0 || totalMinor <= 0) return 0;
  if (quantity >= totalQuantity) return totalMinor;
  return Math.floor((totalMinor * quantity) / totalQuantity);
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
      SELECT r.id::text AS return_uuid,r.public_id,r.status::text,rl.quantity,rl.order_line_id::text AS order_line_uuid,rl.inspection_result,ol.assigned_offer_id::text AS offer_uuid
      FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
      WHERE r.public_id=$1 FOR UPDATE OF r`, [returnId]);
    if (!rows.rowCount || text(rows.rows[0].status, "return.status") !== "refunded") return;
    for (const row of rows.rows) {
      const inspection = typeof row.inspection_result === "string" ? JSON.parse(row.inspection_result) as Record<string, unknown> : (row.inspection_result ?? {}) as Record<string, unknown>;
      if (inspection.disposition !== "sellable") continue;
      const offerUuid = text(row.offer_uuid, "offer_uuid");
      const orderLineUuid = text(row.order_line_uuid, "order_line_uuid");
      const quantity = integer(row.quantity, "return.quantity");
      const movement = await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,metadata,created_at)
        SELECT $1,$2,$3,'return_restock',$4,'return_refund',$5::jsonb,$6
        WHERE NOT EXISTS(SELECT 1 FROM inventory_movements WHERE offer_id=$3 AND movement_type='return_restock' AND metadata->>'returnId'=$7 AND metadata->>'orderLineId'=$8)`, [
        randomUUID(), `im_${randomUUID().replaceAll("-", "").slice(0, 24)}`, offerUuid, quantity, JSON.stringify({ returnId, returnUuid: text(row.return_uuid, "return_uuid"), orderLineId: orderLineUuid }), new Date(now), returnId, orderLineUuid
      ]);
      if (movement.rowCount) await tx.query(`UPDATE inventory_balances SET on_hand=on_hand+$2,updated_at=$3 WHERE offer_id=$1`, [offerUuid, quantity, new Date(now)]);
    }
  }, { isolation: "serializable" });
}

export async function reconcileRefundedReturnFinance(returnId: string, actorUserId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ actorUserId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const already = await tx.query<SqlRow>(`SELECT 1 AS hit FROM audit_events WHERE action='return.vendor_finance.reconciled' AND entity_type='return' AND entity_id=$1 LIMIT 1`, [returnId]);
    if (already.rowCount) return;

    const rows = await tx.query<SqlRow>(`
      SELECT r.id::text AS return_uuid,r.status::text AS return_status,o.id::text AS order_uuid,o.public_id AS order_public_id,
             rl.quantity AS return_quantity,ol.id::text AS order_line_uuid,ol.public_id AS order_line_public_id,ol.quantity AS line_quantity,
             ol.refunded_quantity,ol.vendor_proceeds_minor,ol.vendor_id::text AS vendor_uuid,
             p.id::text AS procurement_uuid,p.public_id AS procurement_public_id,p.status::text AS procurement_status,
             sl.id::text AS settlement_line_uuid,sb.id::text AS settlement_batch_uuid,sb.status::text AS settlement_batch_status
      FROM returns r
      JOIN customer_orders o ON o.id=r.order_id
      JOIN return_lines rl ON rl.return_id=r.id
      JOIN order_lines ol ON ol.id=rl.order_line_id
      LEFT JOIN fulfilment_order_lines fol ON fol.order_line_id=ol.id
      LEFT JOIN LATERAL (
        SELECT px.* FROM procurements px
        WHERE px.order_id=o.id AND px.vendor_id=ol.vendor_id
          AND (px.fulfilment_order_id=fol.fulfilment_order_id OR px.fulfilment_order_id IS NULL)
        ORDER BY CASE WHEN px.fulfilment_order_id=fol.fulfilment_order_id THEN 0 ELSE 1 END,px.created_at DESC
        LIMIT 1
      ) p ON true
      LEFT JOIN settlement_lines sl ON sl.procurement_id=p.id
      LEFT JOIN settlement_batches sb ON sb.id=sl.batch_id
      WHERE r.public_id=$1
      ORDER BY ol.public_id`, [returnId]);
    if (!rows.rowCount || text(rows.rows[0].return_status, "return.status") !== "refunded") return;

    let adjustedBeforeSettlement = 0;
    let vendorReceivable = 0;
    const missingProcurements: string[] = [];
    for (const row of rows.rows) {
      const procurementUuid = optionalText(row.procurement_uuid);
      if (!procurementUuid) {
        missingProcurements.push(text(row.order_line_public_id, "order_line.public_id"));
        continue;
      }
      const totalQuantity = integer(row.line_quantity, "line.quantity");
      const returnedQuantity = integer(row.return_quantity, "return.quantity");
      const refundedQuantity = integer(row.refunded_quantity, "refunded_quantity");
      const priorRefunded = Math.max(0, refundedQuantity - returnedQuantity);
      const totalVendorProceeds = integer(row.vendor_proceeds_minor ?? 0, "vendor_proceeds_minor");
      const before = proportionalAllocation(totalVendorProceeds, priorRefunded, totalQuantity);
      const after = proportionalAllocation(totalVendorProceeds, Math.min(totalQuantity, priorRefunded + returnedQuantity), totalQuantity);
      const recoveryMinor = Math.max(0, after - before);
      if (recoveryMinor <= 0) continue;

      const procurementStatus = text(row.procurement_status, "procurement.status");
      const batchStatus = optionalText(row.settlement_batch_status);
      if (procurementStatus === "settled" || batchStatus === "paid") {
        await tx.query(`UPDATE procurements SET post_settlement_return_receivable_minor=post_settlement_return_receivable_minor+$2,updated_at=$3 WHERE id=$1`, [procurementUuid, recoveryMinor, new Date(now)]);
        vendorReceivable += recoveryMinor;
        continue;
      }
      if (procurementStatus === "reversed") continue;

      await tx.query(`UPDATE procurements SET adjustment_minor=adjustment_minor-$2,updated_at=$3 WHERE id=$1`, [procurementUuid, recoveryMinor, new Date(now)]);
      adjustedBeforeSettlement += recoveryMinor;

      const settlementLineUuid = optionalText(row.settlement_line_uuid);
      if (settlementLineUuid && batchStatus !== "paid") {
        await tx.query(`UPDATE settlement_lines SET adjustment_minor=adjustment_minor-$2,final_minor=GREATEST(0,final_minor-$2),reconciliation_status='pending' WHERE id=$1`, [settlementLineUuid, recoveryMinor]);
        if (batchStatus === "approved") {
          await tx.query(`UPDATE settlement_batches SET status='approval_required',approved_by=NULL,approved_at=NULL WHERE id=$1`, [text(row.settlement_batch_uuid, "settlement_batch_uuid")]);
        }
      }
    }

    const actor = await tx.query<SqlRow>(`SELECT id::text AS actor_uuid FROM users WHERE public_id=$1 OR id::text=$1`, [actorUserId]);
    if (!actor.rowCount) throw new Error("Admin actor not found for return finance reconciliation");
    await tx.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,'platform_finance','return.vendor_finance.reconciled','return',$4,$5,$6::jsonb,$7)`, [
      randomUUID(), `audit_${randomUUID().replaceAll("-", "").slice(0, 24)}`, text(actor.rows[0].actor_uuid, "actor_uuid"), returnId,
      "Customer refund vendor settlement reconciliation",
      JSON.stringify({ adjustedBeforeSettlementMinor: adjustedBeforeSettlement, postSettlementVendorReceivableMinor: vendorReceivable, missingProcurements }),
      new Date(now)
    ]);
  }, { isolation: "serializable" });
}
