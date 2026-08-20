import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { CUSTOMER_SUPPORT_PRIORITIES, CUSTOMER_SUPPORT_STATUSES, type CustomerSupportPriority, type CustomerSupportStatus } from "./admin-customer-support";

export type AdminCustomerSupportQueueItem = Readonly<{
  id: string;
  referenceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  subject: string;
  category: string;
  priority: CustomerSupportPriority;
  status: CustomerSupportStatus;
  assignedTo?: string;
  followUpAt?: number;
  createdAt: number;
  updatedAt: number;
}>;

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const result = typeof value === "string" ? value.trim() : ""; return result || undefined; }
function integer(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const n = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(n) ? n : undefined; }
function status(value: unknown): CustomerSupportStatus { const item = text(value) as CustomerSupportStatus; if (!CUSTOMER_SUPPORT_STATUSES.includes(item)) throw new Error("Invalid customer support status"); return item; }
function priority(value: unknown): CustomerSupportPriority { const item = text(value) as CustomerSupportPriority; if (!CUSTOMER_SUPPORT_PRIORITIES.includes(item)) throw new Error("Invalid customer support priority"); return item; }
function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool); }

export async function adminCustomerSupportQueue(principal: SessionPrincipal, input: { query?: string; status?: string; priority?: string } = {}) {
  assertAdminPermission(principal, "customer.read");
  const query = (input.query ?? "").trim().slice(0, 120);
  const selectedStatus = CUSTOMER_SUPPORT_STATUSES.includes(input.status as CustomerSupportStatus) ? input.status as CustomerSupportStatus : undefined;
  const selectedPriority = CUSTOMER_SUPPORT_PRIORITIES.includes(input.priority as CustomerSupportPriority) ? input.priority as CustomerSupportPriority : undefined;
  if (!productionDatabaseConfigured()) {
    return { csrfToken: principal.csrfToken, databaseConfigured: false, metrics: { open:0, urgent:0, unassigned:0, overdue:0 }, cases: [] as AdminCustomerSupportQueueItem[] };
  }
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const metricsResult = await tx.query<SqlRow>(`SELECT
      count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open,
      count(*) FILTER (WHERE status NOT IN ('resolved','closed') AND priority='urgent')::int AS urgent,
      count(*) FILTER (WHERE status NOT IN ('resolved','closed') AND assigned_to_user_id IS NULL)::int AS unassigned,
      count(*) FILTER (WHERE status NOT IN ('resolved','closed') AND follow_up_at IS NOT NULL AND follow_up_at < now())::int AS overdue
      FROM customer_support_cases`);
    const casesResult = await tx.query<SqlRow>(`SELECT
      sc.public_id,sc.reference_number,sc.subject,sc.category,sc.priority,sc.status,sc.assigned_to_public_id,sc.follow_up_at,sc.created_at,sc.updated_at,
      u.public_id AS customer_public_id,u.email::text AS customer_email,cp.first_name,cp.last_name
      FROM customer_support_cases sc
      JOIN users u ON u.id=sc.customer_user_id
      LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      WHERE ($1='' OR sc.subject ILIKE '%'||$1||'%' OR sc.reference_number ILIKE '%'||$1||'%' OR sc.public_id ILIKE '%'||$1||'%' OR u.public_id ILIKE '%'||$1||'%' OR u.email::text ILIKE '%'||$1||'%' OR COALESCE(cp.first_name,'') ILIKE '%'||$1||'%' OR COALESCE(cp.last_name,'') ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR sc.status=$2)
        AND ($3::text IS NULL OR sc.priority=$3)
      ORDER BY CASE WHEN sc.status IN ('resolved','closed') THEN 1 ELSE 0 END,
        CASE sc.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
        CASE WHEN sc.follow_up_at IS NOT NULL AND sc.follow_up_at < now() THEN 0 ELSE 1 END,
        COALESCE(sc.follow_up_at,sc.updated_at) ASC,sc.updated_at DESC
      LIMIT 150`, [query, selectedStatus ?? null, selectedPriority ?? null]);
    const m = metricsResult.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      metrics: { open:integer(m.open), urgent:integer(m.urgent), unassigned:integer(m.unassigned), overdue:integer(m.overdue) },
      cases: casesResult.rows.map((row) => {
        const name = [optionalText(row.first_name), optionalText(row.last_name)].filter(Boolean).join(" ");
        return {
          id:text(row.public_id), referenceNumber:optionalText(row.reference_number) ?? text(row.public_id), customerId:text(row.customer_public_id), customerName:name || optionalText(row.customer_email) || text(row.customer_public_id), customerEmail:optionalText(row.customer_email),
          subject:text(row.subject), category:text(row.category), priority:priority(row.priority), status:status(row.status), assignedTo:optionalText(row.assigned_to_public_id),
          followUpAt:epoch(row.follow_up_at), createdAt:epoch(row.created_at) ?? 0, updatedAt:epoch(row.updated_at) ?? 0
        };
      })
    };
  }, { readOnly:true });
}
