import test from "node:test";
import assert from "node:assert/strict";
import {classifyFiscalMigrations,fiscalDatabaseIdentity,refuseSharedFiscalDatabase} from "./fiscal-migration-readiness.mjs";
const digest="a".repeat(64);
const migrations=["0017_operator_mfa_stepup.sql","0018_governed_mfa_recovery.sql","0019_security_alert_outbox.sql","0020_security_alert_delivery_receipts.sql","0021_security_alert_reconciliation.sql"].map(name=>({name,sha256:digest}));
test("M46 compares exact file hashes and reports unapplied FISCAL 0018-0021",()=>{
 const result=classifyFiscalMigrations(migrations,[migrations[0]]);
 assert.equal(result.applied,1);
 assert.deepEqual(result.pending,migrations.slice(1).map(x=>x.name));
 assert.equal(result.drift,false);
 assert.equal(result.current,false);
 assert.equal(Object.isFrozen(result.pending),true);
});
test("detects changed migrations and unexpected database versions independently",()=>{
 const result=classifyFiscalMigrations(migrations,[
  {...migrations[0],sha256:"b".repeat(64)},
  {name:"0099_unknown.sql",sha256:digest}
 ]);
 assert.deepEqual(result.mismatched,[migrations[0].name]);
 assert.deepEqual(result.unexpected,["0099_unknown.sql"]);
 assert.equal(result.drift,true);
});
test("rejects duplicate migration identities or malformed hashes",()=>{
 assert.throws(()=>classifyFiscalMigrations([...migrations,migrations[0]],[]),/FISCAL_INVALID_LOCAL_MIGRATION/);
 assert.throws(()=>classifyFiscalMigrations([{...migrations[0],sha256:"no"}],[]),/FISCAL_INVALID_LOCAL_MIGRATION/);
 assert.throws(()=>classifyFiscalMigrations(migrations,[migrations[0],migrations[0]]),/FISCAL_INVALID_MIGRATION_LEDGER/);
});
test("require an independent actual PostgreSQL database target",()=>{
 const fiscal="postgresql://fiscal:pw@EU-db.example:5432/fiscal";
 assert.equal(fiscalDatabaseIdentity(fiscal),"eu-db.example|5432|/fiscal");
 assert.throws(()=>refuseSharedFiscalDatabase(fiscal,["postgres://another:secret@eu-db.example/fiscal"]),/FISCAL_DATABASE_MUST_BE_INDEPENDENT/);
 assert.doesNotThrow(()=>refuseSharedFiscalDatabase(fiscal,["postgres://another:secret@eu-db.example/marketplace"]));
 assert.throws(()=>fiscalDatabaseIdentity("https://example.org/not-a-database"),/FISCAL_INVALID_DATABASE_TARGET/);
});
test("all matching migrations are current and immutable",()=>{
 const result=classifyFiscalMigrations(migrations,migrations);
 assert.equal(result.current,true);
 assert.equal(result.drift,false);
 assert.equal(result.applied,5);
 assert.deepEqual(result.pending,[]);
});