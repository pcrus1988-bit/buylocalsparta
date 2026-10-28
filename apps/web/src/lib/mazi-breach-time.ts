/** Personal-data breach deadline calculations use instants, never local calendar days. */
export function parseBreachInstant(raw:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$/.test(raw))return null;
 const parsed=new Date(raw);
 return Number.isFinite(parsed.getTime())?parsed:null;
}
export function breachDeadline(aware:Date):Date{
 return new Date(aware.getTime()+72*60*60*1000);
}
export function needsBreachLateReason(aware:Date,notified:Date):boolean{
 return notified.getTime()>breachDeadline(aware).getTime();
}
