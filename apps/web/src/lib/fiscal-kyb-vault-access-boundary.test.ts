import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 evaluateFiscalVaultRoleBoundary,
 FISCAL_VAULT_STORAGE_ROLE_AUDIT_SQL,
 FISCAL_VAULT_STORAGE_SECURITY_SQL
} from "./fiscal-kyb-vault-access-boundary.ts";
const roles=[
 {rolname:"anon",rolbypassrls:false},
 {rolname:"authenticated",rolbypassrls:false},
 {rolname:"service_role",rolbypassrls:true}
];
const security={
 object_rls_enabled:true,object_policies:0,
 quarantine_objects:0,quarantine_private:true
};
test("M36 reports effective RLS denial, not privilege removal or readiness",()=>{
 const r=evaluateFiscalVaultRoleBoundary(roles,security);
 assert.equal(r.status,"effective_public_denial");
 assert.equal(r.ordinaryClientOperationsDeniedByPolicy,true);
 assert.equal(r.serviceRoleCanBypassRls,true);
 assert.equal(r.noObjectPolicies,true);
 for(const k of [
  "privilegedKeyIsolatedIndependently","realRoleSwitchTestPerformed",
  "productionIntakeEnabled","mayWrite","mayRead","mayIssue"
 ] as const)assert.equal(r[k],false);
 assert.ok(Object.isFrozen(r));
});
test("M36 fails closed for RLS bypass, policies, public bucket and existing files",()=>{
 for(const [r,s] of [
  [[{...roles[0],rolbypassrls:true},roles[1],roles[2]],security],
  [[roles[0],{...roles[1],rolbypassrls:true},roles[2]],security],
  [roles,{...security,object_rls_enabled:false}],
  [roles,{...security,object_policies:1}],
  [roles,{...security,quarantine_objects:1}],
  [roles,{...security,quarantine_private:false}],
  [roles.filter(x=>x.rolname!=="service_role"),security],
  [roles.filter(x=>x.rolname!=="anon"),security],
  [[...roles,roles[0]],security]
 ] as const){
  const result=evaluateFiscalVaultRoleBoundary(r,s);
  assert.equal(result.status,"unsafe_configuration");
  assert.equal(result.productionIntakeEnabled,false);
  assert.equal(result.mayWrite,false);
 }
 assert.equal(evaluateFiscalVaultRoleBoundary(null,security).status,"unavailable");
 assert.equal(evaluateFiscalVaultRoleBoundary(roles,null).status,"unavailable");
});
test("M36 queries never enumerate objects, credentials, or merchant data",()=>{
 const sql=FISCAL_VAULT_STORAGE_ROLE_AUDIT_SQL+"\n"+
  FISCAL_VAULT_STORAGE_SECURITY_SQL;
 assert.match(sql,/pg_roles/);
 assert.match(sql,/pg_policies/);
 assert.match(sql,/count\(\*\)::integer FROM storage\.objects/);
 assert.ok(!/SELECT \*|storage\.objects.*\bname\b|auth\.users|secrets|service_role_key/i.test(sql));
 const source=readFileSync(new URL("./fiscal-kyb-vault-access-boundary.ts",import.meta.url),"utf8");
 assert.ok(!/fetch\s*\(|createSignedUrl\(|createBucket\(|FormData|storage\.from\(/.test(source));
});
