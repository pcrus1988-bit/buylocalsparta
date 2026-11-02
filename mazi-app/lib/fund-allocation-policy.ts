/**
 * MAZI funding-cycle allocation policy, v1 DRAFT.
 * Deterministic, nonfinancial PREVIEW ONLY. The founding needs-assessment
 * cycle must never invoke this to create obligations or transfers.
 *
 * Inputs are a frozen, independently audited voting tally and preannounced
 * cycle budget/caps. Outputs are advisory, not automatic grant decisions.
 */
export const MAZI_FUND_ALLOCATION_VERSION="mazi-fund-allocation-v1-draft" as const;
export type FundCandidate={
 id:string;requestedCents:number;minimumUsefulCents:number;
 supportVotes:number;firstTimeRequester:boolean;submittedAt:string;
 approved:boolean;recused:boolean
};
export type FundAllocationRules={
 budgetCents:number;projectCapCents:number;maxAwards:number;
 minimumSupportingVotes:number;quorumPercent:number;eligibleBusinesses:number;
 validBallots:number;finalized:boolean
};
export type FundAllocationResult={
 policyVersion:typeof MAZI_FUND_ALLOCATION_VERSION;
 quorumReached:boolean;unallocatedCents:number;budgetCents:number;
 awards:{proposalId:string;requestedCents:number;proposedCents:number;
  supportingVotes:number;firstTimeRequester:boolean;retentionMonthsFromRequested:number}[];
 excluded:{proposalId:string;reason:string}[];
};
const cents=(x:number)=>Number.isSafeInteger(x)&&x>=0;
export function previewFundAllocation(
 rules:FundAllocationRules,candidates:readonly FundCandidate[]
):FundAllocationResult{
 if(!cents(rules.budgetCents)||!cents(rules.projectCapCents)||rules.projectCapCents===0
  ||!Number.isSafeInteger(rules.maxAwards)||rules.maxAwards<1||rules.maxAwards>1000
  ||!Number.isSafeInteger(rules.minimumSupportingVotes)||rules.minimumSupportingVotes<1
  ||!Number.isSafeInteger(rules.quorumPercent)||rules.quorumPercent<0||rules.quorumPercent>100
  ||!cents(rules.eligibleBusinesses)||!cents(rules.validBallots)
  ||rules.validBallots>rules.eligibleBusinesses||typeof rules.finalized!=="boolean"
  ||candidates.length>1000)throw new RangeError("Invalid or unfrozen funding inputs");
 const seen=new Set<string>();
 for(const p of candidates){
  if(!/^[a-f\d-]{36}$/i.test(p.id)||seen.has(p.id)
   ||!cents(p.requestedCents)||p.requestedCents===0
   ||!cents(p.minimumUsefulCents)||p.minimumUsefulCents<1
   ||p.minimumUsefulCents>p.requestedCents
   ||!cents(p.supportVotes)||p.supportVotes>rules.validBallots
   ||typeof p.submittedAt!=="string"||Number.isNaN(Date.parse(p.submittedAt))
   ||typeof p.approved!=="boolean"||typeof p.recused!=="boolean"
   ||typeof p.firstTimeRequester!=="boolean")throw new RangeError("Invalid candidate");
  seen.add(p.id);
 }
 const quorumReached=rules.finalized&&rules.eligibleBusinesses>0
  &&BigInt(rules.validBallots)*100n>=BigInt(rules.eligibleBusinesses)*BigInt(rules.quorumPercent);
 const excluded:FundAllocationResult["excluded"]=[];
 if(!quorumReached)return {
  policyVersion:MAZI_FUND_ALLOCATION_VERSION,quorumReached:false,
  unallocatedCents:rules.budgetCents,budgetCents:rules.budgetCents,awards:[],
  excluded:candidates.map(p=>({proposalId:p.id,reason:"cycle_not_final_or_quorum_unmet"}))
 };
 const valid=candidates.filter(p=>{
  const reason=!p.approved?"proposal_not_approved":
   p.recused?"conflict_of_interest":
   p.supportVotes<rules.minimumSupportingVotes?"insufficient_support":
   p.minimumUsefulCents>Math.min(p.requestedCents,rules.projectCapCents)?"minimum_exceeds_cap":null;
  if(reason)excluded.push({proposalId:p.id,reason});
  return reason===null;
 }).sort((a,b)=>Number(b.firstTimeRequester)-Number(a.firstTimeRequester)
   ||b.supportVotes-a.supportVotes
   ||Date.parse(a.submittedAt)-Date.parse(b.submittedAt)
   ||a.id.localeCompare(b.id));
 let left=rules.budgetCents;
 const selected:{p:FundCandidate;amount:number;maximum:number}[]=[];
 // Phase 1: give the minimum useful award to as many eligible projects as possible.
 for(const p of valid){
  if(selected.length>=rules.maxAwards){
   excluded.push({proposalId:p.id,reason:"award_count_cap"});continue;
  }
  if(left<p.minimumUsefulCents){
   excluded.push({proposalId:p.id,reason:"insufficient_minimum_budget"});continue;
  }
  selected.push({p,amount:p.minimumUsefulCents,
    maximum:Math.min(p.requestedCents,rules.projectCapCents)});
  left-=p.minimumUsefulCents;
 }
 // Phase 2: distribute any residual budget proportional to verified support,
 // capped at the requested and preannounced project limit. BigInt avoids
 // floating-point money errors; deterministic ordered cent remainder.
 while(left>0){
  const active=selected.filter(s=>s.amount<s.maximum);
  if(!active.length)break;
  const weights=active.reduce((v,s)=>v+BigInt(s.p.supportVotes),0n);
  if(weights===0n)break;
  const available=BigInt(left);
  let consumed=0;
  const portions=active.map(s=>({
   s,
   share:Number(available*BigInt(s.p.supportVotes)/weights),
   remainder:available*BigInt(s.p.supportVotes)%weights
  }));
  for(const part of portions){
   const increment=Math.min(part.share,part.s.maximum-part.s.amount);
   part.s.amount+=increment;consumed+=increment;
  }
  left-=consumed;
  // If every proportional share rounds to zero, give one cent to the
  // largest fractional remainder with deterministic ties.
  if(consumed===0&&left>0){
   portions.sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:
     a.s.p.id.localeCompare(b.s.p.id));
   const first=portions.find(x=>x.s.amount<x.s.maximum);
   if(!first)break;
   first.s.amount++;left--;
  }
 }
 return {
  policyVersion:MAZI_FUND_ALLOCATION_VERSION,quorumReached:true,
  budgetCents:rules.budgetCents,unallocatedCents:left,
  awards:selected.map(x=>({
   proposalId:x.p.id,requestedCents:x.p.requestedCents,proposedCents:x.amount,
   supportingVotes:x.p.supportVotes,firstTimeRequester:x.p.firstTimeRequester,
   // €250 membership × 40% => €100/month; always requested not awarded.
   retentionMonthsFromRequested:Math.ceil(x.p.requestedCents/10000)
  })),
  excluded
 };
}
