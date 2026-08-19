import { randomBytes } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_SUPPORT_CATEGORIES = ["account", "order", "payment", "return", "delivery", "privacy", "technical", "other"] as const;
export const CUSTOMER_SUPPORT_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const CUSTOMER_SUPPORT_STATUSES = ["open", "waiting_customer", "waiting_internal", "resolved", "closed"] as const;

export type CustomerSupportCategory = (typeof CUSTOMER_SUPPORT_CATEGORIES)[number];
export type CustomerSupportPriority = (typeof CUSTOMER_SUPPORT_PRIORITIES)[number];
export type CustomerSupportStatus = (typeof CUSTOMER_SUPPORT_STATUSES)[number];
export type CustomerSupportCaseAction = "add_note" | "set_status" | "set_priority" | "assign_self" | "clear_assignee" | "set_follow_up";

export type CustomerEngagementSummary = Readonly<{
  activeCarts: number;
  cartItems: number;
  savedProducts: number;
  savedSearches: number;
  savedVendors: number;
  reviews: number;
  conversations: number;
  messages: number;
  notifications: number;
  notificationFailures: number;
  privacyRequests: number;
  openPrivacyRequests: number;
  supportCases: number;
  openSupportCases: number;
  lastConversationAt?: number;
  lastNotificationAt?: number;
}>;

export type CustomerPrivacyRequestSummary = Readonly<{
  id: string;
  type: string;
  status: string;
  dueAt?: number;
  createdAt: number;
  completedAt?: number;
}>;

export type CustomerSupportCaseEvent = Readonly<{
  id: string;
  type: string;
  note?: string;
  actor: string;
  createdAt: number;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown>;
}>;

export type CustomerSupportCase = Readonly<{
  id: string;
  subject: string;
  category: CustomerSupportCategory;
  priority: CustomerSupportPriority;
  status: CustomerSupportStatus;
  assignedTo?: string;
  followUpAt?: number;
  resolvedAt?: number;
  createdAt: number;
  updatedAt: number;
  events: ReadonlyArray<CustomerSupportCaseEvent>;
}>;

const CUSTOMER_IDENTITY_PREDICATE = `
  NOT EXISTS (SELECT 1 FROM platform_user_roles pur WHERE pur.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.user_id=u.id)`;

function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool); }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const result = typeof value === "string" ? value.trim() : ""; return result || undefined; }
function integer(value: unknown): number { const n = Number(value ?? 0); return Number.isFinite(n) ? Math.trunc(n) : 0; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const n = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(n) ? n : undefined; }
function record(value: unknown): Record<string, unknown> { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } } return {}; }
function id(prefix: string): string { return `${prefix}_${randomBytes(12).toString("hex")}`; }
function enumValue<T extends readonly string[]>(value: unknown, options: T, label: string): T[number] { const item = String(value ?? "") as T[number]; if (!options.includes(item)) throw new Error(`Invalid ${label}`); return item; }

async function customerTarget(tx: SqlExecutor, customerId: string) {
  const result = await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id FROM users u WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE} LIMIT 1`, [customerId]);
  if (!result.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
  return { userUuid: text(result.rows[0].user_uuid), id: text(result.rows[0].public_id) };
}

async function platformUserUuid(tx: SqlExecutor, actorId: string): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS user_uuid FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [actorId]);
  if (!result.rowCount) throw new Error("Platform actor not found");
  return text(result.rows[0].user_uuid);
}

async function marketUuid(tx: SqlExecutor): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS market_uuid FROM markets WHERE code='sparta' LIMIT 1`);
  if (!result.rowCount) throw new Error("Sparta market not found");
  return text(result.rows[0].market_uuid);
}

async function audit(tx: SqlExecutor, principal: SessionPrincipal, action: string, entityId: string, reason: string | undefined, beforeState: unknown, afterState: unknown) {
  await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
    VALUES($1,$2,'customer_support_case',$3,$4,$5::jsonb,$6::jsonb,$7)`, [
    principal.roles[0] ?? "super_admin", action, entityId, reason ?? null, JSON.stringify(beforeState ?? {}), JSON.stringify(afterState ?? {}), principal.userId
  ]);
}

export async function adminCustomer360(principal: SessionPrincipal, customerId: string): Promise<{ engagement: CustomerEngagementSummary; privacyRequests: CustomerPrivacyRequestSummary[]; supportCases: CustomerSupportCase[] }> {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) throw new Error("Customer 360 requires the production database");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const target = await customerTarget(tx, customerId);
    // A transaction is backed by one pg client. Keep queries sequential on that client;
    // concurrent pg-client queries are deprecated and will fail under pg@9.
    const engagementResult = await tx.query<SqlRow>(`SELECT
      (SELECT count(*)::int FROM carts c WHERE c.user_id=$1::uuid AND c.expires_at>now()) AS active_carts,
      (SELECT COALESCE(sum(ci.quantity),0)::int FROM cart_items ci JOIN carts c ON c.id=ci.cart_id WHERE c.user_id=$1::uuid AND c.expires_at>now()) AS cart_items,
      (SELECT count(*)::int FROM saved_products sp WHERE sp.user_id=$1::uuid) AS saved_products,
      (SELECT count(*)::int FROM saved_searches ss WHERE ss.user_id=$1::uuid) AS saved_searches,
      (SELECT count(*)::int FROM saved_vendors sv WHERE sv.user_id=$1::uuid) AS saved_vendors,
      (SELECT count(*)::int FROM reviews r WHERE r.user_id=$1::uuid) AS reviews,
      (SELECT count(*)::int FROM conversations c WHERE c.customer_user_id=$1::uuid) AS conversations,
      (SELECT count(*)::int FROM messages m JOIN conversations c ON c.id=m.conversation_id WHERE c.customer_user_id=$1::uuid) AS messages,
      (SELECT count(*)::int FROM notifications n WHERE n.user_id=$1::uuid) AS notifications,
      (SELECT count(*)::int FROM notifications n WHERE n.user_id=$1::uuid AND (n.status='failed' OR n.failed_at IS NOT NULL)) AS notification_failures,
      (SELECT count(*)::int FROM privacy_requests pr WHERE pr.user_id=$1::uuid) AS privacy_requests,
      (SELECT count(*)::int FROM privacy_requests pr WHERE pr.user_id=$1::uuid AND pr.status IN ('submitted','processing')) AS open_privacy_requests,
      (SELECT count(*)::int FROM customer_support_cases sc WHERE sc.customer_user_id=$1::uuid) AS support_cases,
      (SELECT count(*)::int FROM customer_support_cases sc WHERE sc.customer_user_id=$1::uuid AND sc.status NOT IN ('resolved','closed')) AS open_support_cases,
      (SELECT max(c.updated_at) FROM conversations c WHERE c.customer_user_id=$1::uuid) AS last_conversation_at,
      (SELECT max(n.created_at) FROM notifications n WHERE n.user_id=$1::uuid) AS last_notification_at`, [target.userUuid]);
    const privacyResult = await tx.query<SqlRow>(`SELECT public_id,request_type,status,due_at,created_at,completed_at FROM privacy_requests WHERE user_id=$1::uuid ORDER BY created_at DESC LIMIT 20`, [target.userUuid]);
    const casesResult = await tx.query<SqlRow>(`SELECT id::text AS case_uuid,public_id,subject,category,priority,status,assigned_to_public_id,follow_up_at,resolved_at,created_at,updated_at FROM customer_support_cases WHERE customer_user_id=$1::uuid ORDER BY CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END, COALESCE(follow_up_at,updated_at) ASC, updated_at DESC LIMIT 50`, [target.userUuid]);
    const eventsResult = await tx.query<SqlRow>(`SELECT sc.public_id AS case_public_id,e.public_id,e.event_type,e.note,e.actor_public_id,e.before_state,e.after_state,e.created_at FROM customer_support_case_events e JOIN customer_support_cases sc ON sc.id=e.case_id WHERE sc.customer_user_id=$1::uuid ORDER BY e.created_at DESC LIMIT 250`, [target.userUuid]);
    const e = engagementResult.rows[0] ?? {};
    const eventsByCase = new Map<string, CustomerSupportCaseEvent[]>();
    for (const item of eventsResult.rows) {
      const caseId = text(item.case_public_id);
      const list = eventsByCase.get(caseId) ?? [];
      list.push({ id:text(item.public_id), type:text(item.event_type), note:optionalText(item.note), actor:text(item.actor_public_id), createdAt:epoch(item.created_at) ?? 0, beforeState:record(item.before_state), afterState:record(item.after_state) });
      eventsByCase.set(caseId, list);
    }
    return {
      engagement: {
        activeCarts:integer(e.active_carts), cartItems:integer(e.cart_items), savedProducts:integer(e.saved_products), savedSearches:integer(e.saved_searches), savedVendors:integer(e.saved_vendors), reviews:integer(e.reviews), conversations:integer(e.conversations), messages:integer(e.messages), notifications:integer(e.notifications), notificationFailures:integer(e.notification_failures), privacyRequests:integer(e.privacy_requests), openPrivacyRequests:integer(e.open_privacy_requests), supportCases:integer(e.support_cases), openSupportCases:integer(e.open_support_cases), lastConversationAt:epoch(e.last_conversation_at), lastNotificationAt:epoch(e.last_notification_at)
      },
      privacyRequests: privacyResult.rows.map((item) => ({ id:text(item.public_id), type:text(item.request_type), status:text(item.status), dueAt:epoch(item.due_at), createdAt:epoch(item.created_at) ?? 0, completedAt:epoch(item.completed_at) })),
      supportCases: casesResult.rows.map((item) => { const caseId=text(item.public_id); return { id:caseId, subject:text(item.subject), category:enumValue(item.category,CUSTOMER_SUPPORT_CATEGORIES,"support category"), priority:enumValue(item.priority,CUSTOMER_SUPPORT_PRIORITIES,"support priority"), status:enumValue(item.status,CUSTOMER_SUPPORT_STATUSES,"support status"), assignedTo:optionalText(item.assigned_to_public_id), followUpAt:epoch(item.follow_up_at), resolvedAt:epoch(item.resolved_at), createdAt:epoch(item.created_at) ?? 0, updatedAt:epoch(item.updated_at) ?? 0, events:eventsByCase.get(caseId) ?? [] }; })
    };
  }, { readOnly: true });
}

export async function adminCreateCustomerSupportCase(principal: SessionPrincipal, input: { customerId: string; subject: string; category: CustomerSupportCategory; priority: CustomerSupportPriority; note: string; followUpAt?: string | number }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer support requires the production database");
  const subject = input.subject.trim();
  const note = input.note.trim();
  const category = enumValue(input.category, CUSTOMER_SUPPORT_CATEGORIES, "support category");
  const priority = enumValue(input.priority, CUSTOMER_SUPPORT_PRIORITIES, "support priority");
  if (subject.length < 3 || subject.length > 240) throw new Error("Case subject must be 3–240 characters");
  if (note.length < 3 || note.length > 4000) throw new Error("Initial support note must be 3–4000 characters");
  const followUpAt = parseFollowUp(input.followUpAt);
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, input.customerId);
    const actorUuid = await platformUserUuid(tx, principal.userId);
    const marketId = await marketUuid(tx);
    const caseId = id("case");
    const eventId = id("caseevt");
    const created = await tx.query<SqlRow>(`INSERT INTO customer_support_cases(public_id,customer_user_id,market_id,subject,category,priority,status,assigned_to_user_id,assigned_to_public_id,created_by_user_id,created_by_public_id,follow_up_at)
      VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,'open',$7::uuid,$8,$7::uuid,$8,$9) RETURNING id::text AS case_uuid,created_at,updated_at`, [caseId, customer.userUuid, marketId, subject, category, priority, actorUuid, principal.userId, followUpAt ? new Date(followUpAt) : null]);
    const caseUuid = text(created.rows[0].case_uuid);
    await tx.query(`INSERT INTO customer_support_case_events(public_id,case_id,actor_user_id,actor_public_id,event_type,note,after_state)
      VALUES($1,$2::uuid,$3::uuid,$4,'created',$5,$6::jsonb)`, [eventId, caseUuid, actorUuid, principal.userId, note, JSON.stringify({ subject, category, priority, status:"open", assignedTo:principal.userId, followUpAt })]);
    await audit(tx, principal, "customer_support.case_created", caseId, "Customer support case created", {}, { customerId:customer.id, subject, category, priority, status:"open", followUpAt });
    return { id:caseId, customerId:customer.id, subject, category, priority, status:"open" as const };
  }, { isolation:"serializable" });
}

export async function adminCustomerSupportCaseAction(principal: SessionPrincipal, input: { caseId: string; action: CustomerSupportCaseAction; reason: string; status?: CustomerSupportStatus; priority?: CustomerSupportPriority; followUpAt?: string | number | null }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer support requires the production database");
  const reason = input.reason.trim();
  if (reason.length < 3 || reason.length > 4000) throw new Error("A support note/reason of 3–4000 characters is required");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const actorUuid = await platformUserUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`SELECT id::text AS case_uuid,public_id,status,priority,assigned_to_public_id,follow_up_at FROM customer_support_cases WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [input.caseId]);
    if (!found.rowCount) throw new Error("Support case not found");
    const row = found.rows[0];
    const caseUuid = text(row.case_uuid);
    const caseId = text(row.public_id);
    const before = { status:text(row.status), priority:text(row.priority), assignedTo:optionalText(row.assigned_to_public_id), followUpAt:epoch(row.follow_up_at) };
    let eventType: string = "note_added";
    let after: Record<string, unknown> = before;

    if (input.action === "add_note") {
      after = before;
    } else if (input.action === "set_status") {
      const status = enumValue(input.status, CUSTOMER_SUPPORT_STATUSES, "support status");
      await tx.query(`UPDATE customer_support_cases SET status=$2,resolved_at=CASE WHEN $2 IN ('resolved','closed') THEN COALESCE(resolved_at,now()) ELSE NULL END,updated_at=now() WHERE id=$1::uuid`, [caseUuid, status]);
      eventType = "status_changed"; after = { ...before, status };
    } else if (input.action === "set_priority") {
      const priority = enumValue(input.priority, CUSTOMER_SUPPORT_PRIORITIES, "support priority");
      await tx.query(`UPDATE customer_support_cases SET priority=$2,updated_at=now() WHERE id=$1::uuid`, [caseUuid, priority]);
      eventType = "priority_changed"; after = { ...before, priority };
    } else if (input.action === "assign_self") {
      await tx.query(`UPDATE customer_support_cases SET assigned_to_user_id=$2::uuid,assigned_to_public_id=$3,updated_at=now() WHERE id=$1::uuid`, [caseUuid, actorUuid, principal.userId]);
      eventType = "assigned"; after = { ...before, assignedTo:principal.userId };
    } else if (input.action === "clear_assignee") {
      await tx.query(`UPDATE customer_support_cases SET assigned_to_user_id=NULL,assigned_to_public_id=NULL,updated_at=now() WHERE id=$1::uuid`, [caseUuid]);
      eventType = "assigned"; after = { ...before, assignedTo:null };
    } else if (input.action === "set_follow_up") {
      const followUpAt = parseFollowUp(input.followUpAt, true);
      await tx.query(`UPDATE customer_support_cases SET follow_up_at=$2,updated_at=now() WHERE id=$1::uuid`, [caseUuid, followUpAt ? new Date(followUpAt) : null]);
      eventType = "follow_up_changed"; after = { ...before, followUpAt };
    } else {
      throw new Error("Unsupported support case action");
    }

    await tx.query(`INSERT INTO customer_support_case_events(public_id,case_id,actor_user_id,actor_public_id,event_type,note,before_state,after_state)
      VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,$7::jsonb,$8::jsonb)`, [id("caseevt"), caseUuid, actorUuid, principal.userId, eventType, reason, JSON.stringify(before), JSON.stringify(after)]);
    await audit(tx, principal, `customer_support.${eventType}`, caseId, reason, before, after);
    return { id:caseId, action:input.action, before, after };
  }, { isolation:"serializable" });
}

function parseFollowUp(value: string | number | null | undefined, allowClear = false): number | undefined {
  if (value === null || value === undefined || value === "") {
    if (allowClear) return undefined;
    return undefined;
  }
  const parsed = typeof value === "number" ? value : new Date(value).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Follow-up date is invalid");
  return parsed;
}
