import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { assertAdminPermission, recordAdminAudit } from "./admin-runtime";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { syncVendorProductFeedAsPlatform } from "./vendor-product-feed-scheduler";

export type AdminVendorProductFeed = Readonly<{
  id: string;
  vendorId: string;
  vendorName: string;
  name: string;
  sourceType: "url" | "upload";
  sourceUrl?: string;
  sourceFilename?: string;
  status: string;
  syncIntervalMinutes: number;
  productCount: number;
  readyCount: number;
  errorCount: number;
  presentItems: number;
  missingItems: number;
  retiredItems: number;
  linkedOffers: number;
  lastSyncAt?: number;
  lastSuccessAt?: number;
  nextSyncAt?: number;
  lastError?: string;
}>;

export type AdminVendorProductFeedRun = Readonly<{
  id: string;
  feedId: string;
  feedName: string;
  vendorName: string;
  triggerType: string;
  status: string;
  totalRows: number;
  validRows: number;
  errorRows: number;
  createdSubmissions: number;
  updatedSubmissions: number;
  updatedOffers: number;
  protectedInventoryRows: number;
  missingRows: number;
  errorMessage?: string;
  startedAt: number;
  finishedAt?: number;
}>;

export type AdminVendorProductFeedWorkspace = Readonly<{
  csrfToken: string;
  feeds: readonly AdminVendorProductFeed[];
  recentRuns: readonly AdminVendorProductFeedRun[];
}>;

function epoch(value: unknown): number | undefined {
  if (value == null) return undefined;
  const parsed = value instanceof Date ? value.getTime() : new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : undefined;
}

function int(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isSafeInteger(parsed) ? parsed : 0;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export async function adminVendorProductFeedWorkspace(
  principal: SessionPrincipal
): Promise<AdminVendorProductFeedWorkspace> {
  assertAdminPermission(principal, "catalog.read");
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const feeds = await client.query<SqlRow>(`
      SELECT
        f.public_id,
        COALESCE(v.public_id,v.id::text) AS vendor_public_id,
        v.trading_name AS vendor_name,
        f.name,
        f.source_type,
        f.source_url,
        f.source_filename,
        f.status,
        f.sync_interval_minutes,
        f.product_count,
        f.ready_count,
        f.error_count,
        f.last_sync_at,
        f.last_success_at,
        f.next_sync_at,
        f.last_error,
        COALESCE(stats.present_items,0)::integer AS present_items,
        COALESCE(stats.missing_items,0)::integer AS missing_items,
        COALESCE(stats.retired_items,0)::integer AS retired_items,
        COALESCE(stats.linked_offers,0)::integer AS linked_offers
      FROM public.vendor_product_feeds f
      JOIN public.vendor_businesses v ON v.id=f.vendor_id
      LEFT JOIN LATERAL (
        SELECT
          count(*) FILTER (WHERE i.state='present') AS present_items,
          count(*) FILTER (WHERE i.state='missing') AS missing_items,
          count(*) FILTER (WHERE i.state='retired') AS retired_items,
          count(*) FILTER (WHERE i.offer_id IS NOT NULL) AS linked_offers
        FROM public.vendor_product_feed_items i
        WHERE i.feed_id=f.id
      ) stats ON true
      ORDER BY
        CASE f.status WHEN 'error' THEN 0 WHEN 'active' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END,
        f.updated_at DESC,
        f.id DESC
      LIMIT 250
    `);
    const runs = await client.query<SqlRow>(`
      SELECT
        r.public_id,
        f.public_id AS feed_public_id,
        f.name AS feed_name,
        v.trading_name AS vendor_name,
        r.trigger_type,
        r.status,
        r.total_rows,
        r.valid_rows,
        r.error_rows,
        r.created_submissions,
        r.updated_submissions,
        r.updated_offers,
        r.protected_inventory_rows,
        r.missing_rows,
        r.error_message,
        r.started_at,
        r.finished_at
      FROM public.vendor_product_feed_runs r
      JOIN public.vendor_product_feeds f ON f.id=r.feed_id
      JOIN public.vendor_businesses v ON v.id=r.vendor_id
      ORDER BY r.started_at DESC,r.id DESC
      LIMIT 60
    `);
    await client.query("COMMIT");

    return {
      csrfToken: principal.csrfToken,
      feeds: feeds.rows.map((row) => ({
        id: String(row.public_id),
        vendorId: String(row.vendor_public_id),
        vendorName: String(row.vendor_name),
        name: String(row.name),
        sourceType: String(row.source_type) as "url" | "upload",
        sourceUrl: text(row.source_url),
        sourceFilename: text(row.source_filename),
        status: String(row.status),
        syncIntervalMinutes: int(row.sync_interval_minutes),
        productCount: int(row.product_count),
        readyCount: int(row.ready_count),
        errorCount: int(row.error_count),
        presentItems: int(row.present_items),
        missingItems: int(row.missing_items),
        retiredItems: int(row.retired_items),
        linkedOffers: int(row.linked_offers),
        lastSyncAt: epoch(row.last_sync_at),
        lastSuccessAt: epoch(row.last_success_at),
        nextSyncAt: epoch(row.next_sync_at),
        lastError: text(row.last_error)
      })),
      recentRuns: runs.rows.map((row) => ({
        id: String(row.public_id),
        feedId: String(row.feed_public_id),
        feedName: String(row.feed_name),
        vendorName: String(row.vendor_name),
        triggerType: String(row.trigger_type),
        status: String(row.status),
        totalRows: int(row.total_rows),
        validRows: int(row.valid_rows),
        errorRows: int(row.error_rows),
        createdSubmissions: int(row.created_submissions),
        updatedSubmissions: int(row.updated_submissions),
        updatedOffers: int(row.updated_offers),
        protectedInventoryRows: int(row.protected_inventory_rows),
        missingRows: int(row.missing_rows),
        errorMessage: text(row.error_message),
        startedAt: epoch(row.started_at) ?? 0,
        finishedAt: epoch(row.finished_at)
      }))
    };
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

export async function adminSetVendorProductFeedStatus(
  principal: SessionPrincipal,
  feedId: string,
  status: "active" | "paused"
): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const changed = await client.query(`
      UPDATE public.vendor_product_feeds
      SET status=$2,
          next_sync_at=CASE WHEN source_type='url' AND $2='active' THEN now() ELSE NULL END,
          last_error=CASE WHEN $2='active' THEN NULL ELSE last_error END,
          updated_at=now()
      WHERE public_id=$1 AND source_type='url'
      RETURNING public_id
    `, [feedId, status]);
    if (changed.rowCount !== 1) throw new Error("Το XML URL feed δεν βρέθηκε.");
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
  await recordAdminAudit(principal, "vendor_feed.status", "vendor_product_feed", feedId, status);
}

export async function adminForceVendorProductFeedSync(
  principal: SessionPrincipal,
  feedId: string
): Promise<void> {
  assertAdminPermission(principal, "catalog.write");
  const result = await syncVendorProductFeedAsPlatform(feedId);
  await recordAdminAudit(principal, "vendor_feed.force_sync", "vendor_product_feed", feedId, "Manual Admin synchronization", {
    run: result.run,
    preview: {
      totalRows: result.preview.totalRows,
      validRows: result.preview.validRows,
      errorRows: result.preview.errorRows
    }
  });
}
