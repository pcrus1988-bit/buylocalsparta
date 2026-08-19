import { randomUUID } from "node:crypto";
import { createPostgresRuntimeFromEnv, PostgresCustomerAuthService } from "../packages/postgres-runtime/src/index.ts";
import { accountAuthSecret } from "../apps/web/src/lib/account-runtime.ts";
import { registerCustomer, verifyCustomerEmail } from "../apps/web/src/lib/customer-registration-runtime.ts";
import { provisionalVendorApplicantPasswordHash } from "../apps/web/src/lib/provisional-account.ts";

const runtime = createPostgresRuntimeFromEnv({ applicationName: "buy-local-sparta-customer-claim-smoke" });
const now = Date.now();
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const userId = `usr_claim_smoke_${suffix}`;
const email = `claim-smoke-${suffix}@example.test`;
const password = "ClaimedCustomer!12345";

try {
  await runtime.persistence.identity.saveAccount({
    scope: { marketId: "sparta", platformAccess: true, requestId: `claim-smoke-seed-${suffix}` },
    account: {
      id: userId,
      email,
      passwordHash: provisionalVendorApplicantPasswordHash(),
      status: "pending_verification",
      roles: ["customer"],
      emailVerified: false,
      createdAt: now
    }
  });

  const registration = await registerCustomer({ email, password, now: now + 10 });
  if (registration.resent) throw new Error("Provisional account claim was treated as a resend instead of a first real registration");
  if (registration.account.id !== userId) throw new Error("Provisional account claim created a different identity instead of preserving ownership");

  await verifyCustomerEmail({ token: registration.verificationToken, now: now + 20 });
  const account = await runtime.persistence.identity.findAccountForAuthentication(email);
  if (!account || !account.emailVerified || account.status !== "active") throw new Error("Claimed customer was not activated after email verification");

  const auth = new PostgresCustomerAuthService({ identity: runtime.persistence.identity, secret: accountAuthSecret() });
  const login = await auth.authenticate({ email, password, now: now + 30 });
  if (login.principal.userId !== userId || !login.principal.roles.includes("customer")) throw new Error("Claimed customer could not authenticate with the registration password");

  console.log(JSON.stringify({ ok: true, provisionalCustomerClaimLogin: true, userId }, null, 2));
} finally {
  try {
    await runtime.sqlPool.query("DELETE FROM user_sessions WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM email_verification_tokens WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM password_reset_tokens WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM customer_profiles WHERE user_id=(SELECT id FROM users WHERE public_id=$1)", [userId]);
    await runtime.sqlPool.query("DELETE FROM users WHERE public_id=$1", [userId]);
  } catch {}
  await runtime.close();
}
