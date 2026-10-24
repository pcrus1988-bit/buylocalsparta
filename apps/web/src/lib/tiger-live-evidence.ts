/**
 * GitHub is the evidence source; this module only groups already verified
 * workflow records for presentation. It does not create task or worker state.
 */
export type TigerGithubRunEvidence={
  id?:number;name?:string;status?:string;conclusion?:string;
  created_at?:string;updated_at?:string;html_url?:string;
};
const timestamp=(value?:string)=>{
  const ms=Date.parse(value||"");
  return Number.isFinite(ms)?ms:0;
};
export function latestWorkflowOutcomes<T extends TigerGithubRunEvidence>(runs:readonly T[]):T[]{
  const seen=new Set<string>();
  return [...runs].sort((a,b)=>timestamp(b.created_at)-timestamp(a.created_at)).filter(r=>{
    if(!r.name||seen.has(r.name))return false;
    seen.add(r.name);
    return true;
  });
}
export function verifiedContractRun<T extends TigerGithubRunEvidence>(runs:readonly T[]):T|undefined{
  // A verified milestone is one kind of accomplishment, not a new trophy
  // for every successful rerun of the same validation workflow.
  return [...runs].sort((a,b)=>timestamp(b.created_at)-timestamp(a.created_at))
    .find(r=>r.name==="TIGER isolated contract and legacy reuse verification" &&
      r.status==="completed" && r.conclusion==="success" &&
      Number.isSafeInteger(r.id) && typeof r.html_url==="string");
}
