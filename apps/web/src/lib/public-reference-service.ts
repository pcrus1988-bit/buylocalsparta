import { createHash } from "node:crypto";
import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type MarketplaceReferenceKind = "order" | "ask_local" | "support" | "return" | "refund" | "claim" | "privacy";

const prefix: Record<MarketplaceReferenceKind, string> = {
  order: "ORD",
  ask_local: "ASK",
  support: "TKT",
  return: "RET",
  refund: "RFD",
  claim: "CLM",
  privacy: "PRV"
};

function fallbackReference(kind: MarketplaceReferenceKind, identifier: string): string {
  const digest = createHash("sha256").update(`${kind}:${identifier}`).digest("hex");
  const numeric = Number.parseInt(digest.slice(0, 10), 16) % 900000 + 100000;
  return `${prefix[kind]}-${numeric}`;
}

function uniqueIdentifiers(identifiers: readonly string[]): string[] {
  return [...new Set(identifiers.map((value) => value.trim()).filter(Boolean))];
}

export async function marketplaceReferenceMap(kind: MarketplaceReferenceKind, identifiers: readonly string[]): Promise<ReadonlyMap<string, string>> {
  const ids = uniqueIdentifiers(identifiers);
  if (ids.length === 0) return new Map();
  if (!productionDatabaseConfigured()) return new Map(ids.map((id) => [id, fallbackReference(kind, id)]));

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 5_000 });
  const rows = await uow.withTransaction({ marketId: "sparta", platformAccess: true }, async (tx) => {
    switch (kind) {
      case "order":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,order_number AS reference_number FROM customer_orders WHERE public_id=ANY($1::text[])`, [ids]);
      case "ask_local":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,reference_number FROM counteroffer_requests WHERE public_id=ANY($1::text[])`, [ids]);
      case "support":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,reference_number FROM customer_support_cases WHERE public_id=ANY($1::text[])`, [ids]);
      case "return":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,return_number AS reference_number FROM returns WHERE public_id=ANY($1::text[])`, [ids]);
      case "refund":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,reference_number FROM refunds WHERE public_id=ANY($1::text[])`, [ids]);
      case "claim":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,reference_number FROM payment_disputes WHERE public_id=ANY($1::text[])`, [ids]);
      case "privacy":
        return tx.query<SqlRow>(`SELECT public_id AS internal_id,reference_number FROM privacy_requests WHERE public_id=ANY($1::text[])`, [ids]);
    }
  }, { readOnly: true });

  const result = new Map(ids.map((id) => [id, fallbackReference(kind, id)]));
  for (const row of rows.rows) {
    const internalId = typeof row.internal_id === "string" ? row.internal_id : "";
    const reference = typeof row.reference_number === "string" ? row.reference_number : "";
    if (internalId && reference) result.set(internalId, reference);
  }
  return result;
}

export async function marketplaceReference(kind: MarketplaceReferenceKind, identifier: string): Promise<string> {
  return (await marketplaceReferenceMap(kind, [identifier])).get(identifier) ?? fallbackReference(kind, identifier);
}
