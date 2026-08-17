import { strict as assert } from "node:assert";
import {
  assertDatabaseLessPreviewCsrf,
  createDatabaseLessPreviewSession,
  databaseLessPreviewSessionEnabled,
  databaseLessPreviewSessionFromToken,
  previewCredentialMatches
} from "../apps/web/src/lib/preview-auth.ts";

const previous = { ...process.env };
try {
  process.env.NODE_ENV = "production";
  delete process.env.DATABASE_URL;
  process.env.BLS_ALLOW_DATABASELESS_PREVIEW = "true";
  process.env.BLS_ENABLE_DEMO_ACCOUNTS = "true";
  process.env.BLS_ALLOW_EPHEMERAL_ACCOUNT_RUNTIME = "true";
  process.env.BLS_AUTH_SECRET = "preview-auth-test-secret-at-least-32-characters";

  assert.equal(databaseLessPreviewSessionEnabled("customer"), true);
  assert.equal(previewCredentialMatches("Customer!123", "Customer!123"), true);
  assert.equal(previewCredentialMatches("wrong", "Customer!123"), false);

  const now = 1_800_000_000_000;
  const created = createDatabaseLessPreviewSession({
    kind: "customer",
    userId: "preview_customer",
    email: "Customer@Demo.Local",
    roles: ["customer"],
    now,
    ttlMs: 60_000
  });
  assert.equal(created.principal.email, "customer@demo.local");
  assert.equal(databaseLessPreviewSessionFromToken(created.token, "customer", now + 1_000)?.sessionId, created.principal.sessionId);
  assert.equal(databaseLessPreviewSessionFromToken(created.token, "vendor", now + 1_000), undefined);
  assert.equal(databaseLessPreviewSessionFromToken(created.token, "customer", now + 60_001), undefined);
  assert.equal(databaseLessPreviewSessionFromToken(`${created.token.slice(0, -1)}x`, "customer", now + 1_000), undefined);
  assert.doesNotThrow(() => assertDatabaseLessPreviewCsrf(created.principal, created.principal.csrfToken));
  assert.throws(() => assertDatabaseLessPreviewCsrf(created.principal, "bad-token"), /CSRF validation failed/);

  process.env.DATABASE_URL = "postgres://configured";
  assert.equal(databaseLessPreviewSessionEnabled("customer"), false);

  console.log("Database-less Vercel preview authentication verified: signed round-trip, tamper/expiry/kind rejection, CSRF, DB precedence.");
} finally {
  for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
  for (const [key, value] of Object.entries(previous)) process.env[key] = value;
}
