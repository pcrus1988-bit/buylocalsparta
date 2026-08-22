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

export const EXPECTED_SCHEMA_VERSION = 116;

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
    this.notifications = config.resend && config.notificationSuppressionSecret ? new PostgresResendNotificationService({ db: this.sqlPool, store: this.persistence.notificationOperations, attemptSink: this.persistence.notificationOperations, config: config.resend, suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId ?? `${config.applicationName}:notifications` }) : undefined;
    this.boxNowShipping = config.boxNow ? new PostgresBoxNowShippingService(this.sqlPool, new BoxNowClient(config.boxNow)) : undefined;
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
  }

  async readiness(expectedSchemaVersion = EXPECTED_SCHEMA_VERSION): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const result = await this.nativePool.query(`
        SELECT current_setting('server_version') AS server_version,
               current_setting('server_version_num') AS server_version_num,
               COALESCE((SELECT extversion FROM pg_extension WHERE extname='postgis'), '') AS postgis_version,
               EXISTS(SELECT 1 FROM pg_extension WHERE extname='pgcrypto') AS has_pgcrypto,
               EXISTS(SELECT 1 FROM pg_extension WHERE extname='citext') AS has_citext,
               COALESCE((SELECT MAX(version) FROM schema_migrations), 0) AS schema_version
      `);
      const row = result.rows[0] ?? {};
      const serverVersion = String(row.server_version ?? "");
      const serverVersionNumber = Number(row.server_version_num ?? 0);
      const postgisVersion = String(row.postgis_version ?? "");
      const appliedSchemaVersion = Number(row.schema_version ?? 0);
      const pendingMigrations = Math.max(0, expectedSchemaVersion - appliedSchemaVersion);
      const schemaCurrent = appliedSchemaVersion === expectedSchemaVersion;
      const requiredExtensions = [postgisVersion ? "postgis" : "", row.has_pgcrypto === true ? "pgcrypto" : "", row.has_citext === true ? "citext" : ""].filter(Boolean);
      const extensionsReady = requiredExtensions.length === 3;
      const serverMajorReady = serverVersionNumber >= 170000 && serverVersionNumber < 190000;
      return {
        ok: schemaCurrent && extensionsReady && serverMajorReady,
        checkedAt,
        serverVersion,
        serverVersionNumber,
        postgisVersion: postgisVersion || undefined,
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion,
        pendingMigrations,
        message: !serverMajorReady
          ? `PostgreSQL 17.x or 18.x is required; server reports ${serverVersion || serverVersionNumber}`
          : !extensionsReady
            ? `Required extensions are incomplete; found ${requiredExtensions.join(", ") || "none"}`
            : !schemaCurrent
              ? `Database schema ${appliedSchemaVersion} does not match expected ${expectedSchemaVersion}`
              : "PostgreSQL 17/18 with PostGIS schema is ready"
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        expectedSchemaVersion,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<void> { await this.nativePool.end(); }
}

export function postgresConfigFromEnv(env: NodeJS.ProcessEnv = process.env, applicationName = "buy-local-sparta"): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  return {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || applicationName,
    maxConnections: positiveInteger(env.BLS_DB_POOL_MAX, 10, "BLS_DB_POOL_MAX"),
    connectionTimeoutMs: positiveInteger(env.BLS_DB_CONNECT_TIMEOUT_MS, 5_000, "BLS_DB_CONNECT_TIMEOUT_MS"),
    idleTimeoutMs: positiveInteger(env.BLS_DB_IDLE_TIMEOUT_MS, 30_000, "BLS_DB_IDLE_TIMEOUT_MS"),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: positiveInteger(env.BLS_MEDIA_MAX_BYTES, 20 * 1024 * 1024, "BLS_MEDIA_MAX_BYTES"),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_APPROVED_MAPPING_VERSION?.trim() || undefined,
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim() || undefined,
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim() || undefined,
    boxNow: boxNowConfigFromEnv(env)
  };
}

export function createPostgresRuntimeFromEnv(overrides: Readonly<{ applicationName?: string }> = {}): ProductionPostgresRuntime {
  const applicationName = overrides.applicationName ?? process.env.BLS_DB_APPLICATION_NAME?.trim() ?? "buy-local-sparta";
  return new ProductionPostgresRuntime(postgresConfigFromEnv(process.env, applicationName));
}

function positiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (!raw?.trim()) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}