"use server";
import {redirect} from "next/navigation";
import {createHash} from "node:crypto";
import {revalidatePath} from "next/cache";
import {getAdminSession} from "../../../../lib/admin-session";
import {assertAdminCsrf} from "../../../../lib/admin-runtime";
import {marketplaceMaziActor} from "../../../../lib/mazi-superadmin";
import {getAdminPostgresRuntime} from "../../../../lib/postgres-runtime";

const str=(f:FormData,k:string)=>typeof f.get(k)==="string"?String(f.get(k)).trim():"";
const uuid=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const integer=(s:string,min:number,max:number)=>{
 if(!/^\d+$/.test(s))throw new Error("MAZI_FUND_RULES_INVALID");
 const n=Number(s);
 if(!Number.isSafeInteger(n)||n<min||n>max)throw new Error("MAZI_FUND_RULES_INVALID");
 return n;
};

export async function maziFundGovernanceAction(form:FormData){
 const principal=await getAdminSession();
 if(!principal)redirect("/admin/login");
 const actor=await marketplaceMaziActor(principal);
 assertAdminCsrf(principal,str(form,"csrf"));
 const kind=str(form,"kind"),cycleId=str(form,"cycle_id"),
  recordId=str(form,"record_id"),reason=str(form,"reason");
 if(!uuid(cycleId)||!["publish_rules","review_approve","review_reject","open_voting","invalidate","finalize"].includes(kind))
  throw new Error("MAZI_FUND_COMMAND_INVALID");
 if(["review_approve","review_reject","invalidate"].includes(kind) &&
    (!uuid(recordId)||reason.length<20||reason.length>1000))
  throw new Error("MAZI_FUND_REASON_REQUIRED");
 const cx=await getAdminPostgresRuntime().nativePool.connect();
 try{
  await cx.query("begin");
  // Ballot insertion locks this same cycle FOR SHARE, so closing waits for votes.
  const {rows:[cycle]}=await cx.query<{id:string;kind:string;status:string;
   finance_activated:boolean;funding_budget_cents:string;starts_at:Date;ends_at:Date}>(
   "select id::text,kind,status,finance_activated,funding_budget_cents::text,starts_at,ends_at "+
   "from public.mazi_cycles where id=$1::uuid for update",[cycleId]);
  if(!cycle||cycle.kind!=="fund_allocation"||!cycle.finance_activated||BigInt(cycle.funding_budget_cents)<=0n)
   throw new Error("MAZI_FUND_NOT_ACTIVATED");
  const audit=async(type:string,id:string,action:string,evidence:Record<string,unknown>)=>{
   await cx.query("insert into public.mazi_audit_events "+
    "(entity_type,entity_id,action,marketplace_actor_user_id,evidence) "+
    "values($1,$2::uuid,$3,$4::uuid,$5::jsonb)",
    [type,id,action,actor,JSON.stringify(evidence)]);
  };
  if(kind==="publish_rules"){
   if(cycle.status!=="review")throw new Error("MAZI_FUND_WRONG_STAGE");
   const policyText=str(form,"policy_text");
   if(policyText.length<400||policyText.length>20000)throw new Error("MAZI_FUND_PUBLIC_RULEBOOK_REQUIRED");
   const digest=createHash("sha256").update(policyText,"utf8").digest("hex");
   const quorum=integer(str(form,"quorum_percent"),1,100),
    min=integer(str(form,"minimum_support_votes"),1,10000000),
    awards=integer(str(form,"max_awards"),1,1000),
    cap=integer(str(form,"project_cap_cents"),1,20000000);
   if(BigInt(cap)>BigInt(cycle.funding_budget_cents))throw new Error("MAZI_FUND_CAP_EXCEEDS_BUDGET");
   const result=await cx.query<{published_policy_sha256:string}>("insert into public.mazi_fund_cycle_rules "+
    "(cycle_id,quorum_percent,minimum_support_votes,max_awards,project_cap_cents,published_policy_sha256,published_by,public_policy_text) "+
    "values($1::uuid,$2,$3,$4,$5,$6,$7::uuid,$8) on conflict do nothing returning published_policy_sha256",
    [cycleId,quorum,min,awards,cap,digest,actor,policyText]);
   if(result.rowCount!==1)throw new Error("MAZI_FUND_RULES_ALREADY_FROZEN");
   if(result.rows[0]?.published_policy_sha256!==digest)throw new Error("MAZI_FUND_RULES_HASH_MISMATCH");
   await audit("fund_cycle",cycleId,"rules_published",
     {quorum_percent:quorum,minimum_support_votes:min,max_awards:awards,
      project_cap_cents:cap,policy_sha256:digest});
  }else if(kind==="review_approve"||kind==="review_reject"){
   if(cycle.status!=="review")throw new Error("MAZI_FUND_WRONG_STAGE");
   const status=kind==="review_approve"?"approved":"rejected";
   const result=await cx.query("update public.mazi_proposals "+
     "set status=$3,review_reason=$4,reviewed_at=now(),reviewed_by=$5::uuid "+
     "where id=$1::uuid and cycle_id=$2::uuid and status='submitted'",
     [recordId,cycleId,status,reason,actor]);
   if(result.rowCount!==1)throw new Error("MAZI_FUND_PROPOSAL_NOT_PENDING");
   await audit("fund_proposal",recordId,status,{cycle_id:cycleId,reason});
  }else if(kind==="open_voting"){
   if(cycle.status!=="review")throw new Error("MAZI_FUND_WRONG_STAGE");
   const rules=await cx.query("select cycle_id from public.mazi_fund_cycle_rules where cycle_id=$1::uuid",[cycleId]);
   if(rules.rowCount!==1)throw new Error("MAZI_FUND_PUBLISH_RULES_FIRST");
   const counts=await cx.query<{approved:string;pending:string;ballots:string}>(
    "select (select count(*)::text from public.mazi_proposals where cycle_id=$1::uuid and status='approved') approved, "+
    "(select count(*)::text from public.mazi_proposals where cycle_id=$1::uuid and status='submitted') pending, "+
    "(select count(*)::text from public.mazi_fund_ballots where cycle_id=$1::uuid) ballots",[cycleId]);
   const n=counts.rows[0];
   if(Number(n?.approved||0)<1||Number(n?.pending||0)!==0||Number(n?.ballots||0)!==0)
     throw new Error("MAZI_FUND_REVIEW_NOT_COMPLETE");
   if(Date.now()<new Date(cycle.starts_at).getTime()||Date.now()>=new Date(cycle.ends_at).getTime())
     throw new Error("MAZI_FUND_VOTING_WINDOW_CLOSED");
   const electorate=await cx.query("insert into public.mazi_fund_electorate "+
    "(cycle_id,voter_user_id,voter_gemi_number) "+
    "select $1::uuid,m.user_id,m.gemi_number from public.mazi_members m "+
    "join public.mazi_membership_applications a on a.id=m.application_id "+
    "where m.status='verified' and m.identity_verified_at is not null "+
    "and m.voting_eligible=true and m.gemi_number is not null and a.status='approved' "+
    "on conflict do nothing",[cycleId]);
   if(!electorate.rowCount)throw new Error("MAZI_FUND_EMPTY_ELECTORATE");
   await cx.query("update public.mazi_cycles set status='voting' where id=$1::uuid",[cycleId]);
   await audit("fund_cycle",cycleId,"electorate_frozen_and_voting_opened",
    {eligible_businesses:electorate.rowCount});
  }else if(kind==="invalidate"){
   if(cycle.status!=="voting")throw new Error("MAZI_FUND_WRONG_STAGE");
   const result=await cx.query("insert into public.mazi_fund_ballot_invalidations "+
    "(ballot_id,cycle_id,reason,invalidated_by) "+
    "select b.id,b.cycle_id,$3,$4::uuid from public.mazi_fund_ballots b "+
    "where b.id=$1::uuid and b.cycle_id=$2::uuid on conflict do nothing",
    [recordId,cycleId,reason,actor]);
   if(result.rowCount!==1)throw new Error("MAZI_FUND_BALLOT_NOT_INVALIDATABLE");
   await audit("fund_ballot",recordId,"ballot_invalidated",{cycle_id:cycleId,reason});
  }else if(kind==="finalize"){
   if(cycle.status!=="voting"||Date.now()<new Date(cycle.ends_at).getTime())
    throw new Error("MAZI_FUND_VOTING_NOT_EXPIRED");
   const rule=await cx.query<{published_policy_sha256:string}>(
    "select published_policy_sha256 from public.mazi_fund_cycle_rules where cycle_id=$1::uuid",[cycleId]);
   if(!rule.rows[0])throw new Error("MAZI_FUND_RULES_NOT_FROZEN");
   const data=await cx.query<{total:string;invalid:string;eligible:string;proposals:string}>(
    "select (select count(*)::text from public.mazi_fund_ballots where cycle_id=$1::uuid) total, "+
    "(select count(*)::text from public.mazi_fund_ballot_invalidations where cycle_id=$1::uuid) invalid, "+
    "(select count(*)::text from public.mazi_fund_electorate where cycle_id=$1::uuid) eligible, "+
    "(select count(*)::text from public.mazi_proposals where cycle_id=$1::uuid and status='approved') proposals",[cycleId]);
   const totals=data.rows[0],t=BigInt(totals.total),i=BigInt(totals.invalid),e=BigInt(totals.eligible);
   if(e===0n||i>t||t>e||Number(totals.proposals)<1)
    throw new Error("MAZI_FUND_VOTING_INTEGRITY_FAILED");
   await cx.query("insert into public.mazi_fund_vote_results "+
    "(cycle_id,proposal_id,supporting_ballots,finalized_by) "+
    "select p.cycle_id,p.id,count(b.id) filter(where inv.ballot_id is null)::bigint,$2::uuid "+
    "from public.mazi_proposals p "+
    "left join public.mazi_fund_ballots b on b.cycle_id=p.cycle_id and p.id=any(b.proposal_ids) "+
    "left join public.mazi_fund_ballot_invalidations inv on inv.ballot_id=b.id "+
    "where p.cycle_id=$1::uuid and p.status='approved' "+
    "group by p.cycle_id,p.id",[cycleId,actor]);
   await cx.query("insert into public.mazi_fund_round_finalizations "+
    "(cycle_id,total_ballots,invalidated_ballots,valid_ballots,electorate_count,proposals_considered,rules_sha256,finalized_by) "+
    "values($1::uuid,$2,$3,$4,$5,$6,$7,$8::uuid)",
    [cycleId,t.toString(),i.toString(),(t-i).toString(),e.toString(),
     Number(totals.proposals),rule.rows[0].published_policy_sha256,actor]);
   await cx.query("update public.mazi_cycles set status='closed' where id=$1::uuid",[cycleId]);
   await audit("fund_cycle",cycleId,"final_tally_sealed",{
    eligible_businesses:e.toString(),total_ballots:t.toString(),
    invalidated_ballots:i.toString(),valid_ballots:(t-i).toString(),
    proposals_considered:Number(totals.proposals)});
  }
  await cx.query("commit");
 }catch(error){await cx.query("rollback");throw error;}
 finally{cx.release();}
 revalidatePath("/admin/mazi/fund/governance");
 redirect("/admin/mazi/fund/governance?notice=updated");
}
