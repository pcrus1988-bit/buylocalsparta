/**
 * M38: real read-only audit of the dormant, *unprivileged* Supabase Storage
 * synthetic probe PostgreSQL role. The custom role is NOT a usable identity
 * in the Storage API until explicit role grants, RLS policies and a verified
 * externally signed short-lived JWT are established in a later milestone.
 *
 * This diagnostic reads PostgreSQL metadata only: no credentials, objects,
 * merchant data, Storage API writes or signed URLs.
 */
export const FISCAL_M38_ROLE_SQL=`
 SELECT r.rolname,r.rolcanlogin,r.rolinherit,r.rolbypassrls,
        r.rolsuper,r.rolcreaterole,r.rolcreatedb,r.rolreplication,
        pg_has_role('authenticator',r.oid,'MEMBER') AS authenticator_member,
        pg_has_role('anon',r.oid,'MEMBER') AS anon_member,
        pg_has_role('authenticated',r.oid,'MEMBER') AS authenticated_member,
        (SELECT count(*)::int FROM pg_auth_members m
           WHERE m.member=r.oid) AS inherited_memberships
 FROM pg_roles r
 WHERE r.rolname='fiscal_kyb_probe'
 LIMIT 1
`;

type RoleData=Readonly<{
 rolname:string;rolcanlogin:boolean;rolinherit:boolean;
 rolbypassrls:boolean;rolsuper:boolean;rolcreaterole:boolean;
 rolcreatedb:boolean;rolreplication:boolean;authenticator_member:boolean;
 anon_member:boolean;authenticated_member:boolean;
 inherited_memberships:number;
}>;

export type FiscalM38RoleReadiness=Readonly<{
 status:"unavailable"|"missing"|"dormant_verified"|"unsafe";
 roleExists:boolean;noLogin:boolean;noBypassRls:boolean;
 noPrivilegesOrInheritance:boolean;notDelegatedToApi:boolean;
 shortLivedJwtIssuerConnected:false;externalKmsVerified:false;
 scannerVerified:false;probeAccessEnabled:false;
 liveStorageObjectTested:false;merchantUploadsEnabled:false;
 canReadDocuments:false;fiscalIssuanceEnabled:false;
}>;

const off={
 shortLivedJwtIssuerConnected:false as const,
 externalKmsVerified:false as const,scannerVerified:false as const,
 probeAccessEnabled:false as const,liveStorageObjectTested:false as const,
 merchantUploadsEnabled:false as const,canReadDocuments:false as const,
 fiscalIssuanceEnabled:false as const
};

function failed(status:"unavailable"|"missing"):FiscalM38RoleReadiness{
 return Object.freeze({status,roleExists:false,
  noLogin:false,noBypassRls:false,noPrivilegesOrInheritance:false,
  notDelegatedToApi:false,...off});
}

export function evaluateFiscalM38RoleReadiness(
 role:RoleData|null|undefined,
 catalogAccessible=true
):FiscalM38RoleReadiness{
 if(!catalogAccessible)return failed("unavailable");
 if(!role)return failed("missing");
 const noLogin=role.rolcanlogin===false;
 const noBypassRls=role.rolbypassrls===false;
 const noPrivilegesOrInheritance=
  role.rolinherit===false&&role.rolsuper===false&&
  role.rolcreaterole===false&&role.rolcreatedb===false&&
  role.rolreplication===false&&role.inherited_memberships===0;
 const notDelegatedToApi=
  role.authenticator_member===false&&role.anon_member===false&&
  role.authenticated_member===false;
 const safe=role.rolname==="fiscal_kyb_probe"&&noLogin&&
  noBypassRls&&noPrivilegesOrInheritance&&notDelegatedToApi;
 return Object.freeze({
  status:safe?"dormant_verified" as const:"unsafe" as const,
  roleExists:true,noLogin,noBypassRls,noPrivilegesOrInheritance,
  notDelegatedToApi,...off
 });
}

export async function getFiscalM38RoleReadiness():Promise<FiscalM38RoleReadiness>{
 try{
  const {fiscalDatabaseConfigured,fiscalPool}=await import("./fiscal-runtime");
  if(!fiscalDatabaseConfigured())return failed("unavailable");
  const result=await fiscalPool().query<RoleData>(FISCAL_M38_ROLE_SQL);
  return evaluateFiscalM38RoleReadiness(result.rows[0]??null);
 }catch{
  return failed("unavailable");
 }
}
