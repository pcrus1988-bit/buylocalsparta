/**
 * Stage recent, EXACT official GEMI lookup-cache addresses as PRIVATE,
 * UNVERIFIED source-evidence candidates. Never geocodes, assigns, publishes,
 * enables CLAIM/checkout or asserts privacy/editorial approval.
 *
 * Dry run: POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-official-cache-evidence.ts --limit=25
 * Apply:   KM_GEMI_OFFICIAL_CACHE_STAGE_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-official-cache-evidence.ts --apply --limit=25
 *
 * This reuses existing officially fetched provider data; it performs NO
 * GEMI API calls and consumes NO third-party quota. Output is aggregate-only.
 */
import { Pool } from "pg";

const args = process.argv.slice(2);
if (args.some(arg => !arg.startsWith("--limit=") && !arg.startsWith("--after=") && arg !== "--apply")) {
  throw new Error("Only --limit=N, --after=GEMI_DIGITS and --apply are supported");
}
const flag = (prefix: string) => args.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
const limit = Number(flag("--limit=") ?? "25");
const after = flag("--after=") ?? "";
const apply = args.includes("--apply");
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
  throw new Error("--limit must be an integer between 1 and 100");
}
if (after && !/^[0-9]{6,20}$/.test(after)) throw new Error("Invalid GEMI cursor");
if (apply && process.env.KM_GEMI_OFFICIAL_CACHE_STAGE_APPROVED !== "true") {
  throw new Error("Explicit KM_GEMI_OFFICIAL_CACHE_STAGE_APPROVED=true is required for --apply");
}
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("A private production database connection is required");

const baseSql = `
WITH candidates AS MATERIALIZED (
  SELECT d.gemi_number,c.address_line1,c.postcode,c.last_checked_at,
    'https://opendata-api.businessportal.gr/api/opendata/v1/companies/' || d.gemi_number AS source_url
  FROM public.gemi_company_lookup_cache c
  INNER JOIN research_private.hub_gemi_directory d ON d.gemi_number=c.gemi_number
  WHERE c.gemi_number>$2 AND c.gemi_number ~ '^[0-9]{6,20}$'
    AND c.lookup_status='matched'
    AND c.last_checked_at > now()-interval '7 days' AND c.expires_at>now()
    AND length(btrim(c.address_line1))>=4
    AND c.postcode=d.postcode AND c.postcode ~ '^[0-9]{5}$'
    AND d.display_status='unpublished' AND d.assignment_status='awaiting_geocode'
    AND NOT EXISTS (
      SELECT 1 FROM public.vendor_businesses v
      WHERE v.gemi_number=d.gemi_number AND v.status='active'
        AND v.public_directory_visible
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.hub_expansion_prospects h
      WHERE h.gemi_number=d.gemi_number AND h.status='converted'
        AND h.owner_user_id IS NOT NULL
    )
  ORDER BY d.gemi_number LIMIT $1
)`;
const dryRunSql = baseSql + `
SELECT count(*)::integer AS candidates,
  max(gemi_number) AS last_gemi,
  0::integer AS staged,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM research_private.hub_gemi_address_source_evidence e
    WHERE e.gemi_number=candidates.gemi_number AND e.source_url=candidates.source_url
  ))::integer AS already_recorded
FROM candidates`;
const applySql = baseSql + `,
staged AS (
  INSERT INTO research_private.hub_gemi_address_source_evidence
    (gemi_number,source_url,source_kind,postcode,address_match_status,
     source_checked_at,finding,physical_geo_status)
  SELECT gemi_number,source_url,'official_registry',postcode,'pending',
    last_checked_at,
    left(
      'Automated official GEMI OpenData cache capture: reported street "' ||
      address_line1 || '"; matching registry postcode. Independent premise, ' ||
      'coordinate, rights, legal/privacy and editorial reviews remain pending.',
      600
    ),
    'unverified'
  FROM candidates
  ON CONFLICT (gemi_number,source_url) DO NOTHING
  RETURNING id
)
SELECT (SELECT count(*)::integer FROM candidates) AS candidates,
  (SELECT max(gemi_number) FROM candidates) AS last_gemi,
  (SELECT count(*)::integer FROM staged) AS staged,
  (SELECT count(*)::integer FROM candidates)-
    (SELECT count(*)::integer FROM staged) AS already_recorded`;

const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 8000 });
try {
  const result = await pool.query<{
    candidates: number;
    last_gemi: string | null;
    staged: number;
    already_recorded: number;
  }>(apply ? applySql : dryRunSql, [limit, after]);
  const row = result.rows[0];
  console.log(JSON.stringify({
    mode: apply ? "private_evidence_staged" : "dry_run",
    candidates: Number(row?.candidates ?? 0),
    created: Number(row?.staged ?? 0),
    previouslyRecorded: Number(row?.already_recorded ?? 0),
    lastGemi: row?.last_gemi ?? null,
    addressesVerified: 0,
    geographicAssignments: 0,
    publications: 0,
    seoApprovals: 0
  }));
} finally {
  await pool.end();
}
