/**
 * Bounded private geo-key worklist for licensed evidence acquisition.
 * Outputs ONLY aggregate location keys and administrative geography; never
 * GEMI identities, AFMs, company names, research contacts or email addresses.
 *
 * POSTGRES_URL=... node --experimental-strip-types scripts/export-hub-gemi-geocode-worklist.ts \
 *   --limit=1000 --after=<previous_last_location_key> > /private/geocode-worklist.ndjson
 *
 * This is NOT geocoding, assignment or publication. Any third-party service
 * must independently permit coordinate storage/redistribution.
 */
import { Pool } from "pg";

const url = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("A private database connection is required");
const args = process.argv.slice(2);
if (args.some(arg => !/^--(limit|after|include-incomplete)(=.*)?$/.test(arg))) {
  throw new Error("Only --limit=N, --after=32hex and --include-incomplete are supported");
}
const option = (prefix: string) => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const limitRaw = option("--limit=") ?? "500";
const limit = Number(limitRaw);
if (!Number.isInteger(limit) || limit < 1 || limit > 5000) throw new Error("Invalid --limit (1 to 5000)");
const after = option("--after=") ?? "";
if (after && !/^[a-f0-9]{32}$/.test(after)) throw new Error("Invalid location cursor");
const includeIncomplete = args.includes("--include-incomplete");
const pool = new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 8000 });
try {
  const result = await pool.query<{
    location_key: string; postcode: string | null; city: string | null;
    municipality: string | null; prefecture: string | null; business_count: number;
  }>(
    "SELECT g.location_key,g.postcode,g.city,g.municipality,g.prefecture," +
    "count(d.gemi_number)::integer AS business_count " +
    "FROM research_private.hub_gemi_geo_keys g " +
    "JOIN research_private.hub_gemi_directory d ON d.location_key=g.location_key " +
    "AND d.display_status='unpublished' " +
    "WHERE g.latitude IS NULL AND g.longitude IS NULL " +
    "AND g.location_key>$1 AND ($3 OR g.postcode ~ '^[0-9]{5}$') " +
    "GROUP BY g.location_key,g.postcode,g.city,g.municipality,g.prefecture " +
    "ORDER BY g.location_key ASC LIMIT $2",
    [after, limit, includeIncomplete]
  );
  for (const row of result.rows) console.log(JSON.stringify({
    location_key: row.location_key, postcode: row.postcode,
    city: row.city, municipality: row.municipality,
    prefecture: row.prefecture, business_count: Number(row.business_count),
    requires_address_confirmation: true
  }));
  console.error(JSON.stringify({
    mode: "private_worklist_only", rows: result.rows.length,
    lastLocationKey: result.rows.at(-1)?.location_key ?? null,
    includeIncomplete, geocoded: 0, published: 0
  }));
} finally {
  await pool.end();
}
