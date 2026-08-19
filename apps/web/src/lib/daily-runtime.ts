import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword, type Role, type SessionPrincipal } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

export const DAILY_SESSION_COOKIE = "bls_daily_session";
const DAILY_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DAILY_ROLES: Role[] = ["vendor_fulfilment", "vendor_adviser"];

type DailyAccountRow = {
  access_uuid: string;
  access_id: string;
  display_name: string;
  user_public_id: string;
  user_uuid: string;
  email: string;
  password_hash: string;
  user_status: string;
  email_verified_at: Date | string | null;
  vendor_public_id: string;
  vendor_uuid: string;
  vendor_status: string;
};

function authSecret(): Buffer {
  const configured = process.env.BLS_AUTH_SECRET?.trim();
  if (configured && configured.length >= 32) return Buffer.from(configured, "utf8");
  if (process.env.NODE_ENV === "production") throw new Error("BLS_AUTH_SECRET (minimum 32 characters) is required for Daily sessions");
  return Buffer.from("buy-local-sparta-development-daily-auth-secret-not-production", "utf8");
}

function tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
function csrfForToken(token: string): string { return createHmac("sha256", authSecret()).update(`daily-csrf:${token}`).digest("base64url"); }
function safeEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8"), bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
function signRawToken(raw: string): string {
  const signature = createHmac("sha256", authSecret()).update(`daily:${raw}`).digest("base64url");
  return `${raw}.${signature}`;
}
function validTokenSignature(token: string): boolean {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const raw = token.slice(0, separator), signature = token.slice(separator + 1);
  const expected = createHmac("sha256", authSecret()).update(`daily:${raw}`).digest("base64url");
  return safeEqual(signature, expected);
}
function principalFrom(row: Pick<DailyAccountRow, "user_public_id" | "email" | "vendor_public_id">, sessionId: string, csrfToken: string): SessionPrincipal {
  return {
    userId: row.user_public_id,
    email: row.email,
    roles: [...DAILY_ROLES],
    vendorId: row.vendor_public_id,
    sessionId,
    csrfToken
  };
}

export async function authenticateDaily(input: { email: string; password: string; now: number }) {
  if (!productionDatabaseConfigured()) throw new Error("Daily employee access requires the shared database");
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<DailyAccountRow>(`
    SELECT da.id::text access_uuid,da.public_id access_id,da.display_name,
           u.public_id user_public_id,u.id::text user_uuid,u.email::text email,u.password_hash,u.status::text user_status,u.email_verified_at,
           v.public_id vendor_public_id,v.id::text vendor_uuid,v.status::text vendor_status
    FROM vendor_daily_access da
    JOIN users u ON u.id=da.user_id
    JOIN vendor_businesses v ON v.id=da.vendor_id
    WHERE lower(u.email::text)=lower($1) AND da.active=true
    LIMIT 1
  `, [input.email.trim()]);
  const row = result.rows[0];
  if (!row || !row.password_hash || !verifyPassword(input.password, row.password_hash)) throw new Error("Invalid email or password");
  if (row.user_status !== "active" || !row.email_verified_at || row.vendor_status !== "active") throw new Error("Daily access is not active");

  const raw = randomBytes(32).toString("base64url");
  const token = signRawToken(raw);
  const csrfToken = csrfForToken(token);
  const sessionId = `daily_session_${randomUUID().replaceAll("-", "")}`;
  const expiresAt = input.now + DAILY_SESSION_TTL_MS;
  await db.query(`
    INSERT INTO vendor_daily_sessions(id,public_id,daily_access_id,token_hash,expires_at,last_seen_at,created_at)
    VALUES($1,$2,$3,$4,$5,$6,$6)
  `, [randomUUID(), sessionId, row.access_uuid, tokenHash(token), new Date(expiresAt), new Date(input.now)]);
  return { token, expiresAt, principal: principalFrom(row, sessionId, csrfToken), displayName: row.display_name };
}

export async function dailySessionFromToken(token: string | undefined, now: number): Promise<SessionPrincipal | undefined> {
  if (!token || !validTokenSignature(token) || !productionDatabaseConfigured()) return undefined;
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<DailyAccountRow & { session_id: string }>(`
    SELECT ds.public_id session_id,da.id::text access_uuid,da.public_id access_id,da.display_name,
           u.public_id user_public_id,u.id::text user_uuid,u.email::text email,u.password_hash,u.status::text user_status,u.email_verified_at,
           v.public_id vendor_public_id,v.id::text vendor_uuid,v.status::text vendor_status
    FROM vendor_daily_sessions ds
    JOIN vendor_daily_access da ON da.id=ds.daily_access_id
    JOIN users u ON u.id=da.user_id
    JOIN vendor_businesses v ON v.id=da.vendor_id
    WHERE ds.token_hash=$1 AND ds.expires_at>$2 AND da.active=true AND u.status='active' AND u.email_verified_at IS NOT NULL AND v.status='active'
    LIMIT 1
  `, [tokenHash(token), new Date(now)]);
  const row = result.rows[0];
  if (!row) return undefined;
  await db.query("UPDATE vendor_daily_sessions SET last_seen_at=$2 WHERE public_id=$1", [row.session_id, new Date(now)]);
  return principalFrom(row, row.session_id, csrfForToken(token));
}

export function assertDailyCsrf(principal: SessionPrincipal, supplied: string | undefined): void {
  if (!supplied || !safeEqual(principal.csrfToken, supplied)) throw new Error("CSRF validation failed");
}

export async function logoutDaily(token: string | undefined): Promise<void> {
  if (!token || !validTokenSignature(token) || !productionDatabaseConfigured()) return;
  await getProductionPostgresRuntime().nativePool.query("DELETE FROM vendor_daily_sessions WHERE token_hash=$1", [tokenHash(token)]);
}

function requireOwner(principal: SessionPrincipal): string {
  if (!principal.vendorId || !principal.roles.includes("vendor_owner")) throw new Error("Vendor owner access is required");
  return principal.vendorId;
}

export async function listDailyAccess(principal: SessionPrincipal) {
  const vendorId = requireOwner(principal);
  const rows = await getProductionPostgresRuntime().nativePool.query(`
    SELECT da.public_id id,da.display_name,u.email::text email,da.active,da.created_at,da.updated_at,
           (SELECT COUNT(*)::int FROM vendor_daily_sessions ds WHERE ds.daily_access_id=da.id AND ds.expires_at>now()) active_sessions,
           (SELECT COUNT(*)::int FROM vendor_daily_push_subscriptions ps WHERE ps.vendor_id=da.vendor_id AND ps.user_id=da.user_id AND ps.active) push_devices
    FROM vendor_daily_access da JOIN users u ON u.id=da.user_id
    WHERE da.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1)
    ORDER BY da.active DESC,lower(da.display_name),da.created_at
  `, [vendorId]);
  return rows.rows.map((row) => ({
    id: String(row.id), displayName: String(row.display_name), email: String(row.email), active: Boolean(row.active),
    createdAt: new Date(String(row.created_at)).getTime(), updatedAt: new Date(String(row.updated_at)).getTime(),
    activeSessions: Number(row.active_sessions ?? 0), pushDevices: Number(row.push_devices ?? 0)
  }));
}

export async function createDailyAccess(principal: SessionPrincipal, input: { email: string; displayName: string; password: string; now: number }) {
  const vendorId = requireOwner(principal);
  const email = input.email.trim().toLowerCase(), displayName = input.displayName.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid email is required");
  if (!displayName || displayName.length > 120) throw new Error("A display name is required");
  const passwordHash = hashPassword(input.password);
  const db = getProductionPostgresRuntime().nativePool;
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    const existing = await client.query("SELECT public_id FROM users WHERE lower(email::text)=lower($1) LIMIT 1", [email]);
    if (existing.rowCount) throw new Error("This email already belongs to an existing account. Use a dedicated email for Daily access.");
    const vendor = await client.query("SELECT id::text id FROM vendor_businesses WHERE public_id=$1 AND status='active' LIMIT 1", [vendorId]);
    if (!vendor.rowCount) throw new Error("Active vendor not found");
    const actor = await client.query("SELECT id::text id FROM users WHERE public_id=$1 LIMIT 1", [principal.userId]);
    const userUuid = randomUUID(), userPublicId = `usr_${randomUUID().replaceAll("-", "")}`;
    await client.query(`INSERT INTO users(id,public_id,email,password_hash,status,email_verified_at,preferred_locale,created_at,updated_at)
      VALUES($1,$2,$3,$4,'active',$5,'el',$5,$5)`, [userUuid,userPublicId,email,passwordHash,new Date(input.now)]);
    const accessId = `daily_access_${randomUUID().replaceAll("-", "")}`;
    await client.query(`INSERT INTO vendor_daily_access(id,public_id,vendor_id,user_id,display_name,active,created_by_user_id,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,true,$6,$7,$7)`, [randomUUID(),accessId,String(vendor.rows[0].id),userUuid,displayName,actor.rowCount ? String(actor.rows[0].id) : null,new Date(input.now)]);
    await client.query(`INSERT INTO audit_events(id,public_id,market_id,actor_user_id,actor_public_id,actor_role,action,entity_type,entity_id,reason,after_state,created_at)
      VALUES($1,$2,(SELECT id FROM markets WHERE code='sparta'),$3,$4,'vendor_owner','vendor.daily_access.created','vendor_daily_access',$5,'Owner granted Daily-only operational access',$6::jsonb,$7)`,
      [randomUUID(),`audit_${randomUUID().replaceAll("-", "")}`,actor.rowCount ? String(actor.rows[0].id) : null,principal.userId,accessId,JSON.stringify({ email,displayName,vendorId }),new Date(input.now)]);
    await client.query("COMMIT");
    return { id: accessId, email, displayName, active: true };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally { client.release(); }
}

export async function revokeDailyAccess(principal: SessionPrincipal, accessId: string, now: number) {
  const vendorId = requireOwner(principal), db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`UPDATE vendor_daily_access SET active=false,updated_at=$3
    WHERE public_id=$1 AND vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) RETURNING id::text id,user_id::text user_id`, [accessId,vendorId,new Date(now)]);
  if (!result.rowCount) throw new Error("Daily access not found");
  await db.query("DELETE FROM vendor_daily_sessions WHERE daily_access_id=$1", [String(result.rows[0].id)]);
  await db.query("UPDATE vendor_daily_push_subscriptions SET active=false,updated_at=$2 WHERE vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$1) AND user_id=$3", [vendorId,new Date(now),String(result.rows[0].user_id)]);
  return { ok: true };
}

export async function resetDailyPassword(principal: SessionPrincipal, accessId: string, password: string, now: number) {
  const vendorId = requireOwner(principal), passwordHash = hashPassword(password), db = getProductionPostgresRuntime().nativePool;
  const result = await db.query(`SELECT da.id::text access_uuid,da.user_id::text user_uuid FROM vendor_daily_access da
    WHERE da.public_id=$1 AND da.vendor_id=(SELECT id FROM vendor_businesses WHERE public_id=$2) AND da.active=true LIMIT 1`, [accessId,vendorId]);
  if (!result.rowCount) throw new Error("Active Daily access not found");
  await db.query("UPDATE users SET password_hash=$2,updated_at=$3 WHERE id=$1", [String(result.rows[0].user_uuid),passwordHash,new Date(now)]);
  await db.query("DELETE FROM vendor_daily_sessions WHERE daily_access_id=$1", [String(result.rows[0].access_uuid)]);
  return { ok: true };
}
