import {createHash,randomBytes} from "node:crypto";
import {getProductionPostgresRuntime,productionDatabaseConfigured} from "./postgres-runtime";
import {parseStaffInviteClaim,type StaffInviteCreate} from "./drinkstock-staff-invite-policy";
import {StationAccessError,requireStationAccess} from "./drinkstock-station-access-service";
export class StaffInviteError extends Error{
 readonly code:string;readonly status:number;
 constructor(code:string,status:number){super(code);this.code=code;this.status=status;}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
type Db={query<T extends Record<string,unknown>>(sql:string,values?:readonly unknown[]):Promise<{rows:readonly T[];rowCount:number}>};
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
function assertScope(u:string,p:string,v:string){
 if(!u||!uuid.test(p)||!uuid.test(v))throw new StaffInviteError("NOT_FOUND",404);
 if(!productionDatabaseConfigured())throw new StaffInviteError("STAFF_INVITES_UNAVAILABLE",503);
}
async function requireManager(db:Db,u:string,p:string,v:string,lock=false){
 // Existing venue / partner authorization and live app state rechecked each request.
 const role=await db.query<{role:string}>(`
 SELECT m.role FROM public.hospitality_venues v
 JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
 JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
 JOIN public.hospitality_partner_memberships m ON m.partner_id=p.id AND m.user_id=$1 AND m.status='active'
 WHERE v.partner_id=$2::uuid AND v.id=$3::uuid AND v.status='active'
 ${lock?"FOR UPDATE OF v":""}
 `,[u,p,v]);
 if(!["owner","manager"].includes(role.rows[0]?.role??""))throw new StaffInviteError("MANAGER_REQUIRED",403);
}
export type PendingStaffInvite=Readonly<{
 id:string;email:string;bar:boolean;waiter:boolean;
 createdAt:string;expiresAt:string
}>;
export async function pendingVenueInvites(u:string,p:string,v:string):Promise<PendingStaffInvite[]>{
 assertScope(u,p,v);
 const db=getProductionPostgresRuntime().sqlPool;
 await requireManager(db,u,p,v);
 const result=await db.query<{id:string;email:string;bar:boolean;waiter:boolean;created_at:Date;expires_at:Date}>(`
 SELECT id::text,email::text,bar,waiter,created_at,expires_at
 FROM public.drinkstock_staff_invitations
 WHERE partner_id=$1::uuid AND venue_id=$2::uuid
   AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()
 ORDER BY created_at DESC LIMIT 30
 `,[p,v]);
 return result.rows.map(x=>({id:x.id,email:x.email,bar:x.bar,waiter:x.waiter,
  createdAt:new Date(x.created_at).toISOString(),expiresAt:new Date(x.expires_at).toISOString()}));
}
export async function createVenueStaffInvite(u:string,p:string,v:string,action:StaffInviteCreate){
 assertScope(u,p,v);
 const token=randomBytes(32).toString("base64url");
 const sql=getProductionPostgresRuntime().sqlPool;
 const db=await sql.connect();
 let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  await requireManager(db,u,p,v,true);
  const replay=await db.query<{email:string;bar:boolean;waiter:boolean}>(`
   SELECT email::text,bar,waiter FROM public.drinkstock_staff_invitations
   WHERE venue_id=$1::uuid AND request_key=$2::uuid
  `,[v,action.requestKey]);
  if(replay.rows.length){
   const x=replay.rows[0]!;
   if(x.email.toLowerCase()!==action.email||x.bar!==action.bar||x.waiter!==action.waiter)
    throw new StaffInviteError("INVITE_REQUEST_CONFLICT",409);
   await db.query("COMMIT");committed=true;
   return {replayed:true,invitePath:null as string|null};
  }
  const pending=await db.query<{n:number}>(`
   SELECT COUNT(*)::int AS n FROM public.drinkstock_staff_invitations
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND accepted_at IS NULL
    AND revoked_at IS NULL AND expires_at>now()
  `,[p,v]);
  if(Number(pending.rows[0]?.n??0)>=20)throw new StaffInviteError("TOO_MANY_PENDING_INVITES",409);
  const existing=await db.query<{id:string}>(`
   SELECT id::text FROM public.drinkstock_staff_invitations
   WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND email=$3::public.citext
     AND accepted_at IS NULL AND revoked_at IS NULL
   FOR UPDATE
  `,[p,v,action.email]);
  if(existing.rows.length){
   await db.query(`UPDATE public.drinkstock_staff_invitations
    SET revoked_at=now(),revoked_by=$3
    WHERE partner_id=$1::uuid AND venue_id=$2::uuid AND email=$4::public.citext
    AND accepted_at IS NULL AND revoked_at IS NULL`,[p,v,u,action.email]);
   for(const x of existing.rows)await db.query(`
    INSERT INTO public.drinkstock_staff_invitation_events(
      partner_id,venue_id,invitation_id,actor_user_id,action)
    VALUES($1::uuid,$2::uuid,$3::uuid,$4,'revoked')
   `,[p,v,x.id,u]);
  }
  const created=await db.query<{id:string}>(`
   INSERT INTO public.drinkstock_staff_invitations(
    partner_id,venue_id,email,token_sha256,bar,waiter,created_by,request_key,expires_at)
   VALUES($1::uuid,$2::uuid,$3::public.citext,$4,$5,$6,$7,$8::uuid,now()+interval '7 days')
   RETURNING id::text
  `,[p,v,action.email,digest(token),action.bar,action.waiter,u,action.requestKey]);
  const id=created.rows[0]?.id;
  if(!id)throw new StaffInviteError("STAFF_INVITE_CREATE_FAILED",503);
  await db.query(`
   INSERT INTO public.drinkstock_staff_invitation_events(
    partner_id,venue_id,invitation_id,actor_user_id,action)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,'created')
  `,[p,v,id,u]);
  await db.query("COMMIT");committed=true;
  return {replayed:false,invitePath:"/drinkstock/staff/invite/"+token};
 }catch(error){if(!committed)try{await db.query("ROLLBACK");}catch{}throw error;}
 finally{db.release();}
}
export async function revokeVenueStaffInvite(u:string,p:string,v:string,id:string){
 assertScope(u,p,v);
 if(!uuid.test(id))throw new StaffInviteError("INVALID_INVITE_ID",400);
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  await requireManager(db,u,p,v,true);
  const result=await db.query<{id:string;accepted_at:Date|null;revoked_at:Date|null}>(`
   SELECT id::text,accepted_at,revoked_at FROM public.drinkstock_staff_invitations
   WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid FOR UPDATE
  `,[id,p,v]);
  const invite=result.rows[0];
  if(!invite)throw new StaffInviteError("INVITE_NOT_FOUND",404);
  if(invite.accepted_at)throw new StaffInviteError("INVITE_ALREADY_ACCEPTED",409);
  if(invite.revoked_at){await db.query("COMMIT");committed=true;return {revoked:true,replayed:true};}
  await db.query(`UPDATE public.drinkstock_staff_invitations SET revoked_at=now(),revoked_by=$4
    WHERE id=$1::uuid AND partner_id=$2::uuid AND venue_id=$3::uuid`,[id,p,v,u]);
  await db.query(`
   INSERT INTO public.drinkstock_staff_invitation_events(
    partner_id,venue_id,invitation_id,actor_user_id,action)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,'revoked')
  `,[p,v,id,u]);
  await db.query("COMMIT");committed=true;
  return {revoked:true,replayed:false};
 }catch(error){if(!committed)try{await db.query("ROLLBACK");}catch{}throw error;}
 finally{db.release();}
}
export async function claimVenueStaffInvite(u:string,token:string){
 if(!u||!productionDatabaseConfigured())throw new StaffInviteError("AUTH_REQUIRED",401);
 try{parseStaffInviteClaim({token});}
 catch{throw new StaffInviteError("INVALID_STAFF_CLAIM",400);}
 const db=await getProductionPostgresRuntime().sqlPool.connect();
 let committed=false;
 try{
  await db.query("BEGIN");await db.query("SET LOCAL statement_timeout='8s'");
  // Verify the customer identity against the database, not a caller supplied email.
  const account=await db.query<{public_id:string;email:string}>(`
   SELECT u.public_id,u.email::text
   FROM public.users u
   WHERE u.public_id=$1 AND u.status='active' AND u.closed_at IS NULL
    AND u.email IS NOT NULL AND u.email_verified_at IS NOT NULL
    AND length(u.password_hash)>0
    AND EXISTS (SELECT 1 FROM public.customer_profiles cp WHERE cp.user_id=u.id)
   LIMIT 1 FOR SHARE OF u
  `,[u]);
  if(!account.rows.length)throw new StaffInviteError("VERIFIED_CUSTOMER_ACCOUNT_REQUIRED",403);
  const acceptedBy=account.rows[0]!;
  const result=await db.query<{id:string;partner_id:string;venue_id:string;email:string;
   bar:boolean;waiter:boolean;accepted_at:Date|null;accepted_user_id:string|null;
   revoked_at:Date|null;expires_at:Date}>(`
   SELECT i.id::text,i.partner_id::text,i.venue_id::text,i.email::text,
    i.bar,i.waiter,i.accepted_at,i.accepted_user_id,i.revoked_at,i.expires_at
   FROM public.drinkstock_staff_invitations i
   WHERE i.token_sha256=$1
   FOR UPDATE OF i
  `,[digest(token)]);
  const invite=result.rows[0];
  if(!invite||invite.email.toLowerCase()!==acceptedBy.email.toLowerCase()||invite.revoked_at)
   throw new StaffInviteError("INVITE_NOT_AVAILABLE",403);
  if(invite.accepted_at){
   if(invite.accepted_user_id!==u)throw new StaffInviteError("INVITE_NOT_AVAILABLE",403);
   await db.query("COMMIT");committed=true;
   return {accepted:true,replayed:true,partnerId:invite.partner_id,venueId:invite.venue_id};
  }
  if(new Date(invite.expires_at).getTime()<=Date.now())
   throw new StaffInviteError("INVITE_EXPIRED",410);
  // Lock the venue to serialize role and station grants with assignment changes.
  const venue=await db.query<{id:string}>(`
   SELECT v.id::text FROM public.hospitality_venues v
   JOIN public.hospitality_partners p ON p.id=v.partner_id AND p.status='active'
   JOIN public.hospitality_partner_apps a ON a.partner_id=p.id AND a.app_key='drinkStock' AND a.enabled
   WHERE v.id=$1::uuid AND v.partner_id=$2::uuid AND v.status='active' FOR UPDATE OF v
  `,[invite.venue_id,invite.partner_id]);
  if(!venue.rows.length)throw new StaffInviteError("VENUE_NOT_ACTIVE",403);
  const member=await db.query<{role:string;status:string}>(`
   SELECT role,status FROM public.hospitality_partner_memberships
   WHERE partner_id=$1::uuid AND user_id=$2 FOR UPDATE
  `,[invite.partner_id,u]);
  if(member.rows.length&&
     (member.rows[0]?.role!=="staff"||member.rows[0]?.status!=="active"))
   throw new StaffInviteError("MEMBERSHIP_REVIEW_REQUIRED",409);
  if(!member.rows.length)await db.query(`
   INSERT INTO public.hospitality_partner_memberships(partner_id,user_id,role,status)
   VALUES($1::uuid,$2,'staff','active')
  `,[invite.partner_id,u]);
  for(const station of (["bar","waiter"] as const)){
   if(!invite[station])continue;
   await db.query(`
    INSERT INTO public.drinkstock_venue_staff_stations(
      partner_id,venue_id,user_id,station,assigned_by)
    VALUES($1::uuid,$2::uuid,$3,$4,$5)
    ON CONFLICT(venue_id,user_id,station) DO NOTHING
   `,[invite.partner_id,invite.venue_id,u,station,invite.id]);
  }
  await db.query(`
   UPDATE public.drinkstock_staff_invitations
   SET accepted_at=now(),accepted_user_id=$2
   WHERE id=$1::uuid AND accepted_at IS NULL AND revoked_at IS NULL
  `,[invite.id,u]);
  await db.query(`
   INSERT INTO public.drinkstock_staff_invitation_events(
      partner_id,venue_id,invitation_id,actor_user_id,action)
   VALUES($1::uuid,$2::uuid,$3::uuid,$4,'accepted')
  `,[invite.partner_id,invite.venue_id,invite.id,u]);
  await db.query("COMMIT");committed=true;
  return {accepted:true,replayed:false,partnerId:invite.partner_id,venueId:invite.venue_id};
 }catch(error){if(!committed)try{await db.query("ROLLBACK");}catch{}throw error;}
 finally{db.release();}
}
