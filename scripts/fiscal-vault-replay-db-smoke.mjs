/**
 * M42: real PostgreSQL uniqueness/atomicity authorization test.
 * Executes REVIEW_ONLY DDL exclusively in disposable, local fiscal_ci.
 * Never connects to the production FISCAL or marketplace database.
 */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import pg from "pg";

const url=process.env.FISCAL_DATABASE_URL??"";
let parsed;
try{parsed=new URL(url);}catch{throw Error("M42_CI_LOCAL_ONLY");}
if(process.env.CI!=="true"||
 !["localhost","127.0.0.1","::1"].includes(parsed.hostname)||
 parsed.pathname!=="/fiscal_ci"||
 url===process.env.DATABASE_URL)throw Error("M42_CI_LOCAL_ONLY");

const ddl=readFileSync(new URL(
 "../fiscal/security/m42_synthetic_probe_replay_REVIEW_ONLY.sql",import.meta.url),
 "utf8");
assert.ok(ddl.includes("REVIEW ONLY")&&
 ddl.includes("FORCE ROW LEVEL SECURITY"));
const create=()=>new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
const db=create();
const clients=[];
let created=false;
await db.connect();
try{
 assert.equal((await db.query(
  "SELECT to_regclass('public.fiscal_synthetic_probe_replay') AS t"
 )).rows[0].t,null,"M42 table must not already exist");
 await db.query(ddl);
 created=true;
 const metadata=(await db.query(`
 SELECT c.relrowsecurity AS rls,c.relforcerowsecurity AS forced,
  (SELECT count(*)::int FROM pg_policies
   WHERE schemaname='public' AND tablename='fiscal_synthetic_probe_replay')
  AS policies
 FROM pg_class c
 WHERE c.oid='public.fiscal_synthetic_probe_replay'::regclass
 `)).rows[0];
 assert.deepEqual(metadata,{rls:true,forced:true,policies:0});
 const insert=`
 INSERT INTO public.fiscal_synthetic_probe_replay
  (token_id,run_id,expires_at)
 VALUES ($1::uuid,$2::uuid,to_timestamp($3::double precision))
 ON CONFLICT DO NOTHING RETURNING token_id
 `;
 const token="d419369c-0db9-4c27-a1af-1387e472a250";
 const run="36743d38-62bc-4f59-a40f-62a18f64ae92";
 const other="7649d88d-a3e4-43ba-8528-5e9cf4a91fe9";
 const validExp=Math.floor(Date.now()/1000)+120;
 for(let i=0;i<6;i++){
  const client=create();await client.connect();clients.push(client);
 }
 const racing=await Promise.all(clients.map(client=>
  client.query(insert,[token,run,validExp])));
 assert.deepEqual(racing.map(x=>x.rowCount).sort(),[0,0,0,0,0,1]);
 assert.equal((await db.query(insert,[other,run,validExp])).rowCount,0,
  "a second token cannot start the same run");
 assert.equal((await db.query(insert,[token,other,validExp])).rowCount,0,
  "same token cannot start another run");
 assert.equal((await db.query(
  "SELECT count(*)::int AS n FROM public.fiscal_synthetic_probe_replay"
 )).rows[0].n,1);
 // No resurrection after a TTL. Redemption persists across expiry.
 await assert.rejects(()=>db.query(insert,[
  "26d16eb3-95c8-4ca8-b7ce-91356be91c64",other,
  Math.floor(Date.now()/1000)-5
 ]),e=>e.code==="23514");
 await assert.rejects(()=>db.query(insert,[
  "26d16eb3-95c8-4ca8-b7ce-91356be91c64",other,
  Math.floor(Date.now()/1000)+600
 ]),e=>e.code==="23514");
 // Unprivileged authenticated clients cannot write or inspect leases.
 await db.query(`
 DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
  CREATE ROLE anon NOLOGIN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
  CREATE ROLE authenticated NOLOGIN;
 END IF;
 END $$;
 `);
 const limited=create();await limited.connect();clients.push(limited);
 for(const role of ["anon","authenticated"]){
  await limited.query("SET ROLE "+role);
  await assert.rejects(()=>limited.query(insert,[
   "26d16eb3-95c8-4ca8-b7ce-91356be91c64",other,validExp
  ]),e=>e.code==="42501");
  await assert.rejects(()=>limited.query(
   "SELECT * FROM public.fiscal_synthetic_probe_replay"
  ),e=>e.code==="42501");
  await limited.query("RESET ROLE");
 }
 console.log("M42 disposable PostgreSQL replay constraints: PASS");
}finally{
 for(const client of clients)await client.end().catch(()=>undefined);
 if(created)await db.query(
  "DROP TABLE IF EXISTS public.fiscal_synthetic_probe_replay"
 ).catch(()=>undefined);
 await db.end();
}
