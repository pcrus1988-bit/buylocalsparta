/**
 * M36: LIVE, READ-ONLY Storage role boundary inspection.
 *
 * PostgreSQL table GRANT privileges do not override RLS. The only justified
 * denial claim is: RLS enabled + zero policies + standard authenticated/anon
 * roles not BYPASSRLS. Supabase service_role DOES bypass RLS, so the
 * application must never be given a service_role Storage credential.
 *
 * No object bytes/names, merchant identity, secrets, SQL mutations, upload
 * endpoints or signed URLs are accessed here.
 */
export const FISCAL_VAULT_STORAGE_ROLE_AUDIT_SQL=`
SELECT role.rolname,role.rolbypassrls
FROM pg_roles role
WHERE role.rolname IN ('anon','authenticated','service_role')
ORDER BY role.rolname
`;

export const FISCAL_VAULT_STORAGE_SECURITY_SQL=`
SELECT
  COALESCE((SELECT c.relrowsecurity FROM pg_class c
    WHERE c.oid=to_regclass('storage.objects')),false) AS object_rls_enabled,
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects') AS object_policies,
  (SELECT count(*)::integer FROM storage.objects
    WHERE bucket_id='fiscal-kyb-quarantine') AS quarantine_objects,
  COALESCE((SELECT NOT public FROM storage.buckets
    WHERE id='fiscal-kyb-quarantine' LIMIT 1),false) AS quarantine_private
`;

type RoleRow=Readonly<{rolname:string;rolbypassrls:boolean}>;
type StorageSecurityRow=Readonly<{
 object_rls_enabled:boolean;object_policies:number;
 quarantine_objects:number;quarantine_private:boolean;
}>;
export type FiscalVaultRoleBoundary=Readonly<{
 status:"unavailable"|"effective_public_denial"|"unsafe_configuration";
 anonymousBypassRls:boolean;authenticatedBypassRls:boolean;
 serviceRoleCanBypassRls:boolean;
 noObjectPolicies:boolean;privateEmptyQuarantine:boolean;
 objectRlsEnabled:boolean;
 ordinaryClientOperationsDeniedByPolicy:boolean;
 privilegedKeyIsolatedIndependently:false;
 realRoleSwitchTestPerformed:false;
 productionIntakeEnabled:false;mayWrite:false;
 mayRead:false;mayIssue:false;
}>;

const empty=Object.freeze({
 anonymousBypassRls:false,authenticatedBypassRls:false,
 serviceRoleCanBypassRls:false,noObjectPolicies:false,
 privateEmptyQuarantine:false,objectRlsEnabled:false,
 ordinaryClientOperationsDeniedByPolicy:false,
 privilegedKeyIsolatedIndependently:false as const,
 realRoleSwitchTestPerformed:false as const,
 productionIntakeEnabled:false as const,
 mayWrite:false as const,mayRead:false as const,
 mayIssue:false as const
});

export function evaluateFiscalVaultRoleBoundary(
 roles:readonly RoleRow[]|null,
 security:StorageSecurityRow|null
):FiscalVaultRoleBoundary{
 if(!roles||!security)return Object.freeze({status:"unavailable" as const,...empty});
 const map=new Map<string,boolean>();
 for(const role of roles){
  if(!["anon","authenticated","service_role"].includes(role.rolname)||
   typeof role.rolbypassrls!=="boolean"||map.has(role.rolname))
   return Object.freeze({status:"unsafe_configuration" as const,...empty});
  map.set(role.rolname,role.rolbypassrls);
 }
 const anonymousBypassRls=map.get("anon")===true;
 const authenticatedBypassRls=map.get("authenticated")===true;
 const serviceRoleCanBypassRls=map.get("service_role")===true;
 const noObjectPolicies=security.object_policies===0;
 const privateEmptyQuarantine=security.quarantine_private===true&&
  security.quarantine_objects===0;
 const objectRlsEnabled=security.object_rls_enabled===true;
 const ordinaryClientOperationsDeniedByPolicy=map.has("anon")&&
  map.has("authenticated")&&!anonymousBypassRls&&
  !authenticatedBypassRls&&objectRlsEnabled&&noObjectPolicies&&
  privateEmptyQuarantine;
 const safe=ordinaryClientOperationsDeniedByPolicy&&
  serviceRoleCanBypassRls;
 return Object.freeze({
  status:safe?"effective_public_denial" as const:
   "unsafe_configuration" as const,
  anonymousBypassRls,authenticatedBypassRls,serviceRoleCanBypassRls,
  noObjectPolicies,privateEmptyQuarantine,objectRlsEnabled,
  ordinaryClientOperationsDeniedByPolicy,
  privilegedKeyIsolatedIndependently:false as const,
  realRoleSwitchTestPerformed:false as const,
  productionIntakeEnabled:false as const,
  mayWrite:false as const,mayRead:false as const,
  mayIssue:false as const
 });
}

/**
 * Read-only catalog inspection, only when called by a protected server route.
 * Fail closed on any error and never include SQL diagnostics in responses.
 */
export async function getFiscalVaultRoleBoundary():Promise<FiscalVaultRoleBoundary>{
 try{
  const {fiscalDatabaseConfigured,fiscalPool}=await import("./fiscal-runtime");
  if(!fiscalDatabaseConfigured())
   return evaluateFiscalVaultRoleBoundary(null,null);
  const [roles,security]=await Promise.all([
   fiscalPool().query<RoleRow>(FISCAL_VAULT_STORAGE_ROLE_AUDIT_SQL),
   fiscalPool().query<StorageSecurityRow>(FISCAL_VAULT_STORAGE_SECURITY_SQL)
  ]);
  return evaluateFiscalVaultRoleBoundary(
   roles.rows,security.rows[0]??null);
 }catch{
  return evaluateFiscalVaultRoleBoundary(null,null);
 }
}
