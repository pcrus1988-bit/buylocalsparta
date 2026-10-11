import assert from "node:assert/strict";
import {test} from "node:test";
import {
 createFiscalMfaSecret,decryptFiscalMfaSecret,encryptFiscalMfaSecret,
 fiscalMfaBase32,fiscalMfaBase32Decode,fiscalTotp,fiscalTotpUri,verifyFiscalTotp
} from "./fiscal-operator-mfa-crypto.ts";
test("TOTP implements RFC6238 SHA-1 vector and bounded clock drift",()=>{
 const secret=fiscalMfaBase32(Buffer.from("12345678901234567890","ascii"));
 assert.equal(secret,"GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
 assert.equal(fiscalTotp(secret,1),"287082");
 assert.equal(verifyFiscalTotp(secret,"287082",59000,-1),1);
 assert.equal(verifyFiscalTotp(secret,"287082",59000,1),null,"Do not reuse accepted time step");
 assert.equal(verifyFiscalTotp(secret,"287082",59000,2),null);
 assert.equal(verifyFiscalTotp(secret,"not six digits",59000,-1),null);
 assert.equal(verifyFiscalTotp(secret,"287082",200000,-1),null,"Reject stale proof");
});
test("MFA secrets are random and AES-GCM bound to the exact authenticated actor",()=>{
 const a=createFiscalMfaSecret(),b=createFiscalMfaSecret();
 assert.notEqual(a,b);assert.equal(fiscalMfaBase32Decode(a).length,20);
 const key="c1".repeat(32),other="11".repeat(32);
 const encrypted=encryptFiscalMfaSecret(a,"marketplace_super_admin:test-operator-123",key);
 assert.ok(encrypted.startsWith("v1:"));assert.ok(!encrypted.includes(a));
 assert.equal(decryptFiscalMfaSecret(encrypted,"marketplace_super_admin:test-operator-123",key),a);
 assert.throws(()=>decryptFiscalMfaSecret(encrypted,"marketplace_super_admin:other-operator",key));
 assert.throws(()=>decryptFiscalMfaSecret(encrypted,"marketplace_super_admin:test-operator-123",other));
 assert.throws(()=>encryptFiscalMfaSecret(a,"fiscal_admin:owner","not-a-key"),/MFA_ENCRYPTION_KEY_INVALID/);
});
test("Authenticator URI declares secure local TOTP issuer and never a web callback",()=>{
 const secret=createFiscalMfaSecret();
 const uri=fiscalTotpUri(secret,"operator@example.test");
 assert.ok(uri.startsWith("otpauth://totp/"));
 assert.ok(uri.includes("secret="+secret));
 assert.ok(uri.includes("digits=6&period=30"));
 assert.ok(!uri.includes("https://"));
});
