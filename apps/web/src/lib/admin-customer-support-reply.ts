import { randomBytes } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

function id(prefix: string): string { return `${prefix}_${randomBytes(12).toString("hex")}`; }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }

export async function adminReplyToCustomerSupportCase(principal: SessionPrincipal, input: { caseId: string; message: string; now?: number }) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer support requires the production database");
  const caseId = input.caseId.trim();
  const message = input.message.trim();
  if (!caseId || caseId.length > 200) throw new Error("Support case is invalid");
  if (message.length < 3 || message.length > 4000) throw new Error("Customer-visible reply must be 3–4000 characters");
  const now = new Date(input.now ?? Date.now());
  const runtime = getProductionPostgresRuntime();
  const uow = new PostgresUnitOfWork(runtime.sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });

  return uow.withTransaction(platformScope(principal.userId), async (tx) => {
    const actor = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [principal.userId]);
    if (!actor.rowCount) throw new Error("Platform actor not found");
    const found = await tx.query<SqlRow>(`
      SELECT sc.id::text AS case_uuid,sc.public_id,sc.reference_number,sc.subject,sc.status,u.id::text AS customer_uuid,u.public_id AS customer_public_id
      FROM customer_support_cases sc
      JOIN users u ON u.id=sc.customer_user_id
      WHERE sc.public_id=$1 OR sc.reference_number=$1 OR sc.id::text=$1
      FOR UPDATE OF sc
    `, [caseId]);
    if (!found.rowCount) throw new Error("Support case not found");
    const row = found.rows[0];
    const currentStatus = text(row.status);
    if (currentStatus === "closed") throw new Error("Closed support cases cannot receive a new customer-visible reply");
    const nextStatus = "waiting_customer";

    await tx.query(`UPDATE customer_support_cases SET status=$2,resolved_at=NULL,updated_at=$3 WHERE id=$1::uuid`, [text(row.case_uuid), nextStatus, now]);
    await tx.query(`
      INSERT INTO customer_support_case_events(
        public_id,case_id,actor_user_id,actor_public_id,event_type,note,before_state,after_state,customer_visible,created_at
      ) VALUES($1,$2::uuid,$3::uuid,$4,'note_added',$5,$6::jsonb,$7::jsonb,true,$8)
    `, [id("caseevt"), text(row.case_uuid), text(actor.rows[0].id), principal.userId, message, JSON.stringify({ status: currentStatus }), JSON.stringify({ status: nextStatus }), now]);
    await tx.query(`
      INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id,actor_user_id)
      VALUES($1,'customer_support.customer_visible_reply','customer_support_case',$2,'Customer-visible support reply',$3::jsonb,$4::jsonb,$5,$6::uuid)
    `, [principal.roles[0] ?? "customer_support", text(row.public_id), JSON.stringify({ status: currentStatus }), JSON.stringify({ status: nextStatus }), principal.userId, text(actor.rows[0].id)]);
    await tx.query(`
      INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES(gen_random_uuid(),'notification_' || gen_random_uuid()::text,$1::uuid,'in_app','transactional','customer_support.reply','customer-support-v1','el','Νέα απάντηση από την υποστήριξη',$2,$3::jsonb,'queued',$4,$5)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `, [text(row.customer_uuid), `${text(row.reference_number)} · ${text(row.subject)}`, JSON.stringify({ caseId: text(row.public_id), referenceNumber: text(row.reference_number) }), `support-admin-reply:${text(row.public_id)}:${now.getTime()}`, now]);
    return { id: text(row.public_id), referenceNumber: text(row.reference_number), status: nextStatus, customerId: text(row.customer_public_id) };
  }, { isolation: "serializable" });
}
