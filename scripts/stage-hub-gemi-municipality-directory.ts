/**
 * Stage a reviewed MUNICIPALITY grouping for GEMI research records. This does
 * not validate premises, mark registry identity as verified, or publish/index.
 *
 * Dry run by default:
 * POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-municipality-directory.ts --limit=5000
 * Approved private staging:
 * KM_GEMI_MUNICIPALITY_STAGE_APPROVED=true POSTGRES_URL=... node --experimental-strip-types scripts/stage-hub-gemi-municipality-directory.ts --limit=5000 --apply
 */
import { Pool } from "pg";
const args = process.argv.slice(2);
if (args.some((arg) => !arg.startsWith("--limit=") && !arg.startsWith("--after=") && arg !== "--apply")) {
  throw new Error("Only --limit=N, --after=GEMI, --apply supported");
}
const flag = (key: string) => args.find(arg => arg.startsWith(key))?.slice(key.length);
const limit = Number(flag("--limit=") ?? "1000");
const after = flag("--after=") ?? "";
const apply = args.includes("--apply");
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000) throw new Error("Invalid limit");
if (after && !/^[0-9]{8,20}$/.test(after)) throw new Error("Invalid cursor");
if (apply && process.env.KM_GEMI_MUNICIPALITY_STAGE_APPROVED !== "true") {
  throw new Error("Approved private research staging required");
}
const connectionString = process.env.POSTGRES_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("Private database connection required");

const candidates = `
WITH candidates AS MATERIALIZED (
 SELECT d.gemi_number, m.candidate_hub_slug
 FROM research_private.hub_gemi_directory d
 JOIN research_private.hub_gemi_municipality_matches m
   ON m.registry_municipality_id=d.registry_municipality_id
 JOIN research_private.hub_gemi_hub_master hub
   ON hub.hub_id=m.candidate_hub_id
  AND hub.hub_slug=m.candidate_hub_slug
 WHERE d.gemi_number>$2 AND d.display_status='unpublished'
  AND d.directory_hub_slug IS NULL
  AND d.assignment_status='awaiting_geocode'
  AND m.review_status='reviewed'
  AND m.candidate_hub_distance_km<=hub.radius_km
  AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v
    WHERE v.gemi_number=d.gemi_number
    AND v.status='active' AND v.public_directory_visible=true)
  AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h
    WHERE h.gemi_number=d.gemi_number
    AND h.status='converted' AND h.owner_user_id IS NOT NULL)
 ORDER BY d.gemi_number LIMIT $1
)`;
const preview = candidates + `
 SELECT count(*)::integer AS reviewed,
 max(gemi_number) AS last_gemi FROM candidates`;
const write = candidates + `,
updated AS (
 UPDATE research_private.hub_gemi_directory d
 SET publication_basis='municipality',
     directory_hub_slug=c.candidate_hub_slug,updated_at=now()
 FROM candidates c WHERE d.gemi_number=c.gemi_number
   AND d.display_status='unpublished' AND d.directory_hub_slug IS NULL
 RETURNING d.gemi_number
)
SELECT (SELECT count(*)::integer FROM updated) AS reviewed,
 (SELECT max(gemi_number) FROM candidates) AS last_gemi`;

const pool = new Pool({connectionString,max:1,connectionTimeoutMillis:8000});
try {
 const {rows} = await pool.query<{reviewed:number;last_gemi:string|null}>(
   apply ? write : preview,[limit,after]
 );
 console.info(JSON.stringify({
  mode:apply?"private_municipality_staged":"dry_run",
  reviewed:rows[0]?.reviewed??0,lastGemi:rows[0]?.last_gemi??null,
  preciseLocationsVerified:0,registryIdentitiesVerified:0,
  published:0,seoApproved:0
 }));
} finally { await pool.end(); }
