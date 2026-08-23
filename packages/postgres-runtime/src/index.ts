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

export const EXPECTED_SCHEMA_VERSION = 125;

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
  boxnow?: BoxNowConfig;
}>;

export function postgresRuntimeConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRuntimeConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for PostgreSQL runtime");
  return {
    connectionString,
    applicationName: env.POSTGRES_APPLICATION_NAME ?? "buy-local-sparta",
    maxConnections: positiveInt(env.POSTGRES_POOL_MAX, 20),
    connectionTimeoutMs: positiveInt(env.POSTGRES_CONNECT_TIMEOUT_MS, 10_000),
    idleTimeoutMs: positiveInt(env.POSTGRES_IDLE_TIMEOUT_MS, 30_000),
    viva: vivaConfigFromEnv(env),
    mediaMaxBytes: positiveInt(env.MEDIA_MAX_BYTES, 10 * 1024 * 1024),
    myData: myDataConfigFromEnv(env),
    myDataIssuanceEnabled: myDataIssuanceEnabled(env),
    myDataMappingVersion: env.MYDATA_MAPPING_VERSION,
    search: meilisearchConfigFromEnv(env),
    resend: resendConfigFromEnv(env),
    notificationSuppressionSecret: env.NOTIFICATION_SUPPRESSION_SECRET,
    boxnow: boxNowConfigFromEnv(env)
  };
}

export function createPostgresPool(config: PostgresRuntimeConfig): SqlPool {
  const poolConfig: PoolConfig = {
    connectionString: config.connectionString,
    application_name: config.applicationName,
    max: config.maxConnections,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs
  };
  const pool = new Pool(poolConfig);
  return {
    connect: async (): Promise<ReleasableSqlExecutor> => {
      const client = await pool.connect();
      return postgresExecutor(client);
    }
  };
}

export function createPostgresPersistence(config: PostgresRuntimeConfig) {
  const sqlPool = createPostgresPool(config);
  return {
    sqlPool,
    persistence: new PostgresPersistenceBundle(sqlPool),
    customerCommerce: new PostgresCustomerCommerceService(sqlPool),
    vendorOperations: new PostgresVendorOperationsService(sqlPool),
    adminOperations: new PostgresAdminOperationsLiveService(sqlPool),
    adminGovernance: new PostgresAdminGovernanceService(sqlPool),
    vivaPayments: config.viva ? new PostgresVivaPaymentsService(sqlPool, new VivaPaymentsClient(config.viva)) : undefined,
    mediaPipeline: new PostgresMediaPipelineService(sqlPool, { maxBytes: config.mediaMaxBytes }),
    myData: config.myData ? new PostgresMyDataService(sqlPool, new AadeMyDataClient(config.myData), {
      issuanceEnabled: config.myDataIssuanceEnabled,
      mappingVersion: config.myDataMappingVersion
    }) : undefined,
    search: config.search ? new PostgresProductionSearchService(sqlPool, config.search) : undefined,
    notifications: config.resend ? new PostgresResendNotificationService(sqlPool, config.resend, {
      suppressionSecret: config.notificationSuppressionSecret
    }) : undefined,
    boxnow: config.boxnow ? new PostgresBoxNowShippingService(sqlPool, new BoxNowClient(config.boxnow)) : undefined,
    activationEvidence: new PostgresActivationEvidenceService(sqlPool)
  };
}

function postgresExecutor(client: PoolClient): ReleasableSqlExecutor {
  return {
    query: async <Row extends SqlRow = SqlRow>(sql: string, params?: readonly unknown[]): Promise<SqlQueryResult<Row>> => {
      const result = await client.query<QueryResultRow>(sql, params ? [...params] : undefined);
      return { rows: result.rows as Row[], rowCount: result.rowCount ?? result.rows.length };
    },
    release: async () => { client.release(); }
  };
}

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function boxNowConfigFromEnv(env: NodeJS.ProcessEnv): BoxNowConfig | undefined {
  const apiUrl = env.BOXNOW_API_URL?.trim();
  const clientId = env.BOXNOW_CLIENT_ID?.trim();
  const clientSecret = env.BOXNOW_CLIENT_SECRET?.trim();
  const partnerId = env.BOXNOW_PARTNER_ID?.trim();
  if (!apiUrl || !clientId || !clientSecret || !partnerId) return undefined;
  return { apiUrl, clientId, clientSecret, partnerId };
}
