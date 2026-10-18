import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {mayAdvanceOrder,type DrinkOrderState,type PaymentState} from "./drinkstock-commerce-policy";
export class FulfilmentError extends Error {constructor(public readonly code:string,public readonly status:number){super(code);}}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export type StaffOrder={
 id:string;tableLabel:string|null;state:DrinkOrderState;paymentState:PaymentState;
 fiscalState:string;amountGrossCents:number;createdAt:string;
 lines:{id:string;description:string;quantity:number;grossCents:number}[];
};
type Db={query<T extends Record<string,unknown>>(sql:string,params?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
function scope(p:string,v:string){
 if(!uuid.test(p)||!uuid.test(v))throw new FulfilmentError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new FulfilmentError("UNAVAILABLE",503);
}
async function permission(db:Db,user:string,p:string,v:string){
 const r=await db.query<{role:string}>(`
 SELECT m.role FROM public.hospitality_partner_memberships m
 JOIN public.hospitality_partners p ON p.id=m.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 JOIN public.hospitality_venues v ON v.partner_id=p.id AND v.id=$3::uuid AND v.status='active'
 WHERE m.user_id=$1 AND m.partner_id=$2::uuid AND m.status='active'`,[user,p,v]);
 if(!r.rows[0])throw new FulfilmentError("NOT_FOUND",404);
 return r.rows[0].role;
}
export async function staffOrderQueue(user:string,p:string,v:string):Promise<{role:string;orders:StaffOrder[]}>{
 scope(p,v);const db=getProductionPostgresRuntime().sqlPool;
 const role=await permission(db,user,p,v);
 if(role==="viewer")throw new FulfilmentError("STAFF_REQUIRED",403);
 const r=await db.query<{id:string;table_label:string|null;order_state:DrinkOrderState;payment_state:PaymentState;fiscal_state:string;amount_gross_cents:number;created_at:Date}>(`
 SELECT o.id::text,a.table_label,o.order_state,o.payment_state,o.fiscal_state,o.amount_gross_cents,o.created_at
 FROM public.drinkstock_orders o
 JOIN public.drinkstock_access_passes a ON a.id=o.table_pass_id AND a.venue_id=o.venue_id AND a.partner_id=o.partner_id
 WHERE o.partner_id=$1::uuid AND o.venue_id=$2::uuid
 AND o.payment_state IN ('paid','refunded','partially_refunded')
 ORDER BY (o.order_state NOT IN ('paid','accepted','preparing','ready')),o.created_at DESC LIMIT 80`,[p,v]);
 if(!r.rows.length)return {role,orders:[]};
 const ids=r.rows.map(x=>x.id);
 const lines=await db.query<{id:string;order_id:string;description:string;quantity:number;total_gross_cents:number}>(`
 SELECT l.id::text,l.order_id::text,l.description,l.quantity,l.total_gross_cents
 FROM public.drinkstock_order_lines l
 JOIN public.drinkstock_orders o ON o.id=l.order_id
 WHERE l.order_id=ANY($1::uuid[]) AND o.partner_id=$2::uuid AND o.venue_id=$3::uuid
 ORDER BY l.id`,[ids,p,v]);
 return {role,orders:r.rows.map(o=>({id:o.id,tableLabel:o.table_label,state:o.order_state,
 paymentState:o.payment_state,fiscalState:o.fiscal_state,
 amountGrossCents:Number(o.amount_gross_cents),createdAt:new Date(o.created_at).toISOString(),
 lines:lines.rows.filter(l=>l.order_id===o.id).map(l=>({id:l.id,description:l.description,
 quantity:Number(l.quantity),grossCents:Number(l.total_gross_cents)}))}))};
}
export function validateFulfilmentAction(value:unknown):{orderId:string;next:"accepted"|"preparing"|"ready"|"served";requestKey:string}{
 if(!value||typeof value!=="object"||Array.isArray(value))throw new FulfilmentError("INVALID_ACTION",400);
 const b=value as Record<string,unknown>;
 if(typeof b.orderId!=="string"||!uuid.test(b.orderId)||
    typeof b.requestKey!=="string"||!uuid.test(b.requestKey)||
    !["accepted","preparing","ready","served"].includes(String(b.next)))
  throw new FulfilmentError("INVALID_ACTION",400);
 return {orderId:b.orderId,requestKey:b.requestKey,next:b.next as "accepted"|"preparing"|"ready"|"served"};
}
export async function advanceStaffOrder(user:string,p:string,v:string,command:ReturnType<typeof validateFulfilmentAction>){
 scope(p,v);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 try{
 await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
 const role=await permission(db,user,p,v);
 if(!["owner","manager","staff"].includes(role))throw new FulfilmentError("STAFF_REQUIRED",403);
 const found=await db.query<{id:string;order_state:DrinkOrderState;payment_state:PaymentState;fiscal_state:string}>(`
 SELECT id::text,order_state,payment_state,fiscal_state
 FROM public.drinkstock_orders
 WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid FOR UPDATE`,
 [command.orderId,p,v]);
 const order=found.rows[0];if(!order)throw new FulfilmentError("ORDER_NOT_FOUND",404);
 const was=await db.query<{id:string}>(`SELECT id::text FROM public.drinkstock_order_events
 WHERE order_id=$1::uuid AND request_key=$2::uuid`,[command.orderId,command.requestKey]);
 if(was.rows.length){await db.query("COMMIT");return {replayed:true,orderState:order.order_state};}
 if(!mayAdvanceOrder(order.order_state,command.next,order.payment_state))
  throw new FulfilmentError("INVALID_ORDER_TRANSITION",409);
 if(command.next==="served"&&order.fiscal_state!=="issued")
  throw new FulfilmentError("RECEIPT_REQUIRED_BEFORE_SERVICE",409);
 await db.query(`UPDATE public.drinkstock_orders SET order_state=$4,updated_at=now()
 WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid`,
 [command.orderId,p,v,command.next]);
 await db.query(`INSERT INTO public.drinkstock_order_events
 (order_id,actor_type,actor_id,from_state,to_state,request_key)
 VALUES($1::uuid,$2,$3,$4,$5,$6::uuid)`,
 [command.orderId,role==="staff"?"staff":"manager",user,order.order_state,command.next,command.requestKey]);
 await db.query("COMMIT");return {replayed:false,orderState:command.next};
 }catch(e){try{await db.query("ROLLBACK");}catch{}throw e;}
 finally{db.release();}
}
