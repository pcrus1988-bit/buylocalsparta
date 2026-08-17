import { randomUUID } from "node:crypto";
import {
  PostgresUnitOfWork,
  defaultCustomerRetentionSnapshot,
  formatMoney,
  money,
  type CategoryCommerceMode,
  type ContentPageType,
  type PostgresPersistenceBundle,
  type PrivacyRequest,
  type SessionPrincipal,
  type SqlExecutor,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";
import { platformScope } from "./admin-auth.ts";
import type { PostgresAdminOperationsService } from "./admin-operations.ts";

const DAY = 24 * 60 * 60 * 1000;

function text(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Database field ${field} is not a string`);
  return value;
}
function optionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}
function integer(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error(`Database field ${field} is not a safe integer`);
  return parsed;
}
function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}
function epoch(value: unknown, field: string): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error(`Database field ${field} is not a timestamp`);
  return parsed;
}
function jsonObject(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch { return {}; }
  }
  return typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function jsonArray(value: unknown): readonly unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
  }
  return [];
}
function id(prefix: string): string { return `${prefix}_${randomUUID().replaceAll("-", "").slice(0, 24)}`; }
function cleanSlug(value: string): string {
  const slug = value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 100);
  if (!slug) throw new Error("A valid content slug is required");
  return slug;
}

export class PostgresAdminGovernanceService {
  readonly #uow: PostgresUnitOfWork;
  readonly #persistence: PostgresPersistenceBundle;
  readonly #adminOperations: PostgresAdminOperationsService;

  constructor(pool: SqlPool, persistence: PostgresPersistenceBundle, adminOperations: PostgresAdminOperationsService) {
    this.#uow = new PostgresUnitOfWork(pool);
    this.#persistence = persistence;
    this.#adminOperations = adminOperations;
  }

  async ordersReturnsWorkspace(principal: SessionPrincipal) {
    return this.#uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const orderRows = await tx.query<SqlRow>(`
        SELECT o.id::text AS order_uuid,o.public_id,u.public_id AS customer_public_id,o.status,o.fulfilment_preference,o.total_minor,o.currency,o.created_at
        FROM customer_orders o LEFT JOIN users u ON u.id=o.user_id
        JOIN markets m ON m.id=o.market_id WHERE m.code='sparta'
        ORDER BY o.created_at DESC LIMIT 250`);
      const orders: Array<{
        id: string;
        customerId: string | undefined;
        status: string;
        createdAt: number;
        fulfilmentMode: string;
        total: string;
        lines: Array<{ id: string; title: string; vendorId: string; quantity: number; fulfilledQuantity: number; refundedQuantity: number; status: string }>;
        fulfilments: Array<{ id: string; vendorId: string; status: string; lineIds: string[] }>;
        returns: Array<{ id: string; status: string; reason: string; quantity: number; requestedRemedy: string | undefined }>;
      }> = [];
      for (const order of orderRows.rows) {
        const orderUuid = text(order.order_uuid, "order_uuid");
        const [lines, fulfilments, returns] = await Promise.all([
          tx.query<SqlRow>(`SELECT ol.public_id,COALESCE(ol.product_snapshot->>'title',cv.slug,'Product') AS title,v.public_id AS vendor_public_id,ol.quantity,ol.fulfilled_quantity,ol.refunded_quantity,ol.status
            FROM order_lines ol JOIN vendor_businesses v ON v.id=ol.vendor_id LEFT JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
            WHERE ol.order_id=$1 ORDER BY ol.created_at`, [orderUuid]),
          tx.query<SqlRow>(`SELECT fo.public_id,v.public_id AS vendor_public_id,fo.status,array_agg(ol.public_id ORDER BY ol.public_id) AS line_ids
            FROM fulfilment_orders fo JOIN vendor_businesses v ON v.id=fo.vendor_id
            LEFT JOIN fulfilment_order_lines fol ON fol.fulfilment_order_id=fo.id LEFT JOIN order_lines ol ON ol.id=fol.order_line_id
            WHERE fo.order_id=$1 GROUP BY fo.id,v.public_id ORDER BY fo.created_at`, [orderUuid]),
          tx.query<SqlRow>(`SELECT r.public_id,r.status,r.reason_type,COALESCE(sum(rl.quantity),0)::int AS quantity,r.requested_remedy
            FROM returns r LEFT JOIN return_lines rl ON rl.return_id=r.id WHERE r.order_id=$1 GROUP BY r.id ORDER BY r.created_at DESC`, [orderUuid])
        ]);
        orders.push({
          id: text(order.public_id, "order.public_id"),
          customerId: optionalText(order.customer_public_id),
          status: text(order.status, "order.status"),
          createdAt: epoch(order.created_at, "order.created_at"),
          fulfilmentMode: text(order.fulfilment_preference, "order.fulfilment_preference"),
          total: formatMoney(money(integer(order.total_minor, "order.total_minor"))),
          lines: lines.rows.map((line) => ({ id:text(line.public_id,"line.public_id"), title:text(line.title,"line.title"), vendorId:text(line.vendor_public_id,"line.vendor_public_id"), quantity:integer(line.quantity,"line.quantity"), fulfilledQuantity:integer(line.fulfilled_quantity,"line.fulfilled_quantity"), refundedQuantity:integer(line.refunded_quantity,"line.refunded_quantity"), status:text(line.status,"line.status") })),
          fulfilments: fulfilments.rows.map((item) => ({ id:text(item.public_id,"fulfilment.public_id"), vendorId:text(item.vendor_public_id,"fulfilment.vendor_public_id"), status:text(item.status,"fulfilment.status"), lineIds:jsonArray(item.line_ids).map(String) })),
          returns: returns.rows.map((item) => ({ id:text(item.public_id,"return.public_id"), status:text(item.status,"return.status"), reason:text(item.reason_type,"return.reason_type"), quantity:integer(item.quantity,"return.quantity"), requestedRemedy:optionalText(item.requested_remedy) }))
        });
      }
      const returnRows = await tx.query<SqlRow>(`
        SELECT r.id::text AS return_uuid,r.public_id,o.public_id AS order_public_id,u.public_id AS customer_public_id,v.public_id AS vendor_public_id,
               cv.public_id AS canonical_public_id,COALESCE(sum(rl.quantity),0)::int AS quantity,r.reason_type,r.source,r.status,r.requested_remedy,r.approved_remedy,
               r.eligibility_state,r.eligibility_basis,r.eligibility_reason,r.eligibility_expires_at,r.rma_code,r.return_by_at,r.return_cost_payer,r.destination_type,
               r.destination_instructions,r.carrier,r.tracking_number,r.inspection_findings,r.created_at
        FROM returns r JOIN customer_orders o ON o.id=r.order_id LEFT JOIN users u ON u.id=r.customer_user_id
        LEFT JOIN return_lines rl ON rl.return_id=r.id LEFT JOIN order_lines ol ON ol.id=rl.order_line_id LEFT JOIN vendor_businesses v ON v.id=ol.vendor_id
        LEFT JOIN canonical_variants cv ON cv.id=ol.canonical_variant_id
        GROUP BY r.id,o.public_id,u.public_id,v.public_id,cv.public_id ORDER BY r.created_at DESC LIMIT 250`);
      const returns = returnRows.rows.map((row) => ({
        id:text(row.public_id,"return.public_id"), orderId:text(row.order_public_id,"return.order_public_id"), customerId:optionalText(row.customer_public_id), vendorId:optionalText(row.vendor_public_id) ?? "platform", canonicalVariantId:optionalText(row.canonical_public_id),
        quantity:integer(row.quantity,"return.quantity"), reason:text(row.reason_type,"return.reason_type"), source:text(row.source,"return.source"), status:text(row.status,"return.status"), requestedRemedy:optionalText(row.requested_remedy), approvedRemedy:optionalText(row.approved_remedy),
        eligibility:{ state:text(row.eligibility_state,"return.eligibility_state"), basis:text(row.eligibility_basis,"return.eligibility_basis"), reason:optionalText(row.eligibility_reason), expiresAt:row.eligibility_expires_at ? epoch(row.eligibility_expires_at,"return.eligibility_expires_at") : undefined },
        authorization: row.rma_code ? { rmaCode:text(row.rma_code,"return.rma_code"), returnByAt:row.return_by_at?epoch(row.return_by_at,"return.return_by_at"):undefined, returnCostPayer:optionalText(row.return_cost_payer), destinationType:optionalText(row.destination_type), instructions:optionalText(row.destination_instructions), carrier:optionalText(row.carrier), trackingNumber:optionalText(row.tracking_number) } : undefined,
        disposition: row.inspection_findings ? { findings:text(row.inspection_findings,"return.inspection_findings") } : undefined,
        requestedAt:epoch(row.created_at,"return.created_at"), audit:[]
      }));
      return { csrfToken: principal.csrfToken, orders, returns };
    }, { readOnly: true });
  }

  async cancelOrder(principal: SessionPrincipal, input: { orderId: string; reason: string; now?: number }) {
    const reason = input.reason.trim();
    if (reason.length < 5) throw new Error("Cancellation requires a meaningful reason");
    const now = input.now ?? Date.now();
    const result = await this.#uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const order = await tx.query<SqlRow>(`SELECT id::text AS order_uuid,public_id,status FROM customer_orders WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [input.orderId]);
      if (!order.rowCount) throw new Error("Order not found");
      const row = order.rows[0];
      const status = text(row.status,"order.status");
      if (["cancelled","completed","fulfilled","refunded"].includes(status)) throw new Error(`Order cannot be cancelled from ${status}`);
      const orderUuid = text(row.order_uuid,"order_uuid");
      const handed = await tx.query<SqlRow>(`SELECT 1 AS hit FROM fulfilment_orders WHERE order_id=$1 AND status IN ('handed_over','shipped','delivered') LIMIT 1`, [orderUuid]);
      if (handed.rowCount) throw new Error("Order has already entered physical handover; use the returns workflow");
      const fulfilled = await tx.query<SqlRow>(`SELECT 1 AS hit FROM order_lines WHERE order_id=$1 AND (fulfilled_quantity>refunded_quantity OR status='fulfilled') LIMIT 1`, [orderUuid]);
      if (fulfilled.rowCount) throw new Error("Fulfilled items must use the return workflow");
      const actor = await this.#userUuid(tx, principal.userId);
      const reservations = await tx.query<SqlRow>(`SELECT sr.id::text AS reservation_uuid FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='active'`, [orderUuid]);
      for (const reservation of reservations.rows) await tx.query(`SELECT release_stock_reservation($1::uuid,$2,$3,$4::uuid)`, [text(reservation.reservation_uuid,"reservation_uuid"), new Date(now), "platform_cancellation", actor]);
      const consumed = await tx.query<SqlRow>(`SELECT sr.id::text AS reservation_uuid,sr.offer_id::text AS offer_uuid,sr.quantity FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='consumed'`,[orderUuid]);
      for(const reservation of consumed.rows){const reservationUuid=text(reservation.reservation_uuid,"reservation_uuid"),offerUuid=text(reservation.offer_uuid,"offer_uuid"),quantity=integer(reservation.quantity,"quantity");const restored=await tx.query(`INSERT INTO inventory_movements(id,public_id,offer_id,movement_type,quantity_delta,reservation_id,source,actor_id,metadata,created_at) SELECT gen_random_uuid(),$1,$2,'cancellation_restore',$3,$4,'platform_cancellation',$5,$6::jsonb,$7 WHERE NOT EXISTS(SELECT 1 FROM inventory_movements WHERE reservation_id=$4 AND movement_type='cancellation_restore')`,[id("im"),offerUuid,quantity,reservationUuid,actor,JSON.stringify({orderId:input.orderId}),new Date(now)]);if(restored.rowCount)await tx.query(`UPDATE inventory_balances SET on_hand=on_hand+$2,updated_at=$3 WHERE offer_id=$1`,[offerUuid,quantity,new Date(now)]);}

      await tx.query(`UPDATE order_lines SET status='cancelled' WHERE order_id=$1 AND status IN ('awaiting_vendor','accepted')`, [orderUuid]);
      await tx.query(`UPDATE fulfilment_orders SET status='cancelled',updated_at=$2 WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')`, [orderUuid,new Date(now)]);
      await tx.query(`UPDATE payments SET status=CASE WHEN status IN ('created','requires_action','authorised','failed') THEN 'cancelled' ELSE status END,updated_at=$2 WHERE order_id=$1`, [orderUuid,new Date(now)]);
      await tx.query(`UPDATE customer_orders SET status='cancelled',cancelled_at=$2,cancellation_reason=$3,updated_at=$2 WHERE id=$1`, [orderUuid,new Date(now),reason]);
      return { id:text(row.public_id,"order.public_id"), status:"cancelled", reason };
    }, { isolation: "serializable" });
    await this.#audit(principal,"order.cancelled_by_platform","order",result.id,reason,result,now);
    return result;
  }

  async returnAction(principal: SessionPrincipal, input: { returnId: string; action: "approve" | "authorize" | "receive" | "inspect_sellable" | "inspect_blocked" | "approve_refund" | "refund" | "reject"; reason?: string; now?: number }) {
    if (input.action === "refund") throw new Error("Direct PostgreSQL return-refund execution is disabled; route approved refunds through the configured Viva payments orchestration service");
    const now = input.now ?? Date.now();
    const result = await this.#uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const actor = await this.#userUuid(tx, principal.userId);
      const found = await tx.query<SqlRow>(`SELECT id::text AS return_uuid,public_id,status FROM returns WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [input.returnId]);
      if (!found.rowCount) throw new Error("Return not found");
      const row = found.rows[0];
      const current = text(row.status,"return.status");
      const returnUuid = text(row.return_uuid,"return_uuid");
      let next = current;
      if (input.action === "approve") {
        if (current !== "requested") throw new Error(`Return cannot be approved from ${current}`);
        next = "inspection_required";
        await tx.query(`UPDATE returns SET status=$2,eligibility_state=CASE WHEN eligibility_state='ineligible' THEN eligibility_state ELSE 'eligible' END,updated_at=$3 WHERE id=$1`,[returnUuid,next,new Date(now)]);
      } else if (input.action === "authorize") {
        if (!["approved","inspection_required"].includes(current)) throw new Error(`RMA cannot be issued from ${current}`);
        next = "in_transit";
        const rma = `RMA-${randomUUID().replaceAll("-","").slice(0,10).toUpperCase()}`;
        await tx.query(`UPDATE returns SET status=$2,rma_code=$3,return_by_at=$4,return_cost_payer='platform',destination_type='platform_inspection',destination_instructions=$5,updated_at=$6 WHERE id=$1`,[returnUuid,next,rma,new Date(now+14*DAY),input.reason?.trim()||"Return using the authorized RMA for platform inspection.",new Date(now)]);
      } else if (input.action === "receive") {
        if (!["approved","inspection_required","in_transit"].includes(current)) throw new Error(`Return cannot be received from ${current}`);
        next = "received";
        await tx.query(`UPDATE returns SET status=$2,updated_at=$3 WHERE id=$1`,[returnUuid,next,new Date(now)]);
        await tx.query(`INSERT INTO return_custody_events(id,public_id,return_id,from_party,to_party,actor_user_id,actor_public_id,note,occurred_at) VALUES($1,$2,$3,'carrier','platform',$4,$5,$6,$7)`,[randomUUID(),id("custody"),returnUuid,actor,principal.userId,input.reason?.trim()||"Return received for platform inspection",new Date(now)]);
      } else if (input.action === "inspect_sellable" || input.action === "inspect_blocked") {
        if (current !== "received") throw new Error(`Return cannot be inspected from ${current}`);
        next = "inspected";
        const disposition = input.action === "inspect_sellable" ? "sellable" : "blocked";
        await tx.query(`UPDATE returns SET status=$2,inspection_findings=$3,updated_at=$4 WHERE id=$1`,[returnUuid,next,input.reason?.trim()||`Inspected; disposition ${disposition}`,new Date(now)]);
        await tx.query(`UPDATE return_lines SET inspection_result=$2::jsonb WHERE return_id=$1`,[returnUuid,JSON.stringify({ disposition, inspectedAt:now, actorId:principal.userId })]);
      } else if (input.action === "approve_refund") {
        if (current !== "inspected") throw new Error(`Refund remedy cannot be approved from ${current}`);
        next = "remedy_approved";
        await tx.query(`UPDATE returns SET status=$2,approved_remedy='refund',updated_at=$3 WHERE id=$1`,[returnUuid,next,new Date(now)]);
        await tx.query(`UPDATE return_lines SET approved_remedy='refund',remedy='refund' WHERE return_id=$1`,[returnUuid]);
      } else {
        if (!["requested","inspected"].includes(current)) throw new Error(`Return cannot be rejected from ${current}`);
        const reason = input.reason?.trim() || "Return rejected after platform review";
        if (reason.length < 5) throw new Error("Rejection reason is required");
        next = "rejected";
        await tx.query(`UPDATE returns SET status=$2,eligibility_reason=$3,closed_at=$4,updated_at=$4 WHERE id=$1`,[returnUuid,next,reason,new Date(now)]);
      }
      return { id:text(row.public_id,"return.public_id"), status:next, action:input.action };
    }, { isolation: "serializable" });
    await this.#audit(principal,`return.${input.action}`,"return",result.id,input.reason,result,now);
    return result;
  }

  async reviewsWorkspace(principal: SessionPrincipal) {
    return this.#uow.withTransaction(platformScope(principal.userId), async (tx) => {
      const reviews = await tx.query<SqlRow>(`SELECT r.public_id,r.rating,r.interaction_type,r.body,r.status,v.public_id AS vendor_public_id,cv.public_id AS canonical_public_id,r.incentive_type,r.incentive_details,r.created_at,resp.body AS response_body
        FROM reviews r LEFT JOIN vendor_businesses v ON v.id=r.vendor_id LEFT JOIN canonical_variants cv ON cv.id=r.canonical_variant_id LEFT JOIN vendor_review_responses resp ON resp.review_id=r.id ORDER BY r.created_at DESC LIMIT 300`);
      const reports = await tx.query<SqlRow>(`SELECT rr.public_id,rr.reason,rr.details,rr.status,rr.resolution,r.public_id AS review_public_id,v.public_id AS vendor_public_id,rr.created_at FROM review_reports rr JOIN reviews r ON r.id=rr.review_id JOIN vendor_businesses v ON v.id=rr.vendor_id ORDER BY rr.created_at DESC LIMIT 300`);
      return { csrfToken:principal.csrfToken,
        reviews:reviews.rows.map((r)=>({ id:text(r.public_id,"review.public_id"), rating:integer(r.rating,"review.rating"), interactionType:text(r.interaction_type,"review.interaction_type"), body:optionalText(r.body), status:text(r.status,"review.status"), vendorId:optionalText(r.vendor_public_id)??"platform", canonicalVariantId:optionalText(r.canonical_public_id), incentiveType:text(r.incentive_type,"review.incentive_type"), incentiveDetails:optionalText(r.incentive_details), createdAt:epoch(r.created_at,"review.created_at"), response:r.response_body?{body:text(r.response_body,"response.body")}:undefined })),
        reports:reports.rows.map((r)=>({ id:text(r.public_id,"report.public_id"), reviewId:text(r.review_public_id,"report.review_public_id"), vendorId:text(r.vendor_public_id,"report.vendor_public_id"), reason:text(r.reason,"report.reason"), details:text(r.details,"report.details"), status:text(r.status,"report.status"), resolution:optionalText(r.resolution), createdAt:epoch(r.created_at,"report.created_at") }))
      };
    }, { readOnly:true });
  }

  async moderateReview(principal: SessionPrincipal, input:{ reviewId:string; status:"published"|"hidden"|"rejected"|"pending"; reason:string; now?:number }) {
    const reason=input.reason.trim(); if(reason.length<3) throw new Error("Moderation reason is required"); const now=input.now??Date.now();
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const found=await tx.query<SqlRow>(`SELECT id::text AS review_uuid,public_id,status FROM reviews WHERE public_id=$1 OR id::text=$1 FOR UPDATE`,[input.reviewId]);if(!found.rowCount)throw new Error("Review not found");const row=found.rows[0];await tx.query(`UPDATE reviews SET status=$2,published_at=CASE WHEN $2='published' THEN COALESCE(published_at,$3) ELSE published_at END,updated_at=$3 WHERE id=$1`,[text(row.review_uuid,"review_uuid"),input.status,new Date(now)]);await tx.query(`INSERT INTO review_events(id,public_id,review_id,actor_user_id,actor_public_id,action,reason,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[randomUUID(),id("review-event"),text(row.review_uuid,"review_uuid"),actor,principal.userId,`moderate_${input.status}`,reason,new Date(now)]);return{id:text(row.public_id,"review.public_id"),status:input.status};},{isolation:"serializable"});
    await this.#audit(principal,`review.${input.status}`,"review",result.id,reason,result,now);return result;
  }

  async reviewReportAction(principal: SessionPrincipal,input:{reportId:string;status:"under_review"|"resolved"|"rejected";resolution?:string;now?:number}){
    const now=input.now??Date.now();if(["resolved","rejected"].includes(input.status)&&!(input.resolution?.trim()))throw new Error("Report resolution is required");
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const found=await tx.query<SqlRow>(`SELECT public_id,status FROM review_reports WHERE public_id=$1 OR id::text=$1 FOR UPDATE`,[input.reportId]);if(!found.rowCount)throw new Error("Review report not found");await tx.query(`UPDATE review_reports SET status=$2,resolution=$3,reviewed_by=$4,reviewed_by_public_id=$5,updated_at=$6 WHERE public_id=$1 OR id::text=$1`,[input.reportId,input.status,input.resolution?.trim()??null,actor,principal.userId,new Date(now)]);return{id:text(found.rows[0].public_id,"report.public_id"),status:input.status,resolution:input.resolution?.trim()};},{isolation:"serializable"});
    await this.#audit(principal,`review_report.${input.status}`,"review_report",result.id,input.resolution,result,now);return result;
  }

  async privacyWorkspace(principal:SessionPrincipal){const requests=await this.#persistence.customerPrivacy.privacyRequestsForPlatform({scope:platformScope(principal.userId)});return{csrfToken:principal.csrfToken,requests,overdue:requests.filter((item)=>["submitted","processing"].includes(item.status)&&item.targetAt<Date.now()).length};}

  async privacyAction(principal:SessionPrincipal,input:{requestId:string;action:"start"|"complete"|"partial";now?:number}){
    const now=input.now??Date.now();const requests=await this.#persistence.customerPrivacy.privacyRequestsForPlatform({scope:platformScope(principal.userId)});const current=requests.find((r)=>r.id===input.requestId);if(!current)throw new Error("Privacy request not found");
    let next:PrivacyRequest;
    if(input.action==="start"){if(current.status!=="submitted")throw new Error(`Privacy request cannot start from ${current.status}`);next={...current,status:"processing",processingStartedAt:now};}
    else if(input.action==="complete"){if(!["submitted","processing"].includes(current.status))throw new Error(`Privacy request cannot complete from ${current.status}`);next={...current,status:"completed",processingStartedAt:current.processingStartedAt??now,completedAt:now,completedBy:principal.userId,retention:defaultCustomerRetentionSnapshot(now),outcome:{status:"completed",retainedGovernedRecords:true}};}
    else {if(!["submitted","processing"].includes(current.status))throw new Error(`Privacy request cannot partially complete from ${current.status}`);next={...current,status:"partially_completed",processingStartedAt:current.processingStartedAt??now,completedAt:now,completedBy:principal.userId,retention:defaultCustomerRetentionSnapshot(now),outcome:{status:"partially_completed",reason:"Statutory/business records retained according to retention schedule"}};}
    await this.#persistence.customerPrivacy.savePrivacyRequest({scope:platformScope(principal.userId),request:next});await this.#audit(principal,`privacy.${input.action}`,"privacy_request",next.id,undefined,next,now);return next;
  }

  async categoryWorkspace(principal:SessionPrincipal){return this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const categories=await tx.query<SqlRow>(`SELECT c.code,c.slug,c.commerce_mode,c.require_compatibility_confirmation,c.regulated_checkout_allowed,c.counteroffer_allowed,c.advice_allowed,c.checkout_fulfilment_modes,COALESCE(ct.name,c.code) AS label FROM categories c JOIN markets m ON m.id=c.market_id LEFT JOIN category_translations ct ON ct.category_id=c.id AND ct.locale='el' WHERE m.code='sparta' AND c.active=true ORDER BY label`);const attrs=await tx.query<SqlRow>(`SELECT a.code,a.data_type,a.unit,a.variant_identity,a.filterable,a.values,COALESCE(t.label,a.code) AS label FROM attribute_definitions a LEFT JOIN attribute_translations t ON t.attribute_id=a.id AND t.locale='el' ORDER BY a.code`);return{csrfToken:principal.csrfToken,categories:categories.rows.map(r=>({categoryCode:text(r.code,"category.code"),labelEl:text(r.label,"category.label"),commerceMode:text(r.commerce_mode,"category.commerce_mode"),requireCompatibilityConfirmation:Boolean(r.require_compatibility_confirmation),regulatedCheckoutAllowed:Boolean(r.regulated_checkout_allowed),counterofferAllowed:Boolean(r.counteroffer_allowed),adviceAllowed:Boolean(r.advice_allowed),checkoutFulfilmentModes:jsonArray(r.checkout_fulfilment_modes).map(String)})),attributes:attrs.rows.map(r=>({code:text(r.code,"attribute.code"),labelEl:text(r.label,"attribute.label"),dataType:text(r.data_type,"attribute.data_type"),unit:optionalText(r.unit),variantIdentity:Boolean(r.variant_identity),filterable:Boolean(r.filterable),values:jsonArray(r.values).map(String)}))};},{readOnly:true});}

  async upsertCategory(principal:SessionPrincipal,input:{categoryCode:string;labelEl:string;commerceMode:CategoryCommerceMode;now?:number}){
    const code=input.categoryCode.trim();const label=input.labelEl.trim();if(!code||!label)throw new Error("Category code and Greek label are required");const now=input.now??Date.now();
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const market=await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta'");if(!market.rowCount)throw new Error("Sparta market not found");const marketId=text(market.rows[0].id,"market.id");let found=await tx.query<SqlRow>(`SELECT id::text AS category_uuid FROM categories WHERE market_id=$1 AND (code=$2 OR slug=$2) FOR UPDATE`,[marketId,code]);let categoryUuid:string;if(!found.rowCount){categoryUuid=randomUUID();await tx.query(`INSERT INTO categories(id,market_id,code,slug,commerce_mode,active,created_at) VALUES($1,$2,$3,$3,$4,true,$5)`,[categoryUuid,marketId,code,input.commerceMode,new Date(now)]);}else categoryUuid=text(found.rows[0].category_uuid,"category_uuid");const advice=input.commerceMode!=="directory_only";const counteroffer=!["directory_only","vehicles"].includes(input.commerceMode);await tx.query(`UPDATE categories SET commerce_mode=$2,require_compatibility_confirmation=$3,regulated_checkout_allowed=false,counteroffer_allowed=$4,advice_allowed=$5,checkout_fulfilment_modes=$6 WHERE id=$1`,[categoryUuid,input.commerceMode,input.commerceMode==="compatibility_sensitive",counteroffer,advice,["pickup","local_delivery","shipping"]]);await tx.query(`INSERT INTO category_translations(category_id,locale,name) VALUES($1,'el',$2) ON CONFLICT(category_id,locale) DO UPDATE SET name=EXCLUDED.name`,[categoryUuid,label]);return{categoryCode:code,labelEl:label,commerceMode:input.commerceMode,adviceAllowed:advice,counterofferAllowed:counteroffer};},{isolation:"serializable"});await this.#audit(principal,"category.policy_upserted","category_policy",code,undefined,result,now);return result;
  }

  async contentWorkspace(principal:SessionPrincipal){return this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const pages=await tx.query<SqlRow>(`SELECT p.public_id,p.slug,p.page_type,p.status,p.version,p.scheduled_at,p.published_at,p.created_at,p.updated_at,COALESCE(t.title,p.slug) AS title FROM cms_pages p JOIN markets m ON m.id=p.market_id LEFT JOIN cms_page_translations t ON t.page_id=p.id AND t.locale='el' WHERE m.code='sparta' ORDER BY p.updated_at DESC`);const redirects=await tx.query<SqlRow>(`SELECT public_id,from_path,to_path,status_code,active,created_at FROM cms_redirects WHERE market_id=(SELECT id FROM markets WHERE code='sparta') ORDER BY created_at DESC`);const stories=await tx.query<SqlRow>(`SELECT s.public_id,s.slug,s.status,s.title,v.public_id AS vendor_public_id,s.updated_at FROM merchant_stories s JOIN vendor_businesses v ON v.id=s.vendor_id WHERE s.market_id=(SELECT id FROM markets WHERE code='sparta') ORDER BY s.updated_at DESC`);const collections=await tx.query<SqlRow>(`SELECT public_id,slug,status,title,updated_at FROM product_collections WHERE market_id=(SELECT id FROM markets WHERE code='sparta') ORDER BY updated_at DESC`);return{csrfToken:principal.csrfToken,pages:pages.rows.map(r=>({id:text(r.public_id,"page.public_id"),slug:text(r.slug,"page.slug"),pageType:text(r.page_type,"page.page_type"),status:text(r.status,"page.status"),version:integer(r.version,"page.version"),title:text(r.title,"page.title"),scheduledAt:r.scheduled_at?epoch(r.scheduled_at,"page.scheduled_at"):undefined,publishedAt:r.published_at?epoch(r.published_at,"page.published_at"):undefined,createdAt:epoch(r.created_at,"page.created_at"),updatedAt:epoch(r.updated_at,"page.updated_at")})),redirects:redirects.rows.map(r=>({id:text(r.public_id,"redirect.public_id"),fromPath:text(r.from_path,"redirect.from_path"),toPath:text(r.to_path,"redirect.to_path"),statusCode:integer(r.status_code,"redirect.status_code"),active:Boolean(r.active)})),stories:stories.rows.map(r=>({id:text(r.public_id,"story.public_id"),slug:text(r.slug,"story.slug"),status:text(r.status,"story.status"),title:text(r.title,"story.title"),vendorId:text(r.vendor_public_id,"story.vendor_public_id")})),collections:collections.rows.map(r=>({id:text(r.public_id,"collection.public_id"),slug:text(r.slug,"collection.slug"),status:text(r.status,"collection.status"),title:text(r.title,"collection.title")}))};},{readOnly:true});}

  async createContentPage(principal:SessionPrincipal,input:{slug:string;title:string;description:string;pageType?:ContentPageType;now?:number}){
    const slug=cleanSlug(input.slug);const title=input.title.trim();const description=input.description.trim();if(!title||!description)throw new Error("Title and description are required");const now=input.now??Date.now();
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const market=await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta'");const actor=await this.#userUuid(tx,principal.userId);if(!market.rowCount)throw new Error("Sparta market not found");const pageUuid=randomUUID(),publicId=id("page");const blocks=[{id:"intro",type:"rich_text",data:{text:description}}];await tx.query(`INSERT INTO cms_pages(id,public_id,market_id,page_type,slug,status,blocks,version,created_by,updated_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'draft',$6::jsonb,1,$7,$7,$8,$8)`,[pageUuid,publicId,text(market.rows[0].id,"market.id"),input.pageType??"standard",slug,JSON.stringify(blocks),actor,new Date(now)]);await tx.query(`INSERT INTO cms_page_translations(page_id,locale,title,seo_title,seo_description,translated_blocks) VALUES($1,'el',$2,$2,$3,$4::jsonb)`,[pageUuid,title,description,JSON.stringify(blocks)]);await tx.query(`INSERT INTO cms_page_revisions(id,public_id,page_id,version,actor_user_id,actor_public_id,reason,snapshot,created_at) VALUES($1,$2,$3,1,$4,$5,'Initial draft',$6::jsonb,$7)`,[randomUUID(),id("page-revision"),pageUuid,actor,principal.userId,JSON.stringify({id:publicId,slug,status:"draft",version:1,title,description,blocks}),new Date(now)]);return{id:publicId,slug,pageType:input.pageType??"standard",status:"draft",version:1,title};},{isolation:"serializable"});await this.#audit(principal,"content.page_created","cms_page",result.id,undefined,result,now);return result;
  }

  async contentAction(principal:SessionPrincipal,input:{pageId:string;action:"publish"|"archive"|"restore";reason?:string;now?:number}){
    const now=input.now??Date.now();const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const found=await tx.query<SqlRow>(`SELECT id::text AS page_uuid,public_id,slug,status,version FROM cms_pages WHERE public_id=$1 OR id::text=$1 FOR UPDATE`,[input.pageId]);if(!found.rowCount)throw new Error("CMS page not found");const row=found.rows[0];const next=input.action==="publish"?"published":input.action==="archive"?"archived":"draft";const version=integer(row.version,"page.version")+1;await tx.query(`UPDATE cms_pages SET status=$2,version=$3,published_at=CASE WHEN $2='published' THEN $4 ELSE published_at END,scheduled_at=NULL,updated_by=$5,updated_at=$4 WHERE id=$1`,[text(row.page_uuid,"page_uuid"),next,version,new Date(now),actor]);const translation=await tx.query<SqlRow>(`SELECT title,seo_title,seo_description,translated_blocks FROM cms_page_translations WHERE page_id=$1 AND locale='el'`,[text(row.page_uuid,"page_uuid")]);await tx.query(`INSERT INTO cms_page_revisions(id,public_id,page_id,version,actor_user_id,actor_public_id,reason,snapshot,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,[randomUUID(),id("page-revision"),text(row.page_uuid,"page_uuid"),version,actor,principal.userId,input.reason?.trim()||`Page ${input.action}`,JSON.stringify({id:text(row.public_id,"page.public_id"),slug:text(row.slug,"page.slug"),status:next,version,translation:translation.rows[0]??{}}),new Date(now)]);return{id:text(row.public_id,"page.public_id"),status:next,version};},{isolation:"serializable"});await this.#audit(principal,`content.${input.action}`,"cms_page",result.id,input.reason,result,now);return result;
  }

  async recallWorkspace(principal:SessionPrincipal){return this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const products=await tx.query<SqlRow>(`SELECT cv.public_id,COALESCE(el.title,en.title,cv.slug) AS title,cv.suppressed,cv.recalled FROM canonical_variants cv JOIN markets m ON m.id=cv.market_id LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el' LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en' WHERE m.code='sparta' ORDER BY title`);const notices=await tx.query<SqlRow>(`SELECT pn.public_id,cv.public_id AS canonical_public_id,pn.type,pn.severity,pn.status,pn.details,pn.resolution,pn.opened_at,pn.closed_at FROM product_notices pn JOIN canonical_variants cv ON cv.id=pn.canonical_variant_id ORDER BY pn.opened_at DESC`);const affected=await tx.query<SqlRow>(`SELECT ra.public_id,pn.public_id AS notice_public_id,o.public_id AS order_public_id,ol.public_id AS line_public_id,u.public_id AS customer_public_id,v.public_id AS vendor_public_id,ra.affected_quantity,ra.status,ra.selected_remedy,ra.identified_at FROM recall_affected_orders ra JOIN product_notices pn ON pn.id=ra.notice_id JOIN customer_orders o ON o.id=ra.order_id JOIN order_lines ol ON ol.id=ra.order_line_id LEFT JOIN users u ON u.id=ra.customer_user_id JOIN vendor_businesses v ON v.id=ra.vendor_id ORDER BY ra.identified_at DESC`);return{csrfToken:principal.csrfToken,products:products.rows.map(r=>({id:text(r.public_id,"product.public_id"),title:text(r.title,"product.title"),suppressed:Boolean(r.suppressed),recalled:Boolean(r.recalled)})),notices:notices.rows.map(r=>({id:text(r.public_id,"notice.public_id"),canonicalVariantId:text(r.canonical_public_id,"notice.canonical_public_id"),type:text(r.type,"notice.type"),severity:text(r.severity,"notice.severity"),status:text(r.status,"notice.status"),details:typeof r.details==="string"?r.details:JSON.stringify(r.details),resolution:optionalText(r.resolution),openedAt:epoch(r.opened_at,"notice.opened_at"),closedAt:r.closed_at?epoch(r.closed_at,"notice.closed_at"):undefined})),affected:affected.rows.map(r=>({id:text(r.public_id,"affected.public_id"),noticeId:text(r.notice_public_id,"affected.notice_public_id"),orderId:text(r.order_public_id,"affected.order_public_id"),orderLineId:text(r.line_public_id,"affected.line_public_id"),customerId:optionalText(r.customer_public_id),vendorId:text(r.vendor_public_id,"affected.vendor_public_id"),quantity:integer(r.affected_quantity,"affected.quantity"),status:text(r.status,"affected.status"),selectedRemedy:optionalText(r.selected_remedy),identifiedAt:epoch(r.identified_at,"affected.identified_at")}))};},{readOnly:true});}

  async openRecall(principal:SessionPrincipal,input:{canonicalVariantId:string;details:string;severity:"low"|"medium"|"high"|"critical";now?:number}){
    const details=input.details.trim();if(details.length<5)throw new Error("Recall details are required");const now=input.now??Date.now();
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const canonical=await tx.query<SqlRow>(`SELECT id::text AS canonical_uuid,public_id FROM canonical_variants WHERE public_id=$1 OR id::text=$1 FOR UPDATE`,[input.canonicalVariantId]);if(!canonical.rowCount)throw new Error("Canonical product not found");const row=canonical.rows[0];const noticeUuid=randomUUID(),noticePublic=id("notice");await tx.query(`INSERT INTO product_notices(id,public_id,canonical_variant_id,type,severity,status,details,opened_by,opened_at) VALUES($1,$2,$3,'recall',$4,'open',$5::jsonb,$6,$7)`,[noticeUuid,noticePublic,text(row.canonical_uuid,"canonical_uuid"),input.severity,JSON.stringify({text:details}),actor,new Date(now)]);await tx.query(`UPDATE canonical_variants SET suppressed=true,recalled=true,updated_at=$2 WHERE id=$1`,[text(row.canonical_uuid,"canonical_uuid"),new Date(now)]);
      const lines=await tx.query<SqlRow>(`SELECT ol.id::text AS line_uuid,ol.vendor_id::text AS vendor_uuid,o.id::text AS order_uuid,o.user_id::text AS customer_uuid,GREATEST(0,ol.fulfilled_quantity-ol.refunded_quantity)::int AS affected_quantity FROM order_lines ol JOIN customer_orders o ON o.id=ol.order_id WHERE ol.canonical_variant_id=$1 AND ol.fulfilled_quantity>ol.refunded_quantity`,[text(row.canonical_uuid,"canonical_uuid")]);let affectedCount=0;for(const line of lines.rows){const qty=integer(line.affected_quantity,"affected_quantity");if(qty<=0)continue;const affectedPublic=id("recall-affected");await tx.query(`INSERT INTO recall_affected_orders(id,public_id,notice_id,canonical_variant_id,order_id,order_line_id,customer_user_id,vendor_id,affected_quantity,status,identified_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11) ON CONFLICT(notice_id,order_line_id) DO NOTHING`,[randomUUID(),affectedPublic,noticeUuid,text(row.canonical_uuid,"canonical_uuid"),text(line.order_uuid,"order_uuid"),text(line.line_uuid,"line_uuid"),optionalText(line.customer_uuid)??null,text(line.vendor_uuid,"vendor_uuid"),qty,line.customer_uuid?"notified":"identified",new Date(now)]);if(line.customer_uuid){await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,event_type,template_version,locale,payload,status,created_at) VALUES($1,$2,$3,'in_app','product_recall','v1','el',$4::jsonb,'queued',$5)`,[randomUUID(),id("notification"),text(line.customer_uuid,"customer_uuid"),JSON.stringify({noticeId:noticePublic,canonicalVariantId:text(row.public_id,"canonical.public_id"),details,severity:input.severity}),new Date(now)]);await tx.query(`UPDATE recall_affected_orders SET notified_at=$2,updated_at=$2 WHERE notice_id=$1 AND order_line_id=$3`,[noticeUuid,new Date(now),text(line.line_uuid,"line_uuid")]);}affectedCount++;}
      return{notice:{id:noticePublic,canonicalVariantId:text(row.public_id,"canonical.public_id"),type:"recall",severity:input.severity,status:"open",details},affectedCount};},{isolation:"serializable"});await this.#audit(principal,"product.recall_opened","product_notice",result.notice.id,details,result,now);return result;
  }

  async resolveRecall(principal:SessionPrincipal,input:{noticeId:string;resolution:string;restoreProduct?:boolean;now?:number}){
    const resolution=input.resolution.trim();if(resolution.length<3)throw new Error("Recall resolution is required");const now=input.now??Date.now();
    const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const found=await tx.query<SqlRow>(`SELECT pn.id::text AS notice_uuid,pn.public_id,pn.canonical_variant_id::text AS canonical_uuid,cv.public_id AS canonical_public_id,pn.status FROM product_notices pn JOIN canonical_variants cv ON cv.id=pn.canonical_variant_id WHERE pn.public_id=$1 OR pn.id::text=$1 FOR UPDATE`,[input.noticeId]);if(!found.rowCount)throw new Error("Recall notice not found");const row=found.rows[0];if(text(row.status,"notice.status")!=="open")throw new Error("Recall notice is already closed");await tx.query(`UPDATE product_notices SET status='resolved',resolution=$2,resolved_by=$3,closed_at=$4 WHERE id=$1`,[text(row.notice_uuid,"notice_uuid"),resolution,actor,new Date(now)]);if(input.restoreProduct){const blockers=await tx.query<SqlRow>(`SELECT 1 AS hit FROM product_notices WHERE canonical_variant_id=$1 AND status='open' AND type IN ('recall','compliance_hold','safety_notice') LIMIT 1`,[text(row.canonical_uuid,"canonical_uuid")]);if(!blockers.rowCount)await tx.query(`UPDATE canonical_variants SET suppressed=false,recalled=false,updated_at=$2 WHERE id=$1`,[text(row.canonical_uuid,"canonical_uuid"),new Date(now)]);}return{id:text(row.public_id,"notice.public_id"),canonicalVariantId:text(row.canonical_public_id,"canonical.public_id"),status:"resolved",resolution,restored:Boolean(input.restoreProduct)};},{isolation:"serializable"});await this.#audit(principal,"product.recall_resolved","product_notice",result.id,resolution,result,now);return result;
  }

  async marketAnalytics(principal:SessionPrincipal){return this.#adminOperations.marketAnalytics(principal);}

  async maintenanceWorkspace(principal:SessionPrincipal){return this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const jobs=await tx.query<SqlRow>(`SELECT name,next_run_at,locked_until,last_started_at,last_succeeded_at,consecutive_failures,last_error FROM scheduled_jobs ORDER BY name`);const docs=await tx.query<SqlRow>(`SELECT entity_public_id,entity_type,status,version FROM search_index_state WHERE market_id=(SELECT id FROM markets WHERE code='sparta') AND status='indexed' ORDER BY entity_type,entity_public_id LIMIT 1000`);return{csrfToken:principal.csrfToken,indexedDocuments:docs.rows.map(r=>({id:text(r.entity_public_id,"search.entity_public_id"),type:text(r.entity_type,"search.entity_type"),status:text(r.status,"search.status"),version:integer(r.version,"search.version")})),jobNames:jobs.rows.map(r=>({name:text(r.name,"job.name"),state:{nextRunAt:epoch(r.next_run_at,"job.next_run_at"),lockedUntil:r.locked_until?epoch(r.locked_until,"job.locked_until"):undefined,lastStartedAt:r.last_started_at?epoch(r.last_started_at,"job.last_started_at"):undefined,lastSucceededAt:r.last_succeeded_at?epoch(r.last_succeeded_at,"job.last_succeeded_at"):undefined,consecutiveFailures:integer(r.consecutive_failures,"job.consecutive_failures"),lastError:optionalText(r.last_error)}})),lastMaintenanceRun:undefined};},{readOnly:true});}

  async runMaintenance(principal:SessionPrincipal,input:{now?:number}={}){const now=input.now??Date.now();const result=await this.#uow.withTransaction(platformScope(principal.userId),async(tx)=>{const actor=await this.#userUuid(tx,principal.userId);const expired=await tx.query<SqlRow>(`SELECT expire_stock_reservations($1) AS n`,[new Date(now)]);const compliance=await tx.query<SqlRow>(`UPDATE product_compliance_documents SET status='expired' WHERE status='verified' AND valid_to IS NOT NULL AND valid_to<$1 RETURNING public_id`,[new Date(now)]);const cms=await tx.query<SqlRow>(`UPDATE cms_pages SET status='published',published_at=COALESCE(published_at,$1),scheduled_at=NULL,updated_by=$2,updated_at=$1 WHERE status='scheduled' AND scheduled_at<=$1 RETURNING public_id`,[new Date(now),actor]);const security=await tx.query<SqlRow>(`DELETE FROM security_events WHERE occurred_at<$1 RETURNING public_id`,[new Date(now-90*DAY)]);const throttles=await tx.query<SqlRow>(`DELETE FROM auth_rate_limit_windows WHERE window_started_at<$1 RETURNING route`,[new Date(now-2*DAY)]);return{expiredReservations:integer(expired.rows[0]?.n??0,"maintenance.expired"),expiredCompliance:compliance.rowCount,publishedContent:cms.rowCount,purgedSecurityEvents:security.rowCount,purgedAuthThrottleWindows:throttles.rowCount,ranAt:now};},{isolation:"serializable"});await this.#audit(principal,"operations.maintenance_run","scheduled_jobs","postgres-admin-maintenance",undefined,result,now);return result;}

  async #audit(principal:SessionPrincipal,action:string,entityType:string,entityId:string,reason:unknown,after:unknown,now:number){await this.#persistence.trust.saveAudit({scope:platformScope(principal.userId),event:{id:id("audit"),actorId:principal.userId,actorRole:principal.roles[0],action,entityType,entityId,reason:typeof reason==="string"?reason:undefined,after,createdAt:now}});}
  async #userUuid(tx:SqlExecutor,publicId:string):Promise<string>{const result=await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1`,[publicId]);if(!result.rowCount)throw new Error(`Platform user ${publicId} not found`);return text(result.rows[0].id,"user.id");}
}
