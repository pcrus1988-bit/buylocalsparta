import { getProductionPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import {mayMutateRehearsal} from "./drinkstock-screen-showcase";
import { drinkPriceBand, priceRehearsalDemand, VENUE_MAX_PRODUCTS, DEFAULT_PRICE_BOUNDS, venueCanManageMarket, mayEditPreSessionConfig, type MarketBounds, type RehearsalDrink, type RehearsalMovement, type DrinkStockCategory, type validateMarketAction } from "./drinkstock-market-pricing";

type Action = ReturnType<typeof validateMarketAction>;
export type MarketVenue = Readonly<{id:string;name:string;partnerId:string;role:string;rehearsalEnabled:boolean;activeSession:boolean;bounds:MarketBounds}>;
export type MarketProduct = Readonly<{id:string;name:string;category:DrinkStockCategory;baseCents:number;priceCents:number;minCents:number;maxCents:number;active:boolean}>;
export type MarketEvent = Readonly<{id:string;type:string;selectedProductId:string|null;movements:RehearsalMovement[];createdAt:string}>;
export type MarketSnapshot = Readonly<{venue:MarketVenue;products:MarketProduct[];events:MarketEvent[];canManage:boolean;mode:"rehearsal_only"}>;

export class DrinkStockMarketError extends Error {
  constructor(publicCode:string,public readonly status:number){
    super(publicCode);this.code=publicCode;
  }
  readonly code:string;
}
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertScope(userId:string,partnerId:string,venueId:string){
  if(!userId||!uuidPattern.test(partnerId)||!uuidPattern.test(venueId))
    throw new DrinkStockMarketError("MARKET_NOT_FOUND",404);
  if(!productionDatabaseConfigured())throw new DrinkStockMarketError("MARKET_UNAVAILABLE",503);
}
type ReadDb = {query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
type VenueRow = {id:string;name:string;partner_id:string;role:string;rehearsal_enabled:boolean;active_session:boolean;floor_percent:number;ceiling_percent:number};
const venueQuery=(lock:boolean)=>`
SELECT v.id::text AS id,v.name,v.partner_id::text AS partner_id,m.role,
  COALESCE(s.rehearsal_enabled,FALSE) AS rehearsal_enabled,
 COALESCE(s.floor_percent,70)::int AS floor_percent,
 COALESCE(s.ceiling_percent,145)::int AS ceiling_percent,
 EXISTS (
  SELECT 1 FROM public.drinkstock_sessions ds
  WHERE ds.venue_id=v.id AND ds.partner_id=v.partner_id
    AND ds.state IN ('scheduled','running','paused','crashing')
 ) AS active_session
FROM public.hospitality_venues v
JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled=TRUE
LEFT JOIN public.drinkstock_venue_settings s ON s.venue_id=v.id AND s.partner_id=v.partner_id
WHERE v.id=$3::uuid AND v.partner_id=$2::uuid AND v.status='active'
${lock?"FOR UPDATE OF v":""}
`;
async function authorizedVenue(db:ReadDb,userId:string,partnerId:string,venueId:string,lock=false):Promise<MarketVenue>{
  const result=await db.query<VenueRow>(venueQuery(lock),[userId,partnerId,venueId]);
  const row=result.rows[0];
  if(!row)throw new DrinkStockMarketError("MARKET_NOT_FOUND",404);
  return {id:row.id,name:row.name,partnerId:row.partner_id,role:row.role,rehearsalEnabled:row.rehearsal_enabled,activeSession:row.active_session,
    bounds:{floorPercent:Number(row.floor_percent),ceilingPercent:Number(row.ceiling_percent)}};
}
type ProductRow={id:string;name:string;category:DrinkStockCategory;base_cents:number;price_cents:number;min_cents:number;max_cents:number;active:boolean};
const productSql=`
SELECT d.id::text AS id,d.name,d.category,d.base_cents,d.price_cents,d.min_cents,d.max_cents,d.active
FROM public.drinkstock_products d
WHERE d.partner_id=$2::uuid AND d.venue_id=$3::uuid AND d.active=TRUE
AND EXISTS(
 SELECT 1 FROM public.hospitality_partner_memberships m
 JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=m.partner_id AND a.app_key='drinkStock' AND a.enabled=TRUE
 JOIN public.hospitality_venues v ON v.partner_id=m.partner_id AND v.id=d.venue_id AND v.status='active'
 WHERE m.user_id=$1 AND m.partner_id=d.partner_id AND m.status='active'
)
ORDER BY d.name ASC,d.id ASC
LIMIT 61
`;
async function authorizedProducts(db:ReadDb,u:string,p:string,v:string):Promise<MarketProduct[]>{
  const result=await db.query<ProductRow>(productSql,[u,p,v]);
  if(result.rows.length>VENUE_MAX_PRODUCTS)throw new DrinkStockMarketError("PRODUCT_LIMIT_REACHED",409);
  return result.rows.map(d=>({id:d.id,name:d.name,category:d.category,baseCents:Number(d.base_cents),
    priceCents:Number(d.price_cents),minCents:Number(d.min_cents),maxCents:Number(d.max_cents),active:Boolean(d.active)}));
}
type EventRow={id:string;event_type:string;selected_product_id:string|null;movements:unknown;created_at:string|Date};
export async function drinkStockMarketSnapshot(userId:string,partnerId:string,venueId:string):Promise<MarketSnapshot>{
  assertScope(userId,partnerId,venueId);
  const db=getProductionPostgresRuntime().sqlPool;
  const venue=await authorizedVenue(db,userId,partnerId,venueId);
  const [products,history]=await Promise.all([
    authorizedProducts(db,userId,partnerId,venueId),
    db.query<EventRow>(`
SELECT e.id::text AS id,e.event_type,e.selected_product_id::text AS selected_product_id,e.movements,e.created_at
FROM public.drinkstock_market_events e
WHERE e.partner_id=$2::uuid AND e.venue_id=$3::uuid
AND EXISTS(SELECT 1 FROM public.hospitality_partner_memberships m
 JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 JOIN public.hospitality_venues v ON v.id=e.venue_id AND v.partner_id=e.partner_id AND v.status='active'
 WHERE m.partner_id=e.partner_id AND m.user_id=$1 AND m.status='active')
ORDER BY e.created_at DESC,e.id DESC LIMIT 20
`,[userId,partnerId,venueId])
  ]);
  return {venue,products,events:history.rows.map(row=>({
    id:row.id,type:row.event_type,selectedProductId:row.selected_product_id,
    movements:Array.isArray(row.movements)?row.movements as RehearsalMovement[]:[],
    createdAt:new Date(row.created_at).toISOString()
  })),canManage:venueCanManageMarket(venue.role),mode:"rehearsal_only"};
}

export async function mutateDrinkStockMarket(userId:string,partnerId:string,venueId:string,action:Action):Promise<MarketSnapshot>{
  assertScope(userId,partnerId,venueId);
  const db=getProductionPostgresRuntime().sqlPool;
  const client=await db.connect();
  let done=false;
  try{
    await client.query("BEGIN");
    await client.query("SET LOCAL statement_timeout = '8s'");
    const venue=await authorizedVenue(client,userId,partnerId,venueId,true);
    if(!venueCanManageMarket(venue.role))throw new DrinkStockMarketError("MARKET_ROLE_FORBIDDEN",403);
    // Rehearsal demand, pause/resume and reset can never alter or masquerade as
    // authenticated operational-session activity, including its crash window.
    if(["demand","pause","resume","reset"].includes(action.action) &&
       !mayMutateRehearsal(venue.activeSession,action.action))
      throw new DrinkStockMarketError("REHEARSAL_DISABLED_DURING_SESSION",409);
    const prior=await client.query<{id:string}>(`
      SELECT id::text AS id FROM public.drinkstock_market_events
      WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND request_key=$3::uuid
    `,[partnerId,venueId,action.requestKey]);
    if(prior.rows.length){await client.query("COMMIT");done=true;return drinkStockMarketSnapshot(userId,partnerId,venueId);}
    let selectedProductId:string|null=null;
    let movements:RehearsalMovement[]=[];
    let eventType:string;
    if(action.action==="add_product"){
      if(!action.product)throw new DrinkStockMarketError("INVALID_PRODUCT",400);
      const products=await authorizedProducts(client,userId,partnerId,venueId);
      if(products.length>=VENUE_MAX_PRODUCTS)throw new DrinkStockMarketError("PRODUCT_LIMIT_REACHED",409);
      if(!mayEditPreSessionConfig(venue))throw new DrinkStockMarketError("SESSION_ACTIVE",409);
      const band=drinkPriceBand(action.product.baseCents,venue.bounds);
      const inserted=await client.query<{id:string}>(`
        INSERT INTO public.drinkstock_products(venue_id,partner_id,name,category,base_cents,price_cents,min_cents,max_cents)
        VALUES($1::uuid,$2::uuid,$3,$4,$5,$5,$6,$7) RETURNING id::text AS id
      `,[venueId,partnerId,action.product.name,action.product.category,action.product.baseCents,band.minCents,band.maxCents]);
      selectedProductId=inserted.rows[0]?.id??null;
      eventType="product_added";
    }else if(action.action==="set_bounds"){
      // Serialize configuration changes against start/demand via the venue row lock.
      if(!mayEditPreSessionConfig(venue))throw new DrinkStockMarketError("BOUNDS_LOCKED_DURING_SESSION",409);
      if(!action.bounds)throw new DrinkStockMarketError("INVALID_PRICE_BOUNDS",400);
      const bounds=action.bounds;
      await client.query(`
        INSERT INTO public.drinkstock_venue_settings
          (venue_id,partner_id,rehearsal_enabled,floor_percent,ceiling_percent,updated_at)
        VALUES($1::uuid,$2::uuid,FALSE,$3,$4,now())
        ON CONFLICT(venue_id,partner_id) DO UPDATE
        SET floor_percent=EXCLUDED.floor_percent,ceiling_percent=EXCLUDED.ceiling_percent,updated_at=now()
      `,[venueId,partnerId,bounds.floorPercent,bounds.ceilingPercent]);
      // Recalculate every listing atomically. Reset to base so a new session
      // always begins consistently within the owner's newly chosen bounds.
      const products=await authorizedProducts(client,userId,partnerId,venueId);
      for(const d of products){
        const band=drinkPriceBand(d.baseCents,bounds);
        movements.push({id:d.id,name:d.name,beforeCents:d.priceCents,
          afterCents:d.baseCents,deltaCents:d.baseCents-d.priceCents});
        await client.query(`
          UPDATE public.drinkstock_products
          SET min_cents=$1,max_cents=$2,price_cents=base_cents,updated_at=now()
          WHERE id=$3::uuid AND venue_id=$4::uuid AND partner_id=$5::uuid
        `,[band.minCents,band.maxCents,d.id,venueId,partnerId]);
      }
      eventType="bounds_updated";
    }else if(action.action==="resume"||action.action==="pause"){
      await client.query(`
        INSERT INTO public.drinkstock_venue_settings(venue_id,partner_id,rehearsal_enabled,updated_at)
        VALUES($1::uuid,$2::uuid,$3,now())
        ON CONFLICT(venue_id,partner_id) DO UPDATE SET rehearsal_enabled=EXCLUDED.rehearsal_enabled,updated_at=now()
      `,[venueId,partnerId,action.action==="resume"]);
      eventType=action.action==="resume"?"rehearsal_started":"rehearsal_paused";
    }else{
      const products=await authorizedProducts(client,userId,partnerId,venueId);
      if(action.action==="demand"){
        if(!venue.rehearsalEnabled)throw new DrinkStockMarketError("REHEARSAL_PAUSED",409);
        const priorEvent=await client.query<{created_at:Date}>(`
          SELECT created_at FROM public.drinkstock_market_events
          WHERE venue_id=$1::uuid AND partner_id=$2::uuid AND event_type='demand'
          ORDER BY created_at DESC LIMIT 1
        `,[venueId,partnerId]);
        if(priorEvent.rows[0] && Date.now()-new Date(priorEvent.rows[0].created_at).getTime()<1000)
          throw new DrinkStockMarketError("MARKET_COOLDOWN",429);
        selectedProductId=action.productId??null;
        if(!selectedProductId)throw new DrinkStockMarketError("INVALID_PRODUCT_ID",400);
        try{
          movements=priceRehearsalDemand(products.map((p):RehearsalDrink=>({
            id:p.id,name:p.name,baseCents:p.baseCents,priceCents:p.priceCents
          })),selectedProductId,venue.bounds);
        }catch{throw new DrinkStockMarketError("DRINK_NOT_IN_VENUE",404);}
        eventType="demand";
      }else{
        movements=products.map(d=>({id:d.id,name:d.name,beforeCents:d.priceCents,
          afterCents:d.baseCents,deltaCents:d.baseCents-d.priceCents}));
        eventType="reset";
      }
      for(const movement of movements){
        await client.query(`
          UPDATE public.drinkstock_products SET price_cents=$1,updated_at=now()
          WHERE id=$2::uuid AND venue_id=$3::uuid AND partner_id=$4::uuid
        `,[movement.afterCents,movement.id,venueId,partnerId]);
      }
    }
    await client.query(`
      INSERT INTO public.drinkstock_market_events
        (venue_id,partner_id,request_key,actor_user_id,event_type,selected_product_id,movements)
      VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5,$6::uuid,$7::jsonb)
    `,[venueId,partnerId,action.requestKey,userId,eventType,selectedProductId,JSON.stringify(movements)]);
    await client.query("COMMIT");done=true;
  }catch(error){
    if(!done)try{await client.query("ROLLBACK");}catch{ /* preserve cause */ }
    throw error;
  }finally{client.release();}
  return drinkStockMarketSnapshot(userId,partnerId,venueId);
}
