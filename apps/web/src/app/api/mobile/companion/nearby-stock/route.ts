import { PostgresUnitOfWork, type SqlRow } from "@buy-local-sparta/core";
import { PostgresFixedWindowRateLimiter } from "@buy-local-sparta/postgres-runtime";
import { getProductionPostgresRuntime } from "../../../../../lib/postgres-runtime";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const JSON_HEADERS={ "Cache-Control":"no-store, max-age=0", "Referrer-Policy":"no-referrer" };

type Input={latitude:unknown;longitude:unknown;accuracy:unknown};
function valid(p:{latitude:number;longitude:number;accuracy:number}){
  return Number.isFinite(p.latitude)&&Math.abs(p.latitude)<=90
    && Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180
    && Number.isFinite(p.accuracy)&&p.accuracy>=0&&p.accuracy<=200;
}

/**
 * Foreground user-initiated discovery only. Do not persist or log coordinates.
 * This endpoint deliberately accepts no wishlist or shopping-list contents.
 * It returns only verified active stores' public, live local-pickup inventory.
 * Exact wish-list matching is done locally on the phone.
 */
export async function POST(request:Request){
  try {
    const body=await request.text();
    if(body.length>512)return Response.json({error:"INVALID_INPUT"},{status:400,headers:JSON_HEADERS});
    const raw=JSON.parse(body) as Input;
    const position={
      latitude:typeof raw.latitude==="number"?raw.latitude:NaN,
      longitude:typeof raw.longitude==="number"?raw.longitude:NaN,
      accuracy:typeof raw.accuracy==="number"?raw.accuracy:NaN
    };
    if(!valid(position))return Response.json({error:"LOCATION_NOT_ACCURATE"},{status:422,headers:JSON_HEADERS});
    const db=getProductionPostgresRuntime();
    const limiter=new PostgresFixedWindowRateLimiter(db.sqlPool);
    const ip=request.headers.get("x-real-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()||"unknown";
    const allowed=await limiter.consume({route:"mobile-companion-nearby-stock",key:ip.slice(0,128),limit:12,windowMs:60000,now:Date.now()});
    if(!allowed.allowed)return Response.json({error:"RATE_LIMITED"},{status:429,headers:JSON_HEADERS});
    const uow=new PostgresUnitOfWork(db.sqlPool,{statementTimeoutMs:2500,lockTimeoutMs:500});
    const products=await uow.withTransaction({platformAccess:true,requestId:"mobile-companion-nearby-read"},async tx=>{
      const result=await tx.query<SqlRow>(`
        with nearby_locations as materialized (
          select l.id, l.vendor_id, l.name, l.locality,
            ST_Distance(l.coordinates,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography)::integer as distance_m
          from public.vendor_locations l
          join public.vendor_businesses v on v.id=l.vendor_id
          where l.active and l.verified_at is not null and l.coordinates is not null
            and v.status='active' and v.public_directory_visible=true and v.demo_mode=false
            and ST_DWithin(l.coordinates,ST_SetSRID(ST_MakePoint($1,$2),4326)::geography,500)
          order by l.coordinates <-> ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
          limit 12
        )
        select v.public_id as vendor_id,
          coalesce(nullif(v.trading_name,''),v.legal_name) as vendor_name,
          l.id::text as location_id,
          coalesce(l.locality,'') as locality, l.distance_m,
          cv.public_id as variant_id,cv.slug as variant_slug,
          pt.title as product_title
        from nearby_locations l
        join public.vendor_businesses v on v.id=l.vendor_id
        join public.vendor_offers vo on vo.vendor_id=l.vendor_id and vo.location_id=l.id
          and vo.status='approved' and vo.merchant_visible=true and vo.merchant_pause_active=false
          and vo.customer_price_minor>0 and 'pickup'=any(vo.fulfilment_modes::text[])
          and coalesce(vo.source_payload->>'dropship','false')<>'true'
        join public.inventory_balances inv on inv.offer_id=vo.id
          and (inv.on_hand-inv.active_reservations-inv.safety_stock-inv.blocked)>0
          and inv.freshness_status='fresh'
        join public.canonical_variants cv on cv.id=vo.canonical_variant_id
          and cv.active=true and cv.suppressed=false and cv.recalled=false
        join public.product_families f on f.id=cv.family_id and f.active=true
        join public.product_translations pt on pt.canonical_variant_id=cv.id
          and pt.locale='el' and nullif(pt.title,'') is not null
        order by l.distance_m asc, pt.title asc
        limit 80
      `,[position.longitude,position.latitude]);
      return result.rows.map(r=>({
        vendorId:String(r.vendor_id),vendorName:String(r.vendor_name),
        vendorLocationId:String(r.location_id),vendorLocality:String(r.locality??""),
        productTitle:String(r.product_title),variantId:String(r.variant_id),
        distanceM:Number(r.distance_m),
        productUrl:`https://kontamou.site/shop?q=${encodeURIComponent(String(r.product_title))}`
      }));
    },{readOnly:true});
    return Response.json({products,verifiedOnly:true},{headers:JSON_HEADERS});
  } catch {
    // No user coordinates or inventory details in error logs.
    return Response.json({error:"NEARBY_UNAVAILABLE"},{status:503,headers:JSON_HEADERS});
  }
}
