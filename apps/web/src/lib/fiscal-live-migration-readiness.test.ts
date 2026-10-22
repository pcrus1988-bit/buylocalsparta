import test from "node:test";
import assert from "node:assert/strict";
import {classifyFiscalLiveReadiness} from "./fiscal-live-migration-readiness.ts";
const base=()=>({
 total_migrations:17,
 present_markers:null,
 existing_fk_indexes:[
  "fiscal_api_clients_created_by_idx","fiscal_counterparties_created_by_idx",
  "fiscal_marketplace_challenges_created_by_idx","fiscal_marketplace_links_authorized_by_idx",
  "fiscal_organizations_reviewed_by_idx","fiscal_sandbox_journals_created_by_idx",
  "fiscal_tax_rule_candidates_source_code_idx"
 ],
 active_superadmin_factors:1,fiscal_tables:25,unprotected_tables:0
});
test("M48 live snapshot identifies exact dual-ledger discrepancy without reading merchant data",()=>{
 const result=classifyFiscalLiveReadiness(base());
 assert.equal(result.verified,true);
 assert.equal(result.migrationCount,17);
 assert.equal(result.missingKnownMigrations.length,5);
 assert.equal(result.fkIndexDrift,true);
 assert.equal(result.fkInstalledIndexes,7);
 assert.equal(result.activeSuperAdminFactors,1);
 assert.equal(result.unprotectedTables,0);
 assert.equal(result.productionBackupRestoredAndVerified,false);
 assert.equal(result.issuanceAuthorized,false);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(Object.isFrozen(result.missingKnownMigrations),true);
});
test("all tracked special markers can be observed without granting issuance",()=>{
 const input={...base(),total_migrations:22,present_markers:[
  "0014_fk_lookup_indexes.sql","0018_governed_mfa_recovery.sql",
  "0019_security_alert_outbox.sql","0020_security_alert_delivery_receipts.sql",
  "0021_security_alert_reconciliation.sql"
 ]};
 const result=classifyFiscalLiveReadiness(input);
 assert.equal(result.missingKnownMigrations.length,0);
 assert.equal(result.fkIndexDrift,false);
 assert.equal(result.productionBackupRestoredAndVerified,false);
 assert.equal(result.issuanceAuthorized,false);
});
test("absent SQL row or malformed statistics fail closed instead of creating false readiness",()=>{
 for(const input of [null,{...base(),unprotected_tables:-1},
  {...base(),total_migrations:NaN},
  {...base(),fiscal_tables:5,unprotected_tables:25},
  {...base(),present_markers:["unrecognized.sql"]},
  {...base(),existing_fk_indexes:["unknown_index"]}]){
  const result=classifyFiscalLiveReadiness(input);
  assert.equal(result.verified,false);
  assert.equal(result.fkIndexDrift,true);
  assert.equal(result.productionBackupRestoredAndVerified,false);
 }
});
test("empty arrays from PostgreSQL aggregate NULL remain a valid 'not applied' state",()=>{
 const result=classifyFiscalLiveReadiness({...base(),total_migrations:1,existing_fk_indexes:null});
 assert.equal(result.verified,true);
 assert.equal(result.fkInstalledIndexes,0);
 assert.equal(result.fkIndexDrift,false);
});