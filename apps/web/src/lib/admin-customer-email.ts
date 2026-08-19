import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { sendTransactionalEmail } from "./transactional-email";

export type AdminCustomerEmailStatus = "draft" | "approved" | "sending" | "sent" | "cancelled";
export type AdminCustomerEmailMessage = Readonly<{
  id: string;
  customerId: string;
  recipientEmail: string;
  subject: string;
  body: string;
  status: AdminCustomerEmailStatus;
  revision: number;
  draftedBy: string;
  approvedBy?: string;
  approvedAt?: number;
  sentBy?: string;
  sentAt?: number;
  providerMessageId?: string;
  lastDeliveryStatus?: string;
  createdAt: number;
  updatedAt: number;
}>;

const CUSTOMER_IDENTITY_PREDICATE = `
  NOT EXISTS (SELECT 1 FROM platform_user_roles pur WHERE pur.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.user_id=u.id)`;

function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 }); }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const result = typeof value === "string" ? value.trim() : ""; return result || undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const result = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(result) ? result : undefined; }
function integer(value: unknown): number { const result = Number(value ?? 0); return Number.isFinite(result) ? Math.trunc(result) : 0; }
function status(value: unknown): AdminCustomerEmailStatus { const result = text(value) as AdminCustomerEmailStatus; if (!["draft", "approved", "sending", "sent", "cancelled"].includes(result)) throw new Error("Invalid customer email status"); return result; }

function mapMessage(row: SqlRow): AdminCustomerEmailMessage {
  return {
    id: text(row.public_id),
    customerId: text(row.customer_public_id),
    recipientEmail: text(row.recipient_email),
    subject: text(row.subject),
    body: text(row.body),
    status: status(row.status),
    revision: integer(row.revision),
    draftedBy: text(row.drafted_by_public_id),
    approvedBy: optionalText(row.approved_by_public_id),
    approvedAt: epoch(row.approved_at),
    sentBy: optionalText(row.sent_by_public_id),
    sentAt: epoch(row.sent_at),
    providerMessageId: optionalText(row.provider_message_id),
    lastDeliveryStatus: optionalText(row.last_delivery_status),
    createdAt: epoch(row.created_at) ?? 0,
    updatedAt: epoch(row.updated_at) ?? 0
  };
}

async function customerTarget(tx: SqlExecutor, customerId: string) {
  const result = await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.preferred_locale
    FROM users u
    WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE}
    LIMIT 1`, [customerId]);
  if (!result.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
  const email = optionalText(result.rows[0].email);
  if (!email) throw new Error("Customer does not have an email address");
  return { userUuid: text(result.rows[0].user_uuid), id: text(result.rows[0].public_id), email, locale: text(result.rows[0].preferred_locale).toLowerCase().startsWith("en") ? "en" as const : "el" as const };
}

async function actorUuid(tx: SqlExecutor, principal: SessionPrincipal): Promise<string> {
  const result = await tx.query<SqlRow>(`SELECT id::text AS user_uuid FROM users WHERE public_id=$1 OR id::text=$1 LIMIT 1`, [principal.userId]);
  if (!result.rowCount) throw new Error("Platform actor not found");
  return text(result.rows[0].user_uuid);
}

export async function adminCustomerEmailMessages(principal: SessionPrincipal, customerId: string): Promise<readonly AdminCustomerEmailMessage[]> {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, customerId);
    const result = await tx.query<SqlRow>(`SELECT m.public_id,m.recipient_email,m.subject,m.body,m.status,m.revision,m.approved_at,m.sent_at,m.provider_message_id,m.last_delivery_status,m.created_at,m.updated_at,
      customer.public_id AS customer_public_id,drafter.public_id AS drafted_by_public_id,approver.public_id AS approved_by_public_id,sender.public_id AS sent_by_public_id
      FROM admin_customer_email_messages m
      JOIN users customer ON customer.id=m.customer_user_id
      JOIN users drafter ON drafter.id=m.drafted_by_user_id
      LEFT JOIN users approver ON approver.id=m.approved_by_user_id
      LEFT JOIN users sender ON sender.id=m.sent_by_user_id
      WHERE m.customer_user_id=$1::uuid
      ORDER BY m.created_at DESC
      LIMIT 30`, [customer.userUuid]);
    return result.rows.map(mapMessage);
  }, { readOnly: true });
}

export async function adminSaveCustomerEmailDraft(principal: SessionPrincipal, input: { customerId: string; messageId?: string; subject: string; body: string; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer email workflow requires the production database");
  const subject = input.subject.trim().replace(/\s+/g, " ");
  const body = input.body.trim();
  const reason = input.reason.trim();
  if (subject.length < 3 || subject.length > 240) throw new Error("Subject must be 3–240 characters");
  if (body.length < 5 || body.length > 20_000) throw new Error("Message must be 5–20,000 characters");
  if (reason.length < 5 || reason.length > 500) throw new Error("A meaningful drafting reason is required");

  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, input.customerId);
    const actor = await actorUuid(tx, principal);
    if (input.messageId?.trim()) {
      const current = await tx.query<SqlRow>(`SELECT id::text AS message_uuid,public_id,status::text,revision,subject,body,recipient_email
        FROM admin_customer_email_messages WHERE public_id=$1 AND customer_user_id=$2::uuid FOR UPDATE`, [input.messageId.trim(), customer.userUuid]);
      if (!current.rowCount) throw new Error("Customer email draft was not found");
      if (["sent", "sending", "cancelled"].includes(text(current.rows[0].status))) throw new Error("This message can no longer be edited");
      const updated = await tx.query<SqlRow>(`UPDATE admin_customer_email_messages SET recipient_email=$2,subject=$3,body=$4,updated_at=now()
        WHERE id=$1::uuid RETURNING public_id,status,revision,updated_at`, [current.rows[0].message_uuid, customer.email, subject, body]);
      await audit(tx, principal, text(current.rows[0].public_id), "customer_email.draft_revised", reason, { status: current.rows[0].status, revision: current.rows[0].revision, subject: current.rows[0].subject }, { status: updated.rows[0].status, revision: updated.rows[0].revision, subject });
      return { id: text(updated.rows[0].public_id), status: status(updated.rows[0].status), revision: integer(updated.rows[0].revision) };
    }

    const messageId = `cem_${randomUUID()}`;
    await tx.query(`INSERT INTO admin_customer_email_messages(public_id,customer_user_id,recipient_email,subject,body,status,revision,drafted_by_user_id)
      VALUES($1,$2::uuid,$3,$4,$5,'draft',1,$6::uuid)`, [messageId, customer.userUuid, customer.email, subject, body, actor]);
    await audit(tx, principal, messageId, "customer_email.draft_created", reason, {}, { customerId: customer.id, recipientEmail: customer.email, subject, status: "draft", revision: 1 });
    return { id: messageId, status: "draft" as const, revision: 1 };
  }, { isolation: "serializable" });
}

export async function adminApproveCustomerEmail(principal: SessionPrincipal, input: { customerId: string; messageId: string; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer email workflow requires the production database");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("A meaningful approval reason is required");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, input.customerId);
    const actor = await actorUuid(tx, principal);
    const current = await tx.query<SqlRow>(`SELECT id::text AS message_uuid,public_id,status::text,revision,subject
      FROM admin_customer_email_messages WHERE public_id=$1 AND customer_user_id=$2::uuid FOR UPDATE`, [input.messageId.trim(), customer.userUuid]);
    if (!current.rowCount) throw new Error("Customer email draft was not found");
    if (text(current.rows[0].status) !== "draft") throw new Error("Only a draft can be approved");
    await tx.query(`UPDATE admin_customer_email_messages SET status='approved',approved_by_user_id=$2::uuid,approved_at=now(),updated_at=now() WHERE id=$1::uuid`, [current.rows[0].message_uuid, actor]);
    await audit(tx, principal, text(current.rows[0].public_id), "customer_email.wording_approved", reason, { status: "draft", revision: current.rows[0].revision }, { status: "approved", revision: current.rows[0].revision, subject: current.rows[0].subject });
    return { id: text(current.rows[0].public_id), status: "approved" as const, revision: integer(current.rows[0].revision) };
  }, { isolation: "serializable" });
}

export async function adminCancelCustomerEmail(principal: SessionPrincipal, input: { customerId: string; messageId: string; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer email workflow requires the production database");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("A meaningful cancellation reason is required");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, input.customerId);
    const current = await tx.query<SqlRow>(`SELECT id::text AS message_uuid,public_id,status::text,revision FROM admin_customer_email_messages WHERE public_id=$1 AND customer_user_id=$2::uuid FOR UPDATE`, [input.messageId.trim(), customer.userUuid]);
    if (!current.rowCount) throw new Error("Customer email message was not found");
    if (["sent", "sending", "cancelled"].includes(text(current.rows[0].status))) throw new Error("This message cannot be cancelled");
    await tx.query(`UPDATE admin_customer_email_messages SET status='cancelled',updated_at=now() WHERE id=$1::uuid`, [current.rows[0].message_uuid]);
    await audit(tx, principal, text(current.rows[0].public_id), "customer_email.cancelled", reason, { status: current.rows[0].status, revision: current.rows[0].revision }, { status: "cancelled", revision: current.rows[0].revision });
    return { id: text(current.rows[0].public_id), status: "cancelled" as const };
  }, { isolation: "serializable" });
}

export async function adminSendApprovedCustomerEmail(principal: SessionPrincipal, input: { customerId: string; messageId: string; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer email workflow requires the production database");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("A meaningful send reason is required");

  const prepared = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerTarget(tx, input.customerId);
    const actor = await actorUuid(tx, principal);
    const current = await tx.query<SqlRow>(`SELECT id::text AS message_uuid,public_id,status::text,revision,recipient_email,subject,body
      FROM admin_customer_email_messages WHERE public_id=$1 AND customer_user_id=$2::uuid FOR UPDATE`, [input.messageId.trim(), customer.userUuid]);
    if (!current.rowCount) throw new Error("Customer email message was not found");
    if (text(current.rows[0].status) !== "approved") throw new Error("Wording must be approved before this email can be sent");
    await tx.query(`UPDATE admin_customer_email_messages SET status='sending',sent_by_user_id=$2::uuid,last_delivery_status='sending',updated_at=now() WHERE id=$1::uuid`, [current.rows[0].message_uuid, actor]);
    await audit(tx, principal, text(current.rows[0].public_id), "customer_email.send_started", reason, { status: "approved", revision: current.rows[0].revision }, { status: "sending", revision: current.rows[0].revision });
    return {
      uuid: text(current.rows[0].message_uuid),
      id: text(current.rows[0].public_id),
      recipientEmail: text(current.rows[0].recipient_email),
      subject: text(current.rows[0].subject),
      body: text(current.rows[0].body),
      revision: integer(current.rows[0].revision),
      locale: customer.locale
    };
  }, { isolation: "serializable" });

  try {
    const delivery = await sendTransactionalEmail({
      to: prepared.recipientEmail,
      subject: prepared.subject,
      text: prepared.body,
      eventType: "customer.admin_approved_notification",
      idempotencyKey: `admin-customer-email:${prepared.id}:revision:${prepared.revision}`,
      locale: prepared.locale,
      payload: { customerEmailMessageId: prepared.id, revision: prepared.revision }
    });
    await uow().withTransaction(platformScope(principal.userId), async (tx) => {
      await tx.query(`UPDATE admin_customer_email_messages SET status='sent',sent_at=now(),provider_message_id=$2,last_delivery_status='sent',updated_at=now() WHERE id=$1::uuid AND status='sending'`, [prepared.uuid, delivery.providerMessageId]);
      await audit(tx, principal, prepared.id, "customer_email.sent", reason, { status: "sending", revision: prepared.revision }, { status: "sent", revision: prepared.revision, providerMessageId: delivery.providerMessageId });
    }, { isolation: "serializable" });
    return { id: prepared.id, status: "sent" as const, providerMessageId: delivery.providerMessageId };
  } catch (error) {
    await uow().withTransaction(platformScope(principal.userId), async (tx) => {
      await tx.query(`UPDATE admin_customer_email_messages SET status='approved',sent_by_user_id=NULL,last_delivery_status='failed',updated_at=now() WHERE id=$1::uuid AND status='sending'`, [prepared.uuid]);
      await audit(tx, principal, prepared.id, "customer_email.send_failed", error instanceof Error ? error.message.slice(0, 500) : "Delivery failed", { status: "sending", revision: prepared.revision }, { status: "approved", revision: prepared.revision, delivery: "failed" });
    }, { isolation: "serializable" });
    throw error;
  }
}

async function audit(tx: SqlExecutor, principal: SessionPrincipal, messageId: string, action: string, reason: string, beforeState: unknown, afterState: unknown) {
  await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
    VALUES($1,$2,'customer_email_message',$3,$4,$5::jsonb,$6::jsonb,$7)`, [
    principal.roles[0] ?? "super_admin", action, messageId, reason, JSON.stringify(beforeState ?? {}), JSON.stringify(afterState ?? {}), principal.userId
  ]);
}
