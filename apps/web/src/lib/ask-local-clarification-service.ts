import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import type { AskLocalRequestView } from "./ask-local-service";
import { getProductionPostgresRuntime } from "./postgres-runtime";

export type AskLocalClarificationMessage = Readonly<{
  id: string;
  senderType: "customer" | "vendor" | "platform" | "system";
  body: string;
  createdAt: number;
}>;

const globalKey = "__blsAskLocalClarifications" as const;
const requestMemoryKey = "__blsAskLocalMemory" as const;
const maxMessages = 40;
type MemoryThread = Readonly<{ requestId: string; vendorId?: string; customerId?: string; messages: AskLocalClarificationMessage[] }>;
type AskLocalMemoryStore = Map<string, AskLocalRequestView[]>;
const globals = globalThis as typeof globalThis & {
  [globalKey]?: Map<string, MemoryThread>;
  [requestMemoryKey]?: AskLocalMemoryStore;
};
function memoryThreads() { return globals[globalKey] ??= new Map<string, MemoryThread>(); }
function requestMemoryStore() { return globals[requestMemoryKey] ??= new Map<string, AskLocalRequestView[]>(); }
function postgresEnabled() { return Boolean(process.env.DATABASE_URL?.trim()); }

function validateBody(value: string): string {
  const body = value.trim().replace(/\s+/g, " ");
  if (body.length < 3 || body.length > 2000) throw new Error("Το μήνυμα πρέπει να έχει από 3 έως 2.000 χαρακτήρες.");
  return body;
}

function messageFromValue(value: unknown): AskLocalClarificationMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const senderType = typeof record.senderType === "string" ? record.senderType : "";
  const id = typeof record.id === "string" ? record.id : "";
  const body = typeof record.body === "string" ? record.body : "";
  const createdAt = Number(record.createdAt);
  if (!id || !body || !["customer", "vendor", "platform", "system"].includes(senderType) || !Number.isFinite(createdAt)) return undefined;
  return { id, senderType: senderType as AskLocalClarificationMessage["senderType"], body, createdAt };
}

function clarificationMessagesFromMetadata(value: unknown): AskLocalClarificationMessage[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const raw = (value as Record<string, unknown>).clarificationMessages;
  if (!Array.isArray(raw)) return [];
  return raw.map(messageFromValue).filter((item): item is AskLocalClarificationMessage => Boolean(item)).slice(-maxMessages);
}

function metadataWithMessages(value: unknown, messages: readonly AskLocalClarificationMessage[]): string {
  const metadata = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  metadata.clarificationMessages = messages.slice(-maxMessages);
  return JSON.stringify(metadata);
}

function vendorRequestMemoryClarification(principal: SessionPrincipal, requestId: string, question: string, now: number): void {
  for (const [customerId, requests] of requestMemoryStore()) {
    const index = requests.findIndex((request) => request.id === requestId && request.assignedVendorId === principal.vendorId);
    if (index < 0) continue;
    const request = requests[index];
    if (request.status !== "awaiting_vendor") throw new Error("Διευκρίνιση μπορεί να ζητηθεί μόνο όταν περιμένουμε ενέργεια από το κατάστημα.");
    const current = memoryThreads().get(requestId);
    const messages = [...(current?.messages ?? []), { id: `message_${randomUUID()}`, senderType: "vendor" as const, body: question, createdAt: now }].slice(-maxMessages);
    requests[index] = { ...request, status: "needs_info", responseDueAt: undefined, clarificationCount: messages.length };
    requestMemoryStore().set(customerId, requests);
    memoryThreads().set(requestId, { requestId, vendorId: principal.vendorId, customerId, messages });
    return;
  }
  throw new Error("Το Ask Local αίτημα δεν είναι ανατεθειμένο σε αυτό το κατάστημα.");
}

function customerReplyMemoryClarification(principal: SessionPrincipal, requestId: string, reply: string, now: number): void {
  const requests = requestMemoryStore().get(principal.userId) ?? [];
  const index = requests.findIndex((request) => request.id === requestId);
  if (index < 0) throw new Error("Το Ask Local αίτημα δεν βρέθηκε στον λογαριασμό σου.");
  const request = requests[index];
  if (request.status !== "needs_info") throw new Error("Το αίτημα δεν περιμένει διευκρίνιση από εσένα.");
  const current = memoryThreads().get(requestId);
  if (!current || current.customerId !== principal.userId) throw new Error("Η συζήτηση διευκρίνισης δεν βρέθηκε.");
  const last = current.messages.at(-1);
  if (!last || last.senderType !== "vendor") throw new Error("Δεν υπάρχει νέο ερώτημα καταστήματος που να περιμένει απάντηση.");
  const messages = [...current.messages, { id: `message_${randomUUID()}`, senderType: "customer" as const, body: reply, createdAt: now }].slice(-maxMessages);
  requests[index] = { ...request, status: "awaiting_vendor", responseDueAt: now + 24 * 60 * 60 * 1000, clarificationCount: messages.length };
  requestMemoryStore().set(principal.userId, requests);
  memoryThreads().set(requestId, { ...current, messages });
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
    vendorRequestMemoryClarification(principal, requestId, question, now);
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, vendorId: principal.vendorId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.public_id,cr.status::text,cr.customer_user_id::text AS customer_uuid,
             cr.source_metadata,v.id::text AS vendor_uuid
      FROM counteroffer_requests cr
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND v.public_id=$2 AND cr.workflow_owner_kind='vendor'
      FOR UPDATE OF cr
    `, [requestId, principal.vendorId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν είναι ανατεθειμένο σε αυτό το κατάστημα.");
    const row = found.rows[0];
    if (String(row.status) !== "awaiting_vendor") throw new Error("Διευκρίνιση μπορεί να ζητηθεί μόνο όταν περιμένουμε ενέργεια από το κατάστημα.");

    const messages = [...clarificationMessagesFromMetadata(row.source_metadata), {
      id: `message_${randomUUID()}`,
      senderType: "vendor" as const,
      body: question,
      createdAt: now
    }].slice(-maxMessages);
    const metadata = metadataWithMessages(row.source_metadata, messages);
    await tx.query(`UPDATE counteroffer_requests
      SET source_metadata=$2::jsonb,status='needs_info',expires_at=NULL,updated_at=$3,workflow_updated_at=$3
      WHERE id=$1::uuid`, [row.request_uuid, metadata, new Date(now)]);
    await tx.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional','counteroffer.needs_info','ask-local-clarification-v1','el','Χρειάζεται μία διευκρίνιση',$4,$5::jsonb,'sent',$6,$7)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
      randomUUID(), `notification_${randomUUID()}`, row.customer_uuid, question.slice(0, 240),
      JSON.stringify({ requestId, vendorId: principal.vendorId }), `ask-local-needs-info:${requestId}:${now}`, new Date(now)
    ]);
  }, { isolation: "serializable" });
}

export async function customerReplyAskLocalClarification(
  principal: SessionPrincipal,
  input: { requestId: string; reply: string; now?: number }
): Promise<void> {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
  const requestId = input.requestId.trim();
  const reply = validateBody(input.reply);
  const now = input.now ?? Date.now();
  if (!requestId) throw new Error("Ask Local request is required");

  if (!postgresEnabled()) {
    customerReplyMemoryClarification(principal, requestId, reply, now);
    return;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
  await uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT cr.id::text AS request_uuid,cr.status::text,cr.assigned_vendor_id::text AS vendor_uuid,
             cr.source_metadata,u.id::text AS customer_uuid
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      JOIN vendor_businesses v ON v.id=cr.assigned_vendor_id
      WHERE cr.public_id=$1 AND u.public_id=$2 AND cr.workflow_owner_kind='vendor'
      FOR UPDATE OF cr
    `, [requestId, principal.userId]);
    if (!found.rowCount) throw new Error("Το Ask Local αίτημα δεν βρέθηκε στον λογαριασμό σου.");
    const row = found.rows[0];
    if (String(row.status) !== "needs_info") throw new Error("Το αίτημα δεν περιμένει διευκρίνιση από εσένα.");

    const existingMessages = clarificationMessagesFromMetadata(row.source_metadata);
    const last = existingMessages.at(-1);
    if (!last || last.senderType !== "vendor") throw new Error("Δεν υπάρχει νέο ερώτημα καταστήματος που να περιμένει απάντηση.");
    const messages = [...existingMessages, {
      id: `message_${randomUUID()}`,
      senderType: "customer" as const,
      body: reply,
      createdAt: now
    }].slice(-maxMessages);
    const metadata = metadataWithMessages(row.source_metadata, messages);
    const dueAt = new Date(now + 24 * 60 * 60 * 1000);
    await tx.query(`UPDATE counteroffer_requests
      SET source_metadata=$2::jsonb,status='awaiting_vendor',expires_at=$3,updated_at=$4,workflow_updated_at=$4
      WHERE id=$1::uuid`, [row.request_uuid, metadata, dueAt, new Date(now)]);
    await tx.query(`INSERT INTO notifications(id,public_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES($1,$2,$3::uuid,'in_app','transactional','counteroffer.customer_replied','ask-local-clarification-v1','el','Ο πελάτης απάντησε στο Ask Local',$4,$5::jsonb,'sent',$6,$7)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [
      randomUUID(), `notification_${randomUUID()}`, row.vendor_uuid, reply.slice(0, 240),
      JSON.stringify({ requestId, responseDueAt: dueAt.getTime(), customerId: principal.userId }),
      `ask-local-customer-replied:${requestId}:${now}`, new Date(now)
    ]);
  }, { isolation: "serializable" });
}

export async function askLocalClarificationMessages(
  principal: SessionPrincipal,
  requestIdValue: string
): Promise<readonly AskLocalClarificationMessage[]> {
  const requestId = requestIdValue.trim();
  if (!requestId) return [];
  if (!postgresEnabled()) {
    const thread = memoryThreads().get(requestId);
    if (!thread) return [];
    if (thread.customerId !== principal.userId) throw new Error("Η συζήτηση διευκρίνισης δεν βρέθηκε.");
    return thread.messages;
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 10_000, lockTimeoutMs: 3_000 });
  return uow.withTransaction({ actorUserId: principal.userId, marketId: "sparta", platformAccess: true }, async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT cr.source_metadata
      FROM counteroffer_requests cr
      JOIN users u ON u.id=cr.customer_user_id
      WHERE cr.public_id=$1 AND u.public_id=$2
      LIMIT 1
    `, [requestId, principal.userId]);
    if (!result.rowCount) throw new Error("Η συζήτηση διευκρίνισης δεν βρέθηκε.");
    return clarificationMessagesFromMetadata(result.rows[0].source_metadata);
  }, { readOnly: true });
}
