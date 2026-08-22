import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { vendorScope } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type VendorAppointmentAction = "complete" | "cancel" | "no_show";

function requireVendor(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.some((role) => role.startsWith("vendor_"))) throw new Error("VENDOR_AUTH_REQUIRED");
  return principal.vendorId;
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function auditPublicId(): string { return `audit_${randomUUID().replaceAll("-", "")}`; }
function notificationPublicId(): string { return `notification_${randomUUID().replaceAll("-", "")}`; }

export async function vendorAppointmentLifecycleAction(
  principal: SessionPrincipal,
  appointmentId: string,
  action: VendorAppointmentAction,
  nowMs = Date.now()
): Promise<{ ok: true }> {
  const vendorId = requireVendor(principal);
  if (!productionDatabaseConfigured()) throw new Error("Τα ραντεβού απαιτούν την παραγωγική υπηρεσία PostgreSQL.");
  const publicId = appointmentId.trim();
  if (!publicId || publicId.length > 200) throw new Error("Το ραντεβού δεν είναι έγκυρο.");
  return uow().withTransaction(vendorScope(principal.userId, vendorId), async (tx) => {
    const found = await tx.query<SqlRow>(`
      SELECT a.id::text AS appointment_uuid,a.status::text AS status,a.starts_at,
             a.market_id::text AS market_uuid,a.customer_user_id::text AS customer_uuid,
             vb.id::text AS vendor_uuid,vb.public_id AS vendor_public_id
      FROM appointments a
      JOIN vendor_businesses vb ON vb.id=a.vendor_id
      WHERE a.public_id=$1 AND vb.public_id=$2
      FOR UPDATE
    `, [publicId, vendorId]);
    if (!found.rowCount) throw new Error("Vendor appointment access denied");
    const row = found.rows[0];
    const status = text(row.status);
    const startsAt = new Date(String(row.starts_at)).getTime();
    const now = new Date(nowMs);
    let next: "completed" | "cancelled" | "no_show";
    if (action === "cancel") {
      if (!["pending", "confirmed", "rescheduled"].includes(status)) throw new Error("Το ραντεβού δεν μπορεί πλέον να ακυρωθεί.");
      next = "cancelled";
    } else if (action === "complete") {
      if (!["confirmed", "rescheduled"].includes(status)) throw new Error("Μόνο επιβεβαιωμένο ραντεβού μπορεί να ολοκληρωθεί.");
      if (Number.isFinite(startsAt) && startsAt > nowMs) throw new Error("Το ραντεβού δεν μπορεί να ολοκληρωθεί πριν από την ώρα έναρξης.");
      next = "completed";
    } else {
      if (!["confirmed", "rescheduled"].includes(status)) throw new Error("Μόνο επιβεβαιωμένο ραντεβού μπορεί να σημειωθεί ως μη εμφάνιση.");
      if (Number.isFinite(startsAt) && startsAt > nowMs) throw new Error("Η μη εμφάνιση μπορεί να καταγραφεί μόνο αφού ξεκινήσει το ραντεβού.");
      next = "no_show";
    }
    await tx.query("UPDATE appointments SET status=$2,updated_at=$3 WHERE id=$1::uuid", [text(row.appointment_uuid), next, now]);
    const actor = await vendorActorUuid(tx, principal.userId);
    await tx.query(`
      INSERT INTO audit_events(public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at)
      VALUES($1,$2::uuid,$3::uuid,$4,'vendor_staff',$5,'appointment',$6,'Vendor appointment lifecycle action',$7::jsonb,$8::jsonb,$9)
    `, [auditPublicId(), text(row.market_uuid), actor, principal.userId, `appointment.vendor_${action}`, publicId, JSON.stringify({ status }), JSON.stringify({ status: next }), now]);
    const customerUuid = row.customer_uuid ? text(row.customer_uuid) : "";
    if (customerUuid) {
      const title = next === "completed" ? "Το ραντεβού ολοκληρώθηκε" : next === "cancelled" ? "Το κατάστημα ακύρωσε το ραντεβού" : "Καταγράφηκε μη εμφάνιση";
      const body = next === "completed" ? "Η προγραμματισμένη συμβουλή καταγράφηκε ως ολοκληρωμένη." : next === "cancelled" ? "Η ώρα είναι πλέον ελεύθερη και μπορείς να κλείσεις νέο ραντεβού." : "Αν θεωρείς ότι αυτό καταγράφηκε λανθασμένα, επικοινώνησε με την υποστήριξη.";
      await notifyCustomer(tx, customerUuid, text(row.vendor_uuid), { eventType: `appointment.${next}`, title, body, appointmentId: publicId, vendorId: text(row.vendor_public_id), now });
    }
    return { ok: true } as const;
  }, { isolation: "serializable" });
}

async function vendorActorUuid(tx: SqlExecutor, publicId: string): Promise<string> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [publicId]);
  if (!result.rowCount) throw new Error("Vendor actor not found");
  return text(result.rows[0].id);
}

async function notifyCustomer(tx: SqlExecutor, customerUuid: string, vendorUuid: string, input: {
  eventType: string; title: string; body: string; appointmentId: string; vendorId: string; now: Date;
}): Promise<void> {
  await tx.query(`
    INSERT INTO notifications(id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
    VALUES(gen_random_uuid(),$1,$2::uuid,$3::uuid,'in_app','transactional',$4,'appointments-v1','el',$5,$6,$7::jsonb,'queued',$8,$9)
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `, [notificationPublicId(), customerUuid, vendorUuid, input.eventType, input.title, input.body, JSON.stringify({ appointmentId: input.appointmentId, vendorId: input.vendorId }), `${input.eventType}:${input.appointmentId}`, input.now]);
}
