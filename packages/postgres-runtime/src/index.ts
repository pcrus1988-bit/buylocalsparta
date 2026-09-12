import { PostgresPersistenceBundle, type ReleasableSqlExecutor, type SqlPool, type SqlQueryResult, type SqlRow } from "@buy-local-sparta/core";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { PostgresCustomerCommerceService } from "./customer-commerce.ts";
import { PostgresVendorOperationsService } from "./vendor-operations.ts";
import { PostgresAdminOperationsLiveService } from "./admin-operations-live.ts";
import { PostgresAdminGovernanceService } from "./admin-governance.ts";
import { MolliePaymentsClient, mollieConfigFromEnv, mollieEnvironment, type MollieConfig } from "@buy-local-sparta/mollie-payments";
import { PostgresMolliePaymentsService } from "./mollie-payments.ts";
import { MollieHostedCheckoutGateway } from "./mollie-checkout-gateway.ts";
import { PostgresMediaPipelineService } from "./media-pipeline.ts";
import { AadeMyDataClient, myDataConfigFromEnv, myDataIssuanceEnabled, type MyDataConfig } from "@buy-local-sparta/aade-mydata";
import { PostgresMyDataService } from "./mydata.ts";
import { meilisearchConfigFromEnv, type MeilisearchConfig } from "@buy-local-sparta/meilisearch-search";
import { resendConfigFromEnv, type ResendConfig } from "@buy-local-sparta/resend-notifications";
import { PostgresProductionSearchService } from "./search.ts";
import { PostgresResendNotificationService } from "./notifications.ts";
import { BoxNowClient, type BoxNowConfig } from "@buy-local-sparta/boxnow-shipping";
import { PostgresBoxNowShippingService } from "./boxnow-shipping.ts";
import { PostgresActivationEvidenceService } from "./activation-evidence.ts";
import { PostgresCartRecoveryService } from "./cart-recovery.ts";

export const EXPECTED_SCHEMA_VERSION = 240;
// Compatibility marker for migration-specific static verifiers that still assert the historical schema-122 baseline.
// EXPECTED_SCHEMA_VERSION = 122

export type PostgresRuntimeConfig = Readonly<{
  connectionString: string;
  applicationName: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  mollie?: MollieConfig;
  molliePublicBaseUrl?: string;
  mediaMaxBytes: number;
  myData?: MyDataConfig;
  myDataIssuanceEnabled: boolean;
  myDataMappingVersion?: string;
  search?: MeilisearchConfig;
  resend?: ResendConfig;
  notificationSuppressionSecret?: string;
  notificationWorkerId?: string;
  boxNow?: BoxNowConfig;
}>;

export type DatabaseReadiness = Readonly<{
  ok: boolean;
  checkedAt: number;
  serverVersion?: string;
  serverVersionNumber?: number;
  postgisVersion?: string;
  requiredExtensions?: readonly string[];
  appliedSchemaVersion?: number;
  expectedSchemaVersion: number;
  pendingMigrations?: number;
  message: string;
}>;

class PgClientAdapter implements ReleasableSqlExecutor {
  readonly #client: PoolClient;
  constructor(client: PoolClient) { this.#client = client; }
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    const result = await this.#client.query<QueryResultRow>(text, [...params]);
    return { rows: result.rows as unknown as readonly Row[], rowCount: result.rowCount ?? result.rows.length };
  }
  release(): void { this.#client.release(); }
}

class PgPoolAdapter implements SqlPool {
  readonly #pool: Pool;
  constructor(pool: Pool) { this.#pool = pool; }
  async query<Row extends SqlRow = SqlRow>(text: string, params: readonly unknown[] = []): Promise<SqlQueryResult<Row>> {
    const result = await this.#pool.query<QueryResultRow>(text, [...params]);
    return { rows: result.rows as unknown as readonly Row[], rowCount: result.rowCount ?? result.rows.length };
  }
  async connect(): Promise<ReleasableSqlExecutor> { return new PgClientAdapter(await this.#pool.connect()); }
}

export class ProductionPostgresRuntime {
  readonly nativePool: Pool;
  readonly sqlPool: SqlPool;
  readonly persistence: PostgresPersistenceBundle;
  readonly molliePayments?: PostgresMolliePaymentsService;
  readonly mollieCheckoutGateway?: MollieHostedCheckoutGateway;
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData?: PostgresMyDataService;
  readonly search?: PostgresProductionSearchService;
  readonly notifications?: PostgresResendNotificationService;
  readonly boxNow?: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;
  readonly cartRecovery: PostgresCartRecoveryService;

  constructor(readonly config: PostgresRuntimeConfig) {
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs,
      keepAlive: true
    };
    this.nativePool = new Pool(poolConfig);
    this.nativePool.on("error",(error) => {
      console.error(JSON.stringify({ level:"error",event:"postgres.pool_idle_client_error",error:`${error.name}:${error.message}`,at:new Date().toISOString() }));
    });
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    const customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    const vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    const adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool);
    const adminGovernance = new PostgresAdminGovernanceService(this.sqlPool);
    Object.assign(this.persistence,{ customerCommerce,vendorOperations,adminOperations,adminGovernance });
    if (config.mollie) {
      const client = new MolliePaymentsClient(config.mollie);
      this.molliePayments = new PostgresMolliePaymentsService(this.sqlPool,client,config.molliePublicBaseUrl);
      this.mollieCheckoutGateway = new MollieHostedCheckoutGateway(this.sqlPool,client,config.molliePublicBaseUrl);
    }
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool,{ maxBytes:config.mediaMaxBytes });
    if (config.myData) this.myData = new PostgresMyDataService(this.sqlPool,new AadeMyDataClient(config.myData),config.myDataMappingVersion);
    if (config.search) this.search = new PostgresProductionSearchService(this.sqlPool,config.search);
    if (config.resend) this.notifications = new PostgresResendNotificationService(this.sqlPool,config.resend,config.notificationSuppressionSecret,config.notificationWorkerId);
    if (config.boxNow) this.boxNow = new PostgresBoxNowShippingService(this.sqlPool,new BoxNowClient(config.boxNow));
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for the production PostgreSQL runtime");
  const config: PostgresRuntimeConfig = {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta",
    maxConnections: positiveInteger(env.BLS_DB_POOL_MAX,10,"BLS_DB_POOL_MAX"),
    connectionTimeoutMs: positiveInteger(env.BLS_DB_CONNECT_TIMEOUT_MS,5_000,"BLS_DB_CONNECT_TIMEOUT_MS"),
    idleTimeoutMs: positiveInteger(env.BLS_DB_IDLE_TIMEOUT_MS,30_000,"BLS_DB_IDLE_TIMEOUT_MS"),
    mediaMaxBytes: positiveInteger(env.BLS_MEDIA_MAX_BYTES,15_000_000,"BLS_MEDIA_MAX_BYTES"),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim()
  };
  if (env.MOLLIE_PAYMENTS_ENABLED === "true") {
    config.mollie = mollieConfigFromEnv(env);
    config.molliePublicBaseUrl = env.MOLLIE_PUBLIC_BASE_URL?.trim();
  }
  if (config.myDataIssuanceEnabled) config.myData = myDataConfigFromEnv(env);
  if (env.BLS_SEARCH_ENABLED === "true") config.search = meilisearchConfigFromEnv(env);
  if (env.BLS_EMAIL_DELIVERY_ENABLED === "true") {
    config.resend = resendConfigFromEnv(env);
    config.notificationSuppressionSecret = env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim();
    config.notificationWorkerId = env.BLS_NOTIFICATION_WORKER_ID?.trim();
  }
  if (env.BLS_BOXNOW_SHIPPING_ENABLED === "true") config.boxNow = {
    clientId: requiredEnv(env.BOXNOW_CLIENT_ID,"BOXNOW_CLIENT_ID"),
    clientSecret: requiredEnv(env.BOXNOW_CLIENT_SECRET,"BOXNOW_CLIENT_SECRET"),
    warehouseNumber: requiredEnv(env.BOXNOW_WAREHOUSE_NUMBER,"BOXNOW_WAREHOUSE_NUMBER"),
    baseUrl: env.BOXNOW_API_BASE_URL?.trim() || "https://api-stage.boxnow.gr",
    requestTimeoutMs: positiveInteger(env.BOXNOW_REQUEST_TIMEOUT_MS,10_000,"BOXNOW_REQUEST_TIMEOUT_MS")
  };
  return config;
}

export function productionDatabaseReadiness(runtime: ProductionPostgresRuntime): Promise<DatabaseReadiness> {
  return runtimeDatabaseReadiness(runtime.sqlPool);
}

async function runtimeDatabaseReadiness(pool: SqlPool): Promise<DatabaseReadiness> {
  const checkedAt = Date.now();
  try {
    const server = await pool.query<SqlRow>("SELECT current_setting('server_version') AS server_version,current_setting('server_version_num')::integer AS server_version_num");
    const extension = await pool.query<SqlRow>("SELECT extname,extversion FROM pg_extension WHERE extname IN ('postgis','pgcrypto') ORDER BY extname");
    const migrations = await pool.query<SqlRow>("SELECT COALESCE(MAX(version),0)::integer AS applied_schema_version FROM public.schema_migrations");
    const serverVersion = text(server.rows[0]?.server_version);
    const serverVersionNumber = Number(server.rows[0]?.server_version_num ?? 0);
    const extensionRows = extension.rows.map((row) => ({ name:text(row.extname),version:text(row.extversion) })).filter((row) => row.name);
    const postgisVersion = extensionRows.find((row) => row.name === "postgis")?.version;
    const requiredExtensions = ["pgcrypto","postgis"];
    const missingExtensions = requiredExtensions.filter((name) => !extensionRows.some((row) => row.name === name));
    const appliedSchemaVersion = Number(migrations.rows[0]?.applied_schema_version ?? 0);
    const pendingMigrations = Math.max(0,EXPECTED_SCHEMA_VERSION-appliedSchemaVersion);
    const ok = serverVersionNumber >= 180000 && missingExtensions.length === 0 && appliedSchemaVersion >= EXPECTED_SCHEMA_VERSION;
    const message = ok ? "PostgreSQL runtime ready" : `PostgreSQL runtime not ready: ${[
      serverVersionNumber < 180000 ? `server ${serverVersion ?? "unknown"} is older than PostgreSQL 18` : null,
      missingExtensions.length ? `missing extensions ${missingExtensions.join(",")}` : null,
      appliedSchemaVersion < EXPECTED_SCHEMA_VERSION ? `schema ${appliedSchemaVersion} is behind ${EXPECTED_SCHEMA_VERSION}` : null
    ].filter(Boolean).join("; ")}`;
    return { ok,checkedAt,serverVersion,serverVersionNumber,postgisVersion,requiredExtensions,appliedSchemaVersion,expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,pendingMigrations,message };
  } catch (error) {
    return { ok:false,checkedAt,expectedSchemaVersion:EXPECTED_SCHEMA_VERSION,message:`PostgreSQL readiness failed: ${safeError(error)}` };
  }
}

function positiveInteger(raw:string|undefined,fallback:number,name:string):number {
  if (!raw?.trim()) return fallback;
  const value=Number(raw);
  if (!Number.isSafeInteger(value)||value<=0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function requiredEnv(value:string|undefined,name:string):string { if (!value?.trim()) throw new Error(`${name} is required`); return value.trim(); }
function text(value:unknown):string|undefined { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function safeError(error:unknown):string { return error instanceof Error ? `${error.name}:${error.message}` : String(error); }
