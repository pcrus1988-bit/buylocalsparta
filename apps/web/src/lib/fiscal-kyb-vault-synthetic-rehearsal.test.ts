import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {
 runFiscalKybSyntheticRehearsal
} from "./fiscal-kyb-vault-synthetic-rehearsal.ts";

test("M35 synthetic quarantine performs the eight security checks",()=>{
 const result=runFiscalKybSyntheticRehearsal();
 assert.equal(result.status,"passed");
 assert.equal(result.checksPassed,8);
 assert.equal(result.checksTotal,8);
 assert.equal(result.syntheticOnly,true);
 assert.ok(Object.isFrozen(result));
});

test("M35 never promotes a passing rehearsal to real storage, scan or issuer authorization",()=>{
 for(let i=0;i<20;i++){
  const r=runFiscalKybSyntheticRehearsal();
  assert.equal(r.status,"passed");
  for(const field of [
   "actualBucketTouched","realDocumentAccepted","realScannerUsed",
   "actualKmsUsed","externallyAnchoredAudit","independentLegalApproval",
   "uploadAuthorized","signedDownloadIssued","realDeletionVerified",
   "legalFiscalIssuanceEnabled"
  ] as const)assert.equal(r[field],false,field);
  assert.equal(JSON.stringify(r).includes("BEGIN PRIVATE KEY"),false);
  assert.equal(JSON.stringify(r).includes("M35 SYNTHETIC"),false);
  assert.equal(JSON.stringify(r).includes("ciphertext"),false);
 }
});

test("M35 synthetic verifier cannot accept user-controlled bytes, URLs or secret configuration",()=>{
 const source=readFileSync(
  new URL("./fiscal-kyb-vault-synthetic-rehearsal.ts",import.meta.url),
  "utf8");
 assert.match(source,/export function runFiscalKybSyntheticRehearsal\(\)/);
 assert.ok(!/\bfetch\s*\(|\bS3Client\b|createBucket\s*\(|signedUrl\s*\(|storage\.from\s*\(|process\.env|readFileSync|writeFileSync|FormData|\.putObject\s*\(/.test(source));
 const operator=readFileSync(new URL(
  "../app/timologio-admin/kyb-intake-readiness/page.tsx",
  import.meta.url),"utf8");
 assert.match(operator,/await fiscalAdminActor\(\)/);
 assert.match(operator,/isFiscalMfaSatisfied\(actor\)/);
 assert.ok(!/type="file"|onSubmit|FormData|Blob\(|fetch\s*\(/.test(operator));
});
