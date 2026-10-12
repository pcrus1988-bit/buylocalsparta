import {fiscalAdminActor} from "../../../../../lib/fiscal-auth";
import {isFiscalMfaSatisfied} from "../../../../../lib/fiscal-operator-mfa";
import {fiscalRecoveryAlertOverview} from "../../../../../lib/fiscal-security-alert-operations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"cache-control":"private, no-store","referrer-policy":"no-referrer","x-content-type-options":"nosniff"};
export async function GET(){
 const actor=await fiscalAdminActor();
 if(!actor)return Response.json({error:"FISCAL_ADMIN_AUTH_REQUIRED"},{status:401,headers});
 if(actor.kind!=="marketplace_super_admin")
  return Response.json({error:"SECURITY_SUPERADMIN_REQUIRED"},{status:403,headers});
 if(!(await isFiscalMfaSatisfied(actor)))
  return Response.json({error:"FISCAL_MFA_REQUIRED"},{status:403,headers});
 try{return Response.json(await fiscalRecoveryAlertOverview(),{headers});}
 catch{return Response.json({error:"RECOVERY_ALERT_MONITOR_UNAVAILABLE"},{status:503,headers});}
}
