import { createHash, createHmac, randomBytes } from "node:crypto";
import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { accountAuthSecret } from "./account-runtime";
import { assertAdminPermission, recordAdminPersonalDataAccess } from "./admin-runtime";
import { requestCustomerPasswordReset } from "./customer-password-reset-runtime";
import { sendCustomerVerificationEmail } from "./customer-registration-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_STATUSES = ["pending_verification", "active", "restricted", "suspended", "closed"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];
export type CustomerSupportAction = "revoke_sessions" | "send_password_reset" | "resend_verification";

export type AdminCustomerSummary = Readonly<{
  id: string; email?: string; phone?: string; firstName?: string; lastName?: string; status: CustomerStatus;
  emailVerified: boolean; marketingConsent: boolean; recommendationsEnabled: boolean; recentlyViewedEnabled: boolean;
  createdAt: number; updatedAt: number; orderCount: number; grossOrderValueMinor: number; lastOrderAt?: number;
  addressCount: number; activeSessionCount: number; lastSeenAt?: number;
}>;

export type AdminCustomerDetail = Readonly<{
  customer: AdminCustomerSummary & { preferredLocale: string; closedAt?: number; anonymizedAt?: number };
  addresses: ReadonlyArray<{ id: string; label?: string; recipientName?: string; companyName?: string; line1: string; line2?: string; locality: string; region?: string; postcode: string; countryCode: string; phone?: string }>;
  orders: ReadonlyArray<{ id: string; orderNumber: string; status: string; fulfilmentPreference: string; totalMinor: number; currency: string; createdAt: number; confirmedAt?: number }>;
  audit: ReadonlyArray<{ id: string; action: string; reason?: string; actor: string; createdAt: number; beforeState: Record<string, unknown>; afterState: Record<string, unknown> }>;
}>;

const CUSTOMER_IDENTITY_PREDICATE = `
  NOT EXISTS (SELECT 1 FROM platform_user_roles pur WHERE pur.user_id=u.id)
  AND NOT EXISTS (SELECT 1 FROM vendor_users vu WHERE vu.user_id=u.id)`;
const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

function stringValue(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalString(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function intValue(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.trunc(parsed) : 0; }
function timeValue(value: unknown): number | undefined { if (!value) return undefined; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : undefined; }
function objectValue(value: unknown): Record<string, unknown> { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } } return {}; }
function customerStatus(value: unknown): CustomerStatus { const status = stringValue(value) as CustomerStatus; if (!CUSTOMER_STATUSES.includes(status)) throw new Error(`Unsupported customer status: ${status}`); return status; }
function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool); }
function verificationToken(): string { const raw = randomBytes(32).toString("base64url"); const signature = createHmac("sha256", accountAuthSecret()).update(`email-verification:${raw}`).digest("base64url"); return `${raw}.${signature}`; }
function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }

const emptyMetrics = { total: 0, active: 0, pending: 0, restricted: 0, suspended: 0, closed: 0, new30d: 0, customersWithOrders: 0, grossOrderValueMinor: 0 } as const;

export async function adminCustomersWorkspace(principal: SessionPrincipal, input: { query?: string; status?: string } = {}) {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return { csrfToken: principal.csrfToken, databaseConfigured: false, metrics: emptyMetrics, customers: [] as AdminCustomerSummary[] };
  const query = (input.query ?? "").trim().slice(0, 120);
  const status = CUSTOMER_STATUSES.includes(input.status as CustomerStatus) ? input.status as CustomerStatus : undefined;
  const result = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const metricsResult = await tx.query<SqlRow>(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE u.status='active')::int AS active,
        count(*) FILTER (WHERE u.status='pending_verification')::int AS pending,
        count(*) FILTER (WHERE u.status='restricted')::int AS restricted,
        count(*) FILTER (WHERE u.status='suspended')::int AS suspended,
        count(*) FILTER (WHERE u.status='closed')::int AS closed,
        count(*) FILTER (WHERE u.created_at >= now() - interval '30 days')::int AS new_30d
      FROM users u WHERE ${CUSTOMER_IDENTITY_PREDICATE}`);
    const commerceResult = await tx.query<SqlRow>(`
      SELECT count(DISTINCT o.user_id)::int AS customers_with_orders,
        COALESCE(sum(o.total_minor) FILTER (WHERE o.currency='EUR' AND o.status <> 'cancelled'),0)::bigint AS gross_order_value_minor
      FROM customer_orders o JOIN users u ON u.id=o.user_id
      WHERE o.user_id IS NOT NULL AND ${CUSTOMER_IDENTITY_PREDICATE}`);
    const rows = await tx.query<SqlRow>(`
      SELECT u.public_id,u.email::text AS email,u.phone,u.status,u.email_verified_at,u.preferred_locale,u.created_at,u.updated_at,
        cp.first_name,cp.last_name,COALESCE(cp.marketing_consent,false) AS marketing_consent,
        COALESCE(cp.recommendations_enabled,false) AS recommendations_enabled,COALESCE(cp.recently_viewed_enabled,false) AS recently_viewed_enabled,
        COALESCE(ord.order_count,0)::int AS order_count,COALESCE(ord.gross_order_value_minor,0)::bigint AS gross_order_value_minor,ord.last_order_at,
        COALESCE(addr.address_count,0)::int AS address_count,COALESCE(sess.active_session_count,0)::int AS active_session_count,sess.last_seen_at
      FROM users u
      LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS order_count,
          COALESCE(sum(total_minor) FILTER (WHERE currency='EUR' AND status <> 'cancelled'),0)::bigint AS gross_order_value_minor,
          max(created_at) AS last_order_at
        FROM customer_orders o WHERE o.user_id=u.id
      ) ord ON true
      LEFT JOIN LATERAL (SELECT count(*)::int AS address_count FROM addresses a WHERE a.user_id=u.id) addr ON true
      LEFT JOIN LATERAL (
        SELECT count(*) FILTER (WHERE expires_at > now())::int AS active_session_count,max(last_seen_at) AS last_seen_at
        FROM user_sessions s WHERE s.user_id=u.id
      ) sess ON true
      WHERE ${CUSTOMER_IDENTITY_PREDICATE}
        AND ($1='' OR u.email::text ILIKE '%'||$1||'%' OR COALESCE(u.phone,'') ILIKE '%'||$1||'%' OR u.public_id ILIKE '%'||$1||'%'
          OR COALESCE(cp.first_name,'') ILIKE '%'||$1||'%' OR COALESCE(cp.last_name,'') ILIKE '%'||$1||'%')
        AND ($2::text IS NULL OR u.status::text=$2)
      ORDER BY COALESCE(sess.last_seen_at,ord.last_order_at,u.created_at) DESC
      LIMIT 150`, [query, status ?? null]);
    const metricRow = metricsResult.rows[0] ?? {};
    const commerceRow = commerceResult.rows[0] ?? {};
    return {
      csrfToken: principal.csrfToken,
      databaseConfigured: true,
      metrics: {
        total: intValue(metricRow.total), active: intValue(metricRow.active), pending: intValue(metricRow.pending), restricted: intValue(metricRow.restricted), suspended: intValue(metricRow.suspended), closed: intValue(metricRow.closed), new30d: intValue(metricRow.new_30d),
        customersWithOrders: intValue(commerceRow.customers_with_orders), grossOrderValueMinor: intValue(commerceRow.gross_order_value_minor)
      },
      customers: rows.rows.map(mapCustomerSummary)
    };
  }, { readOnly: true });
  await recordAdminPersonalDataAccess(principal, {
    route: "/admin/customers",
    resourceType: "customer_directory",
    resourceId: `${status ?? "all"}:${query ? "filtered" : "all"}`,
    purpose: "customer_management",
    dataClasses: ["identity", "contact", "account_state", "commerce_summary", "session_summary"],
    recordCount: result.customers.length,
    accessScope: "bulk"
  });
  return result;
}

export async function adminCustomerDetail(principal: SessionPrincipal, customerId: string): Promise<{ csrfToken: string; detail: AdminCustomerDetail } | undefined> {
  assertAdminPermission(principal, "customer.read");
  if (!productionDatabaseConfigured()) return undefined;
  const result = await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const user = await tx.query<SqlRow>(`
      SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.phone,u.status,u.email_verified_at,u.preferred_locale,u.created_at,u.updated_at,u.closed_at,u.anonymized_at,
        cp.first_name,cp.last_name,COALESCE(cp.marketing_consent,false) AS marketing_consent,COALESCE(cp.recommendations_enabled,false) AS recommendations_enabled,COALESCE(cp.recently_viewed_enabled,false) AS recently_viewed_enabled,
        COALESCE(ord.order_count,0)::int AS order_count,COALESCE(ord.gross_order_value_minor,0)::bigint AS gross_order_value_minor,ord.last_order_at,
        COALESCE(addr.address_count,0)::int AS address_count,COALESCE(sess.active_session_count,0)::int AS active_session_count,sess.last_seen_at
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      LEFT JOIN LATERAL (SELECT count(*)::int AS order_count,COALESCE(sum(total_minor) FILTER (WHERE currency='EUR' AND status <> 'cancelled'),0)::bigint AS gross_order_value_minor,max(created_at) AS last_order_at FROM customer_orders o WHERE o.user_id=u.id) ord ON true
      LEFT JOIN LATERAL (SELECT count(*)::int AS address_count FROM addresses a WHERE a.user_id=u.id) addr ON true
      LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE expires_at > now())::int AS active_session_count,max(last_seen_at) AS last_seen_at FROM user_sessions s WHERE s.user_id=u.id) sess ON true
      WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE} LIMIT 1`, [customerId]);
    if (!user.rowCount) return undefined;
    const row = user.rows[0];
    const userUuid = stringValue(row.user_uuid);
    const publicId = stringValue(row.public_id);
    const [addresses, orders, audit] = await Promise.all([
      tx.query<SqlRow>(`SELECT public_id,label,recipient_name,company_name,line1,line2,locality,region,postcode,country_code,phone FROM addresses WHERE user_id=$1 ORDER BY created_at DESC`, [userUuid]),
      tx.query<SqlRow>(`SELECT public_id,order_number,status,fulfilment_preference,total_minor,currency,created_at,confirmed_at FROM customer_orders WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50`, [userUuid]),
      tx.query<SqlRow>(`SELECT public_id,action,reason,actor_public_id,created_at,before_state,after_state FROM audit_events WHERE entity_type='customer_user' AND entity_id=$1 ORDER BY created_at DESC LIMIT 50`, [publicId])
    ]);
    return {
      csrfToken: principal.csrfToken,
      detail: {
        customer: { ...mapCustomerSummary(row), preferredLocale: optionalString(row.preferred_locale) ?? "el-GR", closedAt: timeValue(row.closed_at), anonymizedAt: timeValue(row.anonymized_at) },
        addresses: addresses.rows.map((a) => ({ id:stringValue(a.public_id), label:optionalString(a.label), recipientName:optionalString(a.recipient_name), companyName:optionalString(a.company_name), line1:stringValue(a.line1), line2:optionalString(a.line2), locality:stringValue(a.locality), region:optionalString(a.region), postcode:stringValue(a.postcode), countryCode:stringValue(a.country_code), phone:optionalString(a.phone) })),
        orders: orders.rows.map((o) => ({ id:stringValue(o.public_id), orderNumber:stringValue(o.order_number), status:stringValue(o.status), fulfilmentPreference:stringValue(o.fulfilment_preference), totalMinor:intValue(o.total_minor), currency:stringValue(o.currency), createdAt:timeValue(o.created_at) ?? 0, confirmedAt:timeValue(o.confirmed_at) })),
        audit: audit.rows.map((a) => ({ id:stringValue(a.public_id), action:stringValue(a.action), reason:optionalString(a.reason), actor:stringValue(a.actor_public_id), createdAt:timeValue(a.created_at) ?? 0, beforeState:objectValue(a.before_state), afterState:objectValue(a.after_state) }))
      }
    };
  }, { readOnly: true });
  if (result) {
    await recordAdminPersonalDataAccess(principal, {
      route: "/admin/customers/[customerId]",
      resourceType: "customer",
      resourceId: result.detail.customer.id,
      purpose: "customer_management",
      dataClasses: ["identity", "contact", "addresses", "order_history", "consent_preferences", "session_summary", "admin_audit_history"],
      recordCount: 1,
      accessScope: "individual"
    });
  }
  return result;
}

export async function adminUpdateCustomerStatus(principal: SessionPrincipal, input: { customerId: string; status: CustomerStatus; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  if (!CUSTOMER_STATUSES.includes(input.status)) throw new Error("Invalid customer status");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("A meaningful reason is required");
  if (!productionDatabaseConfigured()) throw new Error("Customer management requires the production database");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT u.id::text AS user_uuid,u.public_id,u.status,u.email_verified_at,u.closed_at,u.anonymized_at FROM users u WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE} FOR UPDATE`, [input.customerId]);
    if (!found.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
    const row = found.rows[0];
    const current = customerStatus(row.status);
    if (current === input.status) throw new Error(`Customer is already ${input.status}`);
    if (input.status === "active" && !row.email_verified_at) throw new Error("Customer email must be verified before the account can be activated");
    if (row.anonymized_at && input.status !== "closed") throw new Error("An anonymized customer cannot be reactivated");
    if (current === "closed" && input.status !== "closed") throw new Error("Closed accounts must use the privacy recovery workflow; they cannot be reopened here");
    const userUuid = stringValue(row.user_uuid);
    const publicId = stringValue(row.public_id);
    await tx.query(`UPDATE users SET status=$2::user_status,closed_at=CASE WHEN $2='closed' THEN COALESCE(closed_at,now()) ELSE closed_at END,updated_at=now() WHERE id=$1::uuid`, [userUuid, input.status]);
    if (input.status !== "active") await tx.query(`DELETE FROM user_sessions WHERE user_id=$1::uuid`, [userUuid]);
    await insertAudit(tx, principal, publicId, "customer.status_changed", reason, { status: current }, { status: input.status });
    return { id: publicId, previousStatus: current, status: input.status };
  }, { isolation: "serializable" });
}

export async function adminCustomerSupportAction(principal: SessionPrincipal, input: { customerId: string; action: CustomerSupportAction; reason: string }) {
  assertAdminPermission(principal, "customer.manage");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("A meaningful reason is required");
  if (!productionDatabaseConfigured()) throw new Error("Customer management requires the production database");

  if (input.action === "revoke_sessions") {
    return uow().withTransaction(platformScope(principal.userId), async (tx) => {
      const target = await customerTarget(tx, input.customerId, true);
      const sessions = await tx.query<SqlRow>(`DELETE FROM user_sessions WHERE user_id=$1::uuid RETURNING id`, [target.userUuid]);
      await insertAudit(tx, principal, target.id, "customer.sessions_revoked", reason, { activeSessions: target.activeSessionCount }, { activeSessions: 0, revoked: sessions.rowCount });
      return { id: target.id, action: input.action, revokedSessions: sessions.rowCount };
    }, { isolation: "serializable" });
  }

  const target = await uow().withTransaction(platformScope(principal.userId), (tx) => customerTarget(tx, input.customerId, false), { readOnly: true });
  if (!target.email) throw new Error("Customer does not have an email address");

  if (input.action === "send_password_reset") {
    if (!target.emailVerified) throw new Error("Password reset requires a verified email address");
    if (!["active", "restricted"].includes(target.status)) throw new Error(`Password reset cannot be sent while account is ${target.status}`);
    const result = await requestCustomerPasswordReset({ email: target.email, now: Date.now() });
    if (!result.delivered) throw new Error("Password reset email was not delivered");
    await auditCustomerAction(principal, target.id, "customer.password_reset_sent", reason, { emailVerified: true, status: target.status });
    return { id: target.id, action: input.action, delivered: true };
  }

  if (target.status !== "pending_verification") throw new Error("Verification email can only be resent to pending accounts");
  if (target.emailVerified) throw new Error("Customer email is already verified");
  const token = verificationToken();
  const now = Date.now();
  const runtime = getProductionPostgresRuntime();
  await runtime.persistence.identity.saveEmailVerification({
    scope: { platformAccess: true, marketId: "sparta", requestId: `admin-customer-verification:${target.id}` },
    verification: { userId: target.id, tokenHash: tokenHash(token), createdAt: now, expiresAt: now + VERIFICATION_TTL_MS }
  });
  await sendCustomerVerificationEmail({ userId: target.id, email: target.email, token, now });
  await auditCustomerAction(principal, target.id, "customer.verification_resent", reason, { status: target.status, emailVerified: false });
  return { id: target.id, action: input.action, delivered: true };
}

async function customerTarget(tx: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[]; rowCount: number }> }, customerId: string, lock: boolean) {
  const found = await tx.query<SqlRow>(`
    SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.status,u.email_verified_at,
      (SELECT count(*)::int FROM user_sessions s WHERE s.user_id=u.id AND s.expires_at>now()) AS active_session_count
    FROM users u WHERE (u.public_id=$1 OR u.id::text=$1) AND ${CUSTOMER_IDENTITY_PREDICATE}${lock ? " FOR UPDATE" : ""}`, [customerId]);
  if (!found.rowCount) throw new Error("Customer not found or identity is not customer-manageable");
  const row = found.rows[0];
  return { userUuid:stringValue(row.user_uuid), id:stringValue(row.public_id), email:optionalString(row.email), status:customerStatus(row.status), emailVerified:Boolean(row.email_verified_at), activeSessionCount:intValue(row.active_session_count) };
}

async function auditCustomerAction(principal: SessionPrincipal, customerId: string, action: string, reason: string, after: Record<string, unknown>) {
  await uow().withTransaction(platformScope(principal.userId), async (tx) => {
    await insertAudit(tx, principal, customerId, action, reason, {}, after);
  }, { isolation: "serializable" });
}

async function insertAudit(tx: { query<Row extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<{ rows: readonly Row[]; rowCount: number }> }, principal: SessionPrincipal, customerId: string, action: string, reason: string, before: Record<string, unknown>, after: Record<string, unknown>) {
  await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id) VALUES($1,$2,'customer_user',$3,$4,$5::jsonb,$6::jsonb,$7)`, [principal.roles[0] ?? "super_admin", action, customerId, reason, JSON.stringify(before), JSON.stringify(after), principal.userId]);
}

function mapCustomerSummary(row: SqlRow): AdminCustomerSummary {
  return {
    id: stringValue(row.public_id), email: optionalString(row.email), phone: optionalString(row.phone), firstName: optionalString(row.first_name), lastName: optionalString(row.last_name), status: customerStatus(row.status),
    emailVerified: Boolean(row.email_verified_at), marketingConsent: row.marketing_consent === true, recommendationsEnabled: row.recommendations_enabled === true, recentlyViewedEnabled: row.recently_viewed_enabled === true,
    createdAt: timeValue(row.created_at) ?? 0, updatedAt: timeValue(row.updated_at) ?? 0, orderCount: intValue(row.order_count), grossOrderValueMinor: intValue(row.gross_order_value_minor), lastOrderAt: timeValue(row.last_order_at), addressCount: intValue(row.address_count), activeSessionCount: intValue(row.active_session_count), lastSeenAt: timeValue(row.last_seen_at)
  };
}
