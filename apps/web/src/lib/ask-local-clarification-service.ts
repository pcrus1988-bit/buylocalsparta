import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AskLocalClarificationMessage = Readonly<{
  id: string;
  senderType: "customer" | "vendor" | "admin" | "system";
  body: string;
  createdAt: number;
}>;

const globalKey = "__blsAskLocalClarifications" as const;
type MemoryThread = Readonly<{ requestId: string; vendorId?: string; customerId?: string; messages: AskLocalClarificationMessage[] }>;
const globals = globalThis as typeof globalThis & { [globalKey]?: Map<string, MemoryThread> };
function memoryThreads() { return globals[globalKey] ??= new Map<string, MemoryThread>(); }
function postgresEnabled() { return Boolean(process.env.DATABASE_URL?.trim()); }

function validateBody(value: string): string {
  const body = value.trim().replace(/\s+/g, " ");
  if (body.length < 3 || body.length > 2000) throw new Error("Το μήνυμα πρέπει να έχει από 3 έως 2.000 χαρακτήρες.");
  return body;
}
function epoch(value: unknown): number {
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  if (!Number.isFinite(parsed)) throw new Error("Invalid clarification timestamp");
  return parsed;
}
function messageFrom(row: SqlRow): AskLocalClarificationMessage {
  const sender = String(row.sender_type);
  if (!["customer", "vendor", "admin", "system"].includes(sender)) throw new Error("Invalid clarification sender");
  return { id: String(row.public_id), senderType: sender as AskLocalClarificationMessage["senderType"], body: String(row.body), createdAt: epoch(row.created_at) };
}

export async function vendorRequestAskLocalClarification(
  principal: SessionPrincipal,
  input: { requestId: string; question: string; now?: number }
): Promise<void> {
  const requestId = input.requestId.trim();
  const question = validateBody(input.question);
  const now = input.now ?? Date.now();
  if (!requestId) throw new Error("Ask Local request is required");
  if (!principal.vendorId) throw new Error("VENDOR_REQUIRED");

  if (!postgresEnabled()) {
    const current = memoryThreads().get(requestId);
    const messages = [...(current?.messages ?? []), { id: `msg_${randomUUID()}`, senderType: "vendor" as const, body: question, createdAt: now }];
    memoryThreads().set(requestId, { requestId, vendorId: principal.vendorId, messages });
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, vendorId: principal.vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.public_id,cr.status::text,cr.customer_user_id::text AS customer_uuid,
             cr.canonical_variant_id::text AS canonical_uuid,cr.market_id::text AS market_uuid,
             v.id::text AS vendor_uuid,u.public_id AS customer_public_id
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      JOIN users u ON u.id=cr.customer_user_id
      WHERE cr.public_id=$1 AND v.public_id=$2 AND cr.workflow_owner_kind='vendor'
      FOR UPDATE OF cr
    `, [requestId, principal.vendorId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν είναι ανατεθειμένο σε αυτό το κατάστημα.");
    const row = found.rows[0];
    if (String(row.status) !== "awaiting_vendor") throw new Error("Διευκρίνιση μπορεί να ζητηθεί μόνο όταν περιμένουμε ενέργεια από το κατάστημα.");

    const existing = await tx.query<SqlRow>(`
      SELECT c.id::text AS conversation_uuid,c.public_id
      FROM conversations c
      WHERE c.customer_user_id=$1::uuid AND c.vendor_id=$2::uuid
        AND c.context->>'askLocalRequestId'=$3
      ORDER BY c.created_at DESC LIMIT 1
      FOR UPDATE
    `, [row.customer_uuid, row.vendor_uuid, requestId]);
    const conversationUuid = existing.rows[0]?.conversation_uuid ? String(existing.rows[0].conversation_uuid) : randomUUID();
    const conversationId = existing.rows[0]?.public_id ? String(existing.rows[0].public_id) : `conversation_${randomUUID()}`;
    if (!existing.rowCount) {
      await tx.query(`INSERT INTO conversations(id,public_id,market_id,customer_user_id,vendor_id,canonical_variant_id,status,context,created_at,updated_at)
        VALUES($1,$2,$3::uuid,$4::uuid,$5::uuid,$6::uuid,'waiting_customer',$7::jsonb,$8,$8)`, [
        conversationUuid, conversationId, row.market_uuid, row.customer_uuid, row.vendor_uuid, row.canonical_uuid ?? null,
        JSON.stringify({ kind: "ask_local_clarification", askLocalRequestId: requestId }), new Date(now)
      ]);
    } else {
      await tx.query("UPDATE conversations SET status='waiting_customer',updated_at=$2 WHERE id=$1::uuid", [conversationUuid, new Date(now)]);
    }
    await tx.query(`INSERT INTO messages(id,public_id,conversation_id,sender_type,sender_user_id,body,created_at)
      VALUES($1,$2,$3::uuid,'vendor',(SELECT id FROM users WHERE public_id=$4),$5,$6)`, [randomUUID(), `message_${randomUUID()}`, conversationUuid, principal.userId, question, new Date(now)]);
    await tx.query(`UPDATE counteroffer_requests
      SET status='needs_info',expires_at=NULL,updated_at=$2,workflow_updated_at=$2
      WHERE id=$1::uuid`, [row.request_uuid, new Date(now)]);
    await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional','counteroffer.needs_info','ask-local-clarification-v1','el','Χρειάζεται μία διευκρίνιση',$4,$5::jsonb,'sent',$6,$7)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
      randomUUID(), `notification_${randomUUID()}`, row.customer_uuid, question.slice(0, 240),
      JSON.stringify({ requestId, conversationId, vendorId: principal.vendorId }), `ask-local-needs-info:${requestId}:${conversationId}:${now}`, new Date(now)
    ]);
  }, { isolation: "serializable" });
}

export async function customerReplyAskLocalClarification(
  principal: SessionPrincipal,
  input: { requestId: string; reply: string; now?: number }
): Promise<void> {
  const requestId = input.requestId.trim();
  const reply = validateBody(input.reply);
  const now = input.now ?? Date.now();
  if (!requestId) throw new Error("Ask Local request is required");

  if (!postgresEnabled()) {
    const current = memoryThreads().get(requestId);
    const messages = [...(current?.messages ?? []), { id: `msg_${randomUUID()}`, senderType: "customer" as const, body: reply, createdAt: now }];
    memoryThreads().set(requestId, { requestId, customerId: principal.userId, vendorId: current?.vendorId, messages });
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.status::text,cr.assigned_vendor_id::text AS vendor_uuid,
             v.public_id AS vendor_public_id,u.id::text AS customer_uuid
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND u.public_id=$2 AND cr.workflow_owner_kind='vendor'
      FOR UPDATE OF cr
    `, [requestId, principal.userId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν βρέθηκε στον λογαριασμό σου.");
    const row = found.rows[0];
    if (String(row.status) !== "needs_info") throw new Error("Το αίτημα δεν περιμένει διευκρίνιση από εσένα.");

    const conversation = await tx.query<SqlRow>(`
      SELECT c.id::text AS conversation_uuid,c.public_id
      FROM conversations c
      WHERE c.customer_user_id=$1::uuid AND c.vendor_id=$2::uuid
        AND c.context->>'askLocalRequestId'=$3
      ORDER BY c.created_at DESC LIMIT 1
      FOR UPDATE
    `, [row.customer_uuid, row.vendor_uuid, requestId]);
    if (!conversation.rowCount) throw new Error("Η συζήτηση διευκρίνισης δεν βρέθηκε.");
    const conversationUuid = String(conversation.rows[0].conversation_uuid);
    const conversationId = String(conversation.rows[0].public_id);
    const last = await tx.query<SqlRow>("SELECT sender_type FROM messages WHERE conversation_id=$1::uuid ORDER BY created_at DESC,id DESC LIMIT 1", [conversationUuid]);
    if (!last.rowCount || String(last.rows[0].sender_type) !== "vendor") throw new Error("Δεν υπάρχει νέο ερώτημα καταστήματος που να περιμένει απάντηση.");

    await tx.query(`INSERT INTO messages(id,public_id,conversation_id,sender_type,sender_user_id,body,created_at)
      VALUES($1,$2,$3::uuid,'customer',$4::uuid,$5,$6)`, [randomUUID(), `message_${randomUUID()}`, conversationUuid, row.customer_uuid, reply, new Date(now)]);
    await tx.query("UPDATE conversations SET status='waiting_vendor',updated_at=$2 WHERE id=$1::uuid", [conversationUuid, new Date(now)]);
    const dueAt = new Date(now + 24 * 60 * 60 * 1000);
    await tx.query(`UPDATE counteroffer_requests
      SET status='awaiting_vendor',expires_at=$2,updated_at=$3,workflow_updated_at=$3
      WHERE id=$1::uuid`, [row.request_uuid, dueAt, new Date(now)]);
    await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional','counteroffer.customer_replied','ask-local-clarification-v1','el','Ο πελάτης απάντησε στο Ask Local',$4,$5::jsonb,'sent',$6,$7)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
      randomUUID(), `notification_${randomUUID()}`, row.vendor_uuid, reply.slice(0, 240),
      JSON.stringify({ requestId, conversationId, responseDueAt: dueAt.getTime(), customerId: principal.userId }),
      `ask-local-customer-replied:${requestId}:${conversationId}:${now}`, new Date(now)
    ]);
  }, { isolation: "serializable" });
}

export async function askLocalClarificationMessages(
  principal: SessionPrincipal,
  requestIdValue: string
): Promise<readonly AskLocalClarificationMessage[]> {
  const requestId = requestIdValue.trim();
  if (!requestId) return [];
  if (!postgresEnabled()) return memoryThreads().get(requestId)?.messages ?? [];
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT m.public_id,m.sender_type,m.body,m.created_at
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      JOIN conversations c ON c.customer_user_id=cr.customer_user_id
        AND c.vendor_id=cr.assigned_vendor_id
        AND c.context->>'askLocalRequestId'=cr.public_id
      JOIN messages m ON m.conversation_id=c.id
      WHERE cr.public_id=$1 AND u.public_id=$2
      ORDER BY m.created_at,m.id
    `, [requestId, principal.userId]);
    return result.rows.map(messageFrom);
  }, { readOnly: true });
}
