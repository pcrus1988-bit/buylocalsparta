/** M48 disposable PostgreSQL dual-ledger check. No production use. */
import assert from "node:assert/strict";
import {resolve} from "node:path";
import pg from "pg";
import {inspectFiscalMigrationFiles} from "./fiscal-migration-readiness.mjs";
import {assertSafeFiscalMigrationPreflight,FK_LOOKUP_MIGRATION} from "./fiscal-migration-preflight.mjs";

const url=process.env.FISCAL_DATABASE_URL;
let parsed;
try{parsed=new URL(url??"");}catch{throw new Error("FISCAL_M48_CI_ONLY");}
if(process.env.CI!=="true"||
  !["localhost","127.0.0.1","::1"].includes(parsed.hostname)||
  parsed.pathname!=="/fiscal_ci"||parsed.username!=="fiscal_ci")
 throw new Error("FISCAL_M48_CI_ONLY");

const db=new pg.Client({connectionString:url,connectionTimeoutMillis:5000});
let inTx=false;
try{
 await db.connect();
 const expected=await inspectFiscalMigrationFiles(resolve("fiscal/migrations"));
 const before=await assertSafeFiscalMigrationPreflight(db,expected);
 assert.equal(before.safeToStart,true);
 assert.equal(before.pendingCount,0);
 // Only a disposable CI transaction: temporarily hide the known duplicate
 // marker while leaving its physical indexes intact. Roll back absolutely.
 await db.query("BEGIN");inTx=true;
 const removed=await db.query("DELETE FROM public.fiscal_schema_migrations WHERE name=$1",
  [FK_LOOKUP_MIGRATION]);
 assert.equal(removed.rowCount,1);
 await assert.rejects(
  ()=>assertSafeFiscalMigrationPreflight(db,expected),
  /FISCAL_M48_EXTERNALLY_APPLIED_FK_MIGRATION/);
 await db.query("ROLLBACK");inTx=false;
 const after=await assertSafeFiscalMigrationPreflight(db,expected);
 assert.equal(after.safeToStart,true);
 assert.equal(after.pendingCount,0);
 console.log("FISCAL_M48_CI_LEDGER_COLLISION_REFUSED_AND_ROLLED_BACK");
}finally{
 if(inTx)await db.query("ROLLBACK").catch(()=>{});
 await db.end().catch(()=>{});
}