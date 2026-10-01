import type { SessionPrincipal, SqlRow } from "@buy-local-sparta/core";
import { getProductionPostgresRuntime } from "./postgres-runtime";
import { syncVendorProductFeed } from "./vendor-product-feed-service";

type ClaimedFeed = Readonly<{
  feedId: string;
  vendorId: string;
  userId?: string;
  email?: string;
}>;

const LEASE_MINUTES = 15;
const DEFAULT_LIMIT = 3;

function schedulerPrincipal(feed: ClaimedFeed): SessionPrincipal {
  if (!feed.userId) throw new Error("No active vendor user is available for scheduled XML synchronization.");
  return {
    userId: feed.userId,
    email: feed.email || "vendor-feed@kontamou.invalid",
    roles: ["vendor_catalog"],
    vendorId: feed.vendorId,
    csrfToken: "vendor-product-feed-scheduler",
    sessionId: `vendor-product-feed-scheduler:${feed.feedId}`
  };
}

export async function syncVendorProductFeedAsPlatform(feedId: string) {
  const normalizedFeedId = feedId.trim();
  if (!normalizedFeedId) throw new Error("XML feed id is required.");

  const runtime = getProductionPostgresRuntime();
  const client = await runtime.nativePool.connect();
  let feed: ClaimedFeed | undefined;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE bls_platform_runtime");
    const result = await client.query<SqlRow>(`
      SELECT
        f.public_id AS feed_id,
        COALESCE(v.public_id,v.id::text) AS vendor_id,
        COALESCE(actor.public_id,actor.id::text) AS user_id,
        actor.email
      FROM public.vendor_product_feeds f
      JOIN public.vendor_businesses v ON v.id=f.vendor_id
      LEFT JOIN LATERAL (
        SELECT u.id,u.public_id,u.email
        FROM public.vendor_users vu
        JOIN public.users u ON u.id=vu.user_id
        WHERE vu.vendor_id=f.vendor_id AND vu.active=true AND u.status IN ('active','pending_verification')
        ORDER BY CASE WHEN EXISTS (
          SELECT 1 FROM public.vendor_user_roles vur
          WHERE vur.vendor_user_id=vu.id AND vur.role='vendor_owner'
        ) THEN 0 ELSE 1 END,vu.created_at,vu.id
        LIMIT 1
      ) actor ON true
      WHERE f.public_id=$1 AND f.source_type='url'
      LIMIT 1
    `, [normalizedFeedId]);
    const row = result.rows[0];
    if (row) {
      feed = {
        feedId: String(row.feed_id),
        vendorId: String(row.vendor_id),
        userId: row.user_id ? String(row.user_id) : undefined,
        email: row.email ? String(row.email) : undefined
      };
    }
    await client.query("COMMIT");
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }

  if (!feed) throw new Error("Το XML URL feed δεν βρέθηκε.");
  return syncVendorProductFeed(schedulerPrincipal(feed), feed.feedId, "manual");
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
        COALESCE(actor.public_id,actor.id::text) AS user_id,
        actor.email
      FROM leased l
      JOIN public.vendor_businesses v ON v.id=l.vendor_id
      LEFT JOIN LATERAL (
        SELECT u.id,u.public_id,u.email
        FROM public.vendor_users vu
        JOIN public.users u ON u.id=vu.user_id
        WHERE vu.vendor_id=l.vendor_id AND vu.active=true AND u.status IN ('active','pending_verification')
        ORDER BY CASE WHEN EXISTS (
          SELECT 1 FROM public.vendor_user_roles vur
          WHERE vur.vendor_user_id=vu.id AND vur.role='vendor_owner'
        ) THEN 0 ELSE 1 END,vu.created_at,vu.id
        LIMIT 1
      ) actor ON true
    `, [safeLimit, LEASE_MINUTES]);
    claimed = result.rows.map((row) => ({
      feedId: String(row.feed_id),
      vendorId: String(row.vendor_id),
      userId: row.user_id ? String(row.user_id) : undefined,
      email: row.email ? String(row.email) : undefined
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
        await failureClient.query(`
          INSERT INTO public.vendor_product_feed_runs(
            feed_id,market_id,vendor_id,trigger_type,status,error_message,created_by,finished_at
          )
          SELECT f.id,f.market_id,f.vendor_id,'scheduled','failed',$2,
                 (SELECT u.id FROM public.users u WHERE u.public_id=$3 OR u.id::text=$3 LIMIT 1),
                 now()
          FROM public.vendor_product_feeds f
          WHERE f.public_id=$1
        `, [feed.feedId, message, feed.userId ?? null]);
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


export async function processPendingVendorProductFeedSubmissions(limit = 500) {
  const safeLimit = Number.isSafeInteger(limit) ? Math.min(1000, Math.max(1, limit)) : 500;
  const batchSize = 25;
  const runtime = getProductionPostgresRuntime();
  let processed = 0;
  let linked = 0;
  let needsReview = 0;
  let submitted = 0;
  let batches = 0;

  while (processed < safeLimit) {
    const client = await runtime.nativePool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE bls_platform_runtime");
      await client.query("SET LOCAL statement_timeout='120s'");

      const selected = await client.query<SqlRow>(`
        SELECT s.id::text
        FROM public.vendor_product_submissions s
        JOIN public.vendor_product_feed_items i ON i.submission_id=s.id
        WHERE s.status='draft'
          AND i.state='present'
        ORDER BY s.created_at,s.id
        FOR UPDATE OF s SKIP LOCKED
        LIMIT $1
      `, [Math.min(batchSize, safeLimit - processed)]);

      const ids = selected.rows.map((row) => String(row.id)).filter(Boolean);
      if (!ids.length) {
        await client.query("COMMIT");
        break;
      }

      await client.query(`
        UPDATE public.vendor_product_submissions
        SET status='submitted',updated_at=now()
        WHERE id=ANY($1::uuid[]) AND status='draft'
      `, [ids]);

      const states = await client.query<SqlRow>(`
        SELECT status,count(*)::integer AS count
        FROM public.vendor_product_submissions
        WHERE id=ANY($1::uuid[])
        GROUP BY status
      `, [ids]);

      for (const row of states.rows) {
        const count = Number(row.count ?? 0);
        if (row.status === "linked") linked += count;
        else if (row.status === "needs_review") needsReview += count;
        else if (row.status === "submitted") submitted += count;
      }

      await client.query(`
        UPDATE public.vendor_product_feed_items i
        SET canonical_variant_id=s.canonical_variant_id,updated_at=now()
        FROM public.vendor_product_submissions s
        WHERE i.submission_id=s.id
          AND s.id=ANY($1::uuid[])
          AND s.canonical_variant_id IS NOT NULL
      `, [ids]);

      await client.query("COMMIT");
      processed += ids.length;
      batches += 1;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      throw error;
    } finally {
      client.release();
    }
  }

  return { processed, linked, needsReview, submitted, batches };
}
