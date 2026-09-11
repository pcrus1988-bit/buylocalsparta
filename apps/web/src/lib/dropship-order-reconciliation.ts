import {
  reconcileNovaDropshipOrders,
  type DropshipOrderReconciliationRepository,
  type DropshipReconciliationResult,
  type DropshipReconciliationTarget,
  type ReconciledDropshipStatus
} from "../../../../integrations/dropship-suppliers/src/order-reconciliation.ts";
import {
  NovaV1Client,
  novaApiKeyFromEnvironment
} from "../../../../integrations/dropship-suppliers/src/nova-v1.ts";
import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";

const RECONCILIATION_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_RECONCILIATION_LIMIT = 50;

type CandidateRow = Readonly<{
  fulfilment_id: string;
  external_order_id: string;
  current_status: ReconciledDropshipStatus;
  provider_status: string | null;
  reconciliation_required: boolean;
  store_id: string | null;
  api_base_url: string | null;
  rate_limit_per_minute: unknown;
}>;

type ClientConfig = Readonly<{
  storeId: string;
  apiBaseUrl?: string;
  rateLimitPerMinute?: number;
}>;

type PreviousState = Readonly<{
  status: ReconciledDropshipStatus;
  providerStatus: string | null;
  reconciliationRequired: boolean;
}>;

export type DropshipOrderReconciliationSweep = DropshipReconciliationResult & Readonly<{
  databaseConfigured: boolean;
}>;

/**
 * Read-only supplier reconciliation sweep.
 *
 * Nova is only queried through GET /orders/{id}. The sweep never submits or retries an order.
 * Rows without an exact external_order_id are intentionally excluded, so a network-uncertain
 * POST remains locked for manual/exact reconciliation rather than risking a duplicate order.
 */
export async function runDropshipOrderReconciliationSweep(
  now = Date.now(),
  limit = DEFAULT_RECONCILIATION_LIMIT
): Promise<DropshipOrderReconciliationSweep> {
  if (!productionDatabaseConfigured()) {
    return { databaseConfigured: false, checked: 0, updated: 0, unchanged: 0, failed: 0 };
  }

  const repository = new PostgresDropshipOrderReconciliationRepository();
  const targets = await repository.previewTargets(now, limit);
  if (!targets.length) {
    return { databaseConfigured: true, checked: 0, updated: 0, unchanged: 0, failed: 0 };
  }
  repository.setPreview(targets);

  const apiKey = novaApiKeyFromEnvironment();
  const clients = new Map<string, NovaV1Client>();
  const result = await reconcileNovaDropshipOrders(
    repository,
    (target) => {
      const config = repository.clientConfig(target.fulfilmentId);
      const key = `${config.apiBaseUrl ?? "default"}|${config.rateLimitPerMinute ?? "default"}`;
      let client = clients.get(key);
      if (!client) {
        client = new NovaV1Client({
          apiKey,
          ...(config.apiBaseUrl ? { baseUrl: config.apiBaseUrl } : {}),
          ...(config.rateLimitPerMinute ? { requestsPerMinute: config.rateLimitPerMinute } : {})
        });
        clients.set(key, client);
      }
      return client;
    },
    { now: () => Date.now(), limit }
  );

  return { databaseConfigured: true, ...result };
}

class PostgresDropshipOrderReconciliationRepository implements DropshipOrderReconciliationRepository {
  readonly #clientConfig = new Map<string, ClientConfig>();
  readonly #previous = new Map<string, PreviousState>();
  #preview: readonly DropshipReconciliationTarget[] | null = null;

  async previewTargets(now: number, limit: number): Promise<readonly DropshipReconciliationTarget[]> {
    if (!Number.isFinite(now)) throw new Error("Invalid dropship reconciliation timestamp");
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250) {
      throw new Error("Dropship reconciliation limit must be an integer between 1 and 250");
    }

    const runtime = getProductionPostgresRuntime();
    const staleBefore = new Date(now - RECONCILIATION_STALE_AFTER_MS);
    const result = await runtime.nativePool.query<CandidateRow>(`
      SELECT df.public_id AS fulfilment_id,
             df.external_order_id,
             df.status::text AS current_status,
             df.provider_status,
             df.reconciliation_required,
             ds.configuration->>'storeId' AS store_id,
             ds.configuration->>'apiBaseUrl' AS api_base_url,
             ds.configuration->'rateLimitPerMinute' AS rate_limit_per_minute
        FROM dropship_fulfilments df
        JOIN dropship_suppliers ds ON ds.id=df.supplier_id
       WHERE ds.active=true
         AND ds.provider_kind='brandsgateway_shopwoo'
         AND df.external_order_id IS NOT NULL
         AND (df.reconciliation_required=true OR ds.tracking_sync_enabled=true)
         AND (df.reconciliation_required=true OR df.status NOT IN ('delivered','cancelled','failed','refunded'))
         AND (df.last_synced_at IS NULL OR df.last_synced_at <= $1)
       ORDER BY df.reconciliation_required DESC,df.last_synced_at NULLS FIRST,df.updated_at,df.public_id
       LIMIT $2
    `, [staleBefore, limit]);

    this.#clientConfig.clear();
    this.#previous.clear();

    return result.rows.map((row) => {
      const storeId = row.store_id?.trim() ?? "";
      const apiBaseUrl = row.api_base_url?.trim() || undefined;
      const rateLimitPerMinute = optionalPositiveInteger(row.rate_limit_per_minute);
      this.#clientConfig.set(row.fulfilment_id, {
        storeId,
        ...(apiBaseUrl ? { apiBaseUrl } : {}),
        ...(rateLimitPerMinute ? { rateLimitPerMinute } : {})
      });
      this.#previous.set(row.fulfilment_id, {
        status: row.current_status,
        providerStatus: row.provider_status,
        reconciliationRequired: row.reconciliation_required
      });
      return {
        fulfilmentId: row.fulfilment_id,
        externalOrderId: row.external_order_id,
        storeId,
        currentStatus: row.current_status
      };
    });
  }

  setPreview(targets: readonly DropshipReconciliationTarget[]): void {
    this.#preview = targets;
  }

  async listTargets(now: number, limit: number): Promise<readonly DropshipReconciliationTarget[]> {
    if (this.#preview) {
      const preview = this.#preview;
      this.#preview = null;
      return preview.slice(0, limit);
    }
    return this.previewTargets(now, limit);
  }

  clientConfig(fulfilmentId: string): ClientConfig {
    const config = this.#clientConfig.get(fulfilmentId);
    if (!config) throw new Error(`Missing Nova reconciliation configuration for ${fulfilmentId}`);
    if (!config.storeId) throw new Error(`Nova storeId is missing for ${fulfilmentId}`);
    return config;
  }

  async markSynced(input: {
    fulfilmentId: string;
    externalOrderId: string;
    providerStatus: string;
    status: ReconciledDropshipStatus;
    raw: Readonly<Record<string, unknown>>;
    now: number;
  }): Promise<"updated" | "unchanged"> {
    const previous = this.#previous.get(input.fulfilmentId);
    const changed = !previous
      || previous.status !== input.status
      || previous.providerStatus !== input.providerStatus
      || previous.reconciliationRequired;

    const runtime = getProductionPostgresRuntime();
    const syncedAt = new Date(input.now);
    const result = await runtime.nativePool.query(`
      UPDATE dropship_fulfilments
         SET status=$3,
             provider_status=$4,
             response_payload=$5::jsonb,
             last_synced_at=$6,
             reconciliation_required=false,
             last_error=NULL,
             updated_at=$6
       WHERE public_id=$1
         AND external_order_id=$2
       RETURNING public_id
    `, [
      input.fulfilmentId,
      input.externalOrderId,
      input.status,
      input.providerStatus.slice(0, 200),
      JSON.stringify(input.raw),
      syncedAt
    ]);
    if (!result.rowCount) throw new Error(`Dropship fulfilment ${input.fulfilmentId} could not be reconciled`);

    this.#previous.set(input.fulfilmentId, {
      status: input.status,
      providerStatus: input.providerStatus,
      reconciliationRequired: false
    });
    return changed ? "updated" : "unchanged";
  }

  async markSyncError(fulfilmentId: string, message: string, now: number): Promise<void> {
    const runtime = getProductionPostgresRuntime();
    await runtime.nativePool.query(`
      UPDATE dropship_fulfilments
         SET last_synced_at=$2,last_error=$3,updated_at=$2
       WHERE public_id=$1
    `, [fulfilmentId, new Date(now), message.slice(0, 1000)]);
  }
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 60 ? parsed : undefined;
}
