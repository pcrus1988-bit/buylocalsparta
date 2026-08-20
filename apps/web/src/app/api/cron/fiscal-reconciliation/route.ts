import { createHash, timingSafeEqual } from "node:crypto";
import { runCustomerFiscalReconciliationSweep } from "../../../../lib/customer-fiscal-reconciliation-sweep";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_SCHEDULER_TOKEN_SHA256 = "cb8f8336c633017d741485067b71ccf9c5038df74c3bbdd3bbdd48f2c706a74d";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization");
  const privateSchedulerToken = request.headers.get("x-bls-fiscal-cron-token")?.trim() ?? "";

  // Prefer Vercel's CRON_SECRET whenever it is configured. Until then, the production
  // scheduler authenticates with a private token stored only in Supabase Vault. Only the
  // token's SHA-256 digest is committed to this public repository.
  const authorized = secret
    ? authorization === `Bearer ${secret}`
    : matchesPrivateSchedulerToken(privateSchedulerToken);

  if (!authorized) {
    console.warn(JSON.stringify({
      level: "warning",
      event: "customer_tax.reconciliation_cron_unauthorized",
      secretConfigured: Boolean(secret),
      privateSchedulerTokenPresent: Boolean(privateSchedulerToken)
    }));
    return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  }

  try {
    const fiscal = await runCustomerFiscalReconciliationSweep(Date.now());
    console.info(JSON.stringify({
      level: "info",
      event: "customer_tax.reconciliation_cron_completed",
      authMode: secret ? "vercel_bearer" : "supabase_vault_token",
      ...fiscal
    }));
    return Response.json({ ok: true, fiscal }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AADE reconciliation cron failed";
    console.error(JSON.stringify({ level: "error", event: "customer_tax.reconciliation_cron_failed", message }));
    return Response.json({ error: message }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}

function matchesPrivateSchedulerToken(value: string): boolean {
  if (!value) return false;
  const actual = createHash("sha256").update(value, "utf8").digest();
  const expected = Buffer.from(PRIVATE_SCHEDULER_TOKEN_SHA256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
