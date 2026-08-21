import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { customerScope } from "@buy-local-sparta/postgres-runtime";
import { customerOrders, postgresCommerceEnabled } from "./customer-commerce-runtime";
import { marketplaceReferenceMap } from "./public-reference-service";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CustomerOrderReferenceResolution = Readonly<{
  internalId: string;
  referenceNumber: string;
}>;

function normalizeIdentifier(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 180) throw new Error("ORDER_NOT_FOUND");
  return normalized;
}

export async function resolveCustomerOrderReference(
  principal: SessionPrincipal,
  identifier: string
): Promise<CustomerOrderReferenceResolution | undefined> {
  const normalized = normalizeIdentifier(identifier);

  if (!postgresCommerceEnabled()) {
    const orders = await customerOrders(principal);
    const references = await marketplaceReferenceMap("order", orders.map((order) => order.id));
    const order = orders.find((candidate) => candidate.id === normalized || references.get(candidate.id) === normalized);
    if (!order) return undefined;
    return { internalId: order.id, referenceNumber: references.get(order.id) ?? order.id };
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 5_000 });
  const result = await uow.withTransaction(customerScope(principal.userId), async (tx) => tx.query<SqlRow>(`
    SELECT co.public_id AS internal_id, co.order_number AS reference_number
    FROM customer_orders co
    JOIN users u ON u.id=co.user_id
    WHERE u.public_id=$1
      AND (co.order_number=$2 OR co.public_id=$2)
    LIMIT 1
  `, [principal.userId, normalized]), { readOnly: true });

  if (result.rowCount !== 1) return undefined;
  const internalId = typeof result.rows[0].internal_id === "string" ? result.rows[0].internal_id : "";
  const referenceNumber = typeof result.rows[0].reference_number === "string" ? result.rows[0].reference_number : "";
  if (!internalId || !referenceNumber) return undefined;
  return { internalId, referenceNumber };
}

export async function requireCustomerOrderReference(
  principal: SessionPrincipal,
  identifier: string
): Promise<CustomerOrderReferenceResolution> {
  const resolved = await resolveCustomerOrderReference(principal, identifier);
  if (!resolved) throw new Error("ORDER_NOT_FOUND");
  return resolved;
}
