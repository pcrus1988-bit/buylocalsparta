import test from "node:test";
import assert from "node:assert/strict";
import {evaluateFiscalMigrationPreflight,FK_INDEXES,FK_LOOKUP_MIGRATION,GUARDED_SECURITY_MIGRATIONS} from "./fiscal-migration-preflight.mjs";
const SHA="a".repeat(64);
const expected=[{name:"0001_fiscal_foundation.sql",sha256:SHA},
 {name:FK_LOOKUP_MIGRATION,sha256:SHA},
 ...GUARDED_SECURITY_MIGRATIONS.map(x=>({name:x.name,sha256:SHA}))];
const fx=(changes={})=>({expected,recorded:[expected[0]],indexes:[],objects:[],...changes});
const allIndexes=FK_INDEXES.map(x=>({indexname:x.name,indexdef:x.definition}));

test("fresh empty database and genuinely unapplied migrations can be prepared",()=>{
 const p=evaluateFiscalMigrationPreflight(fx({recorded:[]}));
 assert.equal(p.safeToStart,true);assert.equal(p.pendingCount,expected.length);
});
test("a ledger marker plus correct physical indexes is consistent",()=>{
 const p=evaluateFiscalMigrationPreflight(fx({recorded:expected.slice(0,2),indexes:allIndexes}));
 assert.equal(p.safeToStart,true);
});
test("production dual ledger: physical indexes but missing internal checksum blocks all writes",()=>{
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({indexes:allIndexes})),
  /FISCAL_M48_EXTERNALLY_APPLIED_FK_MIGRATION/);
});
test("partial foreign-key indexes without ledger also halt migration",()=>{
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({indexes:allIndexes.slice(0,1)})),
  /FISCAL_M48_EXTERNALLY_APPLIED_FK_MIGRATION/);
});
test("colliding index name with changed definition blocks even if ledger has marker",()=>{
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({recorded:expected.slice(0,2),indexes:[{
  indexname:allIndexes[0].indexname,indexdef:allIndexes[0].indexdef.replace("(created_by)","(id)")
 },...allIndexes.slice(1)]})),/FISCAL_M48_INDEX_DEFINITION_DRIFT/);
});
test("tracked index must not silently disappear",()=>{
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({recorded:expected.slice(0,2),indexes:allIndexes.slice(0,6)})),
  /FISCAL_M48_TRACKED_INDEXES_MISSING/);
});
test("security tables appearing before their ledger entries always block",()=>{
 for(const m of GUARDED_SECURITY_MIGRATIONS)
  assert.throws(()=>evaluateFiscalMigrationPreflight(fx({objects:[m.table]})),
   /FISCAL_M48_EXTERNALLY_APPLIED_SECURITY_SCHEMA/);
});
test("security ledger entries without actual tables also block",()=>{
 for(const m of GUARDED_SECURITY_MIGRATIONS)
  assert.throws(()=>evaluateFiscalMigrationPreflight(fx({recorded:[expected[0],{name:m.name,sha256:SHA}]})),
   /FISCAL_M48_TRACKED_SECURITY_SCHEMA_MISSING/);
});
test("all tracked physical security tables are internally consistent",()=>{
 const p=evaluateFiscalMigrationPreflight(fx({recorded:expected,indexes:allIndexes,
  objects:GUARDED_SECURITY_MIGRATIONS.map(x=>x.table)}));
 assert.equal(p.safeToStart,true);assert.equal(p.pendingCount,0);
});
test("modified checksums or unexpected migration markers are denied before writes",()=>{
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({recorded:[{...expected[0],sha256:"b".repeat(64)}]})),
 /FISCAL_M48_CHECKSUM_OR_UNKNOWN_MIGRATION/);
 assert.throws(()=>evaluateFiscalMigrationPreflight(fx({recorded:[expected[0],{name:"0999_unknown.sql",sha256:SHA}]})),
 /FISCAL_M48_CHECKSUM_OR_UNKNOWN_MIGRATION/);
});