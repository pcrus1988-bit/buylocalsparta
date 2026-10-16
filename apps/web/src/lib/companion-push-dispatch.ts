import {PostgresUnitOfWork,type SqlRow} from "@buy-local-sparta/core";
import {getProductionPostgresRuntime} from "./postgres-runtime";
import {companionDispatchGate,classifyFcmResponse,type FcmSendOutcome} from "./companion-fcm-status";
import {pushRegistrationEnabled,sendCompanionEventToDevice} from "./companion-push-service";

const BATCH=5;
const scope=(name:string)=>({platformAccess:true as const,requestId:"companion-dispatch:"+name});
const unit=()=>new PostgresUnitOfWork(getProductionPostgresRuntime().sqlPool,{
 statementTimeoutMs:5000,lockTimeoutMs:800
});
export function companionDispatcherEnabled(){
 return pushRegistrationEnabled()&&companionDispatchGate(process.env);
}

async function seed(){
 return unit().withTransaction(scope("seed"),async tx=>{
  const events=await tx.query<SqlRow>(`
   SELECT id::text,expires_at FROM public.companion_push_outbox
   WHERE status='pending'
   ORDER BY created_at ASC
   FOR UPDATE SKIP LOCKED LIMIT 12
  `);
  let deliveries=0;
  for(const e of events.rows){
   if(new Date(String(e.expires_at)).getTime()<=Date.now()){
    await tx.query("UPDATE public.companion_push_outbox SET status='suppressed',processed_at=now() WHERE id=$1::uuid",[e.id]);
    continue;
   }
   // No vendor or user may submit an arbitrary recipient. The transaction
   // re-checks user ownership, live session and explicit order consent.
   const added=await tx.query<SqlRow>(`
     INSERT INTO public.companion_push_deliveries(outbox_id,device_id)
     SELECT $1::uuid,d.id
     FROM public.companion_push_outbox e
     JOIN public.customer_orders o ON o.id=e.order_id AND o.user_id=e.user_id
     JOIN public.companion_push_devices d ON d.user_id=e.user_id
     JOIN public.companion_mobile_sessions s ON s.id=d.session_id AND s.user_id=e.user_id
     JOIN public.users u ON u.id=e.user_id
     WHERE e.id=$1::uuid AND e.expires_at>now()
       AND d.disabled_at IS NULL AND d.order_updates_enabled
       AND d.last_registered_at>now()-interval '60 days'
       AND s.revoked_at IS NULL AND s.refresh_expires_at>now()
       AND s.absolute_expires_at>now() AND u.status='active'
     ON CONFLICT (outbox_id,device_id) DO NOTHING RETURNING id
   `,[e.id]);
   deliveries+=added.rows.length;
   await tx.query(`UPDATE public.companion_push_outbox
     SET status=CASE WHEN EXISTS(
       SELECT 1 FROM public.companion_push_deliveries WHERE outbox_id=$1::uuid
     ) THEN 'processed' ELSE 'suppressed' END,processed_at=now()
     WHERE id=$1::uuid`,[e.id]);
  }
  return {events:events.rows.length,deliveries};
 });
}

type ClaimedDelivery={
 id:string;deviceId:string;userId:string;encryptedToken:string;
 eventType:"order_status"|"pickup_ready";orderPublicId:string;attempts:number;
};
async function claim():Promise<ClaimedDelivery[]>{
 return unit().withTransaction(scope("claim"),async tx=>{
  // Conservative recovery after worker crashes; 3 attempts at most.
  await tx.query(`
   UPDATE public.companion_push_deliveries
   SET status=CASE WHEN attempts>=3 THEN 'failed' ELSE 'retry' END,
     due_at=now()+interval '3 minutes',
     completed_at=CASE WHEN attempts>=3 THEN now() ELSE NULL END,
     reserved_until=NULL
   WHERE status='reserved' AND reserved_until<now()
  `);
  // Revocations, removed permissions and completed pickups suppress queued
  // messages even if consent was present when the order first changed.
  await tx.query(`
    UPDATE public.companion_push_deliveries delivery
    SET status='suppressed',completed_at=now(),reserved_until=NULL
    WHERE delivery.status IN ('pending','retry')
      AND NOT EXISTS(
        SELECT 1
        FROM public.companion_push_outbox e
        JOIN public.companion_push_devices d ON d.id=delivery.device_id
          AND d.user_id=e.user_id
        JOIN public.companion_mobile_sessions s ON s.id=d.session_id
          AND s.user_id=e.user_id
        JOIN public.users u ON u.id=e.user_id
        JOIN public.customer_orders o ON o.id=e.order_id AND o.user_id=e.user_id
        WHERE e.id=delivery.outbox_id AND e.expires_at>now()
          AND d.disabled_at IS NULL AND d.order_updates_enabled
          AND d.last_registered_at>now()-interval '60 days'
          AND s.revoked_at IS NULL AND s.refresh_expires_at>now()
          AND s.absolute_expires_at>now() AND u.status='active'
          AND (
            e.event_type='order_status'
            OR (e.event_type='pickup_ready' AND EXISTS(
              SELECT 1 FROM public.pickup_groups pg
              JOIN public.fulfilment_orders fo ON fo.id=pg.fulfilment_order_id
              WHERE pg.id=e.pickup_group_id
                AND pg.ready_at IS NOT NULL AND pg.collected_at IS NULL
                AND fo.status='ready_for_handover' AND fo.mode='pickup'
                AND o.status NOT IN ('cancelled','refunded')
            ))
          )
      )
  `);
  const candidates=await tx.query<SqlRow>(`
    WITH selected AS(
      SELECT delivery.id
      FROM public.companion_push_deliveries delivery
      JOIN public.companion_push_outbox e ON e.id=delivery.outbox_id
      JOIN public.companion_push_devices d ON d.id=delivery.device_id
        AND d.user_id=e.user_id
      JOIN public.companion_mobile_sessions s ON s.id=d.session_id
        AND s.user_id=e.user_id
      WHERE delivery.status IN ('pending','retry') AND delivery.due_at<=now()
        AND delivery.attempts<3 AND e.expires_at>now()
        AND d.disabled_at IS NULL AND d.order_updates_enabled
        AND s.revoked_at IS NULL AND s.refresh_expires_at>now()
        AND s.absolute_expires_at>now()
        AND (SELECT count(*) FROM public.companion_push_deliveries other
         WHERE other.device_id=d.id AND other.status='submitted'
           AND other.created_at>now()-interval '24 hours')<4
      ORDER BY delivery.due_at
      FOR UPDATE OF delivery SKIP LOCKED LIMIT $1
    )
    UPDATE public.companion_push_deliveries delivery
    SET status='reserved',attempts=delivery.attempts+1,
      reserved_until=now()+interval '3 minutes'
    FROM selected,public.companion_push_outbox e,
      public.companion_push_devices d,public.customer_orders o
    WHERE delivery.id=selected.id AND e.id=delivery.outbox_id
      AND d.id=delivery.device_id AND o.id=e.order_id AND o.user_id=e.user_id
    RETURNING delivery.id::text AS id,d.id::text AS device_id,
      e.user_id::text AS user_id,d.token_encrypted,e.event_type,
      o.public_id AS order_public_id,delivery.attempts
  `,[BATCH]);
  return candidates.rows.map(r=>({
   id:String(r.id),deviceId:String(r.device_id),userId:String(r.user_id),
   encryptedToken:String(r.token_encrypted),
   eventType:r.event_type==="pickup_ready"?"pickup_ready":"order_status",
   orderPublicId:String(r.order_public_id),attempts:Number(r.attempts)
  }));
 });
}

async function stillAllowed(d:ClaimedDelivery){
 return unit().withTransaction(scope("final-consent"),async tx=>{
  const q=await tx.query<SqlRow>(`
    SELECT 1 FROM public.companion_push_deliveries dl
    JOIN public.companion_push_outbox e ON e.id=dl.outbox_id
    JOIN public.companion_push_devices pd ON pd.id=dl.device_id
      AND pd.user_id=e.user_id
    JOIN public.companion_mobile_sessions s ON s.id=pd.session_id
      AND s.user_id=e.user_id
    JOIN public.users u ON u.id=e.user_id
    JOIN public.customer_orders o ON o.id=e.order_id AND o.user_id=e.user_id
    WHERE dl.id=$1::uuid AND dl.status='reserved'
      AND dl.device_id=$2::uuid AND e.user_id=$3::uuid
      AND e.expires_at>now() AND pd.disabled_at IS NULL
      AND pd.order_updates_enabled AND pd.last_registered_at>now()-interval '60 days'
      AND s.revoked_at IS NULL AND s.refresh_expires_at>now()
      AND s.absolute_expires_at>now() AND u.status='active'
      AND (e.event_type='order_status' OR EXISTS(
        SELECT 1 FROM public.pickup_groups pg
        JOIN public.fulfilment_orders fo ON fo.id=pg.fulfilment_order_id
        WHERE pg.id=e.pickup_group_id AND pg.ready_at IS NOT NULL
          AND pg.collected_at IS NULL AND fo.status='ready_for_handover'
          AND fo.mode='pickup' AND o.status NOT IN ('cancelled','refunded')
      ))
    LIMIT 1
  `,[d.id,d.deviceId,d.userId]);
  return q.rows.length>0;
 },{readOnly:true});
}

async function finish(d:ClaimedDelivery,outcome:FcmSendOutcome,messageId=""){
 await unit().withTransaction(scope("finish"),async tx=>{
  const status=outcome==="submitted"?"submitted":
   outcome==="invalid_token"?"invalid":
   outcome==="retry"&&d.attempts<3?"retry":
   outcome==="retry"?"failed":"failed";
  await tx.query(`
    UPDATE public.companion_push_deliveries
    SET status=$2,reserved_until=NULL,provider_message_id=$3,
      due_at=CASE WHEN $2='retry' THEN now()+interval '5 minutes' ELSE due_at END,
      completed_at=CASE WHEN $2='retry' THEN NULL ELSE now() END
    WHERE id=$1::uuid AND status='reserved'
  `,[d.id,status,messageId]);
  if(outcome==="invalid_token"){
   const disabled=await tx.query<SqlRow>(`
     UPDATE public.companion_push_devices
     SET disabled_at=now(),order_updates_enabled=false,saved_items_enabled=false,
       vendor_offers_enabled=false
     WHERE id=$1::uuid AND user_id=$2::uuid AND disabled_at IS NULL
     RETURNING session_id
   `,[d.deviceId,d.userId]);
   if(disabled.rows[0])await tx.query(`
     INSERT INTO public.companion_push_consent_events
       (user_id,session_id,order_updates_enabled,saved_items_enabled,
        vendor_offers_enabled,action,consent_version)
     VALUES($1::uuid,$2::uuid,false,false,false,'disable','companion-android-push-v1')
   `,[d.userId,disabled.rows[0].session_id]);
  }
 });
}

/** No browsing/user API; only trusted scheduler with explicit server secret. */
export async function runCompanionTransactionalPushBatch(){
 if(!companionDispatcherEnabled())throw Error("DISPATCH_NOT_ENABLED");
 const seedResult=await seed();
 const claimed=await claim();
 let submitted=0,suppressed=0,retried=0,invalid=0;
 for(const d of claimed){
  if(!await stillAllowed(d)){
   await unit().withTransaction(scope("suppress-late"),async tx=>{
    await tx.query(`UPDATE public.companion_push_deliveries
      SET status='suppressed',completed_at=now(),reserved_until=NULL
      WHERE id=$1::uuid AND status='reserved'`,[d.id]);
   });
   suppressed++;continue;
  }
  try{
   const result=await sendCompanionEventToDevice(
     d.encryptedToken,d.eventType,d.orderPublicId);
   const outcome=classifyFcmResponse(result.status,result.body);
   await finish(d,outcome,result.messageId??"");
   if(outcome==="submitted")submitted++;
   else if(outcome==="invalid_token")invalid++;
   else retried++;
  }catch{
   // Never log FCM credentials, device tokens, user identifiers or payloads.
   await finish(d,"retry");
   retried++;
  }
 }
 return {queuedEvents:seedResult.events,newDeliveries:seedResult.deliveries,
   claimed:claimed.length,submitted,suppressed,retried,invalid};
}
