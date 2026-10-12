/** Resend GET /emails/:id status snapshot, scoped to already-owned FISCAL message IDs.
 * Only a matching recipient + matching provider ID can become delivery evidence.
 * No webhook payload, recipient address, subject or message content is stored.
 */
export type FiscalReconcileStatus =
 |{kind:"observed";lastEvent:"sent"|"delivered"|"delivery_delayed"|"bounced"|"complained"|"failed"|"suppressed"|"unknown";receiptType:string|null}
 |{kind:"retry";code:"STATUS_UNAVAILABLE"|"STATUS_NOT_READY"|"PROVIDER_STATUS_INVALID"}
 |{kind:"security_error";code:"PROVIDER_RECIPIENT_MISMATCH"};
const providerIds=/^[A-Za-z0-9_-]{4,160}$/;
const knownEvents:Record<string,string|null>={
 sent:null,queued:null,delivered:"email.delivered",
 delivery_delayed:"email.delivery_delayed",bounced:"email.bounced",
 complained:"email.complained",failed:"email.failed",suppressed:"email.suppressed"
};
export function parseFiscalResendStatus(raw:unknown,requestedId:string,recipient:string):FiscalReconcileStatus{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))
  return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
 const data=raw as Record<string,unknown>;
 if(data.id!==requestedId||!Array.isArray(data.to)||
   data.to.length!==1||typeof data.to[0]!=="string")
  return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
 if(data.to[0].trim().toLowerCase()!==recipient.trim().toLowerCase())
  return {kind:"security_error",code:"PROVIDER_RECIPIENT_MISMATCH"};
 if(typeof data.last_event!=="string")
  return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
 const lastEvent=data.last_event;
 if(Object.prototype.hasOwnProperty.call(knownEvents,lastEvent))
  return {kind:"observed",lastEvent:lastEvent==="queued"?"sent":lastEvent as
   "sent"|"delivered"|"delivery_delayed"|"bounced"|"complained"|"failed"|"suppressed",
   receiptType:knownEvents[lastEvent]};
 // Open/click events are not sufficient to infer server acceptance.
 return {kind:"observed",lastEvent:"unknown",receiptType:null};
}
export async function retrieveFiscalResendStatus(input:{
 messageId:string;recipient:string;apiKey:string;fetchImpl?:typeof fetch
}):Promise<FiscalReconcileStatus>{
 if(!providerIds.test(input.messageId)||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.recipient)||
   !input.apiKey) return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
 try{
  const response=await (input.fetchImpl??fetch)(
   "https://api.resend.com/emails/"+encodeURIComponent(input.messageId),{
    headers:{authorization:"Bearer "+input.apiKey,"accept":"application/json"},
    cache:"no-store",signal:AbortSignal.timeout(6500)
   });
  if(response.status===404||response.status===429||response.status>=500)
   return {kind:"retry",code:"STATUS_NOT_READY"};
  if(!response.ok)return {kind:"retry",code:"STATUS_UNAVAILABLE"};
  if(Number(response.headers.get("content-length")??0)>24000)
   return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
  const raw=await response.text();
  if(Buffer.byteLength(raw,"utf8")>24000)
   return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};
  try{return parseFiscalResendStatus(JSON.parse(raw),input.messageId,input.recipient);}
  catch{return {kind:"retry",code:"PROVIDER_STATUS_INVALID"};}
 }catch{return {kind:"retry",code:"STATUS_UNAVAILABLE"};}
}
export function fiscalReconcileIntervalSeconds(lastEvent:string,attempts:number){
 if(lastEvent==="delivered")return 2*60*60;
 if(lastEvent==="delivery_delayed")return 30*60;
 return Math.min(90*60,5*60*2**Math.min(5,Math.max(0,attempts-1)));
}
