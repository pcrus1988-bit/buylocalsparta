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
export type MaziAdminCycle = {id:string;title:string;status:string;finance_activated:boolean;funding_budget_cents:string};
export type MaziAdminSnapshot = {
 applications:MaziAdminApplication[]; proposals:MaziAdminProposal[];
 members:MaziAdminMember[]; cycle:MaziAdminCycle|null;
};
export async function maziAdminSnapshot(principal: SessionPrincipal): Promise<MaziAdminSnapshot> {
 await marketplaceMaziActor(principal);
 const [a,p,m,c] = await Promise.all([
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
   `)
 ]);
 return {applications:a.rows,proposals:p.rows,members:m.rows,cycle:c.rows[0]||null};
}
export type MaziOperation =
 | {kind:"application";id:string;approve:boolean;reason:string}
 | {kind:"proposal";id:string;approve:boolean;reason:string}
 | {kind:"voting";id:string;enabled:boolean}
 | {kind:"identity";id:string;gemiNumber:string;evidence:string}
 | {kind:"cycle";stage:"submissions"|"review"|"voting"|"closed"};
export async function executeMaziSuperAdminAction(principal:SessionPrincipal, input:MaziOperation):Promise<void>{
 const actorId=await marketplaceMaziActor(principal);
 if ((input.kind==="application" || input.kind==="proposal") &&
     (input.reason.trim().length<20 || input.reason.length>1000))
   throw new Error("MAZI_REVIEW_REASON_REQUIRED");
 const client=await db().connect();
 try {
  await client.query("begin");
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
      where id=$1::uuid and status='submitted' returning id::text
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
       (input.kind==="application"||input.kind==="proposal")?input.reason.trim():null]);
  await client.query("commit");
 }catch(err){await client.query("rollback").catch(()=>{});throw err;}
 finally{client.release();}
}
