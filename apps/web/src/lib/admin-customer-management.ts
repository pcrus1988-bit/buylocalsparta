import { PostgresUnitOfWork, type SessionPrincipal, type SqlRow } from "@buy-local-sparta/core";
import { platformScope } from "@buy-local-sparta/postgres-runtime";
import { assertAdminPermission } from "./admin-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const CUSTOMER_STATUSES = ["pending_verification", "active", "restricted", "suspended", "closed"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export type AdminCustomerSummary = Readonly<{
  id: string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  status: CustomerStatus;
  emailVerified: boolean;
  marketingConsent: boolean;
  recommendationsEnabled: boolean;
  recentlyViewedEnabled: boolean;
  createdAt: number;
  updatedAt: number;
  orderCount: number;
  grossOrderValueMinor: number;
  lastOrderAt?: number;
  addressCount: number;
  activeSessionCount: number;
  lastSeenAt?: number;
}>;

export type AdminCustomerDetail = Readonly<{
  customer: AdminCustomerSummary & { preferredLocale: string; closedAt?: number; anonymizedAt?: number };
  addresses: ReadonlyArray<{ id: string; label?: string; recipientName?: string; companyName?: string; line1: string; line2?: string; locality: string; region?: string; postcode: string; countryCode: string; phone?: string }>;
  orders: ReadonlyArray<{ id: string; orderNumber: string; status: string; fulfilmentPreference: string; totalMinor: number; currency: string; createdAt: number; confirmedAt?: number }>;
  audit: ReadonlyArray<{ id: string; action: string; reason?: string; actor: string; createdAt: number; beforeState: Record<string, unknown>; afterState: Record<string, unknown> }>;
}>;

function stringValue(value: unknown): string { return typeof value === "string" ? value : String(value ?? ""); }
function optionalString(value: unknown): string | undefined { const valueText = typeof value === "string" ? value.trim() : ""; return valueText || undefined; }
function intValue(value: unknown): number { const parsed = Number(value ?? 0); return Number.isFinite(parsed) ? Math.trunc(parsed) : 0; }
function timeValue(value: unknown): number | undefined { if (!value) return undefined; const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime(); return Number.isFinite(parsed) ? parsed : undefined; }
function objectValue(value: unknown): Record<string, unknown> { if (!value) return {}; if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>; if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {}; } catch { return {}; } } return {}; }
function customerStatus(value: unknown): CustomerStatus { const status = stringValue(value) as CustomerStatus; if (!CUSTOMER_STATUSES.includes(status)) throw new Error(`Unsupported customer status: ${status}`); return status; }
function uow() { return new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool); }

const emptyMetrics = { total: 0, active: 0, pending: 0, restricted: 0, suspended: 0, closed: 0, new30d: 0, customersWithOrders: 0, grossOrderValueMinor: 0 } as const;

export async function adminCustomersWorkspace(principal: SessionPrincipal, input: { query?: string; status?: string } = {}) {
  assertAdminPermission(principal, "privacy.read");
  if (!productionDatabaseConfigured()) return { csrfToken: principal.csrfToken, databaseConfigured: false, metrics: emptyMetrics, customers: [] as AdminCustomerSummary[] };
  const query = (input.query ?? "").trim().slice(0, 120);
  const status = CUSTOMER_STATUSES.includes(input.status as CustomerStatus) ? input.status as CustomerStatus : undefined;
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const metricsResult = await tx.query<SqlRow>(`
      SELECT count(*)::int AS total,
        count(*) FILTER (WHERE status='active')::int AS active,
        count(*) FILTER (WHERE status='pending_verification')::int AS pending,
        count(*) FILTER (WHERE status='restricted')::int AS restricted,
        count(*) FILTER (WHERE status='suspended')::int AS suspended,
        count(*) FILTER (WHERE status='closed')::int AS closed,
        count(*) FILTER (WHERE created_at >= now() - interval '30 days')::int AS new_30d
      FROM users`);
    const commerceResult = await tx.query<SqlRow>(`
      SELECT count(DISTINCT user_id)::int AS customers_with_orders,
        COALESCE(sum(total_minor) FILTER (WHERE currency='EUR' AND status <> 'cancelled'),0)::bigint AS gross_order_value_minor
      FROM customer_orders WHERE user_id IS NOT NULL`);
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
      WHERE ($1='' OR u.email::text ILIKE '%'||$1||'%' OR COALESCE(u.phone,'') ILIKE '%'||$1||'%' OR u.public_id ILIKE '%'||$1||'%'
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
}

export async function adminCustomerDetail(principal: SessionPrincipal, customerId: string): Promise<{ csrfToken: string; detail: AdminCustomerDetail } | undefined> {
  assertAdminPermission(principal, "privacy.read");
  if (!productionDatabaseConfigured()) return undefined;
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const user = await tx.query<SqlRow>(`
      SELECT u.id::text AS user_uuid,u.public_id,u.email::text AS email,u.phone,u.status,u.email_verified_at,u.preferred_locale,u.created_at,u.updated_at,u.closed_at,u.anonymized_at,
        cp.first_name,cp.last_name,COALESCE(cp.marketing_consent,false) AS marketing_consent,COALESCE(cp.recommendations_enabled,false) AS recommendations_enabled,COALESCE(cp.recently_viewed_enabled,false) AS recently_viewed_enabled,
        COALESCE(ord.order_count,0)::int AS order_count,COALESCE(ord.gross_order_value_minor,0)::bigint AS gross_order_value_minor,ord.last_order_at,
        COALESCE(addr.address_count,0)::int AS address_count,COALESCE(sess.active_session_count,0)::int AS active_session_count,sess.last_seen_at
      FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id
      LEFT JOIN LATERAL (SELECT count(*)::int AS order_count,COALESCE(sum(total_minor) FILTER (WHERE currency='EUR' AND status <> 'cancelled'),0)::bigint AS gross_order_value_minor,max(created_at) AS last_order_at FROM customer_orders o WHERE o.user_id=u.id) ord ON true
      LEFT JOIN LATERAL (SELECT count(*)::int AS address_count FROM addresses a WHERE a.user_id=u.id) addr ON true
      LEFT JOIN LATERAL (SELECT count(*) FILTER (WHERE expires_at > now())::int AS active_session_count,max(last_seen_at) AS last_seen_at FROM user_sessions s WHERE s.user_id=u.id) sess ON true
      WHERE u.public_id=$1 OR u.id::text=$1 LIMIT 1`, [customerId]);
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
}

export async function adminUpdateCustomerStatus(principal: SessionPrincipal, input: { customerId: string; status: CustomerStatus; reason: string }) {
  assertAdminPermission(principal, "privacy.manage");
  if (!CUSTOMER_STATUSES.includes(input.status)) throw new Error("Invalid customer status");
  const reason = input.reason.trim();
  if (reason.length < 5) throw new Error("A meaningful reason is required");
  if (!productionDatabaseConfigured()) throw new Error("Customer management requires the production database");
  return uow().withTransaction(platformScope(principal.userId), async (tx) => {
    const found = await tx.query<SqlRow>(`SELECT id::text AS user_uuid,public_id,status,closed_at,anonymized_at FROM users WHERE public_id=$1 OR id::text=$1 FOR UPDATE`, [input.customerId]);
    if (!found.rowCount) throw new Error("Customer not found");
    const row = found.rows[0];
    const current = customerStatus(row.status);
    if (current === input.status) throw new Error(`Customer is already ${input.status}`);
    if (row.anonymized_at && input.status !== "closed") throw new Error("An anonymized customer cannot be reactivated");
    if (current === "closed" && input.status !== "closed") throw new Error("Closed accounts must use the privacy recovery workflow; they cannot be reopened here");
    const userUuid = stringValue(row.user_uuid);
    const publicId = stringValue(row.public_id);
    await tx.query(`UPDATE users SET status=$2::user_status,closed_at=CASE WHEN $2='closed' THEN COALESCE(closed_at,now()) ELSE closed_at END,updated_at=now() WHERE id=$1::uuid`, [userUuid, input.status]);
    if (["suspended", "closed"].includes(input.status)) await tx.query(`DELETE FROM user_sessions WHERE user_id=$1::uuid`, [userUuid]);
    await tx.query(`INSERT INTO audit_events(actor_role,action,entity_type,entity_id,reason,before_state,after_state,actor_public_id) VALUES($1,$2,'customer_user',$3,$4,$5::jsonb,$6::jsonb,$7)`, [principal.roles[0] ?? "super_admin", "customer.status_changed", publicId, reason, JSON.stringify({ status: current }), JSON.stringify({ status: input.status }), principal.userId]);
    return { id: publicId, previousStatus: current, status: input.status };
  }, { isolation: "serializable" });
}

function mapCustomerSummary(row: SqlRow): AdminCustomerSummary {
  return {
    id: stringValue(row.public_id), email: optionalString(row.email), phone: optionalString(row.phone), firstName: optionalString(row.first_name), lastName: optionalString(row.last_name), status: customerStatus(row.status),
    emailVerified: Boolean(row.email_verified_at), marketingConsent: row.marketing_consent === true, recommendationsEnabled: row.recommendations_enabled === true, recentlyViewedEnabled: row.recently_viewed_enabled === true,
    createdAt: timeValue(row.created_at) ?? 0, updatedAt: timeValue(row.updated_at) ?? 0, orderCount: intValue(row.order_count), grossOrderValueMinor: intValue(row.gross_order_value_minor), lastOrderAt: timeValue(row.last_order_at), addressCount: intValue(row.address_count), activeSessionCount: intValue(row.active_session_count), lastSeenAt: timeValue(row.last_seen_at)
  };
}
