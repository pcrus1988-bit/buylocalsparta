import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { VivaPaymentsClient, majorCurrencyToMinor, type VivaTransaction, type VivaWebhookEnvelope } from "@buy-local-sparta/viva-payments";

export type VivaPaymentsGateway = Pick<VivaPaymentsClient, "environment" | "checkoutUrl" | "createPaymentOrder" | "retrieveTransaction" | "refund" | "cancelPaymentOrder" | "webhookVerificationKey">;

const PAID_RESERVATION_HOLD_MS = 48 * 60 * 60 * 1000;

export type VivaPaymentInitiation = Readonly<{ orderId: string; orderCode: string; checkoutUrl: string; amountMinor: number }>;
export type VivaPaymentReconciliation = Readonly<{ orderId: string; paymentStatus: string; orderStatus: string; transactionId: string; amountMinor: number }>;
export type VivaRefundState = Readonly<{ id: string; status: string; amountMinor: number; providerRefundId?: string; error?: string }>;

export class PostgresVivaPaymentsService {
  readonly #uow: PostgresUnitOfWork;
  readonly #client: VivaPaymentsGateway;
  readonly #emailNotificationsEnabled: boolean;

  constructor(pool: SqlPool, client: VivaPaymentsGateway, options: { emailNotificationsEnabled?: boolean } = {}) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 20_000, lockTimeoutMs: 8_000 });
    this.#client = client;
    this.#emailNotificationsEnabled = options.emailNotificationsEnabled === true;
  }

  async initiateOrderPayment(input: { orderId: string; customerId?: string; visitorKey: string; now?: number }): Promise<VivaPaymentInitiation> {
    const now = input.now ?? Date.now();
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.visitorKey)) throw new Error("Trusted visitor identity is required");
    const prepared = await this.#uow.withTransaction({ actorUserId: input.customerId, marketId:"sparta", platformAccess:true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.public_id AS order_id,o.status::text,o.total_minor,o.currency,o.visitor_hash,
          GREATEST(0,o.total_minor-COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0)) AS payable_minor,
          u.public_id AS customer_public_id,u.email,u.phone,u.preferred_locale,cp.first_name,cp.last_name,
          p.id::text AS payment_uuid,p.public_id AS payment_id,p.provider,p.provider_order_code,p.provider_correlation_id,p.provider_payload,p.status::text AS payment_status
        FROM customer_orders o JOIN payments p ON p.order_id=o.id LEFT JOIN users u ON u.id=o.user_id LEFT JOIN customer_profiles cp ON cp.user_id=u.id
        WHERE o.public_id=$1 FOR UPDATE OF o,p`, [input.orderId]);
      if (!result.rowCount) throw new Error("ORDER_NOT_FOUND");
      const row = result.rows[0];
      const orderStatus = text(row.status,"order.status");
      if (orderStatus !== "pending_payment") throw new Error(`Order ${input.orderId} is not awaiting payment`);
      if (text(row.currency,"order.currency") !== "EUR") throw new Error("Viva Smart Checkout is configured for EUR orders only");
      const storedCustomer = optionalText(row.customer_public_id);
      if (storedCustomer && storedCustomer !== input.customerId) throw new Error("Payment order belongs to another customer");
      if (!storedCustomer && text(row.visitor_hash,"visitor_hash") !== visitorHash(input.visitorKey)) throw new Error("Payment order belongs to another visitor");
      const amountMinor = integer(row.payable_minor,"payable_minor");
      if (amountMinor <= 0) throw new Error("Order has no remaining amount for Viva payment");
      const existing = optionalText(row.provider_order_code);
      if (existing) return { kind:"existing" as const, value:{ orderId:input.orderId, orderCode:existing, checkoutUrl:this.#client.checkoutUrl(existing), amountMinor } };
      if (!["pending_psp","viva"].includes(text(row.provider,"payment.provider"))) throw new Error("Order payment is assigned to a different provider");
      const payload = object(row.provider_payload);
      const creationState = optionalText(payload.orderCreationState);
      if (creationState === "creating" || creationState === "manual_review") {
        return { kind:"blocked" as const, state:creationState, attemptId:optionalText(row.provider_correlation_id) };
      }
      const attemptId = randomUUID();
      const fullName = [optionalText(row.first_name),optionalText(row.last_name)].filter(Boolean).join(" ") || undefined;
      await tx.query(`UPDATE payments SET provider='viva',status='requires_action',provider_correlation_id=$2,
        provider_payload=provider_payload||$3::jsonb,updated_at=$4 WHERE id=$1`, [
        text(row.payment_uuid,"payment_uuid"), attemptId, JSON.stringify({ orderCreationState:"creating", orderCreationAttemptId:attemptId, orderCreationStartedAt:new Date(now).toISOString(), environment:this.#client.environment }), new Date(now)
      ]);
      await this.#paymentEvent(tx, text(row.payment_uuid,"payment_uuid"), `order-attempt:${attemptId}`, "payment_order_creation_started", { attemptId, amountMinor }, now);
      return { kind:"create" as const, paymentUuid:text(row.payment_uuid,"payment_uuid"), attemptId, amountMinor,
        customer:{ email:optionalText(row.email), phone:optionalText(row.phone), fullName, countryCode:"GR", requestLang:locale(optionalText(row.preferred_locale)) } };
    }, { isolation:"serializable" });

    if (prepared.kind === "existing") return prepared.value;
    if (prepared.kind === "blocked") throw new Error(`Viva payment-order creation is ${prepared.state}; automatic retry is blocked pending reconciliation${prepared.attemptId ? ` (${prepared.attemptId})` : ""}`);

    let created;
    try {
      created = await this.#client.createPaymentOrder({
        amountMinor:prepared.amountMinor,
        merchantReference:`Buy Local Sparta ${input.orderId} attempt ${prepared.attemptId}`,
        customerDescription:`Παραγγελία ${input.orderId}`,
        customer:prepared.customer,
        tags:["buy-local-sparta", `attempt:${prepared.attemptId}`]
      });
    } catch (error) {
      const message=error instanceof Error?error.message:String(error);
      await this.#uow.withTransaction({ actorUserId:input.customerId, marketId:"sparta", platformAccess:true }, async(tx)=>{
        await tx.query(`UPDATE payments SET provider_payload=provider_payload||$3::jsonb,updated_at=$4
          WHERE id=$1 AND provider_correlation_id=$2 AND provider_order_code IS NULL`,[
          prepared.paymentUuid,prepared.attemptId,JSON.stringify({orderCreationState:"manual_review",orderCreationError:message.slice(0,500),orderCreationFailedAt:new Date(now).toISOString()}),new Date(now)
        ]);
        await this.#paymentEvent(tx,prepared.paymentUuid,`order-attempt-unknown:${prepared.attemptId}`,"payment_order_creation_unknown",{attemptId:prepared.attemptId,error:message.slice(0,500)},now);
      });
      throw new Error("Viva payment-order creation outcome requires reconciliation; automatic retry is blocked");
    }

    return this.#uow.withTransaction({ actorUserId: input.customerId, marketId:"sparta", platformAccess:true }, async(tx)=>{
      const current=await tx.query<SqlRow>(`SELECT provider_order_code,provider_correlation_id FROM payments WHERE id=$1 FOR UPDATE`,[prepared.paymentUuid]);
      if(!current.rowCount) throw new Error("Payment persistence disappeared during Viva order creation");
      const existing=optionalText(current.rows[0].provider_order_code);
      if(existing) return {orderId:input.orderId,orderCode:existing,checkoutUrl:this.#client.checkoutUrl(existing),amountMinor:prepared.amountMinor};
      if(optionalText(current.rows[0].provider_correlation_id)!==prepared.attemptId) throw new Error("Viva payment creation attempt was superseded and requires reconciliation");
      await tx.query(`UPDATE payments SET provider_order_code=$2,provider_payload=provider_payload||$3::jsonb,updated_at=$4 WHERE id=$1`,[
        prepared.paymentUuid,created.orderCode,JSON.stringify({orderCreationState:"created",orderCreationCompletedAt:new Date(now).toISOString()}),new Date(now)
      ]);
      await this.#paymentEvent(tx,prepared.paymentUuid,`order:${created.orderCode}`,"payment_order_created",{orderCode:created.orderCode,amountMinor:prepared.amountMinor,attemptId:prepared.attemptId},now);
      return {orderId:input.orderId,orderCode:created.orderCode,checkoutUrl:created.checkoutUrl,amountMinor:prepared.amountMinor};
    },{isolation:"serializable"});
  }

  async reconcileTransaction(input: { transactionId: string; expectedOrderCode?: string; source: "redirect"|"webhook"|"manual"; now?: number }): Promise<VivaPaymentReconciliation> {
    const now = input.now ?? Date.now();
    const provider = await this.#client.retrieveTransaction(input.transactionId);
    if (input.expectedOrderCode && provider.orderCode !== input.expectedOrderCode) throw new Error("Viva transaction/order mismatch");
    const applied = await this.#uow.withTransaction({ marketId:"sparta", platformAccess:true }, async (tx) => this.#applyTransaction(tx, provider, input.source, now), { isolation:"serializable" });
    if (applied.orderStatus === "cancelled" && applied.paymentStatus === "captured") {
      try {
        const refund = await this.requestRefund({
          orderId: applied.orderId,
          amountMinor: applied.amountMinor,
          idempotencyKey: `late-capture:${applied.orderId}`,
          reason: "late_capture_after_cancellation",
          now
        });
        if (refund.status === "completed") return { ...applied, paymentStatus:"refunded" };
      } catch {
        // requestRefund durably records unknown provider outcomes as manual_review.
        // Do not fail webhook reconciliation here: redelivery must not trigger another refund attempt.
      }
    }
    return applied;
  }

  async handleWebhook(envelope: VivaWebhookEnvelope, now = Date.now()): Promise<{ accepted: true; eventTypeId: number; result?: VivaPaymentReconciliation | VivaRefundState }> {
    const eventTypeId = integer(envelope.EventTypeId,"Viva webhook EventTypeId");
    const data = envelope.EventData ?? {};
    const transactionId = optionalText(data.TransactionId ?? data.transactionId);
    if (eventTypeId === 1796 || eventTypeId === 1798) {
      if (!transactionId) throw new Error("Viva webhook is missing TransactionId");
      const orderCode = orderCodeText(data.OrderCode ?? data.orderCode);
      return { accepted:true, eventTypeId, result:await this.reconcileTransaction({ transactionId, expectedOrderCode:orderCode, source:"webhook", now }) };
    }
    if (eventTypeId === 1797) {
      if (!transactionId) throw new Error("Viva reversal webhook is missing TransactionId");
      return { accepted:true, eventTypeId, result:await this.#reconcileReversal(envelope, transactionId, now) };
    }
    return { accepted:true, eventTypeId };
  }

  async webhookVerificationKey(): Promise<string> { return this.#client.webhookVerificationKey(); }

  async requestRefund(input: { orderId: string; amountMinor: number; idempotencyKey: string; reason: string; now?: number }): Promise<VivaRefundState> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Refund amount must use positive integer minor units");
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 160) throw new Error("Refund idempotency key is invalid");
    const prepared: { kind:"existing"; state:VivaRefundState } | { kind:"create"; refundId:string; refundUuid:string; paymentUuid:string; transactionId:string; remaining:number } = await this.#uow.withTransaction({ marketId:"sparta", platformAccess:true }, async (tx) => {
      const existing = await tx.query<SqlRow>(`SELECT public_id,status,amount_minor,provider_refund_id,failure_message FROM refunds WHERE idempotency_key=$1 FOR UPDATE`,[input.idempotencyKey]);
      if (existing.rowCount) {
        const r=existing.rows[0]; return { kind:"existing" as const, state:{ id:text(r.public_id,"refund.public_id"),status:text(r.status,"refund.status"),amountMinor:integer(r.amount_minor,"refund.amount"),providerRefundId:optionalText(r.provider_refund_id),error:optionalText(r.failure_message) } as VivaRefundState };
      }
      const found=await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,p.id::text AS payment_uuid,p.provider_transaction_id,p.captured_minor,p.refunded_minor,p.status::text,p.currency
        FROM customer_orders o JOIN payments p ON p.order_id=o.id WHERE o.public_id=$1 FOR UPDATE OF p`,[input.orderId]);
      if(!found.rowCount) throw new Error("ORDER_NOT_FOUND");
      const row=found.rows[0]; if(text(row.currency,"payment.currency")!=="EUR") throw new Error("Only EUR Viva refunds are supported");
      const transactionId=text(row.provider_transaction_id,"Viva original transaction id");
      const remaining=integer(row.captured_minor,"captured_minor")-integer(row.refunded_minor,"refunded_minor");
      if(input.amountMinor>remaining) throw new Error("Refund exceeds captured amount remaining");
      const refundId=id("refund"), refundUuid=randomUUID();
      await tx.query(`INSERT INTO refunds(id,public_id,order_id,payment_id,idempotency_key,amount_minor,currency,status,reason,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'EUR','processing',$7,$8,$8)`,[refundUuid,refundId,text(row.order_uuid,"order_uuid"),text(row.payment_uuid,"payment_uuid"),input.idempotencyKey,input.amountMinor,input.reason.trim(),new Date(now)]);
      return { kind:"create" as const, refundId, refundUuid, paymentUuid:text(row.payment_uuid,"payment_uuid"), transactionId, remaining };
    }, { isolation:"serializable" });
    if (prepared.kind === "existing") {
      if (prepared.state.status === "processing" || prepared.state.status === "manual_review") throw new Error("Refund outcome is already pending/manual review; do not retry automatically");
      return prepared.state;
    }
    try {
      const result=await this.#client.refund({transactionId:prepared.transactionId,amountMinor:input.amountMinor});
      if(!result.success) {
        return await this.#finalizeRefundFailure(prepared.refundUuid,input.amountMinor,result.errorCode,result.errorText??`Viva refund status ${result.statusId||"unknown"}`,result,now);
      }
      if (!result.transactionId) throw new Error("Viva reported a successful refund without a provider transaction id");
      return await this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{
        await tx.query(`UPDATE refunds SET status='completed',provider_refund_id=$2,provider_status=$3,provider_event_id=$2,provider_payload=$4::jsonb,completed_at=$5,updated_at=$5 WHERE id=$1`,[prepared.refundUuid,result.transactionId??null,result.statusId,JSON.stringify(result),new Date(now)]);
        await tx.query<SqlRow>(`UPDATE payments SET refunded_minor=LEAST(captured_minor,refunded_minor+$2),status=(CASE WHEN refunded_minor+$2>=captured_minor THEN 'refunded' ELSE 'partially_refunded' END)::payment_status,updated_at=$3 WHERE id=$1 RETURNING refunded_minor,captured_minor,status::text`,[prepared.paymentUuid,input.amountMinor,new Date(now)]);
        await this.#paymentEvent(tx,prepared.paymentUuid,result.transactionId?`reversal:${result.transactionId}`:`refund:${prepared.refundId}`,"refund_completed",{refundId:prepared.refundId,amountMinor:input.amountMinor,statusId:result.statusId},now);
        await this.#enqueueOrderNotification(tx,{paymentUuid:prepared.paymentUuid,eventType:"order.refund_completed",dedupeKey:`refund:${prepared.refundId}:completed`,title:"Η επιστροφή χρημάτων ολοκληρώθηκε",body:`Η επιστροφή χρημάτων για την παραγγελία σας ολοκληρώθηκε.`,payload:{refundId:prepared.refundId,amountMinor:input.amountMinor,providerRefundId:result.transactionId},now});
        return {id:prepared.refundId,status:"completed",amountMinor:input.amountMinor,providerRefundId:result.transactionId};
      },{isolation:"serializable"});
    } catch(error) {
      const message=error instanceof Error?error.message:String(error);
      await this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{
        await tx.query(`UPDATE refunds SET status='manual_review',failure_code='provider_outcome_unknown',failure_message=$2,updated_at=$3 WHERE id=$1 AND status='processing'`,[prepared.refundUuid,message.slice(0,500),new Date(now)]);
      });
      throw new Error("Viva refund outcome is unknown and requires reconciliation; automatic retry is blocked");
    }
  }

  async executeApprovedReturnRefund(input:{returnId:string;actorUserId:string;now?:number}):Promise<VivaRefundState>{
    const now=input.now??Date.now();
    const prepared=await this.#uow.withTransaction({actorUserId:input.actorUserId,marketId:"sparta",platformAccess:true},async(tx)=>{
      const rows=await tx.query<SqlRow>(`SELECT r.id::text AS return_uuid,r.public_id AS return_id,r.status::text AS return_status,r.approved_remedy,o.public_id AS order_id,
          ol.id::text AS line_uuid,ol.quantity AS line_quantity,ol.refunded_quantity,ol.retail_unit_price_minor,ol.discount_allocation_minor,rl.quantity AS return_quantity
        FROM returns r JOIN customer_orders o ON o.id=r.order_id JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
        WHERE r.public_id=$1 OR r.id::text=$1 ORDER BY ol.public_id FOR UPDATE OF r,ol,rl`,[input.returnId]);
      if(!rows.rowCount)throw new Error("Return not found");const first=rows.rows[0];if(text(first.return_status,"return.status")!=="remedy_approved"||text(first.approved_remedy,"approved_remedy")!=="refund")throw new Error("Return refund has not been approved");
      let amountMinor=0;for(const row of rows.rows){const total=integer(row.line_quantity,"line.quantity"),old=integer(row.refunded_quantity,"line.refunded_quantity"),qty=integer(row.return_quantity,"return.quantity");if(qty<=0||old+qty>total)throw new Error("Return quantity exceeds refundable quantity");const discount=integer(row.discount_allocation_minor??0,"discount_allocation_minor");const prior=proportionalDiscount(discount,old,total),next=proportionalDiscount(discount,old+qty,total);amountMinor+=integer(row.retail_unit_price_minor,"retail_unit_price_minor")*qty-(next-prior);}
      if(amountMinor<=0)throw new Error("Approved return has no refundable customer value");return{returnUuid:text(first.return_uuid,"return_uuid"),returnId:text(first.return_id,"return_id"),orderId:text(first.order_id,"order_id"),amountMinor,lines:rows.rows.map(r=>({lineUuid:text(r.line_uuid,"line_uuid"),quantity:integer(r.return_quantity,"return_quantity")}))};
    },{isolation:"serializable"});
    const refund=await this.requestRefund({orderId:prepared.orderId,amountMinor:prepared.amountMinor,idempotencyKey:`return-refund:${prepared.returnId}`,reason:`approved_return:${prepared.returnId}`,now});if(refund.status!=="completed")return refund;
    await this.#uow.withTransaction({actorUserId:input.actorUserId,marketId:"sparta",platformAccess:true},async(tx)=>{const actor=await tx.query<SqlRow>(`SELECT id::text AS id,public_id FROM users WHERE public_id=$1 OR id::text=$1`,[input.actorUserId]);if(!actor.rowCount)throw new Error("Admin actor not found");const refundRow=await tx.query<SqlRow>(`SELECT id::text AS id FROM refunds WHERE public_id=$1`,[refund.id]);if(!refundRow.rowCount)throw new Error("Refund persistence not found");for(const line of prepared.lines)await tx.query(`UPDATE order_lines SET refunded_quantity=LEAST(quantity,refunded_quantity+$2),status=CASE WHEN refunded_quantity+$2>=quantity THEN 'refunded' ELSE status END WHERE id=$1`,[line.lineUuid,line.quantity]);await tx.query(`UPDATE return_lines SET refund_id=$2 WHERE return_id=$1`,[prepared.returnUuid,text(refundRow.rows[0].id,"refund_uuid")]);await tx.query(`UPDATE returns SET status='refunded',closed_at=$2,updated_at=$2 WHERE id=$1`,[prepared.returnUuid,new Date(now)]);await tx.query(`UPDATE customer_orders SET status=(CASE WHEN NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id=customer_orders.id AND status<>'cancelled' AND refunded_quantity<quantity) THEN 'refunded' ELSE 'partially_refunded' END)::order_status,updated_at=$2 WHERE public_id=$1`,[prepared.orderId,new Date(now)]);await tx.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at) VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,'platform_finance','return.refund.executed','return',$5,$6,$7::jsonb,$8)`,[randomUUID(),id("audit"),text(actor.rows[0].id,"actor_uuid"),text(actor.rows[0].public_id,"actor_public_id"),prepared.returnId,`Viva refund ${refund.providerRefundId??refund.id}`,JSON.stringify({refundId:refund.id,amountMinor:refund.amountMinor,providerRefundId:refund.providerRefundId}),new Date(now)]);},{isolation:"serializable"});
    return refund;
  }

  async prepareOrderCancellation(input:{orderId:string;reason:string;now?:number}):Promise<void>{
    const now=input.now??Date.now(); const state=await this.paymentForOrder(input.orderId); if(!state||state.provider!=="viva")return;
    const remaining=Math.max(0,state.capturedMinor-state.refundedMinor);
    if(remaining>0){const refund=await this.requestRefund({orderId:input.orderId,amountMinor:remaining,idempotencyKey:`order-cancel:${input.orderId}`,reason:`customer_cancellation:${input.reason.trim()}`,now});if(refund.status!=="completed")throw new Error("Customer cancellation refund is not complete");return;}
    if(state.orderCode&&!["cancelled","refunded"].includes(state.status)){await this.#client.cancelPaymentOrder(state.orderCode);await this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{await tx.query(`UPDATE payments p SET status='cancelled',updated_at=$2 FROM customer_orders o WHERE p.order_id=o.id AND o.public_id=$1 AND p.captured_minor=0`,[input.orderId,new Date(now)]);});}
  }

  async paymentForOrder(orderId:string):Promise<{provider:string;status:string;capturedMinor:number;refundedMinor:number;transactionId?:string;orderCode?:string}|undefined>{
    return this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{const r=await tx.query<SqlRow>(`SELECT p.provider,p.status::text,p.captured_minor,p.refunded_minor,p.provider_transaction_id,p.provider_order_code FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.public_id=$1`,[orderId]);if(!r.rowCount)return undefined;const x=r.rows[0];return{provider:text(x.provider,"provider"),status:text(x.status,"status"),capturedMinor:integer(x.captured_minor,"captured_minor"),refundedMinor:integer(x.refunded_minor,"refunded_minor"),transactionId:optionalText(x.provider_transaction_id),orderCode:optionalText(x.provider_order_code)}} ,{readOnly:true});
  }

  async #applyTransaction(tx:SqlExecutor, provider:VivaTransaction, source:string, now:number):Promise<VivaPaymentReconciliation>{
    const found=await tx.query<SqlRow>(`SELECT p.id::text AS payment_uuid,p.status::text AS payment_status,p.captured_minor,p.refunded_minor,o.id::text AS order_uuid,o.public_id AS order_id,o.user_id::text AS customer_uuid,o.status::text AS order_status,o.total_minor,o.currency,
      GREATEST(0,o.total_minor-COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0)) AS payable_minor
      FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE p.provider='viva' AND p.provider_order_code=$1 FOR UPDATE OF p,o`,[provider.orderCode]);
    if(!found.rowCount) throw new Error("Unknown Viva order code");
    const row=found.rows[0], total=integer(row.payable_minor,"order.payable_minor");
    if(text(row.currency,"order.currency")!=="EUR"||provider.currencyCode!==978) throw new Error("Viva currency mismatch");
    if(provider.amountMinor!==total) throw new Error(`Viva amount mismatch: expected ${total}, received ${provider.amountMinor}`);
    const paymentUuid=text(row.payment_uuid,"payment_uuid"), orderUuid=text(row.order_uuid,"order_uuid"), orderId=text(row.order_id,"order_id");
    const currentPaymentStatus=text(row.payment_status,"payment_status");
    const refundedMinor=integer(row.refunded_minor,"refunded_minor");
    const capturedMinor=integer(row.captured_minor,"captured_minor");
    let paymentStatus=currentPaymentStatus, orderStatus=text(row.order_status,"order_status");
    if(provider.statusId==="F"||provider.statusId==="C"){
      paymentStatus=currentPaymentStatus==="chargeback"?"chargeback":refundedMinor>=total?"refunded":refundedMinor>0?"partially_refunded":"captured";
      orderStatus=["cancelled","refunded"].includes(orderStatus)?orderStatus:"confirmed";
      await tx.query(`UPDATE payments SET provider_payment_id=$2,provider_transaction_id=$2,
        status=CASE WHEN status='chargeback' THEN 'chargeback'::payment_status WHEN refunded_minor>=$3 THEN 'refunded'::payment_status WHEN refunded_minor>0 THEN 'partially_refunded'::payment_status ELSE 'captured'::payment_status END,
        authorised_minor=GREATEST(authorised_minor,$3),captured_minor=GREATEST(captured_minor,$3),provider_verified_at=$4,provider_payload=provider_payload||$5::jsonb,updated_at=$4 WHERE id=$1`,[paymentUuid,provider.transactionId,total,new Date(now),JSON.stringify({lastStatusId:provider.statusId,lastVerifiedSource:source})]);
      if(orderStatus==="confirmed") {
        await tx.query(`UPDATE customer_orders SET status='confirmed',confirmed_at=COALESCE(confirmed_at,$2),updated_at=$2 WHERE id=$1`,[orderUuid,new Date(now)]);
        await tx.query(`UPDATE stock_reservations SET expires_at=GREATEST(expires_at,$2) WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=$1) AND status='active'`,[orderUuid,new Date(now+PAID_RESERVATION_HOLD_MS)]);
        await this.#enqueueOrderNotification(tx,{paymentUuid,eventType:"order.payment_confirmed",dedupeKey:`order:${orderId}:payment-confirmed`,title:"Η πληρωμή επιβεβαιώθηκε",body:`Η πληρωμή για την παραγγελία ${orderId} επιβεβαιώθηκε.`,payload:{orderId,amountMinor:total},now});
      }
    }else if(provider.statusId==="A"){
      if(["created","requires_action","authorised","failed"].includes(currentPaymentStatus)){paymentStatus="requires_action";await tx.query(`UPDATE payments SET status='requires_action',provider_transaction_id=COALESCE(provider_transaction_id,$2),provider_verified_at=$3,updated_at=$3 WHERE id=$1 AND status IN ('created','requires_action','authorised','failed')`,[paymentUuid,provider.transactionId,new Date(now)]);}
    }else if(provider.statusId==="E"){
      if(["created","requires_action","authorised","failed"].includes(currentPaymentStatus)){paymentStatus="failed";await tx.query(`UPDATE payments SET status='failed',provider_transaction_id=COALESCE(provider_transaction_id,$2),provider_verified_at=$3,updated_at=$3 WHERE id=$1 AND status IN ('created','requires_action','authorised','failed')`,[paymentUuid,provider.transactionId,new Date(now)]);}
      // Viva documents failed webhooks as non-final; keep the order/reservations pending for a subsequent successful attempt until their normal expiry.
    }else if(provider.statusId==="X"){
      if(capturedMinor===0&&["created","requires_action","authorised","failed","cancelled"].includes(currentPaymentStatus)){paymentStatus="cancelled";await tx.query(`UPDATE payments SET status='cancelled',provider_transaction_id=COALESCE(provider_transaction_id,$2),provider_verified_at=$3,updated_at=$3 WHERE id=$1 AND captured_minor=0 AND status IN ('created','requires_action','authorised','failed','cancelled')`,[paymentUuid,provider.transactionId,new Date(now)]);await this.#cancelPendingOrder(tx,orderUuid,now,"viva_cancelled");orderStatus="cancelled";}
    }else if(["M","MA","MI","ML","MS"].includes(provider.statusId)){
      paymentStatus="chargeback"; await tx.query(`UPDATE payments SET status='chargeback',provider_transaction_id=COALESCE(provider_transaction_id,$2),provider_verified_at=$3,updated_at=$3 WHERE id=$1`,[paymentUuid,provider.transactionId,new Date(now)]);
    }else if(provider.statusId==="MW"){
      paymentStatus=refundedMinor>=total?"refunded":refundedMinor>0?"partially_refunded":"captured"; await tx.query(`UPDATE payments SET status=CASE WHEN refunded_minor>=$2 THEN 'refunded'::payment_status WHEN refunded_minor>0 THEN 'partially_refunded'::payment_status ELSE 'captured'::payment_status END,provider_verified_at=$3,updated_at=$3 WHERE id=$1 AND status='chargeback'`,[paymentUuid,total,new Date(now)]);
    }else if(provider.statusId!=="R") throw new Error(`Unsupported Viva status ${provider.statusId}`);
    await this.#paymentEvent(tx,paymentUuid,`transaction:${provider.transactionId}:${provider.statusId}`,`transaction_${provider.statusId}`,{transactionId:provider.transactionId,orderCode:provider.orderCode,statusId:provider.statusId,amountMinor:provider.amountMinor,source},now);
    return{orderId,paymentStatus,orderStatus,transactionId:provider.transactionId,amountMinor:provider.amountMinor};
  }

  async #reconcileReversal(envelope:VivaWebhookEnvelope,reversalTransactionId:string,now:number):Promise<VivaRefundState>{
    const data=envelope.EventData??{};const parentId=text(data.ParentId??data.parentId,"Viva reversal ParentId");const orderCode=orderCodeText(data.OrderCode??data.orderCode);const amountMinor=Math.abs(majorCurrencyToMinor(data.Amount??data.amount,"Viva reversal amount"));
    const verified=await this.#client.retrieveTransaction(reversalTransactionId);
    if(verified.orderCode!==orderCode||!["F","R"].includes(verified.statusId)) throw new Error("Viva reversal verification failed");
    return this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{
      const found=await tx.query<SqlRow>(`SELECT p.id::text AS payment_uuid,p.captured_minor,p.refunded_minor,o.id::text AS order_uuid,o.public_id AS order_id FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE p.provider='viva' AND p.provider_transaction_id=$1 AND p.provider_order_code=$2 FOR UPDATE OF p`,[parentId,orderCode]);
      if(!found.rowCount) throw new Error("Unknown Viva reversal parent transaction");const row=found.rows[0],paymentUuid=text(row.payment_uuid,"payment_uuid"),eventId=`reversal:${reversalTransactionId}`;
      const prior=await tx.query<SqlRow>(`SELECT 1 AS hit FROM payment_events WHERE provider='viva' AND provider_event_id=$1`,[eventId]);if(prior.rowCount)return{id:eventId,status:"completed",amountMinor,providerRefundId:reversalTransactionId};
      const captured=integer(row.captured_minor,"captured_minor"),refunded=integer(row.refunded_minor,"refunded_minor"),next=Math.min(captured,refunded+amountMinor);
      await tx.query(`UPDATE payments SET refunded_minor=$2,status=(CASE WHEN $2>=captured_minor THEN 'refunded' ELSE 'partially_refunded' END)::payment_status,provider_verified_at=$3,updated_at=$3 WHERE id=$1`,[paymentUuid,next,new Date(now)]);
      const matching=await tx.query<SqlRow>(`SELECT id::text AS refund_uuid,public_id FROM refunds WHERE payment_id=$1 AND status IN ('processing','manual_review') AND amount_minor=$2 ORDER BY created_at LIMIT 1 FOR UPDATE`,[paymentUuid,amountMinor]);
      let refundId=eventId;if(matching.rowCount){refundId=text(matching.rows[0].public_id,"refund.public_id");await tx.query(`UPDATE refunds SET status='completed',provider_refund_id=$2,provider_status=$3,provider_event_id=$4,provider_payload=$5::jsonb,completed_at=$6,updated_at=$6,failure_code=NULL,failure_message=NULL WHERE id=$1`,[text(matching.rows[0].refund_uuid,"refund_uuid"),reversalTransactionId,verified.statusId,eventId,JSON.stringify({orderCode,parentId,amountMinor}),new Date(now)]);}
      await this.#paymentEvent(tx,paymentUuid,eventId,"transaction_reversal_created",{transactionId:reversalTransactionId,parentId,orderCode,amountMinor},now);
      return{id:refundId,status:"completed",amountMinor,providerRefundId:reversalTransactionId};
    },{isolation:"serializable"});
  }

  async #finalizeRefundFailure(refundUuid:string,amountMinor:number,code:number|undefined,message:string,payload:unknown,now:number):Promise<VivaRefundState>{return this.#uow.withTransaction({marketId:"sparta",platformAccess:true},async(tx)=>{const r=await tx.query<SqlRow>(`UPDATE refunds SET status='failed',failure_code=$2,failure_message=$3,provider_payload=$4::jsonb,updated_at=$5 WHERE id=$1 RETURNING public_id`,[refundUuid,code==null?"provider_rejected":String(code),message.slice(0,500),JSON.stringify(payload),new Date(now)]);return{id:text(r.rows[0].public_id,"refund.public_id"),status:"failed",amountMinor,error:message}}, {isolation:"serializable"});}
  async #enqueueOrderNotification(tx:SqlExecutor,input:{paymentUuid:string;eventType:string;dedupeKey:string;title:string;body:string;payload:Record<string,unknown>;now:number}){
    const owner=await tx.query<SqlRow>(`SELECT o.user_id::text AS user_uuid FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE p.id=$1`,[input.paymentUuid]);
    const userUuid=optionalText(owner.rows[0]?.user_uuid);if(!userUuid)return;
    const channels = this.#emailNotificationsEnabled ? (["in_app","email"] as const) : (["in_app"] as const);
    for(const channel of channels){
      await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at) VALUES($1,$2,$3,$4,'transactional',$5,'payments-v1','el',$6,$7,$8::jsonb,'queued',$9,$10) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`,[randomUUID(),id("notification"),userUuid,channel,input.eventType,input.title,input.body,JSON.stringify(input.payload),`${input.dedupeKey}:${channel}`,new Date(input.now)]);
    }
  }

  async #paymentEvent(tx:SqlExecutor,paymentUuid:string,providerEventId:string,eventType:string,payload:unknown,now:number){await tx.query(`INSERT INTO payment_events(id,public_id,payment_id,provider,provider_event_id,event_type,signature_valid,payload,processed_at,created_at) VALUES($1,$2,$3,'viva',$4,$5,true,$6::jsonb,$7,$7) ON CONFLICT(provider,provider_event_id) DO NOTHING`,[randomUUID(),id("payment_event"),paymentUuid,providerEventId,eventType,JSON.stringify(payload),new Date(now)]);}
  async #cancelPendingOrder(tx:SqlExecutor,orderUuid:string,now:number,reason:string){const reservations=await tx.query<SqlRow>(`SELECT sr.id::text AS reservation_uuid FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='active'`,[orderUuid]);for(const r of reservations.rows)await tx.query(`SELECT release_stock_reservation($1::uuid,$2,$3,NULL)`,[text(r.reservation_uuid,"reservation_uuid"),new Date(now),reason]);await tx.query(`UPDATE order_lines SET status='cancelled' WHERE order_id=$1 AND status IN ('awaiting_vendor','accepted')`,[orderUuid]);await tx.query(`UPDATE fulfilment_orders SET status='cancelled',updated_at=$2 WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')`,[orderUuid,new Date(now)]);await tx.query(`UPDATE customer_orders SET status='cancelled',cancelled_at=$2,cancellation_reason=$3,updated_at=$2 WHERE id=$1 AND status='pending_payment'`,[orderUuid,new Date(now),reason]);}
}

function visitorHash(value:string):string{return createHash("sha256").update(value).digest("hex")}
function locale(value:string|undefined):string{return value?.toLowerCase().startsWith("en")?"en-GB":"el-GR"}
function text(value:unknown,label:string):string{if(typeof value!=="string"||!value)throw new Error(`${label} missing`);return value}
function optionalText(value:unknown):string|undefined{return typeof value==="string"&&value.length?value:undefined}
function object(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>: {}}
function integer(value:unknown,label:string):number{const n=typeof value==="number"?value:Number(value);if(!Number.isSafeInteger(n))throw new Error(`${label} invalid`);return n}
function proportionalDiscount(totalDiscountMinor:number,quantity:number,totalQuantity:number):number{if(quantity<=0||totalDiscountMinor<=0)return 0;if(quantity>=totalQuantity)return totalDiscountMinor;return Math.floor((totalDiscountMinor*quantity)/totalQuantity)}
function orderCodeText(value:unknown):string|undefined{if(value==null)return undefined;const v=typeof value==="string"?value:typeof value==="number"&&Number.isSafeInteger(value)?String(value):"";if(!v)return undefined;if(!/^\d{16}$/.test(v))throw new Error("Invalid Viva order code in webhook");return v}