import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {VERIFIED_PAYMENT_EVIDENCE_SQL,parseReportDays} from "./drinkstock-payment-evidence";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export class DrinkStockReportError extends Error {
 constructor(public readonly code:string,public readonly status:number){super(code);}
}
export type DrinkStockVenueReport={
 id:string;name:string;verifiedPaidOrders:number;verifiedGrossCents:number;
 reversalAffectedOrders:number;sessionCount:number;demoDemandSignals:number;
 screensActual:number;screensSimulation:number
};
export type DrinkStockRecentSession={
 id:string;venueName:string;state:string;startedAt:string|null;endedAt:string|null;
 floorPercent:number;ceilingPercent:number
};
export type DrinkStockTopDrink={name:string;quantity:number;grossCents:number};
export type DrinkStockDailyTrading={day:string;orders:number;grossCents:number};
export type DrinkStockPartnerReport={
 partnerId:string;partnerName:string;days:7|30|90;generatedAt:string;
 venues:DrinkStockVenueReport[];recentSessions:DrinkStockRecentSession[];
 topDrinks:DrinkStockTopDrink[];daily:DrinkStockDailyTrading[];
 totals:{verifiedPaidOrders:number;verifiedGrossCents:number;reversalAffectedOrders:number;
 sessions:number;demoDemandSignals:number;actualScreens:number;simulationScreens:number};
 commercialCheckoutEnabled:false;
};
function num(v:unknown){const x=Number(v??0);if(!Number.isSafeInteger(x)||x<0)throw new DrinkStockReportError("INVALID_REPORT_VALUE",503);return x;}
type VenueRow={id:string;name:string;paid_orders:number;paid_gross:number;
 reversals:number;sessions:number;demands:number;actual_screens:number;simulation_screens:number};
type SessionRow={id:string;venue_name:string;state:string;started_at:Date|null;ended_at:Date|null;floor_percent:number;ceiling_percent:number};
type ProductRow={description:string;quantity:number;gross_cents:number};
type DailyRow={day:string;orders:number;gross_cents:number};

/** A financial report is not accessible with a public TV/table token or staff role.
 * Every query is partner-scoped and includes independently verified payment evidence.
 */
export async function drinkStockPartnerReport(userId:string,partnerId:string,rawDays:unknown):Promise<DrinkStockPartnerReport>{
 if(!userId||!UUID.test(partnerId))throw new DrinkStockReportError("NOT_FOUND",404);
 let days:7|30|90;
 try{days=parseReportDays(rawDays);}catch{throw new DrinkStockReportError("INVALID_REPORT_PERIOD",400);}
 if(!productionDatabaseConfigured())throw new DrinkStockReportError("REPORT_UNAVAILABLE",503);
 const db=getProductionPostgresRuntime().sqlPool;
 const scope=await db.query<{name:string;role:string}>(`
 SELECT p.name,m.role FROM public.hospitality_partners p
 JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 WHERE p.id=$1::uuid AND p.status='active' AND m.user_id=$2 AND m.status='active' LIMIT 1
 `,[partnerId,userId]);
 if(!scope.rows.length)throw new DrinkStockReportError("NOT_FOUND",404);
 if(!["owner","manager"].includes(scope.rows[0]!.role))throw new DrinkStockReportError("MANAGER_ONLY",403);
 const [venueRows,sessionRows,productRows,dailyRows]=await Promise.all([
  db.query<VenueRow>(`
 SELECT v.id::text,v.name,COALESCE(sales.paid_orders,0)::int AS paid_orders,
 COALESCE(sales.paid_gross,0)::bigint AS paid_gross,
 COALESCE(sales.reversals,0)::int AS reversals,
 COALESCE(sessions.n,0)::int AS sessions,
 COALESCE(demands.n,0)::int AS demands,
 COALESCE(screens.actual_n,0)::int AS actual_screens,
 COALESCE(screens.sim_n,0)::int AS simulation_screens
 FROM public.hospitality_venues v
 LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER(WHERE o.payment_state='paid' AND o.order_state IN ('paid','accepted','preparing','ready','served')) AS paid_orders,
  COALESCE(SUM(o.amount_gross_cents) FILTER(WHERE o.payment_state='paid' AND o.order_state IN ('paid','accepted','preparing','ready','served')),0) AS paid_gross,
  COUNT(*) FILTER(WHERE o.payment_state IN ('refunded','partially_refunded')) AS reversals
  FROM public.drinkstock_orders o
  WHERE o.partner_id=v.partner_id AND o.venue_id=v.id
   AND o.created_at >= now()-($2::int * interval '1 day')
   AND ${VERIFIED_PAYMENT_EVIDENCE_SQL}
 ) sales ON TRUE
 LEFT JOIN LATERAL (
  SELECT COUNT(*) AS n FROM public.drinkstock_sessions ds
  WHERE ds.partner_id=v.partner_id AND ds.venue_id=v.id
  AND ds.created_at >= now()-($2::int * interval '1 day')
 ) sessions ON TRUE
 LEFT JOIN LATERAL (
  SELECT COUNT(*) AS n FROM public.drinkstock_market_events e
  WHERE e.partner_id=v.partner_id AND e.venue_id=v.id AND e.event_type='demand'
  AND e.created_at >= now()-($2::int * interval '1 day')
 ) demands ON TRUE
 LEFT JOIN LATERAL (
  SELECT COUNT(*) FILTER(WHERE a.feed_mode='actual') AS actual_n,
  COUNT(*) FILTER(WHERE a.feed_mode='simulation') AS sim_n
  FROM public.drinkstock_access_passes a
  WHERE a.partner_id=v.partner_id AND a.venue_id=v.id
  AND a.kind='screen' AND a.revoked_at IS NULL
 ) screens ON TRUE
 WHERE v.partner_id=$1::uuid AND v.status='active'
 ORDER BY v.name ASC,v.id ASC LIMIT 100
 `,[partnerId,days]),
  db.query<SessionRow>(`
 SELECT s.id::text,v.name AS venue_name,s.state,s.started_at,s.ended_at,
 s.floor_percent,s.ceiling_percent
 FROM public.drinkstock_sessions s
 JOIN public.hospitality_venues v ON v.id=s.venue_id AND v.partner_id=s.partner_id
 WHERE s.partner_id=$1::uuid AND s.created_at >= now()-($2::int * interval '1 day')
 ORDER BY s.created_at DESC,s.id DESC LIMIT 15
 `,[partnerId,days]),
  db.query<ProductRow>(`
 SELECT l.description,SUM(l.quantity)::int AS quantity,
 SUM(l.total_gross_cents)::bigint AS gross_cents
 FROM public.drinkstock_orders o
 JOIN public.drinkstock_order_lines l ON l.order_id=o.id
 JOIN public.drinkstock_products d ON d.id=l.product_id
  AND d.partner_id=o.partner_id AND d.venue_id=o.venue_id
 WHERE o.partner_id=$1::uuid AND o.created_at >= now()-($2::int * interval '1 day')
 AND o.payment_state='paid' AND o.order_state IN ('paid','accepted','preparing','ready','served')
 AND ${VERIFIED_PAYMENT_EVIDENCE_SQL}
 GROUP BY l.description ORDER BY quantity DESC,gross_cents DESC,l.description ASC LIMIT 10
 `,[partnerId,days]),
  db.query<DailyRow>(`
 SELECT to_char(o.created_at AT TIME ZONE 'Europe/Athens','YYYY-MM-DD') AS day,
 COUNT(*)::int AS orders,COALESCE(SUM(o.amount_gross_cents),0)::bigint AS gross_cents
 FROM public.drinkstock_orders o
 WHERE o.partner_id=$1::uuid AND o.created_at >= now()-($2::int * interval '1 day')
 AND o.payment_state='paid' AND o.order_state IN ('paid','accepted','preparing','ready','served')
 AND ${VERIFIED_PAYMENT_EVIDENCE_SQL}
 GROUP BY day ORDER BY day DESC LIMIT 90
 `,[partnerId,days])
 ]);
 const venues=venueRows.rows.map(v=>({
  id:v.id,name:v.name,verifiedPaidOrders:num(v.paid_orders),verifiedGrossCents:num(v.paid_gross),
  reversalAffectedOrders:num(v.reversals),sessionCount:num(v.sessions),demoDemandSignals:num(v.demands),
  screensActual:num(v.actual_screens),screensSimulation:num(v.simulation_screens)
 }));
 return {
  partnerId,partnerName:scope.rows[0]!.name,days,generatedAt:new Date().toISOString(),venues,
  recentSessions:sessionRows.rows.map(x=>({id:x.id,venueName:x.venue_name,state:x.state,
   startedAt:x.started_at?new Date(x.started_at).toISOString():null,
   endedAt:x.ended_at?new Date(x.ended_at).toISOString():null,
   floorPercent:num(x.floor_percent),ceilingPercent:num(x.ceiling_percent)})),
  topDrinks:productRows.rows.map(x=>({name:x.description,quantity:num(x.quantity),grossCents:num(x.gross_cents)})),
  daily:dailyRows.rows.map(x=>({day:x.day,orders:num(x.orders),grossCents:num(x.gross_cents)})),
  totals:venues.reduce((t,v)=>({
   verifiedPaidOrders:t.verifiedPaidOrders+v.verifiedPaidOrders,
   verifiedGrossCents:t.verifiedGrossCents+v.verifiedGrossCents,
   reversalAffectedOrders:t.reversalAffectedOrders+v.reversalAffectedOrders,
   sessions:t.sessions+v.sessionCount,
   demoDemandSignals:t.demoDemandSignals+v.demoDemandSignals,
   actualScreens:t.actualScreens+v.screensActual,
   simulationScreens:t.simulationScreens+v.screensSimulation
  }),{verifiedPaidOrders:0,verifiedGrossCents:0,reversalAffectedOrders:0,sessions:0,demoDemandSignals:0,actualScreens:0,simulationScreens:0}),
  commercialCheckoutEnabled:false
 };
}
