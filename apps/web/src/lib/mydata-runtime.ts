import { AadeMyDataClient, myDataConfigured, myDataConfigFromEnv, myDataIssuanceEnabled, type MyDataConfig } from "@buy-local-sparta/aade-mydata";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const VAULT_USER_NAME = "bls_aade_mydata_user_id";
const VAULT_KEY_NAME = "bls_aade_mydata_subscription_key";

type ResolvedMyDataConfig = Readonly<{ config: MyDataConfig; credentialSource: "environment" | "supabase_vault" }>;

export async function resolveMyDataDiagnosticConfig(): Promise<ResolvedMyDataConfig | undefined> {
  if (myDataConfigured(process.env)) {
    return { config: myDataConfigFromEnv(process.env), credentialSource: "environment" };
  }
  if (!productionDatabaseConfigured()) return undefined;

  const result = await getProductionPostgresRuntime().nativePool.query<{ name: string; decrypted_secret: string }>(
    `SELECT name, decrypted_secret
       FROM vault.decrypted_secrets
      WHERE name = ANY($1::text[])`,
    [[VAULT_USER_NAME, VAULT_KEY_NAME]]
  );
  const values = new Map(result.rows.map((row) => [row.name, row.decrypted_secret]));
  const userId = values.get(VAULT_USER_NAME)?.trim();
  const subscriptionKey = values.get(VAULT_KEY_NAME)?.trim();
  if (!userId || !subscriptionKey) return undefined;

  const environment = process.env.AADE_MYDATA_ENVIRONMENT === "test" ? "test" : "production";
  const defaultBaseUrl = environment === "production" ? "https://mydatapi.aade.gr/myDATA" : "https://mydataapidev.aade.gr";
  const requestTimeoutMs = positiveInteger(process.env.AADE_MYDATA_REQUEST_TIMEOUT_MS, 15_000);
  return {
    credentialSource: "supabase_vault",
    config: {
      environment,
      baseUrl: (process.env.AADE_MYDATA_BASE_URL?.trim() || defaultBaseUrl).replace(/\/+$/, ""),
      userId,
      subscriptionKey,
      requestTimeoutMs,
      specVersion: process.env.AADE_MYDATA_SPEC_VERSION?.trim() || "2.0.2"
    }
  };
}

export async function myDataReadiness() {
  const enabled = myDataIssuanceEnabled(process.env);
  try {
    const resolved = await resolveMyDataDiagnosticConfig();
    if (!resolved) return { enabled, configured: false, ready: !enabled, message: enabled ? "AADE myDATA credentials are missing" : "AADE myDATA issuance is gated and API credentials are not configured" };
    const { config, credentialSource } = resolved;
    if (!enabled) return { enabled: false, configured: true, ready: true, environment: config.environment, specVersion: config.specVersion, credentialSource, message: "AADE myDATA API credentials are configured for read-only diagnostics; invoice issuance remains gated" };
    if (!process.env.BLS_MYDATA_MAPPING_VERSION?.trim()) return { enabled: true, configured: true, ready: false, environment: config.environment, specVersion: config.specVersion, credentialSource, message: "BLS_MYDATA_MAPPING_VERSION is required" };
    if (!process.env.DATABASE_URL?.trim()) return { enabled: true, configured: true, ready: false, environment: config.environment, specVersion: config.specVersion, credentialSource, message: "AADE myDATA issuance requires PostgreSQL" };
    if (!getProductionPostgresRuntime().myData) return { enabled: true, configured: true, ready: false, environment: config.environment, specVersion: config.specVersion, credentialSource, message: "AADE myDATA issuance runtime requires dedicated Vercel environment credentials; Vault fallback is diagnostics-only" };
    return { enabled: true, configured: true, ready: true, environment: config.environment, specVersion: config.specVersion, credentialSource, message: "AADE myDATA ERP transport is configured; accounting mapping is deployment-controlled" };
  } catch (error) {
    return { enabled, configured: false, ready: !enabled, message: error instanceof Error ? redactDiagnosticError(error.message) : "AADE myDATA readiness failed" };
  }
}

export async function myDataConnectivityCheck() {
  const resolved = await resolveMyDataDiagnosticConfig();
  if (!resolved) throw new Error("AADE myDATA credentials are not configured");
  const client = new AadeMyDataClient(resolved.config);
  const checkedAt = Date.now();
  const today = aadeDate(new Date(checkedAt));
  try {
    const xml = await client.requestTransmittedDocs({ mark: "0", dateFrom: today, dateTo: today });
    return {
      ok: true as const,
      readOnly: true as const,
      operation: "RequestTransmittedDocs" as const,
      environment: client.environment,
      specVersion: client.specVersion,
      credentialSource: resolved.credentialSource,
      checkedAt,
      responseBytes: Buffer.byteLength(xml, "utf8")
    };
  } catch (error) {
    throw new Error(redactDiagnosticError(error instanceof Error ? error.message : "AADE myDATA connectivity check failed"));
  }
}

function aadeDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${value.day}/${value.month}/${value.year}`;
}

function positiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function redactDiagnosticError(message: string): string {
  return message
    .replace(/ocp-apim-subscription-key\s*[:=]\s*[^\s,;]+/gi, "ocp-apim-subscription-key=[redacted]")
    .replace(/aade-user-id\s*[:=]\s*[^\s,;]+/gi, "aade-user-id=[redacted]")
    .slice(0, 1000);
}
