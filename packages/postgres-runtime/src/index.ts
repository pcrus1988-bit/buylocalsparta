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

export const EXPECTED_SCHEMA_VERSION = 165;
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

  async close(): Promise<void> { await this.#pool.end(); }
}

export class PostgresRuntime {
  readonly nativePool: Pool;
  readonly sqlPool: SqlPool;
  readonly persistence: PostgresPersistenceBundle;
  readonly vendorOperations: PostgresVendorOperationsService;
  readonly customerCommerce: PostgresCustomerCommerceService;
  readonly adminOperations: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly vivaPayments: PostgresVivaPaymentsService;
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData: PostgresMyDataService;
  readonly productionSearch: PostgresProductionSearchService;
  readonly resendNotifications: PostgresResendNotificationService;
  readonly boxNowShipping: PostgresBoxNowShippingService;
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
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool);
    this.vivaPayments = new PostgresVivaPaymentsService(this.sqlPool, config.viva ? new VivaPaymentsClient(config.viva) : undefined);
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool, { maxBytes: config.mediaMaxBytes });
    this.myData = new PostgresMyDataService(this.sqlPool, config.myData ? new AadeMyDataClient(config.myData) : undefined, {
      issuanceEnabled: config.myDataIssuanceEnabled,
      mappingVersion: config.myDataMappingVersion
    });
    this.productionSearch = new PostgresProductionSearchService(this.sqlPool, config.search);
    this.resendNotifications = new PostgresResendNotificationService(this.sqlPool, config.resend, config.notificationSuppressionSecret, config.notificationWorkerId);
    this.boxNowShipping = new PostgresBoxNowShippingService(this.sqlPool, config.boxNow ? new BoxNowClient(config.boxNow) : undefined);
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  async readiness(expectedSchemaVersion = EXPECTED_SCHEMA_VERSION): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const result = await this.nativePool.query<QueryResultRow>(`
        SELECT current_setting('server_version') AS server_version,
               current_setting('server_version_num')::int AS server_version_num,
               (SELECT extversion FROM pg_extension WHERE extname='postgis') AS postgis_version,
               COALESCE((SELECT max(version) FROM schema_migrations),0)::int AS applied_schema_version
      `);
      const row = result.rows[0] ?? {};
      const appliedSchemaVersion = Number(row.applied_schema_version ?? 0);
      const pendingMigrations = Math.max(0, expectedSchemaVersion - appliedSchemaVersion);
      const postgisVersion = typeof row.postgis_version === "string" ? row.postgis_version : undefined;
      const serverVersion = typeof row.server_version === "string" ? row.server_version : undefined;
      const serverVersionNumber = Number(row.server_version_num ?? 0) || undefined;
      if (!postgisVersion) return { ok: false, checkedAt, serverVersion, serverVersionNumber, postgisVersion, requiredExtensions: ["postgis", "pgcrypto", "citext"], appliedSchemaVersion, expectedSchemaVersion, pendingMigrations, message: "PostGIS extension is not installed" };
      if (pendingMigrations > 0) return { ok: false, checkedAt, serverVersion, serverVersionNumber, postgisVersion, requiredExtensions: ["postgis", "pgcrypto", "citext"], appliedSchemaVersion, expectedSchemaVersion, pendingMigrations, message: `Database schema is ${appliedSchemaVersion}; expected ${expectedSchemaVersion}` };
      return { ok: true, checkedAt, serverVersion, serverVersionNumber, postgisVersion, requiredExtensions: ["postgis", "pgcrypto", "citext"], appliedSchemaVersion, expectedSchemaVersion, pendingMigrations, message: "Database is ready" };
    } catch (error) {
      return { ok: false, checkedAt, expectedSchemaVersion, message: error instanceof Error ? error.message : "Database readiness failed" };
    }
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function createPostgresRuntimeFromEnv(input: Readonly<{ applicationName?: string }> = {}): PostgresRuntime {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const myData = myDataConfigFromEnv();
  return new PostgresRuntime({
    connectionString,
    applicationName: input.applicationName ?? "buy-local-sparta",
    maxConnections: Number(process.env.BLS_DB_POOL_MAX ?? 8),
    connectionTimeoutMs: Number(process.env.BLS_DB_CONNECTION_TIMEOUT_MS ?? 5_000),
    idleTimeoutMs: Number(process.env.BLS_DB_IDLE_TIMEOUT_MS ?? 30_000),
    viva: vivaConfigFromEnv(),
    mediaMaxBytes: Number(process.env.BLS_MEDIA_MAX_BYTES ?? 25 * 1024 * 1024),
    myData,
    myDataIssuanceEnabled: myDataIssuanceEnabled(),
    myDataMappingVersion: process.env.BLS_MYDATA_MAPPING_VERSION?.trim(),
    search: meilisearchConfigFromEnv(),
    resend: resendConfigFromEnv(),
    notificationSuppressionSecret: process.env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: process.env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow: (() => {
      const apiUrl = process.env.BOXNOW_API_URL?.trim();
      const clientId = process.env.BOXNOW_CLIENT_ID?.trim();
      const clientSecret = process.env.BOXNOW_CLIENT_SECRET?.trim();
      if (!apiUrl || !clientId || !clientSecret) return undefined;
      return { apiUrl, clientId, clientSecret };
    })()
  });
}
