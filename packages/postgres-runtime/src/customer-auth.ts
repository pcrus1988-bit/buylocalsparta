import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  verifyPassword,
  type AuthSession,
  type DatabaseScope,
  type PostgresIdentityRepository,
  type SessionPrincipal,
  type SqlPool,
  type SqlRow
} from "@buy-local-sparta/core";

export class PostgresCustomerAuthService {
  readonly #identity: PostgresIdentityRepository;
  readonly #secret: Buffer;
  readonly #sessionTtlMs: number;

  constructor(input: { identity: PostgresIdentityRepository; secret: string; sessionTtlMs?: number }) {
    if (input.secret.length < 32) throw new Error("Authentication secret must be at least 32 characters");
    this.#identity = input.identity;
    this.#secret = Buffer.from(input.secret, "utf8");
    this.#sessionTtlMs = input.sessionTtlMs ?? 12 * 60 * 60 * 1000;
  }

  async authenticate(input: { email: string; password: string; now: number }): Promise<{ token: string; principal: SessionPrincipal; expiresAt: number }> {
    const account = await this.#identity.findAccountForAuthentication(input.email);
    if (!account) rejectLogin("account_not_found", input.email);
    if (!verifyPassword(input.password, account.passwordHash)) rejectLogin("password_mismatch", input.email, account.id);
    if (account.status !== "active") rejectLogin(`account_status_${account.status}`, input.email, account.id);
    if (!account.emailVerified) rejectLogin("email_not_verified", input.email, account.id);
    if (!account.roles.includes("customer")) rejectLogin("customer_role_missing", input.email, account.id);

    const rawToken = randomBytes(32).toString("base64url");
    const token = this.#signToken(rawToken);
    const csrfToken = this.#csrfForToken(token);
    const session: AuthSession = {
      id: `ses_${randomBytes(16).toString("hex")}`,
      userId: account.id,
      tokenHash: this.#tokenHash(token),
      csrfToken,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.now + this.#sessionTtlMs
    };
    await this.#identity.saveSession({ scope: customerScope(account.id), session });
    return {
      token,
      expiresAt: session.expiresAt,
      principal: {
        userId: account.id,
        email: account.email,
        roles: [...account.roles],
        vendorId: account.vendorId,
        csrfToken,
        sessionId: session.id
      }
    };
  }

  async session(token: string | undefined, now: number): Promise<SessionPrincipal | undefined> {
    if (!token || !this.#verifySignedToken(token)) return undefined;
    const persisted = await this.#identity.findSession({ tokenHash: this.#tokenHash(token), now });
    if (!persisted || !persisted.roles.includes("customer")) return undefined;
    const csrfToken = this.#csrfForToken(token);
    if (!await this.#identity.verifyCsrf({ sessionId: persisted.sessionId, csrfToken, now })) return undefined;
    await this.#identity.touchSession({ sessionId: persisted.sessionId, now });
    return {
      userId: persisted.userId,
      email: persisted.email,
      roles: [...persisted.roles],
      vendorId: persisted.vendorId,
      csrfToken,
      sessionId: persisted.sessionId
    };
  }

  assertCsrf(principal: SessionPrincipal, suppliedToken: string | undefined): void {
    if (!suppliedToken || !safeStringEqual(principal.csrfToken, suppliedToken)) throw new Error("CSRF validation failed");
  }

  async logout(token: string | undefined, now = Date.now()): Promise<void> {
    if (!token || !this.#verifySignedToken(token)) return;
    const persisted = await this.#identity.findSession({ tokenHash: this.#tokenHash(token), now });
    if (!persisted) return;
    await this.#identity.revokeSession({ scope: customerScope(persisted.userId), sessionId: persisted.sessionId });
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

  #csrfForToken(token: string): string {
    return createHmac("sha256", this.#secret).update(`csrf:${token}`).digest("base64url");
  }
}

export function customerScope(userId: string, requestId?: string): DatabaseScope {
  return { actorUserId: userId, marketId: "sparta", requestId };
}

function rejectLogin(reason: string, email: string, userId?: string): never {
  console.warn(JSON.stringify({
    level: "warning",
    event: "auth.customer.login_rejected",
    reason,
    emailHash: createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16),
    ...(userId ? { userId } : {})
  }));
  throw new Error("Invalid email or password");
}

function safeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

export type RateLimitDecision = Readonly<{ allowed: boolean; remaining: number; retryAfterMs: number }>;

export class PostgresFixedWindowRateLimiter {
  readonly #db: SqlPool;
  constructor(db: SqlPool) { this.#db = db; }

  async consume(input: { route: string; key: string; limit: number; windowMs: number; now: number }): Promise<RateLimitDecision> {
    if (!input.route.trim() || !input.key.trim()) throw new Error("Rate-limit route and key are required");
    if (!Number.isSafeInteger(input.limit) || input.limit <= 0) throw new Error("Rate-limit limit must be a positive integer");
    if (!Number.isSafeInteger(input.windowMs) || input.windowMs <= 0) throw new Error("Rate-limit window must be a positive integer");
    const keyHash = createHash("sha256").update(`${input.route}:${input.key}`).digest("hex");
    const now = new Date(input.now);
    const cutoff = new Date(input.now - input.windowMs);
    const result = await this.#db.query<SqlRow>(`
      INSERT INTO auth_rate_limit_windows (route,key_hash,window_started_at,attempts,updated_at)
      VALUES ($1,$2,$3,1,$3)
      ON CONFLICT (route,key_hash) DO UPDATE SET
        attempts = CASE WHEN auth_rate_limit_windows.window_started_at <= $4 THEN 1 ELSE auth_rate_limit_windows.attempts + 1 END,
        window_started_at = CASE WHEN auth_rate_limit_windows.window_started_at <= $4 THEN $3 ELSE auth_rate_limit_windows.window_started_at END,
        updated_at = $3
      RETURNING attempts, window_started_at
    `, [input.route, keyHash, now, cutoff]);
    const row = result.rows[0];
    const attempts = Number(row?.attempts ?? 1);
    const startedAt = new Date(String(row?.window_started_at ?? now.toISOString())).getTime();
    const retryAfterMs = Math.max(0, input.windowMs - (input.now - startedAt));
    return {
      allowed: attempts <= input.limit,
      remaining: Math.max(0, input.limit - attempts),
      retryAfterMs: attempts <= input.limit ? 0 : retryAfterMs
    };
  }

  async purge(before: number): Promise<number> {
    const result = await this.#db.query<SqlRow>("DELETE FROM auth_rate_limit_windows WHERE updated_at < $1 RETURNING 1 AS removed", [new Date(before)]);
    return result.rowCount;
  }
}
