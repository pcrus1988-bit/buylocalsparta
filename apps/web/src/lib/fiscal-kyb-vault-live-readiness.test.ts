import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 evaluateFiscalVaultCatalog,FISCAL_VAULT_CIPHERTEXT_LIMIT,
 FISCAL_VAULT_QUARANTINE_BUCKET,
 FISCAL_VAULT_BUCKET_SQL,FISCAL_VAULT_CATALOG_SQL,
 FISCAL_VAULT_POLICY_COUNT_SQL,FISCAL_VAULT_OBJECT_COUNT_SQL
} from "./fiscal-kyb-vault-live-readiness.ts";

const catalog={has_buckets:true,has_objects:true,objects_rls_enabled:true};
const bucket={
 is_public:false,file_size_limit:String(FISCAL_VAULT_CIPHERTEXT_LIMIT),
 allowed_mime_types:["application/octet-stream"]
};
const clean=()=>evaluateFiscalVaultCatalog(catalog,bucket,{policy_count:0},{item_count:0});

test("M34 never infers approval or document access from private storage configuration",()=>{
 const result=clean();
 assert.equal(FISCAL_VAULT_QUARANTINE_BUCKET,"fiscal-kyb-quarantine");
 assert.equal(result.status,"configured_unverified");
 assert.equal(result.configurationMatchesPlan,true);
 for(const field of [
  "storageExternallyVerified","managedKmsVerified","independentScannerVerified",
  "immutableAuditVerified","lawfulRetentionVerified",
  "acceptingUploads","acceptingBytes","canReadDocuments","legalIssuanceEnabled"
 ] as const)assert.equal(result[field],false,field);
 assert.ok(Object.isFrozen(result));
});

test("M34 unprovisioned/unreachable database is not reported as operational",()=>{
 for(const input of [
  [null,null,null,null],
  [{has_buckets:false,has_objects:false,objects_rls_enabled:false},null,null,null],
  [{...catalog,has_objects:false},null,null,null]
 ] as const){
  const x=evaluateFiscalVaultCatalog(...input);
  assert.equal(x.status,"unavailable");
  assert.equal(x.acceptingUploads,false);
 }
 const missing=evaluateFiscalVaultCatalog(catalog,null,{policy_count:0},{item_count:0});
 assert.equal(missing.status,"not_provisioned");
 assert.equal(missing.configurationMatchesPlan,false);
});

test("M34 rejects public buckets, missing object RLS, unsafe policies and unexpected objects",()=>{
 const bad=[
  [{...bucket,is_public:true},catalog,{policy_count:0},{item_count:0}],
  [bucket,{...catalog,objects_rls_enabled:false},{policy_count:0},{item_count:0}],
  [bucket,catalog,{policy_count:1},{item_count:0}],
  [bucket,catalog,{policy_count:0},{item_count:1}],
  [{...bucket,allowed_mime_types:null},catalog,{policy_count:0},{item_count:0}],
  [{...bucket,allowed_mime_types:["application/pdf"]},catalog,{policy_count:0},{item_count:0}],
  [{...bucket,allowed_mime_types:["application/octet-stream","application/pdf"]},
   catalog,{policy_count:0},{item_count:0}],
  [{...bucket,file_size_limit:null},catalog,{policy_count:0},{item_count:0}],
  [{...bucket,file_size_limit:"5242880"},catalog,{policy_count:0},{item_count:0}]
 ] as const;
 for(const [b,c,p,n] of bad){
  const r=evaluateFiscalVaultCatalog(c,b,p,n);
  assert.equal(r.status,"unsafe_configuration");
  assert.equal(r.configurationMatchesPlan,false);
  assert.equal(r.acceptingUploads,false);
  assert.equal(r.canReadDocuments,false);
 }
});

test("M34 SQL is read-only and looks only at exact private quarantine bucket",()=>{
 assert.match(FISCAL_VAULT_CATALOG_SQL,/to_regclass\('storage\.buckets'\)/);
 assert.match(FISCAL_VAULT_BUCKET_SQL,/FROM storage\.buckets WHERE id=\$1 LIMIT 1/);
 assert.match(FISCAL_VAULT_OBJECT_COUNT_SQL,/FROM storage\.objects WHERE bucket_id=\$1/);
 assert.match(FISCAL_VAULT_POLICY_COUNT_SQL,/FROM pg_policies/);
 const code=[
  FISCAL_VAULT_CATALOG_SQL,FISCAL_VAULT_BUCKET_SQL,
  FISCAL_VAULT_POLICY_COUNT_SQL,FISCAL_VAULT_OBJECT_COUNT_SQL
 ].join(" ");
 assert.ok(!/\b(insert|update|delete|alter|create|drop|grant|revoke)\s+(table|from|into|schema|policy|bucket)/i.test(code));
 const file=readFileSync(new URL("./fiscal-kyb-vault-live-readiness.ts",
  import.meta.url),"utf8");
 assert.ok(!/createSignedUrl\s*\(|createBucket\s*\(|upload\s*\(|S3Client|FormData|service_role/i.test(file));
});
