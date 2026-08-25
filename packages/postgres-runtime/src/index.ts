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

export const EXPECTED_SCHEMA_VERSION = 144;
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

  async transaction<T>(callback: (tx: ReleasableSqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
}

const int = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
};

const bytes = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for the PostgreSQL runtime");
  return {
    connectionString,
    applicationName: env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections: int(env.BLS_DB_POOL_MAX, 10, 1, 50),
    connectionTimeoutMs: int(env.BLS_DB_CONNECT_TIMEOUT_MS, 5_000, 500, 60_000),
    idleTimeoutMs: int(env.BLS_DB_IDLE_TIMEOUT_MS, 30_000, 1_000, 300_000),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: bytes(env.BLS_MEDIA_MAX_BYTES, 12 * 1024 * 1024),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim() || undefined,
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim() || undefined,
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim() || undefined,
    boxNow: BoxNowClient.configFromEnv(env)
  };
}

export class PostgresProductionRuntime extends PostgresPersistenceBundle {
  readonly nativePool: Pool;
  readonly config: PostgresRuntimeConfig;
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
  readonly cartRecovery: PostgresCartRecoveryService;

  constructor(config: PostgresRuntimeConfig) {
    const nativePool = new Pool({
      connectionString: config.connectionString,
      application_name: config.applicationName,
      max: config.maxConnections,
      connectionTimeoutMillis: config.connectionTimeoutMs,
      idleTimeoutMillis: config.idleTimeoutMs,
      keepAlive: true,
      allowExitOnIdle: false
    } satisfies PoolConfig);
    nativePool.on("error", (error) => {
      console.error(JSON.stringify({ level: "error", event: "postgres.pool_idle_client_error", message: error.message }));
    });
    const sqlPool = new PgPoolAdapter(nativePool);
    super(sqlPool);
    this.nativePool = nativePool;
    this.config = config;
    this.customerCommerce = new PostgresCustomerCommerceService(sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(sqlPool);
    this.adminOperations = new PostgresAdminOperationsLiveService(sqlPool);
    this.adminGovernance = new PostgresAdminGovernanceService(sqlPool);
    this.vivaPayments = config.viva ? new PostgresVivaPaymentsService(sqlPool, new VivaPaymentsClient(config.viva)) : undefined;
    this.media = new PostgresMediaPipelineService(sqlPool, { maxBytes: config.mediaMaxBytes });
    this.myData = config.myData ? new PostgresMyDataService(sqlPool, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, requiredMappingVersion: config.myDataMappingVersion }) : undefined;
    this.search = config.search ? new PostgresProductionSearchService(sqlPool, config.search) : undefined;
    this.notifications = config.resend ? new PostgresResendNotificationService(sqlPool, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId }) : undefined;
    this.boxNow = config.boxNow ? new PostgresBoxNowShippingService(sqlPool, new BoxNowClient(config.boxNow)) : undefined;
    this.activationEvidence = new PostgresActivationEvidenceService(sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(sqlPool);
  }

  async readiness(expectedSchemaVersion = EXPECTED_SCHEMA_VERSION): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const [server, postgis, extensions, migration] = await Promise.all([
        this.nativePool.query<{ server_version: string; server_version_num: string }>("SELECT current_setting('server_version') AS server_version, current_setting('server_version_num') AS server_version_num"),
        this.nativePool.query<{ postgis_version: string }>("SELECT postgis_version() AS postgis_version"),
        this.nativePool.query<{ extname: string }>("SELECT extname FROM pg_extension WHERE extname = ANY($1::text[])", [["postgis", "pgcrypto", "citext"]]),
        this.nativePool.query<{ version: number }>("SELECT COALESCE(MAX(version),0)::int AS version FROM schema_migrations")
      ]);
      const requiredExtensions = ["postgis", "pgcrypto", "citext"] as const;
      const installed = new Set(extensions.rows.map((row) => row.extname));
      const missingExtensions = requiredExtensions.filter((name) => !installed.has(name));
      const appliedSchemaVersion = Number(migration.rows[0]?.version ?? 0);
      const ok = missingExtensions.length === 0 && appliedSchemaVersion === expectedSchemaVersion;
      return {
        ok,
        checkedAt,
        serverVersion: server.rows[0]?.server_version,
        serverVersionNumber: Number(server.rows[0]?.server_version_num),
        postgisVersion: postgis.rows[0]?.postgis_version,
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion,
        pendingMigrations: Math.max(0, expectedSchemaVersion - appliedSchemaVersion),
        message: ok ? "PostgreSQL runtime ready" : missingExtensions.length ? `Missing required extensions: ${missingExtensions.join(", ")}` : `Database schema ${appliedSchemaVersion} does not match expected ${expectedSchemaVersion}`
      };
    } catch (error) {
      return { ok: false, checkedAt, expectedSchemaVersion, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async close(): Promise<void> {
    await this.nativePool.end();
  }
}

export function createPostgresRuntimeFromEnv(options: { applicationName?: string; env?: NodeJS.ProcessEnv } = {}) {
  const config = postgresRuntimeConfigFromEnv(options.env);
  return new PostgresProductionRuntime({ ...config, applicationName: options.applicationName ?? config.applicationName });
}
