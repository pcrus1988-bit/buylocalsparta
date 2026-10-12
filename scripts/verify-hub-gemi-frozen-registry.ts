/**
 * Private independent registry identity verification from an authenticated,
 * frozen, SHA256-referenced GEMI OpenData research snapshot.
 *
 * Matching identity is NOT current trading activity, physical premises,
 * ownership, GDPR/editorial approval, SEO or a right to issue a storefront.
 * No records are published or promoted by this script.
 *
 * Dry-run: POSTGRES_URL=... node --experimental-strip-types scripts/verify-hub-gemi-frozen-registry.ts --limit=1000
 * Approved write: KM_GEMI_FROZEN_REGISTRY_VERIFY_APPROVED=true POSTGRES_URL=...
 *   node --experimental-strip-types scripts/verify-hub-gemi-frozen-registry.ts --apply --limit=1000
 */
import { Pool } from "pg";
const args=process.argv.slice(2);
if(args.some(a=>a!=="--apply"&&!a.startsWith("--limit=")))throw new Error("Unsupported argument");
const limit=Number(args.find(a=>a.startsWith("--limit="))?.slice(8)??"1000");
if(!Number.isSafeInteger(limit)||limit<1||limit>10000)throw new Error("Invalid batch size");
const write=args.includes("--apply");
if(write&&process.env.KM_GEMI_FROZEN_REGISTRY_VERIFY_APPROVED!=="true")
  throw new Error("Explicit registry verification approval required");
const connectionString=process.env.POSTGRES_URL??process.env.DATABASE_URL;
if(!connectionString)throw new Error("Private production connection required");
const candidates=`
WITH candidates AS MATERIALIZED (
 SELECT d.gemi_number,s.captured_at,s.content_sha256
 FROM research_private.hub_gemi_directory d
 JOIN public.research_frame_units f ON f.id=d.source_frame_unit_id
 JOIN public.research_frame_snapshots s ON s.id=f.frame_snapshot_id
 JOIN research_private.hub_gemi_municipality_matches m
   ON m.registry_municipality_id=d.registry_municipality_id
 WHERE d.display_status='unpublished'
   AND d.publication_basis='municipality'
   AND d.directory_hub_slug=m.candidate_hub_slug
   AND d.registry_verified_at IS NULL
   AND m.review_status='reviewed'
   AND s.source_kind='gemi_opendata' AND s.status='frozen'
   AND s.content_sha256 ~ '^[a-f0-9]{64}$'
   AND s.captured_at>now()-interval '60 days'
   AND f.sampling_attributes->>'source'='gemi_opendata'
   AND f.source_record_ref=d.source_record_ref
   AND d.source_record_ref='gemi:'||d.gemi_number
   AND d.postcode ~ '^[0-9]{5}$'
   AND f.sampling_attributes->>'postcode'=d.postcode
   AND length(btrim(d.legal_name))>=5
   AND lower(regexp_replace(d.legal_name,'[^[:alnum:]]','','g'))=
       lower(regexp_replace(f.sampling_attributes->>'legalName','[^[:alnum:]]','','g'))
   AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v
     WHERE v.gemi_number=d.gemi_number AND v.status='active'
       AND v.public_directory_visible=true)
   AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h
     WHERE h.gemi_number=d.gemi_number
       AND h.status='converted' AND h.owner_user_id IS NOT NULL)
 ORDER BY d.gemi_number LIMIT $1
)`;
const dry=candidates+`SELECT count(*)::integer AS verified FROM candidates`;
const apply=candidates+`,
verification AS (
 UPDATE research_private.hub_gemi_directory d
 SET registry_verified_at=c.captured_at,
     registry_verification_ref='gemi-opendata-frozen-sha256:'||c.content_sha256||':'||c.gemi_number,
     registry_verified_by='automation:frozen-gemi-identity-match-v1',
     updated_at=now()
 FROM candidates c WHERE d.gemi_number=c.gemi_number
  AND d.display_status='unpublished' AND d.registry_verified_at IS NULL
 RETURNING d.gemi_number
)
SELECT count(*)::integer AS verified FROM verification`;
const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:8000});
try{
 const {rows}=await pool.query<{verified:number}>(write?apply:dry,[limit]);
 console.info(JSON.stringify({mode:write?"private_registry_verified":"dry_run",
   registryIdentitiesVerified:rows[0]?.verified??0,
   ownerVerified:0,preciseCoordinatesAdded:0,published:0,seoApproved:0}));
} finally {await pool.end();}
