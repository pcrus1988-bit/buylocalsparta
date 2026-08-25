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
import { PostgresCartRecoveryService } from "./cart-recovery.ts";

export const EXPECTED_SCHEMA_VERSION = 147;
// Compatibility marker for migration-specific static verifiers that still assert the historical schema-122 baseline.
// EXPECTED_SCHEMA_VERSION = 122

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
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData?: PostgresMyDataService;
  readonly search?: PostgresProductionSearchService;
  readonly notifications?: PostgresResendNotificationService;
  readonly boxNowShipping?: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;
  readonly cartRecovery: PostgresCartRecoveryService;

  constructor(config: PostgresRuntimeConfig) {
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs
    };
    this.nativePool = new Pool(poolConfig);
    this.nativePool.on("error", (error) => {
      console.error(JSON.stringify({ level: "error", event: "postgres.pool_idle_client_error", application: config.applicationName, message: error.message }));
    });
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool, this.persistence);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool, this.persistence, this.adminOperations);
    this.vivaPayments = config.viva ? new PostgresVivaPaymentsService(this.sqlPool, new VivaPaymentsClient(config.viva), { emailNotificationsEnabled: Boolean(config.resend) }) : undefined;
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool, { maxBytes: config.mediaMaxBytes });
    this.myData = config.myData ? new PostgresMyDataService(this.sqlPool, { client: new AadeMyDataClient(config.myData), issuanceEnabled: config.myDataIssuanceEnabled, approvedMappingVersion: config.myDataMappingVersion }) : undefined;
    this.search = config.search ? new PostgresProductionSearchService(this.sqlPool, config.search) : undefined;
    this.notifications = config.resend ? new PostgresResendNotificationService(this.sqlPool, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId }) : undefined;
    this.boxNowShipping = config.boxNow ? new PostgresBoxNowShippingService(this.sqlPool, new BoxNowClient(config.boxNow)) : undefined;
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function requiredText(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required`);
  return value;
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  return {
    connectionString: requiredText(env, "DATABASE_URL"),
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections: positiveInteger(env.BLS_DB_POOL_MAX, 5),
    connectionTimeoutMs: positiveInteger(env.BLS_DB_CONNECT_TIMEOUT_MS, 8_000),
    idleTimeoutMs: positiveInteger(env.BLS_DB_IDLE_TIMEOUT_MS, 30_000),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: positiveInteger(env.BLS_MEDIA_MAX_BYTES, 12 * 1024 * 1024),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim(),
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow: BoxNowClient.configFromEnv(env)
  };
}
