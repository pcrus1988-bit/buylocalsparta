import { randomUUID } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlExecutor, type SqlRow } from "@buy-local-sparta/core";
import { platformScope, PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_APPOINTMENT_CHANNELS = ["in_person", "phone"] as const;
export type CustomerAppointmentChannel = (typeof CUSTOMER_APPOINTMENT_CHANNELS)[number];
export const CUSTOMER_APPOINTMENT_DURATIONS = [30, 45, 60] as const;
export type CustomerAppointmentDuration = (typeof CUSTOMER_APPOINTMENT_DURATIONS)[number];

export type CustomerAppointmentAdviser = Readonly<{
  id: string;
  vendorId: string;
  vendorName: string;
  displayName: string;
  jobTitle?: string;
  specialties: readonly string[];
}>;

export type CustomerAppointmentView = Readonly<{
  id: string;
  vendorId: string;
  vendorName: string;
  adviserId: string;
  adviserName: string;
  productId?: string;
  productTitle?: string;
  channel: CustomerAppointmentChannel;
  status: "pending" | "confirmed" | "completed" | "cancelled" | "rescheduled" | "no_show";
  startsAt: number;
  endsAt: number;
  notes?: string;
}>;

type BookAppointmentInput = Readonly<{
  vendorId: string;
  adviserId: string;
  startsAt: number;
  durationMinutes: number;
  channel: string;
  notes?: string;
  canonicalVariantId?: string;
  now?: number;
}>;

type RescheduleAppointmentInput = Readonly<{
  appointmentId: string;
  startsAt: number;
  durationMinutes: number;
  now?: number;
}>;

const globals = globalThis as typeof globalThis & { __blsCustomerAppointmentLimiter?: PostgresFixedWindowRateLimiter };

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function runtimeAndLimiter() {
  const runtime = getProductionPostgresRuntime();
  const limiter = globals.__blsCustomerAppointmentLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return { runtime, limiter };
}

function uow() {
  return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool, { statementTimeoutMs: 15_000, lockTimeoutMs: 5_000 });
}

function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalText(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function epoch(value: unknown): number { if (!value) return 0; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : 0; }
function appointmentPublicId(): string { return `appointment_${randomUUID().replaceAll("-", "")}`; }
function auditPublicId(): string { return `audit_${randomUUID().replaceAll("-", "")}`; }

export function customerAppointmentsReadiness(): { ready: boolean; message: string } {
  return productionDatabaseConfigured()
    ? { ready: true, message: "Appointments enabled" }
    : { ready: false, message: "Τα ραντεβού απαιτούν την ασφαλή υπηρεσία PostgreSQL." };
}

export async function customerAppointmentAdvisers(principal: SessionPrincipal): Promise<readonly CustomerAppointmentAdviser[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const result = await tx.query<SqlRow>(`
      SELECT ap.public_id AS adviser_public_id,
             ap.display_name,
             ap.job_title,
             ap.specialties,
             vb.public_id AS vendor_public_id,
             vb.trading_name AS vendor_name
      FROM adviser_profiles ap
      JOIN vendor_users vu ON vu.id=ap.vendor_user_id
      JOIN vendor_businesses vb ON vb.id=vu.vendor_id
      WHERE ap.active=true
        AND vu.active=true
        AND vb.status='active'
        AND (ap.vendor_id IS NULL OR ap.vendor_id=vb.id)
      ORDER BY vb.trading_name,ap.display_name,ap.public_id
    `);
    return result.rows.map((row) => ({
      id: text(row.adviser_public_id),
      vendorId: text(row.vendor_public_id),
      vendorName: text(row.vendor_name),
      displayName: text(row.display_name),
      jobTitle: optionalText(row.job_title),
      specialties: Array.isArray(row.specialties) ? row.specialties.filter((value): value is string => typeof value === "string" && value.trim().length > 0) : []
    }));
  }, { readOnly: true });
}

export async function customerAppointments(principal: SessionPrincipal): Promise<readonly CustomerAppointmentView[]> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return [];
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const result = await tx.query<SqlRow>(`
      SELECT a.public_id,
             a.status::text AS status,
             a.channel,
             a.starts_at,
             a.ends_at,
             a.customer_notes,
             vb.public_id AS vendor_public_id,
             vb.trading_name AS vendor_name,
             ap.public_id AS adviser_public_id,
             ap.display_name AS adviser_name,
             cv.public_id AS canonical_public_id,
             COALESCE(el.title,en.title,cv.model,cv.slug) AS product_title
      FROM appointments a
      JOIN vendor_businesses vb ON vb.id=a.vendor_id
      LEFT JOIN adviser_profiles ap ON ap.id=a.adviser_id
      LEFT JOIN canonical_variants cv ON cv.id=a.canonical_variant_id
      LEFT JOIN product_translations el ON el.canonical_variant_id=cv.id AND el.locale='el'
      LEFT JOIN product_translations en ON en.canonical_variant_id=cv.id AND en.locale='en'
      WHERE a.customer_user_id=$1::uuid
      ORDER BY CASE WHEN a.status IN ('completed','cancelled','no_show') THEN 1 ELSE 0 END,a.starts_at ASC
      LIMIT 100
    `, [customer]);
    return result.rows.map(mapAppointmentRow);
  }, { readOnly: true });
}

export async function bookCustomerAppointment(principal: SessionPrincipal, input: BookAppointmentInput): Promise<CustomerAppointmentView> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Τα ραντεβού απαιτούν την παραγωγική υπηρεσία λογαριασμών.");
  const nowMs = input.now ?? Date.now();
  const slot = validateSlot(input.startsAt, input.durationMinutes, nowMs);
  const channel = validateChannel(input.channel);
  const notes = normalizeNotes(input.notes);
  const vendorId = input.vendorId.trim();
  const adviserId = input.adviserId.trim();
  if (!vendorId || !adviserId || vendorId.length > 200 || adviserId.length > 200) throw new Error("Ο σύμβουλος ή το κατάστημα δεν είναι έγκυρο.");
  const { limiter } = runtimeAndLimiter();
  const rate = await limiter.consume({ route: "customer-appointment-create", key: principal.userId, limit: 10, windowMs: 24 * 60 * 60 * 1000, now: nowMs });
  if (!rate.allowed) throw new Error("Έχεις δημιουργήσει αρκετά ραντεβού σήμερα. Δοκίμασε ξανά αργότερα.");

  const createdPublicId = appointmentPublicId();
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const adviser = await resolveAdviser(tx, vendorId, adviserId);
    await lockAdviser(tx, adviser.adviserUuid);
    await assertAvailable(tx, adviser.adviserUuid, slot.startsAt, slot.endsAt);
    const canonicalUuid = await resolveCanonicalVariant(tx, input.canonicalVariantId);
    await tx.query(`
      INSERT INTO appointments(
        public_id,market_id,customer_user_id,vendor_id,adviser_id,canonical_variant_id,
        channel,status,starts_at,ends_at,customer_notes,created_at,updated_at
      ) VALUES($1,$2::uuid,$3::uuid,$4::uuid,$5::uuid,$6::uuid,$7,'confirmed',$8,$9,$10,$11,$11)
    `, [createdPublicId, adviser.marketUuid, customer, adviser.vendorUuid, adviser.adviserUuid, canonicalUuid, channel, slot.startsAt, slot.endsAt, notes ?? null, new Date(nowMs)]);
    await writeAudit(tx, {
      marketUuid: adviser.marketUuid,
      actorUuid: customer,
      actorPublicId: principal.userId,
      actorRole: "customer",
      action: "appointment.created",
      appointmentId: createdPublicId,
      before: {},
      after: { status: "confirmed", vendorId, adviserId, startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString(), channel }
    });
    await notifyVendor(tx, adviser.vendorUuid, {
      eventType: "appointment.created",
      title: "Νέο ραντεβού συμβουλής",
      body: `${adviser.adviserName} · ${formatAthens(slot.startsAt)}`,
      appointmentId: createdPublicId,
      vendorId,
      dedupeKey: `appointment-created:${createdPublicId}`,
      now: new Date(nowMs)
    });
  }, { isolation: "serializable" });

  const result = (await customerAppointments(principal)).find((appointment) => appointment.id === createdPublicId);
  if (!result) throw new Error("Το ραντεβού δημιουργήθηκε αλλά δεν ήταν δυνατό να ανακτηθεί.");
  return result;
}

export async function cancelCustomerAppointment(principal: SessionPrincipal, appointmentId: string, nowMs = Date.now()): Promise<CustomerAppointmentView> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Τα ραντεβού απαιτούν την παραγωγική υπηρεσία λογαριασμών.");
  const publicId = appointmentId.trim();
  if (!publicId || publicId.length > 200) throw new Error("Το ραντεβού δεν είναι έγκυρο.");
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`
      SELECT a.id::text AS appointment_uuid,a.status::text AS status,a.market_id::text AS market_uuid,
             a.vendor_id::text AS vendor_uuid,vb.public_id AS vendor_public_id
      FROM appointments a JOIN vendor_businesses vb ON vb.id=a.vendor_id
      WHERE a.public_id=$1 AND a.customer_user_id=$2::uuid
      FOR UPDATE
    `, [publicId, customer]);
    if (!found.rowCount) throw new Error("Το ραντεβού δεν βρέθηκε.");
    const row = found.rows[0];
    const status = text(row.status);
    if (!activeStatus(status)) throw new Error("Αυτό το ραντεβού δεν μπορεί πλέον να ακυρωθεί.");
    await tx.query("UPDATE appointments SET status='cancelled',updated_at=$2 WHERE id=$1::uuid", [text(row.appointment_uuid), new Date(nowMs)]);
    await writeAudit(tx, {
      marketUuid: text(row.market_uuid), actorUuid: customer, actorPublicId: principal.userId, actorRole: "customer",
      action: "appointment.customer_cancelled", appointmentId: publicId, before: { status }, after: { status: "cancelled" }
    });
    await notifyVendor(tx, text(row.vendor_uuid), {
      eventType: "appointment.customer_cancelled", title: "Ο πελάτης ακύρωσε ραντεβού", body: "Η ώρα είναι ξανά διαθέσιμη.",
      appointmentId: publicId, vendorId: text(row.vendor_public_id), dedupeKey: `appointment-customer-cancel:${publicId}`, now: new Date(nowMs)
    });
  }, { isolation: "serializable" });
  return requiredAppointment(await customerAppointments(principal), publicId);
}

export async function rescheduleCustomerAppointment(principal: SessionPrincipal, input: RescheduleAppointmentInput): Promise<CustomerAppointmentView> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Τα ραντεβού απαιτούν την παραγωγική υπηρεσία λογαριασμών.");
  const publicId = input.appointmentId.trim();
  if (!publicId || publicId.length > 200) throw new Error("Το ραντεβού δεν είναι έγκυρο.");
  const nowMs = input.now ?? Date.now();
  const slot = validateSlot(input.startsAt, input.durationMinutes, nowMs);
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const customer = await customerUuid(tx, principal.userId);
    const found = await tx.query<SqlRow>(`
      SELECT a.id::text AS appointment_uuid,a.status::text AS status,a.market_id::text AS market_uuid,
             a.vendor_id::text AS vendor_uuid,a.adviser_id::text AS adviser_uuid,
             vb.public_id AS vendor_public_id,ap.public_id AS adviser_public_id
      FROM appointments a
      JOIN vendor_businesses vb ON vb.id=a.vendor_id
      JOIN adviser_profiles ap ON ap.id=a.adviser_id
      JOIN vendor_users vu ON vu.id=ap.vendor_user_id
      WHERE a.public_id=$1 AND a.customer_user_id=$2::uuid
        AND vb.status='active' AND ap.active=true AND vu.active=true
      FOR UPDATE
    `, [publicId, customer]);
    if (!found.rowCount) throw new Error("Το ραντεβού δεν βρέθηκε ή ο σύμβουλος δεν είναι πλέον διαθέσιμος.");
    const row = found.rows[0];
    const status = text(row.status);
    if (!activeStatus(status)) throw new Error("Αυτό το ραντεβού δεν μπορεί πλέον να μετακινηθεί.");
    const adviserUuid = text(row.adviser_uuid);
    await lockAdviser(tx, adviserUuid);
    await assertAvailable(tx, adviserUuid, slot.startsAt, slot.endsAt, text(row.appointment_uuid));
    await tx.query("UPDATE appointments SET starts_at=$2,ends_at=$3,status='rescheduled',updated_at=$4 WHERE id=$1::uuid", [text(row.appointment_uuid), slot.startsAt, slot.endsAt, new Date(nowMs)]);
    await writeAudit(tx, {
      marketUuid: text(row.market_uuid), actorUuid: customer, actorPublicId: principal.userId, actorRole: "customer",
      action: "appointment.rescheduled", appointmentId: publicId, before: { status },
      after: { status: "rescheduled", startsAt: slot.startsAt.toISOString(), endsAt: slot.endsAt.toISOString() }
    });
    await notifyVendor(tx, text(row.vendor_uuid), {
      eventType: "appointment.rescheduled", title: "Μετακίνηση ραντεβού", body: `Νέα ώρα · ${formatAthens(slot.startsAt)}`,
      appointmentId: publicId, vendorId: text(row.vendor_public_id), dedupeKey: `appointment-rescheduled:${publicId}:${slot.startsAt.getTime()}`, now: new Date(nowMs)
    });
  }, { isolation: "serializable" });
  return requiredAppointment(await customerAppointments(principal), publicId);
}

async function customerUuid(tx: SqlExecutor, userId: string): Promise<string> {
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM users WHERE public_id=$1 AND status='active' LIMIT 1", [userId]);
  if (!result.rowCount) throw new Error("Ο λογαριασμός πελάτη δεν βρέθηκε.");
  return text(result.rows[0].id);
}

async function resolveAdviser(tx: SqlExecutor, vendorPublicId: string, adviserPublicId: string): Promise<{ adviserUuid: string; adviserName: string; vendorUuid: string; marketUuid: string }> {
  const result = await tx.query<SqlRow>(`
    SELECT ap.id::text AS adviser_uuid,ap.display_name AS adviser_name,
           vb.id::text AS vendor_uuid,vb.market_id::text AS market_uuid
    FROM adviser_profiles ap
    JOIN vendor_users vu ON vu.id=ap.vendor_user_id
    JOIN vendor_businesses vb ON vb.id=vu.vendor_id
    WHERE ap.public_id=$1 AND vb.public_id=$2
      AND ap.active=true AND vu.active=true AND vb.status='active'
      AND (ap.vendor_id IS NULL OR ap.vendor_id=vb.id)
    LIMIT 1
  `, [adviserPublicId, vendorPublicId]);
  if (!result.rowCount) throw new Error("Ο σύμβουλος δεν είναι διαθέσιμος για αυτό το κατάστημα.");
  return {
    adviserUuid: text(result.rows[0].adviser_uuid), adviserName: text(result.rows[0].adviser_name),
    vendorUuid: text(result.rows[0].vendor_uuid), marketUuid: text(result.rows[0].market_uuid)
  };
}

async function resolveCanonicalVariant(tx: SqlExecutor, publicId: string | undefined): Promise<string | null> {
  const value = publicId?.trim();
  if (!value) return null;
  const result = await tx.query<SqlRow>("SELECT id::text AS id FROM canonical_variants WHERE public_id=$1 AND lifecycle_status='active' LIMIT 1", [value]);
  if (!result.rowCount) throw new Error("Το προϊόν δεν είναι διαθέσιμο για σύνδεση με το ραντεβού.");
  return text(result.rows[0].id);
}

async function lockAdviser(tx: SqlExecutor, adviserUuid: string): Promise<void> {
  await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [adviserUuid]);
}

async function assertAvailable(tx: SqlExecutor, adviserUuid: string, startsAt: Date, endsAt: Date, excludeAppointmentUuid?: string): Promise<void> {
  const overlap = await tx.query<SqlRow>(`
    SELECT 1 AS present
    FROM appointments
    WHERE adviser_id=$1::uuid
      AND status IN ('pending','confirmed','rescheduled')
      AND starts_at < $3
      AND ends_at > $2
      AND ($4::uuid IS NULL OR id<>$4::uuid)
    LIMIT 1
  `, [adviserUuid, startsAt, endsAt, excludeAppointmentUuid ?? null]);
  if (overlap.rowCount) throw new Error("Αυτή η ώρα μόλις δεσμεύτηκε. Διάλεξε άλλη ώρα.");
}

function validateSlot(startsAtRaw: number, durationRaw: number, nowMs: number): { startsAt: Date; endsAt: Date } {
  const startsAt = Number(startsAtRaw);
  const duration = Number(durationRaw);
  if (!Number.isFinite(startsAt)) throw new Error("Η ώρα του ραντεβού δεν είναι έγκυρη.");
  if (!CUSTOMER_APPOINTMENT_DURATIONS.includes(duration as CustomerAppointmentDuration)) throw new Error("Η διάρκεια πρέπει να είναι 30, 45 ή 60 λεπτά.");
  if (startsAt < nowMs + 15 * 60 * 1000) throw new Error("Το ραντεβού πρέπει να ξεκινά τουλάχιστον 15 λεπτά από τώρα.");
  if (startsAt > nowMs + 90 * 24 * 60 * 60 * 1000) throw new Error("Μπορείς να κλείσεις ραντεβού έως 90 ημέρες μπροστά.");
  const startDate = new Date(startsAt);
  const endDate = new Date(startsAt + duration * 60 * 1000);
  return { startsAt: startDate, endsAt: endDate };
}

function validateChannel(value: string): CustomerAppointmentChannel {
  if (!CUSTOMER_APPOINTMENT_CHANNELS.includes(value as CustomerAppointmentChannel)) throw new Error("Ο τρόπος επικοινωνίας δεν είναι έγκυρος.");
  return value as CustomerAppointmentChannel;
}

function normalizeNotes(value: string | undefined): string | undefined {
  const notes = value?.trim();
  if (!notes) return undefined;
  if (notes.length > 1000) throw new Error("Οι σημειώσεις μπορούν να έχουν έως 1.000 χαρακτήρες.");
  return notes;
}

function activeStatus(status: string): boolean { return ["pending", "confirmed", "rescheduled"].includes(status); }
function requiredAppointment(list: readonly CustomerAppointmentView[], id: string): CustomerAppointmentView {
  const appointment = list.find((item) => item.id === id);
  if (!appointment) throw new Error("Το ραντεβού δεν βρέθηκε μετά την ενημέρωση.");
  return appointment;
}

function mapAppointmentRow(row: SqlRow): CustomerAppointmentView {
  const channel = text(row.channel) as CustomerAppointmentChannel;
  if (!CUSTOMER_APPOINTMENT_CHANNELS.includes(channel)) throw new Error("Unsupported appointment channel");
  const status = text(row.status) as CustomerAppointmentView["status"];
  return {
    id: text(row.public_id), vendorId: text(row.vendor_public_id), vendorName: text(row.vendor_name),
    adviserId: text(row.adviser_public_id), adviserName: optionalText(row.adviser_name) ?? "Σύμβουλος καταστήματος",
    productId: optionalText(row.canonical_public_id), productTitle: optionalText(row.product_title), channel, status,
    startsAt: epoch(row.starts_at), endsAt: epoch(row.ends_at), notes: optionalText(row.customer_notes)
  };
}

async function writeAudit(tx: SqlExecutor, input: {
  marketUuid: string; actorUuid: string; actorPublicId: string; actorRole: string; action: string; appointmentId: string;
  before: Record<string, unknown>; after: Record<string, unknown>;
}): Promise<void> {
  await tx.query(`
    INSERT INTO audit_events(public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,before_state,after_state,created_at)
    VALUES($1,$2::uuid,$3::uuid,$4,$5,$6,'appointment',$7,'Appointment lifecycle action',$8::jsonb,$9::jsonb,now())
  `, [auditPublicId(), input.marketUuid, input.actorUuid, input.actorPublicId, input.actorRole, input.action, input.appointmentId, JSON.stringify(input.before), JSON.stringify(input.after)]);
}

async function notifyVendor(tx: SqlExecutor, vendorUuid: string, input: {
  eventType: string; title: string; body: string; appointmentId: string; vendorId: string; dedupeKey: string; now: Date;
}): Promise<void> {
  await tx.query(`
    INSERT INTO notifications(id,public_id,user_id,vendor_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
    SELECT gen_random_uuid(),'notification_' || replace(gen_random_uuid()::text,'-',''),vu.user_id,$1::uuid,'in_app','transactional',$2,'appointments-v1','el',$3,$4,$5::jsonb,'queued',$6 || ':' || u.public_id,$7
    FROM vendor_users vu JOIN users u ON u.id=vu.user_id
    WHERE vu.vendor_id=$1::uuid AND vu.active=true AND u.status='active'
    ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  `, [vendorUuid, input.eventType, input.title, input.body, JSON.stringify({ title: input.title, body: input.body, appointmentId: input.appointmentId, vendorId: input.vendorId }), input.dedupeKey, input.now]);
}

function formatAthens(value: Date): string {
  return new Intl.DateTimeFormat("el-GR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Athens" }).format(value);
}
