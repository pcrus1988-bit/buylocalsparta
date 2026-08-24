import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type AdminAskLocalRequest = Readonly<{
  id: string;
  referenceNumber: string;
  customerId: string;
  customerName: string;
  customerEmail?: string;
  need: string;
  category?: string;
  postcode: string;
  quantity: number;
  status: string;
  workflowOwnerKind: "admin" | "vendor";
  assignmentReason?: string;
  assignedAdminId?: string;
  assignedVendorId?: string;
  assignedVendorName?: string;
  responseDueAt?: number;
  createdAt: number;
  updatedAt: number;
  voiceTranscript?: string;
  barcode?: string;
  referenceImageDataUrl?: string;
  captureSource?: string;
}>;

export type AdminAskLocalVendor = Readonly<{ id: string; name: string }>;
export type AdminAskLocalDashboard = Readonly<{
  openCount: number;
  adminOwnedCount: number;
  vendorOwnedCount: number;
  overdueCount: number;
  recent: readonly AdminAskLocalRequest[];
}>;

function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 }); }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(result) ? result : undefined; }
function integer(value: unknown): number { const result = Number(value ?? 0); return Number.isFinite(result) ? Math.trunc(result) : 0; }
function metadata(value: unknown): Record<string, unknown> { if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } } return {}; }

const OPEN_STATUSES = ["submitted", "assigned", "awaiting_vendor", "needs_info", "offered"] as const;

function mapRequest(row: SqlRow): AdminAskLocalRequest {
  const source = metadata(row.source_metadata);
  const firstName = optionalText(row.first_name);
  const lastName = optionalText(row.last_name);
  return {
    id: text(row.public_id),
    referenceNumber: optionalText(row.reference_number) ?? text(row.public_id),
    customerId: text(row.customer_public_id),
    customerName: [firstName, lastName].filter(Boolean).join(" ") || optionalText(row.customer_email) || text(row.customer_public_id),
    customerEmail: optionalText(row.customer_email),
    need: optionalText(source.need) ?? "Local request",
    category: optionalText(source.category),
    postcode: text(row.postcode),
    quantity: integer(row.requested_quantity),
    status: text(row.status),
    workflowOwnerKind: row.workflow_owner_kind === "vendor" ? "vendor" : "admin",
    assignmentReason: optionalText(row.assignment_reason),
    assignedAdminId: optionalText(row.admin_public_id),
    assignedVendorId: optionalText(row.vendor_public_id),
    assignedVendorName: optionalText(row.trading_name),
    responseDueAt: epoch(row.expires_at),
    createdAt: epoch(row.created_at) ?? 0,
    updatedAt: epoch(row.updated_at) ?? 0,
    voiceTranscript: optionalText(source.voiceTranscript),
    barcode: optionalText(source.barcode),
    referenceImageDataUrl: optionalText(source.referenceImageDataUrl),
    captureSource: optionalText(source.captureSource)
  };
}

async function requestRows(tx: SqlExecutor, limit: number): Promise<readonly AdminAskLocalRequest[]> {
  const result = await tx.query<SqlRow>(`SELECT cr.public_id,cr.reference_number,cr.status::text,cr.source_metadata,cr.requested_quantity,cr.postcode,cr.workflow_owner_kind,cr.assignment_reason,cr.expires_at,cr.created_at,cr.updated_at,
      customer.public_id AS customer_public_id,customer.email::text AS customer_email,cp.first_name,cp.last_name,
      admin_user.public_id AS admin_public_id,v.public_id AS vendor_public_id,v.trading_name
    FROM counteroffer_requests cr
    JOIN users customer ON customer.id=cr.customer_user_id
    LEFT JOIN customer_profiles cp ON cp.user_id=customer.id
    LEFT JOIN users admin_user ON admin_user.id=cr.assigned_admin_user_id
    LEFT JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
    WHERE cr.status::text = ANY($1::text[])
    ORDER BY CASE WHEN cr.expires_at IS NOT NULL AND cr.expires_at < now() THEN 0 ELSE 1 END,cr.created_at ASC
    LIMIT $2`, [OPEN_STATUSES, limit]);
  return result.rows.map(mapRequest);
}

export async function adminAskLocalDashboard(principal: SessionPrincipal): Promise<AdminAskLocalDashboard> {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return { openCount: 0, adminOwnedCount: 0, vendorOwnedCount: 0, overdueCount: 0, recent: [] };
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const counts = await tx.query<SqlRow>(`SELECT count(*)::int AS open_count,
      count(*) FILTER (WHERE workflow_owner_kind='admin')::int AS admin_owned_count,
      count(*) FILTER (WHERE workflow_owner_kind='vendor')::int AS vendor_owned_count,
      count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < now())::int AS overdue_count
      FROM counteroffer_requests WHERE status::text = ANY($1::text[])`, [OPEN_STATUSES]);
    const row = counts.rows[0] ?? {};
    return {
      openCount: integer(row.open_count),
      adminOwnedCount: integer(row.admin_owned_count),
      vendorOwnedCount: integer(row.vendor_owned_count),
      overdueCount: integer(row.overdue_count),
      recent: await requestRows(tx, 8)
    };
  }, { readOnly: true });
}

export async function adminAskLocalQueue(principal: SessionPrincipal): Promise<{ csrfToken: string; requests: readonly AdminAskLocalRequest[]; vendors: readonly AdminAskLocalVendor[] }> {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return { csrfToken: principal.csrfToken, requests: [], vendors: [] };
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const vendors = await tx.query<SqlRow>(`SELECT v.public_id,v.trading_name
      FROM vendor_businesses v
      WHERE v.status='active' AND v.public_directory_visible=true
        AND EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.vendor_id=v.id AND vl.active=true)
      ORDER BY v.trading_name,v.public_id`);
    return {
      csrfToken: principal.csrfToken,
      requests: await requestRows(tx, 200),
      vendors: vendors.rows.map((row) => ({ id: text(row.public_id), name: text(row.trading_name) }))
    };
  }, { readOnly: true });
}

export async function adminAssignAskLocal(principal: SessionPrincipal, input: { requestId: string; owner: "admin" | "vendor"; vendorId?: string; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Ask Local workflow requires the production database");
  const requestId = input.requestId.trim();
  const reason = input.reason.trim();
  if (!requestId) throw new Error("Ask Local request is required");
  if (reason.length < 5 || reason.length > 500) throw new Error("A meaningful assignment reason is required");
  if (input.owner === "vendor" && !input.vendorId?.trim()) throw new Error("Choose an eligible vendor");

  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT cr.id::text AS request_uuid,cr.public_id,cr.reference_number,cr.status::text,cr.workflow_owner_kind,cr.assignment_reason,
      cr.assigned_vendor_id::text,cr.assigned_admin_user_id::text,cr.expires_at
      FROM counteroffer_requests cr
      WHERE cr.public_id=$1 OR cr.reference_number=$1
      FOR UPDATE`, [requestId]);
    if (!found.rowCount) throw new Error("Ask Local request was not found");
    const before = found.rows[0];
    const internalRequestId = text(before.public_id);
    if (![...OPEN_STATUSES].includes(text(before.status) as (typeof OPEN_STATUSES)[number])) throw new Error("Closed Ask Local requests cannot be reassigned");

    const actor = await tx.query<SqlRow>(`SELECT id::text AS id FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [principal.userId]);
    if (!actor.rowCount) throw new Error("Admin actor was not found");

    if (input.owner === "admin") {
      await tx.query(`UPDATE counteroffer_requests
        SET workflow_owner_kind='admin',assigned_admin_user_id=$2::uuid,assigned_vendor_id=NULL,assigned_offer_id=NULL,
            assignment_reason='admin_manual_triage',status='submitted',expires_at=NULL,workflow_updated_at=now(),updated_at=now()
        WHERE id=$1::uuid`, [before.request_uuid, actor.rows[0].id]);
      await audit(tx, principal, internalRequestId, reason, before, { workflowOwnerKind: "admin", assignedAdminId: principal.userId, status: "submitted", assignmentReason: "admin_manual_triage" });
      return { id: internalRequestId, referenceNumber: optionalText(before.reference_number) ?? internalRequestId, workflowOwnerKind: "admin" as const, status: "submitted" };
    }

    const vendor = await tx.query<SqlRow>(`SELECT v.id::text AS vendor_uuid,v.public_id,v.trading_name
      FROM vendor_businesses v
      WHERE (v.public_id=$1 OR v.id::text=$1)
        AND v.status='active'
        AND v.public_directory_visible=true
        AND EXISTS (SELECT 1 FROM vendor_locations vl WHERE vl.vendor_id=v.id AND vl.active=true)
      LIMIT 1`, [input.vendorId!.trim()]);
    if (!vendor.rowCount) throw new Error("The selected vendor is not eligible for Ask Local assignment");
    const vendorRow = vendor.rows[0];
    const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await tx.query(`UPDATE counteroffer_requests
      SET workflow_owner_kind='vendor',assigned_admin_user_id=NULL,assigned_vendor_id=$2::uuid,assigned_offer_id=NULL,
          assignment_reason='admin_manual_vendor_assignment',status='awaiting_vendor',expires_at=$3,workflow_updated_at=now(),updated_at=now()
      WHERE id=$1::uuid`, [before.request_uuid, vendorRow.vendor_uuid, dueAt]);
    await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional','ask_local.assigned','ask-local-admin-assignment-v1','el','Νέο Ask Local αίτημα','Η ομάδα KONTA MOY σας ανέθεσε νέο αίτημα Ask Local.',$4::jsonb,'queued',$5,now())
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [randomUUID(), `notification_${randomUUID()}`, vendorRow.vendor_uuid, JSON.stringify({ requestId: internalRequestId, responseDueAt: dueAt.getTime(), assignmentReason: "admin_manual_vendor_assignment" }), `ask-local-vendor-assignment:${internalRequestId}:${vendorRow.public_id}`]);
    await audit(tx, principal, internalRequestId, reason, before, { workflowOwnerKind: "vendor", assignedVendorId: vendorRow.public_id, assignedVendorName: vendorRow.trading_name, status: "awaiting_vendor", responseDueAt: dueAt.toISOString(), assignmentReason: "admin_manual_vendor_assignment" });
    return { id: internalRequestId, referenceNumber: optionalText(before.reference_number) ?? internalRequestId, workflowOwnerKind: "vendor" as const, vendorId: text(vendorRow.public_id), status: "awaiting_vendor" };
  }, { isolation: "serializable" });
}

async function audit(tx: SqlExecutor, principal: SessionPrincipal, requestId: string, reason: string, beforeState: unknown, afterState: unknown) {
  await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
    VALUES($1,'ask_local.assignment_changed','counteroffer_request',$2,$3,$4::jsonb,$5::jsonb,$6)`, [
    principal.roles[0] ?? "super_admin", requestId, reason, JSON.stringify(beforeState ?? {}), JSON.stringify(afterState ?? {}), principal.userId
  ]);
}
