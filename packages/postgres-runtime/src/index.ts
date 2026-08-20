import { PostgresPersistenceBundle, type ReleasableSqlExecutor, type SqlPool, type SqlQueryResult, type SqlRow } from "@buy-local-sparta/core";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { PostgresCustomerCommerceService } from "./customer-commerce.ts";
import { PostgresVendorOperationsService } from "./vendor-operations.ts";
import { PostgresAdminOperationsLiveService } from "./admin-operations-live.ts";
import { PostgresAdminGovernanceService } from "./admin-governance.ts";
import { VivaPaymentsClient, vivaConfigFromEnv, type VivaConfig } from "@buy-local-sparta/viva-payments";
import { PostgresVivaPaymentsService } from "./viva-payments.ts";
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

export const EXPECTED_SCHEMA_VERSION = 95;

export type PostgresRuntimeConfig = Readonly<{
  connectionString: string;
  applicationName: string;
  maxConnections: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  viva?: VivaConfig;
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

  async connect(): Promise<ReleasableSqlExecutor> {
    return new PgClientAdapter(await this.#pool.connect());
  }
}

export class ProductionPostgresRuntime {
  readonly nativePool: Pool;
  readonly sqlPool: SqlPool;
  readonly persistence: PostgresPersistenceBundle;
  readonly customerCommerce: PostgresCustomerCommerceService;
  readonly vendorOperations: PostgresVendorOperationsService;
  readonly adminOperations: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly vivaPayments?: PostgresVivaPaymentsService;
  readonly media: PostgresMediaPipelineService;
  readonly myData?: PostgresMyDataService;
  readonly search?: PostgresProductionSearchService;
  readonly notifications?: PostgresResendNotificationService;
  readonly boxNow?: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;
  readonly config: PostgresRuntimeConfig;

  constructor(config: PostgresRuntimeConfig) {
    this.config = config;
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs
    };
    this.nativePool = new Pool(poolConfig);
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool, this.persistence);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool);
    this.vivaPayments = config.viva ? new PostgresVivaPaymentsService(this.sqlPool, new VivaPaymentsClient(config.viva)) : undefined;
    this.media = new PostgresMediaPipelineService(this.sqlPool, { maxBytes: config.mediaMaxBytes });
    this.myData = config.myData ? new PostgresMyDataService(this.sqlPool, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, mappingVersion: config.myDataMappingVersion }) : undefined;
    this.search = config.search ? new PostgresProductionSearchService(this.sqlPool, config.search) : undefined;
    this.notifications = config.resend ? new PostgresResendNotificationService(this.sqlPool, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId }) : undefined;
    this.boxNow = config.boxNow ? new PostgresBoxNowShippingService(this.sqlPool, new BoxNowClient(config.boxNow)) : undefined;
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
  }

  async readiness(now = Date.now()): Promise<DatabaseReadiness> {
    try {
      const version = await this.nativePool.query<{ server_version: string; server_version_num: string }>("SELECT current_setting('server_version') AS server_version, current_setting('server_version_num') AS server_version_num");
      const extensions = await this.nativePool.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','citext','postgis') ORDER BY extname");
      const postgis = await this.nativePool.query<{ postgis_version: string }>("SELECT PostGIS_Version() AS postgis_version");
      const migrations = await this.nativePool.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1");
      const serverVersion = version.rows[0]?.server_version;
      const serverVersionNumber = Number(version.rows[0]?.server_version_num ?? 0);
      const requiredExtensions = extensions.rows.map((row) => row.extname);
      const appliedSchemaVersion = Number(migrations.rows[0]?.version ?? 0);
      const pendingMigrations = Math.max(0, EXPECTED_SCHEMA_VERSION - appliedSchemaVersion);
      const ok = serverVersionNumber >= 150000 && requiredExtensions.includes("pgcrypto") && requiredExtensions.includes("citext") && requiredExtensions.includes("postgis") && pendingMigrations === 0;
      return {
        ok,
        checkedAt: now,
        serverVersion,
        serverVersionNumber,
        postgisVersion: postgis.rows[0]?.postgis_version,
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        pendingMigrations,
        message: ok ? "PostgreSQL runtime is ready" : `PostgreSQL runtime is not ready (schema ${appliedSchemaVersion}/${EXPECTED_SCHEMA_VERSION})`
      };
    } catch (error) {
      return { ok: false, checkedAt: now, expectedSchemaVersion: EXPECTED_SCHEMA_VERSION, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> {
    await this.nativePool.end();
  }
}

export function productionPostgresRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): ProductionPostgresRuntime {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const config: PostgresRuntimeConfig = {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta",
    maxConnections: positiveInt(env.BLS_DB_MAX_CONNECTIONS, 10),
    connectionTimeoutMs: positiveInt(env.BLS_DB_CONNECTION_TIMEOUT_MS, 5000),
    idleTimeoutMs: positiveInt(env.BLS_DB_IDLE_TIMEOUT_MS, 30000),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: positiveInt(env.BLS_MEDIA_MAX_BYTES, 10 * 1024 * 1024),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim() || undefined,
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim() || undefined,
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim() || undefined,
    boxNow: boxNowConfigFromEnv(env)
  };
  return new ProductionPostgresRuntime(config);
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function boxNowConfigFromEnv(env: NodeJS.ProcessEnv): BoxNowConfig | undefined {
  const clientId = env.BOXNOW_CLIENT_ID?.trim();
  const clientSecret = env.BOXNOW_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  return {
    clientId,
    clientSecret,
    apiBaseUrl: env.BOXNOW_API_BASE_URL?.trim() || "https://api-production.boxnow.gr",
    partnerId: env.BOXNOW_PARTNER_ID?.trim() || undefined,
    warehouseNumber: env.BOXNOW_WAREHOUSE_NUMBER?.trim() || undefined
  };
}
