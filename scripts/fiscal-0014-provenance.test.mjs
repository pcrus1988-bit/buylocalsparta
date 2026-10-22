import test from "node:test";
import assert from "node:assert/strict";
import {canonicalIndexStatements,evaluateFiscal0014Evidence,HISTORY_NAME,HISTORY_VERSION} from "./fiscal-0014-provenance.mjs";
import {FK_INDEXES,FK_LOOKUP_MIGRATION} from "./fiscal-migration-preflight.mjs";
import {createHash} from "node:crypto";

const sql=FK_INDEXES.map(x=>x.definition.replace("CREATE INDEX ","CREATE INDEX IF NOT EXISTS ")
  .replace(" USING btree "," ")).join(";\n")+";";
const localSource="-- original migration\nBEGIN;\n"+sql+"\nCOMMIT;\n";
const sha=createHash("sha256").update(localSource).digest("hex");
const indexRows=FK_INDEXES.map(x=>({indexname:x.name,indexdef:x.definition}));
const historyRows=[{version:HISTORY_VERSION,name:HISTORY_NAME,statements:[sql]}];
const inputs=(diff={})=>({localSource,historyRows,indexRows,internalLedgerRows:[],...diff});

test("seven historically recorded indexes exactly match their repo SQL and physical definitions",()=>{
 const r=evaluateFiscal0014Evidence(inputs());
 assert.equal(r.supabaseHistoryMatchesSource,true);
 assert.equal(r.indexedOperationsVerified,7);
 assert.equal(r.physicalIndexesMatch,true);
 assert.equal(r.reconciliationRequired,true);
 assert.equal(r.verifiedProductionBackupRestore,false);
 assert.equal(r.authorizedToChangeDatabase,false);
 assert.equal(r.authorizedToIssueFiscalDocuments,false);
 assert.equal(r.checkedInSourceSha256,sha);
 assert.ok(Object.isFrozen(r));
});
test("reconciled ledger marker requires checksum of the exact local file",()=>{
 const r=evaluateFiscal0014Evidence(inputs({internalLedgerRows:[
  {name:FK_LOOKUP_MIGRATION,sha256:sha}]}));
 assert.equal(r.internalLedgerMarkerPresent,true);
 assert.equal(r.reconciliationRequired,false);
});
test("reordered whitespace and comments do not conceal any extra DDL",()=>{
 assert.deepEqual(canonicalIndexStatements(localSource),
  canonicalIndexStatements("\n"+sql.split(";\n").reverse().join(";\n")+";\n"));
 assert.throws(()=>canonicalIndexStatements(localSource+"DELETE FROM fiscal_users;"),
  /FISCAL_M49_WRONG_STATEMENT_COUNT/);
});
test("refuses any altered historical index target, column or index name",()=>{
 for(const altered of [
  sql.replace("created_by","id"),
  sql.replace("public.fiscal_api_clients","public.fiscal_users"),
  sql.replace("fiscal_api_clients_created_by_idx","fiscal_api_clients_created_by_idx2"),
  sql.replace("CREATE INDEX","DROP INDEX"),
 ]){
  assert.throws(()=>evaluateFiscal0014Evidence(inputs({
   historyRows:[{version:HISTORY_VERSION,name:HISTORY_NAME,statements:[altered]}]
  })),/FISCAL_M49_/);
 }
});
test("rejects incomplete, duplicate or modified catalog definitions",()=>{
 for(const value of [
  indexRows.slice(1),
  [indexRows[0],...indexRows.slice(0,-1)],
  [{...indexRows[0],indexdef:indexRows[0].indexdef.replace("(created_by)","(id)")},...indexRows.slice(1)]
 ]){
  assert.throws(()=>evaluateFiscal0014Evidence(inputs({indexRows:value})),/FISCAL_M49_/);
 }
});
test("refuses absent, duplicated or mismatched original migration records",()=>{
 for(const history of [
  [],[historyRows[0],historyRows[0]],
  [{...historyRows[0],name:"not-the-original"}],
  [{...historyRows[0],version:"20261011145705"}],
  [{...historyRows[0],statements:[]}],
  [{...historyRows[0],statements:[sql,sql]}]
 ]){
  assert.throws(()=>evaluateFiscal0014Evidence(inputs({historyRows:history})),
    /FISCAL_M49_HISTORICAL_RECORD_MISSING/);
 }
});
test("tampered local migration or ledger checksum never yields positive evidence",()=>{
 assert.throws(()=>evaluateFiscal0014Evidence(inputs({localSource:localSource.replace("created_by","id")})),
  /FISCAL_M49_/);
 assert.throws(()=>evaluateFiscal0014Evidence(inputs({internalLedgerRows:[{
  name:FK_LOOKUP_MIGRATION,sha256:"f".repeat(64)}]})),/FISCAL_M49_CHECKSUM_DRIFT/);
});
test("rejects arbitrary SQL even if it mentions seven approved names",()=>{
 assert.throws(()=>canonicalIndexStatements(
  FK_INDEXES.map(x=>"CREATE UNIQUE INDEX IF NOT EXISTS "+x.name+" ON public.blah(id);").join("\n")),
 /FISCAL_M49_UNEXPECTED_DDL/);
});
