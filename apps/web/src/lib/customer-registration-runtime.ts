import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  hashPassword,
  id,
  verifyPassword,
  type EmailVerification,
  type Notification,
  type UserAccount
} from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { ResendEmailProvider, resendConfigFromEnv } from "@buy-local-sparta/resend-notifications";
import { accountAuthSecret, getAccountRuntime } from "./account-runtime";
import { customerStateBackend } from "./customer-state-runtime";
import { isProvisionalVendorApplicantPasswordHash } from "./provisional-account";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { publicOrigin } from "./public-origin";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const postgresGlobals = globalThis as typeof globalThis & {
  __blsCustomerRegistrationRateLimiter?: PostgresFixedWindowRateLimiter;
};

type PublicCustomerAccount = Readonly<{
  id: string;
  email: string;
  status: UserAccount["status"];
  emailVerified: boolean;
  createdAt: number;
}>;

export type CustomerRegistrationResult = Readonly<{
  account: PublicCustomerAccount;
  verificationToken: string;
  resent: boolean;
}>;

export function customerRegistrationReadiness(): { ready: boolean; message: string } {
  if (process.env.NODE_ENV !== "production") {
    return { ready: true, message: process.env.BLS_EMAIL_DELIVERY_ENABLED === "true" ? "Email verification delivery enabled" : "Development verification link enabled" };
  }
  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    return { ready: false, message: "Η δημιουργία λογαριασμού θα ενεργοποιηθεί μόλις ολοκληρωθεί η ασφαλής αποστολή email επιβεβαίωσης." };
  }
  try {
    resendConfigFromEnv();
    return { ready: true, message: "Email verification delivery enabled" };
  } catch {
    return { ready: false, message: "Η υπηρεσία email επιβεβαίωσης δεν είναι πλήρως ρυθμισμένη." };
  }
}

export async function consumeCustomerRegistrationRateLimit(input: { visitorKey: string; now: number }) {
  if (customerStateBackend() === "memory") {
    return getAccountRuntime().rateLimiter.consume({
      key: `web-register:${input.visitorKey}`,
      rule: { limit: 4, windowMs: 30 * 60 * 1000 },
      now: input.now
    });
  }
  const runtime = getProductionPostgresRuntime();
  const limiter = postgresGlobals.__blsCustomerRegistrationRateLimiter ??= new PostgresFixedWindowRateLimiter(runtime.sqlPool);
  return limiter.consume({ route: "customer-register", key: input.visitorKey, limit: 4, windowMs: 30 * 60 * 1000, now: input.now });
}

export async function registerCustomer(input: { email: string; password: string; now: number }): Promise<CustomerRegistrationResult> {
  const email = normalizeEmail(input.email);
  hashPassword(input.password); // validate the password before any database work

  if (customerStateBackend() === "memory") {
    const auth = getAccountRuntime().auth;
    try {
      const account = auth.register({
        email,
        password: input.password,
        roles: ["customer"],
        status: "pending_verification",
        emailVerified: false,
        now: input.now
      });
      return {
        account: { id: account.id, email: account.email, status: account.status, emailVerified: account.emailVerified, createdAt: account.createdAt },
        verificationToken: auth.createEmailVerification(account.id, input.now, VERIFICATION_TTL_MS),
        resent: false
      };
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "Email address is already registered") throw error;
      throw new Error("Email address is already registered");
    }
  }

  const runtime = getProductionPostgresRuntime();
  const existing = await runtime.persistence.identity.findAccountForAuthentication(email);
  if (existing) {
    if (
      existing.status === "pending_verification" &&
      !existing.emailVerified &&
      existing.roles.includes("customer") &&
      isProvisionalVendorApplicantPasswordHash(existing.passwordHash)
    ) {
      const claimed: UserAccount = {
        id: existing.id,
        email: existing.email,
        passwordHash: hashPassword(input.password),
        status: "pending_verification",
        roles: [...existing.roles],
        vendorId: existing.vendorId,
        emailVerified: false,
        createdAt: existing.createdAt
      };
      const verificationToken = createVerificationToken();
      await runtime.persistence.identity.saveAccount({
        scope: { platformAccess: true, marketId: "sparta", requestId: `customer-register-claim:${existing.id}` },
        account: claimed
      });
      await runtime.persistence.identity.saveEmailVerification({
        scope: { platformAccess: true, marketId: "sparta", requestId: `customer-register-claim-verification:${existing.id}` },
        verification: verificationRecord(existing.id, verificationToken, input.now)
      });
      return {
        account: { id: existing.id, email: existing.email, status: claimed.status, emailVerified: false, createdAt: existing.createdAt },
        verificationToken,
        resent: false
      };
    }
    if (
      existing.status === "pending_verification" &&
      !existing.emailVerified &&
      existing.roles.includes("customer") &&
      verifyPassword(input.password, existing.passwordHash)
    ) {
      const verificationToken = createVerificationToken();
      await runtime.persistence.identity.saveEmailVerification({
        scope: { platformAccess: true, marketId: "sparta", requestId: `customer-register-resend:${existing.id}` },
        verification: verificationRecord(existing.id, verificationToken, input.now)
      });
      return {
        account: { id: existing.id, email: existing.email, status: existing.status, emailVerified: existing.emailVerified, createdAt: existing.createdAt },
        verificationToken,
        resent: true
      };
    }
    throw new Error("Email address is already registered");
  }

  const anyExisting = await runtime.sqlPool.query("SELECT 1 AS present FROM users WHERE lower(email::text)=lower($1) LIMIT 1", [email]);
  if (anyExisting.rowCount > 0) throw new Error("Email address is already registered");

  const account: UserAccount = {
    id: id("usr"),
    email,
    passwordHash: hashPassword(input.password),
    status: "pending_verification",
    roles: ["customer"],
    emailVerified: false,
    createdAt: input.now
  };
  const verificationToken = createVerificationToken();
  try {
    await runtime.persistence.identity.saveAccount({
      scope: { platformAccess: true, marketId: "sparta", requestId: `customer-register:${account.id}` },
      account
    });
    await runtime.persistence.identity.saveEmailVerification({
      scope: { platformAccess: true, marketId: "sparta", requestId: `customer-register-verification:${account.id}` },
      verification: verificationRecord(account.id, verificationToken, input.now)
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new Error("Email address is already registered");
    throw error;
  }

  return {
    account: { id: account.id, email: account.email, status: account.status, emailVerified: account.emailVerified, createdAt: account.createdAt },
    verificationToken,
    resent: false
  };
}

export async function verifyCustomerEmail(input: { token: string; now: number }): Promise<{ userId: string }> {
  const token = input.token.trim();
  if (!token) throw new Error("Email verification token is required");

  if (customerStateBackend() === "memory") {
    const account = getAccountRuntime().auth.verifyEmail(token, input.now);
    return { userId: account.id };
  }

  if (!verifyVerificationTokenSignature(token)) throw new Error("Email verification token is invalid");
  const runtime = getProductionPostgresRuntime();
  const userId = await runtime.persistence.identity.consumeEmailVerification({
    scope: { platformAccess: true, marketId: "sparta", requestId: "customer-email-verification" },
    tokenHash: tokenHash(token),
    now: input.now
  });
  return { userId };
}

export async function sendCustomerVerificationEmail(input: { userId: string; email: string; token: string; next?: string; now: number }): Promise<{ delivered: boolean; verificationUrl?: string }> {
  const verificationUrl = new URL("/verify-email", publicOrigin());
  verificationUrl.searchParams.set("token", input.token);
  const safeNext = safeRelativePath(input.next);
  if (safeNext) verificationUrl.searchParams.set("next", safeNext);

  if (process.env.BLS_EMAIL_DELIVERY_ENABLED !== "true") {
    if (process.env.NODE_ENV === "production") throw new Error("Email verification delivery is not configured");
    return { delivered: false, verificationUrl: verificationUrl.toString() };
  }

  const notification: Notification = {
    id: id("ntf"),
    userId: input.userId,
    channel: "email",
    purpose: "transactional",
    eventType: "account.email_verification",
    templateVersion: "v1",
    locale: "el",
    title: "Επιβεβαίωσε το email σου · ΚΟΝΤΑ ΜΟΥ Sparta",
    body: [
      "Καλώς ήρθες στο ΚΟΝΤΑ ΜΟΥ Sparta.",
      "",
      "Για να ενεργοποιήσεις τον λογαριασμό σου, άνοιξε τον παρακάτω ασφαλή σύνδεσμο μέσα στις επόμενες 24 ώρες:",
      verificationUrl.toString(),
      "",
      "Αν δεν δημιούργησες εσύ αυτόν τον λογαριασμό, μπορείς να αγνοήσεις το μήνυμα."
    ].join("\n"),
    payload: { userId: input.userId },
    status: "queued",
    deliveryAttempts: 0,
    createdAt: input.now
  };
  const provider = new ResendEmailProvider(resendConfigFromEnv());
  await provider.send({
    notification,
    destination: input.email,
    idempotencyKey: `account-email-verification:${input.userId}:${tokenHash(input.token).slice(0, 32)}`
  });
  return { delivered: true };
}

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email address is required");
  return normalized;
}

function createVerificationToken(): string {
  const raw = randomBytes(32).toString("base64url");
  const signature = createHmac("sha256", accountAuthSecret()).update(`email-verification:${raw}`).digest("base64url");
  return `${raw}.${signature}`;
}

function verifyVerificationTokenSignature(token: string): boolean {
  const separator = token.lastIndexOf(".");
  if (separator <= 0) return false;
  const raw = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = createHmac("sha256", accountAuthSecret()).update(`email-verification:${raw}`).digest("base64url");
  return safeStringEqual(signature, expected);
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function verificationRecord(userId: string, token: string, now: number): EmailVerification {
  return { userId, tokenHash: tokenHash(token), createdAt: now, expiresAt: now + VERIFICATION_TTL_MS };
}

function safeRelativePath(value: string | undefined): string | undefined {
  const path = value?.trim();
  return path && path.startsWith("/") && !path.startsWith("//") ? path : undefined;
}

function safeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code?: unknown }).code ?? "") : "";
  return code === "23505";
}
