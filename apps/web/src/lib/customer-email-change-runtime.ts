import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { id, verifyPassword, type Notification, type SessionPrincipal } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { ResendEmailProvider, resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";

const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60 * 1000;
const globals = globalThis as typeof globalThis & { __blsCustomerEmailChangeRateLimiter?: PostgresFixedWindowRateLimiter };

export type PendingCustomerEmailChange = Readonly<{ email: string; expiresAt: number }>;
export type CustomerEmailChangeRequestResult = PendingCustomerEmailChange & Readonly<{ delivered: boolean; verificationUrl?: string }>;

function requireCustomer(principal: SessionPrincipal): void {
  if (!principal.roles.includes("customer")) throw new Error("AUTH_REQUIRED");
}

export function customerEmailChangeReadiness(): { ready: boolean; message: string } {
  if (!productionDatabaseConfigured()) {
    return { ready: false, message: "Η αλλαγή email απαιτεί την ασφαλή υπηρεσία λογαριασμών PostgreSQL." };
  }
  if (process.env.NODE_ENV !== "production") {
    return { ready: true, message: process.env.BLS_EMAIL_DELIVERY_ENABLED === "true" ? "Email change delivery enabled" : "Development email-change link enabled" };
  }
  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    return { ready: false, message: "Η αλλαγή email θα είναι διαθέσιμη μόλις ενεργοποιηθεί η ασφαλής αποστολή email." };
  }
  try {
    resendConfigFromEnv();
    return { ready: true, message: "Email change delivery enabled" };
  } catch {
    return { ready: false, message: "Η υπηρεσία επιβεβαίωσης email δεν είναι πλήρως ρυθμισμένη." };
  }
}

export async function customerPendingEmailChange(principal: SessionPrincipal, now = Date.now()): Promise<PendingCustomerEmailChange | undefined> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return undefined;
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    SELECT ect.target_email::text AS target_email,ect.expires_at
    FROM customer_email_change_tokens ect
    JOIN users u ON u.id=ect.user_id
    WHERE u.public_id=$1
      AND ect.consumed_at IS NULL
      AND ect.cancelled_at IS NULL
      AND ect.expires_at>$2
    ORDER BY ect.created_at DESC
    LIMIT 1
  `, [principal.userId, new Date(now)]);
  if (!result.rowCount) return undefined;
  return { email: String(result.rows[0].target_email), expiresAt: new Date(result.rows[0].expires_at as string | number | Date).getTime() };
}

export async function requestCustomerEmailChange(principal: SessionPrincipal, input: {
  newEmail: string;
  currentPassword: string;
  now?: number;
}): Promise<CustomerEmailChangeRequestResult> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) throw new Error("Η αλλαγή email απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const readiness = customerEmailChangeReadiness();
  if (!readiness.ready) throw new Error(readiness.message);
  if (!input.currentPassword) throw new Error("Συμπλήρωσε τον τρέχοντα κωδικό σου.");
  const targetEmail = normalizeEmail(input.newEmail);
  const nowMs = input.now ?? Date.now();
  const now = new Date(nowMs);
  const expiresAt = nowMs + EMAIL_CHANGE_TTL_MS;
  const runtime = getProductionPostgresRuntime();
  const limiter = globals.__blsCustomerEmailChangeRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  const limit = await limiter.consume({ route: "customer-email-change", key: principal.userId, limit: 3, windowMs: 30 * 60 * 1000, now: nowMs });
  if (!limit.allowed) throw new Error("Έγιναν πολλές προσπάθειες αλλαγής email. Δοκίμασε ξανά αργότερα.");

  const token = createEmailChangeToken();
  const hashedToken = tokenHash(token);
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const user = await client.query(`
      SELECT id::text AS id,email::text AS email,password_hash
      FROM users
      WHERE public_id=$1 AND status='active' AND email_verified_at IS NOT NULL
      FOR UPDATE
    `, [principal.userId]);
    if (user.rowCount !== 1) throw new Error("Ο λογαριασμός πελάτη δεν είναι διαθέσιμος.");
    const userUuid = String(user.rows[0].id);
    const currentEmail = String(user.rows[0].email ?? principal.email).toLowerCase();
    if (targetEmail === currentEmail) throw new Error("Αυτό είναι ήδη το email σύνδεσής σου.");
    if (!verifyPassword(input.currentPassword, String(user.rows[0].password_hash ?? ""))) throw new Error("Ο τρέχων κωδικός δεν είναι σωστός.");

    const claimed = await client.query("SELECT 1 AS present FROM users WHERE email=$1 AND id<>$2::uuid LIMIT 1", [targetEmail, userUuid]);
    if (claimed.rowCount) throw new Error("Αυτό το email χρησιμοποιείται ήδη από άλλο λογαριασμό.");

    await client.query(`
      UPDATE customer_email_change_tokens
      SET cancelled_at=$2
      WHERE user_id=$1::uuid AND consumed_at IS NULL AND cancelled_at IS NULL
    `, [userUuid, now]);
    await client.query(`
      UPDATE customer_email_change_tokens
      SET cancelled_at=$2
      WHERE target_email=$1 AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at<=$2
    `, [targetEmail, now]);
    const reserved = await client.query(`
      SELECT 1 AS present FROM customer_email_change_tokens
      WHERE target_email=$1 AND consumed_at IS NULL AND cancelled_at IS NULL AND expires_at>$2
      LIMIT 1
    `, [targetEmail, now]);
    if (reserved.rowCount) throw new Error("Υπάρχει ήδη ενεργό αίτημα επιβεβαίωσης για αυτό το email.");

    await client.query(`
      INSERT INTO customer_email_change_tokens(public_id,user_id,target_email,token_hash,expires_at,created_at)
      VALUES($1,$2::uuid,$3,$4,$5,$6)
    `, [`email-change-${hashedToken.slice(0, 20)}`, userUuid, targetEmail, hashedToken, new Date(expiresAt), now]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    if (isUniqueViolation(error)) throw new Error("Το email δεν είναι διαθέσιμο για αλλαγή αυτή τη στιγμή.");
    throw error;
  } finally {
    client.release();
  }

  try {
    const delivery = await sendEmailChangeVerification({ userId: principal.userId, targetEmail, token, now: nowMs });
    return { email: targetEmail, expiresAt, ...delivery };
  } catch (error) {
    await runtime.sqlPool.query(`
      UPDATE customer_email_change_tokens
      SET cancelled_at=$2
      WHERE token_hash=$1 AND consumed_at IS NULL AND cancelled_at IS NULL
    `, [hashedToken, now]);
    throw error;
  }
}

export async function cancelCustomerEmailChange(principal: SessionPrincipal, now = Date.now()): Promise<{ cancelled: boolean }> {
  requireCustomer(principal);
  if (!productionDatabaseConfigured()) return { cancelled: false };
  const runtime = getProductionPostgresRuntime();
  const result = await runtime.sqlPool.query(`
    UPDATE customer_email_change_tokens ect
    SET cancelled_at=$2
    FROM users u
    WHERE ect.user_id=u.id AND u.public_id=$1
      AND ect.consumed_at IS NULL AND ect.cancelled_at IS NULL
  `, [principal.userId, new Date(now)]);
  return { cancelled: result.rowCount > 0 };
}

export async function confirmCustomerEmailChange(input: { token: string; now?: number }): Promise<{ userId: string; newEmail: string }> {
  if (!productionDatabaseConfigured()) throw new Error("Η επιβεβαίωση αλλαγής email απαιτεί την παραγωγική υπηρεσία λογαριασμών.");
  const token = input.token.trim();
  if (!token || !verifyEmailChangeTokenSignature(token)) throw new Error("Ο σύνδεσμος αλλαγής email δεν είναι έγκυρος ή έχει λήξει.");
  const hashedToken = tokenHash(token);
  const nowMs = input.now ?? Date.now();
  const now = new Date(nowMs);
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  let oldEmail = "";
  let newEmail = "";
  let userId = "";
  try {
    await client.query("BEGIN");
    const consumed = await client.query(`
      UPDATE customer_email_change_tokens
      SET consumed_at=$2
      WHERE token_hash=$1
        AND consumed_at IS NULL
        AND cancelled_at IS NULL
        AND expires_at>$2
      RETURNING user_id::text AS user_id,target_email::text AS target_email
    `, [hashedToken, now]);
    if (consumed.rowCount !== 1) throw new Error("Ο σύνδεσμος αλλαγής email δεν είναι έγκυρος ή έχει λήξει.");
    const userUuid = String(consumed.rows[0].user_id);
    newEmail = normalizeEmail(String(consumed.rows[0].target_email));

    const user = await client.query("SELECT public_id,email::text AS email,status::text AS status FROM users WHERE id=$1::uuid FOR UPDATE", [userUuid]);
    if (user.rowCount !== 1 || String(user.rows[0].status) === "closed") throw new Error("Ο λογαριασμός δεν είναι διαθέσιμος.");
    userId = String(user.rows[0].public_id);
    oldEmail = String(user.rows[0].email ?? "");

    const claimed = await client.query("SELECT 1 AS present FROM users WHERE email=$1 AND id<>$2::uuid LIMIT 1", [newEmail, userUuid]);
    if (claimed.rowCount) throw new Error("Το νέο email χρησιμοποιείται πλέον από άλλο λογαριασμό.");

    const updated = await client.query(`
      UPDATE users
      SET email=$2,email_verified_at=$3,updated_at=$3
      WHERE id=$1::uuid AND status<>'closed'
      RETURNING public_id
    `, [userUuid, newEmail, now]);
    if (updated.rowCount !== 1) throw new Error("Η αλλαγή email δεν ολοκληρώθηκε.");

    await client.query("DELETE FROM user_sessions WHERE user_id=$1::uuid", [userUuid]);
    await client.query("UPDATE password_reset_tokens SET consumed_at=COALESCE(consumed_at,$2) WHERE user_id=$1::uuid AND consumed_at IS NULL", [userUuid, now]);
    await client.query(`
      UPDATE customer_email_change_tokens
      SET cancelled_at=$2
      WHERE user_id=$1::uuid AND consumed_at IS NULL AND cancelled_at IS NULL
    `, [userUuid, now]);
    await client.query(`
      INSERT INTO notifications(id,public_id,user_id,channel,purpose,event_type,template_version,locale,title,body,payload,status,dedupe_key,created_at)
      VALUES(gen_random_uuid(),'notification_' || gen_random_uuid()::text,$1::uuid,'in_app','transactional','account.email_changed','account-security-v1','el','Το email σύνδεσης άλλαξε','Το νέο email επιβεβαιώθηκε. Για λόγους ασφαλείας όλες οι προηγούμενες συνεδρίες αποσυνδέθηκαν.','{}'::jsonb,'sent',$2,$3)
      ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    `, [userUuid, `account-email-changed:${hashedToken.slice(0, 32)}`, now]);
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    if (isUniqueViolation(error)) {
      await runtime.sqlPool.query(`UPDATE customer_email_change_tokens SET cancelled_at=$2 WHERE token_hash=$1 AND consumed_at IS NULL AND cancelled_at IS NULL`, [hashedToken, now]);
      throw new Error("Το νέο email δεν είναι πλέον διαθέσιμο.");
    }
    throw error;
  } finally {
    client.release();
  }

  if (oldEmail && oldEmail.toLowerCase() !== newEmail.toLowerCase()) {
    await sendPreviousEmailSecurityNotice({ userId, oldEmail, newEmail, tokenHash: hashedToken, now: nowMs }).catch((error) => {
      console.error(JSON.stringify({ level: "error", event: "account.email_change_previous_address_notice_failed", userId, message: error instanceof Error ? error.message : String(error) }));
    });
  }
  return { userId, newEmail };
}

async function sendEmailChangeVerification(input: { userId: string; targetEmail: string; token: string; now: number }): Promise<{ delivered: boolean; verificationUrl?: string }> {
  const verificationUrl = new URL("/confirm-email-change", publicOrigin());
  verificationUrl.searchParams.set("token", input.token);
  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    if (process.env.NODE_ENV === "production") throw new Error("Η αποστολή επιβεβαίωσης email δεν είναι διαθέσιμη.");
    return { delivered: false, verificationUrl: verificationUrl.toString() };
  }
  const notification: Notification = {
    id: id("ntf"),
    userId: input.userId,
    channel: "email",
    purpose: "transactional",
    eventType: "account.email_change_verification",
    templateVersion: "v1",
    locale: "el",
    title: "Επιβεβαίωσε το νέο email σου · ΚΟΝΤΑ ΜΟΥ Sparta",
    body: [
      "Ζήτησες να χρησιμοποιείς αυτή τη διεύθυνση για σύνδεση στο ΚΟΝΤΑ ΜΟΥ Sparta.",
      "",
      "Επιβεβαίωσέ την μέσα στις επόμενες 24 ώρες:",
      verificationUrl.toString(),
      "",
      "Μέχρι να ολοκληρωθεί η επιβεβαίωση, το παλιό email παραμένει ενεργό. Αν δεν ζήτησες εσύ την αλλαγή, αγνόησε αυτό το μήνυμα."
    ].join("\n"),
    payload: { userId: input.userId },
    status: "queued",
    deliveryAttempts: 0,
    createdAt: input.now
  };
  await new ResendEmailProvider(resendConfigFromEnv()).send({
    notification,
    destination: input.targetEmail,
    idempotencyKey: `account-email-change:${input.userId}:${tokenHash(input.token).slice(0, 32)}`
  });
  return { delivered: true };
}

async function sendPreviousEmailSecurityNotice(input: { userId: string; oldEmail: string; newEmail: string; tokenHash: string; now: number }): Promise<void> {
  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") return;
  const notification: Notification = {
    id: id("ntf"),
    userId: input.userId,
    channel: "email",
    purpose: "transactional",
    eventType: "account.email_changed_security_notice",
    templateVersion: "v1",
    locale: "el",
    title: "Το email σύνδεσης του λογαριασμού σου άλλαξε · ΚΟΝΤΑ ΜΟΥ Sparta",
    body: [
      "Το email σύνδεσης του λογαριασμού σου άλλαξε επιτυχώς.",
      `Νέο email: ${input.newEmail}`,
      "",
      "Όλες οι προηγούμενες συνεδρίες αποσυνδέθηκαν. Αν δεν έκανες εσύ αυτή την αλλαγή, χρησιμοποίησε άμεσα την ανάκτηση κωδικού ή επικοινώνησε με την υποστήριξη."
    ].join("\n"),
    payload: { userId: input.userId },
    status: "queued",
    deliveryAttempts: 0,
    createdAt: input.now
  };
  await new ResendEmailProvider(resendConfigFromEnv()).send({
    notification,
    destination: input.oldEmail,
    idempotencyKey: `account-email-changed-notice:${input.userId}:${input.tokenHash.slice(0, 32)}`
  });
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) throw new Error("Συμπλήρωσε ένα έγκυρο email.");
  return normalized;
}

function createEmailChangeToken(): string {
  const raw = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", accountAuthSecret()).update(`email-change:${raw}`).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyEmailChangeTokenSignature(token: string): boolean {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const raw = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", accountAuthSecret()).update(`email-change:${raw}`).digest("base64url");
  return safeStringEqual(signature, expected);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function safeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return "code" in error && String((error as { code?: unknown }).code ?? "") === "23505";
}
