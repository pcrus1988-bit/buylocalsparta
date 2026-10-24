/**
 * Read-only GitHub PR candidates for TIGER LIVE engine cards.
 * A PR is not a worker, a tested capability, or an accepted engine.
 * This must not mutate AUTOPILOT state or infer execution from a draft.
 */
export type TigerEngineCandidate={
  number:number;
  url:string;
  draft:boolean;
  updatedAt:string;
  headSha:string;
};
const REPO="pcrus1988-bit/Tiger-2-0";
const ENGINES=/\bE(0[1-9]|1[0-9]|20)\b/gi;
const HEAD=/^[0-9a-f]{40}$/;
export function openEngineCandidates(source:unknown):ReadonlyMap<string,TigerEngineCandidate>{
  if(!Array.isArray(source))throw new Error("TIGER_OPEN_PULLS_NOT_ARRAY");
  const output=new Map<string,TigerEngineCandidate>();
  for(const entry of source){
    if(!entry||typeof entry!=="object"||Array.isArray(entry))continue;
    const pr=entry as {
      number?:unknown;state?:unknown;draft?:unknown;title?:unknown;
      html_url?:unknown;updated_at?:unknown;
      head?:{ref?:unknown;sha?:unknown;repo?:{full_name?:unknown}};
    };
    if(pr.state!=="open"||!Number.isSafeInteger(pr.number)||Number(pr.number)<1||
      typeof pr.title!=="string"||typeof pr.head?.ref!=="string"||
      pr.head?.repo?.full_name!==REPO||typeof pr.head.sha!=="string"||
      !HEAD.test(pr.head.sha)||typeof pr.updated_at!=="string"||
      !Number.isFinite(Date.parse(pr.updated_at)))continue;
    const url="https://github.com/"+REPO+"/pull/"+pr.number;
    // Never trust an arbitrary GitHub metadata field as a navigation target.
    if(pr.html_url!==url)continue;
    const scope=pr.title+" "+pr.head.ref;
    const engines=new Set([...scope.matchAll(ENGINES)].map(match=>"E"+match[1]));
    for(const id of engines){
      const candidate:TigerEngineCandidate={
        number:Number(pr.number),url,draft:pr.draft===true,
        updatedAt:pr.updated_at,headSha:pr.head.sha
      };
      const previous=output.get(id);
      if(!previous||Date.parse(previous.updatedAt)<Date.parse(candidate.updatedAt)||
         (previous.updatedAt===candidate.updatedAt&&previous.number<candidate.number))
        output.set(id,candidate);
    }
  }
  return output;
}
