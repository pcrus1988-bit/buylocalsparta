import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  verifyPassword,
  type AuthSession,
  type DatabaseScope,
  type PostgresIdentityRepository,
  type SessionPrincipal
} from "@buy-local-sparta/core";

const isVendorRole = (role: string) => role.startsWith("vendor_");

export class PostgresVendorAuthService {
  readonly #identity: PostgresIdentityRepository;
  readonly #secret: Buffer;
  readonly #sessionTtlMs: number;

  constructor(input: { identity: PostgresIdentityRepository; secret: string; sessionTtlMs?: number }) {
    if (input.secret.length < 32) throw new Error("Authentication secret must be at least 32 characters");
    this.#identity = input.identity;
    this.#secret = Buffer.from(input.secret, "utf8");
    this.#sessionTtlMs = input.sessionTtlMs ?? 8 * 60 * 60 * 1000;
  }

  async authenticate(input: { email: string; password: string; now: number }): Promise<{ token: string; principal: SessionPrincipal; expiresAt: number }> {
    const account = await this.#identity.findAccountForAuthentication(input.email);
    if (!account || !verifyPassword(input.password, account.passwordHash)) throw new Error("Invalid email or password");
    if (account.status !== "active") throw new Error(`Account is ${account.status}`);
    if (!account.emailVerified) throw new Error("Email address is not verified");
    if (!account.vendorId || !account.roles.some(isVendorRole)) throw new Error("Vendor account access is required");

    const rawToken = randomBytes(32).toString("base64url");
    const token = this.#signToken(rawToken);
    const csrfToken = this.#csrfForToken(token);
    const session: AuthSession = {
      id: `vses_${randomBytes(16).toString("hex")}`,
      userId: account.id,
      tokenHash: this.#tokenHash(token),
      csrfToken,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.now + this.#sessionTtlMs
    };
    await this.#identity.saveSession({ scope: vendorScope(account.id, account.vendorId), session });
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
    if (!persisted?.vendorId || !persisted.roles.some(isVendorRole)) return undefined;
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
    if (!persisted?.vendorId) return;
    await this.#identity.revokeSession({ scope: vendorScope(persisted.userId, persisted.vendorId), sessionId: persisted.sessionId });
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

  #tokenHash(token: string): string { return createHash("sha256").update(token).digest("hex"); }
  #csrfForToken(token: string): string { return createHmac("sha256", this.#secret).update(`csrf:${token}`).digest("base64url"); }
}

export function vendorScope(userId: string, vendorId: string, requestId?: string): DatabaseScope {
  return { actorUserId: userId, vendorId, marketId: "sparta", requestId };
}

function safeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
