import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {evaluateFiscalM38RoleReadiness,FISCAL_M38_ROLE_SQL} from "./fiscal-kyb-vault-dormant-role-readiness.ts";

const clean={
 rolname:"fiscal_kyb_probe",rolcanlogin:false,rolinherit:false,
 rolbypassrls:false,rolsuper:false,rolcreaterole:false,rolcreatedb:false,
 rolreplication:false,authenticator_member:false,anon_member:false,
 authenticated_member:false,inherited_memberships:0
};

test("M38 live role metadata may confirm dormant role but never approves Storage access",()=>{
 const result=evaluateFiscalM38RoleReadiness(clean);
 assert.equal(result.status,"dormant_verified");
 assert.equal(result.roleExists,true);
 assert.equal(result.noLogin,true);
 assert.equal(result.noBypassRls,true);
 assert.equal(result.notDelegatedToApi,true);
 assert.ok(Object.isFrozen(result));
 for(const name of [
  "shortLivedJwtIssuerConnected","externalKmsVerified","scannerVerified",
  "probeAccessEnabled","liveStorageObjectTested",
  "merchantUploadsEnabled","canReadDocuments","fiscalIssuanceEnabled"
 ] as const)assert.equal(result[name],false);
});

test("M38 fails closed on elevated role or delegated authenticator membership",()=>{
 const failures=[
  {rolcanlogin:true},{rolinherit:true},{rolbypassrls:true},
  {rolsuper:true},{rolcreaterole:true},{rolcreatedb:true},
  {rolreplication:true},{authenticator_member:true},
  {anon_member:true},{authenticated_member:true},
  {inherited_memberships:1},{rolname:"service_role"}
 ];
 for(const bad of failures){
  const r=evaluateFiscalM38RoleReadiness({...clean,...bad});
  assert.equal(r.status,"unsafe",JSON.stringify(bad));
  assert.equal(r.probeAccessEnabled,false);
 }
 assert.equal(evaluateFiscalM38RoleReadiness(null).status,"missing");
 assert.equal(evaluateFiscalM38RoleReadiness(null,false).status,"unavailable");
});

test("M38 migration creates a NOLOGIN/NOINHERIT/NOBYPASSRLS role, without grants or policies",()=>{
 const migration=readFileSync(new URL(
  "../../../../fiscal/security/m38_dormant_storage_probe_role.sql",
  import.meta.url),"utf8");
 assert.match(migration,/CREATE ROLE fiscal_kyb_probe/);
 for(const marker of ["NOLOGIN","NOINHERIT","NOBYPASSRLS",
  "NOSUPERUSER","NOCREATEROLE","NOCREATEDB","NOREPLICATION"])
  assert.ok(migration.includes(marker),marker);
 assert.ok(!/\bGRANT\s+(?:USAGE|SELECT|INSERT|UPDATE|DELETE|[\s\S]*?\bTO\s+authenticator)/i.test(
  migration.replace(/--[^\n]*/g,"")));
 assert.ok(!/\bCREATE\s+POLICY|\bCREATE\s+FUNCTION|\bSET\s+ROLE/.test(
  migration.replace(/--[^\n]*/g,"")));
 assert.match(FISCAL_M38_ROLE_SQL,/pg_auth_members/);
 assert.match(FISCAL_M38_ROLE_SQL,/authenticator_member/);
 const route=readFileSync(new URL(
  "../app/timologio-admin/kyb-intake-readiness/page.tsx",import.meta.url),"utf8");
 assert.match(route,/await fiscalAdminActor\(\)/);
 assert.ok(!/type="file"|onSubmit|createSignedUrl\(/.test(route));
});
