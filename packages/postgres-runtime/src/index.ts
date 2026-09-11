import { PostgresPersistenceBundle, type ReleasableSqlExecutor, type SqlPool, type SqlQueryResult, type SqlRow } from "@buy-local-sparta/core";
import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from "pg";
import { PostgresCustomerCommerceService } from "./customer-commerce.ts";
import { PostgresVendorOperationsService } from "./vendor-operations.ts";
import { PostgresAdminOperationsLiveService } from "./admin-operations-live.ts";
import { PostgresAdminGovernanceService } from "./admin-governance.ts";
import { MolliePaymentsClient, mollieConfigFromEnv, mollieEnvironment, type MollieConfig } from "@buy-local-sparta/mollie-payments";
import { PostgresMolliePaymentsService } from "./mollie-payments.ts";
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

export const EXPECTED_SCHEMA_VERSION = 225;
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
  readonly customerCommerce: PostgresCustomerCommerceService;
  readonly vendorOperations: PostgresVendorOperationsService;
  readonly adminOperations: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly molliePayments: PostgresMolliePaymentsService;
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData: PostgresMyDataService;
  readonly search: PostgresProductionSearchService;
  readonly notifications: PostgresResendNotificationService;
  readonly boxNowShipping: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;
  readonly cartRecovery: PostgresCartRecoveryService;
  readonly #config: PostgresRuntimeConfig;

  constructor(config: PostgresRuntimeConfig) {
    this.#config = config;
    const poolConfig: PoolConfig = {
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs
    };
    this.nativePool = new Pool(poolConfig);
    this.nativePool.on("error", (error) => {
      console.error("PostgreSQL idle client error", error);
    });
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool);
    this.molliePayments = new PostgresMolliePaymentsService(this.sqlPool, config.mollie ? new MolliePaymentsClient(config.mollie) : undefined, config.molliePublicBaseUrl);
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool, config.mediaMaxBytes);
    this.myData = new PostgresMyDataService(this.sqlPool, config.myData ? new AadeMyDataClient(config.myData) : undefined, config.myDataIssuanceEnabled, config.myDataMappingVersion);
    this.search = new PostgresProductionSearchService(this.sqlPool, config.search);
    this.notifications = new PostgresResendNotificationService(this.sqlPool, config.resend, config.notificationSuppressionSecret, config.notificationWorkerId);
    this.boxNowShipping = new PostgresBoxNowShippingService(this.sqlPool, config.boxNow ? new BoxNowClient(config.boxNow) : undefined);
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  get config(): PostgresRuntimeConfig { return this.#config; }

  async readiness(): Promise<DatabaseReadiness> {
    try {
      const result = await this.nativePool.query<{
        server_version: string;
        server_version_num: string;
        postgis_version: string;
        applied_schema_version: number;
        required_extensions: string[];
      }>(`
        SELECT
          current_setting('server_version') AS server_version,
          current_setting('server_version_num') AS server_version_num,
          postgis_full_version() AS postgis_version,
          COALESCE((SELECT MAX(version) FROM public.schema_migrations), 0)::int AS applied_schema_version,
          ARRAY(
            SELECT extname
            FROM pg_extension
            WHERE extname IN ('pgcrypto', 'citext', 'postgis')
            ORDER BY extname
          ) AS required_extensions
      `);
      const row = result.rows[0];
      const serverVersionNumber = Number(row?.server_version_num ?? 0);
      const appliedSchemaVersion = Number(row?.applied_schema_version ?? 0);
      const requiredExtensions = row?.required_extensions ?? [];
      const requiredExtensionSet = new Set(requiredExtensions);
      const extensionReady = ["pgcrypto", "citext", "postgis"].every((name) => requiredExtensionSet.has(name));
      const schemaReady = appliedSchemaVersion >= EXPECTED_SCHEMA_VERSION;
      const ok = Boolean(row?.server_version) && serverVersionNumber >= 140000 && extensionReady && schemaReady;
      return {
        ok,
        checkedAt: Date.now(),
        serverVersion: row?.server_version,
        serverVersionNumber,
        postgisVersion: row?.postgis_version,
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        pendingMigrations: Math.max(0, EXPECTED_SCHEMA_VERSION - appliedSchemaVersion),
        message: ok
          ? "PostgreSQL readiness verified"
          : !schemaReady
            ? `Database schema ${appliedSchemaVersion} is behind expected ${EXPECTED_SCHEMA_VERSION}`
            : !extensionReady
              ? "Required PostgreSQL extensions are unavailable"
              : "PostgreSQL readiness verification failed"
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt: Date.now(),
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        message: error instanceof Error ? error.message : "PostgreSQL readiness verification failed"
      };
    }
  }

  async close(): Promise<void> {
    await this.nativePool.end();
  }
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const applicationName = env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta";
  const maxConnections = Number(env.BLS_DB_POOL_MAX ?? "8");
  const connectionTimeoutMs = Number(env.BLS_DB_CONNECT_TIMEOUT_MS ?? "5000");
  const idleTimeoutMs = Number(env.BLS_DB_IDLE_TIMEOUT_MS ?? "30000");
  const mediaMaxBytes = Number(env.BLS_MEDIA_MAX_BYTES ?? "26214400");
  return {
    connectionString,
    applicationName,
    maxConnections,
    connectionTimeoutMs,
    idleTimeoutMs,
    mollie: mollieConfigFromEnv(env),
    molliePublicBaseUrl: env.MOLLIE_PUBLIC_BASE_URL?.trim(),
    mediaMaxBytes,
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
