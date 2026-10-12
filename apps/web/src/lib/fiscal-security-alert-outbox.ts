/** Independent security notifications, transactionally bound to the recovery audit. */
import type {PoolClient} from "pg";
import {FiscalMfaError} from "./fiscal-operator-mfa";

type ActorKind="marketplace_super_admin"|"fiscal_admin";
export type FiscalSecurityEventCode="requested"|"approval_recorded"|"completed"|"cancelled";
const emailPattern=/^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function fiscalSecurityDeliveryConfig(){
 if(process.env.FISCAL_SECURITY_ALERT_DELIVERY_ENABLED!=="true")
  throw new FiscalMfaError("RECOVERY_ALERT_DELIVERY_DISABLED",503);
 const from=process.env.FISCAL_SECURITY_ALERT_FROM?.trim()??"";
 const apiKey=process.env.RESEND_API_KEY?.trim()??"";
 const dispatchToken=process.env.FISCAL_SECURITY_ALERT_DISPATCH_TOKEN?.trim()??"";
 if(!emailPattern.test(from)||!apiKey||!/^[a-f0-9]{64}$/i.test(dispatchToken))
  throw new FiscalMfaError("RECOVERY_ALERT_DELIVERY_NOT_CONFIGURED",503);
 return {from,apiKey,dispatchToken};
}

type Contact={id:string;audience:"soc"|"account_owner";recipient_email:string};
export async function enqueueFiscalRecoveryAlerts(db:PoolClient,input:{
 caseId:string;targetKind:ActorKind;targetRef:string;
 eventCode:FiscalSecurityEventCode;eventRef:string;
}){
 // Recovery must fail closed if even one independent verified contact is absent.
 // Never use a freshly supplied email address or an unverified SSO address.
 fiscalSecurityDeliveryConfig();
 const result=await db.query<Contact>(
  `SELECT id,audience,recipient_email FROM fiscal_security_alert_contacts
    WHERE verified_at<=now() AND revoked_at IS NULL
      AND (audience='soc' OR
        (audience='account_owner' AND actor_kind=$1 AND actor_ref=$2))
    FOR SHARE`,[input.targetKind,input.targetRef]);
 const soc=result.rows.filter(row=>row.audience==="soc");
 const owner=result.rows.filter(row=>row.audience==="account_owner");
 if(soc.length!==1||owner.length!==1||soc[0].recipient_email.toLowerCase()===owner[0].recipient_email.toLowerCase())
  throw new FiscalMfaError("RECOVERY_INDEPENDENT_CONTACTS_REQUIRED",503);
 for(const contact of [soc[0],owner[0]]) {
  await db.query(
   `INSERT INTO fiscal_security_alert_outbox(case_id,contact_id,event_code,event_ref)
    VALUES($1,$2,$3,$4)`,
   [input.caseId,contact.id,input.eventCode,input.eventRef]);
 }
}
