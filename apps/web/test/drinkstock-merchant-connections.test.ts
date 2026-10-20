import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inspectMollieMerchant,merchantMollieAuthorizationUrl,validGreekTaxNumber,
 MOLLIE_CONNECT_SCOPES,MerchantConnectionError} from "../src/lib/drinkstock-merchant-connections.ts";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
test("Mollie Connect uses consent, the first-party callback, one-use state and merchant scopes",()=>{
 const url=new URL(merchantMollieAuthorizationUrl("app_1234567890123",
  "https://hospitality.kontamou.site/api/hospitality/mollie/callback","x".repeat(43)));
 assert.equal(url.hostname,"my.mollie.com");
 assert.equal(url.searchParams.get("response_type"),"code");
 assert.equal(url.searchParams.get("state"),"x".repeat(43));
 assert.equal(url.searchParams.get("scope"),MOLLIE_CONNECT_SCOPES);
 assert.throws(()=>merchantMollieAuthorizationUrl("app_x","https://evil.example/", "not-random"),MerchantConnectionError);
});
test("Mollie needs its own verified merchant profile and both payment/settlement capabilities",()=>{
 const sample={id:"org_A12",profiles:[{id:"pfl_1234",status:"verified"}],
  capabilities:[{name:"payments",status:"enabled"},{name:"settlements",status:"enabled"}]};
 assert.equal(inspectMollieMerchant(sample).operational,true);
 assert.equal(inspectMollieMerchant({...sample,profiles:[]}).operational,false);
 assert.equal(inspectMollieMerchant({...sample,profiles:[...sample.profiles,...sample.profiles]}).operational,false);
 assert.equal(inspectMollieMerchant({...sample,capabilities:[{name:"payments",status:"enabled"}]}).operational,false);
 assert.equal(inspectMollieMerchant({...sample,capabilities:[{name:"payments",status:"disabled"},{name:"settlements",status:"enabled"}]}).operational,false);
 assert.throws(()=>inspectMollieMerchant({...sample,id:"org_invalid/path"}),MerchantConnectionError);
});
test("Greek AFM checksum catches ordinary typos before vault access",()=>{
 assert.equal(validGreekTaxNumber("123456783"),true);
 assert.equal(validGreekTaxNumber("123456789"),false);
 assert.equal(validGreekTaxNumber("12345678"),false);
});
test("owner-tenant isolation, Vault encryption, callback replay barriers and read-only AADE check",()=>{
 const service=read("../src/lib/drinkstock-merchant-connections.ts");
 const schema=read("../../../db/operations/20261020_drinkstock_merchant_mollie_aade_connections.sql");
 const aade=read("../src/app/api/hospitality/partners/[partnerId]/aade/connect/route.ts");
 assert.match(service,/role!=="owner"/);
 assert.match(service,/state_sha256=\$1 AND consumed_at IS NULL AND expires_at>now\(\) FOR UPDATE/);
 assert.match(service,/vault\.create_secret/);
 assert.match(service,/vault\.update_secret/);
 assert.match(service,/GET|requestTransmittedDocs/);
 assert.doesNotMatch(service,/sendInvoices\(/);
 assert.match(aade,/assertCustomerCsrf/);
 assert.match(aade,/get\("origin"\)/);
 assert.match(schema,/ENABLE ROW LEVEL SECURITY/);
 assert.match(schema,/REVOKE ALL ON public\.drinkstock_mollie_oauth_states/);
 assert.match(schema,/refresh_secret_id uuid NOT NULL/);
 assert.match(schema,/receipt_issuance_verified boolean NOT NULL DEFAULT false/);
});
