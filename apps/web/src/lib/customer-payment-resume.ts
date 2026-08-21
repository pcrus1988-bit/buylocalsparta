import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { requireVivaPayments, vivaPaymentsEnabled } from "./viva-runtime";

export type CustomerPaymentResumeResult = Readonly<{
  orderId: string;
  provider: "viva";
  orderCode: string;
  redirectUrl: string;
  amountMinor: number;
  reservationExpiresAt: number;
}>;

type PaymentWindow = Readonly<{ reservationExpiresAt: number }>;

function integer(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new Error("PAYMENT_WINDOW_INVALID");
  return parsed;
}

function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value ?? "")).getTime();
  if (!Number.isFinite(parsed)) throw new Error("PAYMENT_WINDOW_INVALID");
  return parsed;
}

async function activePaymentWindow(principal: SessionPrincipal, orderId: string, now: number): Promise<PaymentWindow> {
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT o.status::text AS order_status,
             COUNT(DISTINCT ol.id)::int AS line_count,
             COUNT(DISTINCT ol.id) FILTER (
               WHERE sr.status='active' AND sr.expires_at>$3
             )::int AS active_reserved_line_count,
             MIN(sr.expires_at) FILTER (
               WHERE sr.status='active' AND sr.expires_at>$3
             ) AS reservation_expires_at
      FROM customer_orders o
      JOIN users u ON u.id=o.user_id
      JOIN order_lines ol ON ol.order_id=o.id
      LEFT JOIN stock_reservations sr ON sr.order_line_id=ol.id
      WHERE o.public_id=$1 AND u.public_id=$2
      GROUP BY o.id,o.status
    `, [orderId, principal.userId, new Date(now)]);
    if (!result.rowCount) throw new Error("ORDER_NOT_FOUND");
    const row = result.rows[0];
    if (String(row.order_status) !== "pending_payment") throw new Error("PAYMENT_NOT_PENDING");
    const lineCount = integer(row.line_count);
    const activeReservedLineCount = integer(row.active_reserved_line_count);
    if (lineCount <= 0 || activeReservedLineCount !== lineCount || !row.reservation_expires_at) throw new Error("PAYMENT_WINDOW_EXPIRED");
    const reservationExpiresAt = epoch(row.reservation_expires_at);
    if (reservationExpiresAt <= now) throw new Error("PAYMENT_WINDOW_EXPIRED");
    return { reservationExpiresAt };
  }, { readOnly: true });
}

export async function resumeCustomerOrderPayment(
  principal: SessionPrincipal,
  input: { orderId: string; visitorKey: string; now?: number }
): Promise<CustomerPaymentResumeResult> {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
  if (!productionDatabaseConfigured()) throw new Error("PAYMENT_SERVICE_UNAVAILABLE");
  if (!vivaPaymentsEnabled()) throw new Error("PAYMENT_SERVICE_UNAVAILABLE");
  const orderId = input.orderId.trim();
  if (!orderId || orderId.length > 160) throw new Error("ORDER_NOT_FOUND");
  const startedAt = input.now ?? Date.now();

  await activePaymentWindow(principal, orderId, startedAt);
  const payment = await requireVivaPayments().initiateOrderPayment({
    orderId,
    customerId: principal.userId,
    visitorKey: input.visitorKey,
    now: startedAt
  });
  const window = await activePaymentWindow(principal, orderId, Date.now());

  return {
    orderId,
    provider: "viva",
    orderCode: payment.orderCode,
    redirectUrl: payment.checkoutUrl,
    amountMinor: payment.amountMinor,
    reservationExpiresAt: window.reservationExpiresAt
  };
}
