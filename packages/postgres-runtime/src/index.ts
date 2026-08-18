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

export const EXPECTED_SCHEMA_VERSION = 61;

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
  readonly boxNow?: PostgresBoxNowShippingService;
  readonly activationEvidence: PostgresActivationEvidenceService;

  constructor(config: PostgresRuntimeConfig) {
    this.nativePool = new Pool({
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs
    } satisfies PoolConfig);
    this.nativePool.on("error", (error) => console.error(JSON.stringify({ level: "error", event: "postgres.pool_idle_client_error", message: error.message })));
    this.sqlPool = new PgPoolAdapter(this.nativePool);
    this.persistence = new PostgresPersistenceBundle(this.sqlPool);
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool, this.persistence);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool, this.persistence);
    this.adminOperations = new PostgresAdminOperationsLiveService(this.sqlPool, this.persistence);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool, this.persistence);
    if (config.viva) this.vivaPayments = new PostgresVivaPaymentsService(this.sqlPool, this.persistence, new VivaPaymentsClient(config.viva));
    this.mediaPipeline = new PostgresMediaPipelineService(this.sqlPool, this.persistence, { maxBytes: config.mediaMaxBytes });
    if (config.myData) this.myData = new PostgresMyDataService(this.sqlPool, this.persistence, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, mappingVersion: config.myDataMappingVersion });
    if (config.search) this.search = new PostgresProductionSearchService(this.sqlPool, this.persistence, config.search);
    if (config.resend) this.notifications = new PostgresResendNotificationService(this.sqlPool, this.persistence, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId });
    if (config.boxNow) this.boxNow = new PostgresBoxNowShippingService(this.sqlPool, this.persistence, new BoxNowClient(config.boxNow));
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool, this.persistence);
  }

  async readiness(): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const client = await this.nativePool.connect();
      try {
        const [server, postgis, migration] = await Promise.all([
          client.query<{ server_version: string; server_version_num: string }>("SHOW server_version").then(async (result) => ({ serverVersion: result.rows[0]?.server_version, serverVersionNumber: Number((await client.query<{ server_version_num: string }>("SHOW server_version_num")).rows[0]?.server_version_num) })),
          client.query<{ version: string }>("SELECT postgis_full_version() AS version").then((result) => result.rows[0]?.version),
          client.query<{ version: number }>("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").then((result) => Number(result.rows[0]?.version ?? 0))
        ]);
        const pendingMigrations = Math.max(0, EXPECTED_SCHEMA_VERSION - migration);
        return {
          ok: Boolean(server.serverVersion && postgis && migration >= EXPECTED_SCHEMA_VERSION),
          checkedAt,
          serverVersion: server.serverVersion,
          serverVersionNumber: server.serverVersionNumber,
          postgisVersion: postgis,
          requiredExtensions: ["postgis"],
          appliedSchemaVersion: migration,
          expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
          pendingMigrations,
          message: migration >= EXPECTED_SCHEMA_VERSION ? "PostgreSQL/PostGIS ready" : `Database schema ${migration} is behind expected ${EXPECTED_SCHEMA_VERSION}`
        };
      } finally {
        client.release();
      }
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        message: error instanceof Error ? error.message : "PostgreSQL readiness check failed"
      };
    }
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  const maxConnections = Number(env.BLS_DB_POOL_MAX ?? "10");
  const connectionTimeoutMs = Number(env.BLS_DB_CONNECT_TIMEOUT_MS ?? "10000");
  const idleTimeoutMs = Number(env.BLS_DB_IDLE_TIMEOUT_MS ?? "30000");
  const mediaMaxBytes = Number(env.BLS_MEDIA_MAX_BYTES ?? String(10 * 1024 * 1024));
  if (!Number.isSafeInteger(maxConnections) || maxConnections < 1 || maxConnections > 50) throw new Error("BLS_DB_POOL_MAX must be an integer between 1 and 50");
  if (!Number.isSafeInteger(connectionTimeoutMs) || connectionTimeoutMs < 1000 || connectionTimeoutMs > 120000) throw new Error("BLS_DB_CONNECT_TIMEOUT_MS must be an integer between 1000 and 120000");
  if (!Number.isSafeInteger(idleTimeoutMs) || idleTimeoutMs < 1000 || idleTimeoutMs > 300000) throw new Error("BLS_DB_IDLE_TIMEOUT_MS must be an integer between 1000 and 300000");
  if (!Number.isSafeInteger(mediaMaxBytes) || mediaMaxBytes < 1024 || mediaMaxBytes > 50 * 1024 * 1024) throw new Error("BLS_MEDIA_MAX_BYTES must be an integer between 1024 and 52428800");
  const myDataIssuance = myDataIssuanceEnabled(env);
  const searchEnabled = env.BLS_SEARCH_ENABLED?.trim().toLowerCase() === "true";
  const emailEnabled = env.BLS_EMAIL_DELIVERY_ENABLED?.trim().toLowerCase() === "true";
  const boxNowEnabled = env.BOXNOW_ENABLED?.trim().toLowerCase() === "true";
  return {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections,
    connectionTimeoutMs,
    idleTimeoutMs,
    viva: env.VIVA_PAYMENTS_ENABLED?.trim().toLowerCase() === "true" ? vivaConfigFromEnv(env) : undefined,
    mediaMaxBytes,
    myData: myDataIssuance || env.AADE_MYDATA_USER_ID?.trim() ? myDataConfigFromEnv(env) : undefined,
    myDataIssuanceEnabled: myDataIssuance,
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim(),
    search: searchEnabled ? meilisearchConfigFromEnv(env) : undefined,
    resend: emailEnabled ? resendConfigFromEnv(env) : undefined,
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow: boxNowEnabled ? { apiUrl: env.BOXNOW_API_URL?.trim() || "https://api-production.boxnow.gr", clientId: env.BOXNOW_CLIENT_ID?.trim() || "", clientSecret: env.BOXNOW_CLIENT_SECRET?.trim() || "", warehouseNumber: env.BOXNOW_WAREHOUSE_NUMBER?.trim() || "", partnerId: env.BOXNOW_PARTNER_ID?.trim() || undefined } : undefined
  };
}