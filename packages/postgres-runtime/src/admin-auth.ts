import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import {
  verifyPassword,
  type AuthSession,
  type DatabaseScope,
  type PostgresIdentityRepository,
  type Role,
  type SessionPrincipal
} from "@buy-local-sparta/core";

const PLATFORM_ROLES = new Set<Role>([
  "super_admin",
  "vendor_operations",
  "catalog_qa",
  "customer_support",
  "platform_finance",
  "content_seo",
  "compliance",
  "logistics",
  "auditor"
]);

function isPlatformRole(role: Role): boolean { return PLATFORM_ROLES.has(role); }

export class PostgresAdminAuthService {
  readonly #identity: PostgresIdentityRepository;
  readonly #secret: Buffer;
  readonly #sessionTtlMs: number;

  constructor(input: { identity: PostgresIdentityRepository; secret: string; sessionTtlMs?: number }) {
    if (input.secret.length < 32) throw new Error("Authentication secret must be at least 32 characters");
    this.#identity = input.identity;
    this.#secret = Buffer.from(input.secret, "utf8");
    this.#sessionTtlMs = input.sessionTtlMs ?? 6 * 60 * 60 * 1000;
  }

  async authenticate(input: { email: string; password: string; now: number }): Promise<{ token: string; principal: SessionPrincipal; expiresAt: number }> {
    const account = await this.#identity.findAccountForAuthentication(input.email);
    if (!account || !verifyPassword(input.password, account.passwordHash)) throw new Error("Invalid email or password");
    if (account.status !== "active") throw new Error(`Account is ${account.status}`);
    if (!account.emailVerified) throw new Error("Email address is not verified");
    const platformRoles = account.roles.filter(isPlatformRole);
    if (!platformRoles.length || account.vendorId) throw new Error("Platform account access is required");

    const rawToken = randomBytes(32).toString("base64url");
    const token = this.#signToken(rawToken);
    const csrfToken = this.#csrfForToken(token);
    const session: AuthSession = {
      id: `ases_${randomBytes(16).toString("hex")}`,
      userId: account.id,
      tokenHash: this.#tokenHash(token),
      csrfToken,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: input.now + this.#sessionTtlMs
    };
    await this.#identity.saveSession({ scope: platformScope(account.id), session });
    return {
      token,
      expiresAt: session.expiresAt,
      principal: {
        userId: account.id,
        email: account.email,
        roles: [...platformRoles],
        csrfToken,
        sessionId: session.id
      }
    };
  }

  async session(token: string | undefined, now: number): Promise<SessionPrincipal | undefined> {
    if (!token || !this.#verifySignedToken(token)) return undefined;
    const persisted = await this.#identity.findSession({ tokenHash: this.#tokenHash(token), now });
    if (!persisted || persisted.vendorId) return undefined;
    const platformRoles = persisted.roles.filter(isPlatformRole);
    if (!platformRoles.length) return undefined;
    const csrfToken = this.#csrfForToken(token);
    if (!await this.#identity.verifyCsrf({ sessionId: persisted.sessionId, csrfToken, now })) return undefined;
    await this.#identity.touchSession({ sessionId: persisted.sessionId, now });
    return {
      userId: persisted.userId,
      email: persisted.email,
      roles: [...platformRoles],
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
    if (!persisted || persisted.vendorId || !persisted.roles.some(isPlatformRole)) return;
    await this.#identity.revokeSession({ scope: platformScope(persisted.userId), sessionId: persisted.sessionId });
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

export function platformScope(userId: string, requestId?: string): DatabaseScope {
  return { actorUserId: userId, marketId: "sparta", platformAccess: true, requestId };
}

function safeStringEqual(a: string, b: string): boolean {
  const aa = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
