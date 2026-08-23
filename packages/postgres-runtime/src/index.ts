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

export const EXPECTED_SCHEMA_VERSION = 132;
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

export class PostgresRuntime {
  readonly #pool: Pool;
  readonly persistence: PostgresPersistenceBundle;
  readonly customerCommerce: PostgresCustomerCommerceService;
  readonly vendorOperations: PostgresVendorOperationsService;
  readonly adminOperations: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly vivaPayments?: PostgresVivaPaymentsService;
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData: PostgresMyDataService;
  readonly search: PostgresProductionSearchService;
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
    this.#pool = new Pool(poolConfig);
    const sql = new PgPoolAdapter(this.#pool);
    this.persistence = new PostgresPersistenceBundle(sql);
    this.customerCommerce = new PostgresCustomerCommerceService(sql);
    this.vendorOperations = new PostgresVendorOperationsService(sql);
    this.adminOperations = new PostgresAdminOperationsLiveService(sql);
    this.adminGovernance = new PostgresAdminGovernanceService(sql);
    this.mediaPipeline = new PostgresMediaPipelineService(sql, { maxBytes: config.mediaMaxBytes });
    this.myData = new PostgresMyDataService(sql, config.myData, config.myDataIssuanceEnabled, config.myDataMappingVersion);
    this.search = new PostgresProductionSearchService(sql, config.search);
    if (config.resend) this.notifications = new PostgresResendNotificationService(sql, config.resend, config.notificationSuppressionSecret, config.notificationWorkerId);
    if (config.viva) this.vivaPayments = new PostgresVivaPaymentsService(sql, new VivaPaymentsClient(config.viva));
    if (config.boxNow) this.boxNowShipping = new PostgresBoxNowShippingService(sql, new BoxNowClient(config.boxNow));
    this.activationEvidence = new PostgresActivationEvidenceService(sql);
  }

  async readiness(): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    const client = await this.#pool.connect();
    try {
      const server = await client.query<{ server_version: string; server_version_num: string }>(
        "select current_setting('server_version') as server_version, current_setting('server_version_num') as server_version_num"
      );
      const versionNumber = Number(server.rows[0]?.server_version_num ?? 0);
      if (!Number.isFinite(versionNumber) || versionNumber < 170000 || versionNumber >= 190000) {
        return {
          ok: false,
          checkedAt,
          serverVersion: server.rows[0]?.server_version,
          serverVersionNumber: versionNumber,
          expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
          message: `Unsupported PostgreSQL version ${server.rows[0]?.server_version ?? "unknown"}; expected PostgreSQL 17 or 18`
        };
      }

      const extensions = await client.query<{ extname: string; extversion: string }>(
        "select extname, extversion from pg_extension where extname in ('postgis','pgcrypto','citext')"
      );
      const present = new Map(extensions.rows.map((row) => [row.extname, row.extversion]));
      const requiredExtensions = ["postgis", "pgcrypto", "citext"] as const;
      const missing = requiredExtensions.filter((name) => !present.has(name));
      if (missing.length > 0) {
        return {
          ok: false,
          checkedAt,
          serverVersion: server.rows[0]?.server_version,
          serverVersionNumber: versionNumber,
          requiredExtensions,
          expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
          message: `Missing required PostgreSQL extensions: ${missing.join(", ")}`
        };
      }

      const migrations = await client.query<{ version: number }>(
        "select version from schema_migrations order by version"
      );
      const appliedSchemaVersion = migrations.rows.at(-1)?.version ?? 0;
      const pendingMigrations = Math.max(0, EXPECTED_SCHEMA_VERSION - appliedSchemaVersion);
      const ok = appliedSchemaVersion >= EXPECTED_SCHEMA_VERSION;
      return {
        ok,
        checkedAt,
        serverVersion: server.rows[0]?.server_version,
        serverVersionNumber: versionNumber,
        postgisVersion: present.get("postgis"),
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        pendingMigrations,
        message: ok ? "PostgreSQL 17/18 with PostGIS schema is ready" : `Database schema is behind by ${pendingMigrations} migration(s)`
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.#pool.end();
  }
}

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig | undefined {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) return undefined;
  const mediaMaxBytes = Number(env.BLS_MEDIA_MAX_BYTES ?? 10 * 1024 * 1024);
  const maxConnections = Number(env.BLS_DB_POOL_MAX ?? 10);
  const connectionTimeoutMs = Number(env.BLS_DB_CONNECT_TIMEOUT_MS ?? 5_000);
  const idleTimeoutMs = Number(env.BLS_DB_IDLE_TIMEOUT_MS ?? 30_000);
  const applicationName = env.BLS_DB_APPLICATION_NAME?.trim() || "buy-local-sparta";
  const viva = vivaConfigFromEnv(env);
  const myData = myDataConfigFromEnv(env);
  const search = meilisearchConfigFromEnv(env);
  const resend = resendConfigFromEnv(env);
  const boxNow = env.BOXNOW_CLIENT_ID && env.BOXNOW_CLIENT_SECRET && env.BOXNOW_WAREHOUSE_ID && env.BOXNOW_PARTNER_ID
    ? {
        apiBaseUrl: env.BOXNOW_API_BASE_URL?.trim() || "https://api-production.boxnow.gr",
        clientId: env.BOXNOW_CLIENT_ID.trim(),
        clientSecret: env.BOXNOW_CLIENT_SECRET.trim(),
        warehouseId: env.BOXNOW_WAREHOUSE_ID.trim(),
        partnerId: env.BOXNOW_PARTNER_ID.trim(),
        timeoutMs: Number(env.BOXNOW_TIMEOUT_MS ?? 10_000)
      }
    : undefined;
  return {
    connectionString,
    applicationName,
    maxConnections: Number.isFinite(maxConnections) && maxConnections > 0 ? maxConnections : 10,
    connectionTimeoutMs: Number.isFinite(connectionTimeoutMs) && connectionTimeoutMs > 0 ? connectionTimeoutMs : 5_000,
    idleTimeoutMs: Number.isFinite(idleTimeoutMs) && idleTimeoutMs > 0 ? idleTimeoutMs : 30_000,
    viva,
    mediaMaxBytes: Number.isFinite(mediaMaxBytes) && mediaMaxBytes > 0 ? mediaMaxBytes : 10 * 1024 * 1024,
    myData,
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.MYDATA_MAPPING_VERSION?.trim(),
    search,
    resend,
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow,
  };
}
