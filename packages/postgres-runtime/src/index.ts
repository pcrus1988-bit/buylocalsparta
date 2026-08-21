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

export const EXPECTED_SCHEMA_VERSION = 108;

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
  readonly viva: PostgresVivaPaymentsService;
  readonly media: PostgresMediaPipelineService;
  readonly myData?: PostgresMyDataService;
  readonly search: PostgresProductionSearchService;
  readonly notifications: PostgresResendNotificationService;
  readonly boxNow?: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;

  constructor(nativePool: Pool, config: PostgresRuntimeConfig) {
    this.nativePool = nativePool;
    this.sqlPool = new PgPoolAdapter(nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool, this.persistence);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool, this.persistence);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool, this.persistence);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool, this.persistence);
    this.viva = new PostgresVivaPaymentsService(this.sqlPool, this.persistence, new VivaPaymentsClient(config.viva ?? vivaConfigFromEnv(process.env)));
    this.media = new PostgresMediaPipelineService(this.sqlPool, this.persistence, { maxBytes: config.mediaMaxBytes });
    if (config.myData) this.myData = new PostgresMyDataService(this.sqlPool, this.persistence, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, mappingVersion: config.myDataMappingVersion });
    this.search = new PostgresProductionSearchService(this.sqlPool, config.search ?? meilisearchConfigFromEnv(process.env));
    this.notifications = new PostgresResendNotificationService(this.sqlPool, this.persistence, config.resend ?? resendConfigFromEnv(process.env), { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId });
    if (config.boxNow) this.boxNow = new PostgresBoxNowShippingService(this.sqlPool, this.persistence, new BoxNowClient(config.boxNow));
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool, this.persistence);
  }

  async readiness(expectedSchemaVersion = EXPECTED_SCHEMA_VERSION): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const [server, postgis, schema] = await Promise.all([
        this.nativePool.query<{ server_version: string; server_version_num: string }>("SHOW server_version").then(async (versionResult) => ({ server_version: versionResult.rows[0]?.server_version ?? "", server_version_num: (await this.nativePool.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0]?.server_version_num ?? "0" })),
        this.nativePool.query<{ postgis_version: string }>("SELECT postgis_lib_version() AS postgis_version"),
        this.nativePool.query<{ version: number }>("SELECT COALESCE(MAX(version),0)::int AS version FROM schema_migrations")
      ]);
      const appliedSchemaVersion = Number(schema.rows[0]?.version ?? 0);
      const serverVersionNumber = Number(server.server_version_num ?? 0);
      const pendingMigrations = Math.max(0, expectedSchemaVersion - appliedSchemaVersion);
      const serverCompatible = serverVersionNumber >= 150000;
      const schemaCompatible = appliedSchemaVersion >= expectedSchemaVersion;
      const ok = serverCompatible && schemaCompatible && Boolean(postgis.rows[0]?.postgis_version);
      const message = ok ? "PostgreSQL runtime is ready" : !serverCompatible ? `PostgreSQL ${server.server_version} is below the supported minimum` : `Database schema ${appliedSchemaVersion} is behind expected ${expectedSchemaVersion}`;
      return { ok, checkedAt, serverVersion: server.server_version, serverVersionNumber, postgisVersion: postgis.rows[0]?.postgis_version, requiredExtensions: ["pgcrypto","citext","postgis"], appliedSchemaVersion, expectedSchemaVersion, pendingMigrations, message };
    } catch (error) {
      return { ok: false, checkedAt, expectedSchemaVersion, message: error instanceof Error ? error.message : "Database readiness check failed" };
    }
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  const maxConnections = Number(env.BLS_DB_POOL_MAX ?? 10);
  const connectionTimeoutMs = Number(env.BLS_DB_CONNECTION_TIMEOUT_MS ?? 5000);
  const idleTimeoutMs = Number(env.BLS_DB_IDLE_TIMEOUT_MS ?? 30000);
  const mediaMaxBytes = Number(env.BLS_MEDIA_MAX_BYTES ?? 20 * 1024 * 1024);
  const viva = env.VIVA_CLIENT_ID?.trim() && env.VIVA_CLIENT_SECRET?.trim() && env.VIVA_SOURCE_CODE?.trim() ? vivaConfigFromEnv(env) : undefined;
  const myData = env.AADE_USER_ID?.trim() && env.AADE_SUBSCRIPTION_KEY?.trim() ? myDataConfigFromEnv(env) : undefined;
  const search = env.MEILISEARCH_HOST?.trim() && env.MEILISEARCH_API_KEY?.trim() ? meilisearchConfigFromEnv(env) : undefined;
  const resend = env.RESEND_API_KEY?.trim() ? resendConfigFromEnv(env) : undefined;
  const boxNow = env.BOXNOW_CLIENT_ID?.trim() && env.BOXNOW_CLIENT_SECRET?.trim() ? { clientId: env.BOXNOW_CLIENT_ID.trim(), clientSecret: env.BOXNOW_CLIENT_SECRET.trim(), apiBaseUrl: env.BOXNOW_API_BASE_URL?.trim() || "https://api-production.boxnow.gr", partnerId: env.BOXNOW_PARTNER_ID?.trim() } satisfies BoxNowConfig : undefined;
  return {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta",
    maxConnections: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 10,
    connectionTimeoutMs: Number.isFinite(connectionTimeoutMs) && connectionTimeoutMs > 0 ? connectionTimeoutMs : 5000,
    idleTimeoutMs: Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 30000,
    viva,
    mediaMaxBytes: Number.isFinite(mediaMaxBytes) && mediaMaxBytes > 0 ? mediaMaxBytes : 20 * 1024 * 1024,
    myData,
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.AADE_MAPPING_VERSION?.trim(),
    search,
    resend,
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow
  };
}

export function createPostgresRuntimeFromEnv(input: { env?: NodeJS.ProcessEnv; applicationName?: string } = {}): ProductionPostgresRuntime {
  const env = input.env ?? process.env;
  const config = postgresRuntimeConfigFromEnv(env);
  const pool = new Pool({
    connectionString: config.connectionString,
    application_name: input.applicationName ?? config.applicationName,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs
  } satisfies PoolConfig);
  return new ProductionPostgresRuntime(pool, config);
}

export * from "./admin-auth.ts";
export * from "./accounting-policy.ts";
export * from "./activation-evidence.ts";
export * from "./admin-governance.ts";
export * from "./admin-operations.ts";
export * from "./boxnow-shipping.ts";
export * from "./customer-addresses.ts";
export * from "./customer-auth.ts";
export * from "./customer-commerce.ts";
export * from "./email-templates.ts";
export * from "./media-pipeline.ts";
export * from "./mydata.ts";
export * from "./notifications.ts";
export * from "./postgres-persistence.ts";
export * from "./search.ts";
export * from "./vendor-auth.ts";
export * from "./vendor-operations.ts";
export * from "./viva-payments.ts";
