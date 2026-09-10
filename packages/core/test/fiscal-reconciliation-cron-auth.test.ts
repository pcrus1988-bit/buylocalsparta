import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { authorizeFiscalReconciliationCron } from "../../../apps/web/src/lib/fiscal-reconciliation-cron-auth.ts";

const cronSecret = "test-vercel-cron-secret";
const privateSchedulerToken = "test-supabase-vault-token";
const privateSchedulerTokenSha256 = createHash("sha256").update(privateSchedulerToken, "utf8").digest("hex");

function request(headers: Record<string, string> = {}) {
  return new Request("https://kontamou.site/api/cron/fiscal-reconciliation", { headers });
}

test("fiscal reconciliation cron accepts the configured Vercel bearer", () => {
  assert.equal(
    authorizeFiscalReconciliationCron(
      request({ authorization: `Bearer ${cronSecret}` }),
      cronSecret,
      privateSchedulerTokenSha256
    ),
    "vercel_bearer"
  );
});

test("fiscal reconciliation cron accepts the private scheduler token even when CRON_SECRET is configured", () => {
  assert.equal(
    authorizeFiscalReconciliationCron(
      request({ "x-bls-fiscal-cron-token": privateSchedulerToken }),
      cronSecret,
      privateSchedulerTokenSha256
    ),
    "supabase_vault_token"
  );
});

test("fiscal reconciliation cron accepts the private scheduler token when no Vercel secret is configured", () => {
  assert.equal(
    authorizeFiscalReconciliationCron(
      request({ "x-bls-fiscal-cron-token": privateSchedulerToken }),
      "",
      privateSchedulerTokenSha256
    ),
    "supabase_vault_token"
  );
});

test("fiscal reconciliation cron falls through from an invalid bearer to a valid private scheduler token", () => {
  assert.equal(
    authorizeFiscalReconciliationCron(
      request({
        authorization: "Bearer wrong-secret",
        "x-bls-fiscal-cron-token": privateSchedulerToken
      }),
      cronSecret,
      privateSchedulerTokenSha256
    ),
    "supabase_vault_token"
  );
});

test("fiscal reconciliation cron rejects invalid or missing credentials", () => {
  assert.equal(
    authorizeFiscalReconciliationCron(
      request({
        authorization: "Bearer wrong-secret",
        "x-bls-fiscal-cron-token": "wrong-private-token"
      }),
      cronSecret,
      privateSchedulerTokenSha256
    ),
    null
  );
  assert.equal(
    authorizeFiscalReconciliationCron(request(), cronSecret, privateSchedulerTokenSha256),
    null
  );
});
