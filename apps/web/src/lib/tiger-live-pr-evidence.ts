/**
 * Evidence-only PR projection for TIGER LIVE.
 * A verified merge is a code event, NEVER a verified engine release or live AI worker.
 * This module deliberately has no GitHub/network calls and is safe to unit-test offline.
 */
export type TigerPullEvent = {
  id:string; schemaVersion:1; cursor:0; occurredAt:string; receivedAt:string;
  eventType:"pr.created"|"pr.merged"; severity:"info"|"success";
  summary:string; evidenceUrl:string; engineId?:string;
};
export type TigerPullAchievement = {id:string;title:string;evidenceUrl:string};
type Pull = {number?:number;created_at?:string;merged_at?:string|null;html_url?:string;head?:{ref?:string}};
const iso=(value:unknown):string|null=>typeof value==="string"&&Number.isFinite(Date.parse(value))
  ?new Date(value).toISOString():null;
const engine=(value:string|undefined):string|undefined=>{
  const match=value?.match(/(?:^|[-/])(e(?:0[1-9]|1[0-9]|20))(?:[-/]|$)/i)?.[1]?.toUpperCase();
  return match&&/^E(0[1-9]|1[0-9]|20)$/.test(match)?match:undefined;
};
export function projectVerifiedPulls(
  source:unknown,receivedAt:string,verifyEvidence:(value:unknown)=>string|undefined
):{events:TigerPullEvent[];achievements:TigerPullAchievement[]} {
  const events:TigerPullEvent[]=[],achievements:TigerPullAchievement[]=[];
  if(!Array.isArray(source)||!iso(receivedAt))return {events,achievements};
  for(const item of source.slice(0,60) as Pull[]){
    if(!item||!Number.isSafeInteger(item.number)||!(item.number!>0))continue;
    const url=verifyEvidence(item.html_url);
    const mergedAt=iso(item.merged_at),createdAt=iso(item.created_at);
    const when=mergedAt||createdAt;
    if(!url||!when)continue;
    const merged=Boolean(mergedAt),number=item.number!;
    const detectedEngine=engine(item.head?.ref);
    events.push({
      id:"gh:pr:"+number+":"+(merged?"merged":"created"),
      schemaVersion:1,cursor:0,occurredAt:when,receivedAt,
      eventType:merged?"pr.merged":"pr.created",
      severity:merged?"success":"info",
      summary:"Pull request #"+number+(merged?" merged into TIGER (code only)":" created"),
      evidenceUrl:url,
      ...(detectedEngine?{engineId:detectedEngine}:{})
    });
    if(merged)achievements.push({
      id:"merged-pr:"+number,
      title:"PR #"+number+" merged · code evidence only",
      evidenceUrl:url
    });
  }
  return {events,achievements:achievements.slice(0,5)};
}
