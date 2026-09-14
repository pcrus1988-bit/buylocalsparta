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
      SELECT r.id::text AS return_uuid,r.public_id,r.status::text,rl.quantity,rl.order_line_id::text AS order_line_uuid,rl.inspection_result,
             ol.assigned_offer_id::text AS offer_uuid,vo.public_id AS offer_public_id,vo.market_id::text AS market_uuid,vo.vendor_id::text AS vendor_uuid,
             vo.location_id::text AS location_uuid,vo.vendor_sku,vo.source_gtin,vo.supplier_unit_price_minor,
             vo.currency::text AS offer_currency,vo.supplier_tax_rate_bps,vo.cost_ceiling_minor,vo.lead_time_minutes,vo.fulfilment_modes,vo.advice_capabilities,
             vo.source_payload,vo.customer_price_minor,
             cv.public_id AS canonical_public_id,cv.family_id::text AS family_uuid,cv.brand_id::text AS brand_uuid,
             cv.category_id::text AS category_uuid,cv.slug AS canonical_slug,cv.gtin,cv.mpn,cv.model,cv.variant_attributes,cv.warranty_basis,
             cv.platform_price_minor,cv.currency::text AS canonical_currency,cv.tax_rate_bps,cv.active AS canonical_active,cv.suppressed AS canonical_suppressed,
             cv.recalled AS canonical_recalled,cv.commerce_channel
      FROM returns r
      JOIN return_lines rl ON rl.return_id=r.id
      JOIN order_lines ol ON ol.id=rl.order_line_id
      JOIN vendor_offers vo ON vo.id=ol.assigned_offer_id
      JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
      WHERE r.public_id=$1 FOR UPDATE OF r`, [returnId]);
    if (!rows.rowCount || text(rows.rows[0].status, "return.status") !== "refunded") return;

    for (const row of rows.rows) {
      const inspection = typeof row.inspection_result === "string" ? JSON.parse(row.inspection_result) as Record<string, unknown> : (row.inspection_result ?? {}) as Record<string, unknown>;
      if (inspection.disposition !== "sellable") continue;

      const returnUuid = text(row.return_uuid, "return_uuid");
      const orderLineUuid = text(row.order_line_uuid, "order_line_uuid");
      const quantity = integer(row.quantity, "return.quantity");
      let restockOfferUuid = text(row.offer_uuid, "offer_uuid");

      if (text(row.commerce_channel, "canonical.commerce_channel") === "normal") {
        const identitySuffix = `${returnUuid.replaceAll("-", "").slice(0, 12)}_${orderLineUuid.replaceAll("-", "").slice(0, 12)}`;
        const bazaarCanonicalPublicId = `bazaar_return_${identitySuffix}`;
        const bazaarOfferPublicId = `offer_bazaar_return_${identitySuffix}`;
        const bazaarSlug = `${text(row.canonical_slug, "canonical.slug")}-return-${identitySuffix}`;
        const bazaarVendorSku = `${text(row.vendor_sku, "vendor_sku")}-RETURN-${identitySuffix}`;

        await tx.query(`
          INSERT INTO canonical_variants(
            public_id,market_id,family_id,brand_id,category_id,slug,gtin,mpn,model,condition,variant_attributes,warranty_basis,
            platform_price_minor,currency,tax_rate_bps,active,suppressed,recalled,commerce_channel,bazaar_source,price_updated_at,updated_at
          ) VALUES(
            $1,$2,$3,$4,$5,$6,$7,$8,$9,'open_box',$10::jsonb,$11,$12,$13,$14,$15,$16,$17,'bazaar','customer_return',$18,$18
          )
          ON CONFLICT (public_id) DO NOTHING`, [
          bazaarCanonicalPublicId,text(row.market_uuid,"market_uuid"),optionalText(row.family_uuid) ?? null,optionalText(row.brand_uuid) ?? null,
          optionalText(row.category_uuid) ?? null,bazaarSlug,optionalText(row.gtin) ?? null,optionalText(row.mpn) ?? null,optionalText(row.model) ?? null,
          JSON.stringify({ ...((row.variant_attributes ?? {}) as Record<string, unknown>), bazaarProvenance: { source: "customer_return", returnId, returnUuid, orderLineId: orderLineUuid, originalCanonicalId: text(row.canonical_public_id, "canonical_public_id") } }),
          optionalText(row.warranty_basis) ?? null,integer(row.platform_price_minor, "platform_price_minor"),text(row.canonical_currency, "canonical_currency"),
          integer(row.tax_rate_bps, "tax_rate_bps"),Boolean(row.canonical_active),Boolean(row.canonical_suppressed),Boolean(row.canonical_recalled),new Date(now)
        ]);

        const bazaarCanonical = await tx.query<SqlRow>(`
          SELECT id::text AS canonical_uuid,commerce_channel,bazaar_source,condition
          FROM canonical_variants WHERE public_id=$1 FOR UPDATE`, [bazaarCanonicalPublicId]);
        if (!bazaarCanonical.rowCount
          || text(bazaarCanonical.rows[0].commerce_channel, "bazaar.commerce_channel") !== "bazaar"
          || text(bazaarCanonical.rows[0].bazaar_source, "bazaar.bazaar_source") !== "customer_return"
          || text(bazaarCanonical.rows[0].condition, "bazaar.condition") !== "open_box") {
          throw new Error("Customer-return BAZAAR canonical identity is invalid");
        }
        const bazaarCanonicalUuid = text(bazaarCanonical.rows[0].canonical_uuid, "bazaar.canonical_uuid");

        await tx.query(`
          INSERT INTO vendor_offers(
            public_id,market_id,vendor_id,location_id,canonical_variant_id,vendor_sku,source_gtin,status,supplier_unit_price_minor,currency,
            supplier_tax_rate_bps,cost_ceiling_minor,lead_time_minutes,fulfilment_modes,advice_capabilities,source_payload,approved_at,
            customer_price_minor,merchant_visible,merchant_pause_active,updated_at
          ) VALUES(
            $1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10,$11,$12,$13,$14::jsonb,$15::jsonb,$16,$17,true,false,$16
          )
          ON CONFLICT (public_id) DO NOTHING`, [
          bazaarOfferPublicId,text(row.market_uuid,"market_uuid"),text(row.vendor_uuid,"vendor_uuid"),text(row.location_uuid,"location_uuid"),bazaarCanonicalUuid,
          bazaarVendorSku,optionalText(row.source_gtin) ?? null,integer(row.supplier_unit_price_minor,"supplier_unit_price_minor"),text(row.offer_currency,"offer_currency"),
          integer(row.supplier_tax_rate_bps,"supplier_tax_rate_bps"),row.cost_ceiling_minor == null ? null : integer(row.cost_ceiling_minor,"cost_ceiling_minor"),
          row.lead_time_minutes == null ? null : integer(row.lead_time_minutes,"lead_time_minutes"),row.fulfilment_modes,
          JSON.stringify((row.advice_capabilities ?? {}) as Record<string, unknown>),
          JSON.stringify({ ...((row.source_payload ?? {}) as Record<string, unknown>), bazaarSource: "customer_return", returnId, returnUuid, orderLineId: orderLineUuid, originalOfferId: text(row.offer_public_id,"offer_public_id") }),
          new Date(now),row.customer_price_minor == null ? null : integer(row.customer_price_minor,"customer_price_minor")
        ]);

        const bazaarOffer = await tx.query<SqlRow>(`
          SELECT vo.id::text AS offer_uuid,cv.commerce_channel,cv.bazaar_source
          FROM vendor_offers vo JOIN canonical_variants cv ON cv.id=vo.canonical_variant_id
          WHERE vo.public_id=$1 FOR UPDATE OF vo`, [bazaarOfferPublicId]);
        if (!bazaarOffer.rowCount
          || text(bazaarOffer.rows[0].commerce_channel, "bazaar_offer.commerce_channel") !== "bazaar"
          || text(bazaarOffer.rows[0].bazaar_source, "bazaar_offer.bazaar_source") !== "customer_return") {
          throw new Error("Customer-return BAZAAR offer identity is invalid");
        }
        restockOfferUuid = text(bazaarOffer.rows[0].offer_uuid, "bazaar_offer.offer_uuid");
        await tx.query(`
          INSERT INTO inventory_balances(offer_id,on_hand,active_reservations,safety_stock,blocked,source,source_confidence,updated_at,stock_confirmed_at,freshness_ttl_seconds,freshness_status)
          VALUES($1,0,0,0,0,'customer_return','merchant_confirmed',$2,$2,86400,'fresh')
          ON CONFLICT (offer_id) DO NOTHING`, [restockOfferUuid,new Date(now)]);
      }

      const movement = await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,source,metadata,created_at)
        SELECT $1,$2,$3,'return_restock',$4,'return_refund',$5::jsonb,$6
        WHERE NOT EXISTS(SELECT 1 FROM inventory_movements WHERE offer_id=$3 AND movement_type='return_restock' AND metadata->>'returnId'=$7 AND metadata->>'orderLineId'=$8)`, [
        randomUUID(), `im_${randomUUID().replaceAll("-", "").slice(0, 24)}`, restockOfferUuid, quantity,
        JSON.stringify({ returnId, returnUuid, orderLineId: orderLineUuid, originalOfferId: text(row.offer_public_id,"offer_public_id"), commerceChannel: text(row.commerce_channel,"commerce_channel") === "normal" ? "bazaar" : "bazaar_existing" }),
        new Date(now), returnId, orderLineUuid
      ]);
      if (movement.rowCount) await tx.query(`UPDATE inventory_balances SET on_hand=on_hand+$2,stock_confirmed_at=$3,freshness_status='fresh',updated_at=$3 WHERE offer_id=$1`, [restockOfferUuid, quantity, new Date(now)]);
    }
  }, { isolation: "serializable" });
}

export async function reconcileRefundedReturnFinance(returnId: string, actorUserId: string, now = Date.now()): Promise<void> {
  if (!productionDatabaseConfigured()) return;
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool);
  await uow.withTransaction({ actorUserId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const actor = await tx.query<SqlRow>(`SELECT id::text AS actor_uuid,public_id AS actor_public_id FROM users WHERE public_id=$1 OR id::text=$1`, [actorUserId]);
    if (!actor.rowCount) throw new Error("Admin actor not found for return finance reconciliation");
    const actorUuid = text(actor.rows[0].actor_uuid, "actor_uuid");
    const actorPublicId = text(actor.rows[0].actor_public_id, "actor_public_id");

    const already = await tx.query<SqlRow>(`SELECT 1 AS hit FROM audit_events WHERE action='return.vendor_finance.reconciled' AND entity_type='return' AND entity_id=$1 LIMIT 1`, [returnId]);
    if (already.rowCount) {
      const refundEvidence = await tx.query<SqlRow>(`
        SELECT rf.public_id AS refund_id,rf.provider_refund_id,rf.amount_minor
        FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN refunds rf ON rf.id=rl.refund_id
        WHERE r.public_id=$1 AND r.status='refunded' ORDER BY rf.created_at DESC LIMIT 1`, [returnId]);
      if (refundEvidence.rowCount) {
        const refund = refundEvidence.rows[0];
        await tx.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
          SELECT $1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,'platform_finance','return.refund.executed','return',$5,$6,$7::jsonb,$8
          WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE action='return.refund.executed' AND entity_type='return' AND entity_id=$5)`, [
          randomUUID(), `audit_${randomUUID().replaceAll("-", "").slice(0, 24)}`, actorUuid, actorPublicId, returnId,
          `Mollie refund ${optionalText(refund.provider_refund_id) ?? text(refund.refund_id, "refund_id")}`,
          JSON.stringify({ refundId: text(refund.refund_id, "refund_id"), amountMinor: integer(refund.amount_minor, "refund.amount_minor"), providerRefundId: optionalText(refund.provider_refund_id) }),
          new Date(now)
        ]);
      }
      return;
    }

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

    const refundEvidence = await tx.query<SqlRow>(`
      SELECT rf.public_id AS refund_id,rf.provider_refund_id,rf.amount_minor
      FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN refunds rf ON rf.id=rl.refund_id
      WHERE r.public_id=$1 ORDER BY rf.created_at DESC LIMIT 1`, [returnId]);
    if (!refundEvidence.rowCount) throw new Error("Completed return refund evidence not found");
    const refund = refundEvidence.rows[0];

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

    await tx.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
      SELECT $1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,'platform_finance','return.refund.executed','return',$5,$6,$7::jsonb,$8
      WHERE NOT EXISTS(SELECT 1 FROM audit_events WHERE action='return.refund.executed' AND entity_type='return' AND entity_id=$5)`, [
      randomUUID(), `audit_${randomUUID().replaceAll("-", "").slice(0, 24)}`, actorUuid, actorPublicId, returnId,
      `Mollie refund ${optionalText(refund.provider_refund_id) ?? text(refund.refund_id, "refund_id")}`,
      JSON.stringify({ refundId: text(refund.refund_id, "refund_id"), amountMinor: integer(refund.amount_minor, "refund.amount_minor"), providerRefundId: optionalText(refund.provider_refund_id) }),
      new Date(now)
    ]);
    await tx.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,'platform_finance','return.vendor_finance.reconciled','return',$5,$6,$7::jsonb,$8)`, [
      randomUUID(), `audit_${randomUUID().replaceAll("-", "").slice(0, 24)}`, actorUuid, actorPublicId, returnId,
      "Customer refund vendor settlement reconciliation",
      JSON.stringify({ adjustedBeforeSettlementMinor: adjustedBeforeSettlement, postSettlementVendorReceivableMinor: vendorReceivable, missingProcurements }),
      new Date(now)
    ]);
  }, { isolation: "serializable" });
}
