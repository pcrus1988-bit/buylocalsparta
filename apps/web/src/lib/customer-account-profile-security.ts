import { hashPassword, verifyPassword, type SessionPrincipal } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export type CustomerAccountProfile = Readonly<{
  email: string;
  emailVerified: boolean;
  firstName: string;
  lastName: string;
  phone: string;
  preferredLocale: "el" | "en";
}>;

const globals = globalThis as typeof globalThis & { __blsCustomerPasswordChangeRateLimiter?: PostgresFixedWindowRateLimiter };

function requireCustomer(principal: SessionPrincipal) {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

function normalizeName(value: string, label: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) throw new Error(`${label} είναι υποχρεωτικό.`);
  if (normalized.length > 120) throw new Error(`${label} είναι πολύ μεγάλο.`);
  return normalized;
}

function normalizePhone(value: string): string {
  const raw = value.trim();
  if (!raw) return "";
  const normalized = raw.replace(/[\s().-]/g, "");
  if (!/^\+?[0-9]{7,15}$/.test(normalized)) throw new Error("Συμπλήρωσε έγκυρο τηλέφωνο με 7 έως 15 ψηφία.");
  return normalized;
}

function normalizeLocale(value: string): "el" | "en" {
  if (value !== "el" && value !== "en") throw new Error("Η επιλεγμένη γλώσσα δεν υποστηρίζεται.");
  return value;
}

export async function customerAccountProfile(principal: SessionPrincipal): Promise<CustomerAccountProfile> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) {
    return { email: principal.email, emailVerified: true, firstName: "", lastName: "", phone: "", preferredLocale: "el" };
  }
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    SELECT u.email::text,u.email_verified_at,u.phone,u.preferred_locale,cp.first_name,cp.last_name
    FROM users u
    LEFT JOIN customer_profiles cp ON cp.user_id=u.id
    WHERE u.public_id=$1 AND u.status<>'closed'
    LIMIT 1
  `, [principal.userId]);
  if (!result.rowCount) throw new Error("Ο λογαριασμός πελάτη δεν βρέθηκε.");
  const row = result.rows[0];
  return {
    email: String(row.email ?? principal.email),
    emailVerified: Boolean(row.email_verified_at),
    firstName: typeof row.first_name === "string" ? row.first_name : "",
    lastName: typeof row.last_name === "string" ? row.last_name : "",
    phone: typeof row.phone === "string" ? row.phone : "",
    preferredLocale: row.preferred_locale === "en" ? "en" : "el"
  };
}

export async function updateCustomerAccountProfile(principal: SessionPrincipal, input: {
  firstName: string;
  lastName: string;
  phone: string;
  preferredLocale: string;
  now?: number;
}): Promise<CustomerAccountProfile> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η επεξεργασία προφίλ απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const firstName = normalizeName(input.firstName, "Το όνομα");
  const lastName = normalizeName(input.lastName, "Το επώνυμο");
  if (`${firstName} ${lastName}`.length > 160) throw new Error("Το ονοματεπώνυμο είναι πολύ μεγάλο.");
  const phone = normalizePhone(input.phone);
  const preferredLocale = normalizeLocale(input.preferredLocale);
  const now = new Date(input.now ?? Date.now());
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(`
      UPDATE users u
      SET phone=$2,preferred_locale=$3,updated_at=$4
      WHERE u.public_id=$1 AND u.status<>'closed'
      RETURNING u.id::text,u.email::text,u.email_verified_at,u.phone,u.preferred_locale
    `, [principal.userId, phone || null, preferredLocale, now]);
    if (user.rowCount !== 1) throw new Error("Ο λογαριασμός πελάτη δεν είναι διαθέσιμος.");
    const userUuid = String(user.rows[0].id);
    await client.query(`
      INSERT INTO customer_profiles(user_id,first_name,last_name,created_at,updated_at)
      VALUES($1::uuid,$2,$3,$4,$4)
      ON CONFLICT(user_id) DO UPDATE
      SET first_name=EXCLUDED.first_name,last_name=EXCLUDED.last_name,updated_at=EXCLUDED.updated_at
    `, [userUuid, firstName, lastName, now]);
    await client.query("COMMIT");
    return {
      email: String(user.rows[0].email ?? principal.email),
      emailVerified: Boolean(user.rows[0].email_verified_at),
      firstName,
      lastName,
      phone: typeof user.rows[0].phone === "string" ? user.rows[0].phone : "",
      preferredLocale: user.rows[0].preferred_locale === "en" ? "en" : "el"
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function changeCustomerPassword(principal: SessionPrincipal, input: {
  currentPassword: string;
  newPassword: string;
  now?: number;
}): Promise<void> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η αλλαγή κωδικού απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  if (!input.currentPassword) throw new Error("Συμπλήρωσε τον τρέχοντα κωδικό σου.");
  if (input.newPassword !== input.newPassword.trim()) throw new Error("Ο νέος κωδικός δεν μπορεί να αρχίζει ή να τελειώνει με κενό.");
  const newPasswordHash = hashPassword(input.newPassword);
  const nowMs = input.now ?? Date.now();
  const now = new Date(nowMs);
  const runtime = getProductionPostgresRuntime();
  const limiter = globals.__blsCustomerPasswordChangeRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  const limit = await limiter.consume({ route: "customer-password-change", key: principal.userId, limit: 5, windowMs: 15 * 60 * 1000, now: nowMs });
  if (!limit.allowed) throw new Error("Έγιναν πολλές προσπάθειες αλλαγής κωδικού. Δοκίμασε ξανά αργότερα.");

  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const found = await client.query(`
      SELECT u.id::text AS id,u.password_hash
      FROM users u
      WHERE u.public_id=$1 AND u.status='active'
      FOR UPDATE
    `, [principal.userId]);
    if (found.rowCount !== 1) throw new Error("Ο λογαριασμός πελάτη δεν είναι διαθέσιμος.");
    const userUuid = String(found.rows[0].id);
    const currentHash = String(found.rows[0].password_hash ?? "");
    if (!verifyPassword(input.currentPassword, currentHash)) throw new Error("Ο τρέχων κωδικός δεν είναι σωστός.");
    if (verifyPassword(input.newPassword, currentHash)) throw new Error("Ο νέος κωδικός πρέπει να είναι διαφορετικός από τον τρέχοντα.");
    await client.query("UPDATE users SET password_hash=$2,updated_at=$3 WHERE id=$1::uuid", [userUuid, newPasswordHash, now]);
    await client.query("DELETE FROM user_sessions WHERE user_id=$1::uuid", [userUuid]);
    await client.query(`UPDATE password_reset_tokens SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1::uuid AND consumed_at IS NULL`, [userUuid, now]);
    await client.query(`INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES(gen_random_uuid(),'notification_' || gen_random_uuid()::text,$1::uuid,'in_app','transactional','account.password_changed','account-security-v1','el','Ο κωδικός σου άλλαξε','Ο κωδικός σύνδεσης άλλαξε και όλες οι προηγούμενες συνεδρίες αποσυνδέθηκαν.','{}'::jsonb,'sent',$2,$3)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING`, [userUuid, `account-password-changed:${principal.userId}:${now.getTime()}`, now]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}