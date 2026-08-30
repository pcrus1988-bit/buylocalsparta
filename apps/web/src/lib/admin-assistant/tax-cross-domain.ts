import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "../admin-runtime";
import { getProductionPostgresRuntime } from "../postgres-runtime";
import { marketplaceReferenceMap } from "../public-reference-service";

export type AdminAssistantTaxCrossDomainRow = Readonly<{
  orderId: string;
  displayReference: string;
  orderStatus: string;
  paymentStatus: string;
  paymentProvider: string;
  capturedMinor: number;
  taxDocumentCount: number;
  acceptedMarkCount: number;
  createdAt: number;
}>;

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function integer(value: unknown): number { const parsed = Number(value ?? 0); return Number.isSafeInteger(parsed) ? parsed : 0; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value ?? "")).getTime(); return Number.isFinite(parsed) ? parsed : 0; }

export async function getAdminAssistantTaxCrossDomain(
  principal: SessionPrincipal
): Promise<readonly AdminAssistantTaxCrossDomainRow[]> {
  assertAdminPermission(principal, "finance.read");
  if (!postgresAdminRuntimeEnabled()) return [];
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  const rows = await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      WITH latest_payment AS (
        SELECT DISTINCT ON (p.order_id)
          p.order_id,p.status,p.provider,p.captured_minor,p.updated_at,p.created_at
        FROM public.payments p
        ORDER BY p.order_id,p.updated_at DESC,p.created_at DESC
      )
      SELECT
        o.public_id AS order_public_id,
        o.status::text AS order_status,
        lp.status::text AS payment_status,
        lp.provider,
        COALESCE(lp.captured_minor,0)::int AS captured_minor,
        COUNT(td.id)::int AS tax_document_count,
        COUNT(td.id) FILTER (WHERE td.transmission_status='accepted' AND td.aade_mark IS NOT NULL)::int AS accepted_mark_count,
        o.created_at
      FROM public.customer_orders o
      JOIN latest_payment lp ON lp.order_id=o.id
      LEFT JOIN public.tax_documents td ON td.order_id=o.id
      WHERE COALESCE(lp.captured_minor,0) > 0
         OR lp.status::text IN ('captured','paid','settled','partially_refunded','refunded')
      GROUP BY o.id,o.public_id,o.status,lp.status,lp.provider,lp.captured_minor,o.created_at
      HAVING COUNT(td.id)=0 OR o.status::text='pending_payment'
      ORDER BY o.created_at DESC
      LIMIT 100
    `);
    return result.rows.map((row) => ({
      orderId: text(row.order_public_id),
      orderStatus: text(row.order_status),
      paymentStatus: text(row.payment_status),
      paymentProvider: text(row.provider),
      capturedMinor: integer(row.captured_minor),
      taxDocumentCount: integer(row.tax_document_count),
      acceptedMarkCount: integer(row.accepted_mark_count),
      createdAt: epoch(row.created_at)
    }));
  }, { readOnly: true, statementTimeoutMs: 10_000 });

  const references = await marketplaceReferenceMap("order", rows.map((row) => row.orderId));
  return rows.map((row) => ({ ...row, displayReference: references.get(row.orderId) ?? row.orderId }));
}
