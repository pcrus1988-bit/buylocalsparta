/**
 * Publish ONLY independently reviewed GEMI municipality directory entries.
 *
 * Default: dry run, aggregate-only, no mutation.
 * Example:
 *   POSTGRES_URL=... node --experimental-strip-types \
 *     scripts/publish-reviewed-hub-gemi-directory.ts --hub=volos --limit=100
 *
 * Production write requires existing, recorded identity + privacy + editorial
 * + SEO approvals on EVERY record. The flag only authorizes running the script;
 * it cannot create or impersonate those independent approvals.
 *
 *   KM_GEMI_REVIEWED_PUBLICATION_APPROVED=true POSTGRES_URL=... \
 *     node --experimental-strip-types scripts/publish-reviewed-hub-gemi-directory.ts \
 *       --hub=volos --limit=100 --apply
 */
import { Pool } from "pg";
import {
  parsePublicationOptions,
  reviewedPublicationPreviewSql,
  reviewedPublicationWriteSql
} from "./hub-gemi-reviewed-publication-policy.ts";

const options = parsePublicationOptions(process.argv.slice(2));
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Private PostgreSQL connection required");

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
const client = await pool.connect();
try {
  await client.query(options.apply ? "BEGIN" : "BEGIN READ ONLY");
  await client.query("SET LOCAL statement_timeout='20s'");
  await client.query("SET LOCAL lock_timeout='3s'");
  const result = await client.query<{ selected: number; last_gemi: string | null }>(
    options.apply ? reviewedPublicationWriteSql : reviewedPublicationPreviewSql,
    [options.limit, options.after, options.hub]
  );
  await client.query("COMMIT");
  // Never print personal names, source contacts, addresses or private evidence.
  console.info(JSON.stringify({
    mode: options.apply ? "published_reviewed_only" : "dry_run",
    basis: "reviewed_municipality_directory",
    hub: options.hub || "all_reviewed_hubs",
    selected: Number(result.rows[0]?.selected ?? 0),
    newlyPublished: options.apply ? Number(result.rows[0]?.selected ?? 0) : 0,
    lastGemi: result.rows[0]?.last_gemi ?? null,
    preciseGeoClaimed: 0,
    ownerClaimed: 0,
    reviewApprovalsCreated: 0
  }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  client.release();
  await pool.end();
}
