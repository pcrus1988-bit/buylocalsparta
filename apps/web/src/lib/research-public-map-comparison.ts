import type { SafePublicResultPoint, SafeParticipationGeography } from "./research-public-results-data.ts";

/**
 * Return the independent, approved all-Greece estimate for one selected answer.
 * Never derive a national respondent percentage by summing/averaging regional
 * percentages: survey weights, nonresponse and the subset of releasable cells differ.
 */
export function nationalAnswerEstimate(
  points: readonly SafePublicResultPoint[], metricKey:string
):SafePublicResultPoint|undefined {
 return points.find(p=>p.metricKey===metricKey && Object.keys(p.segment).length===0);
}
export function nationalParticipationTotal(
 geography?:SafeParticipationGeography
):number|undefined {
 const value=geography?.nationalStarted;
 return value!==undefined&&Number.isSafeInteger(value)&&value>0?value:undefined;
}
export function regionalParticipationShare(
 started:number|undefined,
 nationalTotal:number|undefined
):number|undefined {
 if(started===undefined||!Number.isSafeInteger(started)||started<0||
  nationalTotal===undefined||!Number.isSafeInteger(nationalTotal)||nationalTotal<=0||
  started>nationalTotal)return undefined;
 return started/nationalTotal;
}
export function mapNationalDifference(regionValue:number|undefined,nationalValue:number|undefined,proportion:boolean):number|undefined {
 if(regionValue===undefined||nationalValue===undefined||
  !Number.isFinite(regionValue)||!Number.isFinite(nationalValue))return undefined;
 return (regionValue-nationalValue)*(proportion?100:1);
}
export function nationalCoverageNote(coveredRegionCount:number,visibleStarts:number|undefined,nationalStarted:number|undefined){
 if(nationalStarted===undefined)return "Μη διαθέσιμο επαληθευμένο πανελλαδικό σύνολο ενάρξεων.";
 const coverage=visibleStarts!==undefined&&visibleStarts<=nationalStarted
  ?` Οι δημοσιεύσιμες Περιφέρειες καλύπτουν ${Math.round(visibleStarts/nationalStarted*1000)/10}% των εθνικών ενάρξεων.`:"";
 return `Εμφανίζονται ${coveredRegionCount} από 13 Περιφέρειες με επιτρεπτή δημοσίευση.${coverage} Οι μικρές ή μη χαρτογραφημένες ομάδες δεν ανασυντίθενται.`;
}
