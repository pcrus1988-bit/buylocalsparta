import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { adminOrdersReturnsWorkspace } from "../admin-governance-runtime";
import { assertAdminPermission, postgresAdminRuntimeEnabled } from "../admin-runtime";
import { getProductionPostgresRuntime } from "../postgres-runtime";
import { marketplaceReferenceMap } from "../public-reference-service";

export type AdminAssistantOrderIntelligence = Readonly<{
  requestedId: string;
  internalOrderId?: string;
  displayReference?: string;
  order?: Readonly<{
    status: string;
    fulfilmentMode: string;
    createdAt: number;
    lineCount: number;
    itemCount: number;
    fulfilmentStatuses: readonly string[];
    openReturns: number;
  }>;
  payment?: Readonly<{
    status: string;
    provider: string;
    authorisedMinor: number;
    capturedMinor: number;
    refundedMinor: number;
  }>;
  taxDocuments: readonly Readonly<{
    id: string;
    status: string;
    transmissionStatus: string;
    documentNumber?: string;
    aadeMark?: string;
    lastError?: string;
    createdAt: number;
  }>[];
}>;

function text(value: unknown): string { return typeof value === "string" ? value : ""; }
function optional(value: unknown): string | undefined { return typeof value === "string" && value.length ? value : undefined; }
function integer(value: unknown): number { const parsed = Number(value ?? 0); return Number.isSafeInteger(parsed) ? parsed : 0; }
function epoch(value: unknown): number { const parsed = value instanceof Date ? value.getTime() : new Date(String(value ?? "")).getTime(); return Number.isFinite(parsed) ? parsed : 0; }

export async function getAdminAssistantOrderIntelligence(
  principal: SessionPrincipal,
  requestedId: string
): Promise<AdminAssistantOrderIntelligence> {
  assertAdminPermission(principal, "fulfilment.read");
  const requested = requestedId.trim().slice(0, 200);
  const workspace = await adminOrdersReturnsWorkspace(principal);
  const references = await marketplaceReferenceMap("order", workspace.orders.map((order) => order.id));
  const normalized = requested.toLocaleUpperCase("el-GR");
  const order = workspace.orders.find((item) => item.id === requested || (references.get(item.id) ?? "").toLocaleUpperCase("el-GR") === normalized);
  if (!order) return { requestedId: requested, taxDocuments: [] };

  const displayReference = references.get(order.id) ?? order.id;
  const openReturns = workspace.returns.filter((item) => item.orderId === order.id && !["rejected", "refunded", "closed"].includes(item.status)).length;
  const base: AdminAssistantOrderIntelligence = {
    requestedId: requested,
    internalOrderId: order.id,
    displayReference,
    order: {
      status: order.status,
      fulfilmentMode: order.fulfilmentMode,
      createdAt: order.createdAt,
      lineCount: order.lines.length,
      itemCount: order.lines.reduce((sum, line) => sum + line.quantity, 0),
      fulfilmentStatuses: [...new Set(order.fulfilments.map((item) => item.status))],
      openReturns
    },
    taxDocuments: []
  };

  if (!postgresAdminRuntimeEnabled()) return base;
  const uow = new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 2_000 });
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const [paymentRows, taxRows] = await Promise.all([
      tx.query<SqlRow>(`
        SELECT p.status,p.provider,p.authorised_minor,p.captured_minor,p.refunded_minor
        FROM public.customer_orders o
        LEFT JOIN public.payments p ON p.order_id=o.id
        WHERE o.public_id=$1
        ORDER BY p.created_at DESC
        LIMIT 1
      `, [order.id]),
      tx.query<SqlRow>(`
        SELECT td.public_id,td.status,td.transmission_status,td.document_number,td.aade_mark,td.last_error,td.created_at
        FROM public.customer_orders o
        JOIN public.tax_documents td ON td.order_id=o.id
        WHERE o.public_id=$1
        ORDER BY td.created_at DESC
        LIMIT 20
      `, [order.id])
    ]);
    const paymentRow = paymentRows.rows[0];
    return {
      ...base,
      payment: paymentRow ? {
        status: text(paymentRow.status),
        provider: text(paymentRow.provider),
        authorisedMinor: integer(paymentRow.authorised_minor),
        capturedMinor: integer(paymentRow.captured_minor),
        refundedMinor: integer(paymentRow.refunded_minor)
      } : undefined,
      taxDocuments: taxRows.rows.map((row) => ({
        id: text(row.public_id),
        status: text(row.status),
        transmissionStatus: text(row.transmission_status),
        documentNumber: optional(row.document_number),
        aadeMark: optional(row.aade_mark),
        lastError: optional(row.last_error),
        createdAt: epoch(row.created_at)
      }))
    };
  }, { readOnly: true, statementTimeoutMs: 10_000 });
}
