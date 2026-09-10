import { createHash, timingSafeEqual } from "node:crypto";

export type FiscalReconciliationCronAuthMode = "vercel_bearer" | "supabase_vault_token";

const PRIVATE_SCHEDULER_TOKEN_SHA256 = "f2441f8d920cf39943b4516d4f567e8f653d1991205b0d3149f618666fba19b4";

export function authorizeFiscalReconciliationCron(
  request: Request,
  cronSecret: string | undefined = process.env.CRON_SECRET,
  privateSchedulerTokenSha256 = PRIVATE_SCHEDULER_TOKEN_SHA256
): FiscalReconciliationCronAuthMode | null {
  const secret = cronSecret?.trim() ?? "";
  const authorization = request.headers.get("authorization") ?? "";

  if (secret && matchesExactValue(authorization, `Bearer ${secret}`)) {
    return "vercel_bearer";
  }

  const privateSchedulerToken = request.headers.get("x-bls-fiscal-cron-token")?.trim() ?? "";
  if (matchesPrivateSchedulerToken(privateSchedulerToken, privateSchedulerTokenSha256)) {
    return "supabase_vault_token";
  }

  return null;
}

function matchesPrivateSchedulerToken(value: string, expectedSha256: string): boolean {
  if (!value || !/^[a-f0-9]{64}$/i.test(expectedSha256)) return false;
  const actual = createHash("sha256").update(value, "utf8").digest();
  const expected = Buffer.from(expectedSha256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function matchesExactValue(actualValue: string, expectedValue: string): boolean {
  if (!actualValue || !expectedValue) return false;
  const actual = Buffer.from(actualValue, "utf8");
  const expected = Buffer.from(expectedValue, "utf8");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
