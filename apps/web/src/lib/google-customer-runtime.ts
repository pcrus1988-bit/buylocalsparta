import { createHash, createHmac, randomBytes } from "node:crypto";
import { id } from "@buy-local-sparta/core";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

type GoogleIdentityInput = Readonly<{ subject: string; email: string; now: number }>;
type UserRow = Readonly<{ id: string; public_id: string; email: string; status: string }>;
export type GoogleCustomerSession = Readonly<{ token: string; expiresAt: number; userId: string; email: string }>;

export async function authenticateExistingGoogleCustomer(input: GoogleIdentityInput): Promise<GoogleCustomerSession | undefined> {
  if (!productionDatabaseConfigured()) throw new Error("google_login_requires_database");
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    let user = await userByGoogleSubject(client, input.subject);
    if (!user) user = await userByVerifiedEmail(client, input.email);
    if (!user) {
      await client.query("ROLLBACK");
      return undefined;
    }
    await prepareCustomerForGoogleLogin(client, user, input);
    const session = await issueCustomerSession(client, user, input.now);
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export async function createOrLinkGoogleCustomer(input: GoogleIdentityInput): Promise<GoogleCustomerSession> {
  if (!productionDatabaseConfigured()) throw new Error("google_login_requires_database");
  try {
    return await createOrLinkGoogleCustomerOnce(input);
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
      const existing = await authenticateExistingGoogleCustomer(input);
      if (existing) return existing;
    }
    throw error;
  }
}

async function createOrLinkGoogleCustomerOnce(input: GoogleIdentityInput): Promise<GoogleCustomerSession> {
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    let user = await userByGoogleSubject(client, input.subject);
    if (!user) user = await userByVerifiedEmail(client, input.email);
    if (!user) {
      const publicId = id("usr");
      const inserted = await client.query(`
        INSERT INTO users (id,public_id,email,password_hash,status,email_verified_at,preferred_locale,created_at,updated_at)
        VALUES (gen_random_uuid(),$1,$2,NULL,'active',$3,'el',$3,$3)
        RETURNING id::text AS id, public_id, email::text AS email, status::text AS status
      `, [publicId, input.email, new Date(input.now)]);
      user = rowFrom(inserted.rows[0]);
    }
    await prepareCustomerForGoogleLogin(client, user, input);
    const session = await issueCustomerSession(client, user, input.now);
    await client.query("COMMIT");
    return session;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function userByGoogleSubject(client: import("pg").PoolClient, subject: string): Promise<UserRow | undefined> {
  const result = await client.query(`
    SELECT u.id::text AS id, u.public_id, u.email::text AS email, u.status::text AS status
    FROM user_external_identities identity
    JOIN users u ON u.id=identity.user_id
    WHERE identity.provider='google' AND identity.provider_subject=$1
    LIMIT 1
    FOR UPDATE OF identity, u
  `, [subject]);
  return result.rows[0] ? rowFrom(result.rows[0]) : undefined;
}

async function userByVerifiedEmail(client: import("pg").PoolClient, email: string): Promise<UserRow | undefined> {
  const result = await client.query(`
    SELECT id::text AS id, public_id, email::text AS email, status::text AS status
    FROM users
    WHERE lower(email::text)=lower($1)
    LIMIT 1
    FOR UPDATE
  `, [email]);
  return result.rows[0] ? rowFrom(result.rows[0]) : undefined;
}

async function prepareCustomerForGoogleLogin(client: import("pg").PoolClient, user: UserRow, input: GoogleIdentityInput): Promise<void> {
  if (user.status !== "active" && user.status !== "pending_verification") throw new Error("google_account_not_available");
  const now = new Date(input.now);
  await client.query(`
    UPDATE users
    SET email_verified_at=COALESCE(email_verified_at,$2),
        status=CASE WHEN status='pending_verification' THEN 'active' ELSE status END,
        updated_at=$2
    WHERE id=$1
  `, [user.id, now]);
  await client.query("INSERT INTO customer_profiles(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [user.id]);
  const identity = await client.query(`
    INSERT INTO user_external_identities(user_id,provider,provider_subject,created_at,last_login_at)
    VALUES($1,'google',$2,$3,$3)
    ON CONFLICT(provider,provider_subject) DO UPDATE SET last_login_at=EXCLUDED.last_login_at
      WHERE user_external_identities.user_id=EXCLUDED.user_id
    RETURNING user_id::text AS user_id
  `, [user.id, input.subject, now]);
  if (identity.rowCount !== 1 || String(identity.rows[0]?.user_id ?? "") !== user.id) throw new Error("google_identity_conflict");
}

async function issueCustomerSession(client: import("pg").PoolClient, user: UserRow, now: number): Promise<GoogleCustomerSession> {
  const secret = Buffer.from(accountAuthSecret(), "utf8");
  const rawToken = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", secret).update(rawToken).digest("base64url");
  const token = `${rawToken}.${signature}`;
  const csrfToken = createHmac("sha256", secret).update(`csrf:${token}`).digest("base64url");
  const sessionId = `ses_${randomBytes(16).toString("hex")}`;
  const expiresAt = now + SESSION_TTL_MS;
  await client.query(`
    INSERT INTO user_sessions(id,public_id,user_id,session_hash,csrf_hash,expires_at,last_seen_at,created_at)
    VALUES(gen_random_uuid(),$1,$2,$3,$4,$5,$6,$6)
  `, [
    sessionId,
    user.id,
    createHash("sha256").update(token).digest("hex"),
    createHash("sha256").update(csrfToken).digest("hex"),
    new Date(expiresAt),
    new Date(now)
  ]);
  return { token, expiresAt, userId: user.public_id, email: user.email };
}

function rowFrom(row: Record<string, unknown>): UserRow {
  const idValue = String(row.id ?? "");
  const publicId = String(row.public_id ?? "");
  const email = String(row.email ?? "");
  const status = String(row.status ?? "");
  if (!idValue || !publicId || !email || !status) throw new Error("google_customer_record_invalid");
  return { id: idValue, public_id: publicId, email, status };
}

function postgresErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
