/** M49: independent synthetic DDL-history proof using disposable PG17 only. */
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {resolve} from "node:path";
import pg from "pg";
import {inspectFiscal0014Evidence,HISTORY_VERSION,HISTORY_NAME} from "./fiscal-0014-provenance.mjs";
import {FK_LOOKUP_MIGRATION} from "./fiscal-migration-preflight.mjs";
const url=process.env.FISCAL_DATABASE_URL;
let target;
try{target=new URL(url??"");}catch{throw Error("FISCAL_M49_CI_ONLY");}
if(process.env.CI!=="true" || process.env.FISCAL_HISTORY_TEST_MODE!=="synthetic" ||
   !["localhost","127.0.0.1","::1"].includes(target.hostname) ||
   target.pathname!=="/fiscal_ci" || target.username!=="fiscal_ci" || !target.password)
 throw Error("FISCAL_M49_CI_ONLY");
const localSource=await readFile(resolve("fiscal/migrations",FK_LOOKUP_MIGRATION),"utf8");
const recordedDdl=localSource.replace(/--[^\r\n]*/g,"")
 .replace(/(?:^|\n)BEGIN;\s*/i,"").replace(/\s*COMMIT;\s*$/i,"").trim();
const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
let inTx=false;
try{
 await db.connect();await db.query("BEGIN");inTx=true;
 // Supabase migration catalog fixture exists only inside this transaction.
 await db.query("CREATE SCHEMA supabase_migrations");
 await db.query("CREATE TABLE supabase_migrations.schema_migrations(version text PRIMARY KEY,name text,statements text[])");
 await db.query("INSERT INTO supabase_migrations.schema_migrations(version,name,statements) VALUES($1,$2,$3::text[])",
  [HISTORY_VERSION,HISTORY_NAME,[recordedDdl]]);
 const tracked=await inspectFiscal0014Evidence(db,localSource);
 assert.equal(tracked.internalLedgerMarkerPresent,true);
 assert.equal(tracked.physicalIndexesMatch,true);
 const deleted=await db.query("DELETE FROM public.fiscal_schema_migrations WHERE name=$1",
  [FK_LOOKUP_MIGRATION]);
 assert.equal(deleted.rowCount,1);
 const untracked=await inspectFiscal0014Evidence(db,localSource);
 assert.equal(untracked.supabaseHistoryMatchesSource,true);
 assert.equal(untracked.reconciliationRequired,true);
 assert.equal(untracked.authorizedToChangeDatabase,false);
 assert.equal(untracked.verifiedProductionBackupRestore,false);
 // A source-history mismatch must reject even when the physical indexes match.
 await db.query("UPDATE supabase_migrations.schema_migrations SET statements=$1::text[] WHERE version=$2",
  [[recordedDdl.replace("created_by","something_else")],HISTORY_VERSION]);
 await assert.rejects(()=>inspectFiscal0014Evidence(db,localSource),/FISCAL_M49_/);
 await db.query("ROLLBACK");inTx=false;
 console.log("FISCAL_M49_SYNTHETIC_DDL_PROVENANCE_AND_ROLLBACK_VERIFIED");
}finally{
 if(inTx)await db.query("ROLLBACK").catch(()=>{});
 await db.end().catch(()=>{});
}
