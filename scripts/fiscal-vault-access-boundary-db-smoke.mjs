/**
 * M36 disposable PostgreSQL authorization drill.
 *
 * Operates ONLY against a CI-local fiscal_ci database. Simulates actual
 * table grants plus RLS denying reads/writes to anon/authenticated.
 * It does not touch the hosted Supabase storage catalog or real objects.
 */
import assert from "node:assert/strict";
import pg from "pg";
const connectionString=process.env.FISCAL_DATABASE_URL??"";
let url;
try{url=new URL(connectionString);}catch{throw new Error("M36_LOCAL_CI_ONLY");}
if(process.env.CI!=="true"||
 !["localhost","127.0.0.1","::1"].includes(url.hostname)||
 url.pathname!=="/fiscal_ci"||
 connectionString===process.env.DATABASE_URL)
 throw new Error("M36_LOCAL_CI_ONLY");

const db=new pg.Client({connectionString,connectionTimeoutMillis:5000});
await db.connect();
try{
 await db.query("BEGIN");
 await db.query("CREATE ROLE m36_anon NOLOGIN NOBYPASSRLS");
 await db.query("CREATE ROLE m36_authenticated NOLOGIN NOBYPASSRLS");
 await db.query("CREATE SCHEMA m36_storage");
 await db.query(`
  CREATE TABLE m36_storage.synthetic_objects(
   id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
   bucket_id text NOT NULL, marker text NOT NULL
  );
 `);
 await db.query(
  "INSERT INTO m36_storage.synthetic_objects(bucket_id,marker) VALUES('fiscal-kyb-quarantine','synthetic-no-pii')");
 await db.query("ALTER TABLE m36_storage.synthetic_objects ENABLE ROW LEVEL SECURITY");
 await db.query("GRANT USAGE ON SCHEMA m36_storage TO m36_anon,m36_authenticated");
 await db.query("GRANT SELECT,INSERT,DELETE ON m36_storage.synthetic_objects TO m36_anon,m36_authenticated");
 for(const role of ["m36_anon","m36_authenticated"]){
  await db.query("SET LOCAL ROLE "+role);
  const selected=await db.query("SELECT marker FROM m36_storage.synthetic_objects");
  assert.equal(selected.rows.length,0,role+" must not read under RLS");
  await db.query("SAVEPOINT m36_write_denied");
  let denied=false;
  try{
   await db.query(
    "INSERT INTO m36_storage.synthetic_objects(bucket_id,marker) VALUES('fiscal-kyb-quarantine','blocked')");
  }catch(error){
   denied=true;
   assert.equal(error.code,"42501","denial must be due to RLS");
  }
  assert.equal(denied,true,"RLS must reject INSERT under table grants");
  await db.query("ROLLBACK TO SAVEPOINT m36_write_denied");
  await db.query("RESET ROLE");
 }
 const privileged=await db.query("SELECT count(*)::int AS n FROM m36_storage.synthetic_objects");
 assert.equal(privileged.rows[0].n,1,"fixture remains unchanged");
 console.log("M36 storage RLS authorization drill PASS (disposable CI rollback)");
}finally{
 await db.query("ROLLBACK").catch(()=>undefined);
 await db.end();
}
