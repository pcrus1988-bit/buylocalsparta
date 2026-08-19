import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_RETURN_REASONS = ["withdrawal", "defect", "nonconformity", "transit_damage", "wrong_item", "missing_part", "other"] as const;
export type CustomerReturnReason = typeof CUSTOMER_RETURN_REASONS[number];
export const CUSTOMER_RETURN_REMEDIES = ["refund", "replacement", "repair"] as const;
export type CustomerReturnRemedy = typeof CUSTOMER_RETURN_REMEDIES[number];

export type CustomerReturnCase = Readonly<{
  id: string;
  returnNumber: string;
  orderId: string;
  status: string;
  reason: CustomerReturnReason | string;
  requestedRemedy?: string;
  approvedRemedy?: string;
  eligibilityState: string;
  eligibilityReason?: string;
  requestedAt: number;
  rmaCode?: string;
  returnByAt?: number;
  instructions?: string;
  carrier?: string;
  trackingNumber?: string;
  lines: readonly Readonly<{ orderLineId: string; quantity: number }>[];
}>;

export type CustomerReturnsSnapshot = Readonly<{
  cases: readonly CustomerReturnCase[];
  returnableByLine: Readonly<Record<string, number>>;
}>;

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
function epoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}
function returnNumber(now: number): string {
  const day = new Date(now).toISOString().slice(0, 10).replaceAll("-", "");
  return `RET-${day}-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}
function publicReturnId(): string { return `ret_${randomUUID().replaceAll("-", "").slice(0, 24)}`; }

export async function customerReturnsSnapshot(principal: SessionPrincipal, orderId: string): Promise<CustomerReturnsSnapshot> {
  if (!productionDatabaseConfigured()) return { cases: [], returnableByLine: {} };
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const owner = await tx.query<SqlRow>(`SELECT o.id::text AS order_uuid FROM customer_orders o JOIN users u ON u.id=o.user_id WHERE o.public_id=$1 AND u.public_id=$2`, [orderId, principal.userId]);
    if (!owner.rowCount) throw new Error("ORDER_NOT_FOUND");
    const orderUuid = text(owner.rows[0].order_uuid, "order_uuid");

    const lines = await tx.query<SqlRow>(`
      SELECT ol.id::text AS line_uuid,ol.public_id,ol.fulfilled_quantity,ol.refunded_quantity,
             COALESCE((SELECT SUM(rl.quantity) FROM return_lines rl JOIN returns r ON r.id=rl.return_id
               WHERE rl.order_line_id=ol.id AND r.status NOT IN ('rejected','refunded')),0)::int AS reserved_return_quantity
      FROM order_lines ol WHERE ol.order_id=$1 ORDER BY ol.created_at,ol.public_id`, [orderUuid]);
    const returnableByLine: Record<string, number> = {};
    for (const row of lines.rows) {
      const available = Math.max(0, integer(row.fulfilled_quantity, "fulfilled_quantity") - integer(row.refunded_quantity, "refunded_quantity") - integer(row.reserved_return_quantity, "reserved_return_quantity"));
      returnableByLine[text(row.public_id, "order_line.public_id")] = available;
    }

    const rows = await tx.query<SqlRow>(`
      SELECT r.id::text AS return_uuid,r.public_id,r.return_number,r.status::text,r.reason_type,r.requested_remedy,r.approved_remedy,
             r.eligibility_state,r.eligibility_reason,r.created_at,r.rma_code,r.return_by_at,r.destination_instructions,r.carrier,r.tracking_number,
             ol.public_id AS order_line_id,rl.quantity
      FROM returns r JOIN return_lines rl ON rl.return_id=r.id JOIN order_lines ol ON ol.id=rl.order_line_id
      WHERE r.order_id=$1 AND r.customer_user_id=(SELECT id FROM users WHERE public_id=$2)
      ORDER BY r.created_at DESC,ol.public_id`, [orderUuid, principal.userId]);
    const cases = new Map<string, { base: Omit<CustomerReturnCase, "lines">; lines: Array<{ orderLineId: string; quantity: number }> }>();
    for (const row of rows.rows) {
      const id = text(row.public_id, "return.public_id");
      let entry = cases.get(id);
      if (!entry) {
        entry = {
          base: {
            id,
            returnNumber: text(row.return_number, "return.return_number"),
            orderId,
            status: text(row.status, "return.status"),
            reason: text(row.reason_type, "return.reason_type"),
            requestedRemedy: optionalText(row.requested_remedy),
            approvedRemedy: optionalText(row.approved_remedy),
            eligibilityState: text(row.eligibility_state, "return.eligibility_state"),
            eligibilityReason: optionalText(row.eligibility_reason),
            requestedAt: epoch(row.created_at) ?? Date.now(),
            rmaCode: optionalText(row.rma_code),
            returnByAt: epoch(row.return_by_at),
            instructions: optionalText(row.destination_instructions),
            carrier: optionalText(row.carrier),
            trackingNumber: optionalText(row.tracking_number)
          },
          lines: []
        };
        cases.set(id, entry);
      }
      entry.lines.push({ orderLineId: text(row.order_line_id, "return.order_line_id"), quantity: integer(row.quantity, "return.quantity") });
    }
    return { cases: [...cases.values()].map(({ base, lines }) => ({ ...base, lines })), returnableByLine };
  }, { readOnly: true });
}

export async function requestCustomerReturn(principal: SessionPrincipal, input: {
  orderId: string;
  orderLineId: string;
  quantity: number;
  reason: CustomerReturnReason;
  requestedRemedy: CustomerReturnRemedy;
  note?: string;
  now?: number;
}): Promise<{ returnId: string; returnNumber: string }> {
  if (!productionDatabaseConfigured()) throw new Error("Returns require the production PostgreSQL runtime");
  if (!CUSTOMER_RETURN_REASONS.includes(input.reason)) throw new Error("Unsupported return reason");
  if (!CUSTOMER_RETURN_REMEDIES.includes(input.requestedRemedy)) throw new Error("Unsupported return remedy");
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) throw new Error("Return quantity must be a positive integer");
  const note = input.note?.trim();
  if (note && note.length > 1000) throw new Error("Return note must not exceed 1000 characters");
  const now = input.now ?? Date.now();
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT o.id::text AS order_uuid,o.status::text AS order_status,u.id::text AS customer_uuid,
             ol.id::text AS line_uuid,ol.public_id AS line_public_id,ol.quantity,ol.fulfilled_quantity,ol.refunded_quantity,ol.status::text AS line_status
      FROM customer_orders o JOIN users u ON u.id=o.user_id JOIN order_lines ol ON ol.order_id=o.id
      WHERE o.public_id=$1 AND u.public_id=$2 AND ol.public_id=$3
      FOR UPDATE OF o,ol`, [input.orderId, principal.userId, input.orderLineId]);
    if (!found.rowCount) throw new Error("ORDER_OR_LINE_NOT_FOUND");
    const row = found.rows[0];
    const fulfilled = integer(row.fulfilled_quantity, "fulfilled_quantity");
    const refunded = integer(row.refunded_quantity, "refunded_quantity");
    if (fulfilled <= 0) throw new Error("This item has not been fulfilled yet");
    if (["cancelled", "pending_payment", "draft"].includes(text(row.order_status, "order_status"))) throw new Error("This order is not eligible for a return request");

    const reserved = await tx.query<SqlRow>(`
      SELECT COALESCE(SUM(rl.quantity),0)::int AS quantity
      FROM return_lines rl JOIN returns r ON r.id=rl.return_id
      WHERE rl.order_line_id=$1 AND r.status NOT IN ('rejected','refunded')`, [text(row.line_uuid, "line_uuid")]);
    const returnable = Math.max(0, fulfilled - refunded - integer(reserved.rows[0]?.quantity ?? 0, "reserved_return_quantity"));
    if (input.quantity > returnable) throw new Error(`Only ${returnable} unit(s) remain returnable for this item`);

    const returnUuid = randomUUID();
    const returnId = publicReturnId();
    const number = returnNumber(now);
    await tx.query(`
      INSERT INTO returns(id,public_id,return_number,order_id,customer_user_id,reason_type,status,requested_remedy,source,
        eligibility_state,eligibility_basis,eligibility_reason,evidence,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,'requested',$7,'customer','manual_review','manual_review',$8,$9::jsonb,$10,$10)`, [
      returnUuid, returnId, number, text(row.order_uuid, "order_uuid"), text(row.customer_uuid, "customer_uuid"), input.reason,
      input.requestedRemedy, "Το αίτημα παραλήφθηκε και αναμένει έλεγχο επιλεξιμότητας από την πλατφόρμα.", JSON.stringify(note ? { customerNote: note } : {}), new Date(now)
    ]);
    await tx.query(`INSERT INTO return_lines(return_id,order_line_id,quantity,requested_remedy) VALUES($1,$2,$3,$4)`, [returnUuid, text(row.line_uuid, "line_uuid"), input.quantity, input.requestedRemedy]);
    return { returnId, returnNumber: number };
  }, { isolation: "serializable" });
}
