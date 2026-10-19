import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword, type SessionPrincipal, type SqlRow, type Role } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";

export const VENDOR_IDENTITY_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const VENDOR_IDENTITY_RESET_TTL_MS = 30 * 60 * 1000;
const VENDOR_ROLES = new Set<Role>(["vendor_owner","vendor_catalog","vendor_fulfilment","vendor_adviser","vendor_finance"]);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function csrf(token: string) {
  return createHmac("sha256", accountAuthSecret()).update("vendor-identity-csrf:" + token).digest("base64url");
}
function equal(a: string, b: string) {
  const aa=Buffer.from(a), bb=Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa,bb);
}
function pool() { return getProductionPostgresRuntime().sqlPool; }
const accountSelect = [
  "SELECT u.id::text AS user_uuid,u.public_id AS user_public_id,u.email::text AS email,",
  "u.status::text AS user_status,u.email_verified_at,c.password_hash,",
  "COALESCE((SELECT array_agg(DISTINCT vur.role::text) FROM vendor_users vu",
  "JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id",
  "WHERE vu.user_id=u.id AND vu.active),ARRAY[]::text[]) AS vendor_roles,",
  "(SELECT vb.public_id FROM vendor_users vu JOIN vendor_businesses vb ON vb.id=vu.vendor_id",
  "JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id",
  "WHERE vu.user_id=u.id AND vu.active AND vur.role::text LIKE 'vendor_%'",
  "ORDER BY vu.created_at LIMIT 1) AS vendor_public_id,",
  "EXISTS(SELECT 1 FROM hub_expansion_prospects h WHERE h.owner_user_id=u.id",
  "AND h.plan_code='claim' AND h.status='converted' AND h.public_slug IS NOT NULL",
  "AND lower(h.email)=lower(u.email::text)) AS has_claim",
  "FROM users u LEFT JOIN vendor_identity_credentials c ON c.user_id=u.id"
].join(" ");

type IdentityRow = SqlRow & {
  user_uuid: string; user_public_id: string; email: string; user_status: string;
  email_verified_at: unknown; password_hash?: string | null;
  vendor_roles: string[]; vendor_public_id?: string | null; has_claim: boolean;
};
function principalFrom(row: IdentityRow, token: string, sessionId: string): SessionPrincipal | undefined {
  if (row.user_status !== "active" || !row.email_verified_at) return undefined;
  const roles: Role[] = (Array.isArray(row.vendor_roles) ? row.vendor_roles : [])
    .filter((value): value is Role => VENDOR_ROLES.has(value as Role));
  if (row.has_claim === true) roles.push("vendor_claim");
  if (!roles.length) return undefined;
  return {
    userId: String(row.user_public_id), email: String(row.email),
    roles: [...new Set(roles)],
    ...(row.vendor_public_id && roles.some(r => r !== "vendor_claim") ? { vendorId: String(row.vendor_public_id) } : {}),
    csrfToken: csrf(token), sessionId
  };
}
export function assertVendorIdentityCsrf(principal: SessionPrincipal, value?: string) {
  if (!value || !equal(principal.csrfToken,value)) throw new Error("CSRF validation failed");
}
const globals = globalThis as typeof globalThis & { __vendorIdentityEmailLimit?: PostgresFixedWindowRateLimiter };
export async function authenticateDedicatedVendor(input: { email: string; password: string; now: number }) {
  const email=input.email.trim().toLowerCase();
  if (!email || !input.password) throw new Error("Invalid vendor credentials");
  const limiter = globals.__vendorIdentityEmailLimit ??= new PostgresFixedWindowRateLimiter(pool());
  const limited=await limiter.consume({route:"vendor-identity-email",key:hash(email),limit:12,windowMs:30*60*1000,now:input.now});
  if (!limited.allowed) throw new Error("Too many login attempts");
  const r=await pool().query<IdentityRow>(accountSelect + " WHERE lower(u.email::text)=lower($1) LIMIT 1", [email]);
  const row=r.rows[0];
  // No fallback to users.password_hash: vendor and consumer secrets MUST be disjoint.
  if (!row || !row.password_hash || !verifyPassword(input.password,String(row.password_hash))) {
    throw new Error("Invalid vendor credentials");
  }
  const token=randomBytes(32).toString("base64url");
  const principal=principalFrom(row,token,"pending");
  if (!principal) throw new Error("Vendor account access not enabled");
  const sessionId="vsi_" + randomBytes(16).toString("hex");
  const expiresAt=input.now + VENDOR_IDENTITY_SESSION_TTL_MS;
  await pool().query([
    "INSERT INTO vendor_identity_sessions(id,user_id,token_hash,csrf_hash,created_at,last_seen_at,expires_at)",
    "VALUES(gen_random_uuid(),$1::uuid,$2,$3,$4,$4,$5)"
  ].join(" "),[row.user_uuid,hash(token),hash(csrf(token)),new Date(input.now),new Date(expiresAt)]);
  return {token,principal:{...principal,sessionId},expiresAt};
}
export async function dedicatedVendorSession(token: string | undefined,now: number): Promise<SessionPrincipal | undefined> {
  if (!token || token.length>512) return undefined;
  const r=await pool().query<IdentityRow & { session_public_id: string; csrf_hash: string }>([
    "SELECT i.*,s.id::text AS session_public_id,s.csrf_hash FROM vendor_identity_sessions s",
    "JOIN ("+accountSelect+" ) i ON i.user_uuid=s.user_id::text",
    "WHERE s.token_hash=$1 AND s.expires_at>$2 LIMIT 1"
  ].join(" "),[hash(token),new Date(now)]);
  const row=r.rows[0];
  if (!row || !equal(hash(csrf(token)),row.csrf_hash) || !row.password_hash) return undefined;
  const principal=principalFrom(row,token,String(row.session_public_id));
  if (!principal) return undefined;
  return principal;
}
export async function revokeDedicatedVendorSession(token?: string) {
  if (!token) return;
  await pool().query("DELETE FROM vendor_identity_sessions WHERE token_hash=$1",[hash(token)]);
}

export type VendorIdentityReset = Readonly<{
  vendorId: string; userId: string; tradingName: string; email: string;
  passwordSetupRequired: true; passwordSetupUrl: string; deliveryKey: string;
}>;
export async function prepareDedicatedVendorReset(input: {
  actorUserId:string; now:number; vendorId?:string; claimId?:string
}): Promise<VendorIdentityReset> {
  if (Boolean(input.vendorId)===Boolean(input.claimId)) throw new Error("Provide exactly one vendor or CLAIM reference");
  const isClaim=Boolean(input.claimId);
  const q=isClaim?[
    "SELECT u.id::text AS user_uuid,u.public_id AS user_public_id,u.email::text AS email,",
    "h.public_id AS record_id,h.business_name AS trading_name FROM hub_expansion_prospects h",
    "JOIN users u ON u.id=h.owner_user_id",
    "WHERE h.public_id=$1 AND h.plan_code='claim' AND h.status='converted'",
    "AND h.public_slug IS NOT NULL AND u.status='active' AND u.email_verified_at IS NOT NULL",
    "AND lower(h.email)=lower(u.email::text) LIMIT 1"
  ].join(" "):[
    "SELECT u.id::text AS user_uuid,u.public_id AS user_public_id,u.email::text AS email,",
    "vb.public_id AS record_id,vb.trading_name",
    "FROM vendor_businesses vb JOIN vendor_users vu ON vu.vendor_id=vb.id AND vu.active",
    "JOIN vendor_user_roles vur ON vur.vendor_user_id=vu.id AND vur.role='vendor_owner'",
    "JOIN users u ON u.id=vu.user_id",
    "WHERE (vb.public_id=$1 OR vb.id::text=$1)",
    "AND u.status='active' AND u.email_verified_at IS NOT NULL",
    "ORDER BY vu.created_at LIMIT 1"
  ].join(" ");
  const runtime=getProductionPostgresRuntime();
  const result=await runtime.sqlPool.query<SqlRow>(q,[input.claimId||input.vendorId]);
  const row=result.rows[0];
  if (!row) throw new Error("Verified vendor owner not found");
  const userUuid=String(row.user_uuid),token=randomBytes(32).toString("base64url");
  const tokenHash=hash(token);
  const client=await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT id FROM users WHERE id=$1::uuid FOR UPDATE",[userUuid]);
    await client.query("UPDATE vendor_identity_reset_tokens SET consumed_at=$2 WHERE user_id=$1::uuid AND consumed_at IS NULL",[userUuid,new Date(input.now)]);
    await client.query([
      "INSERT INTO vendor_identity_reset_tokens(user_id,token_hash,target_scope,expires_at,created_at)",
      "VALUES($1::uuid,$2,$3,$4,$5)"
    ].join(" "),[userUuid,tokenHash,isClaim?"claim":"vendor",new Date(input.now+VENDOR_IDENTITY_RESET_TTL_MS),new Date(input.now)]);
    await client.query("COMMIT");
  } catch(error) {
    await client.query("ROLLBACK");throw error;
  } finally {client.release();}
  const url=new URL("/reset-password",publicOrigin());
  url.searchParams.set("token",token);
  url.searchParams.set("mode",isClaim?"claim":"vendor");
  return {
    vendorId:String(row.record_id),userId:String(row.user_public_id),
    tradingName:String(row.trading_name),email:String(row.email),
    passwordSetupRequired:true,passwordSetupUrl:url.toString(),
    deliveryKey:"vendor-identity-reset:"+tokenHash
  };
}

export async function consumeDedicatedVendorReset(input:{token:string;password:string;now:number}):
  Promise<{scope:"vendor"|"claim"}> {
  if (!/^[a-zA-Z0-9_-]{32,160}$/.test(input.token)) throw new Error("Invalid reset link");
  if (input.password !== input.password.trim() || input.password.length < 10) throw new Error("Invalid password");
  const runtime=getProductionPostgresRuntime();
  const client=await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    const consumed=await client.query<{
      user_id:string; target_scope:"vendor"|"claim";
    }>([
      "UPDATE vendor_identity_reset_tokens SET consumed_at=$2",
      "WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>$2",
      "RETURNING user_id::text AS user_id,target_scope"
    ].join(" "),[hash(input.token),new Date(input.now)]);
    const row=consumed.rows[0];
    if (!row) throw new Error("Reset link expired or used");
    const allowed=await client.query<{ ok:boolean }>([
      "SELECT EXISTS(SELECT 1 FROM users u WHERE u.id=$1::uuid AND u.status='active'",
      "AND u.email_verified_at IS NOT NULL AND (",
      "( $2='claim' AND EXISTS(SELECT 1 FROM hub_expansion_prospects h WHERE h.owner_user_id=u.id",
      "AND h.plan_code='claim' AND h.status='converted' AND lower(h.email)=lower(u.email::text)))",
      "OR ($2='vendor' AND EXISTS(SELECT 1 FROM vendor_users vu JOIN vendor_user_roles vur",
      "ON vur.vendor_user_id=vu.id WHERE vu.user_id=u.id AND vu.active AND vur.role='vendor_owner'))",
      ")) AS ok"
    ].join(" "),[row.user_id,row.target_scope]);
    if (!allowed.rows[0]?.ok) throw new Error("Vendor account no longer eligible");
    // The vendor secret must not authenticate at the consumer login endpoint.
    const consumer = await client.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id=$1::uuid FOR UPDATE", [row.user_id]
    );
    if (!consumer.rows[0] || verifyPassword(input.password, String(consumer.rows[0].password_hash))) {
      throw new Error("The vendor password must be different from your customer password");
    }
    await client.query([
      "INSERT INTO vendor_identity_credentials(user_id,password_hash,created_at,updated_at)",
      "VALUES($1::uuid,$2,$3,$3) ON CONFLICT(user_id) DO UPDATE",
      "SET password_hash=EXCLUDED.password_hash,updated_at=EXCLUDED.updated_at"
    ].join(" "),[row.user_id,hashPassword(input.password),new Date(input.now)]);
    await client.query("DELETE FROM vendor_identity_sessions WHERE user_id=$1::uuid",[row.user_id]);
    await client.query("UPDATE vendor_identity_reset_tokens SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1::uuid",[row.user_id,new Date(input.now)]);
    await client.query("COMMIT");
    return {scope:row.target_scope};
  } catch(error) {
    await client.query("ROLLBACK");throw error;
  } finally {client.release();}
}
