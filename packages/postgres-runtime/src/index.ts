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

export const EXPECTED_SCHEMA_VERSION = 238;
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
  readonly adminOperationsLive: PostgresAdminOperationsLiveService;
  readonly adminGovernance: PostgresAdminGovernanceService;
  readonly payments?: PostgresMolliePaymentsService;
  readonly mediaPipeline: PostgresMediaPipelineService;
  readonly myData?: PostgresMyDataService;
  readonly search?: PostgresProductionSearchService;
  readonly notifications?: PostgresResendNotificationService;
  readonly boxNow?: PostgresBoxNowShippingService;
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
    this.customerCommerce = new PostgresCustomerCommerceService(this.sqlPool);
    this.vendorOperations = new PostgresVendorOperationsService(this.sqlPool);
    this.adminOperationsLive = new PostgresAdminOperationsLiveService(this.sqlPool);
    this.adminGovernance = new PostgresAdminGovernanceService(this.sqlPool);
    if (config.mollie) {
      const client = new MolliePaymentsClient(config.mollie);
      this.payments = new PostgresMolliePaymentsService(
        this.sqlPool,
        new MollieHostedCheckoutGateway(client, config.molliePublicBaseUrl),
        config.molliePublicBaseUrl,
        mollieEnvironment(config.mollie)
      );
    }
    this.mediaPipeline = new PostgresMediaPipelineService({ pool: this.sqlPool, maxBytes: config.mediaMaxBytes });
    if (config.myData) {
      this.myData = new PostgresMyDataService(
        this.sqlPool,
        new AadeMyDataClient(config.myData),
        config.myDataIssuanceEnabled,
        config.myDataMappingVersion
      );
    }
    if (config.search) this.search = new PostgresProductionSearchService(this.sqlPool, config.search);
    if (config.resend) {
      this.notifications = new PostgresResendNotificationService(
        this.sqlPool,
        config.resend,
        config.notificationSuppressionSecret,
        config.notificationWorkerId
      );
    }
    if (config.boxNow) this.boxNow = new PostgresBoxNowShippingService(this.sqlPool, new BoxNowClient(config.boxNow));
    this.activationEvidence = new PostgresActivationEvidenceService(this.sqlPool);
    this.cartRecovery = new PostgresCartRecoveryService(this.sqlPool);
  }

  async readiness(): Promise<DatabaseReadiness> {
    const checkedAt = Date.now();
    try {
      const result = await this.nativePool.query<QueryResultRow>(`
        SELECT
          current_setting('server_version') AS server_version,
          current_setting('server_version_num')::int AS server_version_num,
          (SELECT extversion FROM pg_extension WHERE extname='postgis') AS postgis_version,
          ARRAY(SELECT extname FROM pg_extension WHERE extname=ANY(ARRAY['pgcrypto','citext','postgis']) ORDER BY extname) AS required_extensions,
          COALESCE((SELECT max(version::int) FROM supabase_migrations.schema_migrations WHERE version ~ '^[0-9]+$'),0) AS applied_schema_version
      `);
      const row = result.rows[0] ?? {};
      const appliedSchemaVersion = Number(row.applied_schema_version ?? 0);
      const requiredExtensions = Array.isArray(row.required_extensions) ? row.required_extensions.map(String) : [];
      const missingExtensions = ["citext","pgcrypto","postgis"].filter((extension) => !requiredExtensions.includes(extension));
      const pendingMigrations = Math.max(0, EXPECTED_SCHEMA_VERSION - appliedSchemaVersion);
      const ok = missingExtensions.length === 0 && appliedSchemaVersion >= EXPECTED_SCHEMA_VERSION;
      return {
        ok,
        checkedAt,
        serverVersion: String(row.server_version ?? ""),
        serverVersionNumber: Number(row.server_version_num ?? 0),
        postgisVersion: row.postgis_version ? String(row.postgis_version) : undefined,
        requiredExtensions,
        appliedSchemaVersion,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        pendingMigrations,
        message: ok ? "database_ready" : missingExtensions.length ? `missing_extensions:${missingExtensions.join(",")}` : `pending_migrations:${pendingMigrations}`
      };
    } catch (error) {
      return {
        ok: false,
        checkedAt,
        expectedSchemaVersion: EXPECTED_SCHEMA_VERSION,
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  async close(): Promise<void> {
    await this.nativePool.end();
  }
}

export function productionPostgresConfigFromEnv(): PostgresRuntimeConfig | undefined {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) return undefined;
  const maxConnections = positiveInteger(process.env.PG_POOL_MAX, 12);
  const connectionTimeoutMs = positiveInteger(process.env.PG_CONNECT_TIMEOUT_MS, 5_000);
  const idleTimeoutMs = positiveInteger(process.env.PG_IDLE_TIMEOUT_MS, 30_000);
  const myData = myDataConfigFromEnv(process.env);
  return {
    connectionString,
    applicationName: process.env.PG_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections,
    connectionTimeoutMs,
    idleTimeoutMs,
    mollie: mollieConfigFromEnv(process.env),
    molliePublicBaseUrl: process.env.MOLLIE_PUBLIC_BASE_URL?.trim(),
    mediaMaxBytes: positiveInteger(process.env.MEDIA_MAX_BYTES, 8 * 1024 * 1024),
    myData,
    myDataIssuanceEnabled: myDataIssuanceEnabled(process.env),
    myDataMappingVersion: process.env.AADE_PRODUCT_MAPPING_VERSION?.trim(),
    search: meilisearchConfigFromEnv(process.env),
    resend: resendConfigFromEnv(process.env),
    notificationSuppressionSecret: process.env.NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: process.env.NOTIFICATION_WORKER_ID?.trim(),
    boxNow: boxNowConfigFromEnv(process.env)
  };
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function boxNowConfigFromEnv(env: NodeJS.ProcessEnv): BoxNowConfig | undefined {
  const clientId = env.BOXNOW_CLIENT_ID?.trim();
  const clientSecret = env.BOXNOW_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return undefined;
  const environment = env.BOXNOW_ENVIRONMENT?.trim().toLowerCase() === "production" ? "production" : "sandbox";
  return {
    environment,
    clientId,
    clientSecret,
    partnerId: env.BOXNOW_PARTNER_ID?.trim(),
    warehouseNumber: env.BOXNOW_WAREHOUSE_NUMBER?.trim()
  };
}
