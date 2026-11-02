import test from "node:test";
import assert from "node:assert/strict";
import {FK_INDEXES} from "./fiscal-migration-preflight.mjs";
import {
 FISCAL_PROJECT_REF,ORIGINAL_INDEX_HISTORY,validateRestoreParityContext,
 compareFiscalRestoreMetadata,readFiscalRestoreMetadata
} from "./fiscal-restore-parity.mjs";

const S="postgresql://postgres."+FISCAL_PROJECT_REF+":example@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require";
const R="postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:example@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require";
const M="postgresql://postgres.aaaaaaaaaaaaaaaaaaaa:example@aws-0-eu-central-1.pooler.supabase.com:6543/postgres";
const configuration=()=>({sourceUrl:S,targetUrl:R,targetProjectRef:"zzzzzzzzzzzzzzzzzzzz",mode:"metadata-read-only",marketplaceUrls:[M]});
const state=()=>({
 ledger:Array.from({length:17},(_,i)=>({name:String(i+1).padStart(4,"0")+"_test_migration.sql",sha256:String(i+1).padStart(64,"a")})),
 tables:Array.from({length:25},(_,i)=>({name:"fiscal_test_table_"+i,rls:true})),
 indexes:FK_INDEXES.map(x=>({indexname:x.name,indexdef:x.definition})),
 history:[{...ORIGINAL_INDEX_HISTORY}]
});
test("accepts only FISCAL source, explicit separate target and read-only mode",()=>{
 const v=validateRestoreParityContext(configuration());
 assert.equal(v.sourceProjectRef,FISCAL_PROJECT_REF);
 assert.equal(v.restoreTargetProjectRef,"zzzzzzzzzzzzzzzzzzzz");
 assert.ok(!JSON.stringify(v).includes("example"));
 for(const cfg of [
  {mode:"restore"},{targetProjectRef:FISCAL_PROJECT_REF},{targetProjectRef:"a".repeat(20)},
  {targetUrl:S},{sourceUrl:R},{marketplaceUrls:[R]},{marketplaceUrls:[S]},
  {sourceUrl:S.replace("postgres."+FISCAL_PROJECT_REF,"postgres.aaaaaaaaaaaaaaaaaaaa")},
  {sourceUrl:S.replace("postgres."+FISCAL_PROJECT_REF,"postgres."+FISCAL_PROJECT_REF+"\n")},
  {sourceUrl:"postgresql://operator@example.com/postgres"},
  {targetUrl:"postgresql://postgres."+FISCAL_PROJECT_REF+":example@other-host.example/postgres"},
  {targetUrl:"postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:example@evil.example/postgres"},
  {sourceUrl:S.replace("sslmode=require","sslmode=disable")}
 ])assert.throws(()=>validateRestoreParityContext({...configuration(),...cfg}),/FISCAL_M51_/);
});
test("queries metadata only in bounded read-only repeatable-read transaction",async()=>{
 const s=state(),returned=[{rows:s.ledger},{rows:s.tables},{rows:s.indexes},{rows:s.history}],calls=[];
 const client={query:async (sql,params)=>{
  calls.push({sql,params});
  if(sql.startsWith("SELECT "))return returned.shift();
  return {rows:[]};
 }};
 assert.deepEqual(await readFiscalRestoreMetadata(client),s);
 assert.ok(calls[0].sql.endsWith("READ ONLY"));
 assert.equal(calls.at(-1).sql,"COMMIT");
 assert.equal(calls.filter(x=>x.sql.startsWith("SELECT ")).length,4);
 assert.ok(calls.every(x=>/^(BEGIN|SET|SELECT|COMMIT)$/.test(x.sql.split(" ")[0])));
});
test("query error rolls back and never commits",async()=>{
 const calls=[],client={query:async sql=>{
  calls.push(sql);
  if(sql.startsWith("SELECT"))throw new Error("test SQL failure");
  return {rows:[]};
 }};
 await assert.rejects(()=>readFiscalRestoreMetadata(client),/test SQL failure/);
 assert.equal(calls.at(-1),"ROLLBACK");
 assert.ok(!calls.includes("COMMIT"));
});
test("matching catalogs prove only structural parity, never backup recovery or issuance",()=>{
 const result=compareFiscalRestoreMetadata(state(),state());
 assert.equal(result.independentRestoreTargetStructuralParity,true);
 assert.equal(result.originalIndexLedgerReconciliationPending,true);
 assert.equal(result.originalFkIndexesVerified,7);
 assert.equal(result.migrationEntriesCompared,17);
 for(const field of ["restoredProductionBackupVerified","restoredDataIntegrityVerified",
  "backupProvenanceVerified","productionMigrationWritesAuthorized","statutoryIssuanceAuthorized"])
  assert.equal(result[field],false);
 assert.equal(result.restoredProductionBackupId,null);
 assert.ok(Object.isFrozen(result));
});
test("missing ledger, hash, table, RLS, index or historic marker fails closed",()=>{
 const changes=[
  s=>{s.ledger.pop();},
  s=>{s.ledger[0].sha256="f".repeat(64);},
  s=>{s.tables.pop();},
  s=>{s.tables[0].rls=false;},
  s=>{s.indexes[0].indexdef+=" INCLUDE (foo)";},
  s=>{s.history=[];},
  s=>{s.ledger.push({...s.ledger[0]});},
  s=>{s.indexes.push({...s.indexes[0]});},
  s=>{s.tables[0].name="other_private_table";}
 ];
 for(const change of changes){
  const modified=state();change(modified);
  assert.throws(()=>compareFiscalRestoreMetadata(state(),modified),/FISCAL_M51_/);
 }
});
