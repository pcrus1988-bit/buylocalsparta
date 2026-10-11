/** Read-only, privacy-minimized operational view; no email addresses or secrets. */
import {fiscalPool} from "./fiscal-runtime";
export async function fiscalRecoveryAlertOverview(){
 const db=fiscalPool();
 const {rows:availability}=await db.query<{ready:boolean;receipts_ready:boolean}>(
  `SELECT (to_regclass('public.fiscal_security_alert_outbox') IS NOT NULL
     AND to_regclass('public.fiscal_security_alert_contacts') IS NOT NULL) AS ready,
     (to_regclass('public.fiscal_security_alert_delivery_events') IS NOT NULL) AS receipts_ready`);
 if(availability[0]?.ready!==true)
  return {schemaReady:false,deliveryReceiptsReady:false,
   counts:{pending:0,sending:0,providerAccepted:0,dead:0,overdue:0,
     serverDelivered:0,deliveryProblem:0},alerts:[]};
 const receiptsReady=availability[0].receipts_ready===true;
 const {rows:counts}=await db.query<{
  pending:number;sending:number;provider_accepted:number;dead:number;overdue:number
 }>(`SELECT count(*) FILTER(WHERE status='pending')::int AS pending,
         count(*) FILTER(WHERE status='sending')::int AS sending,
         count(*) FILTER(WHERE status='provider_accepted')::int AS provider_accepted,
         count(*) FILTER(WHERE status='dead')::int AS dead,
         count(*) FILTER(WHERE
           (status='pending' AND next_attempt_at<now()-interval '15 minutes')
           OR (status='sending' AND lease_until<now()))::int AS overdue
       FROM fiscal_security_alert_outbox`);
 const baseCount=counts[0];
 let serverDelivered=0,deliveryProblem=0;
 if(receiptsReady){
  const {rows}=await db.query<{delivered:number;failed:number}>(
   `SELECT count(*) FILTER(WHERE o.status='provider_accepted'
             AND EXISTS(SELECT 1 FROM fiscal_security_alert_delivery_events e
                WHERE e.outbox_id=o.id AND e.event_type='email.delivered')
             AND NOT EXISTS(SELECT 1 FROM fiscal_security_alert_delivery_events e
                WHERE e.outbox_id=o.id AND e.event_type IN
                   ('email.bounced','email.complained','email.failed','email.suppressed')))::int AS delivered,
          count(*) FILTER(WHERE EXISTS(
            SELECT 1 FROM fiscal_security_alert_delivery_events e
             WHERE e.outbox_id=o.id AND e.event_type IN
              ('email.bounced','email.complained','email.failed','email.suppressed')))::int AS failed
        FROM fiscal_security_alert_outbox o`);
  serverDelivered=rows[0]?.delivered??0;
  deliveryProblem=rows[0]?.failed??0;
 }
 const {rows:alerts}=await db.query<{
   id:string;case_id:string;event_code:string;audience:string;
   status:string;attempts:number;created_at:Date;updated_at:Date;
   next_attempt_at:Date;provider_accepted_at:Date|null;last_error_code:string|null
 }>(`SELECT o.id,o.case_id,o.event_code,c.audience,o.status,o.attempts,
           o.created_at,o.updated_at,o.next_attempt_at,o.provider_accepted_at,o.last_error_code
    FROM fiscal_security_alert_outbox o JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
    ORDER BY o.created_at DESC,o.id DESC LIMIT 40`);
 const ids=alerts.map(x=>x.id);
 const receipts=new Map<string,string>();
 if(receiptsReady && ids.length){
  const {rows:events}=await db.query<{outbox_id:string;event_type:string}>(
   `SELECT outbox_id,event_type FROM fiscal_security_alert_delivery_events
     WHERE outbox_id=ANY($1::uuid[])`,[ids]);
  const priority:Record<string,number>={unconfirmed:0,delayed:1,delivered:2,failed:3};
  for(const event of events){
   const state=event.event_type==="email.delivered"?"delivered":
    event.event_type==="email.delivery_delayed"?"delayed":"failed";
   const previous=receipts.get(event.outbox_id)??"unconfirmed";
   if(priority[state]>priority[previous])receipts.set(event.outbox_id,state);
  }
 }
 return {schemaReady:true,deliveryReceiptsReady:receiptsReady,
  counts:{
   pending:baseCount?.pending??0,sending:baseCount?.sending??0,
   providerAccepted:baseCount?.provider_accepted??0,dead:baseCount?.dead??0,
   overdue:baseCount?.overdue??0,serverDelivered,deliveryProblem
  },
  alerts:alerts.map(x=>({
   id:x.id,caseId:x.case_id,eventCode:x.event_code,audience:x.audience,
   status:x.status,attempts:x.attempts,createdAt:x.created_at,updatedAt:x.updated_at,
   nextAttemptAt:x.next_attempt_at,providerAcceptedAt:x.provider_accepted_at,
   lastErrorCode:x.last_error_code,
   deliveryState:receipts.get(x.id)??"unconfirmed"
  }))
 };
}
