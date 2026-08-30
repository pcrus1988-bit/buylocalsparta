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

export const EXPECTED_SCHEMA_VERSION = 169;
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

export function createPostgresRuntime(config: PostgresRuntimeConfig) {
  const ssl = config.connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({
    connectionString: config.connectionString,
    application_name: config.applicationName,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    ssl
  } satisfies PoolConfig);
  const sqlPool: SqlPool = {
    async connect(): Promise<ReleasableSqlExecutor> {
      const client = await pool.connect();
      return {
        query: async <T extends SqlRow = SqlRow>(text: string, params?: readonly unknown[]): Promise<SqlQueryResult<T>> => {
          const result = await client.query<QueryResultRow>(text, params as unknown[] | undefined);
          return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
        },
        release: () => client.release()
      };
    }
  };
  const persistence = new PostgresPersistenceBundle(sqlPool);
  const adminOperations = new PostgresAdminOperationsLiveService(sqlPool);
  const adminGovernance = new PostgresAdminGovernanceService(sqlPool);
  const customerCommerce = new PostgresCustomerCommerceService(sqlPool);
  const vendorOperations = new PostgresVendorOperationsService(sqlPool);
  const media = new PostgresMediaPipelineService(sqlPool, { maxBytes: config.mediaMaxBytes });
  const vivaPayments = config.viva ? new PostgresVivaPaymentsService(sqlPool, new VivaPaymentsClient(config.viva)) : undefined;
  const myData = config.myData ? new PostgresMyDataService(sqlPool, new AadeMyDataClient(config.myData), { issuanceEnabled: config.myDataIssuanceEnabled, approvedMappingVersion: config.myDataMappingVersion }) : undefined;
  const search = config.search ? new PostgresProductionSearchService(sqlPool, config.search) : undefined;
  const notifications = config.resend ? new PostgresResendNotificationService(sqlPool, config.resend, { suppressionSecret: config.notificationSuppressionSecret, workerId: config.notificationWorkerId }) : undefined;
  const boxNow = config.boxNow ? new PostgresBoxNowShippingService(sqlPool, new BoxNowClient(config.boxNow)) : undefined;
  const activationEvidence = new PostgresActivationEvidenceService(sqlPool);
  const cartRecovery = new PostgresCartRecoveryService(sqlPool);
  return { pool, sqlPool, persistence, adminOperations, adminGovernance, customerCommerce, vendorOperations, media, vivaPayments, myData, search, notifications, boxNow, activationEvidence, cartRecovery } as const;
}

export function postgresConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  return {
    connectionString,
    applicationName: env.BLS_POSTGRES_APPLICATION_NAME?.trim() || "buy-local-sparta-web",
    maxConnections: Number(env.BLS_POSTGRES_MAX_CONNECTIONS ?? 10),
    connectionTimeoutMs: Number(env.BLS_POSTGRES_CONNECTION_TIMEOUT_MS ?? 10_000),
    idleTimeoutMs: Number(env.BLS_POSTGRES_IDLE_TIMEOUT_MS ?? 30_000),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: Number(env.BLS_MEDIA_MAX_BYTES ?? 20 * 1024 * 1024),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.BLS_MYDATA_MAPPING_VERSION?.trim(),
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.BLS_NOTIFICATION_SUPPRESSION_SECRET?.trim(),
    notificationWorkerId: env.BLS_NOTIFICATION_WORKER_ID?.trim(),
    boxNow: env.BLS_BOXNOW_CLIENT_ID?.trim() && env.BLS_BOXNOW_CLIENT_SECRET?.trim() ? {
      clientId: env.BLS_BOXNOW_CLIENT_ID.trim(),
      clientSecret: env.BLS_BOXNOW_CLIENT_SECRET.trim(),
      baseUrl: env.BLS_BOXNOW_BASE_URL?.trim() || "https://api-production.boxnow.gr"
    } : undefined
  };
}
