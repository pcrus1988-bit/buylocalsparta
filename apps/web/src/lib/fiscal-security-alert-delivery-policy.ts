/** Retry decisions never depend on untrusted provider text. */
export type FiscalAlertDeliveryResult=
 |{kind:"accepted";providerId:string}
 |{kind:"retry";code:string}
 |{kind:"dead";code:string};

export const fiscalAlertMaxAttempts=8;
export const fiscalAlertRetryHorizonMs=23*60*60*1000;
export function fiscalAlertBackoffSeconds(attempt:number):number{
 if(!Number.isSafeInteger(attempt)||attempt<1)return 60;
 return Math.min(7200,60*2**Math.min(7,attempt-1));
}
export function fiscalAlertClassifyProvider(status:number,body:unknown):FiscalAlertDeliveryResult{
 if(status>=200&&status<300){
  const id=(body&&typeof body==="object"&&!Array.isArray(body))
   ?(body as Record<string,unknown>).id:undefined;
  if(typeof id==="string"&&/^[a-zA-Z0-9_-]{4,160}$/.test(id))
   return {kind:"accepted",providerId:id};
  return {kind:"retry",code:"PROVIDER_RESPONSE_INVALID"};
 }
 if(status===429||status===408||status>=500)
  return {kind:"retry",code:"PROVIDER_TRANSIENT"};
 if(status===409){
  const error=(body&&typeof body==="object"&&!Array.isArray(body))
    ?(body as Record<string,unknown>).name:undefined;
  if(error==="concurrent_idempotent_requests")
   return {kind:"retry",code:"PROVIDER_CONCURRENT"};
  return {kind:"dead",code:"PROVIDER_CONFLICT"};
 }
 return {kind:"dead",code:"PROVIDER_REJECTED"};
}
export function fiscalAlertFinalDecision(result:FiscalAlertDeliveryResult,attempts:number,ageMs:number){
 if(result.kind!=="retry")return result;
 if(attempts>=fiscalAlertMaxAttempts||ageMs>=fiscalAlertRetryHorizonMs)
  return {kind:"dead" as const,code:"RETRY_LIMIT_REACHED"};
 return result;
}
