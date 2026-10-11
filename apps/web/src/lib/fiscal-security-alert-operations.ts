/** Read-only operational view of the independent FISCAL MFA recovery alerts. */
import {fiscalPool} from "./fiscal-runtime";

export async function fiscalRecoveryAlertOverview(){
 const db=fiscalPool();
 const {rows:availability}=await db.query<{ready:boolean}>(
  `SELECT (to_regclass('public.fiscal_security_alert_outbox') IS NOT NULL
       AND to_regclass('public.fiscal_security_alert_contacts') IS NOT NULL) AS ready`);
 if(availability[0]?.ready!==true)
  return {schemaReady:false,counts:{pending:0,sending:0,providerAccepted:0,dead:0,overdue:0},alerts:[]};
 const {rows:counts}=await db.query<{
   pending:number;sending:number;provider_accepted:number;dead:number;overdue:number
 }>(`SELECT count(*) FILTER(WHERE status='pending')::int AS pending,
         count(*) FILTER(WHERE status='sending')::int AS sending,
         count(*) FILTER(WHERE status='provider_accepted')::int AS provider_accepted,
         count(*) FILTER(WHERE status='dead')::int AS dead,
         count(*) FILTER(WHERE
           (status='pending' AND next_attempt_at < now()-interval '15 minutes')
           OR (status='sending' AND lease_until < now()))::int AS overdue
       FROM fiscal_security_alert_outbox`);
 const {rows:alerts}=await db.query<{
   id:string;case_id:string;event_code:string;audience:string;
   status:string;attempts:number;created_at:Date;updated_at:Date;
   next_attempt_at:Date;provider_accepted_at:Date|null;last_error_code:string|null
 }>(`SELECT o.id,o.case_id,o.event_code,c.audience,o.status,o.attempts,
            o.created_at,o.updated_at,o.next_attempt_at,o.provider_accepted_at,o.last_error_code
     FROM fiscal_security_alert_outbox o JOIN fiscal_security_alert_contacts c ON c.id=o.contact_id
     ORDER BY o.created_at DESC,o.id DESC LIMIT 40`);
 return {schemaReady:true,counts:{
  pending:counts[0]?.pending??0,sending:counts[0]?.sending??0,
  providerAccepted:counts[0]?.provider_accepted??0,
  dead:counts[0]?.dead??0,overdue:counts[0]?.overdue??0
 },alerts:alerts.map(x=>({
   id:x.id,caseId:x.case_id,eventCode:x.event_code,audience:x.audience,
   status:x.status,attempts:x.attempts,createdAt:x.created_at,updatedAt:x.updated_at,
   nextAttemptAt:x.next_attempt_at,providerAcceptedAt:x.provider_accepted_at,
   lastErrorCode:x.last_error_code
 }))};
}
