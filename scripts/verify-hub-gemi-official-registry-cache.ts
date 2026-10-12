/**
 * Identify factual GEMI identities from RECENT official cached GEMI responses.
 * Registry verification is distinct from owner/merchant and physical GEO review.
 * No public exposure/SEO/legal/editorial approvals are made.
 */
import { Pool } from "pg";
const args=process.argv.slice(2);
if (args.some(arg=>arg!=="--apply"&&!arg.startsWith("--limit="))) throw new Error("Only --limit=N and --apply supported");
const write=args.includes("--apply");
const limit=Number(args.find(arg=>arg.startsWith("--limit="))?.slice(8)??"100");
if(!Number.isSafeInteger(limit)||limit<1||limit>500)throw new Error("Invalid limit");
if(write&&process.env.KM_GEMI_REGISTRY_CACHE_VERIFY_APPROVED!=="true")
  throw new Error("Explicit registry-cache verification approval required");
const connectionString=process.env.POSTGRES_URL??process.env.DATABASE_URL;
if(!connectionString)throw new Error("Private DB access required");
const source=`
WITH candidates AS MATERIALIZED (
 SELECT d.gemi_number,c.last_checked_at,c.payload_hash
 FROM research_private.hub_gemi_directory d
 JOIN public.gemi_company_lookup_cache c ON c.gemi_number=d.gemi_number
 JOIN research_private.hub_gemi_municipality_matches m
   ON m.registry_municipality_id=d.registry_municipality_id
 WHERE d.publication_basis='municipality' AND d.directory_hub_slug=m.candidate_hub_slug
   AND d.display_status='unpublished'
   AND d.registry_verified_at IS NULL
   AND m.review_status='reviewed'
   AND c.lookup_status='matched' AND c.expires_at>now()
   AND c.last_checked_at>now()-interval '7 days'
   AND c.company_status='Ενεργή'
   AND c.payload_hash ~ '^[a-f0-9]{64}$'
   AND c.postcode=d.postcode
   AND length(btrim(c.legal_name))>=5
   AND lower(regexp_replace(c.legal_name,'[^[:alnum:]]','','g'))=
       lower(regexp_replace(d.legal_name,'[^[:alnum:]]','','g'))
   AND NOT EXISTS (SELECT 1 FROM public.vendor_businesses v
     WHERE v.gemi_number=d.gemi_number AND v.status='active'
       AND v.public_directory_visible)
   AND NOT EXISTS (SELECT 1 FROM public.hub_expansion_prospects h
     WHERE h.gemi_number=d.gemi_number AND h.status='converted'
       AND h.owner_user_id IS NOT NULL)
 ORDER BY d.gemi_number LIMIT $1
)`;
const dry=source+`SELECT count(*)::integer AS checked FROM candidates`;
const apply=source+`,
verified AS (
 UPDATE research_private.hub_gemi_directory d SET
   registry_verified_at=c.last_checked_at,
   registry_verification_ref='gemi-opendata-cache:sha256:'||c.payload_hash,
   registry_verified_by='automation:official-gemi-cache-exact-match-v1',
   updated_at=now()
 FROM candidates c WHERE d.gemi_number=c.gemi_number
   AND d.display_status='unpublished' AND d.registry_verified_at IS NULL
 RETURNING d.gemi_number
)
SELECT count(*)::integer AS checked FROM verified`;
const pool=new Pool({connectionString,max:1,connectionTimeoutMillis:8000});
try {
 const result=await pool.query<{checked:number}>(write?apply:dry,[limit]);
 console.info(JSON.stringify({mode:write?"private_registry_identity_verified":"dry_run",
  registryIdentitiesVerified:result.rows[0]?.checked??0,
  ownerVerified:0,preciseGeoVerified:0,published:0,seoApproved:0}));
}finally{await pool.end();}
