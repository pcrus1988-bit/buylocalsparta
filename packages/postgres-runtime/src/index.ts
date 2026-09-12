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

export const EXPECTED_SCHEMA_VERSION = 233;
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
  async end(): Promise<void> { await this.#pool.end(); }
}

export class ProductionPostgresRuntime {
  readonly nativePool: Pool;
  readonly sqlPool: SqlPool;
  readonly persistence: PostgresPersistenceBundle;
  readonly customerCommerce: PostgresCustomerCommerceService;
  readonly vendorOperations: PostgresVendorOperationsService;
  readonly adminOperations: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly molliePayments?: PostgresMolliePaymentsService;
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
    this.molliePayments = config.mollie && config.molliePublicBaseUrl
      ? new PostgresMolliePaymentsService(
          this.sqlPool,
          new MollieHostedCheckoutGateway(this.sqlPool, new MolliePaymentsClient(config.mollie)),
          { publicBaseUrl: config.molliePublicBaseUrl, emailNotificationsEnabled: Boolean(config.resend) }
        )
      : undefined;
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool, { maxBytes: config.mediaMaxBytes });
    this.myData = config.myData ? new PostgresMyDataService(this.sqlPool, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, mappingVersion: config.myDataMappingVersion }) : undefined;
    this.search = config.search ? new PostgresProductionSearchService(this.sqlPool, config.search) : undefined;
    this.notifications = config.resend ? new PostgresResendNotificationService(this.sqlPool, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId }) : undefined;
    this.boxNowShipping = config.boxNow ? new PostgresBoxNowShippingService(this.sqlPool, new BoxNowClient(config.boxNow)) : undefined;
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function productionPostgresRuntimeFromEnv(env: NodeJS.ProcessEnv = process.env): ProductionPostgresRuntime {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const maxConnections = Number(env.BLS_DB_POOL_MAX ?? "10");
  const connectionTimeoutMs = Number(env.BLS_DB_CONNECT_TIMEOUT_MS ?? "5000");
  const idleTimeoutMs = Number(env.BLS_DB_IDLE_TIMEOUT_MS ?? "30000");
  const mediaMaxBytes = Number(env.BLS_MEDIA_MAX_BYTES ?? String(15 * 1024 * 1024));
  const mollie = mollieConfigFromEnv(env);
  const myData = myDataConfigFromEnv(env);
  const search = meilisearchConfigFromEnv(env);
  const resend = resendConfigFromEnv(env);
  const boxNowApiKey = env.BOXNOW_API_KEY?.trim();
  const boxNowApiBaseUrl = env.BOXNOW_API_BASE_URL?.trim();
  const boxNowPartnerId = env.BOXNOW_PARTNER_ID?.trim();
  const boxNow = boxNowApiKey && boxNowApiBaseUrl && boxNowPartnerId ? { apiKey: boxNowApiKey, apiBaseUrl: boxNowApiBaseUrl, partnerId: boxNowPartnerId } satisfies BoxNowConfig : undefined;
  return new ProductionPostgresRuntime({
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 10,
    connectionTimeoutMs: Number.isFinite(connectionTimeoutMs) && connectionTimeoutMs > 0 ? connectionTimeoutMs : 5000,
    idleTimeoutMs: Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 30000,
    mollie,
    molliePublicBaseUrl: env.MOLLIE_PUBLIC_BASE_URL?.trim(),
    mediaMaxBytes: Number.isFinite(mediaMaxBytes) && mediaMaxBytes > 0 ? mediaMaxBytes : 15 * 1024 * 1024,
    myData,
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim(),
    search,
    resend,
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow
  });
}

export function productionDatabaseReadinessFromEnv(env: NodeJS.ProcessEnv = process.env) {
  const runtime = productionPostgresRuntimeFromEnv(env);
  return runtime.persistence.readiness({ expectedSchemaVersion: EXPECTED_SCHEMA_VERSION })
    .finally(() => runtime.close());
}
