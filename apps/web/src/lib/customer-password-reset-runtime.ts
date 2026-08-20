import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword, id, type Notification } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { ResendEmailProvider, resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { accountAuthSecret } from "./account-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";

const RESET_TTL_MS = 30 * 60 * 1000;
const postgresGlobals = globalThis as typeof globalThis & {
  __blsCustomerPasswordResetRateLimiter?: PostgresFixedWindowRateLimiter;
};

export function customerPasswordResetReadiness(): { ready: boolean; message: string } {
  if (!productionDatabaseConfigured()) {
    return { ready: process.env.NODE_ENV !== "production", message: "Password recovery requires the PostgreSQL identity runtime." };
  }
  if (process.env.NODE_ENV === "production" && process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    return { ready: false, message: "Η αποστολή email ανάκτησης δεν είναι διαθέσιμη αυτή τη στιγμή." };
  }
  return { ready: true, message: "Password recovery ready" };
}

export async function consumeCustomerPasswordResetRateLimit(input: { visitorKey: string; now: number }) {
  if (!productionDatabaseConfigured()) return { allowed: true, remaining: 1, retryAfterMs: 0 };
  const runtime = getProductionPostgresRuntime();
  const limiter = postgresGlobals.__blsCustomerPasswordResetRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return limiter.consume({ route: "customer-password-reset", key: input.visitorKey, limit: 3, windowMs: 30 * 60 * 1000, now: input.now });
}

export async function requestCustomerPasswordReset(input: { email: string; now: number }): Promise<{ accepted: true; delivered: boolean; resetUrl?: string }> {
  const email = normalizeEmail(input.email);
  if (!productionDatabaseConfigured()) {
    return { accepted: true, delivered: false };
  }

  const runtime = getProductionPostgresRuntime();
  const account = await runtime.persistence.identity.findAccountForAuthentication(email);
  const eligible = account
    && account.emailVerified
    && account.roles.includes("customer")
    && (account.status === "active" || account.status === "restricted");

  // Always return the same public result so this endpoint cannot be used to enumerate accounts.
  if (!eligible) return { accepted: true, delivered: false };

  const token = createPasswordResetToken();
  const hashedToken = tokenHash(token);
  const expiresAt = input.now + RESET_TTL_MS;

  await runtime.sqlPool.query(
    `UPDATE password_reset_tokens
       SET consumed_at=$2
     WHERE user_id=(SELECT id FROM users WHERE public_id=$1)
       AND consumed_at IS NULL`,
    [account.id, new Date(input.now)]
  );
  await runtime.sqlPool.query(
    `INSERT INTO password_reset_tokens (id, public_id, user_id, token_hash, expires_at, created_at)
     SELECT gen_random_uuid(), $2, u.id, $3, $4, $5
       FROM users u
      WHERE u.public_id=$1`,
    [account.id, `password-reset-${hashedToken.slice(0, 20)}`, hashedToken, new Date(expiresAt), new Date(input.now)]
  );

  const resetUrl = new URL("/reset-password", publicOrigin());
  resetUrl.searchParams.set("token", token);

  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    return { accepted: true, delivered: false, ...(process.env.NODE_ENV !== "production" ? { resetUrl: resetUrl.toString() } : {}) };
  }

  const notification: Notification = {
    id: id("ntf"),
    userId: account.id,
    channel: "email",
    purpose: "transactional",
    eventType: "account.password_reset",
    templateVersion: "v1",
    locale: "el",
    title: "Επαναφορά κωδικού · ΚΟΝΤΑ ΜΟΥ Sparta",
    body: [
      "Λάβαμε αίτημα για αλλαγή του κωδικού του λογαριασμού σου.",
      "",
      "Άνοιξε τον παρακάτω ασφαλή σύνδεσμο μέσα στα επόμενα 30 λεπτά:",
      resetUrl.toString(),
      "",
      "Ο σύνδεσμος χρησιμοποιείται μόνο μία φορά. Αν δεν ζήτησες αλλαγή κωδικού, αγνόησε αυτό το μήνυμα."
    ].join("\n"),
    payload: { userId: account.id },
    status: "queued",
    deliveryAttempts: 0,
    createdAt: input.now
  };
  const provider = new ResendEmailProvider(resendConfigFromEnv());
  await provider.send({
    notification,
    destination: account.email,
    idempotencyKey: `account-password-reset:${account.id}:${hashedToken.slice(0, 32)}`
  });
  return { accepted: true, delivered: true };
}

export async function consumeCustomerPasswordReset(input: { token: string; password: string; now: number }): Promise<{ userId: string; purpose: "password_reset" | "vendor_activation" }> {
  const token = input.token.trim();
  if (!token || !verifyPasswordResetTokenSignature(token)) throw new Error("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.");
  if (input.password !== input.password.trim()) throw new Error("Ο κωδικός δεν μπορεί να αρχίζει ή να τελειώνει με κενό.");
  const passwordHash = hashPassword(input.password);
  if (!productionDatabaseConfigured()) throw new Error("Η επαναφορά κωδικού απαιτεί την παραγωγική υπηρεσία λογαριασμών.");

  const runtime = getProductionPostgresRuntime();
  const client = await runtime.sqlPool.connect();
  try {
    await client.query("BEGIN");
    const consumed = await client.query(
      `UPDATE password_reset_tokens
          SET consumed_at=$2
        WHERE token_hash=$1
          AND consumed_at IS NULL
          AND expires_at>$2
      RETURNING user_id::text AS user_id,public_id`,
      [tokenHash(token), new Date(input.now)]
    );
    if (consumed.rowCount !== 1) throw new Error("Ο σύνδεσμος επαναφοράς δεν είναι έγκυρος ή έχει λήξει.");
    const userUuid = String(consumed.rows[0]?.user_id ?? "");
    const tokenPublicId = String(consumed.rows[0]?.public_id ?? "");
    const purpose = tokenPublicId.startsWith("vendor-activation-") ? "vendor_activation" as const : "password_reset" as const;

    const updated = purpose === "vendor_activation"
      ? await client.query(
          `UPDATE users
              SET password_hash=$2,
                  status='active',
                  email_verified_at=COALESCE(email_verified_at,$3),
                  updated_at=$3
            WHERE id=$1
              AND status <> 'closed'
          RETURNING public_id`,
          [userUuid, passwordHash, new Date(input.now)]
        )
      : await client.query(
          `UPDATE users
              SET password_hash=$2, updated_at=$3
            WHERE id=$1
              AND status <> 'closed'
          RETURNING public_id`,
          [userUuid, passwordHash, new Date(input.now)]
        );
    if (updated.rowCount !== 1) throw new Error("Ο λογαριασμός δεν είναι διαθέσιμος για επαναφορά κωδικού.");

    // Password changes invalidate every existing browser/session immediately.
    await client.query("DELETE FROM user_sessions WHERE user_id=$1", [userUuid]);
    await client.query(
      `UPDATE password_reset_tokens
          SET consumed_at=COALESCE(consumed_at,$2)
        WHERE user_id=$1
          AND consumed_at IS NULL`,
      [userUuid, new Date(input.now)]
    );
    await client.query("COMMIT");
    return { userId: String(updated.rows[0]?.public_id ?? ""), purpose };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export function passwordResetEmailHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Συμπλήρωσε ένα έγκυρο email.");
  return normalized;
}

function createPasswordResetToken(): string {
  const raw = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", accountAuthSecret()).update(`password-reset:${raw}`).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyPasswordResetTokenSignature(token: string): boolean {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const raw = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", accountAuthSecret()).update(`password-reset:${raw}`).digest("base64url");
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
