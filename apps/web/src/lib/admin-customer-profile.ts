import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_PROFILE_LOCALES = ["el", "en"] as const;
export type CustomerProfileLocale = (typeof CUSTOMER_PROFILE_LOCALES)[number];

const CUSTOMER_IDENTITY_PREDICATE = `
  NOT EXISTS (SELECT 1 FROM platform_user_roles pur WHERE pur.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.user_id=u.id)`;

function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool); }
function text(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optional(value: unknown): string | undefined { const result = typeof value === "string" ? value.trim() : ""; return result || undefined; }
function epoch(value: unknown): number | undefined { if (!value) return undefined; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : undefined; }
function integer(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.trunc(parsed) : 0; }

export async function adminUpdateCustomerProfile(principal: SessionPrincipal, input: {
  customerId: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  preferredLocale: CustomerProfileLocale;
  reason: string;
}) {
  assertAdminPermission(principal, "customer.manage");
  if (!productionDatabaseConfigured()) throw new Error("Customer profile management requires the production database");
  const firstName = cleanName(input.firstName, "First name");
  const lastName = cleanName(input.lastName, "Last name");
  const phone = cleanPhone(input.phone);
  if (!CUSTOMER_PROFILE_LOCALES.includes(input.preferredLocale)) throw new Error("Unsupported customer locale");
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 500) throw new Error("A reason of 5–500 characters is required");

  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id,u.phone,u.preferred_locale,u.status,u.anonymized_at,cp.first_name,cp.last_name
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE} FOR UPDATE OF u`, [input.customerId]);
    if (!found.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
    const row = found.rows[0];
    if (text(row.status) === "closed" || row.anonymized_at) throw new Error("Closed or anonymized customer profiles cannot be edited here");
    const userUuid = text(row.user_uuid);
    const publicId = text(row.public_id);
    const before = { firstName:optional(row.first_name) ?? null, lastName:optional(row.last_name) ?? null, phone:optional(row.phone) ?? null, preferredLocale:optional(row.preferred_locale) ?? "el" };
    const after = { firstName:firstName ?? null, lastName:lastName ?? null, phone:phone ?? null, preferredLocale:input.preferredLocale };
    if (JSON.stringify(before) === JSON.stringify(after)) throw new Error("No customer profile changes were supplied");

    await tx.query(`UPDATE users SET phone=$2,preferred_locale=$3,updated_at=now() WHERE id=$1::uuid`, [userUuid, phone ?? null, input.preferredLocale]);
    await tx.query(`INSERT INTO customer_profiles(user_id,first_name,last_name,marketing_consent,created_at,updated_at)
      VALUES($1::uuid,$2,$3,false,now(),now())
      ON CONFLICT(user_id) DO UPDATE SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,updated_at=now()`, [userUuid, firstName ?? null, lastName ?? null]);
    await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id)
      VALUES($1,'customer.profile_updated','customer_user',$2,$3,$4::jsonb,$5::jsonb,$6)`, [principal.roles[0] ?? "super_admin", publicId, reason, JSON.stringify(before), JSON.stringify(after), principal.userId]);
    return { id:publicId, profile:after };
  }, { isolation:"serializable" });
}

export async function adminCustomerRecoverySummary(principal: SessionPrincipal, customerId: string) {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return { emailVerifiedAt:undefined, verificationTokens:0, activeVerificationTokens:0, lastVerificationIssuedAt:undefined, resetTokens:0, activeResetTokens:0, lastResetIssuedAt:undefined };
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.email_verified_at FROM users u WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE} LIMIT 1`, [customerId]);
    if (!found.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
    const userUuid = text(found.rows[0].user_uuid);
    const [verification, reset] = await Promise.all([
      tx.query<SqlRow>(`SELECT count(*)::int AS total,count(*) FILTER (WHERE consumed_at IS NULL AND expires_at>now())::int AS active,max(created_at) AS last_issued FROM email_verification_tokens WHERE user_id=$1::uuid`, [userUuid]),
      tx.query<SqlRow>(`SELECT count(*)::int AS total,count(*) FILTER (WHERE consumed_at IS NULL AND expires_at>now())::int AS active,max(created_at) AS last_issued FROM password_reset_tokens WHERE user_id=$1::uuid`, [userUuid])
    ]);
    const v = verification.rows[0] ?? {};
    const r = reset.rows[0] ?? {};
    return {
      emailVerifiedAt:epoch(found.rows[0].email_verified_at),
      verificationTokens:integer(v.total),
      activeVerificationTokens:integer(v.active),
      lastVerificationIssuedAt:epoch(v.last_issued),
      resetTokens:integer(r.total),
      activeResetTokens:integer(r.active),
      lastResetIssuedAt:epoch(r.last_issued)
    };
  }, { readOnly:true });
}

function cleanName(value: string | undefined, label: string): string | undefined {
  const result = value?.trim().replace(/\s+/g, " ");
  if (!result) return undefined;
  if (result.length > 100) throw new Error(`${label} must be at most 100 characters`);
  if(/[<>\u0000-\u001F]/.test(result)) throw new Error(`${label} contains unsupported characters`);
  return result;
}

function cleanPhone(value: string | undefined): string | undefined {
  const result = value?.trim().replace(/\s+/g, " ");
  if (!result) return undefined;
  if (result.length > 30 || !/^\+?[0-9 ()-]{6,30}$/.test(result)) throw new Error("Phone number format is not supported");
  return result;
}
