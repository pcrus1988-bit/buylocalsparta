import assert from "node:assert/strict";
import test from "node:test";
import type { SessionPrincipal } from "@buy-local-sparta/core";
import {
  ADMIN_VENDOR_IMPERSONATION_TTL_MS,
  assertVendorImpersonationCsrf,
  createVendorImpersonation,
  vendorImpersonationFromToken
} from "./vendor-impersonation.ts";

function admin(overrides: Partial<SessionPrincipal> = {}): SessionPrincipal {
  return {
    userId: "usr_admin",
    email: "admin@example.test",
    roles: ["super_admin"],
    csrfToken: "admin-csrf",
    sessionId: "ses_admin",
    ...overrides
  };
}

test("super admin can create a vendor-owner impersonation bound to the real admin session", () => {
  const now = 1_800_000_000_000;
  const actor = admin();
  const created = createVendorImpersonation(actor, "vendor_123", now);
  const resolved = vendorImpersonationFromToken(created.token, actor, now + 1_000);

  assert.ok(resolved);
  assert.equal(resolved.vendorId, "vendor_123");
  assert.equal(resolved.principal.vendorId, "vendor_123");
  assert.equal(resolved.principal.userId, actor.userId);
  assert.equal(resolved.principal.email, actor.email);
  assert.deepEqual(resolved.principal.roles, ["vendor_owner"]);
  assert.match(resolved.principal.sessionId, /^imp_/);
  assert.equal(created.expiresAt, now + ADMIN_VENDOR_IMPERSONATION_TTL_MS);
  assert.doesNotThrow(() => assertVendorImpersonationCsrf(resolved.principal, resolved.principal.csrfToken));
});

test("impersonation is invalid when the admin session changes, expires or the token is altered", () => {
  const now = 1_800_000_000_000;
  const actor = admin();
  const created = createVendorImpersonation(actor, "vendor_123", now);

  assert.equal(
    vendorImpersonationFromToken(created.token, admin({ sessionId: "ses_other" }), now + 1_000),
    undefined
  );
  assert.equal(
    vendorImpersonationFromToken(created.token, actor, created.expiresAt),
    undefined
  );
  assert.equal(
    vendorImpersonationFromToken(`${created.token.slice(0, -1)}x`, actor, now + 1_000),
    undefined
  );
});

test("only platform super admins can create vendor impersonation sessions", () => {
  const now = 1_800_000_000_000;
  assert.throws(
    () => createVendorImpersonation(admin({ roles: ["vendor_operations"] }), "vendor_123", now),
    /SUPER_ADMIN_REQUIRED/
  );
  assert.throws(
    () => createVendorImpersonation(admin({ vendorId: "vendor_admin" }), "vendor_123", now),
    /SUPER_ADMIN_REQUIRED/
  );
});

test("impersonated vendor writes still require the impersonation CSRF token", () => {
  const now = 1_800_000_000_000;
  const actor = admin();
  const created = createVendorImpersonation(actor, "vendor_123", now);
  const resolved = vendorImpersonationFromToken(created.token, actor, now + 1_000);
  assert.ok(resolved);
  assert.throws(
    () => assertVendorImpersonationCsrf(resolved.principal, "wrong-token"),
    /CSRF validation failed/
  );
});
