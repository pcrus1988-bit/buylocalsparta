import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { id } from "../common/ids.ts";
import type { Role } from "./rbac.ts";

export type AccountStatus = "pending_verification" | "active" | "restricted" | "suspended" | "closed";

export type UserAccount = {
  id: string;
  email: string;
  passwordHash: string;
  status: AccountStatus;
  roles: Role[];
  vendorId?: string;
  emailVerified: boolean;
  createdAt: number;
};

export type AuthSession = {
  id: string;
  userId: string;
  tokenHash: string;
  csrfToken: string;
  createdAt: number;
  lastSeenAt: number;
  expiresAt: number;
};

export type EmailVerification = {
  userId: string;
  tokenHash: string;
  expiresAt: number;
  createdAt: number;
};

export type SessionPrincipal = {
  userId: string;
  email: string;
  roles: Role[];
  vendorId?: string;
  csrfToken: string;
  sessionId: string;
};

function normalizeEmail(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("A valid email address is required");
  return normalized;
}

export function hashPassword(password: string): string {
  if (password.length < 10) throw new Error("Password must be at least 10 characters");
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [scheme, saltEncoded, expectedEncoded] = encoded.split("$");
  if (scheme !== "scrypt" || !saltEncoded || !expectedEncoded) return false;
  try {
    const salt = Buffer.from(saltEncoded, "base64url");
    const expected = Buffer.from(expectedEncoded, "base64url");
    const derived = scryptSync(password, salt, expected.length);
    return expected.length === derived.length && timingSafeEqual(expected, derived);
  } catch {
    return false;
  }
}

export class InMemoryAuthService {
  readonly #accounts = new Map<string, UserAccount>();
  readonly #emailIndex = new Map<string, string>();
  readonly #sessions = new Map<string, AuthSession>();
  readonly #sessionHashIndex = new Map<string, string>();
  readonly #emailVerifications = new Map<string, EmailVerification>();
  readonly #sessionTtlMs: number;
  readonly #secret: Buffer;

  constructor(options: { secret: string; sessionTtlMs?: number }) {
    if (options.secret.length < 32) throw new Error("Authentication secret must be at least 32 characters");
    this.#secret = Buffer.from(options.secret, "utf8");
    this.#sessionTtlMs = options.sessionTtlMs ?? 12 * 60 * 60 * 1000;
  }

  register(input: {
    email: string;
    password: string;
    roles?: Role[];
    vendorId?: string;
    status?: AccountStatus;
    emailVerified?: boolean;
    now: number;
  }): Omit<UserAccount, "passwordHash"> {
    const email = normalizeEmail(input.email);
    if (this.#emailIndex.has(email)) throw new Error("Email address is already registered");
    const account: UserAccount = {
      id: id("usr"),
      email,
      passwordHash: hashPassword(input.password),
      status: input.status ?? "active",
      roles: [...new Set<Role>(input.roles ?? ["customer"])],
      vendorId: input.vendorId,
      emailVerified: input.emailVerified ?? false,
      createdAt: input.now
    };
    if (account.roles.some((role) => role.startsWith("vendor_")) && !account.vendorId) {
      throw new Error("Vendor-scoped roles require a vendorId");
    }
    this.#accounts.set(account.id, account);
    this.#emailIndex.set(email, account.id);
    return this.#publicAccount(account);
  }

  authenticate(input: { email: string; password: string; now: number }): { token: string; principal: SessionPrincipal; expiresAt: number } {
    const email = normalizeEmail(input.email);
    const accountId = this.#emailIndex.get(email);
    const account = accountId ? this.#accounts.get(accountId) : undefined;
    if (!account || !verifyPassword(input.password, account.passwordHash)) {
      throw new Error("Invalid email or password");
    }
    if (account.status !== "active") throw new Error(`Account is ${account.status}`);
    if (!account.emailVerified) throw new Error("Email address is not verified");

    const rawToken = randomBytes(32).toString("base64url");
    const token = this.#signToken(rawToken);
    const tokenHash = this.#tokenHash(token);
    const session: AuthSession = {
      id: id("ses"),
      userId: account.id,
      tokenHash,
      csrfToken: randomBytes(24).toString("base64url"),
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.now + this.#sessionTtlMs
    };
    this.#sessions.set(session.id, session);
    this.#sessionHashIndex.set(tokenHash, session.id);
    return { token, principal: this.#principal(account, session), expiresAt: session.expiresAt };
  }

  session(token: string | undefined, now: number): SessionPrincipal | undefined {
    if (!token || !this.#verifySignedToken(token)) return undefined;
    const sessionId = this.#sessionHashIndex.get(this.#tokenHash(token));
    const session = sessionId ? this.#sessions.get(sessionId) : undefined;
    if (!session) return undefined;
    if (session.expiresAt <= now) {
      this.#deleteSession(session);
      return undefined;
    }
    const account = this.#accounts.get(session.userId);
    if (!account || account.status !== "active") return undefined;
    session.lastSeenAt = now;
    return this.#principal(account, session);
  }

  assertCsrf(principal: SessionPrincipal, suppliedToken: string | undefined): void {
    if (!suppliedToken || !safeStringEqual(principal.csrfToken, suppliedToken)) throw new Error("CSRF validation failed");
  }

  logout(token: string | undefined): void {
    if (!token) return;
    const sessionId = this.#sessionHashIndex.get(this.#tokenHash(token));
    const session = sessionId ? this.#sessions.get(sessionId) : undefined;
    if (session) this.#deleteSession(session);
  }

  createEmailVerification(userId: string, now: number, ttlMs = 24 * 60 * 60 * 1000): string {
    const account = this.#accounts.get(userId);
    if (!account) throw new Error("Account not found");
    if (account.emailVerified) throw new Error("Email address is already verified");
    const rawToken = randomBytes(32).toString("base64url");
    const token = this.#signToken(rawToken);
    const tokenHash = this.#tokenHash(token);
    this.#emailVerifications.set(tokenHash, { userId, tokenHash, createdAt: now, expiresAt: now + ttlMs });
    return token;
  }

  verifyEmail(token: string, now: number): Omit<UserAccount, "passwordHash"> {
    if (!this.#verifySignedToken(token)) throw new Error("Email verification token is invalid");
    const tokenHash = this.#tokenHash(token);
    const verification = this.#emailVerifications.get(tokenHash);
    if (!verification) throw new Error("Email verification token is invalid");
    if (verification.expiresAt <= now) {
      this.#emailVerifications.delete(tokenHash);
      throw new Error("Email verification token has expired");
    }
    const account = this.#accounts.get(verification.userId);
    if (!account) throw new Error("Account not found");
    account.emailVerified = true;
    if (account.status === "pending_verification") account.status = "active";
    this.#emailVerifications.delete(tokenHash);
    return this.#publicAccount(account);
  }

  grantVendorAccess(input: { userId: string; vendorId: string; roles?: Role[] }): Omit<UserAccount, "passwordHash"> {
    const account = this.#accounts.get(input.userId);
    if (!account) throw new Error("Account not found");
    if (!input.vendorId.trim()) throw new Error("vendorId is required");
    account.vendorId = input.vendorId;
    const roles = input.roles ?? ["vendor_owner"];
    account.roles = [...new Set([...account.roles, ...roles])];
    return this.#publicAccount(account);
  }


  revokeUserSessions(userId: string): number {
    let revoked = 0;
    for (const session of [...this.#sessions.values()]) {
      if (session.userId === userId) {
        this.#deleteSession(session);
        revoked += 1;
      }
    }
    return revoked;
  }

  closeCustomerAccount(input: { userId: string; now: number }): Omit<UserAccount, "passwordHash"> {
    const account = this.#accounts.get(input.userId);
    if (!account) throw new Error("Account not found");
    if (account.roles.some((role) => role !== "customer")) throw new Error("Business or staff accounts require administrative offboarding");
    if (account.status === "closed") return this.#publicAccount(account);
    const originalEmail = account.email;
    const pseudonym = createHash("sha256").update(`${account.id}:${originalEmail}`).digest("hex").slice(0, 24);
    this.#emailIndex.delete(originalEmail);
    account.email = `closed+${pseudonym}@privacy.invalid`;
    account.status = "closed";
    account.emailVerified = false;
    this.revokeUserSessions(account.id);
    for (const [tokenHash, verification] of this.#emailVerifications) {
      if (verification.userId === account.id) this.#emailVerifications.delete(tokenHash);
    }
    return this.#publicAccount(account);
  }

  account(userId: string): Omit<UserAccount, "passwordHash"> | undefined {
    const account = this.#accounts.get(userId);
    return account ? this.#publicAccount(account) : undefined;
  }

  accounts(): readonly Omit<UserAccount, "passwordHash">[] {
    return [...this.#accounts.values()].map((account) => this.#publicAccount(account));
  }

  #signToken(rawToken: string): string {
    const signature = createHmac("sha256", this.#secret).update(rawToken).digest("base64url");
    return `${rawToken}.${signature}`;
  }

  #verifySignedToken(token: string): boolean {
    const separator = token.lastIndexOf(".");
    if (separator <= 0) return false;
    const raw = token.slice(0, separator);
    const signature = token.slice(separator + 1);
    const expected = createHmac("sha256", this.#secret).update(raw).digest("base64url");
    return safeStringEqual(signature, expected);
  }

  #tokenHash(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  #deleteSession(session: AuthSession): void {
    this.#sessions.delete(session.id);
    this.#sessionHashIndex.delete(session.tokenHash);
  }

  #principal(account: UserAccount, session: AuthSession): SessionPrincipal {
    return {
      userId: account.id,
      email: account.email,
      roles: [...account.roles],
      vendorId: account.vendorId,
      csrfToken: session.csrfToken,
      sessionId: session.id
    };
  }

  #publicAccount(account: UserAccount): Omit<UserAccount, "passwordHash"> {
    const { passwordHash: _passwordHash, ...safe } = account;
    return structuredClone(safe);
  }
}

function safeStringEqual(a: string, b: string): boolean {
  const aBuffer = Buffer.from(a, "utf8");
  const bBuffer = Buffer.from(b, "utf8");
  return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
}
