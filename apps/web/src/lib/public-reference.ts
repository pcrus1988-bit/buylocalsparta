import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerOrderReference = Readonly<{ internalId: string; referenceNumber: string }>;

export async function resolveCustomerOrderReference(principal: SessionPrincipal, suppliedId: string): Promise<CustomerOrderReference> {
  if (!productionDatabaseConfigured()) return { internalId: suppliedId, referenceNumber: suppliedId };
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<{ public_id: string; order_number: string }>(`
    SELECT o.public_id,o.order_number
    FROM customer_orders o
    JOIN users u ON u.id=o.user_id
    WHERE (o.public_id=$1 OR o.order_number=$1)
      AND u.public_id=$2
    LIMIT 1
  `, [suppliedId, principal.userId]);
  if (!result.rowCount) throw new Error("ORDER_NOT_FOUND");
  return { internalId: result.rows[0].public_id, referenceNumber: result.rows[0].order_number };
}

export async function customerOrderReference(principal: SessionPrincipal, internalId: string): Promise<string> {
  return (await resolveCustomerOrderReference(principal, internalId)).referenceNumber;
}

export async function vendorOrderReferences(orderIds: readonly string[]): Promise<ReadonlyMap<string, string>> {
  if (!productionDatabaseConfigured() || orderIds.length === 0) return new Map();
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.nativePool.query<{ public_id: string; order_number: string }>(`
    SELECT public_id,order_number FROM customer_orders WHERE public_id=ANY($1::text[])
  `, [[...new Set(orderIds)]]);
  return new Map(result.rows.map((row) => [row.public_id, row.order_number]));
}
