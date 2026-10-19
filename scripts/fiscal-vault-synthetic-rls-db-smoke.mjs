/**
 * M39 staged Storage policy acceptance: tests the EXACT REVIEW-ONLY
 * blueprint in a disposable fiscal_ci database, never in live Supabase.
 * Run scoped to CI=true and localhost. Fixture rolls back entirely.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";

const conn=process.env.FISCAL_DATABASE_URL??"";
let url;
try{url=new URL(conn);}catch{throw Error("M39_CI_LOCAL_ONLY");}
if(process.env.CI!=="true"||
 !["localhost","127.0.0.1","::1"].includes(url.hostname)||
 url.pathname!=="/fiscal_ci"||conn===process.env.DATABASE_URL)
 throw Error("M39_CI_LOCAL_ONLY");

const roleSql=readFileSync(
 new URL("../fiscal/security/m38_dormant_storage_probe_role.sql",import.meta.url),
 "utf8");
const blueprint=readFileSync(
 new URL("../fiscal/security/m39_scoped_synthetic_storage_policies_REVIEW_ONLY.sql",import.meta.url),
 "utf8");
const db=new pg.Client({connectionString:conn,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 for(const role of ["authenticator","anon","authenticated"]){
  if((await db.query("SELECT 1 FROM pg_roles WHERE rolname=$1",[role])).rowCount===0)
   await db.query("CREATE ROLE "+role+" NOLOGIN");
 }
 await db.query("CREATE SCHEMA storage");
 await db.query(`
 CREATE TABLE storage.buckets(
  id text PRIMARY KEY,public boolean NOT NULL,
  file_size_limit bigint NOT NULL,allowed_mime_types text[] NOT NULL
 );
 CREATE TABLE storage.objects(
  bucket_id text NOT NULL,name text NOT NULL,synthetic_marker text NOT NULL
 );
 ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 INSERT INTO storage.buckets(id,public,file_size_limit,allowed_mime_types)
 VALUES('fiscal-kyb-quarantine',false,12582912,
 ARRAY['application/octet-stream']::text[]);
 CREATE FUNCTION storage.allow_any_operation(ops text[]) RETURNS boolean
 LANGUAGE sql STABLE AS $$
 SELECT COALESCE(current_setting('storage.test_operation',true)=any(ops),false)
 $$;
 `);
 await db.query(roleSql);
 await db.query(blueprint);
 const policies=(await db.query(`
 SELECT policyname,cmd,roles::text[] AS roles FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
 ORDER BY policyname
 `)).rows;
 assert.equal(policies.length,3);
 assert.deepEqual(policies.map(x=>x.policyname),[
  "fiscal_m39_synth_delete","fiscal_m39_synth_insert",
  "fiscal_m39_synth_read"]);
 assert.ok(policies.every(x=>x.roles.length===1&&x.roles[0]==="fiscal_kyb_probe"));
 assert.equal((await db.query(
  "SELECT pg_has_role('authenticator','fiscal_kyb_probe','MEMBER') AS granted"
 )).rows[0].granted,false);

 const runId="123e4567-e89b-42d3-a456-426614174000";
 const otherId="a2a1b6b0-689e-497b-816d-5de594bb89ef";
 const path="__synthetic_m37__/"+runId+"/"+("f".repeat(32))+".bin";
 const otherPath="__synthetic_m37__/"+otherId+"/"+("e".repeat(32))+".bin";
 const claims=(override={})=>JSON.stringify({
  role:"fiscal_kyb_probe",purpose:"fiscal_kyb_synthetic_probe_v1",
  probe_run_id:runId,exp:Math.floor(Date.now()/1000)+300,...override
 });
 async function session(value=claims(),operation="object.get_authenticated"){
  await db.query("SELECT set_config('request.jwt.claims',$1,true)",[value]);
  await db.query("SELECT set_config('storage.test_operation',$1,true)",[operation]);
 }
 async function deniedInsert(bucket,name){
  await db.query("SAVEPOINT m39_denied");
  let denied=false;
  try{
   await db.query("INSERT INTO storage.objects(bucket_id,name,synthetic_marker) VALUES($1,$2,'fake')",[bucket,name]);
  }catch(error){
   denied=true;
   assert.equal(error.code,"42501");
  }
  await db.query("ROLLBACK TO SAVEPOINT m39_denied");
  assert.equal(denied,true,"RLS should reject "+bucket+"/"+name);
 }
 await session();
 await db.query("SET LOCAL ROLE fiscal_kyb_probe");
 await db.query("INSERT INTO storage.objects(bucket_id,name,synthetic_marker) VALUES($1,$2,'fake')",["fiscal-kyb-quarantine",path]);
 assert.equal((await db.query("SELECT name FROM storage.objects")).rowCount,1);
 await deniedInsert("another-bucket",path);
 await deniedInsert("fiscal-kyb-quarantine",otherPath);
 await deniedInsert("fiscal-kyb-quarantine","customer/identity.pdf");
 await session(claims({purpose:"real_document"}));
 await deniedInsert("fiscal-kyb-quarantine",path);
 await session(claims({exp:Math.floor(Date.now()/1000)-1}));
 await deniedInsert("fiscal-kyb-quarantine",path);
 await session(claims({probe_run_id:otherId}));
 assert.equal((await db.query("SELECT name FROM storage.objects")).rowCount,0);
 await session(claims(),"object.list");
 assert.equal((await db.query("SELECT name FROM storage.objects")).rowCount,0);
 await session(claims(),"object.get_authenticated");
 assert.equal((await db.query("SELECT name FROM storage.objects")).rowCount,1);
 await session(claims(),"object.delete");
 assert.equal((await db.query("DELETE FROM storage.objects WHERE name=$1",[path])).rowCount,1);
 await db.query("RESET ROLE");
 assert.equal((await db.query(
  "SELECT count(*)::int AS n FROM storage.objects"
 )).rows[0].n,0);
 const grants=await db.query(`
 SELECT has_table_privilege('fiscal_kyb_probe','storage.objects','UPDATE')
 AS may_update,pg_has_role('authenticator','fiscal_kyb_probe','MEMBER') AS delegated
 `);
 assert.equal(grants.rows[0].may_update,false);
 assert.equal(grants.rows[0].delegated,false);
 console.log("M39 REVIEW-ONLY scoped policy SQL PASS (CI synthetic rollback)");
}finally{
 await db.query("ROLLBACK").catch(()=>undefined);
 await db.end();
}
