import type { SessionPrincipal } from "@buy-local-sparta/core";
import { getAdminPostgresRuntime, productionDatabaseConfigured } from "./postgres-runtime";
import { resolveAdminDatabaseUserId } from "./admin-database-identity";

/**
 * MAZI has one administrative authority: the existing KONTA MOY Super Admin.
 * No Supabase Auth user, MAZI member, or platform operator has admin powers.
 */
export function isMaziSuperAdmin(principal: Pick<SessionPrincipal,"roles"|"vendorId"> | null | undefined): boolean {
  return Boolean(principal && !principal.vendorId && principal.roles.includes("super_admin"));
}
export function requireMarketplaceSuperAdminRole(principal: SessionPrincipal | undefined): asserts principal is SessionPrincipal {
  if (!isMaziSuperAdmin(principal)) throw new Error("MAZI_SUPERADMIN_REQUIRED");
}

export async function marketplaceMaziActor(principal: SessionPrincipal): Promise<string> {
  requireMarketplaceSuperAdminRole(principal);
  if (!productionDatabaseConfigured()) throw new Error("MAZI_DATABASE_UNAVAILABLE");
  const pool = getAdminPostgresRuntime().sqlPool;
  const id = await resolveAdminDatabaseUserId(pool, principal.userId);
  // Check the persisted role on each action, not just a potentially stale claim.
  const roles = await pool.query<{ authorized: boolean }>(`
    select exists (
      select 1 from public.platform_user_roles r
      join public.users u on u.id = r.user_id
      where r.user_id = $1::uuid and r.role='super_admin' and u.status::text='active'
    ) as authorized
  `, [id]);
  if (roles.rows[0]?.authorized !== true) throw new Error("MAZI_SUPERADMIN_REVOKED");
  return id;
}
const db = () => getAdminPostgresRuntime().nativePool;

export type MaziAdminApplication = {
 id:string;business_name:string;representative_name:string;location:string;sector:string;
 registry_number:string|null;description:string;created_at:Date
};
export type MaziAdminProposal = {
 id:string;title:string;category:string;details:string;amount_cents:string;created_at:Date;
};
export type MaziAdminMember = {
 user_id:string;status:string;voting_eligible:boolean;admitted_at:Date;
 gemi_number:string|null;identity_verified_at:Date|null;
 business_name:string;representative_name:string;requested_gemi:string|null;
};
export type MaziBallot = {
 id:string;voter_id:string;proposal_id:string;created_at:Date; invalidation_reason:string|null;
};
export type MaziApprovedProposal = {id:string;title:string;created_by:string};
export type MaziCycleResult = {
 total_ballots:string;invalidated_ballots:string;valid_ballots:string;
 proposals_considered:number;funding_awarded_cents:string;finalized_at:Date;
};
export type MaziProposalResult = {proposal_id:string;title:string;supporting_ballots:string};
export type MaziAdminCycle = {id:string;title:string;status:string;finance_activated:boolean;funding_budget_cents:string};
export type MaziAdminSnapshot = {
 applications:MaziAdminApplication[]; proposals:MaziAdminProposal[];
 members:MaziAdminMember[]; cycle:MaziAdminCycle|null;
 approvedProposals:MaziApprovedProposal[];ballots:MaziBallot[];
 result:MaziCycleResult|null; proposalResults:MaziProposalResult[];
};
export async function maziAdminSnapshot(principal: SessionPrincipal): Promise<MaziAdminSnapshot> {
 await marketplaceMaziActor(principal);
 const [a,p,m,c,approved,ballots,result,counts] = await Promise.all([
   db().query<MaziAdminApplication>(`
    select id::text,business_name,representative_name,location,sector,registry_number,description,created_at
    from public.mazi_membership_applications where status='pending'
    order by created_at asc limit 75
   `),
   db().query<MaziAdminProposal>(`
    select id::text,title,category,details,amount_cents::text,created_at
    from public.mazi_proposals where status='submitted'
    order by created_at asc limit 75
   `),
   db().query<MaziAdminMember>(`
    select m.user_id::text,m.status,m.voting_eligible,m.admitted_at,
      m.gemi_number,m.identity_verified_at,a.business_name,a.representative_name,
      a.registry_number as requested_gemi
    from public.mazi_members m
    join public.mazi_membership_applications a on a.id=m.application_id
    order by m.admitted_at desc limit 75
   `),
   db().query<MaziAdminCycle>(`
    select id::text,title,status,finance_activated,funding_budget_cents::text
    from public.mazi_cycles where slug='founding-needs-2026' limit 1
   `),
   db().query<MaziApprovedProposal>(`
    select p.id::text,p.title,p.created_by::text
    from public.mazi_proposals p join public.mazi_cycles c on c.id=p.cycle_id
    where c.slug='founding-needs-2026' and p.status='approved'
    order by p.created_at asc limit 75
   `),
   db().query<MaziBallot>(`
    select v.id::text,v.voter_id::text,v.proposal_id::text,v.created_at,
      i.reason as invalidation_reason
    from public.mazi_votes v join public.mazi_cycles c on c.id=v.cycle_id
    left join public.mazi_vote_invalidations i on i.vote_id=v.id
    where c.slug='founding-needs-2026'
    order by v.created_at desc limit 75
   `),
   db().query<MaziCycleResult>(`
    select r.total_ballots::text,r.invalidated_ballots::text,r.valid_ballots::text,
      r.proposals_considered,r.funding_awarded_cents::text,r.finalized_at
    from public.mazi_cycle_results r join public.mazi_cycles c on c.id=r.cycle_id
    where c.slug='founding-needs-2026' limit 1
   `),
   db().query<MaziProposalResult>(`
    select p.id::text as proposal_id,p.title,r.supporting_ballots::text
    from public.mazi_proposal_results r join public.mazi_proposals p on p.id=r.proposal_id
    join public.mazi_cycles c on c.id=r.cycle_id where c.slug='founding-needs-2026'
    order by r.supporting_ballots desc,p.created_at asc limit 75
   `)
 ]);
 return {applications:a.rows,proposals:p.rows,members:m.rows,cycle:c.rows[0]||null,
  approvedProposals:approved.rows,ballots:ballots.rows,result:result.rows[0]||null,
  proposalResults:counts.rows};
}
export type MaziOperation =
 | {kind:"application";id:string;approve:boolean;reason:string}
 | {kind:"proposal";id:string;approve:boolean;reason:string}
 | {kind:"voting";id:string;enabled:boolean}
 | {kind:"identity";id:string;gemiNumber:string;evidence:string}
 | {kind:"conflict";voterId:string;proposalId:string;reason:string}
 | {kind:"invalidation";voteId:string;reason:string}
 | {kind:"cycle";stage:"submissions"|"review"|"voting"|"closed"};
export async function executeMaziSuperAdminAction(principal:SessionPrincipal, input:MaziOperation):Promise<void>{
 const actorId=await marketplaceMaziActor(principal);
 if ((input.kind==="application" || input.kind==="proposal" ||
      input.kind==="conflict" || input.kind==="invalidation") &&
     (input.reason.trim().length<20 || input.reason.length>1000))
   throw new Error("MAZI_REVIEW_REASON_REQUIRED");
 const client=await db().connect();
 try {
  await client.query("begin");
  // All cycle-closing and vote-exclusion actions share the same transaction
  // advisory lock as mazi_validate_ballot() in PostgreSQL. This ensures no
  // ballot can commit between taking the final tally and closing the round.
  if(["cycle","conflict","invalidation"].includes(input.kind)){
    const lockCycle=await client.query<{id:string}>(`
      select id::text from public.mazi_cycles
      where slug='founding-needs-2026' and kind='needs_assessment'
        and funding_budget_cents=0 and finance_activated=false
    `);
    if(!lockCycle.rows[0])throw new Error("MAZI_FOUNDING_CYCLE_NOT_FOUND");
    await client.query(`
      select pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended($1::text,24731))
    `,[lockCycle.rows[0].id]);
  }
  let entityType="",entityId="",action="";
  if(input.kind==="application"){
    const row=await client.query<{id:string;applicant_user_id:string;business_name:string}>(`
      select id::text,applicant_user_id::text,business_name
      from public.mazi_membership_applications where id=$1::uuid and status='pending' for update
    `,[input.id]);
    if(!row.rows[0])throw new Error("MAZI_APPLICATION_NOT_PENDING");
    const app=row.rows[0];
    await client.query(`
      update public.mazi_membership_applications
      set status=$2,reviewed_at=now(),reviewed_by=$3::uuid,review_reason=$4
      where id=$1::uuid
    `,[input.id,input.approve?"approved":"rejected",actorId,input.reason.trim()]);
    if(input.approve){
      await client.query(`
        insert into public.mazi_members(user_id,application_id,status,voting_eligible)
        values($1::uuid,$2::uuid,'verified',false)
        on conflict(user_id) do nothing
      `,[app.applicant_user_id,input.id]);
    }
    entityType="membership_application";entityId=input.id;action=input.approve?"approved":"rejected";
  }else if(input.kind==="proposal"){
    const r=await client.query<{id:string}>(`
      update public.mazi_proposals set status=$2,reviewed_at=now(),
        reviewed_by=$3::uuid,review_reason=$4
      where id=$1::uuid and status='submitted'
        and exists(select 1 from public.mazi_cycles c
          where c.id=mazi_proposals.cycle_id and c.status='review')
      returning id::text
    `,[input.id,input.approve?"approved":"rejected",actorId,input.reason.trim()]);
    if(!r.rows[0])throw new Error("MAZI_PROPOSAL_NOT_PENDING");
    entityType="proposal";entityId=input.id;action=input.approve?"approved":"rejected";
  }else if(input.kind==="identity"){
    if(!/^[0-9]{12}$/.test(input.gemiNumber) || input.evidence.trim().length<20 || input.evidence.length>1000)
      throw new Error("MAZI_GEMI_EVIDENCE_INVALID");
    const identity=await client.query<{user_id:string}>(`
      update public.mazi_members m
      set gemi_number=$2,identity_verified_at=now(),
          identity_verified_by=$3::uuid,identity_verification_note=$4,updated_at=now()
      where m.user_id=$1::uuid and m.status='verified'
        and m.identity_verified_at is null
        and exists(select 1 from public.mazi_membership_applications a
          where a.id=m.application_id and a.status='approved')
      returning m.user_id::text
    `,[input.id,input.gemiNumber,actorId,input.evidence.trim()]);
    if(!identity.rows[0])throw new Error("MAZI_BUSINESS_NOT_VERIFIABLE");
    entityType="member";entityId=input.id;action="gemi_identity_verified";
  }else if(input.kind==="conflict"){
    const c=await client.query<{id:string;status:string}>(`
      select id::text,status from public.mazi_cycles
      where slug='founding-needs-2026' and kind='needs_assessment'
        and finance_activated=false and funding_budget_cents=0
      for update
    `);
    if(!c.rows[0]||!["review","voting"].includes(c.rows[0].status))
      throw new Error("MAZI_CONFLICT_STAGE_INVALID");
    const target=await client.query<{id:string}>(`
      select p.id::text from public.mazi_proposals p
      join public.mazi_members m on m.user_id=$2::uuid
      where p.id=$1::uuid and p.cycle_id=$3::uuid and p.status='approved'
        and m.status='verified' and m.identity_verified_at is not null
    `,[input.proposalId,input.voterId,c.rows[0].id]);
    if(!target.rows[0])throw new Error("MAZI_CONFLICT_TARGET_INVALID");
    const x=await client.query<{id:string}>(`
      insert into public.mazi_vote_conflicts(cycle_id,voter_id,proposal_id,reason,recorded_by)
      values($1::uuid,$2::uuid,$3::uuid,$4,$5::uuid)
      on conflict(cycle_id,voter_id,proposal_id) do nothing returning id::text
    `,[c.rows[0].id,input.voterId,input.proposalId,input.reason.trim(),actorId]);
    if(!x.rows[0])throw new Error("MAZI_CONFLICT_ALREADY_RECORDED");
    // Preserve the original ballot; record a disqualification if the vote
    // was already cast for the now-disclosed connected proposal.
    await client.query(`
      insert into public.mazi_vote_invalidations(vote_id,cycle_id,reason,recorded_by)
      select v.id,v.cycle_id,$4,$5::uuid from public.mazi_votes v
      where v.cycle_id=$1::uuid and v.voter_id=$2::uuid and v.proposal_id=$3::uuid
      on conflict(vote_id) do nothing
    `,[c.rows[0].id,input.voterId,input.proposalId,
      input.reason.trim(),actorId]);
    entityType="vote_conflict";entityId=x.rows[0].id;action="recusal_recorded";
  }else if(input.kind==="invalidation"){
    const c=await client.query<{id:string;status:string}>(`
      select id::text,status from public.mazi_cycles
      where slug='founding-needs-2026' and kind='needs_assessment'
        and finance_activated=false and funding_budget_cents=0 for update
    `);
    if(!c.rows[0]||c.rows[0].status!=="voting")throw new Error("MAZI_INVALIDATION_STAGE_INVALID");
    const x=await client.query<{id:string}>(`
      insert into public.mazi_vote_invalidations(vote_id,cycle_id,reason,recorded_by)
      select v.id,v.cycle_id,$3,$4::uuid from public.mazi_votes v
      where v.id=$1::uuid and v.cycle_id=$2::uuid
      on conflict(vote_id) do nothing returning id::text
    `,[input.voteId,c.rows[0].id,input.reason.trim(),actorId]);
    if(!x.rows[0])throw new Error("MAZI_BALLOT_ALREADY_INVALIDATED_OR_MISSING");
    entityType="vote_invalidation";entityId=x.rows[0].id;action="ballot_disqualified";
  }else if(input.kind==="voting"){
    const r=await client.query<{user_id:string}>(`
      update public.mazi_members set voting_eligible=$2,updated_at=now()
      where user_id=$1::uuid and status='verified'
      and identity_verified_at is not null and gemi_number is not null
      and exists(select 1 from public.mazi_membership_applications a
        where a.id=mazi_members.application_id and a.status='approved')
      returning user_id::text
    `,[input.id,input.enabled]);
    if(!r.rows[0])throw new Error("MAZI_MEMBER_NOT_VERIFIED");
    entityType="member";entityId=input.id;action=input.enabled?"voting_enabled":"voting_disabled";
  }else{
    const current=await client.query<{id:string;status:string}>(`
      select id::text,status from public.mazi_cycles
      where slug='founding-needs-2026' and kind='needs_assessment'
        and finance_activated=false and funding_budget_cents=0
      for update
    `);
    const c=current.rows[0];
    if(!c)throw new Error("MAZI_NONFINANCIAL_CYCLE_NOT_FOUND");
    const allowed:Record<string,string[]>={preparing:["submissions"],submissions:["review"],review:["submissions","voting"],voting:["closed"],closed:[]};
    if(!(allowed[c.status]||[]).includes(input.stage))throw new Error("MAZI_CYCLE_TRANSITION_INVALID");
    if(input.stage==="voting"){
      const n=await client.query<{n:string}>(`
        select count(*)::text as n from public.mazi_proposals
        where cycle_id=$1::uuid and status='approved'
      `,[c.id]);
      if(Number(n.rows[0]?.n||0)===0) throw new Error("MAZI_NO_APPROVED_PROPOSALS");
      const pending=await client.query<{n:string}>(`
        select count(*)::text as n from public.mazi_proposals
        where cycle_id=$1::uuid and status='submitted'
      `,[c.id]);
      if(Number(pending.rows[0]?.n||0)>0)throw new Error("MAZI_PROPOSALS_PENDING_REVIEW");
    }
    if(input.stage==="closed"){
      const counts=await client.query<{total:string;invalidated:string;valid:string}>(`
        select count(*)::text as total,
          count(*) filter(where i.id is not null)::text as invalidated,
          count(*) filter(where i.id is null)::text as valid
        from public.mazi_votes v
        left join public.mazi_vote_invalidations i on i.vote_id=v.id
        where v.cycle_id=$1::uuid
      `,[c.id]);
      const summary=counts.rows[0];
      const candidates=await client.query<{n:string}>(`
        select count(*)::text as n from public.mazi_proposals
        where cycle_id=$1::uuid and status='approved'
      `,[c.id]);
      await client.query(`
        insert into public.mazi_cycle_results
        (cycle_id,finalized_by,total_ballots,invalidated_ballots,valid_ballots,
          proposals_considered,funding_awarded_cents)
        values($1::uuid,$2::uuid,$3::bigint,$4::bigint,$5::bigint,$6::integer,0)
      `,[c.id,actorId,summary.total,summary.invalidated,summary.valid,
        candidates.rows[0].n]);
      await client.query(`
        insert into public.mazi_proposal_results(cycle_id,proposal_id,supporting_ballots)
        select p.cycle_id,p.id,count(v.id)::bigint
        from public.mazi_proposals p
        left join public.mazi_votes v on v.proposal_id=p.id and v.cycle_id=p.cycle_id
          and not exists(select 1 from public.mazi_vote_invalidations i where i.vote_id=v.id)
        where p.cycle_id=$1::uuid and p.status='approved'
        group by p.cycle_id,p.id
      `,[c.id]);
    }
    await client.query("update public.mazi_cycles set status=$2 where id=$1::uuid",[c.id,input.stage]);
    entityType="needs_cycle";entityId=c.id;action="transition_"+input.stage;
  }
  await client.query(`
   insert into public.mazi_audit_events
      (marketplace_actor_user_id,entity_type,entity_id,action,evidence)
   values($1::uuid,$2,$3::uuid,$4,
     jsonb_build_object('authority','konta_moy_super_admin',
       'source','marketplace_server_session',
       'review_reason',$5::text))
  `,[actorId,entityType,entityId,action,
       (input.kind==="application"||input.kind==="proposal"||
        input.kind==="conflict"||input.kind==="invalidation")?input.reason.trim():null]);
  await client.query("commit");
 }catch(err){await client.query("rollback").catch(()=>{});throw err;}
 finally{client.release();}
}
