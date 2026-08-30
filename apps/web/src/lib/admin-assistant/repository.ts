import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "../postgres-runtime";
import { postgresAdminRuntimeEnabled } from "../admin-runtime";
import type { AdminAssistantContext, AdminAssistantConversationSummary, AdminAssistantResponsePayload, AdminAssistantStoredMessage } from "./types";

const memoryKey = "__kontamouAdminAssistantMemory" as const;
type MemoryConversation = AdminAssistantConversationSummary & { adminUserId: string; messages: AdminAssistantStoredMessage[] };
type MemoryState = { conversations: Map<string, MemoryConversation>; toolAudit: Array<Record<string, unknown>> };
type Globals = typeof globalThis & { [memoryKey]?: MemoryState };
const globals = globalThis as Globals;
function memory(): MemoryState { return globals[memoryKey] ?? (globals[memoryKey] = { conversations: new Map(), toolAudit: [] }); }

function integer(row: SqlRow, field: string): number { const value = Number(row[field] ?? 0); return Number.isFinite(value) ? value : 0; }
function text(row: SqlRow, field: string): string { return typeof row[field] === "string" ? row[field] as string : ""; }
function optionalText(row: SqlRow, field: string): string | undefined { const value = text(row, field); return value || undefined; }
function jsonPayload(row: SqlRow): AdminAssistantResponsePayload | undefined {
  const value = row.structured_json;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as AdminAssistantResponsePayload;
}

export async function ensureAssistantConversation(principal: SessionPrincipal, input: { conversationId?: string; title: string; context: AdminAssistantContext }): Promise<AdminAssistantConversationSummary> {
  const now = Date.now();
  if (!postgresAdminRuntimeEnabled()) {
    const state = memory();
    const existing = input.conversationId ? state.conversations.get(input.conversationId) : undefined;
    if (existing && existing.adminUserId === principal.userId) {
      const updated: MemoryConversation = { ...existing, title: existing.title || input.title, lastRoute: input.context.route, entityType: input.context.entityType, entityId: input.context.entityId, updatedAt: now };
      state.conversations.set(updated.id, updated);
      return updated;
    }
    const created: MemoryConversation = { id: randomUUID(), adminUserId: principal.userId, title: input.title.slice(0, 160) || "Admin investigation", lastRoute: input.context.route, entityType: input.context.entityType, entityId: input.context.entityId, createdAt: now, updatedAt: now, messages: [] };
    state.conversations.set(created.id, created);
    return created;
  }

  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    if (input.conversationId) {
      const existing = await tx.query<SqlRow>(`SELECT id,title,last_route,entity_type,entity_id,created_at,updated_at FROM admin_assistant_conversations WHERE id=$1 AND admin_user_id=$2 LIMIT 1`, [input.conversationId, principal.userId]);
      if (existing.rows[0]) {
        await tx.query(`UPDATE admin_assistant_conversations SET last_route=$3,entity_type=$4,entity_id=$5,updated_at=$6 WHERE id=$1 AND admin_user_id=$2`, [input.conversationId, principal.userId, input.context.route, input.context.entityType ?? null, input.context.entityId ?? null, now]);
        const row = existing.rows[0];
        return { id: text(row, "id"), title: text(row, "title"), lastRoute: input.context.route, entityType: input.context.entityType, entityId: input.context.entityId, createdAt: integer(row, "created_at"), updatedAt: now };
      }
    }
    const id = randomUUID();
    const title = input.title.slice(0, 160) || "Admin investigation";
    await tx.query(`INSERT INTO admin_assistant_conversations(id,admin_user_id,title,last_route,entity_type,entity_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$7)`, [id, principal.userId, title, input.context.route, input.context.entityType ?? null, input.context.entityId ?? null, now]);
    return { id, title, lastRoute: input.context.route, entityType: input.context.entityType, entityId: input.context.entityId, createdAt: now, updatedAt: now };
  });
}

export async function saveAssistantMessage(principal: SessionPrincipal, conversationId: string, input: { role: "user" | "assistant"; content: string; structured?: AdminAssistantResponsePayload; context: AdminAssistantContext }): Promise<AdminAssistantStoredMessage> {
  const message: AdminAssistantStoredMessage = { id: randomUUID(), role: input.role, content: input.content.slice(0, 12_000), structured: input.structured, createdAt: Date.now() };
  if (!postgresAdminRuntimeEnabled()) {
    const conversation = memory().conversations.get(conversationId);
    if (!conversation || conversation.adminUserId !== principal.userId) throw new Error("ASSISTANT_CONVERSATION_NOT_FOUND");
    conversation.messages.push(message);
    conversation.updatedAt = message.createdAt;
    conversation.lastRoute = input.context.route;
    return message;
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const owner = await tx.query<SqlRow>(`SELECT id FROM admin_assistant_conversations WHERE id=$1 AND admin_user_id=$2 LIMIT 1`, [conversationId, principal.userId]);
    if (!owner.rows[0]) throw new Error("ASSISTANT_CONVERSATION_NOT_FOUND");
    await tx.query(`INSERT INTO admin_assistant_messages(id,conversation_id,admin_user_id,role,content,structured_json,context_json,created_at) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`, [message.id, conversationId, principal.userId, message.role, message.content, JSON.stringify(message.structured ?? {}), JSON.stringify(input.context), message.createdAt]);
    await tx.query(`UPDATE admin_assistant_conversations SET last_route=$3,entity_type=$4,entity_id=$5,updated_at=$6 WHERE id=$1 AND admin_user_id=$2`, [conversationId, principal.userId, input.context.route, input.context.entityType ?? null, input.context.entityId ?? null, message.createdAt]);
  });
  return message;
}

export async function listAssistantConversations(principal: SessionPrincipal, limit = 20): Promise<readonly AdminAssistantConversationSummary[]> {
  const boundedLimit = Math.min(50, Math.max(1, limit));
  if (!postgresAdminRuntimeEnabled()) return [...memory().conversations.values()].filter((item) => item.adminUserId === principal.userId).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, boundedLimit).map(({ messages: _messages, adminUserId: _adminUserId, ...item }) => item);
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT id,title,last_route,entity_type,entity_id,created_at,updated_at FROM admin_assistant_conversations WHERE admin_user_id=$1 ORDER BY updated_at DESC LIMIT $2`, [principal.userId, boundedLimit]);
    return result.rows.map((row) => ({ id: text(row, "id"), title: text(row, "title"), lastRoute: optionalText(row, "last_route"), entityType: optionalText(row, "entity_type"), entityId: optionalText(row, "entity_id"), createdAt: integer(row, "created_at"), updatedAt: integer(row, "updated_at") }));
  }, { readOnly: true });
}

export async function getAssistantConversationMessages(principal: SessionPrincipal, conversationId: string, limit = 100): Promise<readonly AdminAssistantStoredMessage[]> {
  const boundedLimit = Math.min(200, Math.max(1, limit));
  if (!postgresAdminRuntimeEnabled()) {
    const conversation = memory().conversations.get(conversationId);
    if (!conversation || conversation.adminUserId !== principal.userId) return [];
    return conversation.messages.slice(-boundedLimit);
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`SELECT m.id,m.role,m.content,m.structured_json,m.created_at FROM admin_assistant_messages m JOIN admin_assistant_conversations c ON c.id=m.conversation_id WHERE m.conversation_id=$1 AND m.admin_user_id=$2 AND c.admin_user_id=$2 ORDER BY m.created_at ASC LIMIT $3`, [conversationId, principal.userId, boundedLimit]);
    return result.rows.map((row) => ({ id: text(row, "id"), role: text(row, "role") === "assistant" ? "assistant" : "user", content: text(row, "content"), structured: jsonPayload(row), createdAt: integer(row, "created_at") }));
  }, { readOnly: true });
}

export async function recordAssistantToolAudit(principal: SessionPrincipal, input: { conversationId?: string; toolName: string; entityType?: string; entityId?: string; parameters?: Record<string, unknown>; resultState: "ok" | "error"; error?: string; durationMs?: number }): Promise<void> {
  const row = { id: randomUUID(), adminUserId: principal.userId, createdAt: Date.now(), ...input, parameters: input.parameters ?? {} };
  if (!postgresAdminRuntimeEnabled()) {
    memory().toolAudit.push(row);
    if (memory().toolAudit.length > 500) memory().toolAudit.splice(0, memory().toolAudit.length - 500);
    return;
  }
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool);
  await uow.withTransaction(platformScope(principal.userId), async (tx) => {
    await tx.query(`INSERT INTO admin_assistant_tool_audit(id,admin_user_id,conversation_id,tool_name,entity_type,entity_id,parameters_json,result_state,error,duration_ms,created_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11)`, [row.id, principal.userId, input.conversationId ?? null, input.toolName.slice(0, 120), input.entityType ?? null, input.entityId ?? null, JSON.stringify(input.parameters ?? {}), input.resultState, input.error?.slice(0, 500) ?? null, input.durationMs ?? null, row.createdAt]);
  });
}
