import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type CatalogueProductTypeOption = Readonly<{
  id: string;
  code: string;
  name: string;
}>;

export async function adminCatalogueProductTypeOptions(
  principal: SessionPrincipal
): Promise<readonly CatalogueProductTypeOption[]> {
  assertAdminPermission(principal, "catalog.read");
  if (!postgresAdminRuntimeEnabled()) return [];

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 8_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT pt.id::text AS id,
             pt.code,
             COALESCE(NULLIF(ptt.name,''),pt.code) AS name
      FROM public.product_types pt
      LEFT JOIN public.product_type_translations ptt
        ON ptt.product_type_id=pt.id AND upper(ptt.locale)='EL'
      WHERE pt.status='active'
      ORDER BY COALESCE(NULLIF(ptt.name,''),pt.code),pt.code,pt.id
      LIMIT 1000
    `);
    return result.rows.map((row) => ({
      id: required(row.id, "product type.id"),
      code: required(row.code, "product type.code"),
      name: required(row.name, "product type.name")
    }));
  }, { readOnly: true, statementTimeoutMs: 8_000 });
}

function required(value: unknown, name: string): string {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${name} is required`);
  return text;
}
