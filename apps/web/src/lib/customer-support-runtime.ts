import { randomBytes } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { CUSTOMER_SUPPORT_CATEGORIES, CUSTOMER_SUPPORT_STATUSES, type CustomerSupportCategory, type CustomerSupportStatus } from "./admin-customer-support";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_SUPPORT_CONTEXT_TYPES = ["account", "security", "order", "ask_local", "return", "privacy", "saved", "other"] as const;
export type CustomerSupportContextType = (typeof CUSTOMER_SUPPORT_CONTEXT_TYPES)[number];

export type CustomerSupportMessageView = Readonly<{
  id: string;
  sender: "customer" | "support";
  body: string;
  createdAt: number;
}>;

export type CustomerSupportCaseView = Readonly<{
  id: string;
  referenceNumber: string;
  subject: string;
  category: CustomerSupportCategory;
  status: CustomerSupportStatus;
  contextType?: CustomerSupportContextType;
  contextReference?: string;
  createdAt: number;
  updatedAt: number;
  messages: readonly CustomerSupportMessageView[];
}>;

type CustomerSupportCreateInput = Readonly<{
  subject: string;
  category: CustomerSupportCategory;
  message: string;
  contextType?: CustomerSupportContextType;
  contextId?: string;
  now?: number;
}>;

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number { if (!value) return 0; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function id(prefix: string): string { return `${prefix}_${randomBytes(12).toString("hex")}`; }

export function customerSupportReadiness(): { ready: boolean; message: string } {
  return productionDatabaseConfigured()
    ? { ready: true, message: "Customer support enabled" }
    : { ready: false, message: "Η υποστήριξη λογαριασμού απαιτεί την ασφαλή υπηρεσία PostgreSQL." };
}

export async function customerSupportCases(principal: SessionPrincipal): Promise<readonly CustomerSupportCaseView[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const cases = await tx.query<SqlRow>(`
      SELECT public_id,reference_number,subject,category,status,context_type,context_public_id,created_at,updated_at
      FROM customer_support_cases
      WHERE customer_user_id=$1::uuid
      ORDER BY CASE WHEN status IN ('resolved','closed') THEN 1 ELSE 0 END,updated_at DESC
      LIMIT 50
    `, [customer]);
    const events = await tx.query<SqlRow>(`
      SELECT sc.public_id AS case_public_id,e.public_id,e.actor_public_id,e.note,e.created_at
      FROM customer_support_case_events e
      JOIN customer_support_cases sc ON sc.id=e.case_id
      WHERE sc.customer_user_id=$1::uuid
        AND e.customer_visible=true
        AND e.note IS NOT NULL
      ORDER BY e.created_at ASC
      LIMIT 500
    `, [customer]);
    const messages = new Map<string, CustomerSupportMessageView[]>();
    for (const row of events.rows) {
      const caseId = text(row.case_public_id);
      const list = messages.get(caseId) ?? [];
      list.push({
        id: text(row.public_id),
        sender: text(row.actor_public_id) === principal.userId ? "customer" : "support",
        body: text(row.note),
        createdAt: epoch(row.created_at)
      });
      messages.set(caseId, list);
    }
    return cases.rows.map((row) => {
      const caseId = text(row.public_id);
      const category = text(row.category) as CustomerSupportCategory;
      const status = text(row.status) as CustomerSupportStatus;
      if (!CUSTOMER_SUPPORT_CATEGORIES.includes(category)) throw new Error("Invalid customer support category");
      if (!CUSTOMER_SUPPORT_STATUSES.includes(status)) throw new Error("Invalid customer support status");
      const contextRaw = optionalText(row.context_type);
      const contextType = contextRaw && CUSTOMER_SUPPORT_CONTEXT_TYPES.includes(contextRaw as CustomerSupportContextType) ? contextRaw as CustomerSupportContextType : undefined;
      return {
        id: caseId,
        referenceNumber: optionalText(row.reference_number) ?? caseId,
        subject: text(row.subject),
        category,
        status,
        contextType,
        contextReference: optionalText(row.context_public_id),
        createdAt: epoch(row.created_at),
        updatedAt: epoch(row.updated_at),
        messages: messages.get(caseId) ?? []
      };
    });
  }, { readOnly: true });
}

export async function createCustomerSupportCase(principal: SessionPrincipal, input: CustomerSupportCreateInput): Promise<readonly CustomerSupportCaseView[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η υποστήριξη απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const subject = input.subject.trim().replace(/\s+/g, " ");
  const message = input.message.trim();
  if (subject.length < 3 || subject.length > 240) throw new Error("Το θέμα πρέπει να έχει από 3 έως 240 χαρακτήρες.");
  if (message.length < 10 || message.length > 4000) throw new Error("Το μήνυμα πρέπει να έχει από 10 έως 4.000 χαρακτήρες.");
  if (!CUSTOMER_SUPPORT_CATEGORIES.includes(input.category)) throw new Error("Η κατηγορία υποστήριξης δεν είναι έγκυρη.");
  const contextType = input.contextType && CUSTOMER_SUPPORT_CONTEXT_TYPES.includes(input.contextType) ? input.contextType : undefined;
  const now = new Date(input.now ?? Date.now());

  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const contextReference = await validateContext(tx, customer, contextType, input.contextId);
    const market = await tx.query<SqlRow>("SELECT id::text AS id FROM markets WHERE code='sparta' LIMIT 1");
    if (!market.rowCount) throw new Error("Η αγορά της Σπάρτης δεν είναι διαθέσιμη.");
    const casePublicId = id("case");
    const created = await tx.query<SqlRow>(`
      INSERT INTO customer_support_cases(
        public_id,customer_user_id,market_id,subject,category,priority,status,
        assigned_to_user_id,assigned_to_public_id,created_by_user_id,created_by_public_id,
        context_type,context_public_id,created_at,updated_at
      )
      VALUES($1,$2::uuid,$3::uuid,$4,$5,'normal','open',NULL,NULL,$2::uuid,$6,$7,$8,$9,$9)
      RETURNING id::text AS case_uuid,reference_number
    `, [casePublicId, customer, text(market.rows[0].id), subject, input.category, principal.userId, contextType ?? null, contextReference ?? null, now]);
    const caseUuid = text(created.rows[0].case_uuid);
    const referenceNumber = text(created.rows[0].reference_number);
    await tx.query(`
      INSERT INTO customer_support_case_events(
        public_id,case_id,actor_user_id,actor_public_id,event_type,note,before_state,after_state,customer_visible,created_at
      ) VALUES($1,$2::uuid,$3::uuid,$4,'created',$5,'{}'::jsonb,$6::jsonb,true,$7)
    `, [id("caseevt"), caseUuid, customer, principal.userId, message, JSON.stringify({ status: "open", category: input.category, contextType, contextReference }), now]);
    await tx.query(`
      INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
      VALUES('customer','customer_support.case_created','customer_support_case',$1,'Customer-created support case','{}'::jsonb,$2::jsonb,$3)
    `, [casePublicId, JSON.stringify({ referenceNumber, category: input.category, contextType, contextReference }), principal.userId]);
    await notifySupportTeam(tx, {
      eventType: "customer_support.case_created",
      title: "Νέο αίτημα υποστήριξης πελάτη",
      body: `${referenceNumber} · ${subject}`,
      payload: { caseId: casePublicId, referenceNumber, contextType, contextReference },
      dedupePrefix: `support-created:${casePublicId}`,
      now
    });
  }, { isolation: "serializable" });
  return customerSupportCases(principal);
}

export async function replyCustomerSupportCase(principal: SessionPrincipal, input: { caseId: string; message: string; now?: number }): Promise<readonly CustomerSupportCaseView[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η υποστήριξη απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const caseId = input.caseId.trim();
  const message = input.message.trim();
  if (!caseId || caseId.length > 200) throw new Error("Το αίτημα υποστήριξης δεν είναι έγκυρο.");
  if (message.length < 3 || message.length > 4000) throw new Error("Το μήνυμα πρέπει να έχει από 3 έως 4.000 χαρακτήρες.");
  const now = new Date(input.now ?? Date.now());

  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`
      SELECT id::text AS case_uuid,public_id,reference_number,status
      FROM customer_support_cases
      WHERE customer_user_id=$1::uuid AND (public_id=$2 OR reference_number=$2)
      FOR UPDATE
    `, [customer, caseId]);
    if (!found.rowCount) throw new Error("Το αίτημα υποστήριξης δεν βρέθηκε.");
    const row = found.rows[0];
    const currentStatus = text(row.status) as CustomerSupportStatus;
    if (currentStatus === "closed") throw new Error("Αυτό το αίτημα έχει κλείσει. Δημιούργησε νέο αίτημα αν χρειάζεσαι επιπλέον βοήθεια.");
    const nextStatus: CustomerSupportStatus = currentStatus === "open" ? "open" : "waiting_internal";
    await tx.query(`UPDATE customer_support_cases SET status=$2,resolved_at=NULL,updated_at=$3 WHERE id=$1::uuid`, [text(row.case_uuid), nextStatus, now]);
    await tx.query(`
      INSERT INTO customer_support_case_events(
        public_id,case_id,actor_user_id,actor_public_id,event_type,note,before_state,after_state,customer_visible,created_at
      ) VALUES($1,$2::uuid,$3::uuid,$4,'note_added',$5,$6::jsonb,$7::jsonb,true,$8)
    `, [id("caseevt"), text(row.case_uuid), customer, principal.userId, message, JSON.stringify({ status: currentStatus }), JSON.stringify({ status: nextStatus }), now]);
    await tx.query(`
      INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
      VALUES('customer','customer_support.customer_replied','customer_support_case',$1,'Customer support reply',$2::jsonb,$3::jsonb,$4)
    `, [text(row.public_id), JSON.stringify({ status: currentStatus }), JSON.stringify({ status: nextStatus }), principal.userId]);
    await notifySupportTeam(tx, {
      eventType: "customer_support.customer_replied",
      title: "Νέα απάντηση πελάτη",
      body: `${text(row.reference_number)} · ο πελάτης απάντησε`,
      payload: { caseId: text(row.public_id), referenceNumber: text(row.reference_number) },
      dedupePrefix: `support-reply:${text(row.public_id)}:${now.getTime()}`,
      now
    });
  }, { isolation: "serializable" });
  return customerSupportCases(principal);
}

async function customerUuid(tx: SqlExecutor, userId: string): Promise<string> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [userId]);
  if (!result.rowCount) throw new Error("Ο λογαριασμός πελάτη δεν βρέθηκε.");
  return text(result.rows[0].id);
}

async function validateContext(tx: SqlExecutor, customerUuidValue: string, contextType: CustomerSupportContextType | undefined, rawContextId: string | undefined): Promise<string | undefined> {
  if (!contextType) return undefined;
  if (["account", "security", "saved", "other"].includes(contextType)) return undefined;
  const contextId = rawContextId?.trim() ?? "";
  if (!contextId || contextId.length > 200) throw new Error("Η αναφορά του σχετικού αιτήματος δεν είναι έγκυρη.");
  let result;
  if (contextType === "order") {
    result = await tx.query<SqlRow>("SELECT order_number AS reference_number FROM customer_orders WHERE customer_user_id=$1::uuid AND (public_id=$2 OR order_number=$2) LIMIT 1", [customerUuidValue, contextId]);
  } else if (contextType === "ask_local") {
    result = await tx.query<SqlRow>("SELECT reference_number FROM counteroffer_requests WHERE customer_user_id=$1::uuid AND (public_id=$2 OR reference_number=$2) LIMIT 1", [customerUuidValue, contextId]);
  } else if (contextType === "return") {
    result = await tx.query<SqlRow>("SELECT return_number AS reference_number FROM returns WHERE customer_user_id=$1::uuid AND (public_id=$2 OR return_number=$2) LIMIT 1", [customerUuidValue, contextId]);
  } else {
    result = await tx.query<SqlRow>("SELECT reference_number FROM privacy_requests WHERE user_id=$1::uuid AND (public_id=$2 OR reference_number=$2) LIMIT 1", [customerUuidValue, contextId]);
  }
  if (!result.rowCount) throw new Error("Η σχετική εγγραφή δεν ανήκει στον λογαριασμό σου ή δεν βρέθηκε.");
  return text(result.rows[0].reference_number);
}

async function notifySupportTeam(tx: SqlExecutor, input: { eventType: string; title: string; body: string; payload: Record<string, unknown>; dedupePrefix: string; now: Date }): Promise<void> {
  await tx.query(`
    WITH recipients AS (
      SELECT DISTINCT u.id AS user_id,u.public_id
      FROM platform_user_roles pur
      JOIN users u ON u.id=pur.user_id
      WHERE pur.role IN ('super_admin','customer_support') AND u.status='active'
    )
    INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
    SELECT gen_random_uuid(),'notification_' || gen_random_uuid()::text,r.user_id,'in_app','transactional',$1,'customer-support-v1','el',$2,$3,$4::jsonb,'queued',$5 || ':' || r.public_id,$6
    FROM recipients r
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `, [input.eventType, input.title, input.body, JSON.stringify(input.payload), input.dedupePrefix, input.now]);
}
