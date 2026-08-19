import { AadeMyDataClient, myDataConfigured, myDataConfigFromEnv, type MyDataConfig, type MyDataEnvironment } from "@buy-local-sparta/aade-mydata";
import { PostgresMyDataService } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const VAULT_USER_NAME = "bls_aade_mydata_user_id";
const VAULT_KEY_NAME = "bls_aade_mydata_subscription_key";
const CONNECTIVITY_PROBE_KEY = "mydata.production_connectivity_probe";
export const MYDATA_ADMIN_CONFIG_KEY = "mydata.admin_runtime_config";

type ResolvedMyDataConfig = Readonly<{ config: MyDataConfig; credentialSource: "environment" | "supabase_vault" }>;
type ProbeSnapshot = Readonly<{ state: "armed" | "running" | "succeeded" | "failed"; checkedAt?: number; environment?: string; specVersion?: string; responseBytes?: number; error?: string }>;
type ApprovedPolicy = Readonly<{ version:string; fiscalisationRoute:"viva_fiscal_provider"|"aade_direct_erp"; compatibilityTarget:string }>;

export type MyDataAdminRuntimeConfig = Readonly<{
  environment: MyDataEnvironment;
  baseUrl: string;
  specVersion: string;
  requestTimeoutMs: number;
  issuanceEnabled: boolean;
  ecrTokenEnabled: boolean;
  vivaFiscalEnabled: boolean;
  mappingVersionPin?: string;
  capturePaidOrders: boolean;
  emailAcceptedDocuments: boolean;
  updatedAt?: number;
}>;

export async function myDataAdminRuntimeConfig(): Promise<MyDataAdminRuntimeConfig> {
  const fallback = defaultAdminRuntimeConfig();
  if (!productionDatabaseConfigured()) return fallback;
  const db = getProductionPostgresRuntime().nativePool;
  const result = await db.query<{ value: unknown; updated_at: Date }>(
    `SELECT s.value,s.updated_at FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.key=$2 LIMIT 1`,
    [marketCode(), MYDATA_ADMIN_CONFIG_KEY]
  );
  const row = result.rows[0];
  if (!row) return fallback;
  return normalizeAdminRuntimeConfig(row.value, fallback, row.updated_at?.getTime());
}

export async function updateMyDataAdminRuntimeConfig(input: {
  environment: MyDataEnvironment;
  specVersion: string;
  requestTimeoutMs: number;
  issuanceEnabled: boolean;
  ecrTokenEnabled: boolean;
  vivaFiscalEnabled: boolean;
  mappingVersionPin?: string;
  capturePaidOrders: boolean;
  emailAcceptedDocuments: boolean;
}): Promise<MyDataAdminRuntimeConfig> {
  if (!productionDatabaseConfigured()) throw new Error("AADE runtime configuration requires PostgreSQL");
  const environment = input.environment === "test" ? "test" : input.environment === "production" ? "production" : (()=>{throw new Error("AADE environment must be test or production")})();
  const specVersion = input.specVersion.trim();
  if (!/^\d+\.\d+\.\d+$/.test(specVersion)) throw new Error("AADE specification version must use x.y.z format");
  if (!Number.isSafeInteger(input.requestTimeoutMs) || input.requestTimeoutMs < 1000 || input.requestTimeoutMs > 60000) throw new Error("AADE timeout must be between 1000 and 60000 ms");
  if (input.issuanceEnabled && process.env.NODE_ENV === "production" && environment !== "production") throw new Error("Live BLS cannot enable fiscal issuance against the AADE test environment");
  if (input.issuanceEnabled && !input.ecrTokenEnabled && !input.vivaFiscalEnabled) throw new Error("Fiscal issuance requires an enabled ECRToken or Viva Fiscal capability");
  const value = {
    environment,
    baseUrl: officialBaseUrl(environment),
    specVersion,
    requestTimeoutMs: input.requestTimeoutMs,
    issuanceEnabled: Boolean(input.issuanceEnabled),
    ecrTokenEnabled: Boolean(input.ecrTokenEnabled),
    vivaFiscalEnabled: Boolean(input.vivaFiscalEnabled),
    mappingVersionPin: input.mappingVersionPin?.trim() || null,
    capturePaidOrders: Boolean(input.capturePaidOrders),
    emailAcceptedDocuments: Boolean(input.emailAcceptedDocuments),
    updatedAt: Date.now()
  };
  const db = getProductionPostgresRuntime().nativePool;
  await db.query(
    `INSERT INTO system_settings(market_id,key,value,version,updated_at)
     SELECT m.id,$2,$3::jsonb,1,clock_timestamp() FROM markets m WHERE m.code=$1
     ON CONFLICT (market_id,key) DO UPDATE SET value=EXCLUDED.value,version=system_settings.version+1,updated_at=clock_timestamp()`,
    [marketCode(), MYDATA_ADMIN_CONFIG_KEY, JSON.stringify(value)]
  );
  return myDataAdminRuntimeConfig();
}

export async function updateMyDataVaultCredentials(input: { userId?: string; subscriptionKey?: string }): Promise<{ userIdUpdated:boolean; subscriptionKeyUpdated:boolean }> {
  if (!productionDatabaseConfigured()) throw new Error("AADE credential management requires PostgreSQL/Supabase Vault");
  const userId = input.userId?.trim();
  const subscriptionKey = input.subscriptionKey?.trim();
  if (!userId && !subscriptionKey) throw new Error("Enter at least one AADE credential to update");
  if (userId && userId.length < 3) throw new Error("AADE user id is too short");
  if (subscriptionKey && subscriptionKey.length < 12) throw new Error("AADE subscription key is too short");
  const db = getProductionPostgresRuntime().nativePool;
  if (userId) await upsertVaultSecret(db, VAULT_USER_NAME, userId, "KONTA MOY AADE myDATA user id managed from Admin");
  if (subscriptionKey) await upsertVaultSecret(db, VAULT_KEY_NAME, subscriptionKey, "KONTA MOY AADE myDATA subscription key managed from Admin");
  return { userIdUpdated:Boolean(userId), subscriptionKeyUpdated:Boolean(subscriptionKey) };
}

export async function resolveMyDataDiagnosticConfig(): Promise<ResolvedMyDataConfig | undefined> {
  const runtimeConfig = await myDataAdminRuntimeConfig();
  let userId: string | undefined;
  let subscriptionKey: string | undefined;
  let credentialSource: ResolvedMyDataConfig["credentialSource"] | undefined;

  if (productionDatabaseConfigured()) {
    try {
      const result = await getProductionPostgresRuntime().nativePool.query<{ name: string; decrypted_secret: string }>(
        `SELECT name, decrypted_secret FROM vault.decrypted_secrets WHERE name = ANY($1::text[])`,
        [[VAULT_USER_NAME, VAULT_KEY_NAME]]
      );
      const values = new Map(result.rows.map((row) => [row.name, row.decrypted_secret]));
      userId = values.get(VAULT_USER_NAME)?.trim();
      subscriptionKey = values.get(VAULT_KEY_NAME)?.trim();
      if (userId && subscriptionKey) credentialSource = "supabase_vault";
    } catch {
      // Environment credentials remain a bootstrap fallback if Vault is unavailable.
    }
  }

  if ((!userId || !subscriptionKey) && myDataConfigured(process.env)) {
    const envConfig = myDataConfigFromEnv(process.env);
    userId = envConfig.userId;
    subscriptionKey = envConfig.subscriptionKey;
    credentialSource = "environment";
  }
  if (!userId || !subscriptionKey || !credentialSource) return undefined;

  return {
    credentialSource,
    config: {
      environment: runtimeConfig.environment,
      baseUrl: runtimeConfig.baseUrl,
      userId,
      subscriptionKey,
      requestTimeoutMs: runtimeConfig.requestTimeoutMs,
      specVersion: runtimeConfig.specVersion
    }
  };
}

export async function configuredMyDataService(): Promise<PostgresMyDataService | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const [resolved, runtimeConfig] = await Promise.all([resolveMyDataDiagnosticConfig(), myDataAdminRuntimeConfig()]);
  if (!resolved) return undefined;
  return new PostgresMyDataService(getProductionPostgresRuntime().sqlPool, {
    client: new AadeMyDataClient(resolved.config),
    issuanceEnabled: runtimeConfig.issuanceEnabled,
    approvedMappingVersion: runtimeConfig.mappingVersionPin
  });
}

export async function myDataReadiness() {
  const runtimeConfig = await myDataAdminRuntimeConfig();
  try {
    const resolved = await resolveMyDataDiagnosticConfig();
    if (!resolved) return { enabled: runtimeConfig.issuanceEnabled, configured: false, ready: false, message: runtimeConfig.issuanceEnabled ? "AADE myDATA credentials are missing" : "AADE myDATA credentials are not configured" };
    const probe = await maybeRunArmedConnectivityProbe();
    const { config, credentialSource } = resolved;
    if (!productionDatabaseConfigured()) return { enabled: runtimeConfig.issuanceEnabled, configured: true, ready: false, environment: config.environment, specVersion: config.specVersion, credentialSource, probe, message: "Fiscal issuance requires PostgreSQL accounting-policy state" };
    const policy = await approvedAccountingPolicy().catch(() => undefined);
    if (!policy) return { enabled: runtimeConfig.issuanceEnabled, configured: true, ready: false, environment: config.environment, specVersion: config.specVersion, credentialSource, probe, message: "No approved Accounting Mapping exists in the database" };
    const deploymentPin=runtimeConfig.mappingVersionPin;
    if(deploymentPin&&deploymentPin!==policy.version)return{enabled:runtimeConfig.issuanceEnabled,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,credentialSource,probe,approvedMappingVersion:policy.version,fiscalisationRoute:policy.fiscalisationRoute,message:`Admin mapping pin ${deploymentPin} does not match approved Accounting Mapping ${policy.version}`};
    if(policy.fiscalisationRoute==="viva_fiscal_provider"){
      const providerReady=runtimeConfig.vivaFiscalEnabled;
      return{enabled:providerReady,configured:true,ready:providerReady,environment:config.environment,specVersion:config.specVersion,credentialSource,probe,approvedMappingVersion:policy.version,fiscalisationRoute:policy.fiscalisationRoute,message:providerReady?"Approved policy uses Viva Fiscal provider; direct AADE ERP SendInvoices is intentionally not the issuance route":"Approved policy selects Viva Fiscal provider, but the provider integration is not enabled in Admin"};
    }
    if(!runtimeConfig.issuanceEnabled)return{enabled:false,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,credentialSource,probe,approvedMappingVersion:policy.version,fiscalisationRoute:policy.fiscalisationRoute,message:"Approved policy selects AADE Direct ERP, but the Admin issuance switch is disabled"};
    if(process.env.NODE_ENV==="production"&&config.environment!=="production")return{enabled:true,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,credentialSource,probe,approvedMappingVersion:policy.version,fiscalisationRoute:policy.fiscalisationRoute,message:"Production fiscal issuance cannot target the AADE test environment"};
    if(!runtimeConfig.ecrTokenEnabled)return{enabled:true,configured:true,ready:false,environment:config.environment,specVersion:config.specVersion,credentialSource,probe,approvedMappingVersion:policy.version,fiscalisationRoute:policy.fiscalisationRoute,message:"AADE Direct ERP is selected, but POS/e-POS ECRToken capability is not enabled in Admin"};
    return { enabled: true, configured: true, ready: true, environment: config.environment, specVersion: config.specVersion, credentialSource, probe, approvedMappingVersion:policy.version, fiscalisationRoute:policy.fiscalisationRoute, message: `Accounting Mapping ${policy.version} is approved for AADE Direct ERP; per-document ECRToken/payment validation still applies` };
  } catch (error) {
    return { enabled: runtimeConfig.issuanceEnabled, configured: false, ready: false, message: error instanceof Error ? redactDiagnosticError(error.message) : "AADE myDATA readiness failed" };
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
    return { ok: true as const, readOnly: true as const, operation: "RequestTransmittedDocs" as const, environment: client.environment, specVersion: client.specVersion, credentialSource: resolved.credentialSource, checkedAt, responseBytes: Buffer.byteLength(xml, "utf8") };
  } catch (error) { throw new Error(redactDiagnosticError(error instanceof Error ? error.message : "AADE myDATA connectivity check failed")); }
}

async function approvedAccountingPolicy():Promise<ApprovedPolicy|undefined>{
  const result=await getProductionPostgresRuntime().nativePool.query<{version:string;fiscalisation_route:string;compatibility_target:string}>(`SELECT p.version,p.fiscalisation_route,p.compatibility_target FROM accounting_tax_policies p JOIN markets m ON m.id=p.market_id WHERE m.code=$1 AND p.status='approved' ORDER BY p.approved_at DESC LIMIT 1`,[marketCode()]);
  const row=result.rows[0];if(!row)return undefined;
  if(row.fiscalisation_route!=="viva_fiscal_provider"&&row.fiscalisation_route!=="aade_direct_erp")return undefined;
  return{version:row.version,fiscalisationRoute:row.fiscalisation_route,compatibilityTarget:row.compatibility_target};
}

async function maybeRunArmedConnectivityProbe(): Promise<ProbeSnapshot | undefined> {
  if (!productionDatabaseConfigured()) return undefined;
  const db = getProductionPostgresRuntime().nativePool;
  const claimed = await db.query<{ market_id: string }>(
    `WITH target AS (SELECT s.market_id,s.key FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.key=$2 AND s.value->>'state'='armed' FOR UPDATE OF s SKIP LOCKED)
     UPDATE system_settings s SET value=jsonb_build_object('state','running','startedAt',floor(extract(epoch from clock_timestamp())*1000)::bigint),version=s.version+1,updated_at=clock_timestamp()
     FROM target t WHERE s.market_id=t.market_id AND s.key=t.key RETURNING s.market_id::text`,
    [marketCode(), CONNECTIVITY_PROBE_KEY]
  );
  if (claimed.rowCount) {
    let snapshot: ProbeSnapshot;
    try { const result = await myDataConnectivityCheck(); snapshot = { state: "succeeded", checkedAt: result.checkedAt, environment: result.environment, specVersion: result.specVersion, responseBytes: result.responseBytes }; }
    catch (error) { snapshot = { state: "failed", checkedAt: Date.now(), error: redactDiagnosticError(error instanceof Error ? error.message : "AADE myDATA connectivity check failed") }; }
    await db.query(`UPDATE system_settings SET value=$3::jsonb,version=version+1,updated_at=clock_timestamp() WHERE market_id=$1::uuid AND key=$2`,[claimed.rows[0]!.market_id,CONNECTIVITY_PROBE_KEY,JSON.stringify(snapshot)]);
    return snapshot;
  }
  const existing = await db.query<{ value: ProbeSnapshot }>(`SELECT s.value FROM system_settings s JOIN markets m ON m.id=s.market_id WHERE m.code=$1 AND s.key=$2 LIMIT 1`,[marketCode(),CONNECTIVITY_PROBE_KEY]);
  return sanitizeProbeSnapshot(existing.rows[0]?.value);
}

async function upsertVaultSecret(db: ReturnType<typeof getProductionPostgresRuntime>["nativePool"], name:string, value:string, description:string):Promise<void>{
  const existing=await db.query<{id:string}>(`SELECT id::text FROM vault.secrets WHERE name=$1 LIMIT 1`,[name]);
  if(existing.rowCount)await db.query(`SELECT vault.update_secret($1::uuid,$2,$3,$4)`,[existing.rows[0]!.id,value,name,description]);
  else await db.query(`SELECT vault.create_secret($1,$2,$3)`,[value,name,description]);
}

function defaultAdminRuntimeConfig():MyDataAdminRuntimeConfig{
  const environment:MyDataEnvironment=process.env.AADE_MYDATA_ENVIRONMENT==="test"?"test":"production";
  return{
    environment,
    baseUrl:officialBaseUrl(environment),
    specVersion:process.env.AADE_MYDATA_SPEC_VERSION?.trim()||"2.0.2",
    requestTimeoutMs:positiveInteger(process.env.AADE_MYDATA_REQUEST_TIMEOUT_MS,15000),
    issuanceEnabled:process.env.BLS_MYDATA_ISSUANCE_ENABLED==="true",
    ecrTokenEnabled:process.env.BLS_MYDATA_ECR_TOKEN_ENABLED==="true",
    vivaFiscalEnabled:process.env.BLS_VIVA_FISCAL_ENABLED==="true",
    mappingVersionPin:process.env.BLS_MYDATA_MAPPING_VERSION?.trim()||undefined,
    capturePaidOrders:true,
    emailAcceptedDocuments:true
  };
}

function normalizeAdminRuntimeConfig(value:unknown,fallback:MyDataAdminRuntimeConfig,updatedAt?:number):MyDataAdminRuntimeConfig{
  const v=value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
  const environment:MyDataEnvironment=v.environment==="test"?"test":v.environment==="production"?"production":fallback.environment;
  const specVersion=typeof v.specVersion==="string"&&/^\d+\.\d+\.\d+$/.test(v.specVersion.trim())?v.specVersion.trim():fallback.specVersion;
  const timeout=Number(v.requestTimeoutMs);
  return{
    environment,
    baseUrl:officialBaseUrl(environment),
    specVersion,
    requestTimeoutMs:Number.isSafeInteger(timeout)&&timeout>=1000&&timeout<=60000?timeout:fallback.requestTimeoutMs,
    issuanceEnabled:typeof v.issuanceEnabled==="boolean"?v.issuanceEnabled:fallback.issuanceEnabled,
    ecrTokenEnabled:typeof v.ecrTokenEnabled==="boolean"?v.ecrTokenEnabled:fallback.ecrTokenEnabled,
    vivaFiscalEnabled:typeof v.vivaFiscalEnabled==="boolean"?v.vivaFiscalEnabled:fallback.vivaFiscalEnabled,
    mappingVersionPin:typeof v.mappingVersionPin==="string"&&v.mappingVersionPin.trim()?v.mappingVersionPin.trim():undefined,
    capturePaidOrders:typeof v.capturePaidOrders==="boolean"?v.capturePaidOrders:fallback.capturePaidOrders,
    emailAcceptedDocuments:typeof v.emailAcceptedDocuments==="boolean"?v.emailAcceptedDocuments:fallback.emailAcceptedDocuments,
    updatedAt:typeof v.updatedAt==="number"&&Number.isFinite(v.updatedAt)?v.updatedAt:updatedAt
  };
}

function officialBaseUrl(environment:MyDataEnvironment):string{return environment==="production"?"https://mydatapi.aade.gr/myDATA":"https://mydataapidev.aade.gr";}
function marketCode():string{return process.env.DEFAULT_MARKET?.trim()||"sparta";}
function sanitizeProbeSnapshot(value: ProbeSnapshot | undefined): ProbeSnapshot | undefined {
  if (!value || !["armed", "running", "succeeded", "failed"].includes(value.state)) return undefined;
  return { state: value.state, checkedAt: typeof value.checkedAt === "number" && Number.isFinite(value.checkedAt) ? value.checkedAt : undefined, environment: typeof value.environment === "string" ? value.environment.slice(0, 24) : undefined, specVersion: typeof value.specVersion === "string" ? value.specVersion.slice(0, 24) : undefined, responseBytes: typeof value.responseBytes === "number" && Number.isSafeInteger(value.responseBytes) ? value.responseBytes : undefined, error: typeof value.error === "string" ? redactDiagnosticError(value.error) : undefined };
}
function aadeDate(date: Date): string { const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Athens", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date); const value = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value])); return `${value.day}/${value.month}/${value.year}`; }
function positiveInteger(raw: string | undefined, fallback: number): number { if (!raw?.trim()) return fallback; const value = Number(raw); return Number.isSafeInteger(value) && value > 0 ? value : fallback; }
function redactDiagnosticError(message: string): string { return message.replace(/ocp-apim-subscription-key\s*[:=]\s*[^\s,;]+/gi, "ocp-apim-subscription-key=[redacted]").replace(/aade-user-id\s*[:=]\s*[^\s,;]+/gi, "aade-user-id=[redacted]").slice(0, 1000); }
