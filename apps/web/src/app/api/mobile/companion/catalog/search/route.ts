import {PostgresUnitOfWork,type SqlRow} from "@buy-local-sparta/core";
import {PostgresFixedWindowRateLimiter} from "@buy-local-sparta/postgres-runtime";
import {getProductionPostgresRuntime} from "../../../../../../lib/postgres-runtime";
import {parseCompanionCatalogSearch} from "../../../../../../lib/companion-catalog-policy";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const HEADERS={"Cache-Control":"no-store,max-age=0","Referrer-Policy":"no-referrer"};
/** Public catalog lookup. No GPS, user ID, wish-list contents or customer session. */
export async function GET(request:Request){
 try{
  const url=new URL(request.url);
  const {query,limit}=parseCompanionCatalogSearch(url.searchParams.get("q"));
  const db=getProductionPostgresRuntime();
  const limiter=new PostgresFixedWindowRateLimiter(db.sqlPool);
  const ip=request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const result=await limiter.consume({
   route:"companion-catalog-lookup",key:ip.slice(0,128),limit:20,windowMs:60000,now:Date.now()
  });
  if(!result.allowed)return Response.json({error:"RATE_LIMITED"},{status:429,headers:HEADERS});
  const uow=new PostgresUnitOfWork(db.sqlPool,{statementTimeoutMs:2500,lockTimeoutMs:500});
  const products=await uow.withTransaction({platformAccess:true,requestId:"companion:catalog-search"},async tx=>{
   const q=await tx.query<SqlRow>(`
    WITH candidates AS MATERIALIZED(
      SELECT pt.canonical_variant_id,pt.title
      FROM public.product_translations pt
      WHERE pt.locale='el' AND NULLIF(pt.title,'') IS NOT NULL
        AND to_tsvector('simple',coalesce(pt.title,''))
          @@ plainto_tsquery('simple',$1::text)
      LIMIT 240
    )
    SELECT DISTINCT ON (cv.public_id) cv.public_id AS variant_id,
      c.title AS title,coalesce(cv.slug,'') AS slug,
      coalesce(b.name,'') AS brand
    FROM candidates c
    JOIN public.canonical_variants cv ON cv.id=c.canonical_variant_id
       AND cv.active=true AND cv.suppressed=false AND cv.recalled=false
    JOIN public.product_families f ON f.id=cv.family_id AND f.active=true
    LEFT JOIN public.brands b ON b.id=cv.brand_id
    ORDER BY cv.public_id
    LIMIT $2
   `,[query,limit]);
   return q.rows.map(x=>({
    variantId:String(x.variant_id),title:String(x.title).slice(0,120),
    slug:String(x.slug??""),brand:String(x.brand??"").slice(0,70)
   }));
  },{readOnly:true});
  return Response.json({products,source:"canonical_catalog",
    availabilityConfirmed:false},{headers:HEADERS});
 }catch(e){
  const invalid=e instanceof Error && e.message==="INVALID_SEARCH";
  return Response.json({error:invalid?"INVALID_SEARCH":"SEARCH_UNAVAILABLE"},
    {status:invalid?400:503,headers:HEADERS});
 }
}
