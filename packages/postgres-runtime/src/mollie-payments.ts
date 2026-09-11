import { createHash, randomUUID } from "node:crypto";
import { PostgresUnitOfWork, id, type SqlExecutor, type SqlPool, type SqlRow } from "@buy-local-sparta/core";
import { MollieApiError, MolliePaymentsClient, type MolliePayment, type MollieRefund } from "@buy-local-sparta/mollie-payments";

export type MolliePaymentsGateway = Pick<MolliePaymentsClient, "environment" | "createPayment" | "retrievePayment" | "createCapture" | "refund" | "retrieveRefund" | "cancelPayment" | "releaseAuthorization">;
export type MollieCheckoutPaymentMethod = "klarna";

const PAID_RESERVATION_HOLD_MS = 48 * 60 * 60 * 1000;
const REFUND_TERMINAL_FAILURES = new Set(["failed", "canceled", "cancelled"]);
const REFUND_PENDING = new Set(["queued", "pending", "processing"]);

export type MolliePaymentInitiation = Readonly<{ orderId: string; orderNumber: string; paymentId: string; checkoutUrl: string; amountMinor: number }>;
export type MolliePaymentReconciliation = Readonly<{ orderId: string; orderNumber: string; paymentStatus: string; orderStatus: string; paymentId: string; amountMinor: number }>;
export type MollieRefundState = Readonly<{ id: string; status: string; amountMinor: number; providerRefundId?: string; error?: string }>;
export type MollieCaptureState = Readonly<{ requested: boolean; paymentId?: string; captureId?: string; status?: string }>;

export class PostgresMolliePaymentsService {
  readonly #uow: PostgresUnitOfWork;
  readonly #client: MolliePaymentsGateway;
  readonly #publicBaseUrl: string;
  readonly #emailNotificationsEnabled: boolean;

  constructor(pool: SqlPool, client: MolliePaymentsGateway, options: { publicBaseUrl: string; emailNotificationsEnabled?: boolean }) {
    this.#uow = new PostgresUnitOfWork(pool, { statementTimeoutMs: 20_000, lockTimeoutMs: 8_000 });
    this.#client = client;
    this.#publicBaseUrl = normalizedPublicBaseUrl(options.publicBaseUrl);
    this.#emailNotificationsEnabled = options.emailNotificationsEnabled === true;
  }

  async initiateOrderPayment(input: {
    orderId: string;
    customerId?: string;
    visitorKey: string;
    paymentMethod?: MollieCheckoutPaymentMethod;
    now?: number;
  }): Promise<MolliePaymentInitiation> {
    const now = input.now ?? Date.now();
    const paymentMethod = input.paymentMethod;
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(input.visitorKey)) throw new Error("Trusted visitor identity is required");
    if (paymentMethod !== undefined && paymentMethod !== "klarna") throw new Error("Unsupported Mollie payment method");

    const prepared = await this.#uow.withTransaction({ actorUserId: input.customerId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.public_id AS order_id,o.order_number,o.status::text,o.total_minor,o.currency,o.visitor_hash,
          GREATEST(0,o.total_minor-COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0)) AS payable_minor,
          u.public_id AS customer_public_id,u.preferred_locale,
          p.id::text AS payment_uuid,p.provider,p.provider_payment_id,p.provider_transaction_id,p.provider_correlation_id,p.provider_payload,p.status::text AS payment_status
        FROM customer_orders o JOIN payments p ON p.order_id=o.id LEFT JOIN users u ON u.id=o.user_id
        WHERE o.public_id=$1 FOR UPDATE OF o,p`, [input.orderId]);
      if (!result.rowCount) throw new Error("ORDER_NOT_FOUND");
      const row = result.rows[0];
      const orderStatus = text(row.status, "order.status");
      if (orderStatus !== "pending_payment") throw new Error(`Order ${input.orderId} is not awaiting payment`);
      if (text(row.currency, "order.currency") !== "EUR") throw new Error("Mollie checkout is configured for EUR orders only");
      const storedCustomer = optionalText(row.customer_public_id);
      if (storedCustomer && storedCustomer !== input.customerId) throw new Error("Payment belongs to another customer");
      if (!storedCustomer && text(row.visitor_hash, "visitor_hash") !== visitorHash(input.visitorKey)) throw new Error("Payment belongs to another visitor");
      const amountMinor = integer(row.payable_minor, "payable_minor");
      if (amountMinor <= 0) throw new Error("Order has no remaining amount for Mollie payment");
      const orderNumber = optionalText(row.order_number) ?? input.orderId;
      const existingPaymentId = optionalText(row.provider_payment_id) ?? (text(row.provider, "payment.provider") === "mollie" ? optionalText(row.provider_transaction_id) : undefined);
      if (existingPaymentId) {
        return { kind: "existing" as const, paymentUuid: text(row.payment_uuid, "payment_uuid"), paymentId: existingPaymentId, amountMinor, orderNumber };
      }
      if (!["pending_psp", "mollie"].includes(text(row.provider, "payment.provider"))) throw new Error("Order payment is assigned to a different provider");
      const payload = object(row.provider_payload);
      const creationState = optionalText(payload.paymentCreationState);
      if (creationState === "creating" || creationState === "manual_review") {
        return { kind: "blocked" as const, state: creationState, attemptId: optionalText(row.provider_correlation_id) };
      }
      const attemptId = randomUUID();
      await tx.query(`UPDATE payments SET provider='mollie',status='requires_action',provider_correlation_id=$2,
        provider_payload=provider_payload||$3::jsonb,updated_at=$4 WHERE id=$1`, [
        text(row.payment_uuid, "payment_uuid"), attemptId,
        JSON.stringify({ paymentCreationState: "creating", paymentCreationAttemptId: attemptId, paymentCreationStartedAt: new Date(now).toISOString(), environment: this.#client.environment, orderNumber, paymentMethod: paymentMethod ?? "hosted" }),
        new Date(now)
      ]);
      await this.#paymentEvent(tx, text(row.payment_uuid, "payment_uuid"), `payment-attempt:${attemptId}`, "payment_creation_started", { attemptId, orderId: input.orderId, orderNumber, amountMinor, paymentMethod: paymentMethod ?? "hosted" }, now);
      return { kind: "create" as const, paymentUuid: text(row.payment_uuid, "payment_uuid"), attemptId, amountMinor, orderNumber, locale: locale(optionalText(row.preferred_locale)) };
    }, { isolation: "serializable" });

    if (prepared.kind === "blocked") throw new Error(`Mollie payment creation is ${prepared.state}; automatic retry is blocked pending reconciliation${prepared.attemptId ? ` (${prepared.attemptId})` : ""}`);

    if (prepared.kind === "existing") {
      const existing = await this.#client.retrievePayment(prepared.paymentId);
      this.#assertProviderIdentity(existing, input.orderId, prepared.orderNumber, prepared.amountMinor);
      if (paymentMethod === "klarna" && existing.method && existing.method !== "klarna") throw new Error("Existing Mollie payment was created with a different payment method");
      if (existing.status === "paid" || existing.status === "authorized" || existing.status === "failed" || existing.status === "expired" || existing.status === "canceled") {
        await this.reconcilePayment({ paymentId: existing.paymentId, source: "manual", now });
      }
      return {
        orderId: input.orderId,
        orderNumber: prepared.orderNumber,
        paymentId: existing.paymentId,
        checkoutUrl: existing.checkoutUrl ?? orderReturnUrl(this.#publicBaseUrl, input.orderId, "mollie"),
        amountMinor: prepared.amountMinor
      };
    }

    let created;
    try {
      created = await this.#client.createPayment({
        amountMinor: prepared.amountMinor,
        orderId: input.orderId,
        orderNumber: prepared.orderNumber,
        description: `KONTA MOY order ${prepared.orderNumber}`,
        redirectUrl: orderReturnUrl(this.#publicBaseUrl, input.orderId, "mollie"),
        cancelUrl: orderReturnUrl(this.#publicBaseUrl, input.orderId, "cancelled"),
        webhookUrl: new URL("/api/payments/mollie/webhook", this.#publicBaseUrl).toString(),
        locale: prepared.locale,
        method: paymentMethod === "klarna" ? "klarna" : undefined,
        captureMode: paymentMethod === "klarna" ? "manual" : undefined,
        metadata: { paymentCreationAttemptId: prepared.attemptId, paymentMethod: paymentMethod ?? "hosted" }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.#uow.withTransaction({ actorUserId: input.customerId, marketId: "sparta", platformAccess: true }, async (tx) => {
        await tx.query(`UPDATE payments SET provider_payload=provider_payload||$3::jsonb,updated_at=$4
          WHERE id=$1 AND provider_correlation_id=$2 AND provider_payment_id IS NULL`, [
          prepared.paymentUuid, prepared.attemptId,
          JSON.stringify({ paymentCreationState: "manual_review", paymentCreationError: message.slice(0, 500), paymentCreationFailedAt: new Date(now).toISOString() }), new Date(now)
        ]);
        await this.#paymentEvent(tx, prepared.paymentUuid, `payment-attempt-unknown:${prepared.attemptId}`, "payment_creation_unknown", { attemptId: prepared.attemptId, error: message.slice(0, 500) }, now);
      });
      throw new Error("Mollie payment creation outcome requires reconciliation; automatic retry is blocked");
    }

    return this.#uow.withTransaction({ actorUserId: input.customerId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const current = await tx.query<SqlRow>(`SELECT provider_payment_id,provider_correlation_id FROM payments WHERE id=$1 FOR UPDATE`, [prepared.paymentUuid]);
      if (!current.rowCount) throw new Error("Payment persistence disappeared during Mollie payment creation");
      const existing = optionalText(current.rows[0].provider_payment_id);
      if (existing) {
        const payment = await this.#client.retrievePayment(existing);
        return { orderId: input.orderId, orderNumber: prepared.orderNumber, paymentId: existing, checkoutUrl: payment.checkoutUrl ?? orderReturnUrl(this.#publicBaseUrl, input.orderId, "mollie"), amountMinor: prepared.amountMinor };
      }
      if (optionalText(current.rows[0].provider_correlation_id) !== prepared.attemptId) throw new Error("Mollie payment creation attempt was superseded and requires reconciliation");
      await tx.query(`UPDATE payments SET provider_payment_id=$2,provider_transaction_id=$2,provider_payload=provider_payload||$3::jsonb,updated_at=$4 WHERE id=$1`, [
        prepared.paymentUuid, created.paymentId,
        JSON.stringify({ paymentCreationState: "created", paymentCreationCompletedAt: new Date(now).toISOString(), initialProviderStatus: created.status, orderNumber: prepared.orderNumber, paymentMethod: paymentMethod ?? "hosted" }),
        new Date(now)
      ]);
      await this.#paymentEvent(tx, prepared.paymentUuid, `payment:${created.paymentId}`, "payment_created", { paymentId: created.paymentId, orderId: input.orderId, orderNumber: prepared.orderNumber, amountMinor: prepared.amountMinor, attemptId: prepared.attemptId, paymentMethod: paymentMethod ?? "hosted" }, now);
      return { orderId: input.orderId, orderNumber: prepared.orderNumber, paymentId: created.paymentId, checkoutUrl: created.checkoutUrl, amountMinor: prepared.amountMinor };
    }, { isolation: "serializable" });
  }

  async reconcilePayment(input: { paymentId: string; source: "redirect" | "webhook" | "manual"; now?: number }): Promise<MolliePaymentReconciliation> {
    const now = input.now ?? Date.now();
    const provider = await this.#client.retrievePayment(input.paymentId);
    const applied = await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => this.#applyPayment(tx, provider, input.source, now), { isolation: "serializable" });
    await this.reconcilePendingRefunds(input.paymentId, now);

    if (applied.orderStatus === "cancelled" && applied.paymentStatus === "captured") {
      try {
        const refund = await this.requestRefund({ orderId: applied.orderId, amountMinor: applied.amountMinor, idempotencyKey: `late-capture:${applied.orderId}`, reason: "late_capture_after_cancellation", now });
        if (refund.status === "completed") return { ...applied, paymentStatus: "refunded" };
      } catch {
        // The refund ledger blocks unsafe automatic retry when the provider outcome is unknown.
      }
    }
    return applied;
  }

  async captureKlarnaOrderIfFulfilled(input: { orderId: string; now?: number }): Promise<MollieCaptureState> {
    const now = input.now ?? Date.now();
    const prepared = await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.order_number,o.status::text AS order_status,p.id::text AS payment_uuid,p.status::text AS payment_status,
          p.provider,p.provider_payment_id,p.provider_transaction_id,p.provider_payload,
          EXISTS(SELECT 1 FROM fulfilment_orders fo WHERE fo.order_id=o.id AND fo.status='delivered') AS has_delivered,
          NOT EXISTS(SELECT 1 FROM fulfilment_orders fo WHERE fo.order_id=o.id AND fo.status NOT IN ('delivered','cancelled','rejected')) AS all_terminal
        FROM customer_orders o JOIN payments p ON p.order_id=o.id WHERE o.public_id=$1 FOR UPDATE OF o,p`, [input.orderId]);
      if (!result.rowCount) throw new Error("ORDER_NOT_FOUND");
      const row = result.rows[0];
      if (text(row.provider, "payment.provider") !== "mollie" || text(row.payment_status, "payment.status") !== "authorised") return { kind: "noop" as const };
      if (row.has_delivered !== true || row.all_terminal !== true) return { kind: "noop" as const };
      const paymentId = optionalText(row.provider_payment_id) ?? optionalText(row.provider_transaction_id);
      if (!paymentId) throw new Error("Authorised Mollie payment has no provider payment id");
      const payload = object(row.provider_payload);
      const state = optionalText(payload.klarnaCaptureState);
      if (state === "requested" || state === "creating" || state === "manual_review") {
        return { kind: "existing" as const, paymentId, captureId: optionalText(payload.klarnaCaptureId), status: state };
      }
      const attemptId = randomUUID();
      await tx.query(`UPDATE payments SET provider_payload=provider_payload||$2::jsonb,updated_at=$3 WHERE id=$1 AND status='authorised'`, [
        text(row.payment_uuid, "payment_uuid"),
        JSON.stringify({ klarnaCaptureState: "creating", klarnaCaptureAttemptId: attemptId, klarnaCaptureStartedAt: new Date(now).toISOString() }), new Date(now)
      ]);
      await this.#paymentEvent(tx, text(row.payment_uuid, "payment_uuid"), `capture-attempt:${attemptId}`, "capture_started", { orderId: input.orderId, paymentId, attemptId }, now);
      return { kind: "create" as const, paymentUuid: text(row.payment_uuid, "payment_uuid"), paymentId, attemptId, orderNumber: optionalText(row.order_number) ?? input.orderId };
    }, { isolation: "serializable" });

    if (prepared.kind === "noop") return { requested: false };
    if (prepared.kind === "existing") return { requested: true, paymentId: prepared.paymentId, captureId: prepared.captureId, status: prepared.status };

    const provider = await this.#client.retrievePayment(prepared.paymentId);
    this.#assertProviderIdentity(provider, input.orderId, prepared.orderNumber, provider.amountMinor);
    if (provider.method !== "klarna") throw new Error("Manual capture is reserved for Klarna payments");
    if (provider.status === "paid") {
      await this.reconcilePayment({ paymentId: prepared.paymentId, source: "manual", now });
      return { requested: true, paymentId: prepared.paymentId, status: "paid" };
    }
    if (provider.status !== "authorized") throw new Error(`Klarna payment cannot be captured from ${provider.status}`);

    try {
      const capture = await this.#client.createCapture({ paymentId: prepared.paymentId, description: `KONTA MOY fulfilment ${prepared.orderNumber}`, metadata: { orderId: input.orderId, orderNumber: prepared.orderNumber, captureAttemptId: prepared.attemptId } });
      await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
        await tx.query(`UPDATE payments SET provider_payload=provider_payload||$2::jsonb,updated_at=$3 WHERE id=$1`, [prepared.paymentUuid, JSON.stringify({ klarnaCaptureState: "requested", klarnaCaptureId: capture.captureId, klarnaCaptureProviderStatus: capture.status, klarnaCaptureRequestedAt: new Date(now).toISOString() }), new Date(now)]);
        await this.#paymentEvent(tx, prepared.paymentUuid, `capture:${capture.captureId}`, "capture_requested", { orderId: input.orderId, paymentId: prepared.paymentId, captureId: capture.captureId, status: capture.status, amountMinor: capture.amountMinor }, now);
      });
      await this.reconcilePayment({ paymentId: prepared.paymentId, source: "manual", now }).catch(() => undefined);
      return { requested: true, paymentId: prepared.paymentId, captureId: capture.captureId, status: capture.status };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
        await tx.query(`UPDATE payments SET provider_payload=provider_payload||$2::jsonb,updated_at=$3 WHERE id=$1`, [prepared.paymentUuid, JSON.stringify({ klarnaCaptureState: "manual_review", klarnaCaptureError: message.slice(0, 500), klarnaCaptureFailedAt: new Date(now).toISOString() }), new Date(now)]);
      });
      throw new Error("Klarna capture outcome requires reconciliation; automatic retry is blocked");
    }
  }

  async requestRefund(input: { orderId: string; amountMinor: number; idempotencyKey: string; reason: string; now?: number }): Promise<MollieRefundState> {
    const now = input.now ?? Date.now();
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) throw new Error("Refund amount must use positive integer minor units");
    if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 160) throw new Error("Refund idempotency key is invalid");

    const prepared: { kind: "existing"; state: MollieRefundState } | { kind: "create"; refundId: string; refundUuid: string; paymentUuid: string; paymentId: string; orderNumber: string } = await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const existing = await tx.query<SqlRow>(`SELECT public_id,status,amount_minor,provider_refund_id,failure_message FROM refunds WHERE idempotency_key=$1 FOR UPDATE`, [input.idempotencyKey]);
      if (existing.rowCount) {
        const row = existing.rows[0];
        return { kind: "existing" as const, state: { id: text(row.public_id, "refund.public_id"), status: text(row.status, "refund.status"), amountMinor: integer(row.amount_minor, "refund.amount"), providerRefundId: optionalText(row.provider_refund_id), error: optionalText(row.failure_message) } };
      }
      const found = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid,o.order_number,p.id::text AS payment_uuid,p.provider,p.provider_payment_id,p.provider_transaction_id,p.captured_minor,p.refunded_minor,p.status::text,p.currency
        FROM customer_orders o JOIN payments p ON p.order_id=o.id WHERE o.public_id=$1 FOR UPDATE OF p`, [input.orderId]);
      if (!found.rowCount) throw new Error("ORDER_NOT_FOUND");
      const row = found.rows[0];
      if (text(row.provider, "payment.provider") !== "mollie") throw new Error("Refund is assigned to a different payment provider");
      if (text(row.currency, "payment.currency") !== "EUR") throw new Error("Only EUR Mollie refunds are supported");
      const paymentId = optionalText(row.provider_payment_id) ?? text(row.provider_transaction_id, "Mollie payment id");
      const remaining = integer(row.captured_minor, "captured_minor") - integer(row.refunded_minor, "refunded_minor");
      if (input.amountMinor > remaining) throw new Error("Refund exceeds captured amount remaining");
      const refundId = id("refund");
      const refundUuid = randomUUID();
      await tx.query(`INSERT INTO refunds(id,public_id,order_id,payment_id,idempotency_key,amount_minor,currency,status,reason,created_at,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,'EUR','processing',$7,$8,$8)`, [refundUuid, refundId, text(row.order_uuid, "order_uuid"), text(row.payment_uuid, "payment_uuid"), input.idempotencyKey, input.amountMinor, input.reason.trim(), new Date(now)]);
      return { kind: "create" as const, refundId, refundUuid, paymentUuid: text(row.payment_uuid, "payment_uuid"), paymentId, orderNumber: optionalText(row.order_number) ?? input.orderId };
    }, { isolation: "serializable" });

    if (prepared.kind === "existing") {
      if (prepared.state.status === "processing" || prepared.state.status === "manual_review") return prepared.state;
      return prepared.state;
    }

    let providerRefund: MollieRefund;
    try {
      providerRefund = await this.#client.refund({
        paymentId: prepared.paymentId,
        amountMinor: input.amountMinor,
        description: `KONTA MOY refund ${prepared.orderNumber}`,
        metadata: { orderId: input.orderId, orderNumber: prepared.orderNumber, refundId: prepared.refundId, reason: input.reason.slice(0, 160) }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const deterministic = error instanceof MollieApiError && error.status >= 400 && error.status < 500 && error.status !== 429;
      if (deterministic) return this.#finalizeRefundFailure(prepared.refundUuid, input.amountMinor, `mollie_${error.status}`, message, now);
      await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
        await tx.query(`UPDATE refunds SET status='manual_review',failure_code='provider_outcome_unknown',failure_message=$2,updated_at=$3 WHERE id=$1 AND status='processing'`, [prepared.refundUuid, message.slice(0, 500), new Date(now)]);
      });
      throw new Error("Mollie refund outcome is unknown and requires reconciliation; automatic retry is blocked");
    }

    if (providerRefund.paymentId !== prepared.paymentId || providerRefund.amountMinor !== input.amountMinor || providerRefund.amountCurrency !== "EUR") {
      await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
        await tx.query(`UPDATE refunds SET status='manual_review',provider_refund_id=$2,provider_status=$3,failure_code='provider_mismatch',failure_message='Mollie refund response did not match the requested payment/amount',provider_payload=$4::jsonb,updated_at=$5 WHERE id=$1`, [prepared.refundUuid, providerRefund.refundId, providerRefund.status, JSON.stringify(providerRefund), new Date(now)]);
      });
      throw new Error("Mollie refund response mismatch requires manual review");
    }

    await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      await tx.query(`UPDATE refunds SET provider_refund_id=$2,provider_status=$3,provider_event_id=$2,provider_payload=$4::jsonb,updated_at=$5 WHERE id=$1`, [prepared.refundUuid, providerRefund.refundId, providerRefund.status, JSON.stringify(providerRefund), new Date(now)]);
    });

    if (providerRefund.status === "refunded") return this.#finalizeRefundSuccess(prepared.refundUuid, prepared.paymentUuid, providerRefund, now);
    if (REFUND_TERMINAL_FAILURES.has(providerRefund.status)) return this.#finalizeRefundFailure(prepared.refundUuid, input.amountMinor, `mollie_${providerRefund.status}`, `Mollie refund ${providerRefund.status}`, now);
    return { id: prepared.refundId, status: REFUND_PENDING.has(providerRefund.status) ? "processing" : "manual_review", amountMinor: input.amountMinor, providerRefundId: providerRefund.refundId };
  }

  async reconcilePendingRefunds(paymentId: string, now = Date.now()): Promise<readonly MollieRefundState[]> {
    const pending = await this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT r.id::text AS refund_uuid,r.public_id,r.amount_minor,r.provider_refund_id,p.id::text AS payment_uuid
        FROM refunds r JOIN payments p ON p.id=r.payment_id
        WHERE p.provider='mollie' AND COALESCE(p.provider_payment_id,p.provider_transaction_id)=$1
          AND r.status IN ('processing','manual_review') AND r.provider_refund_id IS NOT NULL
        ORDER BY r.created_at`, [paymentId]);
      return result.rows.map((row) => ({ refundUuid: text(row.refund_uuid, "refund_uuid"), refundId: text(row.public_id, "refund.public_id"), amountMinor: integer(row.amount_minor, "refund.amount"), providerRefundId: text(row.provider_refund_id, "provider_refund_id"), paymentUuid: text(row.payment_uuid, "payment_uuid") }));
    }, { readOnly: true });

    const states: MollieRefundState[] = [];
    for (const row of pending) {
      try {
        const providerRefund = await this.#client.retrieveRefund(paymentId, row.providerRefundId);
        if (providerRefund.status === "refunded") states.push(await this.#finalizeRefundSuccess(row.refundUuid, row.paymentUuid, providerRefund, now));
        else if (REFUND_TERMINAL_FAILURES.has(providerRefund.status)) states.push(await this.#finalizeRefundFailure(row.refundUuid, row.amountMinor, `mollie_${providerRefund.status}`, `Mollie refund ${providerRefund.status}`, now));
        else states.push({ id: row.refundId, status: "processing", amountMinor: row.amountMinor, providerRefundId: row.providerRefundId });
      } catch (error) {
        states.push({ id: row.refundId, status: "manual_review", amountMinor: row.amountMinor, providerRefundId: row.providerRefundId, error: error instanceof Error ? error.message : String(error) });
      }
    }
    return states;
  }

  async executeApprovedReturnRefund(input: { returnId: string; actorUserId: string; now?: number }): Promise<MollieRefundState> {
    const now = input.now ?? Date.now();
    const prepared = await this.#uow.withTransaction({ actorUserId: input.actorUserId, marketId: "sparta", platformAccess: true }, async (tx) => {
      const rows = await tx.query<SqlRow>(`SELECT r.public_id AS return_id,r.status::text AS return_status,r.approved_remedy,o.public_id AS order_id,
          ol.quantity AS line_quantity,ol.refunded_quantity,ol.retail_unit_price_minor,ol.discount_allocation_minor,rl.quantity AS return_quantity
        FROM returns r JOIN customer_orders o ON o.id=r.order_id JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
        WHERE r.public_id=$1 OR r.id::text=$1 ORDER BY ol.public_id FOR UPDATE OF r,ol,rl`, [input.returnId]);
      if (!rows.rowCount) throw new Error("Return not found");
      const first = rows.rows[0];
      if (text(first.return_status, "return.status") === "refunded") {
        const existing = await tx.query<SqlRow>(`SELECT rf.public_id,rf.status,rf.amount_minor,rf.provider_refund_id FROM refunds rf JOIN returns r ON r.order_id=rf.order_id WHERE r.public_id=$1 AND rf.reason=$2 ORDER BY rf.created_at DESC LIMIT 1`, [text(first.return_id, "return_id"), `approved_return:${text(first.return_id, "return_id")}`]);
        if (existing.rowCount) { const row = existing.rows[0]; return { already: true as const, state: { id: text(row.public_id, "refund.public_id"), status: text(row.status, "refund.status"), amountMinor: integer(row.amount_minor, "refund.amount"), providerRefundId: optionalText(row.provider_refund_id) } }; }
      }
      if (text(first.return_status, "return.status") !== "remedy_approved" || text(first.approved_remedy, "approved_remedy") !== "refund") throw new Error("Return refund has not been approved");
      let amountMinor = 0;
      for (const row of rows.rows) {
        const total = integer(row.line_quantity, "line.quantity"), old = integer(row.refunded_quantity, "line.refunded_quantity"), qty = integer(row.return_quantity, "return.quantity");
        if (qty <= 0 || old + qty > total) throw new Error("Return quantity exceeds refundable quantity");
        const discount = integer(row.discount_allocation_minor ?? 0, "discount_allocation_minor");
        const prior = proportionalDiscount(discount, old, total), next = proportionalDiscount(discount, old + qty, total);
        amountMinor += integer(row.retail_unit_price_minor, "retail_unit_price_minor") * qty - (next - prior);
      }
      if (amountMinor <= 0) throw new Error("Approved return has no refundable customer value");
      return { already: false as const, returnId: text(first.return_id, "return_id"), orderId: text(first.order_id, "order_id"), amountMinor };
    }, { isolation: "serializable" });
    if (prepared.already) return prepared.state;
    return this.requestRefund({ orderId: prepared.orderId, amountMinor: prepared.amountMinor, idempotencyKey: `return-refund:${prepared.returnId}`, reason: `approved_return:${prepared.returnId}`, now });
  }

  async prepareOrderCancellation(input: { orderId: string; reason: string; now?: number }): Promise<void> {
    const now = input.now ?? Date.now();
    const state = await this.paymentForOrder(input.orderId);
    if (!state || state.provider !== "mollie") return;
    const remaining = Math.max(0, state.capturedMinor - state.refundedMinor);
    if (remaining > 0) {
      const refund = await this.requestRefund({ orderId: input.orderId, amountMinor: remaining, idempotencyKey: `order-cancel:${input.orderId}`, reason: `customer_cancellation:${input.reason.trim()}`, now });
      if (refund.status !== "completed") throw new Error("Customer cancellation refund is still processing");
      return;
    }
    if (state.paymentId && !["cancelled", "refunded"].includes(state.status)) {
      const provider = await this.#client.retrievePayment(state.paymentId);
      if (provider.status === "authorized") {
        try { await this.#client.releaseAuthorization(state.paymentId); } catch { /* Reconciliation below detects a race to capture/payment completion. */ }
      } else {
        try { await this.#client.cancelPayment(state.paymentId); } catch { /* Reconciliation below detects a race to payment completion. */ }
      }
      const reconciled = await this.reconcilePayment({ paymentId: state.paymentId, source: "manual", now });
      if (reconciled.paymentStatus === "captured") {
        const refund = await this.requestRefund({ orderId: input.orderId, amountMinor: reconciled.amountMinor, idempotencyKey: `order-cancel:${input.orderId}`, reason: `customer_cancellation:${input.reason.trim()}`, now });
        if (refund.status !== "completed") throw new Error("Customer cancellation refund is still processing");
      }
    }
  }

  async paymentForOrder(orderId: string): Promise<{ provider: string; status: string; capturedMinor: number; refundedMinor: number; paymentId?: string }> {
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`SELECT p.provider,p.status::text,p.captured_minor,p.refunded_minor,p.provider_payment_id,p.provider_transaction_id FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE o.public_id=$1`, [orderId]);
      if (!result.rowCount) return { provider: "", status: "", capturedMinor: 0, refundedMinor: 0 };
      const row = result.rows[0];
      return { provider: text(row.provider, "provider"), status: text(row.status, "status"), capturedMinor: integer(row.captured_minor, "captured_minor"), refundedMinor: integer(row.refunded_minor, "refunded_minor"), paymentId: optionalText(row.provider_payment_id) ?? optionalText(row.provider_transaction_id) };
    }, { readOnly: true });
  }

  async #applyPayment(tx: SqlExecutor, provider: MolliePayment, source: string, now: number): Promise<MolliePaymentReconciliation> {
    const found = await tx.query<SqlRow>(`SELECT p.id::text AS payment_uuid,p.status::text AS payment_status,p.captured_minor,p.refunded_minor,o.id::text AS order_uuid,o.public_id AS order_id,o.order_number,o.status::text AS order_status,o.currency,
      GREATEST(0,o.total_minor-COALESCE((SELECT SUM(-gcl.amount_minor) FROM gift_card_ledger gcl WHERE gcl.order_public_id=o.public_id AND gcl.entry_type='redeem'),0)) AS payable_minor
      FROM payments p JOIN customer_orders o ON o.id=p.order_id
      WHERE p.provider='mollie' AND (p.provider_payment_id=$1 OR p.provider_transaction_id=$1) FOR UPDATE OF p,o`, [provider.paymentId]);
    if (!found.rowCount) throw new Error("Unknown Mollie payment id");
    const row = found.rows[0];
    const orderId = text(row.order_id, "order_id");
    const orderNumber = optionalText(row.order_number) ?? orderId;
    const total = integer(row.payable_minor, "order.payable_minor");
    this.#assertProviderIdentity(provider, orderId, orderNumber, total);
    if (provider.amountCurrency !== "EUR" || text(row.currency, "order.currency") !== "EUR") throw new Error("Mollie currency mismatch");
    if (provider.amountRefundedMinor < 0 || provider.amountRefundedMinor > total) throw new Error("Mollie refunded amount is invalid");

    const paymentUuid = text(row.payment_uuid, "payment_uuid");
    const orderUuid = text(row.order_uuid, "order_uuid");
    const currentPaymentStatus = text(row.payment_status, "payment_status");
    const capturedMinor = integer(row.captured_minor, "captured_minor");
    let paymentStatus = currentPaymentStatus;
    let orderStatus = text(row.order_status, "order_status");

    if (provider.status === "paid") {
      const refunded = Math.max(integer(row.refunded_minor, "refunded_minor"), provider.amountRefundedMinor);
      paymentStatus = refunded >= total ? "refunded" : refunded > 0 ? "partially_refunded" : "captured";
      orderStatus = ["cancelled", "refunded", "partially_refunded"].includes(orderStatus) ? orderStatus : "confirmed";
      await tx.query(`UPDATE payments SET provider_payment_id=$2,provider_transaction_id=$2,provider_verified_at=$3,
        authorised_minor=GREATEST(authorised_minor,$4),captured_minor=GREATEST(captured_minor,$4),refunded_minor=GREATEST(refunded_minor,$5),
        status=(CASE WHEN GREATEST(refunded_minor,$5)>=$4 THEN 'refunded' WHEN GREATEST(refunded_minor,$5)>0 THEN 'partially_refunded' ELSE 'captured' END)::payment_status,
        provider_payload=provider_payload||$6::jsonb,updated_at=$3 WHERE id=$1`, [paymentUuid, provider.paymentId, new Date(now), total, provider.amountRefundedMinor, JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, method: provider.method ?? null, orderNumber })]);
      if (orderStatus === "confirmed") {
        await tx.query(`UPDATE customer_orders SET status='confirmed',confirmed_at=COALESCE(confirmed_at,$2),updated_at=$2 WHERE id=$1`, [orderUuid, new Date(now)]);
        await tx.query(`UPDATE stock_reservations SET expires_at=GREATEST(expires_at,$2) WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=$1) AND status='active'`, [orderUuid, new Date(now + PAID_RESERVATION_HOLD_MS)]);
        await this.#enqueueOrderNotification(tx, { paymentUuid, eventType: "order.payment_confirmed", dedupeKey: `order:${orderId}:payment-confirmed`, title: "Η πληρωμή επιβεβαιώθηκε", body: `Η πληρωμή για την παραγγελία ${orderNumber} επιβεβαιώθηκε.`, payload: { orderId, orderNumber, amountMinor: total }, now });
      }
    } else if (provider.status === "authorized") {
      if (capturedMinor === 0 && ["created", "requires_action", "authorised", "failed"].includes(currentPaymentStatus)) {
        paymentStatus = "authorised";
        await tx.query(`UPDATE payments SET status='authorised',provider_payment_id=$2,provider_transaction_id=$2,authorised_minor=GREATEST(authorised_minor,$3),provider_verified_at=$4,provider_payload=provider_payload||$5::jsonb,updated_at=$4 WHERE id=$1`, [paymentUuid, provider.paymentId, total, new Date(now), JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, method: provider.method ?? null })]);
        if (provider.method === "klarna" && !["cancelled", "refunded", "partially_refunded"].includes(orderStatus)) {
          orderStatus = "authorised";
          await tx.query(`UPDATE customer_orders SET status='authorised',updated_at=$2 WHERE id=$1 AND status='pending_payment'`, [orderUuid, new Date(now)]);
          await tx.query(`UPDATE stock_reservations SET expires_at=GREATEST(expires_at,$2) WHERE order_line_id IN (SELECT id FROM order_lines WHERE order_id=$1) AND status='active'`, [orderUuid, new Date(now + PAID_RESERVATION_HOLD_MS)]);
          await this.#enqueueOrderNotification(tx, { paymentUuid, eventType: "order.payment_authorised", dedupeKey: `order:${orderId}:payment-authorised`, title: "Η πληρωμή με Klarna εγκρίθηκε", body: `Η Klarna ενέκρινε την παραγγελία ${orderNumber}. Η χρέωση θα οριστικοποιηθεί με την εκτέλεση της παραγγελίας.`, payload: { orderId, orderNumber, amountMinor: total, method: "klarna" }, now });
        }
      }
    } else if (provider.status === "open" || provider.status === "pending") {
      if (capturedMinor === 0 && ["created", "requires_action", "authorised", "failed"].includes(currentPaymentStatus)) {
        paymentStatus = "requires_action";
        await tx.query(`UPDATE payments SET status='requires_action',provider_payment_id=$2,provider_transaction_id=$2,provider_verified_at=$3,provider_payload=provider_payload||$4::jsonb,updated_at=$3 WHERE id=$1`, [paymentUuid, provider.paymentId, new Date(now), JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, method: provider.method ?? null })]);
      }
    } else if (provider.status === "failed") {
      if (capturedMinor === 0 && ["created", "requires_action", "authorised", "failed"].includes(currentPaymentStatus)) {
        paymentStatus = "failed";
        await tx.query(`UPDATE payments SET status='failed',provider_payment_id=$2,provider_transaction_id=$2,provider_verified_at=$3,provider_payload=provider_payload||$4::jsonb,updated_at=$3 WHERE id=$1`, [paymentUuid, provider.paymentId, new Date(now), JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, method: provider.method ?? null })]);
      }
    } else if (provider.status === "canceled" || provider.status === "expired") {
      if (capturedMinor === 0 && ["created", "requires_action", "authorised", "failed", "cancelled"].includes(currentPaymentStatus)) {
        paymentStatus = "cancelled";
        await tx.query(`UPDATE payments SET status='cancelled',provider_payment_id=$2,provider_transaction_id=$2,provider_verified_at=$3,provider_payload=provider_payload||$4::jsonb,updated_at=$3 WHERE id=$1 AND captured_minor=0`, [paymentUuid, provider.paymentId, new Date(now), JSON.stringify({ lastProviderStatus: provider.status, lastVerifiedSource: source, method: provider.method ?? null })]);
        await this.#cancelPendingOrder(tx, orderUuid, now, `mollie_${provider.status}`);
        orderStatus = "cancelled";
      }
    }

    await this.#paymentEvent(tx, paymentUuid, `payment:${provider.paymentId}:${provider.status}:${provider.amountRefundedMinor}`, `payment_${provider.status}`, { paymentId: provider.paymentId, orderId, orderNumber, status: provider.status, amountMinor: provider.amountMinor, amountRefundedMinor: provider.amountRefundedMinor, method: provider.method ?? null, source }, now);
    return { orderId, orderNumber, paymentStatus, orderStatus, paymentId: provider.paymentId, amountMinor: provider.amountMinor };
  }

  #assertProviderIdentity(provider: MolliePayment, orderId: string, orderNumber: string, amountMinor: number): void {
    if (provider.orderId !== orderId) throw new Error("Mollie payment/order id mismatch");
    if (provider.orderNumber !== orderNumber) throw new Error("Mollie payment/order number mismatch");
    if (provider.amountMinor !== amountMinor) throw new Error(`Mollie amount mismatch: expected ${amountMinor}, received ${provider.amountMinor}`);
  }

  async #finalizeRefundSuccess(refundUuid: string, paymentUuid: string, providerRefund: MollieRefund, now: number): Promise<MollieRefundState> {
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const refundRow = await tx.query<SqlRow>(`UPDATE refunds SET status='completed',provider_refund_id=$2,provider_status=$3,provider_event_id=$2,provider_payload=$4::jsonb,completed_at=COALESCE(completed_at,$5),updated_at=$5,failure_code=NULL,failure_message=NULL WHERE id=$1 RETURNING public_id,amount_minor,reason,order_id::text`, [refundUuid, providerRefund.refundId, providerRefund.status, JSON.stringify(providerRefund), new Date(now)]);
      if (!refundRow.rowCount) throw new Error("Refund persistence disappeared during Mollie reconciliation");
      const row = refundRow.rows[0];
      const amountMinor = integer(row.amount_minor, "refund.amount_minor");
      const aggregate = await tx.query<SqlRow>(`SELECT COALESCE(SUM(amount_minor),0) AS refunded_minor FROM refunds WHERE payment_id=$1 AND status='completed'`, [paymentUuid]);
      const refundedMinor = integer(aggregate.rows[0]?.refunded_minor ?? 0, "refunded_minor");
      await tx.query(`UPDATE payments SET refunded_minor=LEAST(captured_minor,$2),status=(CASE WHEN LEAST(captured_minor,$2)>=captured_minor THEN 'refunded' ELSE 'partially_refunded' END)::payment_status,updated_at=$3 WHERE id=$1 AND captured_minor>0`, [paymentUuid, refundedMinor, new Date(now)]);
      await this.#paymentEvent(tx, paymentUuid, `refund:${providerRefund.refundId}:refunded`, "refund_completed", { refundId: text(row.public_id, "refund.public_id"), providerRefundId: providerRefund.refundId, amountMinor }, now);
      await this.#enqueueOrderNotification(tx, { paymentUuid, eventType: "order.refund_completed", dedupeKey: `refund:${text(row.public_id, "refund.public_id")}:completed`, title: "Η επιστροφή χρημάτων ολοκληρώθηκε", body: "Η επιστροφή χρημάτων για την παραγγελία σας ολοκληρώθηκε.", payload: { refundId: text(row.public_id, "refund.public_id"), amountMinor, providerRefundId: providerRefund.refundId }, now });
      const reason = optionalText(row.reason);
      if (reason?.startsWith("approved_return:")) await this.#completeApprovedReturn(tx, reason.slice("approved_return:".length), refundUuid, now);
      return { id: text(row.public_id, "refund.public_id"), status: "completed", amountMinor, providerRefundId: providerRefund.refundId };
    }, { isolation: "serializable" });
  }

  async #completeApprovedReturn(tx: SqlExecutor, returnId: string, refundUuid: string, now: number): Promise<void> {
    const rows = await tx.query<SqlRow>(`SELECT r.id::text AS return_uuid,r.status::text,o.id::text AS order_uuid,rl.order_line_id::text AS line_uuid,rl.quantity
      FROM returns r JOIN customer_orders o ON o.id=r.order_id JOIN return_lines rl ON rl.return_id=r.id WHERE r.public_id=$1 FOR UPDATE OF r,rl`, [returnId]);
    if (!rows.rowCount || text(rows.rows[0].status, "return.status") === "refunded") return;
    for (const row of rows.rows) {
      await tx.query(`UPDATE order_lines SET refunded_quantity=LEAST(quantity,refunded_quantity+$2),status=CASE WHEN refunded_quantity+$2>=quantity THEN 'refunded' ELSE status END WHERE id=$1`, [text(row.line_uuid, "line_uuid"), integer(row.quantity, "return.quantity")]);
      await tx.query(`UPDATE return_lines SET refund_id=$3 WHERE return_id=$1 AND order_line_id=$2`, [text(row.return_uuid, "return_uuid"), text(row.line_uuid, "line_uuid"), refundUuid]);
    }
    const returnUuid = text(rows.rows[0].return_uuid, "return_uuid");
    const orderUuid = text(rows.rows[0].order_uuid, "order_uuid");
    await tx.query(`UPDATE returns SET status='refunded',closed_at=$2,updated_at=$2 WHERE id=$1`, [returnUuid, new Date(now)]);
    await tx.query(`UPDATE customer_orders SET status=(CASE WHEN NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id=$1 AND status<>'cancelled' AND refunded_quantity<quantity) THEN 'refunded' ELSE 'partially_refunded' END)::order_status,updated_at=$2 WHERE id=$1`, [orderUuid, new Date(now)]);
  }

  async #finalizeRefundFailure(refundUuid: string, amountMinor: number, code: string, message: string, now: number): Promise<MollieRefundState> {
    return this.#uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
      const result = await tx.query<SqlRow>(`UPDATE refunds SET status='failed',failure_code=$2,failure_message=$3,updated_at=$4 WHERE id=$1 RETURNING public_id,provider_refund_id`, [refundUuid, code, message.slice(0, 500), new Date(now)]);
      if (!result.rowCount) throw new Error("Refund persistence disappeared while recording failure");
      return { id: text(result.rows[0].public_id, "refund.public_id"), status: "failed", amountMinor, providerRefundId: optionalText(result.rows[0].provider_refund_id), error: message };
    }, { isolation: "serializable" });
  }

  async #enqueueOrderNotification(tx: SqlExecutor, input: { paymentUuid: string; eventType: string; dedupeKey: string; title: string; body: string; payload: Record<string, unknown>; now: number }) {
    const owner = await tx.query<SqlRow>(`SELECT o.user_id::text AS user_uuid FROM payments p JOIN customer_orders o ON o.id=p.order_id WHERE p.id=$1`, [input.paymentUuid]);
    const userUuid = optionalText(owner.rows[0]?.user_uuid);
    if (!userUuid) return;
    const channels = this.#emailNotificationsEnabled ? (["in_app", "email"] as const) : (["in_app"] as const);
    for (const channel of channels) {
      await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at) VALUES($1,$2,$3,$4,'transactional',$5,'payments-v1','el',$6,$7,$8::jsonb,'queued',$9,$10) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [randomUUID(), id("notification"), userUuid, channel, input.eventType, input.title, input.body, JSON.stringify(input.payload), `${input.dedupeKey}:${channel}`, new Date(input.now)]);
    }
  }

  async #paymentEvent(tx: SqlExecutor, paymentUuid: string, providerEventId: string, eventType: string, payload: unknown, now: number) {
    await tx.query(`INSERT INTO payment_events(id,public_id,payment_id,provider,provider_event_id,event_type,signature_valid,payload,processed_at,created_at) VALUES($1,$2,$3,'mollie',$4,$5,true,$6::jsonb,$7,$7) ON CONFLICT(provider,provider_event_id) DO NOTHING`, [randomUUID(), id("payment_event"), paymentUuid, providerEventId, eventType, JSON.stringify(payload), new Date(now)]);
  }

  async #cancelPendingOrder(tx: SqlExecutor, orderUuid: string, now: number, reason: string) {
    const reservations = await tx.query<SqlRow>(`SELECT sr.id::text AS reservation_uuid FROM stock_reservations sr JOIN order_lines ol ON ol.id=sr.order_line_id WHERE ol.order_id=$1 AND sr.status='active'`, [orderUuid]);
    for (const row of reservations.rows) await tx.query(`SELECT release_stock_reservation($1::uuid,$2,$3,NULL)`, [text(row.reservation_uuid, "reservation_uuid"), new Date(now), reason]);
    await tx.query(`UPDATE order_lines SET status='cancelled' WHERE order_id=$1 AND status IN ('awaiting_vendor','accepted')`, [orderUuid]);
    await tx.query(`UPDATE fulfilment_orders SET status='cancelled',updated_at=$2 WHERE order_id=$1 AND status NOT IN ('delivered','cancelled')`, [orderUuid, new Date(now)]);
    await tx.query(`UPDATE customer_orders SET status='cancelled',cancelled_at=$2,cancellation_reason=$3,updated_at=$2 WHERE id=$1 AND status IN ('pending_payment','authorised')`, [orderUuid, new Date(now), reason]);
  }
}

function orderReturnUrl(baseUrl: string, orderId: string, payment: string): string {
  const url = new URL("/account/orders", baseUrl);
  url.searchParams.set("payment", payment);
  url.searchParams.set("orderId", orderId);
  return url.toString();
}
function normalizedPublicBaseUrl(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname))) throw new Error("Mollie public base URL must use HTTPS outside localhost");
  parsed.pathname = "/"; parsed.search = ""; parsed.hash = "";
  return parsed.toString();
}
function visitorHash(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function locale(value: string | undefined): string { return value?.toLowerCase().startsWith("en") ? "en_GB" : "el_GR"; }
function text(value: unknown, label: string): string { if (typeof value !== "string" || !value) throw new Error(`${label} missing`); return value; }
function optionalText(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function integer(value: unknown, label: string): number { const n = typeof value === "number" ? value : Number(value); if (!Number.isSafeInteger(n)) throw new Error(`${label} invalid`); return n; }
function proportionalDiscount(totalDiscountMinor: number, quantity: number, totalQuantity: number): number { if (quantity <= 0 || totalDiscountMinor <= 0) return 0; if (quantity >= totalQuantity) return totalDiscountMinor; return Math.floor((totalDiscountMinor * quantity) / totalQuantity); }
