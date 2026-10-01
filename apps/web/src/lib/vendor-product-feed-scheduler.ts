import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { syncVendorProductFeed } from "./vendor-product-feed-service";

type ClaimedFeed = Readonly<{
  feedId: string;
  vendorId: string;
  userId: string;
  email: string;
}>;

const LEASE_MINUTES = 15;
const DEFAULT_LIMIT = 3;

function schedulerPrincipal(feed: ClaimedFeed): SessionPrincipal {
  return {
    userId: feed.userId,
    email: feed.email,
    roles: ["vendor_owner"],
    vendorId: feed.vendorId,
    csrfToken: "vendor-product-feed-scheduler",
    sessionId: `vendor-product-feed-scheduler:${feed.feedId}`
  };
}

export async function syncDueVendorProductFeeds(limit = DEFAULT_LIMIT) {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(5, Math.max(1, limit)) : DEFAULT_LIMIT;
  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let claimed: ClaimedFeed[] = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const result = await client.query<SqlRow>(`
      WITH due AS (
        SELECT f.id
        FROM public.vendor_product_feeds f
        WHERE f.source_type='url'
          AND f.status='active'
          AND f.next_sync_at IS NOT NULL
          AND f.next_sync_at<=now()
        ORDER BY f.next_sync_at,f.id
        FOR UPDATE SKIP LOCKED
        LIMIT $1
      ),
      leased AS (
        UPDATE public.vendor_product_feeds f
        SET next_sync_at=now()+make_interval(mins=>$2),updated_at=now()
        FROM due
        WHERE f.id=due.id
        RETURNING f.public_id,f.vendor_id,f.created_by
      )
      SELECT
        l.public_id AS feed_id,
        COALESCE(v.public_id,v.id::text) AS vendor_id,
        COALESCE(u.public_id,u.id::text) AS user_id,
        u.email
      FROM leased l
      JOIN public.vendor_businesses v ON v.id=l.vendor_id
      JOIN public.users u ON u.id=l.created_by
    `, [safeLimit, LEASE_MINUTES]);
    claimed = result.rows.map((row) => ({
      feedId: String(row.feed_id),
      vendorId: String(row.vendor_id),
      userId: String(row.user_id),
      email: String(row.email)
    }));
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }

  const results: Array<{ feedId: string; ok: boolean; error?: string }> = [];
  for (const feed of claimed) {
    try {
      await syncVendorProductFeed(schedulerPrincipal(feed), feed.feedId, "scheduled");
      results.push({ feedId: feed.feedId, ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 1000) : String(error).slice(0, 1000);
      const failureClient = await runtime.nativePool.connect();
      try {
        await failureClient.query("BEGIN");
        await failureClient.query("SET LOCAL ROLE bls_platform_runtime");
        await failureClient.query(`
          UPDATE public.vendor_product_feeds
          SET last_sync_at=now(),
              last_error=$2,
              next_sync_at=now()+make_interval(mins=>$3),
              updated_at=now()
          WHERE public_id=$1 AND source_type='url' AND status='active'
        `, [feed.feedId, message, LEASE_MINUTES]);
        await failureClient.query("COMMIT");
      } catch {
        try { await failureClient.query("ROLLBACK"); } catch {}
      } finally {
        failureClient.release();
      }
      results.push({ feedId: feed.feedId, ok: false, error: message });
    }
  }

  return {
    ok: results.every((item) => item.ok),
    claimed: claimed.length,
    completed: results.filter((item) => item.ok).length,
    failed: results.filter((item) => !item.ok).length,
    results
  };
}
