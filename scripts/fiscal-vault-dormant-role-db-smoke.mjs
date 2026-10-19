/**
 * M38 SQL acceptance: exact guarded production role provisioning SQL,
 * executed ONLY inside a rollback transaction in disposable fiscal_ci.
 * Never targets hosted Supabase, and never issues a live JWT or object call.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";
import {FISCAL_M38_ROLE_SQL,evaluateFiscalM38RoleReadiness}
 from "../apps/web/src/lib/fiscal-kyb-vault-dormant-role-readiness.ts";

const connectionString=process.env.FISCAL_DATABASE_URL??"";
let url;
try{url=new URL(connectionString);}catch{throw Error("M38_DISPOSABLE_CI_ONLY");}
if(process.env.CI!=="true"||
 !["localhost","127.0.0.1","::1"].includes(url.hostname)||
 url.pathname!=="/fiscal_ci"||connectionString===process.env.DATABASE_URL)
 throw Error("M38_DISPOSABLE_CI_ONLY");

const source=readFileSync(
 new URL("../fiscal/security/m38_dormant_storage_probe_role.sql",import.meta.url),
 "utf8"
);
const db=new pg.Client({connectionString,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 // The fixture is transaction-local and rolled back at the end.
 for(const role of ["authenticator","anon","authenticated"]){
  const exists=await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role]);
  if(exists.rows.length===0)await db.query("CREATE ROLE "+role+" NOLOGIN");
 }
 await db.query("CREATE SCHEMA storage");
 await db.query(`
 CREATE TABLE storage.buckets(
  id text PRIMARY KEY,public boolean NOT NULL,
  file_size_limit bigint NOT NULL,allowed_mime_types text[] NOT NULL
 );
 CREATE TABLE storage.objects(bucket_id text NOT NULL,marker text NOT NULL);
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 INSERT INTO storage.buckets(id,public,file_size_limit,allowed_mime_types)
 VALUES('fiscal-kyb-quarantine',false,12582912,
  ARRAY['application/octet-stream']::text[]);
 `);
 await db.query(source);
 await db.query(source); // No escalation on guarded re-application.
 const role=(await db.query(FISCAL_M38_ROLE_SQL)).rows[0];
 assert.equal(evaluateFiscalM38RoleReadiness(role).status,"dormant_verified");
 const privileges=await db.query(`
 SELECT pg_has_role('authenticator','fiscal_kyb_probe','MEMBER') AS delegated,
   (SELECT count(*)::int FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects') AS policies
 `);
 assert.equal(privileges.rows[0].delegated,false);
 assert.equal(privileges.rows[0].policies,0);
 // Negative privilege drill as the intended dormant role.
 await db.query("SAVEPOINT m38_deny");
 await db.query("SET LOCAL ROLE fiscal_kyb_probe");
 let denied=false;
 try{await db.query("SELECT marker FROM storage.objects LIMIT 1");}
 catch(error){
  denied=true;
  assert.equal(error.code,"42501");
 }
 assert.equal(denied,true);
 await db.query("ROLLBACK TO SAVEPOINT m38_deny");
 // If an operator accidentally delegates this role, rerunning the
 // guard MUST abort, rather than silently accepting access escalation.
 await db.query("SAVEPOINT m38_escalation");
 await db.query("GRANT fiscal_kyb_probe TO authenticator");
 let refused=false;
 try{await db.query(source);}catch(error){
  refused=true;
  assert.equal(error.message.includes("M38_ROLE_NOT_DORMANT"),true);
 }
 assert.equal(refused,true);
 await db.query("ROLLBACK TO SAVEPOINT m38_escalation");
 assert.equal(evaluateFiscalM38RoleReadiness(
  (await db.query(FISCAL_M38_ROLE_SQL)).rows[0]
 ).status,"dormant_verified");
 console.log("M38 DORMANT ROLE ACCEPTANCE PASS (CI synthetic rollback, no grants)");
}finally{
 await db.query("ROLLBACK").catch(()=>undefined);
 await db.end();
}
